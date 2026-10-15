// Nationwide plate readers come in 5-degree tiles (backend/scripts/
// build_alpr_usa.py): the map loads only the tiles in view once zoomed in,
// and shows a light overview (counts on a 0.5-degree grid) when zoomed out.

/** Zoom at which individual readers (clustered) replace the overview. */
export const ALPR_TILE_ZOOM = 7;

export interface AlprIndex {
  cell_deg: number;
  cells: Record<string, number>;
  total: number;
}

/** Tile keys ("lat_lon" SW corners) covering a [w, s, e, n] view that exist
 *  in the index, nearest the view's center first, at most `max`. */
export function alprCells(index: AlprIndex, [w, s, e, n]: [number, number, number, number], max = 9): string[] {
  const d = index.cell_deg;
  const cx = (w + e) / 2, cy = (s + n) / 2;
  const keys: { key: string; dist: number }[] = [];
  for (let lat = Math.floor(s / d) * d; lat < n; lat += d) {
    for (let lon = Math.floor(w / d) * d; lon < e; lon += d) {
      const key = `${lat}_${lon}`;
      if (index.cells[key]) keys.push({ key, dist: Math.hypot(lon + d / 2 - cx, lat + d / 2 - cy) });
    }
  }
  return keys.sort((a, b) => a.dist - b.dist).slice(0, max).map((k) => k.key);
}

/** One collection from loaded tiles (tiles never overlap: no dedupe needed). */
export function mergeTiles(tiles: Iterable<GeoJSON.FeatureCollection>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const t of tiles) features.push(...t.features);
  return { type: "FeatureCollection", features };
}

// Shared, cached loaders (the map layer and "What can see me?" both use them).
let indexPromise: Promise<AlprIndex | null> | null = null;
export function alprIndex(): Promise<AlprIndex | null> {
  indexPromise ??= fetch("data/alpr/index.json")
    .then((r) => (r.ok ? (r.json() as Promise<AlprIndex>) : null))
    .then((ix) => (ix && ix.cells ? ix : null))
    .catch(() => null);
  return indexPromise;
}

const tilePromises = new Map<string, Promise<GeoJSON.FeatureCollection | null>>();
export function alprTile(key: string): Promise<GeoJSON.FeatureCollection | null> {
  let p = tilePromises.get(key);
  if (!p) {
    p = fetch(`data/alpr/${key}.geojson`)
      .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : null))
      .then((fc) => (fc && Array.isArray(fc.features) ? fc : null))
      .catch(() => null);
    p.then((fc) => fc || tilePromises.delete(key)); // retry failures later
    tilePromises.set(key, p);
  }
  return p;
}

/** Free a tile no longer in use (the map keeps a bounded set). */
export function evictAlprTile(key: string) {
  tilePromises.delete(key);
}

/** Readers within the tiles around a point (null = no nationwide tiles).
 *  Throws if a needed tile can't be loaded: a privacy tool must never
 *  report "no readers" because of a network error. */
export async function alprNear(lon: number, lat: number, radiusM: number): Promise<GeoJSON.FeatureCollection | null> {
  const ix = await alprIndex();
  if (!ix) return null;
  const dLat = radiusM / 111_000 + 0.01;
  const dLon = dLat / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const fcs = await Promise.all(alprCells(ix, [lon - dLon, lat - dLat, lon + dLon, lat + dLat], 4).map(alprTile));
  if (fcs.some((f) => !f)) throw new Error("plate-reader tile unavailable");
  return mergeTiles(fcs as GeoJSON.FeatureCollection[]);
}
