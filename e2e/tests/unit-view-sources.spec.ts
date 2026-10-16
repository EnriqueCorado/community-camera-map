// Unit tests for nationwide view loading (no browser).
import { test, expect } from "@playwright/test";
import { applyFields, arcgisQueryUrl, chooseSource, covers, within, wrapLon, HOME_BBOX } from "../../frontend/src/view-logic";
import type { ViewSpec } from "../../frontend/src/api/client";

const spec = (over: Partial<ViewSpec> = {}): ViewSpec => ({
  kind: "arcgis", url: "https://x.example/FeatureServer/0", fields: { NAME: "name", ADDR: "address" },
  geometry: "point", min_zoom: 8, where: "1=1", max: 500, simplify: false, refresh_s: 1800, ...over,
});

test("query URL: bbox envelope, allowlisted fields, record cap, simplify by zoom", () => {
  const u = new URL(arcgisQueryUrl(spec(), [-88, 41.7, -87.5, 42], 10));
  expect(u.pathname).toBe("/FeatureServer/0/query");
  expect(u.searchParams.get("geometry")).toBe("-88,41.7,-87.5,42");
  expect(u.searchParams.get("outFields")).toBe("NAME,ADDR");
  expect(u.searchParams.get("resultRecordCount")).toBe("500");
  expect(u.searchParams.get("f")).toBe("geojson");
  expect(u.searchParams.has("maxAllowableOffset")).toBe(false);
  const z5 = Number(new URL(arcgisQueryUrl(spec({ simplify: true }), [-88, 41, -87, 42], 5)).searchParams.get("maxAllowableOffset"));
  const z12 = Number(new URL(arcgisQueryUrl(spec({ simplify: true }), [-88, 41, -87, 42], 12)).searchParams.get("maxAllowableOffset"));
  expect(z5).toBeGreaterThan(z12 * 100);
});

test("applyFields keeps only allowlisted fields, renamed; drops geometry-less", () => {
  const fc = applyFields({ features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [1, 2] }, properties: { NAME: "A", ADDR: "1 Main", SECRET: "x" } },
    { type: "Feature", geometry: null, properties: { NAME: "B" } },
  ] }, spec());
  expect(fc.features).toHaveLength(1);
  expect(fc.features[0]!.properties).toEqual({ name: "A", address: "1 Main" });
});

test("applyFields rejects ArcGIS error bodies (HTTP 200 with error)", () => {
  expect(() => applyFields({ error: { code: 400, message: "bad" } }, spec())).toThrow();
  expect(() => applyFields(null, spec())).toThrow();
});

test("post-processors: EPA link, National Archives link, NBI quotes", () => {
  const pt = { type: "Point", coordinates: [0, 0] };
  const epa = applyFields({ features: [{ geometry: pt, properties: { P: '<a href="https://cumulis.epa.gov/supercpad/cursites/csitinfo.cfm?id=0901234">x</a>' } }] },
    spec({ fields: { P: "_profile" }, post: "epa" })).features[0]!.properties!;
  expect(epa).toEqual({ page: "https://cumulis.epa.gov/supercpad/cursites/csitinfo.cfm?id=0901234" });
  const evil = applyFields({ features: [{ geometry: pt, properties: { U: "https://evil.example/id/1", D: "1990-" } }] },
    spec({ fields: { U: "page", D: "listed" }, post: "nrhp" })).features[0]!.properties!;
  expect(evil).toEqual({ page: "", listed: "1990" });
  const good = applyFields({ features: [{ geometry: pt, properties: { U: "https://catalog.archives.gov/id/12345", D: "1990" } }] },
    spec({ fields: { U: "page", D: "listed" }, post: "nrhp" })).features[0]!.properties!;
  expect(good.page).toBe("https://catalog.archives.gov/id/12345");
  const nbi = applyFields({ features: [{ geometry: pt, properties: { R: "'SR 99'", C: "'STANISLAUS RIVER'" } }] },
    spec({ fields: { R: "road", C: "crosses" }, post: "nbi" })).features[0]!.properties!;
  expect(nbi).toMatchObject({ road: "SR 99", crosses: "STANISLAUS RIVER" });
});

test("coverage + home-county checks", () => {
  expect(covers("usa", [-87.6, 41.9])).toBe(true); // Chicago
  expect(covers("usa", [-157.8, 21.3])).toBe(true); // Honolulu
  expect(covers("usa", [2.35, 48.85])).toBe(false); // Paris
  expect(covers("california", [-87.6, 41.9])).toBe(false);
  expect(covers("stanislaus", [-120.99, 37.64])).toBe(true);
  expect(covers("world", [2.35, 48.85])).toBe(true);
  expect(covers(undefined, [0, 0])).toBe(true);
  expect(within([-121.2, 37.5, -120.8, 37.8], HOME_BBOX)).toBe(true);
  expect(within([-122, 37.5, -120.8, 37.8], HOME_BBOX)).toBe(false);
});

test("chooseSource: baked copy, national query, or nothing", () => {
  const inHome: [number, number, number, number] = [-121.1, 37.5, -120.8, 37.8];
  const ripon: [number, number, number, number] = [-121.2, 37.7, -121.0, 37.8]; // inside the box, outside the county
  const chicago: [number, number, number, number] = [-88, 41.7, -87.5, 42];
  const county = spec({ min_zoom: 8 }); // county-filtered bake (e.g. schools)
  const clipped = spec({ min_zoom: 8, home_complete: true }); // bbox-clipped bake (e.g. flood)
  expect(chooseSource(county, true, chicago, 5)).toBe("home"); // zoomed out: never query a continent
  expect(chooseSource(county, false, chicago, 5)).toBe("empty");
  expect(chooseSource(county, true, chicago, 10)).toBe("query");
  expect(chooseSource(county, true, ripon, 12)).toBe("query"); // the county bake has no Ripon data
  expect(chooseSource(clipped, true, inHome, 12)).toBe("home");
  expect(chooseSource(clipped, true, ripon, 12)).toBe("home");
  expect(chooseSource(clipped, false, inHome, 12)).toBe("query");
  expect(chooseSource(clipped, true, chicago, 12)).toBe("query");
});

test("wrapLon folds world copies back into [-180, 180]", () => {
  expect(wrapLon(-120)).toBe(-120);
  expect(wrapLon(240)).toBe(-120);
  expect(wrapLon(-480)).toBe(-120);
  expect(wrapLon(180)).toBe(-180);
});

test("post-processors: AirNow AQI band + drop inactive; gauge links", () => {
  const pt = { type: "Point", coordinates: [0, 0] };
  const air = applyFields({ features: [
    { geometry: pt, properties: { A: 72, S: "Active" } },
    { geometry: pt, properties: { A: 30, S: "Inactive" } },
  ] }, spec({ fields: { A: "aqi", S: "_status" }, post: "airnow" }));
  expect(air.features.map((f) => f.properties)).toEqual([{ aqi: 72, category: "moderate", label: "72" }]);
  const g = applyFields({ features: [{ geometry: pt, properties: { U: "https://evil.example/x" } }] },
    spec({ fields: { U: "page" }, post: "gauge" }));
  expect(g.features[0]!.properties).toEqual({ page: "" });
});
