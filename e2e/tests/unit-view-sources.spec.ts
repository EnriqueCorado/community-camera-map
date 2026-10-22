// Unit tests for nationwide view loading (no browser).
import { test, expect } from "@playwright/test";
import { applyFields, arcgisQueryUrl, chooseSource, covers, exceededLimit, fieldsAt, levelUrl, tractLabel, within, wrapLon, HOME_BBOX, stateName, statesAt, stateViews } from "../../frontend/src/view-logic";
import type { ViewSpec } from "../../frontend/src/api/client";
import { RAMPS, classesColor, fmtMetric, metricStops } from "../../frontend/src/colors";

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
  // tracts: enough for a dense metro (LA ~3,200 at z9); plain layers keep their cap
  expect(new URL(arcgisQueryUrl(acs, chicago, 9.5)).searchParams.get("resultRecordCount")).toBe("5000");
  expect(new URL(arcgisQueryUrl(spec({ max: 1500 }), chicago, 10)).searchParams.get("resultRecordCount")).toBe("1500");
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

// Hazards / environment / water pack cleanups (frontend/src/view-posts-hazards.ts).
const onePost = (props: Record<string, unknown>, fields: Record<string, string>, post: string) =>
  applyFields({ features: [{ geometry: { type: "Point", coordinates: [0, 0] }, properties: props }] }, spec({ fields, post })).features[0]
    ?.properties ?? null;

test("hazard posts: units, dates, https links, CDC percentiles, radon level", () => {
  const echo = onePost(
    { U: "http://echo.epa.gov/detailed-facility-report?fid=1", L: 1234.56, D: Date.UTC(2026, 9, 8), W: 0, R: 10, A: 17.611, P: 49173 },
    { U: "page", L: "releases_lbs", D: "posted_date", W: "wind_kt", R: "radius_mi", A: "area_sqmi", P: "pop_count" },
    "fmt",
  );
  expect(echo).toEqual({
    page: "https://echo.epa.gov/detailed-facility-report?fid=1",
    releases: "1,234.6 lbs",
    posted: "2026-10-08",
    wind: "",
    radius: "10 mi",
    area: "17.6 sq mi",
    pop: "49,173",
  });
  expect(onePost({ T: Date.UTC(2026, 9, 19, 18, 5) }, { T: "issued_utc" }, "fmt")).toEqual({ issued: "2026-10-19 18:05 UTC" });
  expect(onePost({ T: null }, { T: "issued_utc" }, "fmt")).toEqual({ issued: "" });

  const eji = onePost({ A: 0.8266, B: -999, N: "Census Tract 2114; Harris County; Texas" }, { A: "eji_pctl", B: "env_pctl", N: "name" }, "pctl");
  expect(eji).toEqual({ eji_pctl: 82.7, env_pctl: null, name: "Census Tract 2114; Harris County; Texas" });

  expect(onePost({ G: 1 }, { G: "zone" }, "radon")).toEqual({ level: 3 });
  expect(onePost({ G: 3 }, { G: "zone" }, "radon")).toEqual({ level: 1 });
  expect(onePost({ G: 9 }, { G: "zone" }, "radon")).toEqual({ level: null });
});

test("hazard posts: satellite fire times, smoke times, recovery-center hours", () => {
  const viirs = onePost({ T: 1792392480000, D: "N", F: 1.48 }, { T: "acquired", D: "daynight", F: "frp_mw" }, "hotspot");
  expect(viirs).toEqual({ acquired: new Date(1792392480000).toISOString(), daynight: "night", frp_mw: 1.48 });

  // Day 292 of 2026 = Oct 19; "905" pads to 09:05.
  expect(onePost({ Y: 2026292, T: "905" }, { Y: "_yearday", T: "_time" }, "hms")).toEqual({ acquired: "2026-10-19T09:05:00.000Z" });
  expect(onePost({ Y: null, T: null }, { Y: "_yearday", T: "_time" }, "hms")).toEqual({ acquired: "" });
  expect(onePost({ Y: 2026292, T: null }, { Y: "_yearday", T: "_time" }, "hms")).toEqual({ acquired: "" }); // no fake midnight
  expect(onePost({ S: "2026292 1200", E: "garbage" }, { S: "start", E: "end" }, "hms")).toEqual({ start: "2026-10-19 12:00 UTC", end: "" });

  const drc = onePost(
    { MO: "08:00", MC: "16:00", SO: null, SC: "17:00", O: Date.UTC(2026, 6, 1) },
    { MO: "_mon_open", MC: "_mon_close", SO: "_sun_open", SC: "_sun_close", O: "opened_date" },
    "drc",
  )!;
  expect(drc.mon).toBe("08:00-16:00");
  expect(drc.sun).toBe("");
  expect(drc.opened).toBe("2026-07-01");
  expect(Object.keys(drc).some((k) => k.startsWith("_"))).toBe(false);
});

test("levels with their own fields: query and keep the level's allowlist", () => {
  const health = spec({
    url: "https://x.example/FeatureServer/3", min_zoom: 9, geometry: "polygon",
    fields: { TractFIPS: "_geoid", CountyName: "_county", M: "pct" },
    levels: [{ min_zoom: 0, url: "https://x.example/FeatureServer/2", fields: { CountyName: "_county", M: "pct" } }],
  });
  const box: [number, number, number, number] = [-96, 29, -95, 30];
  expect(new URL(arcgisQueryUrl(health, box, 6)).searchParams.get("outFields")).toBe("CountyName,M");
  expect(new URL(arcgisQueryUrl(health, box, 10)).searchParams.get("outFields")).toBe("TractFIPS,CountyName,M");
  expect(fieldsAt(health, 10)).toBe(health.fields);
  // a level without its own allowlist shares the spec's
  expect(fieldsAt(spec({ min_zoom: 9, levels: [{ min_zoom: 0, url: "u" }] }), 3)).toEqual({ NAME: "name", ADDR: "address" });
  const county = { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { CountyName: "Harris", M: 21, TractFIPS: "x" } };
  expect(applyFields({ features: [county] }, health, 6).features[0]!.properties).toEqual({ _county: "Harris", pct: 21 });
  expect(applyFields({ features: [county] }, health).features[0]!.properties).toEqual({ _geoid: "x", _county: "Harris", pct: 21 });
});

test("place and bdc posts: area names from ids; FCC % without 100/20 Mbps", () => {
  expect(tractLabel("48201432401")).toBe("Tract 4324.01");
  expect(tractLabel("06099000100")).toBe("Tract 1");
  expect(tractLabel("482014513014")).toBe("Block group 4, tract 4513.01");
  expect(tractLabel("48201")).toBe("");
  expect(tractLabel(48201432401)).toBe(""); // numbers lose leading zeros: not trusted
  const one = (props: Record<string, unknown>, post: string) =>
    applyFields({ features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: props }] },
      spec({ fields: Object.fromEntries(Object.keys(props).map((k) => [k, k])), post })).features[0]!.properties;
  expect(one({ _geoid: "48201432401", _county: "Harris County", _state: "TX", pct: 3 }, "place"))
    .toEqual({ name: "Tract 4324.01, Harris County, TX", pct: 3 });
  expect(one({ _county: "Fort Bend", _state: "TX" }, "place")).toEqual({ name: "Fort Bend, TX" });
  expect(one({ _geoid: null, _county: null, _state: null }, "place")).toEqual({ name: null });
  expect(one({ _geoid: "48", _state: "Texas", _den: 1027, _served: 1022 }, "bdc")).toEqual({ name: "Texas", pct: 0.5 });
  expect(one({ _den: 0, _served: 0 }, "bdc")).toEqual({ name: null, pct: null }); // no locations: no divide by zero
  expect(one({ _den: 100, _served: null }, "bdc")).toEqual({ name: null, pct: null });
  expect(one({ _den: 40, _served: 0 }, "bdc")).toEqual({ name: null, pct: 100 });
});

test("planning pack post-processors: transit quotes + wheelchair, PAD-US access, trails", () => {
  const pt = { type: "Point", coordinates: [0, 0] };
  const run = (properties: Record<string, unknown>, fields: Record<string, string>, post: string) =>
    applyFields({ features: [{ geometry: pt, properties }] }, spec({ fields, post })).features[0]!.properties!;
  const stop = { S: "Main St", K: '"Bus"', W: "1" };
  const stopFields = { S: "name", K: "kind", W: "wheelchair" };
  expect(run(stop, stopFields, "ntm")).toEqual({ name: "Main St", kind: "Bus", wheelchair: "yes" });
  expect(run({ ...stop, W: "2" }, stopFields, "ntm").wheelchair).toBe("no");
  expect(run({ ...stop, W: "0" }, stopFields, "ntm").wheelchair).toBe("");
  // Routes have no wheelchair field: none is invented.
  expect(run({ K: '"Light Rail"' }, { K: "kind" }, "ntm")).toEqual({ kind: "Light Rail" });
  expect(run({ A: "OA" }, { A: "access" }, "padus").access).toBe("yes");
  expect(run({ A: "RA" }, { A: "access" }, "padus").access).toBe("no");
  expect(run({ A: "XA" }, { A: "access" }, "padus").access).toBe("");
  const trail = run({ H: "Yes", B: "No", M: 1.23456 }, { H: "hike", B: "bike", M: "miles" }, "trails");
  expect(trail).toEqual({ hike: "yes", bike: "no", miles: 1.2 });
  expect(run({ H: null, M: null }, { H: "hike", M: "miles" }, "trails")).toMatchObject({ hike: "", miles: null });
});

test("traffic ramp: every step is visible on a basemap (no near-white first color)", () => {
  const stops = metricStops({ field: "aadt", fmt: "count", breaks: [5000, 20000, 50000, 100000, 200000], ramp: "traffic" });
  expect(stops.map(([, c]) => c)).toEqual(RAMPS.traffic);
  expect(fmtMetric(200000, "count", "en-US")).toBe("200,000");
});

test("metric ramps: short scales spread over the whole ramp (top step darkest)", () => {
  const three = metricStops({ field: "level", fmt: "index", breaks: [1, 2, 3], ramp: "red" });
  expect(three.map(([, c]) => c)).toEqual([RAMPS.red![0], RAMPS.red![2], RAMPS.red![4]]);
  const five = metricStops({ field: "x", fmt: "pct", breaks: [1, 2, 3, 4, 5], ramp: "red" });
  expect(five.map(([, c]) => c)).toEqual(RAMPS.red);
});

test("state coverage: names, boxes under a point, and 'no data here' by state", () => {
  expect(stateName("TX")).toBe("Texas");
  expect(stateName("PR")).toBe("Puerto Rico");
  expect(stateName("usa")).toBeUndefined();
  expect(statesAt([-95.37, 29.76])).toContain("TX"); // Houston
  expect(statesAt([-120.99, 37.64])).toContain("CA"); // Modesto
  expect(statesAt([-149.9, 61.2])).toContain("AK"); // Anchorage (box spans the antimeridian side)
  expect(statesAt([-30, 40])).toEqual([]); // mid-Atlantic
  expect(covers("TX", [-95.37, 29.76])).toBe(true);
  expect(covers("TX", [-120.99, 37.64])).toBe(false);
});

test("state picker: every state/territory, A-Z, framed inside its box", () => {
  const views = stateViews();
  expect(views).toHaveLength(56);
  expect(views[0]!.name).toBe("Alabama");
  const tx = views.find((v) => v.code === "TX")!;
  expect(covers("TX", tx.center)).toBe(true);
  expect(tx.zoom).toBeGreaterThan(3.5);
  expect(tx.zoom).toBeLessThan(6.5);
  const dc = views.find((v) => v.code === "DC")!;
  expect(dc.zoom).toBeGreaterThan(tx.zoom); // small places zoom in further
  expect(views.find((v) => v.code === "AK")!.center[0]).toBe(-152); // not the antimeridian
});

test("classes: match by value or first character, first color wins, fallback for the rest", () => {
  const items = [
    { values: ["A", "1"], color: "#a00", label: "A", label_es: "A" },
    { values: ["B", "AB"], color: "#b00", label: "B", label_es: "B" }, // "AB" -> "A" already taken
  ];
  expect(classesColor({ field: "kind", prefix: true, other: null, items }, "none")).toEqual([
    "match", ["upcase", ["slice", ["to-string", ["get", "kind"]], 0, 1]], ["A", "1"], "#a00", "B", "#b00", "none",
  ]);
  expect(classesColor({ field: "s", prefix: false, other: "#ccc", items: [{ values: ["Burn ban"], color: "#c00", label: "x", label_es: "x" }] }, "none"))
    .toEqual(["match", ["to-string", ["get", "s"]], "Burn ban", "#c00", "#ccc"]);
  expect(classesColor({ field: "s", prefix: false, other: null, items: [] }, "none")).toBe("none");
});
