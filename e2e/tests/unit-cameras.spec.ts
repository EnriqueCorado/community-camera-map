// Unit tests for the nationwide camera list (no browser): the compact baked
// format round-trips, every shipped camera URL passes the viewer's allowlist
// (backend/frontend lists in sync), and search finds cameras by state.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeCameraUrl, CAMERA_MEDIA_HOSTS } from "../../frontend/src/popup-logic";
import {
  cellKey,
  cellsInBox,
  decodeCell,
  decodeIndex,
  decodeSearch,
  matchCamera,
  pointAt,
  pointIndexOf,
  pointRef,
  quantize,
  splitList,
  withDefaults,
  type RawCameraCell,
  type RawCameraIndex,
  type RawCameraList,
  type RawCameraSearch,
} from "../../frontend/src/camera-data";
import { CameraStore, type CameraFiles } from "../../frontend/src/camera-store";
import type { Camera } from "../../frontend/src/types";

const DATA = join(__dirname, "../../frontend/public/data/cameras");
const read = <T>(path: string): T => JSON.parse(readFileSync(join(DATA, path), "utf8")) as T;
const bakedIndex = () => read<RawCameraIndex>("index.json");
const bakedSearch = () => read<RawCameraSearch>("search.json");
const bakedCell = (key: string) => read<RawCameraCell>(`cells/${key}.json`);

/** The baked split list joined back into the one-file form (index order). */
const baked = (): RawCameraList => {
  const index = bakedIndex();
  const cells = index.cells.map(bakedCell);
  return { count: index.count, source: index.source, sources: index.sources, keys: cells[0]?.keys, cameras: cells.flatMap((c) => c.cameras) };
};

/** Baked files served from disk, with a log of what was asked for. */
function diskFiles(log: string[] = []): CameraFiles {
  return {
    index: async (fresh) => (log.push(`index${fresh ? "!" : ""}`), bakedIndex()),
    search: async (_v, fresh) => (log.push(`search${fresh ? "!" : ""}`), bakedSearch()),
    cell: async (key, _v, fresh) => (log.push(`cell ${key}${fresh ? "!" : ""}`), bakedCell(key)),
  };
}

test.describe("safeCameraUrl", () => {
  test("accepts https on listed hosts and their subdomains", () => {
    for (const u of [
      "https://cwwp2.dot.ca.gov/data/d10/cctv/image/x/x.jpg",
      "https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_209/playlist.m3u8",
      "https://www.ndbc.noaa.gov/buoycam.php?station=41004",
      // State ArcGIS layers added 2026-10-21 (TripCheck names arrive percent-encoded).
      "https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/ictv29hd.jpeg",
      "https://images-dis.divas.cloud/DGI/chan-9422_h.jpg",
      "https://tripcheck.com/RoadCams/cams/OR99W%20at%20Durham%20Rd_pid2107.JPG",
    ]) {
      expect(safeCameraUrl(u), u).toBe(u);
    }
    // CDOT's cameras were removed (its only keyless feed is a test server).
    expect(safeCameraUrl("https://cocam.carsprogram.org/Douglas/x.jpg")).toBe("");
    // Default port normalizes away.
    expect(safeCameraUrl("https://video.deldot.gov:443/live/K.stream/playlist.m3u8")).toBe(
      "https://video.deldot.gov/live/K.stream/playlist.m3u8",
    );
  });

  test("rejects http, other hosts, suffix spoofs, userinfo, ports and junk", () => {
    for (const u of [
      "http://wzmedia.dot.ca.gov/x.m3u8",
      "https://evil.example/x.jpg",
      "https://images.wsdot.wa.gov.evil.example/x.jpg",
      "https://evilsha.maryland.gov.example/x",
      "https://u:p@images.wsdot.wa.gov/x.jpg",
      "https://images.wsdot.wa.gov:8443/x.jpg",
      "javascript:alert(1)",
      "",
      42,
      null,
    ]) {
      expect(safeCameraUrl(u), String(u)).toBe("");
    }
  });
});

test("withDefaults expands short keys and fills defaults (state from the source)", () => {
  const list = withDefaults({
    count: 3,
    sources: {
      caltrans: { name: "Caltrans", state: "CA", url: "", credit: "Caltrans", license: "", license_url: "" },
      ndbc: { name: "NOAA", state: "", url: "", credit: "NOAA", license: "", license_url: "" },
      il: { name: "Illinois DOT", state: "IL", url: "", credit: "Illinois DOT", license: "CC BY-SA 2.0", license_url: "" },
    },
    keys: { n: "name", s: "snapshot_url", src: "source", st: "state", w: "views" },
    cameras: [
      { id: "d10-a", n: "SB SR-99", latitude: 37.6, longitude: -121, s: "https://cwwp2.dot.ca.gov/a.jpg" },
      { id: "il-1", n: "Hillside", latitude: 41.8, longitude: -87.9, src: "il" },
      { id: "ndbc-46026", n: "Buoy", latitude: 37.7, longitude: -122.8, src: "ndbc", st: "CA", w: ["https://x/1.jpg"] },
    ],
  });
  const [ca, il, buoy] = list.cameras;
  expect(ca).toMatchObject({ source: "caltrans", state: "CA", stream_url: "", county: "", views: [], in_service: true });
  expect(ca.snapshot_url).toBe("https://cwwp2.dot.ca.gov/a.jpg");
  expect(il).toMatchObject({ name: "Hillside", source: "il", state: "IL" });
  expect(buoy).toMatchObject({ state: "CA", views: ["https://x/1.jpg"] });
  // A full-form API list passes through.
  const full = withDefaults({ cameras: [{ ...ca }] });
  expect(full.cameras[0]).toEqual(ca);
});

test("the baked camera list: nationwide, every media URL allowlisted, ids unique", () => {
  const list = withDefaults(baked());
  expect(list.cameras.length).toBe(list.count);
  expect(list.cameras.length).toBeGreaterThan(10_000);
  const ids = new Set(list.cameras.map((c) => c.id));
  expect(ids.size).toBe(list.cameras.length);
  const states = new Set(list.cameras.map((c) => c.state));
  for (const st of ["CA", "IL", "WA", "MO", "MD"]) expect(states.has(st), st).toBe(true);
  // Collect problems and assert once (15k+ expect() calls take a minute).
  const bad: string[] = [];
  for (const c of list.cameras) {
    if (!list.sources[c.source]) bad.push(`${c.id}: unknown source ${c.source}`);
    if (!c.snapshot_url && !c.stream_url) bad.push(`${c.id}: no media`);
    for (const u of [c.snapshot_url, c.stream_url, ...c.views]) {
      if (u && !u.startsWith("http://") && !safeCameraUrl(u)) bad.push(`${c.id}: ${u}`);
    }
    if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) bad.push(`${c.id}: coords`);
  }
  expect(bad).toEqual([]);
  // Illinois data is CC BY-SA: the credit must name Illinois DOT and the license.
  expect(list.sources.il.credit).toMatch(/Illinois DOT/);
  expect(list.sources.il.license).toBe("CC BY-SA 2.0");
  // Only Caltrans may carry a legacy http URL (the viewer drops it); new sources never do.
  const http = list.cameras.filter((c) => c.source !== "caltrans" && /^http:/.test(c.snapshot_url + c.stream_url));
  expect(http).toEqual([]);
  expect(CAMERA_MEDIA_HOSTS.length).toBeGreaterThan(10);
});

test("search matches by state name and code, and is fast on the full list", () => {
  const { cameras } = withDefaults(baked());
  const il = cameras.filter((c) => matchCamera(c, "illinois"));
  expect(il.length).toBeGreaterThan(1000);
  expect(il.every((c) => c.state === "IL")).toBe(true);
  expect(cameras.filter((c) => matchCamera(c, "modesto")).length).toBeGreaterThan(0);
  const t0 = performance.now();
  for (const q of ["i", "i-", "i-5", "i-55", "sr-99"]) cameras.filter((c) => matchCamera(c, q));
  expect(performance.now() - t0).toBeLessThan(500);
});

test.describe("split camera list (static site)", () => {
  test("cell keys and quantizing match the backend (floor, not truncation)", () => {
    expect(cellKey(37.66, -120.99, 2)).toBe("18_-61");
    expect(cellKey(-0.5, -2, 2)).toBe("-1_-1");
    expect(cellKey(38, -122, 2)).toBe("19_-61");
    expect(quantize(37.12345, 1e4)).toBe(371235);
    expect(quantize(-120.00005, 1e4)).toBe(-1200000);
  });

  test("the baked index, search rows and cells line up, camera for camera", () => {
    const index = bakedIndex();
    const points = decodeIndex(index);
    const rows = decodeSearch(bakedSearch());
    expect(points.count).toBe(index.count);
    expect(rows.length).toBe(points.count);
    expect(bakedSearch().v).toBe(index.v);
    expect(points.agencies).toBe(Object.keys(points.sources).length);
    const bad: string[] = [];
    index.cells.forEach((key, c) => {
      const cell = bakedCell(key);
      if (cell.v !== index.v) bad.push(`${key}: v ${cell.v}`);
      const cams = decodeCell(cell, points.sources);
      if (cams.length !== points.start[c + 1]! - points.start[c]!) bad.push(`${key}: count`);
      cams.forEach((cam, k) => {
        const i = points.start[c]! + k;
        if (cellKey(cam.latitude, cam.longitude, points.grid) !== key) bad.push(`${cam.id}: cell`);
        if (points.qlat[i] !== quantize(cam.latitude, points.q) || points.qlon[i] !== quantize(cam.longitude, points.q))
          bad.push(`${cam.id}: position`);
        const r = rows[i]!;
        if (r.name !== cam.name || r.route !== cam.route || r.county !== cam.county || r.nearby_place !== cam.nearby_place || r.state !== cam.state)
          bad.push(`${cam.id}: search row`);
        if (pointIndexOf(points, cam) < 0) bad.push(`${cam.id}: indexOf`);
      });
    });
    expect(bad).toEqual([]);
    // Positions only: the first-load file carries no names, ids or URLs.
    // (Apart from the agency credits.)
    const blob = JSON.stringify({ ...index, sources: {} });
    expect(blob).not.toMatch(/https?:|Briggsmore|"id"/);
    expect(blob.length).toBeLessThan(400_000); // vs ~6 MB for the old one-file list
  });

  test("search over the rows finds cameras nationwide", () => {
    const rows = decodeSearch(bakedSearch());
    expect(rows.filter((r) => matchCamera(r, "illinois")).length).toBeGreaterThan(1000);
    expect(rows.filter((r) => matchCamera(r, "briggsmore")).length).toBeGreaterThan(0);
  });

  test("cellsInBox lists only cells that have cameras", () => {
    const points = decodeIndex(bakedIndex());
    // Modesto's view.
    expect(cellsInBox(points, -121.2, 37.5, -120.8, 37.8)).toEqual(["18_-61"]);
    expect(cellsInBox(points, -140, 0, -139, 1)).toEqual([]); // open Pacific
  });

  test("splitList (dev API) orders cameras like the backend split", () => {
    const list = withDefaults(baked());
    const { points, search, cells } = splitList({ ...list, cameras: [...list.cameras].reverse() });
    const disk = decodeIndex(bakedIndex());
    expect([...points.qlat]).toEqual([...disk.qlat]);
    expect([...points.qlon]).toEqual([...disk.qlon]);
    expect(points.cells).toEqual(disk.cells);
    expect(points.agencies).toBe(disk.agencies);
    expect(search.map((r) => r.name)).toEqual(decodeSearch(bakedSearch()).map((r) => r.name));
    expect(cells.get("18_-61")!.map((c) => c.id)).toEqual(decodeCell(bakedCell("18_-61"), disk.sources).map((c) => c.id));
  });

  test("CameraStore loads the index first, the rest on demand", async () => {
    const log: string[] = [];
    const store = await CameraStore.fromFiles(diskFiles(log));
    expect(log).toEqual(["index"]);
    expect(store.search).toBeNull();
    const modesto = store.points.start[store.points.cellIndex.get("18_-61")!]!;
    const cam = await store.camera(modesto);
    expect(log).toEqual(["index", "cell 18_-61"]);
    expect(cam?.state).toBe("CA");
    expect(store.indexOf(cam!)).toBe(modesto);
    await store.camera(modesto + 1); // same cell: cached
    store.prefetch(-121.2, 37.5, -120.8, 37.8);
    expect(log).toEqual(["index", "cell 18_-61"]);
    const rows = await store.loadSearch();
    expect(rows.length).toBe(store.points.count);
    expect(store.search).toBe(rows);
    expect(await store.camera(-1)).toBeNull();
    expect(await store.camera(store.points.count)).toBeNull();
  });

  test("CameraStore survives a redeploy between files (never mixes up cameras)", async () => {
    // The browser first gets an older index (one camera fewer in Modesto's cell);
    // the cell and search files then come from the newer bake.
    const index = bakedIndex();
    const c = index.cells.indexOf("18_-61");
    const start = index.n.slice(0, c).reduce((a, b) => a + b, 0);
    const old: RawCameraIndex = {
      ...index,
      v: "older",
      n: index.n.map((n, j) => (j === c ? n - 1 : n)),
      lat: index.lat.filter((_, i) => i !== start),
      lon: index.lon.filter((_, i) => i !== start),
    };
    // Dropping the cell's first point: the next one's delta now counts from the corner.
    old.lat[start] = index.lat[start]! + index.lat[start + 1]!;
    old.lon[start] = index.lon[start]! + index.lon[start + 1]!;
    const log: string[] = [];
    const files = diskFiles(log);
    let served = 0;
    const store = await CameraStore.fromFiles({ ...files, index: async (fresh) => (served++ ? files.index(fresh) : (log.push("index"), old)) });
    expect(store.points.v).toBe("older");
    let changes = 0;
    store.subscribe(() => changes++);
    // Point `start` of the old layout is the new layout's start + 1.
    const want = decodeCell(bakedCell("18_-61"), store.points.sources)[1]!;
    const ref = pointRef(store.points, start)!; // what App keeps for a selection
    const got: Camera | null = await store.camera(start);
    expect(pointAt(store.points, ref)).toBe(start + 1); // the same camera in the new layout
    expect(got?.id).toBe(want.id);
    expect(log).toEqual(["index", "cell 18_-61", "index!"]); // a fresh index was fetched
    expect(store.points.v).toBe(index.v);
    expect(store.points.count).toBe(index.count);
    expect(changes).toBe(1);
    expect(store.indexOf(got!)).toBe(start + 1);
    expect((await store.loadSearch()).length).toBe(index.count);
  });

  test("CameraStore refuses a search file that never matches the index", async () => {
    const files = diskFiles();
    const store = await CameraStore.fromFiles({ ...files, search: async () => ({ ...bakedSearch(), v: "other" }) });
    await expect(store.loadSearch()).rejects.toThrow(/another bake/);
    expect(store.search).toBeNull();
  });

  test("CameraStore.fromList (dev API) needs no files", async () => {
    const list = withDefaults(baked());
    const store = CameraStore.fromList(list);
    expect(store.search?.length).toBe(list.count);
    const all = await store.all();
    expect(all.length).toBe(list.count);
    expect(new Set(all.map((c) => c.id)).size).toBe(list.count);
    expect((await store.camera(0))?.id).toBe(all[0]!.id);
  });
});
