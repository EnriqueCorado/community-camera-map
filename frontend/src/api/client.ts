import type { CameraList } from "../types";

// Two modes:
//  - dev/server: talk to the FastAPI backend ("/api/...", proxied by Vite).
//  - static (VITE_STATIC=1, e.g. GitHub Pages): read pre-baked files under
//    "data/" relative to the page, so no backend is needed. Keys (Census,
//    AirNow) are used only at bake time and never shipped to the browser.
const STATIC = import.meta.env.VITE_STATIC === "1";
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

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
  source?: string;
}

export interface Meta {
  baked_at?: string;
}

export const api = {
  static: STATIC,
  listCameras: () => getJSON<CameraList>(STATIC ? "data/cameras.json" : `${API_BASE}/api/cameras`),
  listLayers: () => getJSON<LayerInfo[]>(STATIC ? "data/layers.json" : `${API_BASE}/api/layers`),
  /** Overlay layer GeoJSON. */
  layerUrl: (name: string) =>
    STATIC ? `data/layers/${name}.geojson` : `${API_BASE}/api/layers/${name}`,
  /** Build-time metadata (static mode only). */
  meta: () =>
    STATIC
      ? getJSON<Meta>("data/meta.json").catch(() => ({}) as Meta)
      : Promise.resolve({} as Meta),
};
