// Pure transform (no Worker APIs): adsb.fi / readsb JSON -> privacy-filtered
// GeoJSON. Mirrors backend/app/layers/transforms.py `adsb_flights` — keep them
// in sync (both are unit-tested).

const PIA = 4; // readsb dbFlags: privacy ICAO address
const LADD = 8; // FAA "Limiting Aircraft Data Displayed" opt-out

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const round = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

export interface FlightFC {
  type: "FeatureCollection";
  generated_at?: number;
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }[];
}

/** Keep only what an aircraft broadcasts about its flight; owner/registration
 *  are dropped, and aircraft whose owners opted out of tracking are excluded. */
export function adsbFlights(payload: unknown): FlightFC {
  const p = (payload ?? {}) as { aircraft?: unknown; now?: unknown };
  const rows = Array.isArray(p.aircraft) ? p.aircraft : [];
  const features: FlightFC["features"] = [];
  for (const a of rows as Record<string, unknown>[]) {
    if (!a || typeof a !== "object") continue;
    const flags = a.dbFlags;
    if (typeof flags === "number" && flags & (PIA | LADD)) continue;
    const lat = num(a.lat), lon = num(a.lon);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const onGround = a.alt_baro === "ground";
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5] },
      properties: {
        callsign: String(a.flight ?? "").trim(),
        type: String(a.desc ?? a.t ?? "").trim(),
        alt_ft: onGround ? 0 : round(a.alt_baro),
        on_ground: onGround,
        speed_kt: round(a.gs),
        track: round(a.track),
      },
    });
  }
  const now = num(p.now);
  return { type: "FeatureCollection", ...(now != null ? { generated_at: now } : {}), features };
}
