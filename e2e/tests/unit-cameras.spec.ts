// Unit tests for the nationwide camera list (no browser): the compact baked
// format round-trips, every shipped camera URL passes the viewer's allowlist
// (backend/frontend lists in sync), and search finds cameras by state.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeCameraUrl, CAMERA_MEDIA_HOSTS } from "../../frontend/src/popup-logic";
import { matchCamera, withDefaults, type RawCameraList } from "../../frontend/src/camera-data";

const baked = (): RawCameraList =>
  JSON.parse(readFileSync(join(__dirname, "../../frontend/public/data/cameras.json"), "utf8"));

test.describe("safeCameraUrl", () => {
  test("accepts https on listed hosts and their subdomains", () => {
    for (const u of [
      "https://cwwp2.dot.ca.gov/data/d10/cctv/image/x/x.jpg",
      "https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_209/playlist.m3u8",
      "https://www.ndbc.noaa.gov/buoycam.php?station=41004",
    ]) {
      expect(safeCameraUrl(u), u).toBe(u);
    }
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
