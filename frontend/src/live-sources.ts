// Browser-live layers: each fetches straight from a public, CORS-enabled API,
// refreshes on its own schedule and/or when the map moves, and hands GeoJSON
// to the map. Parsing lives in live-parsers.ts (pure, unit-tested).
import {
  gridPoints,
  parseAirQuality,
  latestKp,
  parseAmtrak,
  parseAvailtecVehicles,
  parseINat,
  parseIss,
  parseOpenMeteo,
  parseWiki,
} from "./live-parsers";
import type { Sat } from "./satellites";
import { MAX_FEED_BYTES } from "./gtfs-rt";
import {
  agenciesInView,
  backoffUntil,
  gtfsFeatures,
  parseMbtaVehicles,
  retryAfterSeconds,
  shouldPoll,
  socrataBlobUrl,
  transitFeatures,
  type PollState,
  type TransitAgency,
} from "./transit-agencies";

type FC = GeoJSON.FeatureCollection;

export interface LiveCtx {
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  center: [number, number];
  zoom: number;
  lang: "en" | "es";
  signal: AbortSignal;
  /** Show what's loaded so far (e.g. page 1 of a paged query) while the rest arrives. */
  partial?: (data: FC) => void;
}

export interface LiveSource {
  /** Re-load from the network this often. */
  refreshMs: number;
  /** Also re-load (debounced) whenever the map stops moving. */
  byView?: boolean;
  /** Below this zoom the layer shows nothing (too much data / too slow). */
  minZoom?: number;
  /** Recompute locally this often between loads (no network). */
  tickMs?: number;
  /** Results depend on the UI language: reload when it changes. */
  langSensitive?: boolean;
  load(ctx: LiveCtx): Promise<FC>;
  tick?(): FC | null;
}

class HttpError extends Error {
  constructor(readonly status: number, host: string, readonly retryAfter: string | null = null) {
    super(`${status} from ${host}`);
  }
}

async function get(url: string, signal: AbortSignal, init?: RequestInit): Promise<Response> {
  const r = await fetch(url, { ...init, signal });
  if (!r.ok) throw new HttpError(r.status, new URL(url).host, r.headers.get("Retry-After"));
  return r;
}

async function getJSON(url: string, signal: AbortSignal, init?: RequestInit): Promise<unknown> {
  return (await get(url, signal, init)).json();
}

// --- Transit vehicles: per-agency polling (see transit-agencies.ts). Each
// agency's data doesn't depend on the view, so fetches aren't cancelled when
// the map moves; they're shared, rate-limited and backed off per agency. ---
const transitState = new Map<string, PollState>();
const transitInflight = new Map<string, Promise<boolean>>();
/** Positions older than this aren't shown (a failing feed's last snapshot). */
const TRANSIT_KEEP_MS = 3 * 60_000;

async function fetchAgency(a: TransitAgency, signal: AbortSignal): Promise<GeoJSON.Feature<GeoJSON.Point>[]> {
  if (a.format === "mbta-v3") return transitFeatures(parseMbtaVehicles(await getJSON(a.url, signal)), a);
  const url = a.format === "socrata-blob" ? socrataBlobUrl(a.url, await getJSON(a.url, signal)) : a.url;
  const r = await get(url, signal);
  // Refuse an oversized body before downloading it (decodeVehicles re-checks).
  if (Number(r.headers.get("Content-Length") ?? 0) > MAX_FEED_BYTES) throw new Error("feed too large");
  return gtfsFeatures(new Uint8Array(await r.arrayBuffer()), a);
}

/** Fetch an agency's feed if it's due; resolves true when new data arrived. */
function refreshAgency(a: TransitAgency): Promise<boolean> {
  const running = transitInflight.get(a.id);
  if (running) return running;
  const now = Date.now();
  const prev = transitState.get(a.id);
  if (!shouldPoll(a, prev, now)) return Promise.resolve(false);
  const s: PollState = prev ?? { at: 0, until: 0, failures: 0, data: null, dataAt: 0 };
  s.at = now;
  transitState.set(a.id, s);
  const p = fetchAgency(a, AbortSignal.timeout(20_000))
    .then((data) => {
      Object.assign(s, { data, dataAt: Date.now(), failures: 0, until: 0 });
      return true;
    })
    .catch((e: unknown) => {
      s.failures += 1;
      const http = e instanceof HttpError ? e : null;
      s.until = backoffUntil(Date.now(), s.failures, http?.status ?? null, retryAfterSeconds(http?.retryAfter ?? null));
      return false;
    })
    .finally(() => transitInflight.delete(a.id));
  transitInflight.set(a.id, p);
  return p;
}

let transitLast: { key: string; fc: FC } | null = null;
/** The vehicles of these agencies; the same object while nothing changed, so
 *  the map isn't re-rendered for a poll that fetched nothing new. */
function transitInView(list: TransitAgency[]): FC {
  const now = Date.now();
  const fresh = list.flatMap((a) => {
    const s = transitState.get(a.id);
    return s?.data && now - s.dataAt < TRANSIT_KEEP_MS ? [{ id: a.id, s }] : [];
  });
  const key = fresh.map(({ id, s }) => `${id}@${s.dataAt}`).join("|");
  if (transitLast?.key !== key) {
    transitLast = { key, fc: { type: "FeatureCollection", features: fresh.flatMap(({ s }) => s.data!) } };
  }
  return transitLast.fc;
}

// CelesTrak asks clients not to re-download a group within its update window
// (about 2 h). Keep the raw elements in localStorage across reloads/toggles.
const CELESTRAK_CACHE = "scm-celestrak";
async function celestrak(url: string, signal: AbortSignal): Promise<unknown> {
  try {
    const hit = JSON.parse(localStorage.getItem(CELESTRAK_CACHE) ?? "null") as { at: number; data: unknown } | null;
    if (hit && Date.now() - hit.at < 2 * 3600_000) return hit.data;
  } catch {
    /* storage blocked or corrupt: fetch */
  }
  const data = await getJSON(url, signal);
  try {
    localStorage.setItem(CELESTRAK_CACHE, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota/blocked: fine */
  }
  return data;
}

// Space weather changes slowly; share one Kp reading for 10 minutes.
let kpCache: { kp: number | null; at: number } | null = null;
async function kp(signal: AbortSignal): Promise<number | null> {
  if (kpCache && Date.now() - kpCache.at < 10 * 60_000) return kpCache.kp;
  const json = await getJSON("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", signal);
  kpCache = { kp: latestKp(json), at: Date.now() };
  return kpCache.kp;
}

let sats: Sat[] = [];
// Orbit math (satellite.js) is only downloaded when the layer is first used.
let satLib: typeof import("./satellites") | null = null;

export const LIVE_SOURCES: Record<string, LiveSource> = {
  iss: {
    refreshMs: 5000,
    async load({ signal }) {
      const [iss, k] = await Promise.all([
        getJSON("https://api.wheretheiss.at/v1/satellites/25544", signal),
        kp(signal).catch(() => null),
      ]);
      return parseIss(iss, k);
    },
  },
  satellites: {
    refreshMs: 2 * 3600_000, // orbital elements; positions are computed every tick
    tickMs: 2000,
    async load({ signal }) {
      satLib ??= await import("./satellites");
      sats = satLib.parseCelestrak(await celestrak(satLib.CELESTRAK_VISUAL, signal));
      return satLib.satellitePositions(sats, new Date());
    },
    tick: () => (satLib && sats.length ? satLib.satellitePositions(sats, new Date()) : null),
  },
  buses: {
    // StanRTA's own real-time feed (JSON form); positions update every ~15 s.
    refreshMs: 15_000,
    load: async ({ signal }) =>
      parseAvailtecVehicles(await getJSON("https://max.availtec.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition&debug=true", signal)),
  },
  "transit-vehicles": {
    // Checked every 10 s; each agency is fetched no faster than its own
    // minimum (20–30 s), so most checks fetch nothing.
    refreshMs: 10_000,
    byView: true,
    minZoom: 11,
    async load({ bbox, partial }) {
      const list = agenciesInView(bbox);
      // Show each agency as soon as it arrives (a slow feed doesn't hold up the rest).
      await Promise.all(list.map((a) => refreshAgency(a).then((got) => got && partial?.(transitInView(list)))));
      return transitInView(list);
    },
  },
  trains: {
    refreshMs: 60_000,
    load: async ({ signal }) => parseAmtrak(await getJSON("https://api-v3.amtraker.com/v3/trains", signal)),
  },
  wildlife: {
    langSensitive: true,
    refreshMs: 10 * 60_000,
    byView: true,
    minZoom: 9,
    async load({ bbox: [w, s, e, n], lang, signal }) {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const p = new URLSearchParams({
        swlat: String(s), swlng: String(w), nelat: String(n), nelng: String(e),
        d1: since, per_page: "200", order: "desc", order_by: "observed_on",
        photos: "true", geoprivacy: "open", taxon_geoprivacy: "open", locale: lang,
      });
      return parseINat(await getJSON(`https://api.inaturalist.org/v1/observations?${p}`, signal));
    },
  },
  wikipedia: {
    langSensitive: true,
    refreshMs: 30 * 60_000,
    byView: true,
    minZoom: 10,
    async load({ center: [lon, lat], lang, signal }) {
      const p = new URLSearchParams({
        action: "query", list: "geosearch", gscoord: `${lat}|${lon}`, gsradius: "10000",
        gslimit: "100", format: "json", origin: "*",
      });
      return parseWiki(await getJSON(`https://${lang}.wikipedia.org/w/api.php?${p}`, signal), lang);
    },
  },
  "weather-now": {
    refreshMs: 10 * 60_000,
    byView: true,
    minZoom: 5,
    async load({ bbox, signal }) {
      const pts = gridPoints(bbox, 5);
      const p = new URLSearchParams({
        latitude: pts.map((x) => x[0]).join(","),
        longitude: pts.map((x) => x[1]).join(","),
        current: "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
        temperature_unit: "fahrenheit",
        wind_speed_unit: "mph",
      });
      return parseOpenMeteo(await getJSON(`https://api.open-meteo.com/v1/forecast?${p}`, signal));
    },
  },
  "air-now": {
    refreshMs: 15 * 60_000,
    byView: true,
    minZoom: 5,
    async load({ bbox, signal }) {
      const pts = gridPoints(bbox, 5);
      const p = new URLSearchParams({
        latitude: pts.map((x) => x[0]).join(","),
        longitude: pts.map((x) => x[1]).join(","),
        current: "us_aqi,pm2_5,ozone",
      });
      return parseAirQuality(await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${p}`, signal));
    },
  },
};
