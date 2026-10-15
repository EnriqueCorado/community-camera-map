// Unit tests for live-layer helpers (no browser).
import { test, expect } from "@playwright/test";
import { deadReckon, gibsSatelliteUrl, radarFrames } from "../../frontend/src/live";

test.describe("radarFrames", () => {
  const ok = (past: unknown[]) => ({ host: "https://tilecache.rainviewer.com", radar: { past } });

  test("keeps the newest frames, oldest first, as tile templates", () => {
    const past = Array.from({ length: 13 }, (_, k) => ({ time: 1000 + k * 600, path: `/v2/radar/abc${k}` }));
    const frames = radarFrames(ok(past), 7);
    expect(frames.map((f) => f.time)).toEqual(past.slice(-7).map((p) => p.time));
    expect(frames.at(-1)!.tiles).toBe("https://tilecache.rainviewer.com/v2/radar/abc12/256/{z}/{x}/{y}/2/1_1.png");
  });

  test("refuses other hosts and odd paths", () => {
    expect(radarFrames({ host: "https://evil.example", radar: { past: [{ time: 1, path: "/v2/radar/a" }] } })).toEqual([]);
    expect(radarFrames(ok([{ time: 1, path: "/v2/radar/../../x" }, { time: 2, path: "//evil.example/a" }]))).toEqual([]);
    expect(radarFrames(null)).toEqual([]);
    expect(radarFrames({ host: "https://tilecache.rainviewer.com" })).toEqual([]);
  });
});

test("gibsSatelliteUrl uses the previous UTC day", () => {
  expect(gibsSatelliteUrl(new Date("2026-10-14T00:30:00Z"))).toContain("/default/2026-10-13/");
});

test.describe("deadReckon", () => {
  const plane = (props: Record<string, unknown>) => ({
    type: "FeatureCollection" as const,
    generated_at: 1000,
    features: [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [-121, 37] }, properties: props }],
  });
  const pos = (fc: ReturnType<typeof plane>) => fc.features[0]!.geometry.coordinates as number[];

  test("moves an airborne plane along its heading at its speed", () => {
    // 360 kt due north for 10 s = 1 nm = 1/60 degree of latitude.
    const [lon, lat] = pos(deadReckon(plane({ speed_kt: 360, track: 0 }), 1010) as ReturnType<typeof plane>);
    expect(lon).toBeCloseTo(-121, 6);
    expect(lat).toBeCloseTo(37 + 1 / 60, 6);
  });

  test("east is +longitude, scaled by latitude", () => {
    const [lon, lat] = pos(deadReckon(plane({ speed_kt: 360, track: 90 }), 1010) as ReturnType<typeof plane>);
    expect(lat).toBeCloseTo(37, 6);
    expect(lon).toBeCloseTo(-121 + 1 / 60 / Math.cos((37 * Math.PI) / 180), 6);
  });

  test("caps extrapolation and never moves stale or grounded data", () => {
    const capped = pos(deadReckon(plane({ speed_kt: 360, track: 0 }), 1100, 60, 120) as ReturnType<typeof plane>);
    expect(capped[1]).toBeCloseTo(37 + 6 / 60, 6); // 60 s cap, not 100 s
    expect(pos(deadReckon(plane({ speed_kt: 360, track: 0 }), 2000) as ReturnType<typeof plane>)).toEqual([-121, 37]);
    expect(pos(deadReckon(plane({ speed_kt: 0, track: 0, on_ground: true }), 1010) as ReturnType<typeof plane>)).toEqual([-121, 37]);
    expect(pos(deadReckon(plane({ speed_kt: null, track: 0 }), 1010) as ReturnType<typeof plane>)).toEqual([-121, 37]);
    const noStamp = { ...plane({ speed_kt: 360, track: 0 }), generated_at: undefined };
    expect(deadReckon(noStamp, 1010)).toBe(noStamp);
  });
});

import { ago } from "../../frontend/src/freshness";
test("freshness: relative times in both languages", () => {
  const now = 1_800_000_000_000;
  expect(ago(now / 1000 - 20, "en-US", now)).toBe("now");
  expect(ago(now / 1000 - 5 * 60, "en-US", now)).toMatch(/^5 min\.? ago$/); // ICU wording varies
  expect(ago(now / 1000 - 3 * 3600, "en-US", now)).toMatch(/^3 hr\.? ago$/);
  expect(ago(now / 1000 - 86_400, "en-US", now)).toBe("yesterday");
  expect(ago(now / 1000 - 5 * 60, "es-US", now)).toMatch(/hace 5 min/);
  expect(ago(now / 1000 + 30, "en-US", now)).toBe("now"); // clock skew: never "in 30 s"
});

import { flightCells, mergeFlights } from "../../frontend/src/live";
test("flight cells: grid corners in view, US only, capped", () => {
  expect(flightCells([-122, 37, -119.5, 38.5])).toEqual(["36_-123", "36_-120"]); // Modesto area
  expect(flightCells([-88.5, 41.5, -87, 42.2])).toEqual(["39_-90", "42_-90"]); // Chicago
  expect(flightCells([-151, 60.5, -148, 62])).toEqual(["60_-153", "60_-150"]); // Anchorage
  expect(flightCells([-123, 36, -114, 42], 6)).toHaveLength(6);
  expect(flightCells([-123, 36, -114, 42], 5)).toEqual([]);
  expect(flightCells([-130, 20, -60, 50])).toEqual([]); // whole US: too many cells
  expect(flightCells([2, 48, 3, 49])).toEqual([]); // Paris: outside the relay grid
});
test("mergeFlights drops duplicates from overlapping cells", () => {
  const pt = (cs: string, x: number) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [x, 40] }, properties: { callsign: cs } });
  const m = mergeFlights([
    { type: "FeatureCollection", features: [pt("UAL1", -88), pt("", -87.5)] },
    { type: "FeatureCollection", features: [pt("UAL1", -88.01), pt("", -87.5), pt("DAL2", -86)] },
  ]);
  expect(m.features.map((f) => f.properties!.callsign)).toEqual(["UAL1", "", "DAL2"]);
});

import { alprCells, mergeTiles } from "../../frontend/src/alpr-tiles";
test("alpr tiles: cells in view that exist, nearest the center first", () => {
  const ix = { cell_deg: 5, total: 3, cells: { "35_-125": 10, "35_-120": 5, "40_-90": 7 } };
  expect(alprCells(ix, [-122, 36, -119, 38])).toEqual(["35_-125", "35_-120"]); // nearest center first
  expect(alprCells(ix, [-88, 41, -87, 42])).toEqual(["40_-90"]);
  expect(alprCells(ix, [2, 48, 3, 49])).toEqual([]); // nothing there
  expect(alprCells(ix, [-130, 30, -80, 45], 1)).toHaveLength(1);
  const pt = (id: number) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [0, 0] }, properties: { id } });
  expect(mergeTiles([{ type: "FeatureCollection", features: [pt(1)] }, { type: "FeatureCollection", features: [pt(2)] }]).features).toHaveLength(2);
});
