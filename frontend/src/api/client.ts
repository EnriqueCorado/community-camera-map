import type { CameraList } from "../types";
import type { AlprAccess } from "../alpr-access";

// Two modes:
//  - dev/server: talk to the FastAPI backend ("/api/...", proxied by Vite).
//  - static (VITE_STATIC=1, e.g. GitHub Pages): read pre-baked files under
//    "data/" relative to the page, so no backend is needed. Keys (Census,
//    AirNow) are used only at bake time and never shipped to the browser.
const STATIC = import.meta.env.VITE_STATIC === "1";
const API_BASE = import.meta.env.VITE_API_BASE ?? "";
// Real-time flights relay (Cloudflare Worker, see relay/). When set, the
// static site gets live flights instead of the 15-minute snapshot.
const FLIGHTS_RELAY: string = import.meta.env.VITE_FLIGHTS_URL ?? "";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json() as Promise<T>;
}

export interface LayerInfo {
  name: string;
  title: string;
  description: string;
  category: string;
  available: boolean;
  requires_key: boolean;
  /** Serves another layer's data: same file (cached by the browser), styled differently. */
  same_data_as?: string | null;
  /** Feature count at bake/refresh time (static site only). */
  count?: number;
  source?: string;
}

export interface Meta {
  baked_at?: string;
  /** When the scheduled job last refreshed the live layers (flights, fires, …). */
  live_at?: string;
}

let alprAccessCache: Promise<AlprAccess> | null = null;

export const api = {
  static: STATIC,
  /** Live flights URL: the relay if configured, else the layer file/API. */
  flightsRelay: FLIGHTS_RELAY,
  listCameras: () => getJSON<CameraList>(STATIC ? "data/cameras.json" : `${API_BASE}/api/cameras`),
  listLayers: () => getJSON<LayerInfo[]>(STATIC ? "data/layers.json" : `${API_BASE}/api/layers`),
  /** Overlay layer GeoJSON. */
  layerUrl: (name: string) =>
    STATIC ? `data/layers/${name}.geojson` : `${API_BASE}/api/layers/${name}`,
  /** Sourced "who can search this plate reader" profiles. Fetched once per page
   *  load; a failure clears the cache so the next call retries. */
  alprAccess: (): Promise<AlprAccess> => {
    const p =
      alprAccessCache ??
      getJSON<AlprAccess>(
        STATIC ? "data/alpr_access.json" : `${API_BASE}/api/layers/alpr/access`,
      ).catch((err: unknown) => {
        alprAccessCache = null;
        throw err;
      });
    alprAccessCache = p;
    return p;
  },
  /** Build-time metadata (static mode only). */
  meta: () =>
    STATIC
      ? getJSON<Meta>("data/meta.json").catch(() => ({}) as Meta)
      : Promise.resolve({} as Meta),
};
