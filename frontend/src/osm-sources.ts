// Nationwide OpenStreetMap place layers (AEDs, libraries, clinics, …). Inside
// the home area, or zoomed out, the daily baked copy is used. Elsewhere, at
// city zoom, the browser asks Overpass directly — ONE union query for every
// place layer that's on (Overpass allows each visitor ~2 requests at a time),
// split back into layers by tag.
import type { LayerInfo } from "./api/client";
import type { LiveSource } from "./live-sources";
import { osmPoints, overpassQuery, selectorMatcher } from "./osm-logic";
import { home } from "./baked";
import { HOME_BBOX, within } from "./view-logic";

type Bbox = [number, number, number, number];
type FC = GeoJSON.FeatureCollection;

/** City scale: a bbox small enough for a quick Overpass answer. */
export const OSM_MIN_ZOOM = 12;
// Public Overpass servers, tried in order (each is sometimes busy or down).
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Requests for the same view that arrive together share one union query.
let batch: { key: string; selectors: Set<string>; result: Promise<unknown[]> } | null = null;

function union(selector: string, bbox: Bbox, signal: AbortSignal): Promise<unknown[]> {
  const key = bbox.join(",");
  if (batch && batch.key === key) {
    batch.selectors.add(selector);
    return batch.result;
  }
  const selectors = new Set([selector]);
  const result = new Promise<void>((r) => setTimeout(r, 60)) // let the other layers join
    .then(async () => {
      if (batch?.key === key) batch = null;
      const body = new URLSearchParams({ data: overpassQuery([...selectors], bbox) });
      for (const url of ENDPOINTS) {
        try {
          const r = await fetch(url, { method: "POST", body, signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
          if (!r.ok) continue; // 429/504: try the next mirror
          const j = (await r.json()) as { elements?: unknown[]; remark?: string };
          if (j.remark && /error|timed out|runtime/i.test(j.remark)) continue; // partial answer
          return Array.isArray(j.elements) ? j.elements : [];
        } catch (err) {
          if (signal.aborted) throw err;
        }
      }
      throw new Error("overpass unavailable");
    });
  batch = { key, selectors, result };
  return result;
}

const cache = new Map<string, LiveSource>();

/** A browser-side loader for an OpenStreetMap place layer (catalog `osm`). */
export function osmSource(info: LayerInfo): LiveSource | undefined {
  const selector = info.osm;
  const keep = selector ? selectorMatcher(selector) : null;
  if (!selector || !keep) return undefined;
  let s = cache.get(info.name);
  if (!s) {
    s = {
      refreshMs: 30 * 60_000,
      byView: true,
      async load({ bbox, zoom, signal }) {
        if (within(bbox, HOME_BBOX) || zoom < OSM_MIN_ZOOM) {
          return info.available ? home(info.name) : ({ type: "FeatureCollection", features: [] } as FC);
        }
        return osmPoints(await union(selector, bbox, signal), keep, bbox);
      },
    };
    cache.set(info.name, s);
  }
  return s;
}

