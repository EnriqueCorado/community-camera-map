import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

// Collect console errors + page errors so every test can assert the app stayed clean.
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Ignore noise we don't control: OSM tile rate-limits, demo glyph CDN, and
// Caltrans HLS streams that are intermittently down (video element errors).
const IGNORE = [
  /tile\.openstreetmap\.org/i,
  /demotiles\.maplibre\.org/i,
  /wzmedia\.dot\.ca\.gov/i,
  /Failed to load resource.*(429|503|502|404)/i,
  /manifestLoadError|bufferStalledError|fragLoadError/i,
];
const realErrors = (errs: string[]) => errs.filter((e) => !IGNORE.some((re) => re.test(e)));

async function waitForMap(page: Page) {
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  // The map signals load by adding sources; give clustering a beat.
  await page.waitForTimeout(1500);
}

test("loads with cameras and a clean console", async ({ page }) => {
  const errors = trackErrors(page);
  const camResp = page.waitForResponse((r) => r.url().includes("/api/cameras") && r.status() === 200);
  await page.goto("/");
  await camResp;
  await waitForMap(page);

  await expect(page.locator("h1")).toContainText(/California/i);
  await expect(page.locator(".sidebar__sub")).toContainText(/public Caltrans traffic cameras/i);
  expect(realErrors(errors), realErrors(errors).join("\n")).toEqual([]);
});

test("jump to Oakdale then Modesto keeps the map stable", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);
  for (const place of ["Oakdale", "Modesto", "All of California"]) {
    await page.getByRole("button", { name: place, exact: true }).click();
    await page.waitForTimeout(700);
  }
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  expect(realErrors(errors), realErrors(errors).join("\n")).toEqual([]);
});

test("search filters the list and shows the map-filter note; clearing restores", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);

  const search = page.getByPlaceholder(/Filter cameras/i);
  await search.fill("modesto");
  await expect(page.locator(".search-note")).toContainText(/Map shows matching cameras only/i);
  await expect(page.locator(".camlist__item").first()).toBeVisible();

  // Edge: gibberish yields an explicit empty state, not a crash.
  await search.fill("zzzzzznotacamera");
  await expect(page.locator(".camlist__empty")).toContainText(/No cameras match/i);

  await search.fill("");
  await expect(page.locator(".search-note")).toHaveCount(0);
  expect(realErrors(errors), realErrors(errors).join("\n")).toEqual([]);
});

test("clicking a searched camera opens the live detail drawer with a video", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);

  await page.getByPlaceholder(/Filter cameras/i).fill("Briggsmore");
  const first = page.locator(".camlist__item").first();
  await expect(first).toBeVisible();
  await first.click();

  await expect(page.locator(".detail")).toBeVisible();
  await expect(page.locator(".detail video.player")).toBeVisible();
  // Close it.
  await page.locator(".detail__close").click();
  await expect(page.locator(".detail")).toHaveCount(0);
  expect(realErrors(errors), realErrors(errors).join("\n")).toEqual([]);
});

test("ALPR layer loads on toggle and exposes vendor sub-filters", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);

  const alprResp = page.waitForResponse((r) => r.url().includes("/api/layers/alpr") && r.status() === 200);
  await page.getByText("License plate readers", { exact: true }).click();
  await alprResp;
  await expect(page.getByText("Flock", { exact: true })).toBeVisible();

  // Edge: untick a vendor, then toggle the whole layer off — no crash.
  await page.getByText("Flock", { exact: true }).click();
  await page.getByText("License plate readers", { exact: true }).click();
  await page.waitForTimeout(400);
  expect(realErrors(errors), realErrors(errors).join("\n")).toEqual([]);
});

const OVERLAYS = [
  "City limits",
  "General plan land use",
  "Zoning",
  "Annexations (growth)",
  "Parks",
  "Public schools",
  "Census (income)",
  "Wildfire incidents",
  "Weather alerts",
  "Earthquakes (24h)",
  "Hospitals",
  "Law enforcement",
  "FEMA flood zones",
  "Fire hazard severity",
  "Pollution burden",
  "River gauges",
  "Lane closures",
  "Highway message signs",
  "Transit routes",
  "Transit stops",
  "Supervisor districts",
  "ZIP codes",
  "Congressional districts",
  "Airports",
  "Amtrak stations",
  "Dams",
  "Wildfire cameras",
  "River cameras",
];

for (const label of OVERLAYS) {
  test(`overlay toggles cleanly: ${label}`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await waitForMap(page);

    const toggle = page.getByText(label, { exact: true });
    await expect(toggle).toBeVisible();
    // The layer's data request should succeed (census needs the key we set).
    const slug = {
      "City limits": "city-limits",
      "General plan land use": "general-plan",
      Zoning: "zoning",
      "Annexations (growth)": "annexations",
      Parks: "parks",
      "Public schools": "schools",
      "Census (income)": "census",
      "Wildfire incidents": "wildfire",
      "Weather alerts": "weather-alerts",
      "Earthquakes (24h)": "quakes",
      Hospitals: "hospitals",
      "Law enforcement": "law-enforcement",
      "FEMA flood zones": "flood",
      "Fire hazard severity": "fire-hazard",
      "Pollution burden": "enviroscreen",
      "River gauges": "streamflow",
      "Lane closures": "lane-closures",
      "Highway message signs": "message-signs",
      "Transit routes": "transit-routes",
      "Transit stops": "transit-stops",
      "Supervisor districts": "supervisor-districts",
      "ZIP codes": "zip-codes",
      "Congressional districts": "congressional-districts",
      Airports: "airports",
      "Amtrak stations": "amtrak",
      Dams: "dams",
      "Wildfire cameras": "fire-cameras",
      "River cameras": "river-cameras",
    }[label]!;

    const resp = page.waitForResponse(
      (r) => r.url().includes(`/api/layers/${slug}`),
      { timeout: 20000 },
    );
    await toggle.click();
    const r = await resp;
    expect(r.status(), `${slug} should return 200`).toBe(200);
    await page.waitForTimeout(500);
    // Toggle back off — exercise the visibility path.
    await toggle.click();
    expect(realErrors(errors), realErrors(errors).join("\n")).toEqual([]);
  });
}

// The reported bug: camera dots must actually render (not vanish) as you zoom
// into a city, and persist after panning.
test("camera dots render at city zoom and survive a pan", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  await page.getByRole("button", { name: "Modesto", exact: true }).click();
  await page.waitForTimeout(1500);

  const rendered = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __map?: { queryRenderedFeatures: (o: object) => unknown[] } })
        .__map;
      return m ? m.queryRenderedFeatures({ layers: ["cam-points", "cam-clusters"] }).length : -1;
    });

  expect(await rendered(), "cameras should be visible at Modesto zoom").toBeGreaterThan(0);
  // Pan east and confirm cameras are still rendered.
  await page.mouse.move(640, 430);
  await page.mouse.down();
  await page.mouse.move(300, 430, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  expect(await rendered(), "cameras should persist after panning").toBeGreaterThan(0);
});

test('"what can see me?" drops a pin and reports nearby readers', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);
  await page.getByRole("button", { name: /Find plate readers near a point/i }).click();
  await page.locator("canvas.maplibregl-canvas").click({ position: { x: 640, y: 430 } });
  await expect(page.locator(".coverage-result")).toContainText(/plate reader/i, { timeout: 20000 });
  expect(realErrors(errors), realErrors(errors).join("\n")).toEqual([]);
});

test("export cameras triggers a GeoJSON download", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download cameras as GeoJSON/i }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("cameras.geojson");
});

test("a shareable URL hash restores an active overlay", async ({ page }) => {
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/layers/city-limits") && r.status() === 200,
    { timeout: 20000 },
  );
  await page.goto("/#ov=city-limits");
  await waitForMap(page);
  await resp; // the overlay encoded in the hash was auto-loaded
});

test("toggling an overlay writes it to the URL hash", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  await page.getByText("Zoning", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain("ov=zoning");
});

test("rapidly toggling the camera layer does not error", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);
  const cams = page.getByText("Traffic cameras", { exact: true });
  for (let i = 0; i < 6; i++) await cams.click();
  await page.waitForTimeout(500);
  expect(realErrors(errors), realErrors(errors).join("\n")).toEqual([]);
});
