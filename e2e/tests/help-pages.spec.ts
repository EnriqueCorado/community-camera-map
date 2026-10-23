// End-to-end: the public "Free help" pages and printable flyers (built by
// frontend/scripts/prerender.mjs). They exist only in a build, so run this
// against `vite preview` or the live site, not the dev server:
//   BASE_URL=http://localhost:4173/community-camera-map/ npx playwright test help-pages
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LIVE = "https://enriquecorado.github.io/community-camera-map/";

const TOOL_PAGES = {
  en: ["hospital-bills", "free-clinics", "benefits", "medi-cal-work-rules", "rent-increase", "eviction-notice", "repairs", "security-deposit", "mobile-home-space-rent", "unpaid-wages", "heat-at-work", "know-your-rights", "citizenship-test", "legal-aid", "family-plan", "daca-renewal", "free-tax-help"],
  es: ["cuentas-de-hospital", "clinicas-gratis", "beneficios", "reglas-de-trabajo-medi-cal", "aumento-de-renta", "aviso-de-desalojo", "reparaciones", "deposito", "renta-de-espacio-casa-movil", "salarios-no-pagados", "calor-en-el-trabajo", "conozca-sus-derechos", "examen-de-ciudadania", "ayuda-legal", "plan-familiar", "renovar-daca", "impuestos-gratis"],
};
const FLYERS = ["general", "hospital-bills", "medi-cal", "citizenship", "renters", "workers", "cards", "taxes", "clinics"];
const ALL = [
  "help/",
  "ayuda/",
  ...TOOL_PAGES.en.map((s) => `help/${s}/`),
  ...TOOL_PAGES.es.map((s) => `ayuda/${s}/`),
  "help/flyers/",
  ...FLYERS.map((f) => `help/flyers/${f}/`),
  "help/partners/",
  "ayuda/socios/",
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

test("every page loads with one h1, the right language, a canonical link, and no script errors", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
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
    // The page script's Copy and Share buttons (when the page has them) work without errors.
    const copy = page.locator("[data-share-copy]:visible, [data-copy]:visible").first();
    if (await copy.count()) await copy.click();
  }
  expect(errors).toEqual([]);
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
  // A build with the usage counter: answer for it here (tests aren't visitors).
  await page.route("**/api/count", (route) =>
    route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": new URL(route.request().headers().origin ?? "http://x").origin } }),
  );
  const blocked: string[] = [];
  page.on("console", (m) => m.type() === "error" && blocked.push(m.text()));
  for (const path of ALL) {
    const urls: string[] = [];
    const log = (r: { url(): string }) => urls.push(r.url());
    page.on("request", log);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    page.off("request", log);
    // The page itself, plus (in help/ and ayuda/) its own folder's offline worker,
    // plus, when the build has the anonymous usage counter, one count to it.
    const counter = await page.locator("body").getAttribute("data-counter");
    const counts = counter ? urls.filter((u) => u === counter) : [];
    expect(counts.length, path).toBeLessThanOrEqual(1);
    // The build's one shared stylesheet (every page) and page script (not
    // flyers), from this site, under content-hashed names.
    const shared = urls.filter((u) => new URL(u).origin === new URL(page.url()).origin && /\/help-assets\/site\.[0-9a-f]{12}\.(css|js)$/.test(u));
    expect(shared.filter((u) => u.endsWith(".css")), path).toHaveLength(1);
    expect(shared.filter((u) => u.endsWith(".js")), path).toHaveLength(/^help\/flyers\/[^/]+\/$/.test(path) ? 0 : 1);
    const others = urls.filter((u) => u !== page.url() && !counts.includes(u) && !shared.includes(u) && !/\/(help|ayuda)\/sw\.js$/.test(new URL(u).pathname));
    expect(others, path).toEqual([]);
    expect(urls.every((u) => counts.includes(u) || new URL(u).origin === new URL(page.url()).origin), path).toBe(true);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp, path).toContain("default-src 'none'");
    // Inline code runs only by exact hash; shared files only from this site.
    expect(csp, path).not.toContain("unsafe-inline");
    expect(csp, path).toMatch(/style-src 'self'[^;]*;/);
    // The only place a page may connect to is the counter (and only if there is one).
    if (counter) expect(csp, path).toContain(`connect-src ${new URL(counter).origin};`);
    else expect(csp, path).not.toContain("connect-src");
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
    "medi-cal": [`${LIVE}help/medi-cal-work-rules/`, `${LIVE}ayuda/reglas-de-trabajo-medi-cal/`],
    citizenship: [`${LIVE}help/citizenship-test/`, `${LIVE}ayuda/examen-de-ciudadania/`],
    renters: [`${LIVE}help/#housing`, `${LIVE}ayuda/#vivienda`],
    workers: [`${LIVE}help/#work`, `${LIVE}ayuda/#trabajo`],
    taxes: [`${LIVE}help/free-tax-help/`, `${LIVE}ayuda/impuestos-gratis/`],
    clinics: [`${LIVE}help/free-clinics/`, `${LIVE}ayuda/clinicas-gratis/`],
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

test("the Spanish citizenship page marks the official English as English, with today's notes", async ({ page }) => {
  await page.goto("ayuda/examen-de-ciudadania/");
  const item = page.locator("li", { hasText: "29. Name your U.S. representative." });
  await expect(item.locator('span[lang="en"]')).toContainText("29. Name your U.S. representative. Answer:");
  await expect(item).toContainText("house.gov"); // depends on your address
  await expect(page.locator('li span[lang="en"]')).toHaveCount(128);
});

test("home page groups link every tool page, and the Print button prints", async ({ page }) => {
  await page.goto("ayuda/");
  for (const slug of TOOL_PAGES.es) {
    await expect(page.locator(`main .group .cards a[href$="/ayuda/${slug}/"]`), slug).toHaveCount(1);
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

test("offline: nothing is stored until asked; saved pages open without internet; Remove deletes them", async ({ page, context }) => {
  const registrations = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname));
  const cacheNames = () => page.evaluate(() => caches.keys());
  // Browsing stores nothing.
  await page.goto("help/eviction-notice/");
  await page.goto("help/");
  expect(await registrations()).toEqual([]);
  expect(await cacheNames()).toEqual([]);

  const box = page.locator("[data-offline]");
  await expect(box).toBeVisible();
  await expect(box.getByRole("button", { name: "Remove saved pages" })).toBeHidden();
  await box.getByRole("button", { name: /^Save all pages on this device \(about \d+ KB\)$/ }).click();
  await expect(box.getByRole("status")).toHaveText(/^Saved\./);
  await expect(box.locator("[data-state]")).toHaveText(/^Saved on this device \(\d{4}-\d{2}-\d{2}\)/);
  // Only this folder's worker exists: the map app is never controlled.
  expect((await registrations()).map((p) => p.replace(/^.*\/(help|ayuda)\/$/, "$1"))).toEqual(["help"]);

  // Coming back: the saved state shows, but nothing is announced.
  await page.reload();
  await expect(page.locator("[data-offline] [data-state]")).toHaveText(/^Saved on this device/);
  await expect(page.locator("[data-offline]").getByRole("status")).toHaveText("");

  await context.setOffline(true);
  for (const path of ["help/eviction-notice/", "help/eviction-notice"]) {
    await page.goto(path);
    await expect(page.locator("h1"), path).toHaveText("Got an eviction notice?");
    await expect(page.locator(".savedcopy"), path).toHaveText(/^Saved copy from \d{4}-\d{2}-\d{2}\. Facts may have changed/);
    await expect(page.getByText("(209) 577-3811").first()).toBeVisible();
  }
  // The shared stylesheet and script come from the device too.
  expect(await page.evaluate(() => [...document.styleSheets].filter((sh) => /\/help-assets\/site\.[0-9a-f]{12}\.css$/.test(sh.href ?? "") && sh.cssRules.length > 50).length)).toBe(1);
  await page.goto("help/");
  await expect(page.locator("[data-offline] [data-state]")).toHaveText(/^Saved on this device/); // set by the page script
  // A copy that isn't exactly the published page is never shown.
  await page.evaluate(async () => {
    const cache = await caches.open("scm-help-pages");
    const key = new URL("help/legal-aid/", location.href.replace(/help\/.*$/, "")).href;
    await cache.put(key, new Response("<!doctype html><h1>Fake</h1>", { headers: { "Content-Type": "text/html" } }));
  });
  await page.goto("help/legal-aid/");
  await expect(page.locator("h1")).toHaveText("You’re offline");
  await context.setOffline(false);

  await page.goto("help/");
  await page.getByRole("button", { name: "Remove saved pages" }).click();
  await expect(page.locator("[data-offline]").getByRole("status")).toHaveText(/^Removed\./);
  expect(await registrations()).toEqual([]);
  expect(await cacheNames()).toEqual([]);
});

/** A stand-in for the browser's speech engine that behaves like Chrome's:
 *  voices arrive a moment after load, and cancel() fires a late "error" on
 *  the utterance it interrupts. Records what is read, with which voice. */
async function installFakeSpeech(page: Page, voices: { name: string; lang: string; localService: boolean }[], autoEnd: boolean) {
  await page.addInitScript(
    ({ voices, autoEnd }) => {
      const w = window as unknown as Record<string, unknown>;
      const spoken: { text: string; voice: string }[] = [];
      let list: typeof voices = [];
      let pending: { onend?: () => void; onerror?: () => void } | null = null;
      const listeners: (() => void)[] = [];
      w.spoken = spoken;
      w.voiceCalls = 0;
      w.finishOne = () => pending?.onend?.();
      Object.defineProperty(window, "speechSynthesis", {
        value: {
          getVoices: () => {
            w.voiceCalls = (w.voiceCalls as number) + 1;
            return list.map((v) => ({ ...v, default: false }));
          },
          speak(u: { text: string; voice: { name: string }; onend?: () => void; onerror?: () => void }) {
            spoken.push({ text: u.text, voice: u.voice.name });
            pending = u;
            if (autoEnd) setTimeout(() => u.onend?.(), 1);
          },
          cancel() {
            const u = pending;
            pending = null;
            if (u) setTimeout(() => u.onerror?.(), 5); // late, like Chrome's "interrupted"
          },
          addEventListener(_type: string, fn: () => void) {
            listeners.push(fn);
          },
        },
      });
      w.SpeechSynthesisUtterance = function (this: { text: string }, t: string) {
        this.text = t;
      };
      setTimeout(() => {
        list = voices;
        listeners.forEach((fn) => fn());
      }, 50);
    },
    { voices, autoEnd },
  );
}

test("read aloud uses an on-device voice, reads in order, and skips citations", async ({ page }) => {
  await installFakeSpeech(
    page,
    [
      { name: "Cloud", lang: "es-US", localService: false },
      { name: "Bad News", lang: "es-US", localService: true },
      { name: "Phone", lang: "es-MX", localService: true },
      { name: "English", lang: "en-US", localService: true },
    ],
    true,
  );
  await page.goto("ayuda/aviso-de-desalojo/");
  const button = page.getByRole("button", { name: "Escuchar esta página" });
  await button.click(); // waits for the late voice list to reveal it
  await expect(button).toHaveText(/Escuchar esta página/); // back to start when done
  const spoken = await page.evaluate(() => (window as unknown as { spoken: { text: string; voice: string }[] }).spoken);
  expect(spoken.length).toBeGreaterThan(10);
  expect(spoken[0]!.text).toBe("¿Recibió un aviso de desalojo?");
  expect(new Set(spoken.map((s) => s.voice))).toEqual(new Set(["Phone"])); // local, not a joke voice, not cloud
  const all = spoken.map((s) => s.text).join(" ");
  expect(all).not.toMatch(/Civ\. Code|CCP §|Sitio web/); // citations and link words skipped
  expect(all).toContain("(209) 577-3811"); // phone numbers are read
  expect(all).not.toContain("De dónde viene esta información"); // the sources section isn't read
  expect(all).toContain("Modesto, CA 95354 Ayuda legal gratis"); // parts of an office stay apart
});

test("read aloud: stop and a quick restart work, and it's never offered with only cloud voices", async ({ page }) => {
  await installFakeSpeech(page, [{ name: "Phone", lang: "en-US", localService: true }], false);
  await page.goto("help/hospital-bills/");
  await page.getByRole("button", { name: "Listen to this page" }).click();
  const stopButton = page.getByRole("button", { name: "Stop reading" });
  await expect(stopButton).toBeVisible();
  // The part being read is highlighted: the heading first, then the intro.
  await expect(page.locator("main .reading")).toHaveCount(1);
  await expect(page.locator("main h1")).toHaveClass(/reading/);
  await page.evaluate(() => (window as unknown as { finishOne: () => void }).finishOne());
  await expect(page.locator("main .lead")).toHaveClass(/reading/);
  // Stop, then start again at once: the late event from the cancelled sentence must not stop the new reading.
  // (Both taps in one go, so the cancelled sentence's late event lands after the restart.)
  await page.evaluate(() => {
    const b = document.querySelector<HTMLButtonElement>("[data-listen] button")!;
    b.click(); // stop
    b.click(); // start again
  });
  await page.waitForTimeout(50);
  await expect(page.getByRole("button", { name: "Stop reading" })).toBeVisible();
  await expect(page.locator("main h1")).toHaveClass(/reading/);
  await page.getByRole("button", { name: "Stop reading" }).click();
  await expect(page.locator("main .reading")).toHaveCount(0);

  const cloudOnly = await page.context().newPage();
  await installFakeSpeech(cloudOnly, [{ name: "Cloud", lang: "en-US", localService: false }], true);
  await cloudOnly.goto("help/hospital-bills/");
  // The script did look at the voices (after they arrived), and offered nothing.
  await expect.poll(() => cloudOnly.evaluate(() => (window as unknown as { voiceCalls: number }).voiceCalls)).toBeGreaterThan(1);
  await expect(cloudOnly.locator("[data-listen]")).toBeHidden();
  await cloudOnly.close();
});

test("offline: pages saved before an update (stale page, no shared files) are brought up to date", async ({ page, context }) => {
  await page.goto("help/");
  await page.locator("[data-offline]").getByRole("button", { name: /^Save all pages/ }).click();
  await expect(page.locator("[data-offline]").getByRole("status")).toHaveText(/^Saved\./);
  // What an older save looks like: no shared stylesheet or script, and a page
  // whose bytes are an older version.
  await page.evaluate(async () => {
    const cache = await caches.open("scm-help-pages");
    for (const req of await cache.keys()) if (req.url.includes("/help-assets/")) await cache.delete(req);
    const key = new URL("help/eviction-notice/", location.href.replace(/help\/.*$/, "")).href;
    await cache.put(key, new Response("<!doctype html><title>old</title><style>p{}</style><h1>Old version</h1>", { headers: { "Content-Type": "text/html" } }));
  });
  // The next visit online quietly saves this build's copies again.
  await page.reload();
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open("scm-help-pages")).keys()).filter((r) => r.url.includes("/help-assets/")).length))
    .toBe(2);
  await context.setOffline(true);
  await page.goto("help/eviction-notice/");
  await expect(page.locator("h1")).toHaveText("Got an eviction notice?");
  await expect(page.locator(".savedcopy")).toBeVisible();
  expect(await page.evaluate(() => [...document.styleSheets].some((sh) => (sh.href ?? "").includes("/help-assets/") && sh.cssRules.length > 50))).toBe(true);
  await context.setOffline(false);
  await page.goto("help/");
  await page.getByRole("button", { name: "Remove saved pages" }).click();
  await expect(page.locator("[data-offline]").getByRole("status")).toHaveText(/^Removed\./);
});

test("without the shared stylesheet and script, every page still reads", async ({ page }) => {
  await page.route(/\/help-assets\//, (route) => route.abort());
  for (const path of ["help/", "ayuda/aviso-de-desalojo/", "help/punjabi/", "help/flyers/general/"]) {
    await page.goto(path);
    await expect(page.locator("h1").first(), path).toBeVisible();
    // Buttons that need the script stay hidden instead of doing nothing.
    await expect(page.locator("button:visible[data-save], button:visible[data-share-copy], button:visible[data-copy]"), path).toHaveCount(0);
  }
});
