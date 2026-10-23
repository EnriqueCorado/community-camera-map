// Pure popup helpers — no React/DOM, so they're unit-tested directly
// (e2e/tests/unit-popup-logic.spec.ts).
import { SERVICE_LINK_HOSTS } from "./services-pack";
import { SCHOOL_MEAL_LINK_HOSTS } from "./school-meals";

export type FloodRiskKey = "floodHigh" | "floodModerate" | "floodMinimal" | "floodUndetermined";

/**
 * Plain-language risk for a FEMA NFHL flood zone.
 *  - A / AE / AH / AO / AR / A99 / V / VE: special flood hazard area (1% annual chance) -> high
 *  - "Shaded X": 0.2% annual chance, levee-protected, or 1% with < 1 ft depth -> moderate
 *  - Other X -> minimal; D / anything else -> undetermined
 */
export function floodRiskKey(zone: string, subtype: string): FloodRiskKey {
  const z = zone.trim().toUpperCase();
  if (/^(A|AE|AH|AO|AR|A99|V|VE)$/.test(z)) return "floodHigh";
  if (z === "X" && /0\.2|LEVEE|1 PCT/i.test(subtype)) return "floodModerate";
  if (z === "X") return "floodMinimal";
  return "floodUndetermined";
}

// Placeholders government datasets use for "missing". Numeric sentinels must be
// negative (-999, -9999) so a real value of 999 isn't hidden.
const MISSING = /^(not available|n\/?a|no data|unknown|none|null|-9{3,}(\.0+)?)$/i;

export function isMissing(v: unknown): boolean {
  return v == null || String(v).trim() === "" || MISSING.test(String(v).trim());
}

const SMALL_WORDS = new Set(["of", "the", "and", "an", "in", "on", "at", "to", "for", "de", "del", "la", "el", "y"]);
const STREET_SUFFIXES = new Set(["st", "rd", "dr", "ln", "ct", "av", "wy", "pl", "hw", "pk"]);

/** ALL-CAPS government data -> readable Title Case. Leaves mixed-case text,
 *  short codes (CA, AE), and tokens with digits (I-205, SR-99) alone. */
export function tidy(s: string): string {
  if (!/\p{Lu}{3}/u.test(s) || s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      if (/^\d+(st|nd|rd|th)$/.test(w)) return w; // 10th, 3rd
      if (/\d/.test(w)) return w.toUpperCase(); // I-205, SR-99
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      if (w.length <= 2 && !STREET_SUFFIXES.has(w)) return w.toUpperCase(); // CA, US, R, A
      return w.replace(/(^|[-/(])(\p{Ll})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
    })
    .join("");
}


/** Websites of the curated free legal help offices (legal_help.json); the
 *  popup and the Help list link only to these. */
export const LEGAL_SITE_HOSTS = [
  "californiahumandevelopment.org",
  "centralcallegal.org",
  "crla.org",
  "senioradvocacynetwork.org",
  "worldrelief.org",
  "www.ccstockton.org",
  "www.dir.ca.gov",
  "www.elconcilio.org",
  "www.havenstan.org",
  "www.housing.org",
  "www.rescue.org",
  "www.stanislaus.courts.ca.gov",
  "www.stanislausfamilyjustice.org",
];

/** Hosts whose images / pages popups may show. The webcam hosts mirror the
 *  backend allowlist in transforms.py; the rest are browser-live sources. */
export const WEBCAM_IMAGE_HOSTS = [
  "cameras.alertcalifornia.org",
  "usgs-nims-images.s3.amazonaws.com",
  "inaturalist-open-data.s3.amazonaws.com",
  "static.inaturalist.org",
];
export const WEBCAM_PAGE_HOSTS = [
  "cameras.alertcalifornia.org",
  "alertwildfire.org",
  "www.alertwildfire.org",
  "apps.usgs.gov",
  "windy.com",
  "www.windy.com",
  "webcams.windy.com",
  // Source pages for the other layers' "view on …" links.
  "spotthestation.nasa.gov",
  "celestrak.org",
  "www.inaturalist.org",
  "en.wikipedia.org",
  "es.wikipedia.org",
  "www.openstreetmap.org",
  "cumulis.epa.gov",
  "catalog.archives.gov",
  "www.hmdb.org",
  "www.stanvote.gov",
  "www.stanrta.org",
  "www.cdc.gov",
  "water.noaa.gov",
  "volcanoes.usgs.gov",
  "ceqanet.lci.ca.gov",
  "www.spc.noaa.gov",
  "droughtmonitor.unl.edu",
  "echo.epa.gov", // EPA ECHO facility reports (hazards pack)
  "obipublic11.epa.gov", // EPA Cleanups in My Community profiles
  ...SERVICE_LINK_HOSTS, // community & immigrant services pack (official .gov pages)
  ...SCHOOL_MEAL_LINK_HOSTS, // free school meals: state program pages and USDA CEP
];

/** State traffic-info sites the road-operations popups may link to (work zones,
 *  incidents). Mirrors backend app/layers/national/roads.py PAGE_HOSTS;
 *  backend tests/test_roads_pack.py fails if the two lists drift. */
export const ROAD_PAGE_HOSTS = [
  "511.alaska.gov",
  "511.idaho.gov",
  "511ga.org",
  "511ia.org",
  "511in.org",
  "511la.org",
  "511mn.org",
  "511nj.org",
  "511ny.org",
  "511wi.gov",
  "az511.com",
  "chart.maryland.gov",
  "deldot.gov",
  "fl511.com",
  "goky.ky.gov",
  "hidot.hawaii.gov",
  "newengland511.org",
  "nmroads.com",
  "oktraffic.org",
  "travel.dot.nd.gov",
  "traveler.modot.org",
  "udottraffic.utah.gov",
  "wsdot.com",
  "www.511la.org",
  "www.algotraffic.com",
  "www.drivenc.gov",
  "www.kandrive.gov",
  "www.mdottraffic.com",
  "www.nvroads.com",
  "www.ohgo.com",
  "www.udottraffic.utah.gov",
];

/** Hosts the camera viewer may load stills / HLS from (a host matches itself or
 *  any subdomain). Mirrors backend app/cameras/national.py HOSTS plus Caltrans;
 *  backend tests/test_national.py fails if the two lists drift. */
export const CAMERA_MEDIA_HOSTS = [
  "dot.ca.gov",
  "cctv.travelmidwest.com",
  "www.lakecountypassage.com",
  "images.wsdot.wa.gov",
  "www.trimarc.org",
  "us-east-1.skyvdn.com",
  "sd.cdn.iteris-atis.com",
  "mt.cdn.iteris-atis.com",
  "modot.mo.gov",
  "sha.maryland.gov",
  "video.deldot.gov",
  "api.algotraffic.com",
  "cdn3.wowza.com",
  "micamerasimages.net",
  "avo-volcview.wr.usgs.gov",
  "www.ndbc.noaa.gov",
  "511ga.org",
  "511wi.gov",
  "cctv1.dot.wi.gov",
  "www.nvroads.com",
  "www.drivenc.gov",
  "www.udottraffic.utah.gov",
  "511.alaska.gov",
  "www.511la.org",
  "511.idaho.gov",
  "az511.com",
  "itscameras.dot.state.oh.us",
  "atmsqf.iowadot.gov",
  "images-dis.divas.cloud",
  "tripcheck.com",
  "video.dot.state.mn.us",
  "cctv.austinmobility.io",
  "webapps.arlingtontx.gov",
  "assets.lawrenceks.gov",
];

/** A camera still / stream URL if it's https on a CAMERA_MEDIA_HOSTS host (or a
 *  subdomain of one), else "" — so the viewer shows nothing rather than an
 *  off-list or mixed-content URL. */
export function safeCameraUrl(u: unknown): string {
  if (typeof u !== "string" || !u) return "";
  try {
    const url = new URL(u.trim());
    const host = url.hostname.toLowerCase();
    const ok =
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.port === "" || url.port === "443") &&
      CAMERA_MEDIA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    return ok ? url.href : "";
  } catch {
    return "";
  }
}

/** `u` if it's an https URL on one of `hosts`, else null. Never trust data-supplied URLs. */
export function safeUrl(u: unknown, hosts: readonly string[]): string | null {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u.trim());
    const ok = url.protocol === "https:" && hosts.includes(url.hostname) && !url.username && !url.password;
    return ok ? url.href : null;
  } catch {
    return null;
  }
}

/** Add a per-minute cache-buster so a "latest frame" URL isn't served stale. */
export function freshImage(src: string, now = Date.now()): string {
  const url = new URL(src);
  url.searchParams.set("t", String(Math.floor(now / 60000)));
  return url.href;
}

/** Spanish labels for the property names researched state layers use most. */
const SPEC_PROP_ES: Record<string, string> = {
  kind: "Tipo", status: "Estado", county: "Condado", acres: "Acres", updated: "Actualizado",
  hours: "Horario", description: "Descripción", manager: "Administra", operator: "Operador",
  parcel_id: "Parcela", miles: "Millas", year_built: "Año de construcción", capacity: "Capacidad",
  surface: "Superficie", zip: "Código postal", accessible: "Accesible", area: "Área", water: "Agua",
  fee: "Costo", access: "Acceso", score: "Puntaje", notes: "Notas", note: "Nota", start: "Inicio",
  end: "Fin", year: "Año", ramp: "Rampa", zoning: "Zonificación", waterbody: "Cuerpo de agua",
  region: "Región", parking: "Estacionamiento", agency: "Agencia", info: "Información", route: "Ruta",
  direction: "Dirección", population: "Población", camping: "Campamento", park: "Parque",
  species: "Especies", marker: "Marcador", erected: "Colocado", hunting: "Caza", ada: "ADA",
  road: "Camino", amenities: "Servicios", hiking: "Senderismo", street: "Calle", district: "Distrito",
  fishing: "Pesca", restrooms: "Baños", restroom: "Baños", units: "Unidades", location: "Ubicación",
  customers_out: "Clientes sin luz", number: "Número", jurisdiction: "Jurisdicción", phone: "Teléfono",
  address: "Dirección", city: "Ciudad",
};
const SPEC_DATE_PROPS = new Set(["updated", "start", "end", "listed", "erected"]);

/** Extra popup rows for researched state layers (state_layers/*.json): every
 *  allowlisted property the generic popup doesn't already show, labeled.
 *  Links and ids are left out; long text is cut. */
export function specRows(
  p: Record<string, unknown>,
  shown: ReadonlySet<string>,
  lang: "en" | "es",
  locale: string,
  max = 8,
): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(p)) {
    if (out.length >= max) break;
    if (shown.has(k) || k === "page" || k === "geoid" || /^(object)?id$/i.test(k)) continue;
    if (isMissing(v) || typeof v === "object" || typeof v === "boolean") continue;
    const label = lang === "es" && SPEC_PROP_ES[k] ? SPEC_PROP_ES[k]! : (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, " ");
    let text: string;
    if (typeof v === "number") {
      // Esri dates arrive as epoch milliseconds.
      text = SPEC_DATE_PROPS.has(k) && v > 1e11
        ? new Date(v).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
        : /year/.test(k) ? String(v) : v.toLocaleString(locale);
    } else {
      text = String(v).trim().replace(/\s+/g, " ");
      if (/^https?:\/\//i.test(text)) continue;
      if (text.length > 200) text = `${text.slice(0, 197)}…`;
    }
    out.push([label, text]);
  }
  return out;
}
