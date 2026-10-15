// End-to-end QA against LIVE data: every layer is switched on from the sidebar,
// must populate, survive a pan, open a clean popup, and switch off — with a
// clean console throughout — plus a set of edge cases. Screenshots of every
// step land in $QA_SHOTS for visual review.
//
// Opt-in (live upstreams are slow/variable):  QA=1 npx playwright test qa-every-layer
// Runs against the dev servers (the map handle `window.__map` is dev-only).
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

test.skip(!process.env.QA, "live-data QA: run with QA=1");
test.describe.configure({ retries: 1 }); // live third-party data: one retry for upstream hiccups

const BASE = process.env.QA_BASE ?? "http://localhost:5173";
const SHOTS = process.env.QA_SHOTS ?? join(__dirname, "..", "test-results", "qa-shots");
mkdirSync(SHOTS, { recursive: true });

const API = process.env.QA_API ?? "http://127.0.0.1:8000";
/** The live layer catalog (no shell: execFile with an argument list). */
function catalogOf(): { name: string; title: string; available: boolean }[] {
  if (!process.env.QA) return []; // collected on every run: don't touch the API unless QA is on
  const list = JSON.parse(execFileSync("curl", ["-s", "--max-time", "10", `${API}/api/layers`]).toString() || "[]");
  if (!list.length) throw new Error(`QA: empty layer catalog from ${API} — is the backend running?`);
  return list;
}
/** A layer's sidebar row, matched on its exact title. */
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rowOf = (page: Page, title: string) =>
  page.locator(".layerrow").filter({ has: page.locator("label > span:last-child", { hasText: new RegExp(`^${esc(title)}( [—·].*)?$`) }) });

const MODESTO = "-120.997,37.639";
// Where each layer has data, and how it renders. Default: county view, vector.
const VIEW: Record<string, string> = {
  // statewide
  wildfire: "-119.5,37.5,5.5", "wildfire-perimeters": "-119.5,37.5,5.5", "fire-hotspots": "-119.5,37.5,5.5",
  "weather-alerts": "-119.5,37.5,5.5", quakes: "-119.5,37.5,5.5", "fire-cameras": "-120.6,37.6,7.5",
  "river-cameras": "-121.6,38.0,8", "road-weather": "-120.5,37.6,6.5", "chain-controls": "-120.0,38.3,7.5",
  "lane-closures": "-121.0,37.6,6.5", "message-signs": "-121.0,37.6,7", dams: "-120.5,37.6,7",
  satellites: "0,20,1", iss: "0,0,0.6", trains: "-121.0,37.0,6", "rain-radar": "-98,38,3.5", satellite: "-120.6,37.6,7",
  "windy-webcams": "-121.6,37.5,7.5", flights: "-121.0,37.6,8", "smoke-haze": "-120.6,37.7,7.5",
  "air-now": "-120.9,37.6,7", "weather-now": "-120.9,37.6,7", amtrak: "-120.9,37.6,8", airports: "-120.9,37.6,9",
  // close-in
  wildlife: `${MODESTO},12`, wikipedia: `${MODESTO},12`,
  aed: `${MODESTO},10.5`, "drinking-water": `${MODESTO},10.5`, restrooms: `${MODESTO},10.5`,
  "ev-chargers": `${MODESTO},10.5`, libraries: `${MODESTO},10.5`, playgrounds: `${MODESTO},10.5`,
  pharmacies: `${MODESTO},10.5`, "fire-stations": `${MODESTO},10.5`, "free-wifi": `${MODESTO},10.5`,
  "transit-stops": `${MODESTO},12`, "transit-routes": `${MODESTO},11`, schools: `${MODESTO},12`, parks: `${MODESTO},12`,
  hospitals: `${MODESTO},10`, "law-enforcement": `${MODESTO},10`, streamflow: `${MODESTO},9`,
  "food-banks": `${MODESTO},10.5`, clinics: `${MODESTO},10.5`, "community-centers": `${MODESTO},10.5`,
  "farmers-markets": `${MODESTO},10.5`, shelters: `${MODESTO},12`, "county-islands": `${MODESTO},11`,
};
const COUNTY = "-120.95,37.56,9.3";
const RASTER = new Set(["rain-radar", "satellite"]);
// Real data can legitimately be empty at a given moment.
const MAY_BE_EMPTY = new Set(["buses", "power-outages", "outage-areas", "weather-alerts", "wildfire-perimeters", "free-wifi", "lane-closures", "message-signs", "flights",
  "quakes", "farmers-markets", "food-banks", "community-centers", "aed"]);
// Console noise that isn't ours: basemap glyph/sprite fetches, fetches aborted
// on pan, and third-party HTTP errors (their failures are tracked by the layer
// checks themselves). Our own API errors are caught separately below.
const NOISE = /openfreemap|glyph|sprite|ERR_ABORTED|AbortError|Failed to load resource: net::ERR_|status of [45]\d\d/;

function trackErrors(page: Page, { apiErrorsExpected = false } = {}) {
  const errs: string[] = [];
  page.on("response", (r) => {
    if (apiErrorsExpected) return;
    // Any 4xx/5xx from OUR backend is a bug (except a keyless layer's 503).
    if (r.url().includes("/api/") && r.status() >= 400 && r.status() !== 503) {
      errs.push(`api ${r.status()}: ${r.url().slice(0, 120)}`);
    }
  });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !NOISE.test(m.text())) errs.push(`console: ${m.text().slice(0, 200)}`);
  });
  return errs;
}

async function boot(page: Page, hash: string) {
  await page.goto(`${BASE}/#cam=0&${hash}`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!(window as any).__map?.loaded()), { timeout: 30_000 }).toBe(true);
}

const mapLayers = (page: Page, name: string) =>
  page.evaluate((n) => {
    const m = (window as any).__map;
    if (!m?.getStyle()) return [];
    return m.getStyle().layers.map((l: any) => l.id).filter((id: string) => id.startsWith(`ov-${n}-`) || id === `ov-${n}`);
  }, name);

const rendered = (page: Page, name: string) =>
  page.evaluate((n) => {
    const m = (window as any).__map;
    if (!m?.getStyle()) return 0;
    const ids = m.getStyle().layers.map((l: any) => l.id).filter((id: string) => id.startsWith(`ov-${n}-`) && !id.endsWith("-label"));
    const vis = ids.filter((id: string) => m.getLayoutProperty(id, "visibility") !== "none");
    return vis.length ? m.queryRenderedFeatures({ layers: vis }).length : 0;
  }, name);

const visibleIds = (page: Page, name: string) =>
  page.evaluate((n) => {
    const m = (window as any).__map;
    if (!m?.getStyle()) return [];
    return m.getStyle().layers
      .map((l: any) => l.id)
      .filter((id: string) => (id.startsWith(`ov-${n}-`) || id.startsWith(`ov-${n}`)) && m.getLayoutProperty(id, "visibility") !== "none");
  }, name);

async function clickARenderedFeature(page: Page, name: string): Promise<boolean> {
  const pt = await page.evaluate((n) => {
    const m = (window as any).__map;
    const c = m.getCanvas();
    const ids = m.getStyle().layers.map((l: any) => l.id).filter((id: string) => id.startsWith(`ov-${n}-`) && !id.endsWith("-label"));
    for (const f of m.queryRenderedFeatures({ layers: ids })) {
      let xy;
      if (f.geometry.type === "Point") xy = m.project(f.geometry.coordinates);
      else if (f.geometry.type === "LineString") xy = m.project(f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)]);
      else continue; // polygons: clicked via scan below
      if (xy.x > 60 && xy.y > 60 && xy.x < c.clientWidth - 60 && xy.y < c.clientHeight - 60) return { x: xy.x, y: xy.y };
    }
    for (let y = 120; y < c.clientHeight - 80; y += 37)
      for (let x = 80; x < c.clientWidth - 80; x += 41)
        if (m.queryRenderedFeatures([x, y], { layers: ids }).length) return { x, y };
    return null;
  }, name);
  if (!pt) return false;
  await page.locator("canvas.maplibregl-canvas").click({ position: pt });
  return true;
}

// ---------------- Every layer ----------------

test.describe("every layer", () => {
  test.describe.configure({ mode: "parallel" });

  // The catalog drives the list, so new layers are QA'd automatically.
  for (const layer of catalogOf()) {
    if (layer.name === "alpr") continue; // ALPR has its own clustered layer + tests
    qaLayer(layer);
  }
});

function qaLayer(layer: { name: string; title: string; available: boolean }) {
    test(`QA: ${layer.name}`, async ({ page }) => {
      test.setTimeout(90_000);
      const errs = trackErrors(page);
      const view = VIEW[layer.name] ?? COUNTY;
      await boot(page, `v=${view}`);
      const toggle = rowOf(page, layer.title).locator("input").first();

      if (!layer.available) {
        await expect(toggle).toBeDisabled();
        await expect(rowOf(page, layer.title)).toContainText(/needs API key|unavailable/);
        return;
      }

      // 1) on -> populates
      await toggle.check();
      await expect(page).toHaveURL(new RegExp(`ov=[^&]*${layer.name}`));
      if (RASTER.has(layer.name)) {
        await expect.poll(async () => (await visibleIds(page, layer.name)).length, { timeout: 30_000 }).toBeGreaterThan(0);
        await page.waitForTimeout(2500); // let tiles paint for the screenshot
      } else if (MAY_BE_EMPTY.has(layer.name)) {
        await expect.poll(async () => (await mapLayers(page, layer.name)).length, { timeout: 45_000 }).toBeGreaterThan(0);
        await page.waitForTimeout(1500);
      } else {
        await expect.poll(() => rendered(page, layer.name), { timeout: 45_000 }).toBeGreaterThan(0);
      }
      const count = RASTER.has(layer.name) ? -1 : await rendered(page, layer.name);
      test.info().annotations.push({ type: "rendered", description: String(count) });
      await page.screenshot({ path: join(SHOTS, `${layer.name}-1-on.png`) });

      // 2) pan + zoom a little -> still there (and still on)
      await page.evaluate(() => {
        const m = (window as any).__map;
        m.panBy([140, 90], { animate: false });
        m.zoomTo(m.getZoom() + 0.4, { animate: false });
      });
      await page.waitForTimeout(2500);
      expect((await visibleIds(page, layer.name)).length, "layer stays visible after pan").toBeGreaterThan(0);
      if (!RASTER.has(layer.name) && !MAY_BE_EMPTY.has(layer.name)) {
        await expect.poll(() => rendered(page, layer.name), { timeout: 30_000 }).toBeGreaterThan(0);
      }
      await page.screenshot({ path: join(SHOTS, `${layer.name}-2-panned.png`) });

      // 3) popup on a real feature: readable, no junk values, closes with Escape
      if (!RASTER.has(layer.name) && (await rendered(page, layer.name)) > 0 && (await clickARenderedFeature(page, layer.name))) {
        const popup = page.locator(".maplibregl-popup");
        await expect(popup).toBeVisible();
        const text = await popup.innerText();
        expect(text, "popup has a title").toMatch(/\S/);
        expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/);
        await page.screenshot({ path: join(SHOTS, `${layer.name}-3-popup.png`) });
        await page.keyboard.press("Escape");
        await expect(popup).toHaveCount(0);
      }

      // 4) off -> gone
      await toggle.uncheck();
      await expect.poll(async () => (await visibleIds(page, layer.name)).length).toBe(0);
      await expect(page).not.toHaveURL(new RegExp(`ov=[^&]*\\b${layer.name}\\b`));

      expect(errs, errs.join("\n")).toEqual([]);
    });
}

// ---------------- Edge cases ----------------

const LIVE_HOSTS = /wheretheiss|celestrak|amtraker|inaturalist|wikipedia|open-meteo|overpass|rainviewer|nasa\.gov|adsbdb|swpc|availtec/;

test("edge: every layer on at once stays responsive and error-free", async ({ page }) => {
  test.setTimeout(150_000);
  const errs = trackErrors(page);
  const all = catalogOf()
    .filter((l) => l.available && l.name !== "alpr")
    .map((l) => l.name);
  await boot(page, `alpr=1&ov=${all.join("~")}&v=-120.997,37.639,12`);
  await page.waitForTimeout(15_000);
  await page.screenshot({ path: join(SHOTS, "edge-all-on.png") });
  // Still interactive: pan/zoom work and a UI click responds promptly.
  await page.evaluate(() => (window as any).__map.flyTo({ center: [-120.85, 37.77], zoom: 11, duration: 0 }));
  await page.waitForTimeout(2000);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Hide panel" }).click();
  expect(Date.now() - t0, "click handled promptly with every layer on").toBeLessThan(3000);
  await expect(page.getByRole("button", { name: "Layers & search" })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "edge-all-on-panned.png") });
  expect(errs, errs.join("\n")).toEqual([]);
});

test("edge: rapid toggling every layer doesn't break anything", async ({ page }) => {
  test.setTimeout(150_000);
  const errs = trackErrors(page);
  await boot(page, "v=-120.997,37.639,11");
  const toggles = page.locator(".layerrow input:not([disabled])");
  const n = await toggles.count();
  for (let i = 0; i < n; i++) {
    const t = toggles.nth(i);
    await t.click();
    await t.click();
    await t.click(); // ends ON
  }
  await page.waitForTimeout(5000);
  for (let i = 0; i < n; i++) await toggles.nth(i).click(); // all OFF
  await page.waitForTimeout(2000);
  const stillVisible = await page.evaluate(() => {
    const m = (window as any).__map;
    return m.getStyle().layers.filter((l: any) => l.id.startsWith("ov-") && m.getLayoutProperty(l.id, "visibility") !== "none").map((l: any) => l.id);
  });
  expect(stillVisible, "everything switched off is hidden").toEqual([]);
  expect(errs, errs.join("\n")).toEqual([]);
});

test("edge: every third-party source down — no crash, UI keeps working", async ({ page }) => {
  test.setTimeout(120_000);
  const errs = trackErrors(page, { apiErrorsExpected: true }); // we simulate the 502s
  await page.route(LIVE_HOSTS, (r) => r.abort("failed"));
  await page.route("**/api/layers/**", (r) => r.fulfill({ status: 502, body: "upstream down" }));
  await boot(page, "v=-120.997,37.639,12");
  for (const title of ["Space station (ISS)", "Satellites overhead", "Amtrak trains", "Wildlife sightings", "Wikipedia places",
    "Temperature & wind", "Air quality (live)", "Libraries", "Rain radar", "Zoning", "Flights overhead"]) {
    await rowOf(page, title).locator("input").first().check();
  }
  await page.waitForTimeout(6000);
  await page.evaluate(() => (window as any).__map.panBy([200, 0], { animate: false }));
  await page.waitForTimeout(2000);
  await expect(page.getByRole("button", { name: "Hide panel" })).toBeEnabled();
  await page.getByPlaceholder(/Filter cameras/i).fill("SR-99");
  await expect(page.locator(".camlist__item").first()).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "edge-all-sources-down.png") });
  expect(errs, errs.join("\n")).toEqual([]);
});

test("edge: language switch with live layers on (popups + reloads in Spanish)", async ({ page }) => {
  test.setTimeout(90_000);
  const errs = trackErrors(page);
  await boot(page, "ov=wikipedia~trains~weather-now&v=-120.997,37.639,12");
  await expect.poll(() => rendered(page, "wikipedia"), { timeout: 30_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Ver en español" }).click();
  await expect(rowOf(page, "Lugares en Wikipedia")).toBeVisible();
  await expect.poll(() => rendered(page, "wikipedia"), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => rendered(page, "weather-now"), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await clickARenderedFeature(page, "weather-now")).toBe(true);
  await expect(page.locator(".maplibregl-popup")).toContainText(/Viento|Humedad/);
  await page.screenshot({ path: join(SHOTS, "edge-spanish.png") });
  expect(errs, errs.join("\n")).toEqual([]);
});

test("edge: a shared link restores layers after reload; zoom extremes are safe", async ({ page }) => {
  test.setTimeout(90_000);
  const errs = trackErrors(page);
  await boot(page, "ov=zoning~parks~quakes~iss&v=-120.997,37.639,11");
  await page.reload();
  await expect.poll(() => rendered(page, "zoning"), { timeout: 30_000 }).toBeGreaterThan(0);
  for (const z of [0, 2, 18, 22]) {
    await page.evaluate((zz) => (window as any).__map.jumpTo({ zoom: zz }), z);
    await page.waitForTimeout(1200);
  }
  expect(errs, errs.join("\n")).toEqual([]);
});

test("edge: phone — toggling, populating and minimizing the panel", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errs = trackErrors(page);
  await boot(page, "v=-120.997,37.639,11");
  for (const title of ["Zoning", "Parks", "Temperature & wind"]) {
    await rowOf(page, title).locator("input").first().check();
  }
  await expect.poll(() => rendered(page, "parks"), { timeout: 30_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Hide panel" }).click();
  await expect.poll(() => rendered(page, "zoning"), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: join(SHOTS, "edge-phone.png") });
  expect(errs, errs.join("\n")).toEqual([]);
});

test("edge: the layer filter finds layers in both languages and handles no matches", async ({ page }) => {
  await boot(page, "v=-120.997,37.639,10");
  const filter = page.getByLabel("Filter layers by name");
  await filter.fill("fire");
  await expect(page.locator(".layerrow", { hasText: "Fire stations" })).toBeVisible();
  await expect(page.locator(".layerrow", { hasText: "Zoning" })).toHaveCount(0);
  await expect(page.locator(".layergroup__title", { hasText: "Fire & hazards" })).toBeVisible();
  await filter.fill("zzzz");
  await expect(page.getByText("No layers match.")).toBeVisible();
  await filter.fill("");
  await expect(page.locator(".layerrow", { hasText: "Zoning" })).toBeVisible();
  await page.getByRole("button", { name: "Ver en español" }).click();
  await page.getByLabel("Filtrar capas por nombre").fill("bomberos");
  await expect(page.locator(".layerrow", { hasText: "Estaciones de bomberos" })).toBeVisible();
});
