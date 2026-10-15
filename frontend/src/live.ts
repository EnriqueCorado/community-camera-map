// Pure helpers for the live layers (radar frames, satellite date, flight
// motion). No map/DOM imports, so they're unit-tested directly.

export const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";
const RAINVIEWER_HOST = "https://tilecache.rainviewer.com";

export interface RadarFrame {
  /** Unix seconds of the radar scan. */
  time: number;
  tiles: string;
}

/** The last `max` past radar frames from RainViewer's index, oldest first.
 *  Only ever builds URLs on RainViewer's own tile host. */
export function radarFrames(json: unknown, max = 7): RadarFrame[] {
  const j = json as { host?: unknown; radar?: { past?: unknown } } | null;
  if (!j || j.host !== RAINVIEWER_HOST || !Array.isArray(j.radar?.past)) return [];
  const out: RadarFrame[] = [];
  for (const f of j.radar.past as { time?: unknown; path?: unknown }[]) {
    if (typeof f?.time !== "number" || typeof f.path !== "string") continue;
    if (!/^\/v2\/radar\/[A-Za-z0-9]+$/.test(f.path)) continue;
    out.push({ time: f.time, tiles: `${RAINVIEWER_HOST}${f.path}/256/{z}/{x}/{y}/2/1_1.png` });
  }
  return out.slice(-max);
}

/** NASA GIBS true-color tiles for the previous UTC day (each day's mosaic
 *  is published after the fact). */
export function gibsSatelliteUrl(now: Date): string {
  const d = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
}

type FlightFC = GeoJSON.FeatureCollection<GeoJSON.Point> & { generated_at?: number };

/** Move each airborne flight along its heading at its ground speed for the
 *  time since the data was generated, so dots glide between updates.
 *  Data older than `staleSec` isn't moved (an old snapshot would be wrong),
 *  and extrapolation is capped at `maxSec`. */
export function deadReckon(fc: FlightFC, nowSec: number, maxSec = 60, staleSec = 120): FlightFC {
  const gen = fc.generated_at;
  if (typeof gen !== "number") return fc;
  const age = nowSec - gen;
  if (age <= 0 || age > staleSec) return fc;
  const dt = Math.min(age, maxSec);
  return {
    ...fc,
    features: fc.features.map((f) => {
      const p = f.properties ?? {};
      const kt = p.speed_kt, track = p.track;
      if (p.on_ground === true || typeof kt !== "number" || typeof track !== "number") return f;
      const [lon, lat] = f.geometry.coordinates as [number, number];
      const distDeg = (kt * dt) / 3600 / 60; // nautical miles -> degrees of latitude
      const rad = (track * Math.PI) / 180;
      const dLat = distDeg * Math.cos(rad);
      const dLon = (distDeg * Math.sin(rad)) / Math.max(0.01, Math.cos((lat * Math.PI) / 180));
      return { ...f, geometry: { type: "Point", coordinates: [lon + dLon, lat + dLat] } };
    }),
  };
}

/** The relay's grid: 3-degree cells named by their south-west corner. */
export const FLIGHT_CELL_DEG = 3;

/** Grid cells ("lat_lon" corners) covering a [w, s, e, n] view, limited to the
 *  relay's US grid. Empty when the view needs more than `max` cells (too far
 *  out to poll every cell). */
export function flightCells([w, s, e, n]: [number, number, number, number], max = 6): string[] {
  const d = FLIGHT_CELL_DEG;
  const cells: string[] = [];
  for (let lat = Math.floor(s / d) * d; lat < n; lat += d) {
    for (let lon = Math.floor(w / d) * d; lon < e; lon += d) {
      if (lat >= 15 && lat <= 69 && lon >= -180 && lon <= -66) cells.push(`${lat}_${lon}`);
      if (cells.length > max) return [];
    }
  }
  return cells;
}

/** One collection from overlapping cell results: each aircraft once (by
 *  callsign, or by position for the few without one). */
export function mergeFlights(fcs: FlightFC[]): FlightFC {
  const seen = new Set<string>();
  const features: FlightFC["features"] = [];
  for (const fc of fcs) {
    for (const f of fc.features) {
      const cs = typeof f.properties?.callsign === "string" ? f.properties.callsign : "";
      const [lon, lat] = f.geometry.coordinates as [number, number];
      const key = cs || `${lon.toFixed(3)},${lat.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      features.push(f);
    }
  }
  return { type: "FeatureCollection", features };
}
