// End-to-end: the gas and electric bill tool (Benefits tab) and its public
// pages, in a real browser: the discounts for each utility, the shutoff rules,
// tappable phone numbers, Spanish, accessibility (light and dark), a 320px
// phone, and nothing sent while someone types.
import { test, expect, type Page, type Request } from "@playwright/test";
import { unexpected } from "./requests";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(page: Page, lang: "en" | "es" = "en") {
  await page.goto("about:blank"); // a hash-only change wouldn't reload the app
  await page.goto(`./#${lang === "es" ? "lang=es&" : ""}help=benefits&hv=utilities`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  await expect(dialog.getByRole("heading", { level: 3, name: lang === "es" ? "Ayuda con las facturas de luz y gas" : "Help with gas and electric bills" })).toBeVisible();
  return dialog;
}

async function expectNoA11yViolations(page: Page, include: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(include).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test("a MID home: its own discount first, then PG&E CARE once the gas bill is answered", async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog.getByText("Choose who sends your electric bill and enter your income to see your results.")).toBeVisible();
  await dialog.getByRole("radio", { name: "MID (Modesto Irrigation District)" }).check();
  await dialog.getByLabel("People in your household").selectOption("3");
  await dialog.getByLabel("Household income before taxes").fill("4,000");
  const results = dialog.getByRole("region", { name: "What you may get" });
  await expect(results.getByRole("heading", { name: /MID CARES/ })).toBeVisible();
  await expect(results.getByRole("heading", { name: /PG&E CARE/ })).toHaveCount(0);
  await expect(results.getByText(/Answer whether PG&E sends you a gas bill/)).toBeVisible();
  await dialog.getByRole("group", { name: "Do you also get a GAS bill from PG&E?" }).getByRole("radio", { name: "Yes" }).check();
  await expect(results.getByRole("heading", { name: /PG&E CARE/ })).toBeVisible();
  // 3 people at $4,000 a month is under MID's $4,553 limit.
  await expect(results.getByRole("article", { name: /MID CARES/ })).toHaveClass(/hresult--good/);
});

test("PG&E: CARE, or FERA just above it, and the shutoff rules with tappable numbers", async ({ page }) => {
  const dialog = await open(page);
  await dialog.getByRole("radio", { name: "PG&E" }).check();
  await dialog.getByLabel("People in your household").selectOption("4");
  await dialog.getByLabel("Household income before taxes").fill("70000");
  await dialog.getByRole("radio", { name: /year/i }).check();
  const results = dialog.getByRole("region", { name: "What you may get" });
  // $70,000 for 4 is over CARE's $66,000 and under FERA's $82,500.
  await expect(results.getByRole("article", { name: /FERA/ })).toHaveClass(/hresult--good/);
  await expect(results.getByRole("article", { name: /PG&E CARE/ })).toHaveClass(/hresult--info/);
  // The shutoff box jumps to the rules.
  await dialog.getByRole("button", { name: "What the rules say about shutoffs" }).click();
  await expect(dialog.getByRole("heading", { level: 4, name: "If you get a shutoff notice" })).toBeFocused();
  await expect(dialog.getByText(/spreads what you owe over 24 months/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "1-800-649-7570" })).toHaveAttribute("href", "tel:18006497570");
  await expect(dialog.getByRole("link", { name: "(209) 537-9217" }).first()).toHaveAttribute("href", "tel:2095379217");
});

test("in Spanish", async ({ page }) => {
  const dialog = await open(page, "es");
  await expect(dialog.getByRole("heading", { name: "Si recibe un aviso de corte" })).toBeVisible();
  await dialog.getByRole("radio", { name: "TID (Distrito de Riego de Turlock)" }).check();
  await dialog.getByLabel("Ingresos del hogar antes de impuestos").fill("1500");
  await expect(dialog.getByRole("region", { name: "Lo que puede recibir" }).getByRole("heading", { name: /TID CARES/ })).toBeVisible();
  await expect(dialog.getByText(/reparte lo que debe en 24 meses/)).toBeVisible();
});

test("the chip updates the URL, and typing sends nothing", async ({ page }) => {
  await page.goto("about:blank");
  await page.goto("./#help=benefits");
  const dialog = page.getByRole("dialog", { name: "Free help" });
  const sent: Request[] = [];
  page.on("request", (r) => sent.push(r));
  await dialog.getByRole("button", { name: "Gas and electric bills" }).click();
  await expect(page).toHaveURL(/help=benefits&hv=utilities/);
  await dialog.getByRole("radio", { name: "PG&E" }).check();
  await dialog.getByLabel("Household income before taxes").fill("31337");
  await expect(dialog.getByRole("region", { name: "What you may get" }).getByRole("article").first()).toBeVisible();
  expect(unexpected(sent)).toEqual([]);
  for (const r of sent) expect(r.url() + (r.postData() ?? "")).not.toContain("31337");
  expect(page.url()).not.toContain("31337");
});

test("WCAG 2.2 AA (light and dark) with results, and a 320px phone", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const dialog = await open(page);
    await dialog.getByRole("radio", { name: "I’m not sure" }).check();
    await dialog.getByLabel("Household income before taxes").fill("2500");
    await expect(dialog.getByRole("region", { name: "What you may get" }).getByRole("article").first()).toBeVisible();
    await dialog.locator(".hsources summary").click();
    await expectNoA11yViolations(page, ".help__card");
  }
  await page.setViewportSize({ width: 320, height: 720 });
  const dialog = await open(page, "es");
  await dialog.getByRole("radio", { name: "PG&E" }).check();
  await dialog.getByLabel("Ingresos del hogar antes de impuestos").fill("2500");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the public pages", async ({ page }) => {
  for (const [path, h1, text] of [
    ["help/utility-bills/", "Help with gas and electric bills", /spreads what you owe over 24 months/],
    ["ayuda/facturas-de-luz-y-gas/", "Ayuda con las facturas de luz y gas", /reparte lo que debe en 24 meses/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByRole("link", { name: "(209) 537-9217" }).first()).toHaveAttribute("href", /^tel:(\+1)?2095379217$/);
  }
});
