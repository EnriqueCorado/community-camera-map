// Pure helpers for nationwide view layers (no fetching or app imports, so
// they're unit-tested in isolation). See view-sources.ts.
import type { ViewSpec } from "./api/client"; // type-only: erased at build

type FC = GeoJSON.FeatureCollection;
type Bbox = [number, number, number, number]; // [west, south, east, north]

/** The baked home area (backend STANISLAUS_BBOX). */
export const HOME_BBOX: Bbox = [-121.6, 37.3, -120.3, 38.0];
/** Rough coverage areas, for "this layer has no data here" notes. */
const COVERAGE_BOXES: Record<string, Bbox[]> = {
  stanislaus: [HOME_BBOX],
  california: [[-124.5, 32.5, -114.1, 42.1]],
  usa: [
    [-125, 24.4, -66.9, 49.5], // contiguous US
    [-180, 51, -129.9, 71.5], // Alaska
    [-160.3, 18.9, -154.8, 22.3], // Hawaii
    [-67.3, 17.9, -65.2, 18.6], // Puerto Rico
  ],
};

export const within = (inner: Bbox, outer: Bbox) =>
  inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];

/** Does `coverage` include this point? ("world" or unknown: yes.) */
export function covers(coverage: string | undefined, [lon, lat]: [number, number]): boolean {
  const boxes = coverage ? COVERAGE_BOXES[coverage] : undefined;
  return !boxes || boxes.some(([w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n);
}

/** Where a nationwide layer's data for this view comes from:
 *  - "home": the baked copy. Used when zoomed out past min_zoom (never query
 *    a continent at once), and inside the home box for layers whose bake
 *    covers that whole box (`home_complete`; county-filtered bakes don't
 *    cover neighbors like Ripon, so those always query when zoomed in).
 *  - "query": the national service, for exactly this view.
 *  - "empty": zoomed out with no baked copy. */
export function chooseSource(
  spec: ViewSpec,
  available: boolean,
  bbox: Bbox,
  zoom: number,
): "home" | "query" | "empty" {
  if (zoom < spec.min_zoom) return available ? "home" : "empty";
  return available && spec.home_complete && within(bbox, HOME_BBOX) ? "home" : "query";
}

/** Longitude in [-180, 180] (MapLibre reports unwrapped values after panning
 *  across the antimeridian / world copies). */
export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** ArcGIS query for the features of `spec` intersecting `bbox`. */
export function arcgisQueryUrl(spec: ViewSpec, bbox: Bbox, zoom: number): string {
  const p = new URLSearchParams({
    where: spec.where || "1=1",
    geometry: bbox.join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: Object.keys(spec.fields).join(","),
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "5",
    resultRecordCount: String(spec.max),
    f: "geojson",
  });
  // Polygons: drop detail finer than ~half a screen pixel at this zoom.
  if (spec.simplify) p.set("maxAllowableOffset", (180 / (512 * 2 ** zoom)).toPrecision(3));
  return `${spec.url}/query?${p}`;
}

/** EPA AQI band (mirrors live-parsers aqiCategory / backend aqi_category). */
function aqiBand(aqi: number): string {
  return aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "usg" : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very" : "hazardous";
}

/** Named cleanups some sources need (mirrors backend transforms). */
const POST: Record<string, (p: Record<string, unknown>) => void> = {
  // EPA Superfund: the site-profile link is buried in an HTML field.
  epa: (p) => {
    const m = /href="(https:\/\/cumulis\.epa\.gov\/supercpad\/cursites\/csitinfo\.cfm\?id=\d+)"/.exec(String(p._profile ?? ""));
    p.page = m ? m[1] : "";
    delete p._profile;
  },
  // National Register: keep only National Archives catalog links.
  nrhp: (p) => {
    p.page = typeof p.page === "string" && /^https:\/\/catalog\.archives\.gov\/id\/\d+$/.test(p.page) ? p.page : "";
    p.listed = String(p.listed ?? "").replace(/-+$/, "");
  },
  // EPA AirNow monitors: drop inactive ones; AQI band + map label.
  airnow: (p) => {
    const aqi = typeof p.aqi === "number" ? p.aqi : Number.NaN;
    const ok = (p._status == null || p._status === "Active") && Number.isFinite(aqi) && aqi >= 0;
    delete p._status;
    if (!ok) {
      p._drop = true;
      return;
    }
    const r = Math.round(aqi); // band and label from the same number
    p.aqi = r;
    p.category = aqiBand(r);
    p.label = String(r);
  },
  // NOAA river gauges: links only to NOAA's own gauge pages.
  gauge: (p) => {
    p.page = typeof p.page === "string" && p.page.startsWith("https://water.noaa.gov/") ? p.page : "";
  },
  // National Bridge Inventory text fields come wrapped in single quotes.
  nbi: (p) => {
    for (const k of ["road", "crosses", "structure"]) p[k] = String(p[k] ?? "").replace(/^'+|'+$/g, "").trim();
  },
};

/** Keep only the spec's fields (renamed), then run its cleanup. Anything the
 *  source adds later never reaches the map or popups. */
export function applyFields(json: unknown, spec: ViewSpec): FC {
  const j = json as { features?: unknown; error?: unknown } | null;
  // ArcGIS reports errors with HTTP 200 and an `error` body.
  if (!j || typeof j !== "object" || j.error || !Array.isArray(j.features)) throw new Error("bad ArcGIS response");
  const post = spec.post ? POST[spec.post] : undefined;
  const features: GeoJSON.Feature[] = [];
  for (const f of j.features as GeoJSON.Feature[]) {
    if (!f?.geometry) continue;
    const src = (f.properties ?? {}) as Record<string, unknown>;
    const props: Record<string, unknown> = {};
    for (const [from, to] of Object.entries(spec.fields)) props[to] = src[from] ?? null;
    post?.(props);
    if (props._drop) continue;
    features.push({ type: "Feature", geometry: f.geometry, properties: props });
  }
  return { type: "FeatureCollection", features };
}
