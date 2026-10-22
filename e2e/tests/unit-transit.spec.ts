// Unit tests for the transit-vehicles layer: the GTFS-realtime decoder, the
// MBTA JSON parser, the agency registry and its polling/back-off rules.
// Fixtures are hand-encoded protobuf (tiny encoder below), no network.
import { test, expect } from "@playwright/test";
import { decodeVehicles, MAX_FEED_BYTES } from "../../frontend/src/gtfs-rt";
import {
  agenciesInView,
  backoffUntil,
  FROZEN_S,
  MAX_VEHICLES,
  parseMbtaVehicles,
  retryAfterSeconds,
  shouldPoll,
  socrataBlobUrl,
  STALE_S,
  TRANSIT_AGENCIES,
  TRANSIT_NEEDS_RELAY,
  TRANSIT_SITE_HOSTS,
  transitFeatures,
  type TransitAgency,
} from "../../frontend/src/transit-agencies";

// --- a minimal protobuf encoder for fixtures ---
const enc = new TextEncoder();
const varint = (n: number): number[] => {
  const out: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
};
const tag = (f: number, w: number) => varint(f * 8 + w);
const msg = (f: number, body: number[]) => [...tag(f, 2), ...varint(body.length), ...body];
const str = (f: number, s: string) => msg(f, [...enc.encode(s)]);
const u = (f: number, n: number) => [...tag(f, 0), ...varint(n)];
const flt = (f: number, x: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, x, true);
  return [...tag(f, 5), ...b];
};
const dbl = (f: number, x: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, x, true);
  return [...tag(f, 1), ...b];
};

interface V {
  id?: string; label?: string; plate?: string; route?: string; trip?: string;
  lat?: number; lon?: number; bearing?: number; speed?: number; ts?: number; status?: number; stop?: string;
}
const vehiclePos = (v: V) => [
  ...msg(1, [...(v.trip ? str(1, v.trip) : []), ...(v.route ? str(5, v.route) : []), ...u(6, 1)]),
  ...msg(2, [
    ...(v.lat != null ? flt(1, v.lat) : []),
    ...(v.lon != null ? flt(2, v.lon) : []),
    ...(v.bearing != null ? flt(3, v.bearing) : []),
    ...dbl(4, 12345.5), // odometer (double): skipped
    ...(v.speed != null ? flt(5, v.speed) : []),
  ]),
  ...(v.status != null ? u(4, v.status) : []),
  ...(v.ts != null ? u(5, v.ts) : []),
  ...u(9, 3), // occupancy status: never read
  ...(v.stop ? str(7, v.stop) : []),
  ...msg(8, [...(v.id ? str(1, v.id) : []), ...(v.label ? str(2, v.label) : []), ...(v.plate ? str(3, v.plate) : [])]),
];
const entity = (id: string, body: number[]) => msg(2, [...str(1, id), ...body]);
const header = (ts: number) => msg(1, [...str(1, "2.0"), ...u(2, 0), ...u(3, ts)]);
const feed = (...parts: number[][]) => new Uint8Array(parts.flat());

const T = 1_792_600_000;
const agency = (over: Partial<TransitAgency> = {}): TransitAgency => ({
  id: "test", name: "Test Transit", bbox: [-1, -1, 1, 1], url: "https://example.org/vp.pb",
  format: "gtfs-rt", mode: "bus", site: "https://example.org/", attribution: "Test", minIntervalS: 20, ...over,
});

test("decodes vehicle positions and skips everything else", () => {
  const buf = feed(
    header(T),
    entity("e1", msg(4, vehiclePos({ id: "1401", label: "1401", plate: "ABC123", route: "10", trip: "t9", lat: 44.97, lon: -93.27, bearing: 113, speed: 5, ts: T - 5, status: 1, stop: "19337" }))),
    // a trip update (field 3) only: not a vehicle
    entity("e2", msg(3, [...msg(1, str(5, "10"))])),
    // deleted entity
    entity("e3", [...u(2, 1), ...msg(4, vehiclePos({ id: "9", lat: 1, lon: 1 }))]),
    // no vehicle id: falls back to the entity id
    entity("e4", msg(4, vehiclePos({ lat: 44.9, lon: -93.2 }))),
    u(15, 7), // unknown top-level field
  );
  const f = decodeVehicles(buf);
  expect(f.timestamp).toBe(T);
  expect(f.vehicles).toHaveLength(2);
  const [a, b] = f.vehicles;
  expect(a).toEqual({ id: "1401", label: "1401", route: "10", lat: a!.lat, lon: a!.lon, bearing: 113, speed: 5, timestamp: T - 5 });
  expect(a!.lat).toBeCloseTo(44.97, 4);
  expect(a!.lon).toBeCloseTo(-93.27, 4);
  expect(JSON.stringify(a)).not.toContain("ABC123"); // license plate never read
  expect(b!.id).toBe("e4");
});

test("an empty feed (no service tonight) decodes to no vehicles", () => {
  expect(decodeVehicles(feed(header(T))).vehicles).toEqual([]);
  expect(decodeVehicles(new Uint8Array()).vehicles).toEqual([]);
});

test("malformed or oversized feeds throw (the last good data is kept)", () => {
  const good = feed(header(T), entity("e1", msg(4, vehiclePos({ id: "1", lat: 1, lon: 1 }))));
  expect(() => decodeVehicles(good.subarray(0, good.length - 3))).toThrow();
  expect(() => decodeVehicles(new Uint8Array([0x0b]))).toThrow(); // wire type 3 (groups)
  expect(() => decodeVehicles(new TextEncoder().encode("<html>Service unavailable</html>"))).toThrow();
  expect(() => decodeVehicles(new Uint8Array(MAX_FEED_BYTES + 1))).toThrow(/too large/);
});

test("features: positions only, stale and bogus points dropped, units converted", () => {
  const f = decodeVehicles(feed(
    header(T),
    entity("a", msg(4, vehiclePos({ id: "1", label: "201", route: "801", lat: 30.27, lon: -97.74, bearing: 359.6, speed: 10, ts: T }))),
    entity("b", msg(4, vehiclePos({ id: "2", lat: 0, lon: 0, ts: T }))), // 0,0
    entity("c", msg(4, vehiclePos({ id: "3", route: "1" }))), // no position
    entity("d", msg(4, vehiclePos({ id: "4", lat: 30.3, lon: -97.7, ts: T - STALE_S - 60 }))), // parked for hours
    entity("e", msg(4, vehiclePos({ id: "5", lat: 30.3, lon: -97.7, bearing: 400, speed: -1 }))), // nonsense bearing/speed
  ));
  const out = transitFeatures(f, agency(), T);
  expect(out.map((x) => x.properties!.vehicle)).toEqual(["201", "5"]);
  expect(out[0]!.properties).toMatchObject({ agency_id: "test", mode: "bus", route: "801", track: 360, speed_mph: 22, updated: T * 1000, label: "801" });
  expect(out[1]!.properties).toMatchObject({ track: null, speed_mph: null, updated: null, label: "" });
  const [lon, lat] = out[0]!.geometry.coordinates;
  expect(lon).toBeCloseTo(-97.74, 4);
  expect(lat).toBeCloseTo(30.27, 4);
});

test("a frozen feed (same old snapshot for half an hour) shows nothing", () => {
  const f = decodeVehicles(feed(header(T), entity("a", msg(4, vehiclePos({ id: "1", lat: 1, lon: 1, ts: T })))));
  expect(transitFeatures(f, agency(), T + 60)).toHaveLength(1);
  expect(transitFeatures(f, agency(), T + FROZEN_S + 1)).toHaveLength(0);
});

test("a runaway feed is capped", () => {
  const v = { id: "1", label: "", route: "", lat: 1, lon: 1, bearing: null, speed: null, timestamp: T };
  const out = transitFeatures({ timestamp: T, vehicles: Array.from({ length: MAX_VEHICLES + 50 }, () => v) }, agency(), T);
  expect(out).toHaveLength(MAX_VEHICLES);
});

test("internal route ids are hidden; trains are labeled by train number", () => {
  const f = decodeVehicles(feed(header(T), entity("a", msg(4, vehiclePos({ id: "x", label: "409", route: "19482", lat: 40.9, lon: -73.1, ts: T })))));
  const bus = transitFeatures(f, agency({ routeIds: false }), T)[0]!.properties!;
  expect(bus.route).toBe("");
  expect(bus.label).toBe("");
  const train = transitFeatures(f, agency({ routeIds: false, mode: "rail" }), T)[0]!.properties!;
  expect(train).toMatchObject({ mode: "rail", route: "", vehicle: "409", label: "409" });
});

test("MBTA V3 JSON: route from the relationship, rail vs bus by route", () => {
  const json = {
    data: [
      { id: "R-1", attributes: { latitude: 42.35, longitude: -71.06, bearing: 90, speed: 8, label: "1812", updated_at: "2026-10-21T21:15:41-04:00" }, relationships: { route: { data: { id: "Red" } } } },
      { id: "y2105", attributes: { latitude: 42.357, longitude: -71.148, bearing: 270, label: "2105", updated_at: "2026-10-21T21:15:30-04:00" }, relationships: { route: { data: { id: "64" } } } },
      { id: "1634", attributes: { latitude: 42.1, longitude: -71.2, label: "1634", updated_at: "2026-10-21T21:15:00-04:00" }, relationships: { route: { data: { id: "CR-Providence" } } } },
      { id: "bad", attributes: { latitude: "x", longitude: null }, relationships: {} },
    ],
  };
  const out = transitFeatures(parseMbtaVehicles(json), agency({ format: "mbta-v3", name: "MBTA" }), Date.parse("2026-10-21T21:16:00-04:00") / 1000);
  expect(out.map((x) => [x.properties!.route, x.properties!.mode])).toEqual([["Red", "rail"], ["64", "bus"], ["Providence", "rail"]]);
  expect(out[0]!.properties).toMatchObject({ vehicle: "1812", track: 90, speed_mph: 18, updated: Date.parse("2026-10-21T21:15:41-04:00") });
  expect(() => parseMbtaVehicles({ errors: [{ status: "429" }] })).toThrow();
});

test("registry: only the agencies in view, nearest first, capped", () => {
  const ids = (v: [number, number, number, number], max?: number) => agenciesInView(v, TRANSIT_AGENCIES, max).map((a) => a.id);
  expect(ids([-71.12, 42.33, -71.0, 42.39])).toEqual(["mbta"]); // downtown Boston
  expect(ids([-97.8, 30.22, -97.68, 30.32])).toEqual(["capmetro"]); // Austin
  expect(ids([-73.6, 40.7, -73.45, 40.8])).toEqual(["mta-lirr", "mta-mnr"]); // Hicksville: LIRR first (MNR's box reaches Queens)
  expect(ids([-118.17, 34.02, -118.1, 34.07])).toEqual(["spirit-bus", "montebello"]); // Monterey Park
  expect(ids([-121.05, 37.6, -120.9, 37.7])).toEqual([]); // Modesto: StanRTA has its own layer
  expect(ids([-125, 24, -66, 50], 3)).toHaveLength(3);
  // fallback list param + empty
  expect(agenciesInView([0, 0, 1, 1], [agency({ bbox: [2, 2, 3, 3] })])).toEqual([]);
});

test("registry entries are keyless https feeds with sane boxes and polling", () => {
  const seen = new Set<string>();
  for (const a of TRANSIT_AGENCIES) {
    expect(seen.has(a.id), a.id).toBe(false);
    seen.add(a.id);
    const [w, s, e, n] = a.bbox;
    expect(w < e && s < n && w >= -180 && e <= -60 && s >= 18 && n <= 72, a.id).toBe(true); // US
    expect((e - w) * (n - s), `${a.id} box too big`).toBeLessThan(4);
    expect(new URL(a.url).protocol, a.id).toBe("https:"); // no mixed content on GitHub Pages
    expect(a.url, a.id).not.toMatch(/key|token|secret/i); // keyless only
    expect(new URL(a.site).protocol, a.id).toBe("https:");
    expect(TRANSIT_SITE_HOSTS).toContain(new URL(a.site).hostname);
    expect(a.minIntervalS, a.id).toBeGreaterThanOrEqual(15);
    expect(a.attribution.length, a.id).toBeGreaterThan(5);
  }
  expect(TRANSIT_AGENCIES.find((a) => a.id === "mbta")!.minIntervalS).toBeGreaterThanOrEqual(30); // 20 req/min keyless
  // nothing is both polled and listed as needing a relay
  const polled = new Set(TRANSIT_AGENCIES.map((a) => a.url));
  for (const r of TRANSIT_NEEDS_RELAY) expect(polled.has(r.url), r.name).toBe(false);
});

test("polling: per-agency minimum interval and back-off", () => {
  const a = agency({ minIntervalS: 30 });
  const now = 1_000_000;
  expect(shouldPoll(a, undefined, now)).toBe(true);
  const s = { at: now - 10_000, until: 0, failures: 0, data: null, dataAt: 0 };
  expect(shouldPoll(a, s, now)).toBe(false); // polled 10 s ago
  expect(shouldPoll(a, { ...s, at: now - 30_000 }, now)).toBe(true);
  expect(shouldPoll(a, { ...s, at: now - 29_500 }, now)).toBe(true); // timer jitter
  expect(shouldPoll(a, { ...s, at: now - 60_000, until: now + 1 }, now)).toBe(false); // backing off

  // 429/5xx: 1, 2, 4 … minutes, capped at 15
  expect(backoffUntil(now, 1, 429, null) - now).toBe(60_000);
  expect(backoffUntil(now, 3, 503, null) - now).toBe(240_000);
  expect(backoffUntil(now, 10, 429, null) - now).toBe(15 * 60_000);
  // Retry-After wins when longer (capped at an hour)
  expect(backoffUntil(now, 1, 429, 300) - now).toBe(300_000);
  expect(backoffUntil(now, 1, 429, 99_999) - now).toBe(3600_000);
  // other failures (network, CORS, bad data): gentler
  expect(backoffUntil(now, 1, null, null) - now).toBe(30_000);
  expect(backoffUntil(now, 2, 404, null) - now).toBe(60_000);

  expect(retryAfterSeconds("120")).toBe(120);
  expect(retryAfterSeconds(new Date(now + 90_000).toUTCString(), now)).toBe(90);
  expect(retryAfterSeconds(null)).toBeNull();
  expect(retryAfterSeconds("soon")).toBeNull();
});

test("CapMetro: the current file id comes from the dataset metadata", () => {
  const meta = "https://data.texas.gov/api/views/eiei-9rpf.json";
  expect(socrataBlobUrl(meta, { blobId: "b120e2e6-eb50-4e8f-9441-aa45505909a2" })).toBe(
    "https://data.texas.gov/api/views/eiei-9rpf/files/b120e2e6-eb50-4e8f-9441-aa45505909a2",
  );
  expect(() => socrataBlobUrl(meta, { blobId: "../../evil?x=" })).toThrow();
  expect(() => socrataBlobUrl(meta, {})).toThrow();
});
