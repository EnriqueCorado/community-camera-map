// End-to-end: the page for partner organizations (help/partners/,
// ayuda/socios/) and the "See something wrong? Tell us" email link on every
// public page and every Help tool. Public pages exist only in a build:
//   BASE_URL=http://localhost:4173/community-camera-map/ npx playwright test help-partners
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { REPORT_EMAIL } from "../../frontend/src/help/report";
import { longDate } from "../../frontend/src/help/dates";
import { BENEFITS_VIEWS, HELP_TABS, IMMIGRATION_VIEWS, RENT_VIEWS, WORK_VIEWS, type HelpTab } from "../../frontend/src/help/target";
import { TOOLS } from "../../frontend/src/landing/tools";
import { FLYERS } from "../../frontend/src/landing/flyers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LIVE = "https://enriquecorado.github.io/community-camera-map/";
const VIEWS: Partial<Record<HelpTab, readonly string[]>> = { rent: RENT_VIEWS, work: WORK_VIEWS, benefits: BENEFITS_VIEWS, immigration: IMMIGRATION_VIEWS };

async function expectNoA11yViolations(page: Page, include?: string) {
  const axe = new AxeBuilder({ page }).withTags(WCAG);
  const { violations } = await (include ? axe.include(include) : axe).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

/** The parts of a mailto: link, decoded the way a mail app does. */
function parse(href: string | null) {
  const m = /^mailto:([^?]+)\?subject=([^&]*)&body=([^&]*)$/.exec(href ?? "");
  expect(m, href ?? "").not.toBeNull();
  return { to: m![1], subject: decodeURIComponent(m![2]!), body: decodeURIComponent(m![3]!) };
}

test.describe("public pages", () => {
  test.beforeEach(async ({ page }) => {
    const res = await page.request.get("help/");
    test.skip(!(await res.text()).includes('class="hero"'), "the Free help pages exist only in a build (vite preview or the live site)");
  });

  test("every page's footer has the correction link, with the page and its checked date", async ({ page }) => {
    const pages: { path: string; lang: "en" | "es"; subject: string; checked?: string }[] = [
      { path: "help/", lang: "en", subject: "Correction: Free help with hospital bills, rent, work and benefits | Stanislaus County" },
      { path: "help/flyers/", lang: "en", subject: "Correction: Free printable flyers" },
      ...TOOLS.flatMap((t) => [
        { path: `help/${t.slug.en}/`, lang: "en" as const, subject: `Correction: ${t.name.en} (checked ${longDate(t.checked, "en-US")})`, checked: t.checked },
        { path: `ayuda/${t.slug.es}/`, lang: "es" as const, subject: `Corrección: ${t.name.es} (revisado el ${longDate(t.checked, "es-US")})`, checked: t.checked },
      ]),
    ];
    for (const p of pages) {
      await page.goto(p.path);
      const link = page.locator("footer a[data-report]");
      await expect(link, p.path).toHaveCount(1);
      await expect(link, p.path).toHaveText(p.lang === "en" ? /^See something wrong\? Tell us/ : /^¿Ve algo incorrecto\? Avísenos/);
      const { to, subject, body } = parse(await link.getAttribute("href"));
      expect(to, p.path).toBe(REPORT_EMAIL);
      expect(subject, p.path).toBe(p.subject);
      // The body names the live page, so a correction can't be about the wrong one.
      if (p.path !== "help/") expect(body, p.path).toContain(`${LIVE}${p.path}`);
    }
    // Flyers are for paper: no footer, no link on the printed sheet.
    await page.goto(`help/flyers/${FLYERS[0]!.id}/`);
    await expect(page.locator("a[data-report]")).toHaveCount(0);
  });

  test("partners page: flyers, a paragraph per tool in both languages, links, and a way to ask for help", async ({ page }) => {
    await page.goto("help/");
    await page.getByRole("link", { name: "For community organizations: flyers and ready-to-share text" }).click();
    await expect(page).toHaveURL(/help\/partners\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("For community organizations: free flyers and ready-to-share text");
    await expect(page.getByRole("heading", { name: "What we never do" })).toBeVisible();
    await expect(page.getByText("We never track the people you send us")).toBeVisible();
    // Every flyer, every tool (plus the all-tools paragraph), in both languages.
    await expect(page.locator("#flyers ~ .cards a.card, section[aria-labelledby=flyers] a.card")).toHaveCount(FLYERS.length);
    await expect(page.locator("article.blurb")).toHaveCount(TOOLS.length + 1);
    await expect(page.locator(".blurb__text")).toHaveCount(2 * (TOOLS.length + 1));
    await expect(page.locator('.blurb__text[lang="es"]')).toHaveCount(TOOLS.length + 1);
    const rights = page.locator("article.blurb", { has: page.getByRole("heading", { name: "Know your rights with immigration agents" }) });
    await expect(rights.locator(".blurb__text").first()).toHaveText(/^Know your rights with immigration agents: .+ https:\/\/enriquecorado\.github\.io\/community-camera-map\/help\/know-your-rights\/$/);
    await expect(rights.locator('.blurb__text[lang="es"]')).toHaveText(/\/ayuda\/conozca-sus-derechos\/$/);
    await expect(rights.getByRole("link", { name: "Page in Spanish" })).toHaveAttribute("href", /\/ayuda\/conozca-sus-derechos\/$/);
    const ask = parse(await page.getByRole("link", { name: /Email to ask for flyers or a talk/ }).getAttribute("href"));
    expect(ask.subject).toBe("Printed flyers or a talk");
    expect(ask.body).toContain("Organization:\r\nCity:");

    await page.getByRole("link", { name: "Ver esta página en español" }).click();
    await expect(page).toHaveURL(/ayuda\/socios\/$/);
    await expect(page.getByRole("heading", { name: "Lo que nunca hacemos" })).toBeVisible();
    await expect(page.locator('.blurb__text[lang="en"]')).toHaveCount(TOOLS.length + 1);
    const pide = parse(await page.getByRole("link", { name: /Escribir para pedir volantes/ }).getAttribute("href"));
    expect(pide.subject).toBe("Volantes impresos o una plática");
  });

  test("Copy puts the exact paragraph on the clipboard and says so", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    for (const [path, name, status] of [
      ["help/partners/", "Copy the Spanish text: Unpaid wages", /^Copied: Unpaid wages\./],
      ["ayuda/socios/", "Copiar el texto en español: Salarios no pagados", /^Copiado: Salarios no pagados\./],
    ] as const) {
      await page.goto(path);
      const button = page.getByRole("button", { name, exact: true });
      await button.click();
      const item = page.locator(".blurb__item", { has: button });
      await expect(item.getByRole("status")).toHaveText(status);
      const expected = (await item.locator(".blurb__text").textContent())!.trim();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
      expect(expected).toMatch(/salarios-no-pagados\/$/);
      // Only one confirmation shows at a time.
      await page.locator("button[data-copy]").first().click();
      await expect(page.locator("[data-copy-status]:not(:empty)")).toHaveCount(1);
    }
  });

  test("without a clipboard the buttons stay hidden; a failed copy selects the text instead", async ({ browser }) => {
    const none = await browser.newPage();
    await none.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: undefined }));
    await none.goto("help/partners/");
    await expect(none.locator("button[data-copy]:visible")).toHaveCount(0);
    await expect(none.locator(".blurb__text").first()).toBeVisible();
    await none.close();

    const failing = await browser.newPage();
    await failing.addInitScript(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
    });
    await failing.goto("help/partners/");
    const button = failing.getByRole("button", { name: "Copy the English text: Heat at work today", exact: true });
    await button.click();
    const item = failing.locator(".blurb__item", { has: button });
    await expect(item.getByRole("status")).toHaveText(/^Couldn’t copy automatically/);
    const text = (await item.locator(".blurb__text").textContent())!.trim();
    expect(await failing.evaluate(() => String(window.getSelection())).then((s) => s.trim())).toBe(text);
    await failing.close();
  });

  test("the partners page isn't in “Save all pages” (it's for organizations)", async ({ request }) => {
    for (const sw of ["help/sw.js", "ayuda/sw.js"]) {
      const code = await (await request.get(sw)).text();
      expect(code).not.toMatch(/partners|socios/);
      expect(code).toMatch(/know-your-rights|conozca-sus-derechos/);
    }
  });

  test("partners page: WCAG 2.2 AA in light and dark, and no sideways scrolling on a phone", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ["help/partners/", "ayuda/socios/"]) {
        await page.goto(path);
        await expectNoA11yViolations(page);
      }
    }
    await page.setViewportSize({ width: 320, height: 800 });
    for (const path of ["help/partners/", "ayuda/socios/", "help/know-your-rights/"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("Help tools", () => {
  test("every tool shows exactly one correction link, named for the tool, in the reader's language", async ({ page }) => {
    const seen: string[] = [];
    for (const lang of ["en", "es"] as const) {
      for (const tab of HELP_TABS) {
        for (const view of VIEWS[tab] ?? [undefined]) {
          await page.goto("about:blank"); // a hash-only change wouldn't reload the app
          await page.goto(`./#${lang === "es" ? "lang=es&" : ""}help=${tab}${view ? `&hv=${view}` : ""}`);
          const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
          // The tab loads on demand: wait for its sources.
          await expect(dialog.locator(".hsources").first()).toBeAttached();
          const where = `${lang} ${tab}/${view ?? ""}`;
          const link = dialog.locator("a[data-report]");
          await expect(link, where).toHaveCount(1);
          await expect(link, where).toHaveText(lang === "en" ? /^See something wrong\? Tell us \(opens your email app\)$/ : /^¿Ve algo incorrecto\? Avísenos \(abre su aplicación de correo\)$/);
          const { to, subject, body } = parse(await link.getAttribute("href"));
          expect(to, where).toBe(REPORT_EMAIL);
          expect(subject, where).toMatch(lang === "en" ? /^Correction: .+ \(checked \w+ \d{1,2}, 20\d\d\)$/ : /^Corrección: .+ \(revisado el \d{1,2} de \w+ de 20\d\d\)$/);
          expect(body, where).toContain(lang === "en" ? "What's wrong:" : "Qué está mal:");
          seen.push(subject);
        }
      }
    }
    expect(seen).toContain("Correction: Know your rights with immigration agents (checked October 22, 2026)");
    expect(seen).toContain("Corrección: Salarios no pagados (revisado el " + longDate(TOOLS.find((t) => t.id === "wages")!.checked, "es-US") + ")");
    expect(seen.some((s) => s.startsWith("Correction: Get my deposit back (checked "))).toBe(true);
  });

  test("the correction link passes WCAG 2.2 AA in light and dark", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("about:blank");
      await page.goto("./#help=work&hv=wages");
      await expect(page.locator(".hreport a")).toBeVisible();
      await expectNoA11yViolations(page, ".hreport");
    }
  });
});
