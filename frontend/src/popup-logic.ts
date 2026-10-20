// Pure popup helpers — no React/DOM, so they're unit-tested directly
// (e2e/tests/unit-popup-logic.spec.ts).
import { SERVICE_LINK_HOSTS } from "./services-pack";

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
