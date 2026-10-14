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
