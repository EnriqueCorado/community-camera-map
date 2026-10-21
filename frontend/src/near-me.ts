// "What's near an address?": find a place (Nominatim geocoder), then ask the
// national map services about that exact point and list the nearest useful
// places. Every lookup is independent; any that fail are simply left out.
//
// Privacy: the typed search goes to OpenStreetMap's Nominatim. Each service
// gets only the precision its question needs: ~10 m for boundaries (flood
// and fire zones, city, ZIP, districts), ~100 m for census-tract numbers,
// ~1 km for drought/heat grids and the "nearest" searches (the distance
// itself is computed here, in the browser). Nothing is stored by this site.
import { home } from "./baked";
import type { Key } from "./i18n";
import { featureAt, floodRisk, JOB_TIMEOUT_MS, nearest, withTimeout, type LonLat } from "./near-me-logic";
import { HOME_BBOX } from "./view-logic";

type FC = GeoJSON.FeatureCollection;
type Attrs = Record<string, unknown>;

export interface FoundPlace {
  label: string;
  center: LonLat;
}

/** Up to 5 US matches for an address or place name (OpenStreetMap
 *  Nominatim: one request per search button press, per its usage policy). */
const geocodeCache = new Map<string, Promise<FoundPlace[]>>();
let lastGeocodeAt = 0;

/** Cached and spaced >= 1 s apart (Nominatim's policy: cache results, at most
 *  1 request/second). The same search is never sent twice per page load. */
export function geocode(q: string, lang: "en" | "es"): Promise<FoundPlace[]> {
  const key = `${lang}|${q.trim().toLowerCase().replace(/\s+/g, " ")}`;
  let p = geocodeCache.get(key);
  if (!p) {
    const wait = Math.max(0, lastGeocodeAt + 1100 - Date.now());
    lastGeocodeAt = Date.now() + wait;
    p = new Promise<void>((r) => setTimeout(r, wait)).then(() => nominatim(q.trim(), lang));
    p.catch(() => geocodeCache.delete(key)); // failures may be retried
    geocodeCache.set(key, p);
  }
  return p;
}

async function nominatim(q: string, lang: "en" | "es", signal?: AbortSignal): Promise<FoundPlace[]> {
  const p = new URLSearchParams({ q, format: "jsonv2", countrycodes: "us", limit: "5", "accept-language": lang });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { signal });
  if (!r.ok) throw new Error(String(r.status));
  const rows = (await r.json()) as { lat?: string; lon?: string; display_name?: string }[];
  const out: FoundPlace[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const lat = Number(row.lat), lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // "Modesto City Hall, 1010, 10th Street, …, Stanislaus County, California, 95354, United States"
    const label = String(row.display_name ?? "")
      .split(", ")
      .filter((x) => x !== "United States" && !/^\d{5}(-\d{4})?$/.test(x))
      .slice(0, 5)
      .join(", ");
    out.push({ label: label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, center: [lon, lat] });
  }
  return out;
}

export type FactGroup = "where" | "hazards" | "neighborhood" | "nearby";
export interface Fact {
  group: FactGroup;
  label: Key;
  /** Plain text from the data, or a translated phrase. */
  text?: string;
  phrase?: { key: Key; vars?: Record<string, string | number> };
  meters?: number;
}

const TW = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb";
const LA = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services";
const HIFLD = "https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services";

/** Attributes of the first feature of an ArcGIS layer at the point. */
async function at(url: string, fields: string, [lon, lat]: LonLat, signal?: AbortSignal): Promise<Attrs | null> {
  const p = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: fields,
    returnGeometry: "false",
    f: "json",
  });
  const r = await fetch(`${url}/query?${p}`, { signal });
  const j = (await r.json()) as { features?: { attributes?: Attrs }[]; error?: unknown };
  if (!r.ok || j.error) throw new Error("query failed");
  return j.features?.[0]?.attributes ?? null;
}

/** Point features of an ArcGIS layer within `radiusM` of the point. */
async function around(url: string, fields: string, [lon, lat]: LonLat, radiusM: number, signal?: AbortSignal): Promise<FC> {
  const p = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    distance: String(radiusM),
    units: "esriSRUnit_Meter",
    spatialRel: "esriSpatialRelIntersects",
    outFields: fields,
    outSR: "4326",
    resultRecordCount: "100",
    f: "geojson",
  });
  const r = await fetch(`${url}/query?${p}`, { signal });
  const j = (await r.json()) as FC & { error?: unknown };
  if (!r.ok || j.error || !Array.isArray(j.features)) throw new Error("query failed");
  return j;
}

/** `around`, starting small and widening only if nothing is found, so dense
 *  areas (more than 100 results, returned in no particular order) still get
 *  the true nearest. */
async function widening(url: string, fields: string, at: LonLat, radiiM: number[], signal?: AbortSignal): Promise<FC> {
  let fc: FC = { type: "FeatureCollection", features: [] };
  for (const r of radiiM) {
    fc = await around(url, fields, at, r, signal);
    if (fc.features.length) return fc;
  }
  return fc;
}

const str = (v: unknown) => (v == null ? "" : String(v).trim());
/** "NORTHWESTERN MEMORIAL HOSPITAL" -> "Northwestern Memorial Hospital" (federal
 *  lists are often all caps); mixed-case text is left alone. */
const tidyCaps = (s: string) =>
  s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : s;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (v: unknown) => (num(v) != null ? `${Math.round(num(v)! * 10) / 10}%` : "");

const baked = home; // shared cache with the nationwide layers

/** Everything we can say about a point. Lookups run in parallel. */
export async function report(point: LonLat, signal?: AbortSignal): Promise<Fact[]> {
  const round = (d: number): LonLat => [Math.round(point[0] * 10 ** d) / 10 ** d, Math.round(point[1] * 10 ** d) / 10 ** d];
  const pt = round(4); // boundaries: ~10 m
  const tract = round(3); // census-tract numbers: ~100 m
  const coarse = round(2); // 2.5 km+ grids and nearest-place searches: ~1 km
  const [lon, lat] = pt;
  const inHome = lon >= HOME_BBOX[0] && lon <= HOME_BBOX[2] && lat >= HOME_BBOX[1] && lat <= HOME_BBOX[3];
  const inCa = lon >= -124.5 && lon <= -114.1 && lat >= 32.5 && lat <= 42.1;

  const near = (group: FactGroup, label: Key, hit: ReturnType<typeof nearest>, name: (p: Attrs) => string): Fact | null =>
    hit && hit.meters < 25_000 ? { group, label, text: name(hit.props), meters: hit.meters } : null;
  const nameAddr = (p: Attrs) => {
    const name = tidyCaps(str(p.name ?? p.NAME));
    const addr = tidyCaps(str(p.address ?? p.ADDRESS));
    return addr && addr.toLowerCase() !== name.toLowerCase() ? [name, addr].filter(Boolean).join(" — ") : name;
  };

  const jobs: Promise<Fact | Fact[] | null>[] = [
    // --- Where
    at(`${TW}/Places_CouSub_ConCity_SubMCD/MapServer/4`, "NAME", pt, signal).then((a) =>
      a ? { group: "where", label: "nearCity", text: str(a.NAME) } : { group: "where", label: "nearCity", phrase: { key: "nearUnincorporated" } },
    ),
    at(`${TW}/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11`, "ZCTA5", pt, signal).then((a) =>
      a ? { group: "where", label: "nearZip", text: str(a.ZCTA5) } : null,
    ),
    at(`${TW}/Legislative/MapServer/0`, "NAME", pt, signal).then((a) =>
      a ? { group: "where", label: "nearCongress", text: str(a.NAME) } : null,
    ),
    Promise.all([0, 2, 1].map((i) => at(`${TW}/School/MapServer/${i}`, "NAME", pt, signal).catch(() => null))).then((rows) => {
      const names = rows.map((a) => str(a?.NAME)).filter(Boolean);
      return names.length ? { group: "where", label: "nearSchoolDistrict", text: names.join(" · ") } : null;
    }),
    inHome
      ? baked("supervisor-districts").then((fc) => {
          const d = featureAt(fc, pt);
          return d ? { group: "where", label: "nearSupervisor", text: str(d.district) } : null;
        })
      : Promise.resolve(null),
    // --- Hazards
    at("https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28", "FLD_ZONE,ZONE_SUBTY,SFHA_TF", pt, signal).then(
      (a) => {
        if (!a) return { group: "hazards", label: "nearFlood", phrase: { key: "floodNotMapped" } };
        const risk = floodRisk(str(a.FLD_ZONE), str(a.ZONE_SUBTY), str(a.SFHA_TF));
        if (!risk) return null; // open water, or left out of FEMA's study
        return { group: "hazards", label: "nearFlood", phrase: { key: `flood_${risk}` as Key, vars: { zone: str(a.FLD_ZONE) } } };
      },
    ),
    inCa
      ? at("https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/FHSZSRA_23_3/FeatureServer/0", "FHSZ_Description", pt, signal).then(
          (a) => (a ? { group: "hazards", label: "nearFireHazard", text: str(a.FHSZ_Description) } : null),
        )
      : Promise.resolve(null),
    at("https://services5.arcgis.com/0OTVzJS4K09zlixn/arcgis/rest/services/USDM_current/FeatureServer/0", "DM", coarse, signal).then(
      (a) => ({
        group: "hazards",
        label: "nearDrought",
        phrase: { key: num(a?.DM) != null ? (`droughtD${num(a!.DM)}` as Key) : "droughtNone" },
      }),
    ),
    heatRisk(coarse, signal).then((v) => (v != null ? { group: "hazards", label: "nearHeat", phrase: { key: `heat${v}` as Key } } : null)),
    // --- Neighborhood (census tract)
    at(`${LA}/ACS_Median_Household_Income_View_Boundaries/FeatureServer/2`, "NAME,B19049_001E", tract, signal).then((a) =>
      num(a?.B19049_001E) != null
        ? { group: "neighborhood", label: "medianIncome", text: `$${num(a!.B19049_001E)!.toLocaleString("en-US")}` }
        : null,
    ),
    at(`${LA}/ACS_Poverty_Status_View_Boundaries/FeatureServer/2`, "B17020_calc_pctPovE", tract, signal).then((a) =>
      a ? { group: "neighborhood", label: "rowPoverty", text: pct(a.B17020_calc_pctPovE) } : null,
    ),
    at(
      "https://services3.arcgis.com/ZvidGQkLaDJxRSJ2/arcgis/rest/services/PLACES_LocalData_for_BetterHealth/FeatureServer/3",
      "ACCESS2_CrudePrev,FOODINSECU_CrudePrev,CASTHMA_CrudePrev,DIABETES_CrudePrev",
      tract,
      signal,
    ).then((a) =>
      a
        ? ([
            { group: "neighborhood", label: "nearUninsured", text: pct(a.ACCESS2_CrudePrev) },
            { group: "neighborhood", label: "nearFoodInsecure", text: pct(a.FOODINSECU_CrudePrev) },
            { group: "neighborhood", label: "nearAsthma", text: pct(a.CASTHMA_CrudePrev) },
            { group: "neighborhood", label: "nearDiabetes", text: pct(a.DIABETES_CrudePrev) },
          ] satisfies Fact[])
        : null,
    ),
    // --- Nearby (national)
    widening(`${HIFLD}/Hospitals_hifld/FeatureServer/0`, "NAME,ADDRESS", coarse, [6_500, 26_500], signal).then((fc) =>
      near("nearby", "nearHospital", nearest(fc, pt), nameAddr),
    ),
    widening(
      "https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services/snap_retailer_location_data/FeatureServer/0",
      "Store_Name,Store_Street_Address",
      coarse,
      [2_000, 6_500],
      signal,
    ).then((fc) =>
      near("nearby", "nearSnap", nearest(fc, pt), (p) => nameAddr({ name: p.Store_Name, address: p.Store_Street_Address })),
    ),
  ];
  if (inHome) {
    // Home-county lists (baked): voting, cooling centers, clinics, …
    const homeNear = (file: string, label: Key, keep?: (p: Attrs) => boolean) =>
      baked(file).then((fc) => near("nearby", label, nearest(fc, pt, keep), nameAddr));
    jobs.push(
      homeNear("voting", "nearVoteCenter", (p) => p.kind === "vote-center"),
      homeNear("voting", "nearDropBox", (p) => p.kind === "drop-box" || p.kind === "outdoor-drop-box"),
      homeNear("cooling-centers", "nearCooling"),
      homeNear("clinics", "nearClinic"),
      homeNear("pharmacies", "nearPharmacy"),
      homeNear("libraries", "nearLibrary"),
      homeNear("fire-stations", "nearFireStation"),
    );
  }
  // One slow upstream (FEMA, Census, a cold home list) must not hold the whole
  // report: each question gets JOB_TIMEOUT_MS, then it's left out.
  const settled = await Promise.allSettled(jobs.map((j) => withTimeout(j, JOB_TIMEOUT_MS)));
  return settled.flatMap((s) => (s.status === "fulfilled" && s.value ? (Array.isArray(s.value) ? s.value : [s.value]) : []));
}

/** Today's NWS HeatRisk level (0-4) at the point. */
async function heatRisk([lon, lat]: LonLat, signal?: AbortSignal): Promise<number | null> {
  const p = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    mosaicRule: JSON.stringify({ mosaicMethod: "esriMosaicAttribute", where: "name='HeatRisk_1_Mercator'" }),
    returnGeometry: "false",
    returnCatalogItems: "false",
    f: "json",
  });
  const r = await fetch(
    `https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify?${p}`,
    { signal },
  );
  const v = Number(((await r.json()) as { value?: unknown }).value);
  return Number.isInteger(v) && v >= 0 && v <= 4 ? v : null;
}

