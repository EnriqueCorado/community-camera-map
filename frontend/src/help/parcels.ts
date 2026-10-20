// "When was my building built?" — looks a Stanislaus County address up in the
// baked assessor files (backend/scripts/build_parcel_years.py). The address is
// parsed and matched here in the browser; the only request is for the static
// file of streets that start with the same two letters, from this site.

/** [direction, suffix, city, first year built, last year built, use class] */
export type ParcelRow = [string, string, string, number, number, ParcelUse];
export type ParcelUse = "sfr" | "condo" | "mobile" | "duplex" | "multi" | "";
type Shard = Record<string, Record<string, ParcelRow[]>>;

export interface ParsedAddress {
  number: string;
  dir: string;
  street: string;
  suffix: string;
  city: string;
}

export interface ParcelMatch {
  number: string;
  dir: string;
  street: string;
  suffix: string;
  city: string;
  minYear: number;
  maxYear: number;
  use: ParcelUse;
}

const DIRS: Record<string, string> = { N: "N", S: "S", E: "E", W: "W", NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W" };

const SUFFIXES: Record<string, string> = {
  ST: "ST", STREET: "ST", AVE: "AVE", AV: "AVE", AVENUE: "AVE", DR: "DR", DRIVE: "DR", RD: "RD", ROAD: "RD",
  LN: "LN", LANE: "LN", CT: "CT", COURT: "CT", WAY: "WAY", WY: "WAY", BLVD: "BLVD", BOULEVARD: "BLVD",
  PL: "PL", PLACE: "PL", CIR: "CIR", CIRCLE: "CIR", PKWY: "PKWY", PARKWAY: "PKWY", HWY: "HWY", HIGHWAY: "HWY",
  TER: "TER", TERRACE: "TER", TRL: "TRL", TRAIL: "TRL", LOOP: "LOOP", SQ: "SQ", PLZ: "PLZ", ALY: "ALY",
};

/** Places in the county's roll (situs cities), longest first so "CROWS LANDING" wins over a street word. */
export const CITIES = [
  "CROWS LANDING", "KNIGHTS FERRY", "VALLEY HOME", "LA GRANGE", "MODESTO", "TURLOCK", "CERES", "OAKDALE",
  "PATTERSON", "RIVERBANK", "SALIDA", "NEWMAN", "HUGHSON", "WATERFORD", "DENAIR", "KEYES", "EMPIRE", "HICKMAN",
  "GRAYSON", "WESTLEY", "VERNALIS", "EUGENE", "FARMINGTON", "WARNERVILLE",
];

const UNIT = /\s(#|APT|UNIT|SPC|SPACE|STE|SUITE|NO)\b.*$/;

/** "1119 E. Linwood Ave, Turlock CA 95380" -> parts; null if there's no house number + street. */
export function parseAddress(input: string): ParsedAddress | null {
  const up = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents typed on phone keyboards
    .toUpperCase()
    .replace(/[.]/g, "")
    .replace(/\bCALIFORNIA\b|\bCA\b|\b\d{5}(-\d{4})?\b/g, " ");
  const [streetPart = "", ...rest] = up.split(",");
  let city = rest.join(" ").replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  let s = streetPart.replace(/[^A-Z0-9# ]/g, " ").replace(/\s+/g, " ").trim();
  if (!city) {
    // No comma: a trailing place name is the city ("123 Main St Apt 4 Modesto").
    const found = CITIES.find((c) => s.endsWith(` ${c}`));
    if (found) {
      city = found;
      s = s.slice(0, -found.length).trim();
    }
  }
  s = ` ${s}`.replace(UNIT, "").trim();
  const tokens = s.split(" ").filter(Boolean);
  const number = tokens.shift() ?? "";
  if (!/^\d+[A-Z]?$/.test(number)) return null;
  let dir = "";
  if (tokens.length > 1 && DIRS[tokens[0]!]) dir = DIRS[tokens.shift()!]!;
  let suffix = "";
  if (tokens.length > 1 && SUFFIXES[tokens[tokens.length - 1]!]) suffix = SUFFIXES[tokens.pop()!]!;
  const street = tokens.join(" ");
  if (!street) return null;
  city = CITIES.find((c) => city === c || city.startsWith(`${c} `)) ?? city;
  return { number, dir, street, suffix, city };
}

/** The file a street lives in (must match shard_key() in the bake script). */
export function shardKey(street: string): string {
  return `${street.replace(/[^A-Z0-9]/g, "")}__`.slice(0, 2);
}

/** Rows for a parsed address. Direction, suffix and city narrow the match when
 *  given, but a missing one never hides the only candidate. */
export function matchParcel(shard: Shard, a: ParsedAddress): ParcelMatch[] {
  const rows = shard[a.street]?.[a.number] ?? [];
  const all = rows.map(([dir, suffix, city, minYear, maxYear, use]) => ({
    number: a.number,
    dir,
    street: a.street,
    suffix,
    city,
    minYear,
    maxYear,
    use,
  }));
  let out = all;
  for (const keep of [
    (m: ParcelMatch) => !a.city || m.city === a.city,
    (m: ParcelMatch) => !a.dir || !m.dir || m.dir === a.dir,
    (m: ParcelMatch) => !a.suffix || !m.suffix || m.suffix === a.suffix,
  ]) {
    const narrowed = out.filter(keep);
    if (narrowed.length) out = narrowed;
  }
  // A city that doesn't match at all means a different address.
  if (a.city && !out.some((m) => m.city === a.city)) return [];
  return out;
}

export type BuiltAge = "new" | "borderline" | "old" | "mixed";

/** Rent-cap view of the year(s) built: the cap skips housing whose certificate
 *  of occupancy is under 15 years old. Year-level data can't settle the
 *  boundary year itself, so that one is "borderline". */
export function builtAge(m: Pick<ParcelMatch, "minYear" | "maxYear">, todayYear: number): BuiltAge {
  const cutoff = todayYear - 15;
  if (m.minYear > cutoff) return "new";
  if (m.maxYear < cutoff) return "old";
  if (m.minYear < cutoff && m.maxYear > cutoff) return "mixed";
  return "borderline";
}

const cache = new Map<string, Promise<Shard>>();

/** Fetch one shard (cached for the page's life; a failure is retried next time). */
export function loadShard(key: string, base = "data/parcels"): Promise<Shard> {
  let p = cache.get(key);
  if (!p) {
    p = fetch(`${base}/${encodeURIComponent(key)}.json`).then((r) => {
      if (r.status === 404) return {};
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Shard>;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
