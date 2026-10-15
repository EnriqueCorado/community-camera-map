// Browser-live layers, with every external API stubbed so tests are deterministic.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ISS_OMM = {"OBJECT_NAME": "ISS (ZARYA)", "OBJECT_ID": "1998-067A", "EPOCH": "2026-10-13T19:43:22.113408", "MEAN_MOTION": 15.48855783, "ECCENTRICITY": 0.00067109, "INCLINATION": 51.6325, "RA_OF_ASC_NODE": 73.0089, "ARG_OF_PERICENTER": 259.3258, "MEAN_ANOMALY": 100.6975, "EPHEMERIS_TYPE": 0, "CLASSIFICATION_TYPE": "U", "NORAD_CAT_ID": 25544, "ELEMENT_SET_NO": 999, "REV_AT_EPOCH": 59014, "BSTAR": 0.00012830727, "MEAN_MOTION_DOT": 6.592e-05, "MEAN_MOTION_DDOT": 0};

async function stubAll(page: Page) {
  const json = (body: unknown) => ({ contentType: "application/json", body: JSON.stringify(body) });
  await page.route("https://api.wheretheiss.at/**", (r) =>
    r.fulfill(json({ latitude: 37.6, longitude: -120.9, altitude: 418.3, velocity: 27600, visibility: "daylight" })));
  await page.route("https://services.swpc.noaa.gov/**", (r) => r.fulfill(json([{ kp_index: 3, estimated_kp: 3.33 }])));
  await page.route("https://celestrak.org/**", (r) => r.fulfill(json([ISS_OMM])));
  await page.route("https://api-v3.amtraker.com/**", (r) => r.fulfill(json({ "San Joaquins": [
    { routeName: "San Joaquins", trainNum: 715, lat: 37.64, lon: -120.99, velocity: 49.6, heading: "NW",
      origName: "Bakersfield", destName: "Oakland", eventName: "Modesto", trainTimely: "On Time" }] })));
  await page.route("https://api.inaturalist.org/**", (r) => r.fulfill(json({ results: [
    { location: "37.64,-120.99", observed_on: "2026-10-01", uri: "https://www.inaturalist.org/observations/1",
      taxon: { preferred_common_name: "Western Fence Lizard", name: "Sceloporus occidentalis" },
      photos: [{ url: "https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg", license_code: "cc-by", attribution: "(c) someone, some rights reserved (CC BY)" }] }] })));
  await page.route("https://*.wikipedia.org/**", (r) => r.fulfill(json({ query: { geosearch: [{ title: "Gallo Center for the Arts", lat: 37.64, lon: -120.99, dist: 120 }] } })));
  await page.route("https://api.open-meteo.com/**", (r) => r.fulfill(json([
    { latitude: 37.64, longitude: -120.99, current: { temperature_2m: 78.4, wind_speed_10m: 3.2, wind_direction_10m: 315, relative_humidity_2m: 22 } }])));
  await page.route("https://overpass-api.de/**", (r) => r.fulfill(json({ elements: [
    { type: "node", id: 42, lat: 37.64, lon: -120.99, tags: { emergency: "defibrillator", name: "City Hall AED", access: "yes", indoor: "yes" } }] })));
}

async function ready(page: Page) {
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(1200);
}

async function clickLayer(page: Page, layer: string) {
  await expect
    .poll(() => page.evaluate((l) => { const m = (window as any).__map; return m.getLayer(l) ? m.queryRenderedFeatures({ layers: [l] }).length : 0; }, layer), { timeout: 20000 })
    .toBeGreaterThan(0);
  const pt = await page.evaluate((l) => { const m = (window as any).__map; const f = m.queryRenderedFeatures({ layers: [l] })[0]; return m.project(f.geometry.coordinates); }, layer);
  await page.locator("canvas.maplibregl-canvas").click({ position: { x: pt.x, y: pt.y } });
  const popup = page.locator(".maplibregl-popup");
  await expect(popup).toBeVisible();
  return popup;
}

const CASES: [string, string, RegExp[]][] = [
  ["iss", "v=-120.9,37.6,6", [/Space station/i, /418 km/, /In sunlight/, /Kp 3\.3/, /Not visible this far south/, /When can I see it/]],
  ["satellites", "v=0,0,1", [/Satellites overhead/i, /ISS \(ZARYA\)/, /Orbit details/]],
  ["trains", "v=-120.99,37.64,10", [/San Joaquins 715/, /Bakersfield → Oakland/, /Modesto/, /50 mph/, /On Time/]],
  ["wildlife", "v=-120.99,37.64,12", [/Western Fence Lizard/, /Sceloporus occidentalis/, /CC BY/, /View on iNaturalist/]],
  ["wikipedia", "v=-120.99,37.64,12", [/Gallo Center for the Arts/, /Read on Wikipedia/]],
  ["weather-now", "v=-120.99,37.64,8", [/78°F/, /3 mph from the NW/, /22%/]],
  ["aed", "v=-120.99,37.64,14", [/City Hall AED/, /Defibrillator/, /Indoors/, /View on OpenStreetMap/]],
];

for (const [name, view, expected] of CASES) {
  test(`live layer renders and explains itself: ${name}`, async ({ page }) => {
    await stubAll(page);
    await page.goto(`/#ov=${name}&${view}`);
    await ready(page);
    const popup = await clickLayer(page, `ov-${name}-circle`);
    for (const re of expected) await expect(popup).toContainText(re);
    // Every outbound link is https and opens safely.
    for (const a of await popup.locator("a").all()) {
      await expect(a).toHaveAttribute("href", /^https:\/\//);
      await expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
}

test("live popups pass axe (wildlife photo + credit)", async ({ page }) => {
  await stubAll(page);
  await page.goto("/#ov=wildlife&v=-120.99,37.64,12");
  await ready(page);
  await clickLayer(page, "ov-wildlife-circle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).include(".maplibregl-popup").analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("the ISS keeps moving: it refreshes every few seconds", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await stubAll(page);
  await page.route("https://api.wheretheiss.at/**", (r) => {
    calls++;
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ latitude: 37.6, longitude: -120.9 + calls, altitude: 418, velocity: 27600, visibility: "eclipsed" }) });
  });
  await page.goto("/#ov=iss&v=-120.9,37.6,4");
  await ready(page);
  await expect.poll(() => calls).toBeGreaterThanOrEqual(1);
  const before = calls;
  await page.clock.fastForward(11_000);
  await expect.poll(() => calls).toBeGreaterThan(before);
});

test("view-based layers re-query when the map moves, and wait for zoom", async ({ page }) => {
  const urls: string[] = [];
  await stubAll(page);
  page.on("request", (r) => { if (r.url().includes("wikipedia.org")) urls.push(r.url()); });
  await page.goto("/#ov=wikipedia&v=-120.99,37.64,6"); // below minZoom 10
  await ready(page);
  await expect(page.locator(".layerrow", { hasText: "Wikipedia places" })).toContainText("zoom in to see");
  await page.waitForTimeout(1500);
  expect(urls).toHaveLength(0);
  await page.evaluate(() => (window as any).__map.jumpTo({ center: [-120.99, 37.64], zoom: 12 }));
  await expect.poll(() => urls.length).toBeGreaterThanOrEqual(1);
  // Zoomed in enough: the hint goes away.
  await expect(page.locator(".layerrow", { hasText: "Wikipedia places" })).not.toContainText("zoom in to see");
  const n = urls.length;
  await page.evaluate(() => (window as any).__map.jumpTo({ center: [-120.85123456, 37.77654321], zoom: 12 })); // Oakdale
  await expect.poll(() => urls.length).toBeGreaterThan(n);
  // Location sent to the third party is rounded (~100 m), not the exact view.
  expect(decodeURIComponent(urls.at(-1)!)).toContain("gscoord=37.777|-120.851");
});

test("switching language reloads language-dependent layers", async ({ page }) => {
  const hosts: string[] = [];
  await stubAll(page);
  page.on("request", (r) => { if (r.url().includes("wikipedia.org/w/api.php")) hosts.push(new URL(r.url()).host); });
  await page.goto("/#ov=wikipedia&v=-120.99,37.64,12");
  await ready(page);
  await expect.poll(() => hosts.length).toBeGreaterThanOrEqual(1);
  expect(hosts.at(-1)).toBe("en.wikipedia.org");
  await page.getByRole("button", { name: "Ver en español" }).click();
  await expect.poll(() => hosts.at(-1)).toBe("es.wikipedia.org");
});

test("flight popups show the route for airline flights, never for private tail numbers", async ({ page }) => {
  const lookups: string[] = [];
  await page.route("**/api/layers/flights", (r) => r.fulfill({ contentType: "application/geo+json", body: JSON.stringify({ type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-121.0, 37.64] }, properties: { callsign: "UAL366", type: "BOEING 737", alt_ft: 30000, on_ground: false, speed_kt: 450, track: 90 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-120.9, 37.64] }, properties: { callsign: "N669TW", type: "C172", alt_ft: 3000, on_ground: false, speed_kt: 100, track: 90 } },
  ] }) }));
  await page.route("https://api.adsbdb.com/**", (r) => {
    lookups.push(r.request().url());
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ response: { flightroute: {
      airline: { name: "United Airlines" }, origin: { municipality: "Denver", iata_code: "DEN" }, destination: { municipality: "Austin", iata_code: "AUS" } } } }) });
  });
  await page.goto("/#ov=flights&v=-120.95,37.64,11");
  await ready(page);
  const at = (lon: number) => page.evaluate((x) => (window as any).__map.project([x, 37.64]), lon);
  let p = await at(-121.0);
  await page.locator("canvas.maplibregl-canvas").click({ position: { x: p.x, y: p.y } });
  const popup = page.locator(".maplibregl-popup");
  await expect(popup).toContainText("Denver (DEN) → Austin (AUS)");
  await expect(popup).toContainText("United Airlines");
  await page.keyboard.press("Escape");
  p = await at(-120.9);
  await page.locator("canvas.maplibregl-canvas").click({ position: { x: p.x, y: p.y } });
  await expect(popup).toContainText("N669TW");
  await page.waitForTimeout(800);
  expect(lookups.some((u) => u.includes("N669TW"))).toBe(false);
  expect(lookups).toHaveLength(1);
});
