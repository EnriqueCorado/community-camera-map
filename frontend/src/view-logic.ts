// Pure helpers for nationwide view layers (no fetching or app imports, so
// they're unit-tested in isolation). See view-sources.ts.
import type { ViewSpec } from "./api/client"; // type-only: erased at build
import STATES from "./state-bboxes.json"; // USPS code -> {name, bbox} (backend scripts/sync_state_specs.py)
import { HAZARD_POST } from "./view-posts-hazards";
import { mealsOpen, orgName } from "./services-pack";

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

const STATE_INFO = STATES as unknown as Record<string, { name: string; bbox: Bbox }>;

/** A state/territory's name for a USPS code ("TX" -> "Texas"), if known. */
export const stateName = (code: string | undefined): string | undefined => (code ? STATE_INFO[code]?.name : undefined);

/** Every state/territory, A-Z by name, with a view that frames it. */
export function stateViews(): { code: string; name: string; center: [number, number]; zoom: number }[] {
  return Object.entries(STATE_INFO)
    .map(([code, { name, bbox: [w, s, e, n] }]) => {
      const lat = (s + n) / 2;
      // Fit the larger of width / (height corrected for latitude) into ~3 tiles.
      const span = Math.max(e - w, (n - s) / Math.cos((lat * Math.PI) / 180));
      const zoom = Math.min(10, Math.max(3, Math.log2((360 * 3) / span) - 1.2));
      return { code, name, center: [code === "AK" ? -152 : (w + e) / 2, lat] as [number, number], zoom: Math.round(zoom * 10) / 10 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The states whose bounding box holds this point (neighbors' boxes overlap). */
export function statesAt([lon, lat]: [number, number]): string[] {
  return Object.entries(STATE_INFO)
    .filter(([, { bbox: [w, s, e, n] }]) => lon >= w && lon <= e && lat >= s && lat <= n)
    .map(([code]) => code);
}

/** Does `coverage` include this point? ("world" or unknown: yes.) A USPS code
 *  ("TX") means that state's box. */
export function covers(coverage: string | undefined, [lon, lat]: [number, number]): boolean {
  const state = coverage ? STATE_INFO[coverage] : undefined;
  const boxes = state ? [state.bbox] : coverage ? COVERAGE_BOXES[coverage] : undefined;
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
  if (zoom < spec.min_zoom) return levelUrl(spec, zoom) ? "query" : available ? "home" : "empty";
  return available && spec.home_complete && within(bbox, HOME_BBOX) ? "home" : "query";
}

/** The service layer to query at this zoom: the spec's own from min_zoom,
 *  else its finest coarser level that applies (states, then counties...). */
export function levelUrl(spec: ViewSpec, zoom: number): string | null {
  return zoom >= spec.min_zoom ? spec.url : (levelAt(spec, zoom)?.url ?? null);
}

/** The coarser level in use below min_zoom (finest that applies), if any. */
function levelAt(spec: ViewSpec, zoom: number) {
  if (zoom >= spec.min_zoom) return null;
  let best: NonNullable<ViewSpec["levels"]>[number] | null = null;
  for (const l of spec.levels ?? []) if (zoom >= l.min_zoom && (!best || l.min_zoom > best.min_zoom)) best = l;
  return best;
}

/** The field allowlist at this zoom: a level's own (its source names fields
 *  differently, e.g. counties have no tract id), else the spec's. */
export const fieldsAt = (spec: ViewSpec, zoom: number): Record<string, string> =>
  levelAt(spec, zoom)?.fields ?? spec.fields;

/** Most features a view loads: the spec's cap, or more for a coarse level
 *  (all ~3,200 counties fit; they're simplified hard at that zoom). */
export const viewCap = (spec: ViewSpec, zoom: number) =>
  zoom < spec.min_zoom
    ? 4000
    : // a tract choropleth (it has coarser levels) must fill a dense metro at its
      // first zoom: LA holds ~3,200 tracts at z9 (~70-100 KB gz per 1,000)
      spec.geometry === "polygon" && spec.levels?.length
      ? Math.max(spec.max, 5000)
      : spec.max;

/** Did ArcGIS stop short (more pages to fetch)? It says so at the top level
 *  for f=json and under `properties` for f=geojson. */
export function exceededLimit(json: unknown): boolean {
  const j = json as { exceededTransferLimit?: unknown; properties?: { exceededTransferLimit?: unknown } } | null;
  return !!j && (j.exceededTransferLimit === true || j.properties?.exceededTransferLimit === true);
}

/** Longitude in [-180, 180] (MapLibre reports unwrapped values after panning
 *  across the antimeridian / world copies). */
export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** ArcGIS query for the features of `spec` intersecting `bbox`. */
export function arcgisQueryUrl(spec: ViewSpec, bbox: Bbox, zoom: number, offset = 0): string {
  const p = new URLSearchParams({
    where: spec.where || "1=1",
    geometry: bbox.join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: Object.keys(fieldsAt(spec, zoom)).join(","),
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "5",
    resultRecordCount: String(viewCap(spec, zoom)),
    f: "geojson",
  });
  if (offset > 0) p.set("resultOffset", String(offset));
  // Polygons/lines: drop detail finer than ~half a screen pixel at this zoom.
  if (spec.simplify) p.set("maxAllowableOffset", (180 / (512 * 2 ** zoom)).toPrecision(3));
  return `${levelUrl(spec, zoom) ?? spec.url}/query?${p}`;
}

/** EPA AQI band (mirrors live-parsers aqiCategory / backend aqi_category). */
function aqiBand(aqi: number): string {
  return aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "usg" : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very" : "hazardous";
}

/** "48201432401" -> "Tract 4324.01"; a 12-digit block group id ->
 *  "Block group 1, tract 4324.01"; anything else (county/state ids) -> "". */
export function tractLabel(geoid: unknown): string {
  const g = typeof geoid === "string" ? geoid.trim() : "";
  if (!/^\d{11,12}$/.test(g)) return "";
  const t = g.slice(5, 11);
  const code = `${Number(t.slice(0, 4))}${t.endsWith("00") ? "" : `.${t.slice(4)}`}`;
  return g.length === 12 ? `Block group ${g[11]}, tract ${code}` : `Tract ${code}`;
}

/** One area name for the popup title from its parts (`_geoid`, `_county`,
 *  `_state`, whichever the level has): "Tract 4324.01, Harris County, TX". */
function placeName(p: Record<string, unknown>) {
  const parts = [tractLabel(p._geoid), p._county, p._state].map((v) => (v == null ? "" : String(v).trim()));
  p.name = parts.filter(Boolean).join(", ") || null;
  delete p._geoid;
  delete p._county;
  delete p._state;
}

/** Named cleanups some sources need (mirrors backend transforms). */
const POST: Record<string, (p: Record<string, unknown>) => void> = {
  ...HAZARD_POST, // hazards / environment / water pack (view-posts-hazards.ts)
  // Nationwide area layers: name the tract/county/state for the popup.
  place: placeName,
  // FCC broadband: % of locations without 100/20 Mbps (1 - served / total), then the name.
  bdc: (p) => {
    const d = Number(p._den), s = Number(p._served);
    p.pct = p._den != null && p._served != null && d > 0 && Number.isFinite(s) ? Math.round(1000 * (1 - s / d)) / 10 : null;
    delete p._den;
    delete p._served;
    placeName(p);
  },
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
  // Census: a percentage from a numerator/denominator pair (e.g. non-citizens / population).
  ratio: (p) => {
    const n = Number(p._num), d = Number(p._den);
    p.pct = p._num != null && Number.isFinite(n) && d > 0 ? Math.round((1000 * n) / d) / 10 : null;
    delete p._num;
    delete p._den;
  },
  // Census: two percentage bands added up (e.g. 60-89 + 90+ minute commutes).
  sum: (p) => {
    const a = Number(p._a), b = Number(p._b);
    p.pct = p._a != null && p._b != null && Number.isFinite(a) && Number.isFinite(b) ? Math.round((a + b) * 10) / 10 : null;
    delete p._a;
    delete p._b;
  },
  // USDA summer meal sites: never show a site whose season isn't today.
  meals: (p) => {
    if (!mealsOpen(p)) p._drop = true;
  },
  // HUD / USDA assisted apartments: the management agent's name only when it's
  // an organization. The phone goes with it: USDA's is the agent's own, and
  // where a HUD agent is a person the "on-site" line is often theirs too.
  mgmt: (p) => {
    p.g = orgName(p.g) || null;
    if (!p.g) p.p = null;
  },
  // National Bridge Inventory text fields come wrapped in single quotes.
  nbi: (p) => {
    for (const k of ["road", "crosses", "structure"]) p[k] = String(p[k] ?? "").replace(/^'+|'+$/g, "").trim();
  },
  // National Transit Map: type text arrives in literal quotes ("\"Bus\"");
  // GTFS wheelchair_boarding 1 = accessible, 2 = not, else unknown.
  ntm: (p) => {
    p.kind = String(p.kind ?? "").replace(/^"+|"+$/g, "").trim();
    if ("wheelchair" in p) p.wheelchair = p.wheelchair === "1" || p.wheelchair === 1 ? "yes" : p.wheelchair === "2" || p.wheelchair === 2 ? "no" : "";
  },
  // PAD-US: OA = open to everyone, RA = restricted (needs permission).
  padus: (p) => {
    p.access = p.access === "OA" ? "yes" : p.access === "RA" ? "no" : "";
  },
  // USGS trails: "Yes"/"No" uses, length to a tenth of a mile.
  trails: (p) => {
    for (const k of ["hike", "bike"]) p[k] = p[k] === "Yes" ? "yes" : p[k] === "No" ? "no" : "";
    const mi = Number(p.miles);
    p.miles = p.miles != null && Number.isFinite(mi) ? Math.round(mi * 10) / 10 : null;
  },
};

/** Keep only the spec's fields (renamed; a coarser level's own at `zoom`),
 *  then run its cleanup. Anything the source adds later never reaches the
 *  map or popups. */
export function applyFields(json: unknown, spec: ViewSpec, zoom = Infinity): FC {
  const j = json as { features?: unknown; error?: unknown } | null;
  // ArcGIS reports errors with HTTP 200 and an `error` body.
  if (!j || typeof j !== "object" || j.error || !Array.isArray(j.features)) throw new Error("bad ArcGIS response");
  const post = spec.post ? POST[spec.post] : undefined;
  const fields = fieldsAt(spec, zoom);
  const features: GeoJSON.Feature[] = [];
  for (const f of j.features as GeoJSON.Feature[]) {
    if (!f?.geometry) continue;
    const src = (f.properties ?? {}) as Record<string, unknown>;
    const props: Record<string, unknown> = {};
    for (const [from, to] of Object.entries(fields)) props[to] = src[from] ?? null;
    post?.(props);
    if (props._drop) continue;
    features.push({ type: "Feature", geometry: f.geometry, properties: props });
  }
  return { type: "FeatureCollection", features };
}

/** Most pages a view follows (ArcGIS caps a page, often at 1,000). */
export const MAX_PAGES = 5;

/** Query a view's features in this bbox, page by page. Page 1 is handed to
 *  `partial` at once; the rest (up to the cap) load in parallel, and a failed
 *  later page keeps what arrived rather than blanking the layer. */
export async function loadPages(
  spec: ViewSpec,
  bbox: Bbox,
  zoom: number,
  io: { signal: AbortSignal; fetchJson: (url: string, signal: AbortSignal) => Promise<unknown>; partial?: (fc: FC) => void },
): Promise<FC> {
  const cap = viewCap(spec, zoom);
  const page = async (offset: number) => {
    const json = await io.fetchJson(arcgisQueryUrl(spec, bbox, zoom, offset), io.signal);
    return { json, fc: applyFields(json, spec, zoom) };
  };
  const first = await page(0);
  const got = (first.json as { features: unknown[] }).features.length;
  if (!exceededLimit(first.json) || got === 0 || first.fc.features.length >= cap) {
    return { type: "FeatureCollection", features: first.fc.features.slice(0, cap) };
  }
  io.partial?.(first.fc);
  const more = Math.min(MAX_PAGES - 1, Math.ceil((cap - got) / got));
  const rest = await Promise.allSettled(Array.from({ length: more }, (_, i) => page(got * (i + 1))));
  if (io.signal.aborted) throw new DOMException("aborted", "AbortError");
  const features = [...first.fc.features];
  for (const r of rest) if (r.status === "fulfilled") features.push(...r.value.fc.features);
  return { type: "FeatureCollection", features: features.slice(0, cap) };
}

/** The state a state-pack layer belongs to, from its name ("tx-houston-…" ->
 *  "TX"); undefined for national layers. Lets a shared link that turns on a
 *  state layer load that state's catalog (a national layer with a state-like
 *  prefix, "va-facilities", only costs one extra small fetch). */
export function stateOfLayer(name: string): string | undefined {
  const dash = name.indexOf("-");
  if (dash < 0) return undefined;
  const code = name.slice(0, dash).toUpperCase();
  return code.length === 2 && STATE_INFO[code] ? code : undefined;
}
