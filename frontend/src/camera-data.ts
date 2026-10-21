// Camera list decoding. Pure (no DOM / env), so it's unit-tested directly
// (e2e/tests/unit-cameras.spec.ts).
import type { Camera, CameraList, SourceInfo } from "./types";

const CAMERA_DEFAULTS: Omit<Camera, "id" | "name" | "latitude" | "longitude"> = {
  county: "",
  nearby_place: "",
  route: "",
  direction: "",
  snapshot_url: "",
  stream_url: "",
  in_service: true,
  source: "caltrans",
  state: "CA",
  views: [],
};

export type RawCameraList = Partial<CameraList> & {
  cameras: Record<string, unknown>[];
  /** Baked file only: short key -> field name. */
  keys?: Record<string, string>;
};

/** The baked cameras.json uses short keys and leaves out default / empty
 *  fields to stay small (backend scripts/bake.py `compact_camera`): expand the
 *  keys and put the defaults back. A camera's state defaults to its source's.
 *  The API's full-form list passes through unchanged. */
export function withDefaults(list: RawCameraList): CameraList {
  const keys = list.keys ?? {};
  const sources = list.sources ?? {};
  return {
    count: list.count ?? list.cameras.length,
    source: list.source ?? "",
    sources,
    cameras: list.cameras.map((raw) => {
      const c: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) c[keys[k] ?? k] = v;
      const source = typeof c.source === "string" ? c.source : CAMERA_DEFAULTS.source;
      return {
        ...CAMERA_DEFAULTS,
        views: [] as string[], // a fresh array per camera, never the shared default
        state: sources[source]?.state ?? CAMERA_DEFAULTS.state,
        ...c,
      } as unknown as Camera;
    }),
  };
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** What search looks at (and the list shows): a Camera, or a row of the
 *  static site's search file. */
export type CameraText = Pick<Camera, "name" | "nearby_place" | "county" | "route" | "state">;

// Lower-cased search text per camera, built once (~27k cameras are filtered on
// every keystroke, in both the list and the map).
const haystacks = new WeakMap<CameraText, string>();
function haystack(c: CameraText): string {
  let h = haystacks.get(c);
  if (h === undefined) {
    h = `${c.name} ${c.nearby_place} ${c.county} ${c.route} ${c.state} ${STATE_NAMES[c.state] ?? ""}`.toLowerCase();
    haystacks.set(c, h);
  }
  return h;
}

/** Shared camera text filter (place, county, road, state) — used by the map and
 *  the Sidebar list. `q` is already lower-cased. */
export function matchCamera(c: CameraText, q: string): boolean {
  if (!q) return true;
  return haystack(c).includes(q);
}

// ---------------------------------------------------------------------------
// The static site's split camera list (backend app/cameras/static_split.py):
//   cameras/index.json        every camera's position, grouped by grid cell
//   cameras/search.json       the searchable text of every camera
//   cameras/cells/<key>.json  one cell's full records
// Point i, search row i and record (i - start of its cell) of its cell file are
// the same camera; `v` names that layout. Mirrors static_split.py.

export interface RawCameraIndex {
  v: string;
  count: number;
  source?: string;
  sources?: Record<string, SourceInfo>;
  agencies?: number;
  grid: number;
  q: number;
  cells: string[];
  /** Cameras per cell. */
  n: number[];
  /** Quantized coordinates (degrees * q), delta-coded: each from the
   *  previous point of its cell, the first from the cell's south-west corner. */
  lat: number[];
  lon: number[];
}

export interface RawCameraSearch {
  v: string;
  strings: string[];
  n: string[];
  /** Indexes into strings (0 = ""). */
  c: number[];
  p: number[];
  r: number[];
  st: number[];
}

export interface RawCameraCell {
  v: string;
  cell: string;
  keys?: Record<string, string>;
  cameras: Record<string, unknown>[];
}

/** Every camera's position (enough to cluster them all) plus the list's header. */
export interface CameraPoints {
  v: string;
  count: number;
  source: string;
  sources: Record<string, SourceInfo>;
  agencies: number;
  grid: number;
  q: number;
  cells: string[];
  cellIndex: Map<string, number>;
  /** start[c] = first point of cell c; start[cells.length] = count. */
  start: Int32Array;
  cellOf: Int32Array;
  /** Quantized (degrees * q), and in degrees. */
  qlat: Int32Array;
  qlon: Int32Array;
  lat: Float64Array;
  lon: Float64Array;
}

/** floor(x*q + 0.5): bit-for-bit the backend's quantize(). */
export function quantize(x: number, q: number): number {
  return Math.floor(x * q + 0.5);
}

export function cellKey(lat: number, lon: number, grid: number): string {
  return `${Math.floor(lat / grid)}_${Math.floor(lon / grid)}`;
}

/** The cells (that have cameras) overlapping a lon/lat box. */
export function cellsInBox(points: CameraPoints, west: number, south: number, east: number, north: number): string[] {
  const g = points.grid;
  const out: string[] = [];
  for (let a = Math.floor(south / g); a <= Math.floor(north / g); a++) {
    for (let o = Math.floor(west / g); o <= Math.floor(east / g); o++) {
      const k = `${a}_${o}`;
      if (points.cellIndex.has(k)) out.push(k);
    }
  }
  return out;
}

export function decodeIndex(raw: RawCameraIndex): CameraPoints {
  const count = raw.lat.length;
  const start = new Int32Array(raw.cells.length + 1);
  const cellOf = new Int32Array(count);
  const qlat = new Int32Array(count);
  const qlon = new Int32Array(count);
  const lat = new Float64Array(count);
  const lon = new Float64Array(count);
  let i = 0;
  raw.cells.forEach((key, c) => {
    start[c] = i;
    const [ka, ko] = key.split("_").map(Number) as [number, number];
    let a = ka * raw.grid * raw.q;
    let o = ko * raw.grid * raw.q;
    const n = raw.n[c] ?? 0;
    for (let j = 0; j < n && i < count; j++, i++) {
      a += raw.lat[i] ?? 0;
      o += raw.lon[i] ?? 0;
      cellOf[i] = c;
      qlat[i] = a;
      qlon[i] = o;
      lat[i] = a / raw.q;
      lon[i] = o / raw.q;
    }
  });
  start[raw.cells.length] = i;
  const sources = raw.sources ?? {};
  return {
    v: raw.v,
    count: i,
    source: raw.source ?? "",
    sources,
    agencies: raw.agencies ?? Object.keys(sources).length,
    grid: raw.grid,
    q: raw.q,
    cells: raw.cells,
    cellIndex: new Map(raw.cells.map((k, c) => [k, c])),
    start,
    cellOf,
    qlat,
    qlon,
    lat,
    lon,
  };
}

export function decodeSearch(raw: RawCameraSearch): CameraText[] {
  const s = (ix: number | undefined) => raw.strings[ix ?? 0] ?? "";
  return raw.n.map((name, i) => ({
    name,
    county: s(raw.c[i]),
    nearby_place: s(raw.p[i]),
    route: s(raw.r[i]),
    state: s(raw.st[i]),
  }));
}

export function decodeCell(raw: RawCameraCell, sources: Record<string, SourceInfo>): Camera[] {
  return withDefaults({ sources, keys: raw.keys, cameras: raw.cameras } as RawCameraList).cameras;
}

/** Which cell a point is in, where in that cell's file, and its position. */
export interface PointRef {
  key: string;
  k: number;
  qlat: number;
  qlon: number;
}

export function pointRef(points: CameraPoints, i: number): PointRef | null {
  if (!Number.isInteger(i) || i < 0 || i >= points.count) return null;
  const c = points.cellOf[i]!;
  return { key: points.cells[c]!, k: i - points.start[c]!, qlat: points.qlat[i]!, qlon: points.qlon[i]! };
}

/** The camera at a point in its cell's records: record k when it's there
 *  (same layout), else the first one at that position (a newer bake). */
export function findInCell(cams: Camera[], ref: PointRef, q: number): Camera | null {
  const at = (c: Camera | undefined): c is Camera =>
    !!c && quantize(c.latitude, q) === ref.qlat && quantize(c.longitude, q) === ref.qlon;
  const c = cams[ref.k];
  if (at(c)) return c;
  return cams.find(at) ?? null;
}

/** The point index for a ref (from these or older points): the same slot if
 *  it's still at that position, else the first point there; null if none. */
export function pointAt(points: CameraPoints, ref: PointRef): number | null {
  const c = points.cellIndex.get(ref.key);
  if (c === undefined) return null;
  const at = (i: number) => points.qlat[i] === ref.qlat && points.qlon[i] === ref.qlon;
  const s = points.start[c]!;
  const e = points.start[c + 1]!;
  if (s + ref.k < e && at(s + ref.k)) return s + ref.k;
  for (let i = s; i < e; i++) if (at(i)) return i;
  return null;
}

/** A camera's point index (-1 if it isn't one of the points). */
export function pointIndexOf(points: CameraPoints, cam: Pick<Camera, "latitude" | "longitude">): number {
  const c = points.cellIndex.get(cellKey(cam.latitude, cam.longitude, points.grid));
  if (c === undefined) return -1;
  const qa = quantize(cam.latitude, points.q);
  const qo = quantize(cam.longitude, points.q);
  for (let i = points.start[c]!; i < points.start[c + 1]!; i++) {
    if (points.qlat[i] === qa && points.qlon[i] === qo) return i;
  }
  return -1;
}

/** The API's one-file list in the split form (same grid and order as the
 *  backend's split), so both modes share one code path. */
export function splitList(
  list: CameraList,
  grid = 2,
  q = 10_000,
): { points: CameraPoints; search: CameraText[]; cells: Map<string, Camera[]> } {
  const groups = new Map<string, Camera[]>();
  for (const c of list.cameras) {
    const k = cellKey(c.latitude, c.longitude, grid);
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  const keys = [...groups.keys()].sort();
  const cells = new Map<string, Camera[]>();
  const raw: RawCameraIndex = {
    v: "api",
    count: list.cameras.length,
    source: list.source,
    sources: list.sources,
    agencies: new Set(list.cameras.map((c) => c.source)).size,
    grid,
    q,
    cells: keys,
    n: [],
    lat: [],
    lon: [],
  };
  const search: CameraText[] = [];
  for (const key of keys) {
    const cams = (groups.get(key) ?? [])
      .map((c) => ({ c, a: quantize(c.latitude, q), o: quantize(c.longitude, q) }))
      .sort((x, y) => x.a - y.a || x.o - y.o || (x.c.id < y.c.id ? -1 : x.c.id > y.c.id ? 1 : 0));
    const [ka, ko] = key.split("_").map(Number) as [number, number];
    let a = ka * grid * q;
    let o = ko * grid * q;
    for (const x of cams) {
      raw.lat.push(x.a - a);
      raw.lon.push(x.o - o);
      a = x.a;
      o = x.o;
      search.push(x.c);
    }
    raw.n.push(cams.length);
    cells.set(key, cams.map((x) => x.c));
  }
  return { points: decodeIndex(raw), search, cells };
}
