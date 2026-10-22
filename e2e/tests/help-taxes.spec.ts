// End-to-end: the free tax help guide (Benefits tab) and its public pages, in
// a real browser — the season box, the credits table, tappable phone numbers,
// the way to legal help, Spanish, accessibility (light and dark), a 320px
// phone, and nothing sent while reading.
import { test, expect, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(page: Page, lang: "en" | "es" = "en") {
  await page.goto("about:blank"); // a hash-only change wouldn't reload the app
  await page.goto(`./#${lang === "es" ? "lang=es&" : ""}help=benefits&hv=taxes`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  // The tab loads on demand: wait for the guide's heading.
  await expect(dialog.getByRole("heading", { level: 3, name: lang === "es" ? "Ayuda gratis con impuestos para 2027" : "Free tax help for 2027" })).toBeVisible();
  return dialog;
}

async function expectNoA11yViolations(page: Page, include: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(include).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test("the guide: the season, the credits table, local help and a way to legal help", async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog.getByRole("tab", { name: "Benefits" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("button", { name: "Free tax help (2027)" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText(/tax year 2026 returns, due April 15, 2027/)).toBeVisible();
  const table = dialog.getByRole("table", { name: /Most you can get from each credit/ });
  await expect(table.locator("tbody tr")).toHaveCount(4);
  const most = table.getByRole("row", { name: /3 or more/ });
  await expect(most).toContainText("$3,756");
  await expect(most).toContainText("$8,231");
  await expect(most).toContainText("$70,244");
  await expect(table.getByRole("columnheader", { name: "CalEITC, up to (tax year 2025)" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "(209) 523-4562" })).toHaveAttribute("href", "tel:2095234562");
  await expect(dialog.getByRole("link", { name: "(844) 545-5640" })).toHaveAttribute("href", "tel:8445455640");
  await expect(dialog.getByText(/Social Security number OR an ITIN/)).toBeVisible();
  await expect(dialog.getByText(/more than 47,000 records/)).toBeVisible();
  await dialog.getByRole("button", { name: "Find free immigration legal help" }).click();
  await expect(dialog.getByRole("tab", { name: "Legal help" })).toHaveAttribute("aria-selected", "true");
});

test("in Spanish", async ({ page }) => {
  const dialog = await open(page, "es");
  await expect(dialog.getByText(/vencen el 15 de abril de 2027/)).toBeVisible();
  await expect(dialog.getByRole("row", { name: /3 o más/ })).toContainText("$8,231");
  await expect(dialog.getByRole("heading", { name: "Evite las estafas de impuestos" })).toBeVisible();
});

test("the chip updates the URL, and reading sends nothing", async ({ page }) => {
  await page.goto("about:blank");
  await page.goto("./#help=benefits");
  const dialog = page.getByRole("dialog", { name: "Free help" });
  const sent: Request[] = [];
  page.on("request", (r) => sent.push(r));
  await dialog.getByRole("button", { name: "Free tax help (2027)" }).click();
  await expect(page).toHaveURL(/help=benefits&hv=taxes/);
  await expect(dialog.getByRole("heading", { level: 3, name: "Free tax help for 2027" })).toBeVisible();
  await dialog.getByText("Where this comes from").or(dialog.locator(".hsources summary")).first().click();
  expect(sent.filter((r) => !/\.(js|css|woff2?|png|svg|json|pbf)(\?|$)/.test(r.url()) && !r.url().includes("tiles"))).toEqual([]);
});

test("WCAG 2.2 AA (light and dark) and a 320px phone", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const dialog = await open(page);
    await dialog.locator(".hsources summary").click();
    await expectNoA11yViolations(page, ".help__card");
  }
  await page.setViewportSize({ width: 320, height: 800 });
  for (const lang of ["en", "es"] as const) {
    await open(page, lang);
    const overflow = await page.locator(".help__body").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, lang).toBeLessThanOrEqual(0);
  }
});

test("public pages in English and Spanish", async ({ page }) => {
  for (const [path, h1, phone] of [
    ["help/free-tax-help/", "Free tax help for 2027", "(209) 523-4562"],
    ["ayuda/impuestos-gratis/", "Ayuda gratis con impuestos para 2027", "(209) 523-4562"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
    await expect(page.getByText(phone).first()).toBeVisible();
    await expect(page.getByText(/\$8,231/).first()).toBeVisible();
    await expectNoA11yViolations(page, "body");
  }
});
