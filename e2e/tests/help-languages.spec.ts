// End-to-end: the Punjabi and Dari pages and flyers (built by prerender.mjs,
// so run against `vite preview` or the live site):
//   BASE_URL=http://localhost:5195/community-camera-map/ npx playwright test help-languages
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LIVE = "https://enriquecorado.github.io/community-camera-map/";
const PAGES = [
  { path: "help/punjabi/", flyer: "help/flyers/punjabi/", lang: "pa", dir: "ltr", h1: "ਸਟੈਨਿਸਲੌਸ ਕਾਊਂਟੀ ਵਿੱਚ ਮੁਫ਼ਤ ਮਦਦ", name: "Punjabi" },
  { path: "help/dari/", flyer: "help/flyers/dari/", lang: "fa-AF", dir: "rtl", h1: "کمک رایگان در کاونتی ستانیسلاس", name: "Dari" },
] as const;
/** Lines whose own sites state language help, and the two newcomer agencies (Dari page). */
const VERIFIED = new Set(["+18335264636", "+12095773811", "+18776520734", "+12095303247", "+18009218879", "+12096672378", "+12094912712"]);

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  const res = await page.request.get("help/punjabi/");
  test.skip(res.status() !== 200, "the language pages exist only in a build (vite preview or the live site)");
});

test("each page: its language and direction, one h1, the AI note and a canonical link", async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p.path);
    await expect(page.locator("html")).toHaveAttribute("lang", p.lang);
    await expect(page.locator("html")).toHaveAttribute("dir", p.dir);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(p.h1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${LIVE}${p.path}`);
    // Honest label, in the language and in English, with a plain mailto for corrections.
    const note = page.locator(".langnote");
    await expect(note).toContainText(`not yet been checked by a native ${p.name} speaker`);
    await expect(note.locator('a[href^="mailto:"]')).toHaveAttribute("href", new RegExp(`subject=Correction%3A%20${p.name}%20page$`));
    // The interpreter request is shown in English, for the reader to say or show.
    await expect(page.locator(".say__en")).toHaveText(`I need a ${p.name} interpreter, please.`);
    await expect(page.locator(".say__en")).toHaveAttribute("lang", "en");
  }
});

test("every tool is listed, with working links to its English and Spanish pages", async ({ page, request }) => {
  await page.goto("help/");
  const englishTools = await page.locator(".cards .card").count();
  for (const p of PAGES) {
    await page.goto(p.path);
    const tools = page.locator(".ltool");
    await expect(tools).toHaveCount(englishTools);
    for (const href of await page.locator(".ltool__links a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) {
      expect(href).toMatch(/\/(help|ayuda)\/[a-z-]+\/$/);
      expect((await request.get(href)).status(), href).toBe(200);
    }
    await expect(page.locator(".ltool__links a")).toHaveCount(englishTools * 2);
    // Each link's accessible name includes its visible text and the tool.
    const first = page.locator(".ltool").first();
    await expect(first.getByRole("link", { name: /English/ })).toHaveAttribute("hreflang", "en");
    await expect(first.getByRole("link", { name: /Español/ })).toHaveAttribute("hreflang", "es");
  }
});

test("only verified phone numbers, red cards from ILRC, and newcomer agencies kept apart", async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p.path);
    const tels = await page.locator('a[href^="tel:"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(tels.length).toBeGreaterThanOrEqual(4);
    for (const t of tels) expect(VERIFIED, `${p.path} ${t}`).toContain(t.replace("tel:", ""));
    // Numbers stay left to right inside Dari.
    for (const dir of await page.locator('a[href^="tel:"]').evaluateAll((as) => as.map((a) => a.getAttribute("dir")))) expect(dir).toBe("ltr");
    const cards = await page.locator('#red ~ ul a, section[aria-labelledby="red"] a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) expect(c).toMatch(/^https:\/\/www\.ilrc\.org\//);
  }
  await page.goto("help/dari/");
  // IRC and World Relief don't name Dari, so they're not under "lines with an interpreter".
  await expect(page.locator('section[aria-labelledby="lines"]')).not.toContainText("IRC");
  await expect(page.locator('section[aria-labelledby="newcomers"]')).toContainText("IRC");
  await expect(page.locator('section[aria-labelledby="newcomers"]')).toContainText("World Relief");
});

test("the English and Spanish home pages and the flyer index link to both", async ({ page }) => {
  for (const [home, heading] of [["help/", "Other languages"], ["ayuda/", "Otros idiomas"]] as const) {
    await page.goto(home);
    const section = page.locator('section[aria-labelledby="other-langs"]');
    await expect(section.getByRole("heading", { name: heading })).toBeVisible();
    await expect(section.getByRole("link", { name: /Punjabi/ })).toHaveAttribute("href", /help\/punjabi\/$/);
    await expect(section.getByRole("link", { name: /Dari/ })).toHaveAttribute("href", /help\/dari\/$/);
    await expect(section.locator('span[lang="fa-AF"][dir="rtl"]')).toHaveText("دری");
  }
  await page.goto("help/flyers/");
  for (const p of PAGES) await expect(page.locator(`a[href$="${p.flyer}"]`)).toHaveCount(1);
});

test("flyers: QR code to the live page, print button, always light", async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p.flyer);
    await expect(page.locator("html")).toHaveAttribute("dir", p.dir);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("svg.qr")).toHaveAttribute("aria-label", `QR: ${LIVE}${p.path}`);
    await expect(page.locator(".fside__url")).toHaveText(`${LIVE}${p.path}`.replace("https://", "").replace(/\/$/, ""));
    await expect(page.getByRole("button", { name: /Print/ })).toBeVisible();
    await expect(page.locator(".lflyer__en")).toContainText(`explained in ${p.name}`);
  }
});

test("no requests beyond the page, and the CSP holds", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const path of PAGES.flatMap((p) => [p.path, p.flyer])) {
    const urls: string[] = [];
    const log = (r: { url(): string }) => urls.push(r.url());
    page.on("request", log);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    page.off("request", log);
    expect(urls.filter((u) => u !== page.url() && !/\/help\/sw\.js$/.test(new URL(u).pathname)), path).toEqual([]);
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content"), path).toContain("default-src 'none'");
  }
  expect(errors).toEqual([]);
});

test("keyboard: the skip link comes first and lands on the content", async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p.path);
    await page.keyboard.press("Tab");
    const skip = page.locator("a.skip");
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  }
});

test("WCAG 2.2 AA in light and dark, and no sideways scrolling at 320px", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of PAGES.flatMap((p) => [p.path, p.flyer])) {
      await page.goto(path);
      await expectNoA11yViolations(page);
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of PAGES.flatMap((p) => [p.path, p.flyer])) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  // The large-text setting from the map app applies here too.
  await page.goto(PAGES[1].path);
  await page.evaluate(() => localStorage.setItem("scm-text", "large"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
