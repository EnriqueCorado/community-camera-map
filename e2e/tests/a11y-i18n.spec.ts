import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function ready(page: Page) {
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(1500);
}

/** Wait until a map layer has actually rendered features (no fixed sleeps). */
async function waitForLayer(page: Page, layer: string) {
  await expect
    .poll(
      () =>
        page.evaluate((l) => {
          const m = (window as unknown as { __map?: any }).__map;
          return m && m.getLayer(l) ? m.queryRenderedFeatures({ layers: [l] }).length : 0;
        }, layer),
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
}

/** Click a screen point where `layer` is rendered and no camera dot sits on top. */
async function clickLayer(page: Page, layer: string): Promise<boolean> {
  await waitForLayer(page, layer);
  const pt = await page.evaluate((l) => {
    const m = (window as unknown as { __map?: any }).__map;
    const c = m.getCanvas();
    const W = c.clientWidth, H = c.clientHeight;
    for (let y = 140; y < H - 80; y += 23) {
      for (let x = 80; x < W - 80; x += 29) {
        const hit = m.queryRenderedFeatures([x, y], { layers: [l] }).length > 0;
        const cam = m.queryRenderedFeatures([x, y], { layers: ["cam-points", "cam-clusters"] }).length > 0;
        if (hit && !cam) return { x, y };
      }
    }
    return null;
  }, layer);
  if (!pt) return false;
  await page.locator("canvas.maplibregl-canvas").click({ position: pt });
  return true;
}

/** Run axe and fail with a readable list of violations. */
async function expectNoA11yViolations(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(WCAG);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map(
    (v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
}

// ---------------- Accessibility (axe, WCAG 2.1 AA) ----------------

test("a11y: main page (English) has no WCAG 2.1 AA violations", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expectNoA11yViolations(page);
});

test("a11y: main page (Spanish) has no WCAG 2.1 AA violations", async ({ page }) => {
  await page.goto("/#lang=es");
  await ready(page);
  await expectNoA11yViolations(page);
});

test("a11y: About dialog has no violations and is a labeled modal", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /About & sources/i }).click();
  const dialog = page.getByRole("dialog", { name: /About this map/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expectNoA11yViolations(page, ".about");
});

test("a11y: camera viewer has no violations and a labeled video", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByPlaceholder(/Filter cameras/i).fill("Briggsmore");
  await page.locator(".camlist__item").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".detail video")).toHaveAttribute("aria-label", /Live video/);
  await expectNoA11yViolations(page, ".detail");
});

// ---------------- Keyboard ----------------

test("keyboard: Escape closes About and focus returns to the opener", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const opener = page.getByRole("button", { name: /About & sources/i });
  await opener.click();
  // Focus moved into the dialog.
  await expect(page.locator(".about__card :focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".about")).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("keyboard: Tab stays trapped inside the About dialog", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /About & sources/i }).click();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".about__card"))).toBe(true);
  }
});

test("keyboard: Shift+Tab can't escape the About dialog, even from its text", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /About & sources/i }).click();
  await page.locator(".about__body p").first().click(); // focus lands on the dialog surface
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".about__card"))).toBe(true);
  }
});

test("keyboard: skip link jumps to camera search without changing the URL", async ({ page }) => {
  await page.goto("/#ov=zoning");
  await ready(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /Skip to camera search/i });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#camera-search")).toBeFocused();
  expect(await page.evaluate(() => location.hash)).toContain("ov=zoning");
});

test('keyboard: "what can see me?" works without a mouse (map center)', async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /Find plate readers near a point/i }).click();
  await page.getByRole("button", { name: /Check the map’s center/i }).click();
  await expect(page.getByRole("status").filter({ hasText: /plate reader/i })).toBeVisible({ timeout: 25000 });
});

test("screen readers: search results are announced in a live region", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByPlaceholder(/Filter cameras/i).fill("modesto");
  await expect(page.locator("#search-status")).toHaveText(/\d+ cameras match\./);
  await page.getByPlaceholder(/Filter cameras/i).fill("zzzznotacamera");
  await expect(page.locator("#search-status")).toHaveText(/No cameras match\./);
});

// ---------------- Spanish ----------------

test("i18n: switching to Spanish translates the UI, sets <html lang>, and goes in the URL", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Ver en español" }).click();
  await expect(page.locator("h1")).toContainText("Mapa de cámaras");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByText("Capas", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buscar lectores de placas cerca de un punto" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toContain("lang=es");
});

test("i18n: the language choice persists across reloads", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Ver en español" }).click();
  await page.goto("/"); // no hash: must come from the saved preference
  await ready(page);
  await expect(page.locator("h1")).toContainText("Mapa de cámaras");
});

test("i18n: a shared #lang=es link opens in Spanish", async ({ page }) => {
  await page.goto("/#lang=es");
  await ready(page);
  await expect(page.locator("h1")).toContainText("Mapa de cámaras");
});

test("i18n: every layer name is translated to Spanish", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const english = await page.locator(".layerrow .toggle > span:last-child").allInnerTexts();
  await page.getByRole("button", { name: "Ver en español" }).click();
  const spanish = await page.locator(".layerrow .toggle > span:last-child").allInnerTexts();
  expect(spanish.length).toBe(english.length);
  const untranslated = spanish.filter((s, i) => s === english[i]);
  expect(untranslated, `still in English: ${untranslated.join(", ")}`).toEqual([]);
});

test("i18n: About page and camera viewer are in Spanish", async ({ page }) => {
  await page.goto("/#lang=es");
  await ready(page);
  await page.getByRole("button", { name: "Acerca del mapa y fuentes" }).click();
  await expect(page.getByRole("dialog", { name: "Acerca de este mapa" })).toContainText(
    "infraestructura pública, no personas",
  );
  await page.keyboard.press("Escape");
  await page.getByPlaceholder(/Filtrar cámaras/).fill("Briggsmore");
  await page.locator(".camlist__item").first().click();
  await expect(page.locator(".detail")).toContainText("Latitud");
  await expect(page.locator(".detail video")).toHaveAttribute("aria-label", /Video en vivo/);
});

test("i18n: overlay popups are in Spanish", async ({ page }) => {
  await page.goto("/#lang=es&ov=census&v=-120.997,37.639,11");
  await ready(page);
  expect(await clickLayer(page, "ov-census-fill")).toBe(true);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup).toContainText(/ingreso medio|población/i);
  await expect(popup.locator(".maplibregl-popup-close-button")).toHaveAttribute("aria-label", "Cerrar ventana");
});

// ---------------- Popups ----------------

/** Click the first rendered feature of a layer that's comfortably on screen.
 *  `where` filters on properties; a `null` value means "property absent". */
async function clickFeature(page: Page, layer: string, where: Record<string, unknown> = {}): Promise<boolean> {
  const pt = await page.evaluate(([l, w]) => {
    const m = (window as unknown as { __map?: any }).__map;
    if (!m) return null;
    const c = m.getCanvas();
    for (const f of m.queryRenderedFeatures({ layers: [l] })) {
      if (f.geometry.type !== "Point") continue;
      if (!Object.entries(w).every(([k, v]) => (v === null ? f.properties[k] == null : f.properties[k] === v))) continue;
      const p = m.project(f.geometry.coordinates);
      if (p.x > 80 && p.y > 120 && p.x < c.clientWidth - 80 && p.y < c.clientHeight - 80) return { x: p.x, y: p.y };
    }
    return null;
  }, [layer, where] as const);
  if (!pt) return false;
  await page.locator("canvas.maplibregl-canvas").click({ position: pt });
  return true;
}

for (const scheme of ["dark", "light"] as const) {
  test.describe(`popups (${scheme} mode)`, () => {
    test.use({ colorScheme: scheme });

    test(`plate-reader popup is readable and labeled (${scheme})`, async ({ page }) => {
      await page.goto("/#alpr=1&v=-120.9968,37.6391,15");
      await ready(page);
      await waitForLayer(page, "alpr-points");
      expect(await clickFeature(page, "alpr-points")).toBe(true);
      const popup = page.locator(".maplibregl-popup");
      await expect(popup).toBeVisible();
      await expect(popup.locator(".popup__kind")).toHaveText(/License plate reader/i);
      await expect(popup.locator(".popup__heading")).toHaveText("Who can search it");
      await expect(popup.locator(".maplibregl-popup-close-button")).toHaveAttribute("aria-label", "Close popup");
      // The original bug: light text on a white popup in dark mode. axe checks contrast.
      await expectNoA11yViolations(page, ".maplibregl-popup");
    });

    test(`facility popup hides placeholder values (${scheme})`, async ({ page }) => {
      await page.goto("/#ov=hospitals&v=-120.9968,37.6391,12");
      await ready(page);
      await waitForLayer(page, "ov-hospitals-circle");
      expect(await clickFeature(page, "ov-hospitals-circle")).toBe(true);
      const popup = page.locator(".maplibregl-popup");
      await expect(popup).toBeVisible();
      await expect(popup).not.toContainText(/NOT AVAILABLE/i);
      await expectNoA11yViolations(page, ".maplibregl-popup");
    });
  });
}

test("popups close with Escape", async ({ page }) => {
  await page.goto("/#alpr=1&v=-120.9968,37.6391,15");
  await ready(page);
  await waitForLayer(page, "alpr-points");
  expect(await clickFeature(page, "alpr-points")).toBe(true);
  await expect(page.locator(".maplibregl-popup")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".maplibregl-popup")).toHaveCount(0);
});

test("flood popup explains risk in plain language", async ({ page }) => {
  await page.goto("/#ov=flood&v=-120.9968,37.6391,12");
  await ready(page);
  expect(await clickLayer(page, "ov-flood-fill")).toBe(true);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup).toBeVisible();
  await expect(popup.locator(".popup__title")).toHaveText(/flood risk/i);
});

// ---------------- Who can search each plate reader ----------------

// A Motorola/Vigilant reader inside Modesto city limits, not tagged with an operator.
const MODESTO_READER = "/#alpr=1&v=-120.975599,37.667166,17";

test("plate-reader popup says who can search it, with sourced details", async ({ page }) => {
  await page.goto(MODESTO_READER);
  await ready(page);
  await waitForLayer(page, "alpr-points");
  expect(await clickFeature(page, "alpr-points", { agency: "modesto-pd", agency_basis: "inferred" })).toBe(true);
  const section = page.locator(".maplibregl-popup .popup__section");
  await expect(section).toContainText("Possible operator");
  await expect(section.locator(".popup__name")).toHaveText("Modesto Police Department");
  await expect(section.locator(".popup__text")).toContainText(/Shared with \d+ California agencies/);
  await expect(section.locator(".popup__foot")).toContainText("Checked against public records on");

  const opener = section.getByRole("button", { name: "Sources & details" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Who can search this plate reader?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("U.S. Marshals Service");
  await expect(dialog).toContainText(/could belong to someone else/);
  // Every source opens safely in a new tab.
  const links = dialog.locator("a[href^='https://']");
  expect(await links.count()).toBeGreaterThan(2);
  for (const rel of await links.evaluateAll((as) => as.map((a) => a.getAttribute("rel")))) {
    expect(rel).toContain("noopener");
  }
  // The full sharing list is behind a disclosure.
  await dialog.locator("summary").click();
  expect(await dialog.locator(".access__list li").count()).toBeGreaterThan(50);
  await expectNoA11yViolations(page, ".about__card");

  // Escape closes the panel only; focus returns to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator(".maplibregl-popup")).toBeVisible();
});

test("who-can-search is in Spanish", async ({ page }) => {
  await page.goto(MODESTO_READER.replace("/#", "/#lang=es&"));
  await ready(page);
  await waitForLayer(page, "alpr-points");
  expect(await clickFeature(page, "alpr-points", { agency: "modesto-pd" })).toBe(true);
  const section = page.locator(".maplibregl-popup .popup__section");
  await expect(section.locator(".popup__heading")).toHaveText("Quién puede consultarla");
  await expect(section.locator(".popup__name")).toHaveText("Departamento de Policía de Modesto");
  await section.getByRole("button", { name: "Fuentes y detalles" }).click();
  const dialog = page.getByRole("dialog", { name: "¿Quién puede consultar este lector de placas?" });
  await expect(dialog).toContainText("Lo que dicen los registros");
  await expect(dialog).toContainText(/agosto de 2026/);
});

test("an unattributed reader says the operator is unknown instead of guessing", async ({ page }) => {
  await page.goto("/#alpr=1&v=-118.2437,34.0522,13"); // Los Angeles: outside the curated county
  await ready(page);
  await waitForLayer(page, "alpr-points");
  expect(await clickFeature(page, "alpr-points", { agency: null, operator: null })).toBe(true);
  const section = page.locator(".maplibregl-popup .popup__section");
  await expect(section.locator(".popup__basis")).toHaveText("Operator unknown");
  await expect(section.locator(".popup__name")).toHaveCount(0);
  await expect(section.locator(".popup__text")).toContainText("California law limits who can search");
});

// A reader whose OSM operator tag names someone we hold no records for.
const UNTRACKED_READER = "/#alpr=1&v=-122.152597,37.61797,17";

test("a reader tagged with an operator we have no records for is 'untracked'", async ({ page }) => {
  await page.goto(UNTRACKED_READER);
  await ready(page);
  await waitForLayer(page, "alpr-points");
  expect(await clickFeature(page, "alpr-points", { operator: "Bay Area Toll Authority" })).toBe(true);
  const section = page.locator(".maplibregl-popup .popup__section");
  await expect(section.locator(".popup__name")).toHaveText("Bay Area Toll Authority");
  await expect(section.locator(".popup__basis")).toHaveText("Operator listed in OpenStreetMap");
  await expect(section.locator(".popup__text")).toContainText(/We don.t have public records/);

  await section.getByRole("button", { name: "Sources & details" }).click();
  const dialog = page.getByRole("dialog", { name: "Who can search this plate reader?" });
  await expect(dialog.locator(".access__basis--untracked")).toBeVisible();
  await expect(dialog.locator(".access__name")).toHaveText("Bay Area Toll Authority");
  await expect(dialog.locator(".access__summary")).toContainText(/We don.t have public records/);
  await expect(dialog.locator(".access__system")).toHaveCount(0); // no profile, so no vendor/system line
  await expect(dialog.locator(".access__note")).toHaveCount(0); // "likely" caveat is only for inferred
});

test("if the access data fails to load the popup still shows the basis and the panel shows an error", async ({ page }) => {
  await page.route("**/alpr/access*", (route) => route.fulfill({ status: 500, body: "boom" }));
  await page.goto(MODESTO_READER);
  await ready(page);
  await waitForLayer(page, "alpr-points");
  expect(await clickFeature(page, "alpr-points", { agency: "modesto-pd", agency_basis: "inferred" })).toBe(true);
  const section = page.locator(".maplibregl-popup .popup__section");
  await expect(section).toContainText("Possible operator");
  await expect(section.locator(".popup__name")).toHaveCount(0); // profile name unavailable
  await expect(section.locator(".popup__foot")).toHaveCount(0); // no "as of" without data

  await section.getByRole("button", { name: "Sources & details" }).click();
  const dialog = page.getByRole("dialog", { name: "Who can search this plate reader?" });
  await expect(dialog.getByRole("alert")).toContainText(/Couldn.t load the records/);
  await expect(dialog.getByRole("status")).toHaveCount(0); // not stuck on "loading"
  await expect(dialog.locator(".access__facts")).toHaveCount(0);
  await expect(dialog.locator(".access__basis--inferred")).toBeVisible();
  // Closing still works.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

// ---------------- Public webcams ----------------

test("wildfire-camera popup shows the live frame, credit and official link", async ({ page }) => {
  // Mt. Oso (ALERTCalifornia), the fire camera inside Stanislaus County.
  await page.goto("/#ov=fire-cameras&v=-121.373489,37.50692,12");
  await ready(page);
  await waitForLayer(page, "ov-fire-cameras-circle");
  expect(await clickFeature(page, "ov-fire-cameras-circle", { network: "ALERTCalifornia" })).toBe(true);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.locator(".popup__kind")).toHaveText(/Wildfire cameras/i);
  const img = popup.locator(".popup__image img");
  await expect(img).toHaveAttribute("src", /^https:\/\/cameras\.alertcalifornia\.org\/.+latest-frame\.jpg\?t=\d+$/);
  await expect(img).toHaveAttribute("alt", /Latest image from/);
  await expect(popup.locator("figcaption").first()).toContainText("Image: ALERTCalifornia | UC San Diego");
  const link = popup.getByRole("link", { name: /live view/ }).first();
  await expect(link).toHaveAttribute("href", /^https:\/\/cameras\.alertcalifornia\.org\//);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expectNoA11yViolations(page, ".maplibregl-popup");
});

test("river-camera popup links to USGS", async ({ page }) => {
  await page.goto("/#lang=es&ov=river-cameras&v=-121.6889444,38.14904444,13"); // Sacramento R. at Rio Vista
  await ready(page);
  await waitForLayer(page, "ov-river-cameras-circle");
  expect(await clickFeature(page, "ov-river-cameras-circle")).toBe(true);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.locator(".popup__kind")).toHaveText(/Cámaras de ríos/i);
  await expect(popup.locator("figcaption").first()).toHaveText("Imagen: Servicio Geológico de EE. UU.");
  await expect(popup.getByRole("link", { name: /vista en vivo oficial/ })).toHaveAttribute(
    "href",
    /^https:\/\/apps\.usgs\.gov\/hivis\/camera\//,
  );
});

test("a site with two wildfire cameras shows both, with distinct links", async ({ page }) => {
  // Atlas Peak (Napa) has "Atlas Peak 1" and "Atlas Peak 2" at the same point.
  await page.goto("/#ov=fire-cameras&v=-122.26678,38.45283,12");
  await ready(page);
  await waitForLayer(page, "ov-fire-cameras-circle");
  expect(await clickFeature(page, "ov-fire-cameras-circle")).toBe(true);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.locator(".popup__cam")).toHaveCount(2);
  const names = await popup.getByRole("link").evaluateAll((as) => as.map((a) => a.textContent));
  expect(new Set(names).size).toBe(2);
  await expectNoA11yViolations(page, ".maplibregl-popup");
});

test("haze popup explains the reading and its limits", async ({ page }) => {
  await page.goto("/#ov=smoke-haze&v=-121.373489,37.50692,11"); // Mt. Oso
  await ready(page);
  await waitForLayer(page, "ov-smoke-haze-circle");
  expect(await clickFeature(page, "ov-smoke-haze-circle")).toBe(true);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.locator(".popup__kind")).toHaveText(/Smoke & haze/i);
  await expect(popup.locator(".popup__row dt").first()).toHaveText("Haze");
  await expect(popup).toContainText("Experimental");
  await expect(popup.locator("figcaption")).toHaveText("Image: ALERTCalifornia | UC San Diego");
  await expectNoA11yViolations(page, ".maplibregl-popup");
});

test("flight popup shows only flight data, in Spanish too", async ({ page }) => {
  await page.route("**/api/layers/flights", (route) =>
    route.fulfill({
      contentType: "application/geo+json",
      body: JSON.stringify({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-120.99, 37.64] },
          properties: { callsign: "SWA123", type: "BOEING 737-800", alt_ft: 12000, on_ground: false, speed_kt: 300, track: 45 } }],
      }),
    }),
  );
  await page.goto("/#lang=es&ov=flights&v=-120.99,37.64,10");
  await ready(page);
  await waitForLayer(page, "ov-flights-arrow"); // it has a heading: drawn as an arrow
  expect(await clickFeature(page, "ov-flights-arrow")).toBe(true);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.locator(".popup__title")).toHaveText("SWA123");
  await expect(popup).toContainText("12,000 pies"); // es-US groups with commas
  await expect(popup).toContainText("300 nudos");
  await expectNoA11yViolations(page, ".maplibregl-popup");
});

// New civic layers: real data from the dev API, popups in both languages.
for (const [layer, ov, view, en, es] of [
  ["ov-voting-circle", "voting", "-120.99,37.64,11", /Ballot drop box|Vote center|Outdoor drop box|Curbside/, /Buzón|Centro de votación|acera/],
  ["ov-reservoirs-circle", "reservoirs", "-120.6,37.9,8", /Full/, /Lleno/],
  // (zoom 7.5: below min_zoom, so the local file loads, not the network)
  ["ov-fatal-crashes-circle", "fatal-crashes", "-120.99,37.6,7.5", /Fatal crash/, /Choque mortal/],
  ["ov-health-diabetes-fill", "health-diabetes", "-120.99,37.64,11", /% of adults/, /% de los adultos/],
  ["ov-wastewater-circle", "wastewater", "-120.99,37.56,8", /COVID-19.*(Very low|Low|Moderate|High|Very high)/s, /Influenza A/],
  ["ov-groundwater-circle", "groundwater", "-120.99,37.6,10", /ft below ground/, /pies bajo tierra/],
  ["ov-volcanoes-circle", "volcanoes", "-176,52,6", /Aviation code/, /Código de aviación/],
  ["ov-national-parks-fill", "national-parks", "-119.55,37.85,10", /Yosemite/, /Yosemite/],
  ["ov-river-gauges-circle", "river-gauges", "-121.2,37.7,8", /Status.*(flood|stages|current|service)/is, /Estado/],
  ["ov-air-quality-circle", "air-quality", "-120.99,37.64,7.5", /Monitor/, /Estación de monitoreo/],
] as const) {
  for (const lang of ["en", "es"] as const) {
    test(`${ov} popup (${lang})`, async ({ page }) => {
      await page.goto(`/#lang=${lang}&ov=${ov}&v=${view}`);
      await ready(page);
      await waitForLayer(page, layer);
      if (layer.endsWith("-fill")) {
        // Tracts cover the whole view: the center of the map is inside one.
        const box = (await page.locator("canvas.maplibregl-canvas").boundingBox())!;
        await page.locator("canvas.maplibregl-canvas").click({ position: { x: box.width / 2, y: box.height / 2 } });
      } else {
        expect(await clickFeature(page, layer)).toBe(true);
      }
      await expect(page.locator(".maplibregl-popup")).toContainText(lang === "en" ? en : es);
    });
  }
}

test("near-me: search -> report, and the address never reaches the page link", async ({ page }) => {
  await page.route("https://nominatim.openstreetmap.org/**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify([{ lat: "37.6543", lon: "-120.9876", display_name: "123 Test St, Modesto, California, 95354, United States" }]) }),
  );
  const attrs = { NAME: "Testville", ZCTA5: "95354", FLD_ZONE: "AE", ZONE_SUBTY: "", SFHA_TF: "T", B19049_001E: 50000, DM: 1, FHSZ_Description: "Moderate" };
  await page.route(/\/query\?/, (r) =>
    r.request().url().includes("f=geojson")
      ? r.fulfill({ contentType: "application/json", body: JSON.stringify({ type: "FeatureCollection", features: [] }) })
      : r.fulfill({ contentType: "application/json", body: JSON.stringify({ features: [{ attributes: attrs }] }) }),
  );
  await page.route(/ImageServer\/identify/, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ value: "2" }) }));
  await page.goto("/");
  await ready(page);
  await page.locator(".nearme input").fill("123 Test St, Modesto");
  await page.locator(".nearme form button").click();
  const report = page.locator(".nearme__report");
  await expect(report).toContainText("123 Test St");
  await expect(report).toContainText("High risk (zone AE)");
  await expect(report).toContainText("Testville");
  await expect(report).toContainText("D1: moderate drought");
  await page.waitForTimeout(1500); // the map flies to the address
  expect(page.url()).not.toMatch(/-120\.98|37\.65/);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(report).toHaveCount(0);
});

test("live buses: route popup, Spanish too", async ({ page }) => {
  await page.route("https://max.availtec.com/**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ Entities: [
      { Id: "944", Vehicle: { Trip: { RouteId: "47" }, Vehicle: { Label: "20944" }, Position: { Latitude: 37.64, Longitude: -120.99, Bearing: 90, Speed: 10 }, Timestamp: 1792103573 } },
    ] }) }),
  );
  await page.goto("/#lang=es&ov=buses&v=-120.99,37.64,13");
  await ready(page);
  await waitForLayer(page, "ov-buses-arrow");
  expect(await clickFeature(page, "ov-buses-arrow")).toBe(true);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.locator(".popup__title")).toHaveText("Ruta 47");
  await expect(popup).toContainText("22 mph");
});

test("quick view turns on its layers, and every preset layer exists", async ({ page, request }) => {
  const names = new Set(((await (await request.get("/api/layers")).json()) as { name: string }[]).map((l) => l.name));
  const { PRESETS } = await import("../../frontend/src/presets");
  for (const p of PRESETS) for (const n of p.overlays) expect(names.has(n), `${p.id}: ${n}`).toBe(true);
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Election day" }).click();
  await expect(page.getByRole("button", { name: "Election day" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("checkbox", { name: "Vote centers & ballot drop boxes" })).toBeChecked();
  await expect(page).toHaveURL(/ov=voting/);
  await page.getByRole("button", { name: "Clear all layers" }).click();
  await expect(page.getByRole("checkbox", { name: "Vote centers & ballot drop boxes" })).not.toBeChecked();
});
