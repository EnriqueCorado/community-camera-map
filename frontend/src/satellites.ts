// Satellites overhead: CelesTrak orbital elements (OMM JSON) propagated to
// "now" with SGP4 (satellite.js), entirely in the browser.
import { degreesLat, degreesLong, eciToGeodetic, gstime, json2satrec, propagate, type SatRec } from "satellite.js";

export const CELESTRAK_VISUAL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json";

export interface Sat {
  name: string;
  noradId: number;
  rec: SatRec;
}

/** CelesTrak GP JSON -> propagatable satellites (bad records skipped). */
export function parseCelestrak(json: unknown, max = 300): Sat[] {
  if (!Array.isArray(json)) return [];
  const out: Sat[] = [];
  for (const o of json.slice(0, max) as Record<string, unknown>[]) {
    try {
      const rec = json2satrec(o as Parameters<typeof json2satrec>[0]);
      if (rec.error) continue;
      out.push({ name: String(o.OBJECT_NAME ?? "").trim(), noradId: Number(o.NORAD_CAT_ID), rec });
    } catch {
      /* malformed element set */
    }
  }
  return out;
}

/** Positions of `sats` at `when` as GeoJSON points (alt in km). */
export function satellitePositions(sats: Sat[], when: Date): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const gmst = gstime(when);
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const s of sats) {
    const pv = propagate(s.rec, when);
    const pos = pv && typeof pv.position === "object" ? pv.position : null;
    if (!pos) continue;
    const geo = eciToGeodetic(pos, gmst);
    const lat = degreesLat(geo.latitude), lon = degreesLong(geo.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(geo.height)) continue;
    const v = pv && typeof pv.velocity === "object" ? pv.velocity : null;
    const speed = v ? Math.hypot(v.x, v.y, v.z) * 3600 : null; // km/s -> km/h
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        name: s.name,
        norad: s.noradId,
        kind: "satellite",
        alt_km: Math.round(geo.height),
        speed_kmh: speed != null ? Math.round(speed) : null,
        label: s.name,
      },
    });
  }
  return { type: "FeatureCollection", features };
}
