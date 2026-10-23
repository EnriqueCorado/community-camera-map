// End-to-end: "What do you need help with?" (Help panel and the public home
// pages), Share this (WhatsApp, Copy link), and the short links (/h/<word>/).
// The public pages exist only in a build: run against `vite preview` or live.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SHORT_LINKS, START_CHOICES, shortTarget } from "../../frontend/src/help/start";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function openPanel(page: Page, hash: string) {
  await page.goto("about:blank"); // a hash-only change wouldn't reload the app
  await page.goto(`./#${hash}`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  await expect(dialog.locator("h3").first()).toBeVisible();
  return dialog;
}

async function expectNoA11yViolations(page: Page, include?: string) {
  const axe = new AxeBuilder({ page }).withTags(WCAG);
  const { violations } = await (include ? axe.include(include) : axe).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

async function needsBuild(page: Page) {
  const res = await page.request.get("help/");
  test.skip(!(await res.text()).includes('class="hero"'), "the public pages exist only in a build");
}

test.describe("Help panel", () => {
  test("“Not sure where to start?” opens the right tool and closes", async ({ page }) => {
    const dialog = await openPanel(page, "help=medical");
    const start = dialog.locator("details.hstart");
    await expect(start).not.toHaveAttribute("open", /.*/);
    await start.locator("summary").click();
    await expect(dialog.getByText("What do you need help with?")).toBeVisible();
    await expect(start.getByRole("button")).toHaveCount(START_CHOICES.length);
    await start.getByRole("button", { name: "My landlord kept my deposit" }).click();
    await expect(page).toHaveURL(/help=rent&hv=deposit/);
    await expect(dialog.getByRole("tab", { name: "Renters" })).toHaveAttribute("aria-selected", "true");
    await expect(start).not.toHaveAttribute("open", /.*/);
    await expect(dialog.locator(".help__body")).toBeFocused();

    await start.locator("summary").click();
    await start.getByRole("button", { name: "Medi-Cal says I have to work" }).click();
    await expect(page).toHaveURL(/help=benefits&hv=medi-cal/);
  });

  test("Spanish chooser", async ({ page }) => {
    const dialog = await openPanel(page, "lang=es&help=legal");
    await dialog.locator("details.hstart summary").click();
    await dialog.getByRole("button", { name: "Me subieron la renta", exact: true }).click();
    await expect(page).toHaveURL(/help=rent&hv=rent/);
  });

  test("Share: WhatsApp link and Copy link share the tool's public page, nothing typed", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const dialog = await openPanel(page, "lang=es&help=rent&hv=eviction");
    const share = dialog.locator(".hshare");
    const wa = share.getByRole("link", { name: /Enviar por WhatsApp/ });
    const href = (await wa.getAttribute("href"))!;
    const text = new URL(href).searchParams.get("text")!;
    expect(new URL(href).origin).toBe("https://wa.me");
    expect(text).toMatch(/^Ayuda gratis y privada.* http:\/\/localhost:\d+\/community-camera-map\/ayuda\/aviso-de-desalojo\/$|^Ayuda gratis y privada.* https:\/\/.*\/ayuda\/aviso-de-desalojo\/$/);
    await expect(wa).toHaveAttribute("target", "_blank");
    await share.getByRole("button", { name: "Copiar el enlace" }).click();
    await expect(share.getByRole("status")).toHaveText(/Enlace copiado/);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/community-camera-map\/ayuda\/aviso-de-desalojo\/$/);
    // Switching tools shares the new tool and clears the old message.
    await dialog.getByRole("tab", { name: "Trabajo" }).click();
    await expect(share.getByRole("status")).toHaveText("");
    expect(new URL((await share.getByRole("link", { name: /WhatsApp/ }).getAttribute("href"))!).searchParams.get("text")).toMatch(/\/ayuda\/salarios-no-pagados\/$/);
  });

  test("Copy link without clipboard access shows the link to copy by hand", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("blocked")) } });
    });
    const dialog = await openPanel(page, "help=work&hv=heat");
    const share = dialog.locator(".hshare");
    await share.getByRole("button", { name: "Copy link" }).click();
    await expect(share.getByRole("status")).toHaveText(/Couldn’t copy/);
    const field = share.getByRole("textbox", { name: "Link to share" });
    await expect(field).toHaveValue(/\/help\/heat-at-work\/$/);
    // Focused and selected, so a phone shows the selection to copy by hand.
    await expect(field).toBeFocused();
    await expect.poll(() => field.evaluate((el: HTMLInputElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length)).toBe(true);
  });

  test("copying again is announced again (the status is cleared, then set)", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const dialog = await openPanel(page, "help=work&hv=heat");
    const share = dialog.locator(".hshare");
    const status = share.getByRole("status");
    await share.getByRole("button", { name: "Copy link" }).click();
    await expect(status).toHaveText(/Link copied/);
    // Record every text the live region shows during the second copy.
    await status.evaluate((el) => {
      (window as unknown as { seen: string[] }).seen = [];
      new MutationObserver(() => (window as unknown as { seen: string[] }).seen.push(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true });
    });
    await share.getByRole("button", { name: "Copy link" }).click();
    const seen = () => page.evaluate(() => (window as unknown as { seen: string[] }).seen);
    await expect.poll(async () => (await seen()).at(-1) ?? "").toMatch(/Link copied/);
    expect((await seen())[0]).toBe("");
  });

  test("WCAG 2.2 AA in light and dark with the chooser open, and no sideways scroll at 320px", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const dialog = await openPanel(page, "help=immigration&hv=rights");
      await dialog.locator("details.hstart summary").click();
      await expectNoA11yViolations(page, ".help__card");
    }
    await page.setViewportSize({ width: 320, height: 700 });
    const dialog = await openPanel(page, "lang=es&help=benefits");
    await dialog.locator("details.hstart summary").click();
    const overflow = await dialog.locator(".help__body").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("public pages", () => {
  test.beforeEach(async ({ page }) => needsBuild(page));

  test("home: “What do you need help with?” links every choice to its page", async ({ page, request }) => {
    for (const [dir, question] of [
      ["help/", "What do you need help with?"],
      ["ayuda/", "¿Con qué necesita ayuda?"],
    ] as const) {
      await page.goto(dir);
      const list = page.locator("section.start");
      await expect(list.getByRole("heading", { name: question })).toBeVisible();
      const hrefs = await list.locator("a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
      expect(hrefs).toHaveLength(START_CHOICES.length);
      for (const h of hrefs) {
        expect(h).toContain(`/${dir}`);
        expect((await request.get(h)).status(), h).toBe(200);
      }
    }
    await page.goto("ayuda/");
    await page.getByRole("link", { name: "El dueño no hace las reparaciones" }).click();
    await expect(page).toHaveURL(/ayuda\/reparaciones\/$/);
  });

  test("tool page: Share this with WhatsApp, Copy link, and the short link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("ayuda/aumento-de-renta/");
    const box = page.locator("[data-share]");
    const wa = box.getByRole("link", { name: "Enviar por WhatsApp" });
    const text = new URL((await wa.getAttribute("href"))!).searchParams.get("text");
    expect(text).toBe("¿Es legal mi aumento de renta? — Ayuda gratis y privada, en español e inglés. https://enriquecorado.github.io/community-camera-map/ayuda/aumento-de-renta/");
    await box.getByRole("button", { name: "Copiar el enlace" }).click();
    await expect(box.getByRole("status")).toHaveText(/Enlace copiado/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://enriquecorado.github.io/community-camera-map/ayuda/aumento-de-renta/");
    await expect(box.getByRole("link", { name: "enriquecorado.github.io/community-camera-map/h/renta" })).toBeVisible();
    // Not read aloud, not printed.
    await expect(box).toHaveAttribute("data-quiet");
  });

  test("home page has Share this too", async ({ page }) => {
    await page.goto("help/");
    const wa = page.locator("[data-share]").getByRole("link", { name: "Send on WhatsApp" });
    expect(new URL((await wa.getAttribute("href"))!).searchParams.get("text")).toBe(
      "Free, private help for Stanislaus County, in English and Spanish. https://enriquecorado.github.io/community-camera-map/help/",
    );
  });

  test("every short link resolves to an existing page in its language", async ({ page, request }) => {
    for (const s of SHORT_LINKS) {
      const res = await request.get(`h/${s.slug}/`);
      expect(res.status(), s.slug).toBe(200);
      const html = await res.text();
      const to = html.match(/http-equiv="refresh" content="0; url=([^"]+)"/)?.[1];
      expect(to, s.slug).toMatch(new RegExp(`/${shortTarget(s).replace(/\//g, "\\/")}$`));
      const target = await request.get(new URL(to!, res.url()).href);
      expect(target.status(), `${s.slug} → ${to}`).toBe(200);
      expect(await target.text(), s.slug).toContain(`<html lang="${s.lang}"`);
      expect(html, s.slug).toContain("script-src 'none'");
    }
    // A real browser follows it.
    await page.goto("h/derechos/");
    await expect(page).toHaveURL(/ayuda\/conozca-sus-derechos\/$/);
    await page.goto("h/hospital/");
    await expect(page).toHaveURL(/help\/hospital-bills\/$/);
  });

  test("WCAG 2.2 AA on the home and a tool page, light and dark, and 320px", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ["ayuda/", "help/unpaid-wages/"]) {
        await page.goto(path);
        await expectNoA11yViolations(page);
      }
    }
    await page.setViewportSize({ width: 320, height: 700 });
    for (const path of ["ayuda/", "ayuda/renta-de-espacio-casa-movil/"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(0);
    }
  });
});
