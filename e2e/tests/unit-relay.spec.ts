// Unit tests for the flights relay (relay/): transform + handler (no browser).
// Mirrors backend/tests/test_live_layers.py flight tests: the two must agree.
import { test, expect } from "@playwright/test";
import { adsbFlights } from "../../relay/src/flights";
import { createRelay, UPSTREAMS, SITE_ORIGIN } from "../../relay/src/relay";

test("keeps flight data, drops owner/registration, excludes opted-out aircraft", () => {
  const base = { lat: 37.6, lon: -121.0, alt_baro: 3000 };
  const fc = adsbFlights({
    now: 1792070818.002,
    aircraft: [
      { ...base, flight: "N669TW  ", r: "N669TW", ownOp: "SOME OWNER LLC", desc: "CESSNA 172", gs: 120.3, track: 248.55 },
      { ...base, flight: "N304KC", dbFlags: 8 }, // LADD
      { ...base, flight: "PRIV1", dbFlags: 4 }, // PIA
      { ...base, flight: "RCH123", dbFlags: 1 }, // military: broadcast publicly, kept
      { flight: "SWA123", alt_baro: "ground", gs: 5, lat: 37.62, lon: -120.95 },
      { flight: "NOPOS", alt_baro: 1000 },
      "junk",
    ],
  });
  expect(fc.generated_at).toBe(1792070818.002);
  expect(fc.features.map((f) => f.properties.callsign)).toEqual(["N669TW", "RCH123", "SWA123"]);
  expect(fc.features[0]!.properties).toEqual({
    callsign: "N669TW", type: "CESSNA 172", alt_ft: 3000, on_ground: false, speed_kt: 120, track: 249,
  });
  expect(JSON.stringify(fc)).not.toMatch(/OWNER|ownOp|"r"/);
  expect(fc.features[2]!.properties).toMatchObject({ on_ground: true, alt_ft: 0 });
});

test("missing values stay missing; garbage input is safe", () => {
  const p = adsbFlights({ aircraft: [{ lat: 37.6, lon: -121 }] }).features[0]!.properties;
  expect(p).toMatchObject({ alt_ft: null, speed_kt: null, track: null });
  expect(adsbFlights(null)).toEqual({ type: "FeatureCollection", features: [] });
  expect(adsbFlights({ aircraft: [{ lat: 999, lon: 0 }] }).features).toEqual([]);
});

test("handles the `ac` + millisecond format of adsb.lol", () => {
  const fc = adsbFlights({ now: 1792070818002, ac: [
    { flight: "UAL366", lat: 37.6, lon: -121, alt_baro: 30000, gs: 450, track: 90 },
    { flight: "N304KC", lat: 37.6, lon: -121, dbFlags: 8 },
  ] });
  expect(fc.generated_at).toBeCloseTo(1792070818.002, 3);
  expect(fc.features.map((f) => f.properties.callsign)).toEqual(["UAL366"]);
});

// --- relay handler (stubbed upstream, fake clock) ---

function stub(responses: Record<string, () => Response>) {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const u = String(input);
    calls.push(new URL(u).host);
    const r = responses[new URL(u).host];
    if (!r) throw new Error("network");
    return r();
  }) as typeof fetch;
  return { f, calls };
}
const ok = () => new Response(JSON.stringify({ now: 1, aircraft: [{ flight: "UAL1", lat: 37.6, lon: -121, dbFlags: 0 }, { flight: "LADD", lat: 37.6, lon: -121, dbFlags: 8 }] }));
const req = (path = "/api/flights", method = "GET") => new Request(`https://relay.example${path}`, { method });

test("relay: filtered data, CORS for the site only, CDN cache headers", async () => {
  const { f } = stub({ "opendata.adsb.fi": ok });
  const r = await createRelay(f)(req());
  expect(r.status).toBe(200);
  expect(r.headers.get("access-control-allow-origin")).toBe(SITE_ORIGIN);
  expect(r.headers.get("cache-control")).toContain("s-maxage=10");
  const body = await r.json();
  expect(body.features.map((x: { properties: { callsign: string } }) => x.properties.callsign)).toEqual(["UAL1"]);
});

test("relay: falls back to the next provider; reuses results for 10 s", async () => {
  let t = 1_000_000;
  const { f, calls } = stub({ "opendata.adsb.fi": () => new Response("no", { status: 403 }), "api.adsb.lol": ok });
  const relay = createRelay(f, () => t);
  expect((await relay(req())).status).toBe(200);
  expect(calls).toEqual(["opendata.adsb.fi", "api.adsb.lol"]);
  t += 9_000;
  await Promise.all([relay(req()), relay(req())]);
  expect(calls.length).toBe(2); // memo hit, no upstream
  t += 2_000;
  await Promise.all([relay(req()), relay(req()), relay(req())]);
  expect(calls.length).toBe(4); // one shared refresh (fi 403 -> lol), not three
  expect(calls[0]).toBe(new URL(UPSTREAMS[0]!).host);
});

test("relay: on failure serves stale data, backs off, then 502 when too old", async () => {
  let t = 1_000_000;
  let up = true;
  const { f, calls } = stub({ "opendata.adsb.fi": () => (up ? ok() : new Response("x", { status: 500 })), "api.adsb.lol": () => new Response("x", { status: 500 }) });
  const relay = createRelay(f, () => t);
  await relay(req());
  up = false;
  t += 11_000;
  expect((await relay(req())).status).toBe(200); // stale, after one failed refresh
  const n = calls.length;
  t += 5_000;
  expect((await relay(req())).status).toBe(200);
  expect(calls.length).toBe(n); // backing off: no upstream calls
  t += 6 * 60_000;
  const r = await relay(req());
  expect(r.status).toBe(502);
  expect(r.headers.get("cache-control")).toBe("no-store");
});

test("relay: query strings and non-GET are refused without touching upstream", async () => {
  const { f, calls } = stub({ "opendata.adsb.fi": ok });
  const relay = createRelay(f);
  expect((await relay(req("/api/flights?bust=1"))).status).toBe(404);
  for (const path of ["/api/flights/", "/api/flights.ts", "/api/flights%2F", "/"]) expect((await relay(req(path))).status).toBe(404);
  expect((await relay(req("/api/flights", "POST"))).status).toBe(404);
  expect(calls).toEqual([]);
});

test("relay: a 429 skips only that provider, until its Retry-After passes", async () => {
  let t = 1_000_000;
  const { f, calls } = stub({
    "opendata.adsb.fi": () => new Response("slow down", { status: 429, headers: { "Retry-After": "120" } }),
    "api.adsb.lol": ok,
  });
  const relay = createRelay(f, () => t);
  expect((await relay(req())).status).toBe(200);
  expect(calls).toEqual(["opendata.adsb.fi", "api.adsb.lol"]);
  t += 15_000;
  expect((await relay(req())).status).toBe(200);
  expect(calls.slice(2)).toEqual(["api.adsb.lol"]); // fi skipped, lol still used: data stays fresh
  t += 120_000;
  await relay(req());
  expect(calls.slice(3)).toEqual(["opendata.adsb.fi", "api.adsb.lol"]); // fi tried again
});

test("relay: network errors and bad JSON fall through; cold start with nothing -> 502", async () => {
  const { f, calls } = stub({ "api.adsb.lol": () => new Response("<html>oops</html>") }); // fi: network error
  const r = await createRelay(f)(req());
  expect(calls).toEqual(["opendata.adsb.fi", "api.adsb.lol"]);
  expect(r.status).toBe(502);
  expect(r.headers.get("access-control-allow-origin")).toBe(SITE_ORIGIN);
});

test("relay: an oversized upstream body is rejected, then the next provider is used", async () => {
  const big = () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 5; i++) c.enqueue(new Uint8Array(1024 * 1024)); c.close(); } }));
  const { f, calls } = stub({ "opendata.adsb.fi": big, "api.adsb.lol": ok });
  const r = await createRelay(f)(req());
  expect(calls).toEqual(["opendata.adsb.fi", "api.adsb.lol"]);
  expect(r.status).toBe(200);
});
