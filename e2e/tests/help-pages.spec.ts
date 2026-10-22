// End-to-end: the public "Free help" pages and printable flyers (built by
// frontend/scripts/prerender.mjs). They exist only in a build, so run this
// against `vite preview` or the live site, not the dev server:
//   BASE_URL=http://localhost:4173/stanislaus-cam-map/ npx playwright test help-pages
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LIVE = "https://enriquecorado.github.io/stanislaus-cam-map/";

const TOOL_PAGES = {
  en: ["hospital-bills", "benefits", "rent-increase", "eviction-notice", "repairs", "security-deposit", "mobile-home-space-rent", "unpaid-wages", "heat-at-work", "legal-aid"],
  es: ["cuentas-de-hospital", "beneficios", "aumento-de-renta", "aviso-de-desalojo", "reparaciones", "deposito", "renta-de-espacio-casa-movil", "salarios-no-pagados", "calor-en-el-trabajo", "ayuda-legal"],
};
const FLYERS = ["general", "hospital-bills", "renters", "workers", "cards"];
const ALL = [
  "help/",
  "ayuda/",
  ...TOOL_PAGES.en.map((s) => `help/${s}/`),
  ...TOOL_PAGES.es.map((s) => `ayuda/${s}/`),
  "help/flyers/",
  ...FLYERS.map((f) => `help/flyers/${f}/`),
];

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  const res = await page.request.get("help/");
  test.skip(!(await res.text()).includes('class="hero"'), "the Free help pages exist only in a build (vite preview or the live site)");
});

test("every page loads with one h1, the right language, and a canonical link", async ({ page }) => {
  for (const path of ALL) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1"), path).toHaveCount(1);
    const lang = path.startsWith("ayuda/") ? "es" : "en";
    await expect(page.locator("html"), path).toHaveAttribute("lang", lang);
    await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute("href", `${LIVE}${path}`);
    expect((await page.title()).length, path).toBeGreaterThan(10);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description?.length ?? 0, path).toBeGreaterThan(40);
  }
});

test("each page's language switch goes to the same page in the other language", async ({ page }) => {
  for (let i = 0; i < TOOL_PAGES.en.length; i++) {
    await page.goto(`help/${TOOL_PAGES.en[i]}/`);
    await page.getByRole("link", { name: "Ver esta página en español" }).click();
    await expect(page).toHaveURL(new RegExp(`ayuda/${TOOL_PAGES.es[i]}/$`));
    await expect(page.locator('link[hreflang="en"]')).toHaveAttribute("href", `${LIVE}help/${TOOL_PAGES.en[i]}/`);
  }
});

test("no broken links between the pages", async ({ page, request }) => {
  const internal = new Set<string>();
  for (const path of ALL) {
    await page.goto(path);
    for (const href of await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) {
      const u = new URL(href);
      if (u.origin === new URL(page.url()).origin) internal.add(u.origin + u.pathname);
    }
  }
  for (const url of internal) {
    expect((await request.get(url)).status(), url).toBe(200);
  }
  // Every page is reachable from another page.
  const origin = new URL(page.url()).origin;
  const base = new URL(page.url()).pathname.replace(/(help|ayuda)\/.*$/, "");
  for (const path of ALL) expect(internal.has(`${origin}${base}${path}`), path).toBe(true);
});

test("pages make no requests beyond the page itself, and the browser enforces it", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => m.type() === "error" && blocked.push(m.text()));
  for (const path of ALL) {
    const urls: string[] = [];
    const log = (r: { url(): string }) => urls.push(r.url());
    page.on("request", log);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    page.off("request", log);
    expect(urls, path).toEqual([page.url()]);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp, path).toContain("default-src 'none'");
    await expect(page.locator('meta[name="referrer"]'), path).toHaveAttribute("content", "no-referrer");
  }
  // The theme and Print scripts are allowed by hash: no CSP errors anywhere.
  expect(blocked).toEqual([]);
});

test("“Open the free tool” lands on the right tool, in the page's language", async ({ page }) => {
  await page.goto("ayuda/aviso-de-desalojo/");
  await page.getByRole("link", { name: /Abrir la herramienta gratis/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Ayuda gratis" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Inquilinos" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("button", { name: "¿Recibió un aviso de desalojo?" })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/lang=es.*help=rent&hv=eviction/);

  await page.goto("help/heat-at-work/");
  await page.getByRole("link", { name: /Open the free tool/ }).first().click();
  const en = page.getByRole("dialog", { name: "Free help" });
  await expect(en.getByRole("tab", { name: "Work" })).toHaveAttribute("aria-selected", "true");
  await expect(en.getByRole("button", { name: "Heat at work today" })).toHaveAttribute("aria-pressed", "true");
  // Switching tools inside the panel keeps the URL in step, so a shared link opens the same tool.
  await en.getByRole("button", { name: "Unpaid wages" }).click();
  await expect(page).toHaveURL(/help=work&hv=wages/);
});

test("WCAG 2.2 AA in light and dark, and no sideways scrolling on a phone", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of ["help/", "ayuda/", "help/hospital-bills/", "ayuda/ayuda-legal/", "help/benefits/", "help/flyers/", "help/flyers/general/"]) {
      await page.goto(path);
      await expectNoA11yViolations(page);
    }
  }
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of ["help/", "ayuda/salarios-no-pagados/", "help/legal-aid/", "help/flyers/renters/", "help/flyers/cards/"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("the theme chosen in the map app carries over", async ({ page }) => {
  await page.goto("help/");
  await page.evaluate(() => localStorage.setItem("scm-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(15, 20, 25)");
  // Flyers stay light: they are made for paper.
  await page.goto("help/flyers/general/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => localStorage.removeItem("scm-theme"));
});

test("flyer QR codes decode to the live pages, and each flyer prints on one letter page", async ({ page, browserName }) => {
  await page.addInitScript({ path: join(__dirname, "../node_modules/jsqr/dist/jsQR.js") });
  const expected: Record<string, string[]> = {
    general: [`${LIVE}help/`, `${LIVE}ayuda/`],
    "hospital-bills": [`${LIVE}help/hospital-bills/`, `${LIVE}ayuda/cuentas-de-hospital/`],
    renters: [`${LIVE}help/#housing`, `${LIVE}ayuda/#vivienda`],
    workers: [`${LIVE}help/#work`, `${LIVE}ayuda/#trabajo`],
  };
  for (const [id, urls] of Object.entries(expected)) {
    await page.goto(`help/flyers/${id}/`);
    // Paint each code's path onto a canvas (no image load: the page's CSP
    // allows none) and decode the pixels.
    const decoded = await page.locator("svg.qr").evaluateAll((svgs) =>
      svgs.map((svg) => {
        const size = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
        const px = 400;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = px;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, px, px);
        ctx.scale(px / size, px / size);
        ctx.fillStyle = "#000";
        ctx.fill(new Path2D(svg.querySelector("path")!.getAttribute("d")!));
        const data = ctx.getImageData(0, 0, px, px);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((window as any).jsQR(data.data, px, px)?.data as string | undefined) ?? null;
      }),
    );
    expect(decoded, id).toEqual(urls);
  }
  // Nothing spills past the printed sheet (it would print on a second page or be cut off).
  await page.emulateMedia({ media: "print" });
  for (const id of FLYERS) {
    await page.goto(`help/flyers/${id}/`);
    const spill = await page.evaluate(() => {
      const sheet = document.querySelector(".sheet")!.getBoundingClientRect();
      const bottoms = [...document.querySelectorAll(".sheet *")].map((el) => el.getBoundingClientRect().bottom);
      return Math.max(...bottoms) - sheet.bottom;
    });
    expect(spill, id).toBeLessThanOrEqual(0);
  }
  // Back to the default (page.pdf prints with screen styles if "screen" is forced).
  await page.emulateMedia({ media: null });
  // The card sheet repeats one code pair four times.
  await page.goto("help/flyers/cards/");
  await expect(page.locator("svg.qr")).toHaveCount(8);

  test.skip(browserName !== "chromium", "PDF printing is Chromium-only");
  for (const id of FLYERS) {
    await page.goto(`help/flyers/${id}/`);
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString("latin1");
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length, id).toBe(1);
    expect(pdf, id).toMatch(/\/MediaBox\s*\[0 0 612 792\]/);
  }
});

test("rules keep their headings, so conditional rules never read as always-on", async ({ page }) => {
  await page.goto("help/heat-at-work/");
  for (const h of ["Outdoors, every work day", "Outdoors, above 80°F", "Outdoors, at 95°F or more (high-heat rules)", "Indoors at 82°F or more"]) {
    await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  }
  const high = page.locator("section", { has: page.getByRole("heading", { name: /95°F or more/ }) });
  await expect(high).toContainText("every 2 hours");
  await page.goto("ayuda/aumento-de-renta/");
  const exempt = page.locator("section", { has: page.getByRole("heading", { name: "Viviendas que el límite no cubre" }) });
  await expect(exempt).toContainText("Dormitorios");
});

test("home page groups link every tool page, and the Print button prints", async ({ page }) => {
  await page.goto("ayuda/");
  for (const slug of TOOL_PAGES.es) {
    await expect(page.locator(`main a[href$="/ayuda/${slug}/"]`), slug).toHaveCount(1);
  }
  await page.goto("help/flyers/general/");
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).printed = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.print = () => void (window as any).printed++;
  });
  await page.getByRole("button", { name: /Print this flyer/ }).click();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(await page.evaluate(() => (window as any).printed)).toBe(1);
});
