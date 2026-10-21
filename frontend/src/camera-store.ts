// The camera list, loaded in pieces (static site) or all at once (dev API).
// No DOM / env, and the files come in through `CameraFiles`, so it's
// unit-tested with the baked files and simulated deploys
// (e2e/tests/unit-cameras.spec.ts).
//
// Static site: the small index (every camera's position) loads first, so the
// map can cluster all of them; the search file loads when a search starts; a
// cell's full records load when one of its cameras is opened or the cell is in
// view up close. The site is redeployed hourly with a fresh list, so a session
// can be served files from two bakes: the files carry their layout version `v`,
// a mismatch refetches the index (past the browser cache) and swaps it in, and
// a camera is always looked up by its position, never trusted by offset alone.
import type { Camera, CameraList } from "./types";
import {
  cellsInBox,
  decodeCell,
  decodeIndex,
  decodeSearch,
  findInCell,
  pointIndexOf,
  pointRef,
  splitList,
  type CameraPoints,
  type CameraText,
  type RawCameraCell,
  type RawCameraIndex,
  type RawCameraSearch,
} from "./camera-data";

/** Where the static site's camera files come from. `fresh` asks to skip the
 *  browser cache; `v` is the layout the caller expects (a cache key). */
export interface CameraFiles {
  index(fresh: boolean): Promise<RawCameraIndex>;
  search(v: string, fresh: boolean): Promise<RawCameraSearch>;
  cell(key: string, v: string, fresh: boolean): Promise<RawCameraCell>;
}

/** Cells prefetched for one view at most (a wide view is clusters anyway). */
const MAX_PREFETCH = 6;

export class CameraStore {
  points: CameraPoints;
  private files: CameraFiles | null;
  private searchRows: CameraText[] | null = null;
  private searchP: Promise<CameraText[]> | null = null;
  private cellsP = new Map<string, Promise<Camera[]>>();
  private refreshP: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  private constructor(points: CameraPoints, files: CameraFiles | null) {
    this.points = points;
    this.files = files;
  }

  /** Static site: just the index now; the rest on demand. */
  static async fromFiles(files: CameraFiles): Promise<CameraStore> {
    return new CameraStore(decodeIndex(await files.index(false)), files);
  }

  /** Dev API: the whole list is already here. */
  static fromList(list: CameraList): CameraStore {
    const { points, search, cells } = splitList(list);
    const store = new CameraStore(points, null);
    store.searchRows = search;
    store.searchP = Promise.resolve(search);
    for (const [k, cams] of cells) store.cellsP.set(k, Promise.resolve(cams));
    return store;
  }

  /** Called when the points or the search rows change. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  /** The search rows (point order), if loaded. */
  get search(): CameraText[] | null {
    return this.searchRows;
  }

  /** Re-read the index past the browser cache; swap it in if it changed. */
  private refreshIndex(): Promise<void> {
    if (!this.files) return Promise.resolve();
    const files = this.files;
    this.refreshP ??= files
      .index(true)
      .then((raw) => {
        if (raw.v === this.points.v) return;
        this.points = decodeIndex(raw);
        this.searchRows = null;
        this.searchP = null;
        this.cellsP.clear();
        this.notify();
      })
      .finally(() => {
        this.refreshP = null;
      });
    return this.refreshP;
  }

  /** Fetch one file of the current layout: if it's from another bake, refresh
   *  the index and, if they still differ, the file once more (past the cache). */
  private async current<T extends { v: string }>(get: (v: string, fresh: boolean) => Promise<T>): Promise<T> {
    let raw = await get(this.points.v, false);
    if (raw.v === this.points.v) return raw;
    await this.refreshIndex();
    if (raw.v !== this.points.v) raw = await get(this.points.v, true);
    return raw;
  }

  /** All search rows: loads the search file the first time. A file that still
   *  doesn't match the index after a refresh is refused (rows would point at
   *  the wrong cameras). */
  loadSearch(): Promise<CameraText[]> {
    if (this.searchP) return this.searchP;
    const files = this.files;
    if (!files) return Promise.resolve(this.searchRows ?? []);
    const p = this.current((v, fresh) => files.search(v, fresh)).then((raw) => {
      if (raw.v !== this.points.v) throw new Error("camera search file is from another bake");
      const rows = decodeSearch(raw);
      if (rows.length !== this.points.count) throw new Error("camera search file doesn't match the index");
      this.searchRows = rows;
      this.searchP = Promise.resolve(rows);
      this.notify();
      return rows;
    });
    this.searchP = p;
    p.catch(() => {
      if (this.searchP === p) this.searchP = null; // let a later search retry
    });
    return p;
  }

  /** One cell's full records. */
  cell(key: string): Promise<Camera[]> {
    const have = this.cellsP.get(key);
    if (have) return have;
    const files = this.files;
    if (!files) return Promise.resolve([]);
    const p: Promise<Camera[]> = this.current((v, fresh) => files.cell(key, v, fresh)).then((raw) => {
      // Cache only a cell of the current layout (also one fetched across an
      // index refresh, which empties the cache); callers still get this one
      // (findInCell matches by position).
      if (raw.v === this.points.v) {
        if (!this.cellsP.has(key)) this.cellsP.set(key, p);
      } else if (this.cellsP.get(key) === p) this.cellsP.delete(key);
      return decodeCell(raw, this.points.sources);
    });
    this.cellsP.set(key, p);
    p.catch(() => {
      if (this.cellsP.get(key) === p) this.cellsP.delete(key);
    });
    return p;
  }

  /** The full camera at point i (of the points as they are now). */
  async camera(i: number): Promise<Camera | null> {
    const ref = pointRef(this.points, i);
    if (!ref) return null;
    const q = this.points.q;
    return findInCell(await this.cell(ref.key), ref, q);
  }

  /** Point index of a camera in the current points (-1 if gone). */
  indexOf(cam: Pick<Camera, "latitude" | "longitude">): number {
    return pointIndexOf(this.points, cam);
  }

  /** Warm the cells in a view (a few at most), so a click opens at once. */
  prefetch(west: number, south: number, east: number, north: number): void {
    const keys = cellsInBox(this.points, west, south, east, north);
    if (keys.length > MAX_PREFETCH) return;
    for (const k of keys) this.cell(k).catch(() => {});
  }

  /** Every camera (fetches every cell: the export button). Starts over once
   *  if a newer index arrives meanwhile, so the export is one bake. */
  async all(): Promise<Camera[]> {
    for (let attempt = 0; ; attempt++) {
      const points = this.points;
      const keys = points.cells;
      const out: Camera[][] = new Array(keys.length);
      let next = 0;
      const worker = async () => {
        while (next < keys.length) {
          const c = next++;
          out[c] = await this.cell(keys[c]!);
        }
      };
      try {
        await Promise.all(Array.from({ length: Math.min(8, keys.length) }, worker));
      } catch (err) {
        if (this.points === points || attempt > 0) throw err; // e.g. a cell gone in the new bake
        continue;
      }
      if (this.points === points || attempt > 0) return out.flat();
    }
  }
}
