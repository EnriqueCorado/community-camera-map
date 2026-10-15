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

type FC = GeoJSON.FeatureCollection;

export interface LiveCtx {
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  center: [number, number];
  zoom: number;
  lang: "en" | "es";
  signal: AbortSignal;
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
  constructor(readonly status: number, host: string) {
    super(`${status} from ${host}`);
  }
}

async function getJSON(url: string, signal: AbortSignal, init?: RequestInit): Promise<unknown> {
  const r = await fetch(url, { ...init, signal });
  if (!r.ok) throw new HttpError(r.status, new URL(url).host);
  return r.json();
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
