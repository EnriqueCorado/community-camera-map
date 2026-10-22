// End-to-end: the free Help tools (medical bills, renters, legal help) in a
// real browser — flows, map links, accessibility, phone layout, and the
// privacy promise (nothing typed is sent anywhere).
import { test, expect, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function ready(page: Page) {
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
}

async function openHelp(page: Page, hash = "") {
  await page.goto(`./${hash}`);
  await ready(page);
  if (!hash.includes("help=")) await page.getByRole("button", { name: /Free help/ }).click();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectNoA11yViolations(page: Page, include: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(include).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test("opens from the sidebar, switches tabs by keyboard, keeps the tab in the URL, closes with Escape", async ({ page }) => {
  const dialog = await openHelp(page);
  await expect(dialog.getByRole("tab", { name: "Medical bills" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/help=medical/);
  await dialog.getByRole("tab", { name: "Medical bills" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("tab", { name: "Renters" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tab", { name: "Renters" })).toBeFocused();
  await expect(page).toHaveURL(/help=rent/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/help=/);
  await expect(page.getByRole("button", { name: /Free help/ })).toBeFocused();
});

test("a shared link opens straight to a tab, in Spanish", async ({ page }) => {
  const dialog = await openHelp(page, "#help=legal&lang=es");
  await expect(dialog.getByRole("tab", { name: "Ayuda legal" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog).toContainText("notarios");
});

test("each tab downloads only when opened (light on slow phones)", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
  const dialog = await openHelp(page, "#help=medical");
  await expect(dialog.getByRole("heading", { name: /Check if you may qualify/ })).toBeVisible();
  const tabChunk = (name: string) => scripts.some((u) => new RegExp(`/${name}(?:[-.][^/]*)?\\.(js|tsx)`).test(u));
  // The dev server serves source files, a build serves hashed chunks: both are matched.
  for (const other of ["WorkHelp", "BenefitsHelp", "RenterHelp"]) expect(tabChunk(other), other).toBe(false);
  await dialog.getByRole("tab", { name: "Work" }).click();
  await expect(dialog.getByRole("button", { name: "Unpaid wages" })).toBeVisible();
  expect(tabChunk("WorkHelp")).toBe(true);
});

test("medical: income check gives the hospital's own result and links", async ({ page }) => {
  const dialog = await openHelp(page);
  await dialog.getByLabel("Hospital", { exact: true }).selectOption({ label: "Memorial Medical Center (Modesto)" });
  await dialog.getByLabel("People in your household").selectOption("4");
  await dialog.getByLabel("Household income before taxes").fill("3,000");
  await dialog.getByRole("radio", { name: "per month" }).check();
  await dialog.getByRole("group", { name: /health insurance/ }).getByRole("radio", { name: "No", exact: true }).check();
  await expect(dialog.getByText("You may qualify for FREE care")).toBeVisible();
  await expect(dialog.getByText("109% of the poverty line")).toBeVisible(); // 36,000 / 33,000
  const card = dialog.getByRole("region", { name: "Memorial Medical Center" });
  await expect(card.getByRole("link", { name: /\(855\) 398-1633/ })).toHaveAttribute("href", "tel:8553981633");
  await expect(card.getByRole("link", { name: /Financial assistance policy \(English\)/ })).toHaveAttribute("href", /^https:\/\//);
});

test("medical: insured without high costs is told to ask anyway", async ({ page }) => {
  const dialog = await openHelp(page);
  await dialog.getByLabel("Hospital", { exact: true }).selectOption({ label: "Doctors Medical Center (Modesto)" });
  await dialog.getByLabel("Household income before taxes").fill("2000");
  await dialog.getByRole("group", { name: /health insurance/ }).getByRole("radio", { name: "Yes", exact: true }).check();
  await dialog.getByRole("group", { name: /10%/ }).getByRole("radio", { name: "No", exact: true }).check();
  await expect(dialog.getByText(/above the usual limits/)).toBeVisible();
});

test("renters: apartment over the cap with short notice", async ({ page }) => {
  const dialog = await openHelp(page, "#help=rent");
  await dialog.getByRole("radio", { name: /An apartment/ }).check();
  await dialog.getByRole("group", { name: /last 15 years/ }).getByRole("radio", { name: "No", exact: true }).check();
  await dialog.getByRole("group", { name: /affordable housing/ }).getByRole("radio", { name: "No", exact: true }).check();
  await expect(dialog.getByText("The rent cap most likely covers your home")).toBeVisible();
  await dialog.getByLabel(/Lowest rent/).fill("1500");
  await dialog.getByLabel("New monthly rent").fill("1650");
  await dialog.getByLabel("Date the new rent starts").fill("2026-09-01");
  await dialog.getByLabel(/Date you got the written notice/).fill("2026-08-15");
  await expect(dialog.getByText("This is $21 a month over the cap")).toBeVisible();
  await expect(dialog.getByText(/up to \$1,629 a month/)).toBeVisible();
  await expect(dialog.getByText("That’s not enough notice")).toBeVisible();
  await expect(dialog.getByText(/can’t start before September 14, 2026/)).toBeVisible();
});

test("renters: the building lookup answers the 15-year question from county records", async ({ page }) => {
  const dialog = await openHelp(page, "#help=rent");
  await dialog.getByRole("radio", { name: /An apartment/ }).check();
  await dialog.getByLabel("Look up when your building was built").fill("901 Parklawn Ave, Modesto");
  await dialog.getByRole("button", { name: "Look up" }).click();
  await expect(dialog.getByText(/built 2021/)).toBeVisible();
  await expect(dialog.getByText(/likely NOT covered/)).toBeVisible();
  await expect(dialog.getByRole("group", { name: /last 15 years/ }).getByRole("radio", { name: "Yes", exact: true })).toBeChecked();
});

test("renters: mobile home owners get the park rules, not the apartment cap", async ({ page }) => {
  const dialog = await openHelp(page, "#help=rent");
  await dialog.getByRole("radio", { name: /I own my mobile home/ }).click();
  await expect(dialog.getByRole("heading", { name: "Mobile home parks: space rent" })).toBeVisible();
  await expect(dialog).toContainText("90 days");
  await expect(dialog.getByRole("link", { name: /\(800\) 952-8356/ })).toBeVisible();
});

test("letters: repair letter fills in live and downloads as text", async ({ page }) => {
  const dialog = await openHelp(page, "#help=rent");
  await dialog.getByRole("button", { name: "Get repairs made" }).click();
  await dialog.getByLabel("Your full name").fill("Ana López");
  await dialog.getByRole("checkbox", { name: /No heat/ }).check();
  const preview = dialog.getByLabel("Your letter");
  await expect(preview).toHaveValue(/Ana López/);
  await expect(preview).toHaveValue(/- No heat or broken heater/);
  await expect(preview).toHaveValue(/1942\.5/);
  await dialog.getByRole("button", { name: "Español" }).click();
  await expect(preview).toHaveValue(/Estimado\/a/);
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download (.txt)" }).click()]);
  expect(download.suggestedFilename()).toBe("repair-request.txt");
});

test("legal: lists the verified offices, filters, and shows one on the map", async ({ page }) => {
  const dialog = await openHelp(page, "#help=legal");
  await expect(dialog.getByText("16 offices")).toBeVisible();
  await dialog.getByRole("button", { name: "Immigration", exact: true }).click();
  await expect(dialog.getByText("8 offices")).toBeVisible();
  const office = dialog.getByRole("article", { name: /World Relief Modesto/ });
  await office.getByRole("button", { name: "Show on map" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/ov=[^&]*legal-help/);
});

test("hospital pin: popup offers the charity-care check for that hospital", async ({ page }) => {
  await page.goto("./#ov=hospitals&v=-120.9747,37.6688,15");
  await ready(page);
  test.skip(!(await page.evaluate(() => "__map" in window)), "needs the dev build's map handle");
  const pt = await page.evaluate(async () => {
    const m = (window as unknown as { __map?: any }).__map;
    for (let i = 0; i < 100; i++) {
      const f = m?.getLayer("ov-hospitals-circle") && m.queryRenderedFeatures({ layers: ["ov-hospitals-circle"] }).find((x: any) => /MEMORIAL/.test(x.properties.NAME));
      if (f) {
        const p = m.project(f.geometry.coordinates);
        return { x: p.x, y: p.y };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  });
  expect(pt).not.toBeNull();
  await page.locator("canvas.maplibregl-canvas").click({ position: pt! });
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.locator(".popup__heading")).toHaveText("Free or discounted care");
  await popup.getByRole("button", { name: "Check if you qualify" }).click();
  const dialog = page.getByRole("dialog", { name: "Free help" });
  await expect(dialog.getByLabel("Hospital", { exact: true })).toHaveValue("memorial-modesto");
});

test("privacy: nothing typed into the tools is sent anywhere", async ({ page }) => {
  const dialog = await openHelp(page);
  const seen: Request[] = [];
  page.on("request", (r) => seen.push(r));
  const secrets = { income: "48213", name: "Zyxwv Qutsr", rent: "1717", address: "4242 Uniqueplace" };

  await dialog.getByLabel("Household income before taxes").fill(secrets.income);
  await dialog.getByLabel("Your full name").fill(secrets.name);
  await dialog.getByRole("tab", { name: "Renters" }).click();
  await dialog.getByRole("radio", { name: /An apartment/ }).check();
  await dialog.getByLabel("Look up when your building was built").fill(`${secrets.address} St, Modesto`);
  await dialog.getByRole("button", { name: "Look up" }).click();
  await expect(dialog.getByText(/couldn’t find that address/)).toBeVisible();
  await dialog.getByLabel(/Lowest rent/).fill(secrets.rent);
  await dialog.getByRole("tab", { name: "Legal help" }).click();
  await expect(dialog.getByText("16 offices")).toBeVisible();

  const origin = new URL(page.url()).origin;
  for (const r of seen) {
    const body = r.postData() ?? "";
    for (const s of Object.values(secrets)) {
      expect(r.url(), `leaked in a URL: ${r.url()}`).not.toContain(s.replace(/ /g, "%20"));
      expect(r.url()).not.toContain(s);
      expect(body, `leaked in a request body to ${r.url()}`).not.toContain(s);
    }
    // The tools themselves only load this site's own files (map tiles may
    // keep loading in the background, but never with anything typed here).
    // The one exception: a build with the usage counter POSTs the tool's name
    // as the whole body, to a fixed URL (nothing else; see unit-counter.spec.ts).
    if (new URL(r.url()).pathname === "/api/count") {
      expect(new URL(r.url()).search, r.url()).toBe("");
      expect(r.method()).toBe("POST");
      expect(body, r.url()).toMatch(/^app:[a-z-]+(\/[a-z-]+)?:(en|es)$/);
      continue;
    }
    if (r.resourceType() === "fetch" && !/tiles|openfreemap|maplibre|glyphs|sprite/.test(r.url())) {
      expect(new URL(r.url()).origin, r.url()).toBe(origin);
    }
  }
  expect(page.url()).not.toContain(secrets.income);
  // Nothing written to browser storage either.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  for (const s of Object.values(secrets)) expect(stored).not.toContain(s);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`a11y (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    for (const lang of ["en", "es"] as const) {
      for (const tab of ["medical", "rent", "work", "benefits", "legal"] as const) {
        test(`${tab} tab (${lang}, ${scheme}) has no WCAG 2.2 AA violations`, async ({ page }) => {
          const dialog = await openHelp(page, `#help=${tab}${lang === "es" ? "&lang=es" : ""}`);
          if (tab === "legal") await expect(dialog.getByText(/16 (offices|oficinas)/)).toBeVisible();
          await expectNoA11yViolations(page, ".help__card");
        });
      }
    }
  });
}

test("theme and text size: chosen explicitly, remembered, and still accessible", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./");
  await ready(page);
  const light = page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Light" });
  await light.click();
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(244, 246, 248)"); // light --bg despite a dark device setting
  await page.getByRole("group", { name: "Text" }).getByRole("button", { name: "Larger" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  await page.getByRole("button", { name: /Free help/ }).click();
  await expect(page.locator(".help__card")).toBeVisible();
  await expectNoA11yViolations(page, ".help__card");
});

test("keyboard only: reach the Help panel, every tab, and close it", async ({ page }) => {
  await page.goto("./");
  await ready(page);
  const help = page.getByRole("button", { name: /Free help/ });
  await help.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Free help" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Medical bills" }).focus();
  for (const name of ["Renters", "Work", "Benefits", "Immigration", "Legal help"]) {
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });

  test("full screen, nothing wider than the screen", async ({ page }) => {
    for (const tab of ["medical", "rent", "work", "benefits", "legal"]) {
      const dialog = await openHelp(page, `#help=${tab}`);
      const box = await dialog.boundingBox();
      expect(box?.width).toBe(375);
      const overflow = await page.evaluate(() => {
        const body = document.querySelector(".help__body") as HTMLElement;
        return body.scrollWidth - body.clientWidth;
      });
      expect(overflow, tab).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("400% zoom (320 CSS px wide)", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test("every tab reflows without sideways scrolling", async ({ page }) => {
    for (const tab of ["medical", "rent", "work", "benefits", "legal"]) {
      await openHelp(page, `#help=${tab}`);
      const overflow = await page.evaluate(() => {
        const body = document.querySelector(".help__body") as HTMLElement;
        return body.scrollWidth - body.clientWidth;
      });
      expect(overflow, tab).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("forced colors (Windows high contrast)", () => {
  test("the selected tab and choices stay visible", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    const dialog = await openHelp(page, "#help=rent");
    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    const tab = dialog.getByRole("tab", { name: "Renters" });
    const outline = await tab.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
  });
});
