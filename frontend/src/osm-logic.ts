// Pure helpers for nationwide OpenStreetMap place layers (no fetching, so
// they're unit-tested). See osm-sources.ts. Mirrors backend osm_points.

type Tags = Record<string, string>;

/** Overpass tag filters this site uses: ["k"="v"] and ["k"~"regex"]. */
const FILTER = /\["([^"\]]+)"(=|~)"([^"\]]*)"\]/g;

/** A JS twin of an Overpass selector like '["amenity"="clinic"]', so one
 *  union query can be split back into layers by tag. Unknown syntax -> null. */
export function selectorMatcher(selector: string): ((t: Tags) => boolean) | null {
  const parts: [string, string, string][] = [];
  let consumed = 0;
  for (const m of selector.matchAll(FILTER)) {
    parts.push([m[1]!, m[2]!, m[3]!]);
    consumed += m[0].length;
  }
  if (!parts.length || consumed !== selector.length) return null; // not a plain filter list
  const tests = parts.map(([k, op, v]) => {
    if (op === "=") return (t: Tags) => t[k] === v;
    let re: RegExp;
    try {
      re = new RegExp(v);
    } catch {
      return () => false;
    }
    return (t: Tags) => typeof t[k] === "string" && re.test(t[k]!);
  });
  return (t) => tests.every((f) => f(t));
}

/** One Overpass union query for several selectors in a bbox [w, s, e, n]. */
export function overpassQuery(selectors: string[], [w, s, e, n]: [number, number, number, number], limit = 3000): string {
  const box = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:25];(${selectors.map((sel) => `nwr${sel}${box};`).join("")});out center tags ${limit};`;
}

interface OsmElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Tags;
}

/** Overpass elements -> points for one layer (same properties as the baked
 *  files), kept inside the bbox and capped. */
export function osmPoints(
  elements: unknown,
  keep: (t: Tags) => boolean,
  [w, s, e, n]: [number, number, number, number],
  max = 2000,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const el of Array.isArray(elements) ? (elements as OsmElement[]) : []) {
    if (features.length >= max) break;
    if (!el || typeof el !== "object") continue;
    const tags = el.tags && typeof el.tags === "object" ? el.tags : {};
    if (!keep(tags)) continue;
    const lat = typeof el.lat === "number" ? el.lat : el.center?.lat;
    const lon = typeof el.lon === "number" ? el.lon : el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number" || lat < s || lat > n || lon < w || lon > e) continue;
    const sockets = Object.entries(tags)
      .filter(([k, v]) => /^socket:[a-z0-9_]+$/.test(k) && v !== "no")
      .map(([k]) => k.slice(7).replace(/_/g, " "))
      .sort();
    const cap = Number(tags.capacity);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        name: tags.name || tags.operator || tags.brand || "",
        access: tags.access ?? "",
        hours: tags.opening_hours ?? "",
        indoor: tags.indoor === "yes" || tags.location === "indoor",
        fee: tags.fee ?? "",
        wheelchair: tags.wheelchair ?? "",
        capacity: Number.isFinite(cap) ? cap : null,
        sockets: sockets.join(", "),
        page:
          ["node", "way", "relation"].includes(String(el.type)) && Number.isInteger(el.id)
            ? `https://www.openstreetmap.org/${el.type}/${el.id}`
            : "",
      },
    });
  }
  return { type: "FeatureCollection", features };
}
