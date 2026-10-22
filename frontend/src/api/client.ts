import {
  withDefaults,
  type RawCameraCell,
  type RawCameraIndex,
  type RawCameraList,
  type RawCameraSearch,
} from "../camera-data";
import type { CameraFiles } from "../camera-store";
import type { AlprAccess } from "../alpr-access";

// Two modes:
//  - dev/server: talk to the FastAPI backend ("/api/...", proxied by Vite).
//  - static (VITE_STATIC=1, e.g. GitHub Pages): read pre-baked files under
//    "data/" relative to the page, so no backend is needed. Keys (Census,
//    no others) are used only at bake time and never shipped to the browser.
const STATIC = import.meta.env.VITE_STATIC === "1";
const API_BASE = import.meta.env.VITE_API_BASE ?? "";
// Real-time flights relay (Vercel Function, see relay/). When set, the
// static site gets live flights instead of the 15-minute snapshot.
const FLIGHTS_RELAY: string = import.meta.env.VITE_FLIGHTS_URL ?? "";

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json() as Promise<T>;
}

// Revalidate with the server instead of trusting a cached copy (Pages serves
// data with a 10-minute max-age).
const NO_CACHE: RequestInit = { cache: "no-cache" };

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
  /** Where the layer has data: stanislaus | california | usa | world. */
  coverage?: string;
  /** OpenStreetMap place layer: its Overpass selector (see osm-sources.ts). */
  osm?: string | null;
  /** Loads any area in view from a national service (see view-sources.ts). */
  view?: ViewSpec | null;
  /** Self-describing layers: Spanish title, sidebar group, choropleth. */
  title_es?: string | null;
  group?: string | null;
  metric?: MetricSpec | null;
  classes?: ClassesSpec | null;
}

/** Categorical colors: paint by one property's value (see colors.ts classesColor). */
export interface ClassesSpec {
  field: string;
  /** Match only the value's first character (zone "AB" counts as A). */
  prefix: boolean;
  /** Color for unlisted values (null: leave unpainted). */
  other: string | null;
  items: { values: string[]; color: string; label: string; label_es: string }[];
}

/** Color polygons by one numeric property (see colors.ts metricStops). */
export interface MetricSpec {
  field: string;
  fmt: "pct" | "usd" | "year" | "years" | "score" | "index" | "count";
  breaks: number[];
  ramp: string;
}

export interface ViewSpec {
  kind: "arcgis";
  url: string;
  /** source field -> our property (an allowlist) */
  fields: Record<string, string>;
  geometry: "point" | "line" | "polygon";
  min_zoom: number;
  where: string;
  max: number;
  simplify: boolean;
  refresh_s: number;
  post?: string | null;
  /** The baked copy covers the whole home box (bbox-clipped, not county-filtered). */
  home_complete?: boolean;
  /** False when there's no baked home copy (national-only layer). */
  baked?: boolean;
  /** Coarser copies of the same data for zoomed-out views (same fields
   *  unless the level names its own allowlist). */
  levels?: { min_zoom: number; url: string; fields?: Record<string, string> }[];
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
  /** The whole camera list from the dev API (one request). */
  listCameras: () => getJSON<RawCameraList>(`${API_BASE}/api/cameras`).then(withDefaults),
  /** The static site's split camera list (see camera-store.ts). `v` (the
   *  layout the index named) keeps the browser from mixing cached bakes. */
  cameraFiles: {
    index: (fresh: boolean) => getJSON<RawCameraIndex>("data/cameras/index.json", fresh ? NO_CACHE : undefined),
    search: (v: string, fresh: boolean) =>
      getJSON<RawCameraSearch>(`data/cameras/search.json?v=${encodeURIComponent(v)}`, fresh ? NO_CACHE : undefined),
    cell: (key: string, v: string, fresh: boolean) =>
      getJSON<RawCameraCell>(
        `data/cameras/cells/${encodeURIComponent(key)}.json?v=${encodeURIComponent(v)}`,
        fresh ? NO_CACHE : undefined,
      ),
  } satisfies CameraFiles,
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
  /** When each server-fetched layer was last fetched: {name: epoch seconds}.
   *  Cache-busted per minute (Pages serves data with a 10-minute max-age). */
  layerTimes: () =>
    getJSON<Record<string, number>>(
      STATIC ? `data/layer_times.json?t=${Math.floor(Date.now() / 60_000)}` : `${API_BASE}/api/layers/times`,
    ).catch(() => ({}) as Record<string, number>),
  /** Days with saved snapshots ({days: {"2026-10-15": ["quakes", …]}}). */
  historyIndex: () =>
    getJSON<{ days: Record<string, string[]> }>(`data/history/index.json?t=${Math.floor(Date.now() / 3_600_000)}`).catch(
      () => ({ days: {} }),
    ),
  /** One layer's snapshot for one day. */
  historyUrl: (day: string, name: string) => `data/history/${day}/${name}.geojson`,
  /** Build-time metadata (static mode only). */
  meta: () =>
    STATIC
      ? getJSON<Meta>("data/meta.json").catch(() => ({}) as Meta)
      : Promise.resolve({} as Meta),
};
