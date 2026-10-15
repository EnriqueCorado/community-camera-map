// Pure helpers for the "What's near an address?" report (no fetching, so
// they're unit-tested in isolation). See near-me.ts.

export type LonLat = [number, number];

/** Great-circle distance in meters. */
export function distanceM([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The point feature nearest `at` (optionally filtered), with its distance. */
export function nearest(
  fc: GeoJSON.FeatureCollection | null | undefined,
  at: LonLat,
  keep: (p: Record<string, unknown>) => boolean = () => true,
): { props: Record<string, unknown>; meters: number } | null {
  let best: { props: Record<string, unknown>; meters: number } | null = null;
  for (const f of fc?.features ?? []) {
    if (f.geometry?.type !== "Point") continue;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    if (!keep(props)) continue;
    const meters = distanceM(at, f.geometry.coordinates as LonLat);
    if (!best || meters < best.meters) best = { props, meters };
  }
  return best;
}

/** Ray casting: is `pt` inside this ring? */
function inRing([x, y]: LonLat, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is `pt` inside a Polygon / MultiPolygon (holes respected)? */
export function inPolygon(pt: LonLat, g: GeoJSON.Geometry | null | undefined): boolean {
  const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
  return polys.some(([outer, ...holes]) => !!outer && inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
}

/** Properties of the first polygon feature containing `pt`. */
export function featureAt(fc: GeoJSON.FeatureCollection | null | undefined, pt: LonLat): Record<string, unknown> | null {
  const f = fc?.features.find((x) => inPolygon(pt, x.geometry));
  return f ? ((f.properties ?? {}) as Record<string, unknown>) : null;
}

/** FEMA flood zone -> risk level, or null when FEMA has no risk to report
 *  (open water, areas left out of the study). A/V zones are Special Flood
 *  Hazard Areas (1%+ annual chance); shaded X (0.2%, levee-protected, shallow
 *  1%) and B are moderate; unshaded X and C minimal; D unstudied. */
export function floodRisk(zone: string, subtype: string, sfha: string): "high" | "moderate" | "minimal" | "unknown" | null {
  const z = zone.trim().toUpperCase();
  if (sfha === "T" || /^(A|AE|AH|AO|AR|A99|V|VE|A\d{1,2}|V\d{1,2})$/.test(z) || z.startsWith("AR/")) return "high";
  if (z === "X" && /0\.2|SHADED|500|LEVEE|1 PCT/i.test(subtype)) return "moderate";
  if (z === "B") return "moderate";
  if (z === "X" || z === "C") return "minimal";
  if (z === "D") return "unknown";
  return null;
}

/** "1.2 mi" / "800 ft" (US) or "1.9 km" / "250 m". */
export function formatDistance(m: number, locale: string): string {
  const us = /-US$/i.test(locale) || locale === "en";
  const n = (v: number, d: number) => v.toLocaleString(locale, { maximumFractionDigits: d });
  if (us) return m < 300 ? `${n(Math.round(m * 3.281 / 10) * 10, 0)} ft` : `${n(m / 1609.34, 1)} mi`;
  return m < 1000 ? `${n(Math.round(m / 10) * 10, 0)} m` : `${n(m / 1000, 1)} km`;
}
