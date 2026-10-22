// End-to-end: Work tab → "Heat at work today" in a real browser, with the
// Open-Meteo forecast mocked so results are deterministic. Flows, retry and
// caching, accessibility (light, dark, Spanish), a 320px layout, and the
// privacy promise (the typed worksite temperature never leaves the page).
import { test, expect, type Page, type Request, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { todayInCalifornia } from "../../frontend/src/help/heat";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast**";

const day = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/** Past 5 days average 86°F, today 97.2°F, tomorrow 99°F: a heat wave day. */
function forecastBody(highs = [84, 85, 86, 87, 88, 97.2, 99]) {
  const today = todayInCalifornia();
  return JSON.stringify({
    latitude: 37.64,
    longitude: -121,
    daily_units: { time: "iso8601", temperature_2m_max: "°F" },
    daily: { time: highs.map((_, i) => day(today, i - 5)), temperature_2m_max: highs },
  });
}

async function mockForecast(page: Page, highs?: number[]) {
  const calls: string[] = [];
  await page.route(OPEN_METEO, (route: Route) => {
    calls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: forecastBody(highs) });
  });
  return calls;
}

async function openHeat(page: Page, lang: "en" | "es" = "en") {
  await page.goto(`./#help=work${lang === "es" ? "&lang=es" : ""}`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: lang === "es" ? "Calor en el trabajo hoy" : "Heat at work today" }).click();
  await expect(dialog.getByRole("heading", { name: lang === "es" ? "1. El calor de hoy" : "1. Today’s heat" })).toBeVisible();
  return dialog;
}

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(".help__card").analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

/** Fill the whole tool: city forecast, outdoor farm work, a worksite reading. */
async function fillAll(page: Page, lang: "en" | "es" = "en") {
  const dialog = await openHeat(page, lang);
  const es = lang === "es";
  await dialog.getByLabel(es ? "Su ciudad" : "Your city").selectOption({ label: "Modesto" });
  await expect(dialog.getByText(es ? "Máxima pronosticada para hoy: unos 97°F" : "Today’s forecast high: about 97°F")).toBeVisible();
  await dialog.getByRole("radio", { name: es ? "Al aire libre" : "Outdoors" }).check();
  await dialog.getByRole("radio", { name: es ? "Agricultura o trabajo en el campo" : "Farm or field work" }).check();
  await dialog.getByLabel(es ? "Temperatura en su lugar de trabajo (°F)" : "Temperature at your worksite (°F)").fill("101");
  await expect(dialog.getByText(es ? "A 101°F al aire libre, su empleador debe darle:" : "At 101°F outdoors, your employer must provide:")).toBeVisible();
  return dialog;
}

test("forecast for a picked city, with the worksite caveat and a heat-wave heads-up", async ({ page }) => {
  const calls = await mockForecast(page);
  const dialog = await openHeat(page);
  await dialog.getByLabel("Your city").selectOption({ label: "Modesto" });
  await expect(dialog.getByText("Today’s forecast high: about 97°F")).toBeVisible();
  await expect(dialog.getByText("(tomorrow 99°F)")).toBeVisible();
  await expect(dialog.getByText(/today may be a heat wave day/)).toBeVisible();
  await expect(dialog.getByText(/temperature at your worksite, measured in full sun/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Weather data by Open-Meteo\.com/ })).toHaveAttribute("href", "https://open-meteo.com/");
  expect(calls).toHaveLength(1);
  const u = new URL(calls[0]);
  expect(u.searchParams.get("latitude")).toBe("37.64");
  expect(u.searchParams.get("longitude")).toBe("-121.00");

  // The forecast stands in until a worksite reading is typed.
  await dialog.getByRole("radio", { name: "Outdoors" }).check();
  await dialog.getByRole("radio", { name: "Farm or field work" }).check();
  const result = dialog.getByText("At 97°F outdoors, your employer must provide:");
  await expect(result).toBeVisible();
  await expect(dialog.getByText("Based on the forecast high. Check the real temperature at your worksite.")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Because it’s 95°F or more (high-heat rules)" })).toBeVisible();
  await expect(dialog.getByText(/at least 10 minutes every 2 hours/)).toBeVisible();
  await expect(dialog.getByText("(8 CCR §3395(e)(6))")).toBeVisible();
});

test("a typed worksite temperature overrides the forecast; tiers add up as it gets hotter", async ({ page }) => {
  await mockForecast(page);
  const dialog = await openHeat(page);
  await dialog.getByLabel("Your city").selectOption({ label: "Turlock" });
  await expect(dialog.getByText("Today’s forecast high: about 97°F")).toBeVisible();
  await dialog.getByRole("radio", { name: "Outdoors" }).check();
  await dialog.getByRole("radio", { name: "Construction" }).check();
  const temp = dialog.getByLabel("Temperature at your worksite (°F)");

  await temp.fill("78");
  await expect(dialog.getByText("At 78°F outdoors, your employer must provide:")).toBeVisible();
  await expect(dialog.getByText("Based on the temperature you typed for your worksite.")).toBeVisible();
  await expect(dialog.getByText(/get you to shade quickly when you ask/)).toBeVisible();
  await expect(dialog.getByText("Above 80°F, shade must be set up the whole time.")).toBeVisible();

  await temp.fill("85");
  await expect(dialog.getByRole("heading", { name: "Because it’s above 80°F" })).toBeVisible();
  await expect(dialog.getByText(/Shade must already be set up/)).toBeVisible();
  await expect(dialog.getByText(/get you to shade quickly when you ask/)).toBeHidden();
  await expect(dialog.getByText("At 95°F, extra high-heat rules start for your kind of work.")).toBeVisible();

  await temp.fill("95");
  await expect(dialog.getByRole("heading", { name: "Because it’s 95°F or more (high-heat rules)" })).toBeVisible();
  await expect(dialog.getByText(/A short meeting before the shift/)).toBeVisible();
  await expect(dialog.getByText(/at least 10 minutes every 2 hours/)).toBeHidden(); // farm work only

  await dialog.getByRole("radio", { name: "Other outdoor work" }).check();
  await expect(dialog.getByText(/isn’t on the list for the extra 95°F rules/)).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Because it’s 95°F or more (high-heat rules)" })).toBeHidden();

  await temp.fill("hot");
  await expect(dialog.getByRole("alert")).toHaveText("Type a temperature in °F, like 96.");
});

test("indoors: nothing below 82°F, base rules at 82°F, full rules at 87°F or with heat-trapping clothing", async ({ page }) => {
  await mockForecast(page);
  const dialog = await openHeat(page);
  await dialog.getByRole("radio", { name: "Indoors" }).check();
  const temp = dialog.getByLabel("Temperature at your worksite (°F)");
  await temp.fill("80");
  await expect(dialog.getByText("At 80°F indoors, the indoor heat rule doesn’t apply yet")).toBeVisible();
  await temp.fill("84");
  await expect(dialog.getByRole("heading", { name: "Indoors at 82°F or more" })).toBeVisible();
  await expect(dialog.getByText(/At least one cool-down area kept below 82°F/)).toBeVisible();
  await expect(dialog.getByText("At 87°F (or a heat index of 87°F), more rules start.")).toBeVisible();
  await dialog.getByRole("group", { name: /clothing that traps heat/ }).getByRole("radio", { name: "Yes", exact: true }).check();
  await expect(dialog.getByRole("heading", { name: /More indoor rules/ })).toBeVisible();
  await expect(dialog.getByText(/measure the temperature and the heat index/)).toBeVisible();
  await dialog.getByRole("group", { name: /clothing that traps heat/ }).getByRole("radio", { name: "No", exact: true }).check();
  await temp.fill("87");
  await expect(dialog.getByRole("heading", { name: /More indoor rules/ })).toBeVisible();
});

test("forecast errors are explained, and Try again refetches; each city is fetched once", async ({ page }) => {
  let fail = true;
  const calls: string[] = [];
  await page.route(OPEN_METEO, (route) => {
    calls.push(route.request().url());
    if (fail) return route.fulfill({ status: 503, body: "busy" });
    return route.fulfill({ status: 200, contentType: "application/json", body: forecastBody() });
  });
  const dialog = await openHeat(page);
  await dialog.getByLabel("Your city").selectOption({ label: "Oakdale" });
  await expect(dialog.getByText(/couldn’t get the forecast right now/)).toBeVisible();
  fail = false;
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByText("Today’s forecast high: about 97°F")).toBeVisible();
  await dialog.getByLabel("Your city").selectOption({ label: "Salida" });
  await expect(dialog.getByText("Today’s forecast high: about 97°F")).toBeVisible();
  await dialog.getByLabel("Your city").selectOption({ label: "Oakdale" });
  await expect(dialog.getByText("Today’s forecast high: about 97°F")).toBeVisible();
  expect(calls.map((u) => new URL(u).searchParams.get("latitude"))).toEqual(["37.77", "37.77", "37.71"]);
});

test("heat illness signs, 911, and how to report to the Modesto Cal/OSHA office", async ({ page }) => {
  await mockForecast(page);
  const dialog = await openHeat(page);
  await expect(dialog.getByText("Heat stroke is an emergency. Call 911.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Call 911" })).toHaveAttribute("href", "tel:911");
  await expect(dialog.getByRole("heading", { name: "Heat exhaustion" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "833-579-0927" })).toHaveAttribute("href", "tel:8335790927");
  const office = dialog.getByRole("region", { name: /Modesto District Office/ });
  await expect(office.getByRole("link", { name: "(209) 545-7310" })).toHaveAttribute("href", "tel:2095457310");
  await expect(office.getByRole("link", { name: "DOSHMod@dir.ca.gov" })).toHaveAttribute("href", "mailto:DOSHMod@dir.ca.gov");
  await expect(dialog.getByText(/protected regardless of immigration status/)).toBeVisible();
  await expect(dialog.getByText(/Cool-down breaks for heat are paid/)).toBeVisible();
  await dialog.getByText("Where this information comes from").click();
  await expect(dialog.getByRole("link", { name: /8 CCR §3395/ })).toHaveAttribute("href", "https://www.dir.ca.gov/title8/3395.html");
});

test("Spanish: the tool reads in Spanish with the official strings", async ({ page }) => {
  await mockForecast(page);
  const dialog = await fillAll(page, "es");
  await expect(dialog.getByText("(mañana 99°F)")).toBeVisible();
  await expect(dialog.getByText("El golpe de calor es una emergencia. Llame al 911.")).toBeVisible();
  await expect(dialog.getByText(/independientemente de su estatus migratorio/)).toBeVisible();
  await expect(dialog.getByText(/Datos del tiempo de Open-Meteo\.com/)).toBeVisible();
});

test("privacy: the typed worksite temperature is never sent or stored", async ({ page }) => {
  const seen: Request[] = [];
  page.on("request", (r) => seen.push(r));
  const calls = await mockForecast(page);
  const dialog = await openHeat(page);
  const secret = "103.7";
  await dialog.getByLabel("Your city").selectOption({ label: "Patterson" });
  await expect(dialog.getByText("Today’s forecast high: about 97°F")).toBeVisible();
  await dialog.getByRole("radio", { name: "Outdoors" }).check();
  await dialog.getByRole("radio", { name: "Landscaping" }).check();
  await dialog.getByLabel("Temperature at your worksite (°F)").fill(secret);
  await expect(dialog.getByText(`At ${secret}°F outdoors, your employer must provide:`)).toBeVisible();
  await dialog.getByLabel("Your city").selectOption({ label: "Newman" });
  await expect(dialog.getByText("Today’s forecast high: about 97°F")).toBeVisible();

  for (const r of seen) {
    expect(r.url(), `leaked in a URL: ${r.url()}`).not.toContain(secret);
    expect(r.postData() ?? "", `leaked in a request body to ${r.url()}`).not.toContain(secret);
  }
  // The only forecast requests are the two picked city centers.
  expect(calls.map((u) => [new URL(u).searchParams.get("latitude"), new URL(u).searchParams.get("longitude")])).toEqual([
    ["37.47", "-121.13"],
    ["37.31", "-121.02"],
  ]);
  expect(page.url()).not.toContain(secret);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain(secret);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`a11y (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    for (const lang of ["en", "es"] as const) {
      test(`filled-in heat tool (${lang}, ${scheme}) has no WCAG 2.2 AA violations`, async ({ page }) => {
        await mockForecast(page);
        await fillAll(page, lang);
        await expectNoA11yViolations(page);
      });
    }
    test(`indoor result and forecast error (${scheme}) have no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.route(OPEN_METEO, (route) => route.fulfill({ status: 500, body: "" }));
      const dialog = await openHeat(page);
      await dialog.getByLabel("Your city").selectOption({ label: "Ceres" });
      await expect(dialog.getByRole("button", { name: "Try again" })).toBeVisible();
      await dialog.getByRole("radio", { name: "Indoors" }).check();
      await dialog.getByLabel("Temperature at your worksite (°F)").fill("84");
      await dialog.getByRole("group", { name: /clothing that traps heat/ }).getByRole("radio", { name: "Not sure" }).check();
      await expect(dialog.getByText(/Not sure\? Ask your employer/)).toBeVisible();
      await expectNoA11yViolations(page);
    });
  });
}

test.describe("320 CSS px wide", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test("the filled-in tool reflows without sideways scrolling", async ({ page }) => {
    await mockForecast(page);
    await fillAll(page);
    const overflow = await page.evaluate(() => {
      const body = document.querySelector(".help__body") as HTMLElement;
      return body.scrollWidth - body.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("keyboard only: from the city list, Tab through temperature, setting and work type", async ({ page }) => {
  await mockForecast(page);
  const dialog = await openHeat(page);
  // The city list is a native <select> (keyboard handling differs by OS, so
  // pick it directly), then everything else by keyboard.
  await dialog.getByLabel("Your city").selectOption({ label: "Modesto" });
  await expect(dialog.getByText("Today’s forecast high: about 97°F")).toBeVisible();
  await dialog.getByLabel("Your city").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab"); // past the Open-Meteo link
  await expect(dialog.getByLabel("Temperature at your worksite (°F)")).toBeFocused();
  await page.keyboard.type("90");
  await page.keyboard.press("Tab"); // into the Outdoors/Indoors group
  await page.keyboard.press("Space");
  await expect(dialog.getByRole("radio", { name: "Outdoors" })).toBeChecked();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(dialog.getByRole("radio", { name: "Farm or field work" })).toBeChecked();
  await expect(dialog.getByText("At 90°F outdoors, your employer must provide:")).toBeVisible();
});
