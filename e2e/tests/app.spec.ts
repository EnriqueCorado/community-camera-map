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

  await expect(page.locator("h1")).toContainText("Community Camera Map");
  await expect(page.locator(".sidebar__sub")).toContainText(/public cameras from \d+ agencies/i);
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
  "Transit routes (Stanislaus local)",
  "Transit stops (Stanislaus local)",
  "Supervisor districts",
  "ZIP codes",
  "Congressional districts",
  "Airports",
  "Amtrak stations",
  "Dams",
  "Wildfire cameras",
  "River cameras",
  "Smoke & haze (experimental)",
  "Flights overhead",
  "Satellite fire detections, California (24h)",
  "Windy webcams",
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
      "Transit routes (Stanislaus local)": "transit-routes",
      "Transit stops (Stanislaus local)": "transit-stops",
      "Supervisor districts": "supervisor-districts",
      "ZIP codes": "zip-codes",
      "Congressional districts": "congressional-districts",
      Airports: "airports",
      "Amtrak stations": "amtrak",
      Dams: "dams",
      "Wildfire cameras": "fire-cameras",
      "River cameras": "river-cameras",
      "Smoke & haze (experimental)": "smoke-haze",
      "Flights overhead": "flights",
      "Satellite fire detections, California (24h)": "fire-hotspots",
      "Windy webcams": "windy-webcams",
    }[label]!;

    // Nationwide layers may load straight from their national service
    // (e.g. TIGERweb) instead of the API, depending on the view.
    const catalog = (await (await page.request.get("/api/layers")).json()) as { name: string; view?: { url: string } | null }[];
    const viewUrl = catalog.find((c) => c.name === slug)?.view?.url;
    const resp = page.waitForResponse(
      // any level of the view's service (states/counties/tracts by zoom)
      (r) => r.url().includes(`/api/layers/${slug}`) || (!!viewUrl && r.url().startsWith(viewUrl.replace(/\/\d+$/, "/")) && r.url().includes("/query")),
      { timeout: 40000 }, // smoke-haze scores ~14 camera frames on a cold cache
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

test("an out-of-state still-image camera shows its still and the agency credit", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);
  // Illinois (CC BY-SA 2.0): the credit must name Illinois DOT and link the license.
  await page.getByPlaceholder(/Filter cameras/i).fill("illinois");
  await page.locator(".camlist__item").first().click();
  const detail = page.locator(".detail");
  await expect(detail).toBeVisible();
  await expect(detail.locator("img.player--still")).toHaveAttribute("src", /^https:\/\/[^/]+\/.+[?&]t=\d+$/);
  await expect(detail.locator(".detail__note")).toContainText("Illinois DOT");
  await expect(detail.locator('.detail__note a[rel~="license"]')).toHaveText("CC BY-SA 2.0");
  await expect(detail).toContainText("IL");
  await page.locator(".detail__close").click();

  // The About page lists every camera publisher.
  await page.getByRole("button", { name: /About & sources/i }).click();
  await expect(page.locator(".about__camsources")).toContainText("Illinois DOT");
  await expect(page.locator(".about__camsources")).toContainText("NOAA National Data Buoy Center");
  await page.keyboard.press("Escape");

  // Nationwide quick-jump.
  await page.getByRole("button", { name: "All of the US", exact: true }).click();
  await page.waitForTimeout(700);
  // Third-party still images may 404 intermittently; that's the upstream, not us.
  expect(realErrors(errors).filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
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

// ---------------- Imagery & live layers ----------------

test("rain radar animates the last hour of RainViewer frames", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);
  const tiles = page.waitForResponse((r) => r.url().startsWith("https://tilecache.rainviewer.com/v2/radar/"), {
    timeout: 20000,
  });
  await page.getByText("Rain radar", { exact: true }).click();
  expect((await tiles).status()).toBe(200);
  const frameOpacities = () =>
    page.evaluate(() => {
      const m = (window as any).__map;
      return m.getStyle().layers.filter((l: any) => l.id.startsWith("ov-rain-radar-f")).map((l: any) => m.getPaintProperty(l.id, "raster-opacity"));
    });
  await expect.poll(async () => (await frameOpacities()).length).toBeGreaterThan(1);
  // Exactly one frame is shown at a time, and the shown frame changes.
  const first = await frameOpacities();
  expect(first.filter((o: number) => o > 0)).toHaveLength(1);
  await expect.poll(async () => (await frameOpacities()).indexOf(0.7)).not.toBe(first.indexOf(0.7));
  // Off removes every frame.
  await page.getByText("Rain radar", { exact: true }).click();
  await expect.poll(async () => (await frameOpacities()).length).toBe(0);
  expect(realErrors(errors), realErrors(errors).join("\n")).toEqual([]);
});

test("satellite loads yesterday's NASA GIBS tiles, with attribution and no download button", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const tiles = page.waitForResponse((r) => r.url().includes(`/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${yesterday}/`), {
    timeout: 20000,
  });
  await page.getByText("Satellite (yesterday)", { exact: true }).click();
  expect((await tiles).status()).toBe(200);
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("NASA EOSDIS GIBS");
  await expect(page.getByRole("button", { name: /Download Satellite/ })).toHaveCount(0);
});

test("Windy webcams show 'needs API key' until a key is configured", async ({ page }) => {
  // Simulate a deployment without the key, whatever this machine's .env says.
  await page.route("**/api/layers", async (route) => {
    const res = await route.fetch();
    const list = (await res.json()) as { name: string; available: boolean }[];
    for (const l of list) if (l.name === "windy-webcams") l.available = false;
    await route.fulfill({ response: res, json: list });
  });
  await page.goto("/");
  await waitForMap(page);
  const row = page.locator(".layerrow", { hasText: "Windy webcams" });
  await expect(row).toContainText("needs API key");
  await expect(row.locator("input")).toBeDisabled();
});

test("flights refresh themselves while the layer is on", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await page.route("**/api/layers/flights", (route) => {
    calls++;
    route.fulfill({
      contentType: "application/geo+json",
      body: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-120.99 + calls * 0.01, 37.64] },
            properties: { callsign: `TEST${calls}`, type: "C172", alt_ft: 3000, on_ground: false, speed_kt: 100, track: 90 },
          },
        ],
      }),
    });
  });
  await page.goto("/#ov=flights&v=-120.99,37.64,10");
  await waitForMap(page);
  await expect.poll(() => calls).toBeGreaterThanOrEqual(1);
  const before = calls;
  await page.clock.fastForward(16_000);
  await expect.poll(() => calls).toBeGreaterThan(before);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__map.querySourceFeatures("ov-flights").map((f: any) => f.properties.callsign),
      ),
    )
    .toContain(`TEST${calls}`);
  // Switched off: no more polling.
  await page.getByText("Flights overhead", { exact: true }).click();
  const after = calls;
  await page.clock.fastForward(60_000);
  expect(calls).toBe(after);
});
