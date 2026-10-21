// "When was my building built?" — looks a Stanislaus County address up in the
// baked assessor files (backend/scripts/build_parcel_years.py). The address is
// parsed and matched here in the browser; the only request is for the static
// file of streets that start with the same two letters, from this site.

/** [direction, suffix, city, first year built, last year built, use class] */
export type ParcelRow = [string, string, string, number, number, ParcelUse];
export type ParcelUse = "sfr" | "condo" | "mobile" | "duplex" | "multi" | "";
export type Shard = Record<string, Record<string, ParcelRow[]>>;

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
  PL: "PL", PLACE: "PL", CIR: "CIR", CR: "CIR", CIRCLE: "CIR", PKWY: "PKWY", PARKWAY: "PKWY", HWY: "HWY", HIGHWAY: "HWY",
  TER: "TER", TERR: "TER", TERRACE: "TER", TRL: "TRL", TRAIL: "TRL", LOOP: "LOOP", SQ: "SQ", PLZ: "PLZ", ALY: "ALY",
};

/** Places in the county's roll (situs cities), longest first so "CROWS LANDING" wins over a street word. */
export const CITIES = [
  "CROWS LANDING", "KNIGHTS FERRY", "VALLEY HOME", "LA GRANGE", "MODESTO", "TURLOCK", "CERES", "OAKDALE",
  "PATTERSON", "RIVERBANK", "SALIDA", "NEWMAN", "HUGHSON", "WATERFORD", "DENAIR", "KEYES", "EMPIRE", "HICKMAN",
  "GRAYSON", "WESTLEY", "VERNALIS", "EUGENE", "FARMINGTON", "WARNERVILLE",
];

// Unit designators: "Apt 4", "# 4", "#4", "Spc 12" (and everything after).
const UNIT = /(\s#|\s(APT|UNIT|SPC|SPACE|STE|SUITE|NO)\b).*$/;
const UNIT_SEGMENT = /^(#|APT|UNIT|SPC|SPACE|STE|SUITE)\b/;

/** "1119 E. Linwood Ave, Turlock CA 95380" -> the ways to read it, most
 *  likely first (["W", "MAIN"] and ["WEST MAIN"] are both real streets);
 *  empty if there's no house number and street. */
export function parseAddress(input: string): ParsedAddress[] {
  const up = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents typed on phone keyboards
    .toUpperCase()
    .replace(/[.]/g, "");
  // The house number comes first and can itself be 5 digits (rural
  // addresses), so "CA" and ZIP codes are stripped only after it.
  const lead = /^\s*\S+/.exec(up)?.[0] ?? "";
  const tail = up.slice(lead.length).replace(/\bCALIFORNIA\b|\bCA\b|\b\d{5}(-\d{4})?\b/g, " ");
  const [streetPart = "", ...rest] = (lead + tail).split(",").filter((seg) => !UNIT_SEGMENT.test(seg.trim()));
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
  if (!/^\d+[A-Z]?$/.test(number)) return [];
  // Suffix first, then direction, and each only if a street name is left:
  // "N St" is the street "N", "North St" is the street "NORTH".
  let suffix = "";
  if (tokens.length > 1 && SUFFIXES[tokens[tokens.length - 1]!]) suffix = SUFFIXES[tokens.pop()!]!;
  if (!tokens.length) return [];
  city = CITIES.find((c) => city === c || city.startsWith(`${c} `)) ?? city;
  const whole = { number, dir: "", street: tokens.join(" "), suffix, city };
  const first = tokens[0]!;
  if (tokens.length > 1 && DIRS[first]) {
    return [{ ...whole, dir: DIRS[first]!, street: tokens.slice(1).join(" ") }, whole];
  }
  return [whole];
}

/** The file a street lives in (must match shard_key() in the bake script). */
export function shardKey(street: string): string {
  return `${street.replace(/[^A-Z0-9]/g, "")}__`.slice(0, 2);
}

/** Rows for a parsed address. A direction, suffix or city that was typed
 *  must agree with the record when the record has one (1030 W Main is not
 *  1030 E Main); one that wasn't typed matches anything. */
export function matchParcel(shard: Shard, a: ParsedAddress): ParcelMatch[] {
  const agrees = (typed: string, have: string) => !typed || !have || typed === have;
  return (shard[a.street]?.[a.number] ?? [])
    .map(([dir, suffix, city, minYear, maxYear, use]) => ({ number: a.number, dir, street: a.street, suffix, city, minYear, maxYear, use }))
    .filter((m) => (!a.city || m.city === a.city) && agrees(a.dir, m.dir) && agrees(a.suffix, m.suffix));
}

/** Look an address up, trying each reading until one matches. */
export async function lookupAddress(input: string, load: (key: string) => Promise<Shard> = loadShard): Promise<ParcelMatch[] | null> {
  const readings = parseAddress(input);
  if (!readings.length) return null;
  for (const a of readings) {
    const found = matchParcel(await load(shardKey(a.street)), a);
    if (found.length) return found;
  }
  return [];
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
