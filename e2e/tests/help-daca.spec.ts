// End-to-end: the DACA renewal timing tool (Immigration tab) in a real browser:
// each status from a typed expiration date, Spanish, the legal-help button,
// nothing sent while typing, WCAG 2.2 AA in light and dark, and a 320px phone.
// The page clock is fixed to Oct 22, 2026 (California) so the dates are stable.
import { test, expect, type Page, type Request } from "@playwright/test";
import { unexpected } from "./requests";
import AxeBuilder from "@axe-core/playwright";
import { addDays, longDate } from "../../frontend/src/help/dates";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TODAY = "2026-10-22";

async function open(page: Page, lang: "en" | "es" = "en") {
  await page.clock.setFixedTime(new Date("2026-10-22T12:00:00-07:00"));
  await page.goto("about:blank"); // a hash-only change wouldn't reload the app
  await page.goto(`./#${lang === "es" ? "lang=es&" : ""}help=immigration&hv=daca`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  await expect(dialog.locator("h3").first()).toBeVisible();
  return dialog;
}

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(".help__card").analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

const result = (page: Page) => page.locator(".hresult").first();

test("each status, from the expiration date", async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog.getByRole("tab", { name: "Immigration" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("button", { name: "DACA renewal" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText("Enter the date to see your renewal window.")).toBeVisible();
  const date = dialog.getByLabel("When does your DACA expire?");

  // 130 days left: inside the window, which runs 150 to 120 days before.
  await date.fill("2027-03-01");
  await expect(result(page)).toContainText("File your renewal now");
  await expect(result(page)).toContainText("130 days until your DACA expires.");
  const d = (n: number) => longDate(addDays("2027-03-01", n)!, "en-US");
  await expect(result(page)).toContainText(`USCIS’s recommended window: ${d(-150)} to ${d(-120)}.`);

  await date.fill("2027-06-01");
  await expect(result(page)).toContainText("Too early to file");
  await date.fill("2026-12-01");
  await expect(result(page)).toContainText("File as soon as you can");
  await expect(result(page)).not.toContainText("recommended window:");
  await date.fill(TODAY);
  await expect(result(page)).toContainText("Your DACA expires today.");
  await date.fill("2026-05-01");
  await expect(result(page)).toContainText("you can still renew");
  await expect(result(page)).toContainText("before May 1, 2027");
  await date.fill("2025-01-01");
  await expect(result(page)).toContainText("talk to a legal service first");
  await expect(result(page)).toContainText("USCIS is not deciding initial requests now");
  await date.fill("2030-06-01");
  await expect(result(page)).toContainText("DACA is granted for two years");
});

test("the facts: fees, the travel warning, local help, and the legal-help button", async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog.getByText(/The fee is \$555 online/)).toBeVisible();
  await expect(dialog.getByText(/Since August 13, 2026, a trip on advance parole/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "(209) 444-5910" })).toHaveAttribute("href", "tel:2094445910");
  await expect(dialog.getByRole("link", { name: "(209) 667-2378" })).toHaveAttribute("href", "tel:2096672378");
  await dialog.getByRole("button", { name: "See all free legal help near you" }).click();
  await expect(dialog.getByRole("tab", { name: "Legal help" })).toHaveAttribute("aria-selected", "true");
});

test("Spanish", async ({ page }) => {
  const dialog = await open(page, "es");
  await expect(dialog.getByRole("heading", { name: "Cuándo renovar DACA" })).toBeVisible();
  await dialog.getByLabel("¿Cuándo caduca su DACA?").fill("2027-03-01");
  await expect(result(page)).toContainText("Presente su renovación ahora");
  await expect(result(page)).toContainText("Faltan 130 días");
  await expect(dialog.getByRole("link", { name: /página oficial en español/ })).toHaveAttribute("href", "https://www.uscis.gov/es/DACA");
});

test("the chip updates the URL, and the date typed is never sent", async ({ page }) => {
  const dialog = await open(page);
  await dialog.getByRole("button", { name: "Know your rights" }).click();
  await expect(page).toHaveURL(/hv=rights/);
  await dialog.getByRole("button", { name: "DACA renewal" }).click();
  await expect(page).toHaveURL(/help=immigration&hv=daca/);
  const sent: Request[] = [];
  page.on("request", (r) => sent.push(r));
  await dialog.getByLabel("When does your DACA expire?").fill("2027-03-01");
  await expect(result(page)).toContainText("File your renewal now");
  expect(unexpected(sent)).toEqual([]);
  expect(sent.filter((r) => r.url().includes("2027"))).toEqual([]);
});

test("WCAG 2.2 AA (light and dark) with each result, and a 320px phone", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const dialog = await open(page);
    await expectNoA11yViolations(page);
    for (const date of ["2027-06-01", "2027-03-01", "2026-12-01", "2025-01-01"]) {
      await dialog.getByLabel("When does your DACA expire?").fill(date);
      await expect(result(page)).toBeVisible();
      await expectNoA11yViolations(page);
    }
  }
  await page.setViewportSize({ width: 320, height: 800 });
  for (const lang of ["en", "es"] as const) {
    const dialog = await open(page, lang);
    await dialog.locator('input[type="date"]').fill("2026-05-01");
    const overflow = await page.locator(".help__body").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, lang).toBeLessThanOrEqual(0);
  }
});

test.describe("public pages", () => {
  test.beforeEach(async ({ page }) => {
    const res = await page.request.get("help/");
    test.skip(!(await res.text()).includes('class="hero"'), "the Free help pages exist only in a build");
  });

  test("English and Spanish pages carry the window, fees and a link to the tool", async ({ page }) => {
    await page.goto("help/daca-renewal/");
    await expect(page.locator("h1")).toHaveText("When to renew DACA");
    await expect(page.getByText(/120 to 150 days/).first()).toBeVisible();
    await expect(page.getByText(/\$555 online/)).toBeVisible();
    await expect(page.locator('a[href*="hv=daca"]').first()).toBeVisible();
    await page.goto("ayuda/renovar-daca/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("h1")).toHaveText("Cuándo renovar DACA");
    await expect(page.getByText(/\$555 en línea/)).toBeVisible();
  });
});
