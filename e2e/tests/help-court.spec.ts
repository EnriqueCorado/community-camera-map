// End-to-end: the immigration court guide (Immigration tab) in a real browser:
// the A-Number helper (formatting, the 8-digit case, never sent or stored), the
// links in from the rights page and the DACA tool, Spanish, the public pages,
// WCAG 2.2 AA in light and dark, and a 320px phone.
import { test, expect, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { unexpected } from "./requests";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TITLE = "Immigration court: find your hearing and keep your case on track";

async function open(page: Page, view = "court", lang: "en" | "es" = "en") {
  await page.goto("about:blank"); // a hash-only change wouldn't reload the app
  await page.goto(`./#${lang === "es" ? "lang=es&" : ""}help=immigration&hv=${view}`);
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

test("the guide: the warning first, the closest courts, and the San Francisco closure", async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog.getByRole("button", { name: "Immigration court" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("heading", { level: 3, name: TITLE })).toBeVisible();
  await expect(dialog.locator(".hresult").first()).toContainText("Go to every hearing, and talk to a lawyer first");
  await expect(dialog.locator(".hplaces strong").filter({ hasText: /^(Sacramento|Concord) Immigration Court$/ })).toHaveText(["Sacramento Immigration Court", "Concord Immigration Court"]);
  await expect(dialog.getByText(/closed for good on September 4, 2026/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "(916) 447-9301" })).toHaveAttribute("href", "tel:9164479301");
  await expect(dialog.getByRole("link", { name: /Check online with EOIR/ })).toHaveAttribute("href", "https://acis.eoir.justice.gov/en/");
});

test("the A-Number helper formats the number and never sends, stores or links it", async ({ page }) => {
  const dialog = await open(page);
  const sent: Request[] = [];
  page.on("request", (r) => sent.push(r));
  const box = dialog.getByLabel("Your A-Number");
  await expect(box).toHaveAttribute("autocomplete", "off");
  await expect(box).toHaveAttribute("spellcheck", "false");

  await box.fill("123");
  await expect(dialog.getByText("Check the number: an A-Number has 8 or 9 digits.")).toBeVisible();
  await box.fill("A 98765432");
  await expect(dialog.getByText("Your A-Number, to read back: A-098-765-432")).toBeVisible();
  await expect(dialog.getByText(/Yours has 8 digits/)).toBeVisible();
  await expect(dialog.getByText("Call 1-800-898-7180 and type these 9 digits: 0 9 8 7 6 5 4 3 2")).toBeVisible();
  await box.fill("A-555-123-456");
  await expect(dialog.getByText("Your A-Number, to read back: A-555-123-456")).toBeVisible();
  await expect(dialog.getByText(/Yours has 8 digits/)).toHaveCount(0);

  // Nowhere but the page itself: not in a request, the URL, a link, or storage.
  expect(unexpected(sent)).toEqual([]);
  for (const r of sent) expect(r.url() + (r.postData() ?? "")).not.toMatch(/98765432|555123456/);
  expect(page.url()).not.toMatch(/98765432|555123456/);
  const hrefs = await dialog.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  for (const h of hrefs) expect(h).not.toMatch(/98765432|555123456/);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(stored).not.toMatch(/98765432|555123456/);
});

test("the rights page and the DACA tool link to the guide, and focus follows", async ({ page }) => {
  let dialog = await open(page, "rights");
  await dialog.getByRole("button", { name: /Immigration court: find a hearing date/ }).click();
  await expect(page).toHaveURL(/hv=court/);
  await expect(dialog.getByRole("heading", { level: 3, name: TITLE })).toBeFocused();

  dialog = await open(page, "daca");
  await dialog.getByRole("button", { name: /See the immigration court guide/ }).click();
  await expect(page).toHaveURL(/hv=court/);
  await expect(dialog.getByRole("heading", { level: 3, name: TITLE })).toBeFocused();

  // And the guide links to the family plan.
  await dialog.getByRole("button", { name: "Make a family emergency plan" }).click();
  await expect(page).toHaveURL(/hv=plan/);
});

test("Spanish", async ({ page }) => {
  const dialog = await open(page, "court", "es");
  await expect(dialog.getByRole("heading", { level: 3, name: /Corte de inmigración: encuentre su audiencia/ })).toBeVisible();
  await expect(dialog.getByText(/cerró definitivamente el 4 de septiembre de 2026/)).toBeVisible();
  await dialog.getByLabel("Su Número A (A-Number)").fill("12345678");
  await expect(dialog.getByText("Su Número A, para leerlo: A-012-345-678")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Revisar en línea/ })).toHaveAttribute("href", "https://acis.eoir.justice.gov/es/");
});

test("the public pages", async ({ page }) => {
  for (const [path, h1] of [
    ["help/immigration-court/", TITLE],
    ["ayuda/corte-de-inmigracion/", "Corte de inmigración: encuentre su audiencia y mantenga su caso al día"],
  ] as const) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1"), path).toHaveText(h1);
    await expect(page.locator("main"), path).toContainText(/1-800-898-7180/);
    await expect(page.locator("main"), path).toContainText(/Concord/);
  }
});

test("WCAG 2.2 AA (light and dark) and a 320px phone", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const dialog = await open(page);
    await dialog.getByLabel("Your A-Number").fill("A12345678");
    await dialog.locator(".hsources summary").click();
    await expectNoA11yViolations(page);
  }
  await page.setViewportSize({ width: 320, height: 720 });
  await open(page);
  const overflow = await page.evaluate(() => {
    const card = document.querySelector(".help__card")!;
    return card.scrollWidth - card.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});
