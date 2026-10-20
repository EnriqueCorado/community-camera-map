// Unit tests for nationwide view loading (no browser).
import { test, expect } from "@playwright/test";
import { applyFields, arcgisQueryUrl, chooseSource, covers, exceededLimit, levelUrl, within, wrapLon, HOME_BBOX } from "../../frontend/src/view-logic";
import type { ViewSpec } from "../../frontend/src/api/client";
import { RAMPS, fmtMetric, metricStops } from "../../frontend/src/colors";

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

test("levels: states, then counties, then tracts as you zoom in", () => {
  const acs = spec({
    url: "https://x.example/FeatureServer/2", min_zoom: 9, max: 1500, geometry: "polygon",
    levels: [{ min_zoom: 0, url: "https://x.example/FeatureServer/0" }, { min_zoom: 5, url: "https://x.example/FeatureServer/1" }],
  });
  const chicago: [number, number, number, number] = [-88, 41.7, -87.5, 42];
  expect(levelUrl(acs, 3)).toBe("https://x.example/FeatureServer/0");
  expect(levelUrl(acs, 6.5)).toBe("https://x.example/FeatureServer/1");
  expect(levelUrl(acs, 11)).toBe("https://x.example/FeatureServer/2");
  expect(levelUrl(spec({ min_zoom: 8 }), 5)).toBeNull();
  expect(chooseSource(acs, true, chicago, 4)).toBe("query"); // zoomed out still shows the whole US
  const u = new URL(arcgisQueryUrl(acs, chicago, 6, 1000));
  expect(u.pathname).toBe("/FeatureServer/1/query");
  expect(u.searchParams.get("resultOffset")).toBe("1000");
  expect(u.searchParams.get("resultRecordCount")).toBe("4000"); // every county fits
  expect(new URL(arcgisQueryUrl(acs, chicago, 10)).searchParams.has("resultOffset")).toBe(false);
});

test("exceededLimit reads both f=json and f=geojson paging flags", () => {
  expect(exceededLimit({ exceededTransferLimit: true })).toBe(true);
  expect(exceededLimit({ properties: { exceededTransferLimit: true } })).toBe(true);
  expect(exceededLimit({ features: [] })).toBe(false);
  expect(exceededLimit(null)).toBe(false);
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

import { PRESETS, activePreset, applyPreset } from "../../frontend/src/presets";
test("quick views: apply only known layers; recognize the active one", () => {
  const known = ["voting", "flood", "river-gauges", "rain-radar"];
  const flood = PRESETS.find((p) => p.id === "flood")!;
  expect(applyPreset(flood, known)).toEqual({ flood: true, "river-gauges": true, "rain-radar": true });
  expect(activePreset({ flood: true, "river-gauges": true, "rain-radar": true }, known)).toBe("flood");
  expect(activePreset({ flood: true }, known)).toBeNull();
  expect(activePreset({}, known)).toBeNull();
  expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
});

test("census posts: ratio and sum compute pct and drop their inputs", () => {
  const fc = (props: Record<string, unknown>, post: string) =>
    applyFields({ features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: props }] },
      spec({ fields: Object.fromEntries(Object.keys(props).map((k) => [k, k])), post })).features[0]!.properties;
  expect(fc({ NAME: "T", _num: 25, _den: 200 }, "ratio")).toEqual({ NAME: "T", pct: 12.5 });
  expect(fc({ _num: 5, _den: 0 }, "ratio")).toEqual({ pct: null }); // empty tract: no divide by zero
  expect(fc({ _num: null, _den: 100 }, "ratio")).toEqual({ pct: null });
  expect(fc({ _a: 3.2, _b: 1.15 }, "sum")).toEqual({ pct: 4.4 });
  expect(fc({ _a: 3, _b: null }, "sum")).toEqual({ pct: null });
});

test("metric legends: breaks paired with ramp colors, values formatted by unit", () => {
  const m = { field: "x", fmt: "usd" as const, breaks: [600, 800, 1100], ramp: "blue" };
  const stops = metricStops(m);
  expect(stops.map(([v]) => v)).toEqual([600, 800, 1100]);
  expect(stops[0]![1]).toBe(RAMPS.blue![0]);
  expect(metricStops({ ...m, ramp: "nope" })[0]![1]).toBe(RAMPS.purple![0]); // unknown ramp: default
  expect(fmtMetric(125000, "usd", "en-US", true)).toBe("$125k");
  expect(fmtMetric(950, "usd", "en-US", true)).toBe("$950");
  expect(fmtMetric(12.34, "pct", "en-US")).toBe("12.3%");
  expect(fmtMetric(1978.4, "year", "en-US")).toBe("1978");
});
