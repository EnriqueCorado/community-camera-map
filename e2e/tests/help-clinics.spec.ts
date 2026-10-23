// End-to-end: the clinic finder (Medical tab) and its public pages, in a real
// browser — old links still open the hospital-bill tool, the chip, filtering by
// town and need (and the closest clinics when a town has none), "show on map",
// Spanish, accessibility (light and dark), a 320px phone, and nothing sent or
// put in the URL while choosing.
import { test, expect, type Page, type Request } from "@playwright/test";
import { unexpected } from "./requests";
import AxeBuilder from "@axe-core/playwright";
import { CLINICS } from "../../frontend/src/help/clinics-facts";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(page: Page, lang: "en" | "es" = "en") {
  await page.goto("about:blank"); // a hash-only change wouldn't reload the app
  await page.goto(`./#${lang === "es" ? "lang=es&" : ""}help=medical&hv=clinics`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  // The tool loads on demand: wait for its heading.
  await expect(dialog.getByRole("heading", { level: 3, name: lang === "es" ? "Clínicas gratis y de bajo costo" : "Free and low-cost clinics" })).toBeVisible();
  return dialog;
}

async function expectNoA11yViolations(page: Page, include: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(include).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test("old links still open the hospital-bill tool; the chip opens the clinics", async ({ page }) => {
  await page.goto("about:blank");
  await page.goto("./#help=medical");
  const dialog = page.getByRole("dialog", { name: "Free help" });
  await expect(dialog.getByRole("heading", { level: 3, name: "Check if you may qualify" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Hospital bills" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Free and low-cost clinics" }).click();
  await expect(page).toHaveURL(/help=medical&hv=clinics/);
  await expect(dialog.getByRole("heading", { level: 3, name: "Free and low-cost clinics" })).toBeVisible();
  // And back: the clinics tool links to the hospital-bill tool.
  await dialog.getByRole("button", { name: /Got a hospital bill\?/ }).click();
  await expect(dialog.getByRole("heading", { level: 3, name: "Check if you may qualify" })).toBeVisible();
});

test("filter by town and need; a town with none shows the closest; nothing sent or put in the URL", async ({ page }) => {
  const dialog = await open(page);
  const sent: Request[] = [];
  page.on("request", (r) => sent.push(r));
  const hash = await page.evaluate(() => location.hash);
  const cards = dialog.locator(".hdir__item");
  const status = dialog.locator(".hclinics__count");
  await expect(status).toHaveText(`${CLINICS.length} places`);
  await expect(cards).toHaveCount(CLINICS.length);

  await dialog.getByLabel("Your town").selectOption({ label: "Turlock" });
  await dialog.getByLabel("What do you need?").selectOption({ label: "Dental" });
  await expect(status).toHaveText("1 place");
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole("heading")).toHaveText("Golden Valley Health Centers – Turlock West");
  await expect(cards.first().getByRole("link", { name: "(209) 656-6000" })).toHaveAttribute("href", "sms:+12096566000");

  await dialog.getByLabel("Your town").selectOption({ label: "Oakdale" });
  await dialog.getByLabel("What do you need?").selectOption({ label: "Anything" });
  await expect(status).toHaveText("None listed in Oakdale for this. These are the closest:");
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByRole("heading")).toHaveText("Golden Valley Health Centers – Riverbank High School");

  // Each card: a phone link, directions (a plain link, no embedded map), the clinic's own page.
  const card = cards.first();
  await expect(card.getByRole("link", { name: "(209) 722-4842" })).toHaveAttribute("href", "tel:2097224842");
  // Repeated links name their clinic for screen readers.
  const directions = await card.getByRole("link", { name: /^See on a map \(.+\)$/ }).getAttribute("href");
  expect(directions).toBe("https://www.openstreetmap.org/search?query=4150%20Patterson%20Rd.%2C%20Riverbank%2C%20CA%2095367");

  expect(await page.evaluate(() => location.hash)).toBe(hash);
  expect(unexpected(sent)).toEqual([]);
});

test("show on map closes the panel (health center sites only)", async ({ page }) => {
  const dialog = await open(page);
  await dialog.getByLabel("What do you need?").selectOption({ label: "Vaccines" });
  // The county immunization clinic isn't on the health-center layer: no button.
  await expect(dialog.locator(".hdir__item")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /^Show on map/ })).toHaveCount(0);
  await dialog.getByLabel("What do you need?").selectOption({ label: "Dental" });
  await dialog.getByRole("button", { name: /^Show on map/ }).first().click();
  await expect(dialog).toBeHidden();
});

test("in Spanish, with the cited facts and the crisis line", async ({ page }) => {
  const dialog = await open(page, "es");
  await expect(dialog.getByRole("heading", { level: 3, name: "Si no tiene seguro" })).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 3, name: "Sus derechos en la clínica" })).toBeVisible();
  await expect(dialog.getByText(/intérprete calificado/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "(888) 376-6246" })).toHaveAttribute("href", "tel:8883766246");
  // 988 is tappable: call or text.
  await expect(dialog.getByRole("link", { name: "Llamar al 988" })).toHaveAttribute("href", "tel:988");
  await expect(dialog.getByRole("link", { name: "Mandar un texto al 988" })).toHaveAttribute("href", "sms:988");
  await expect(dialog.locator(".hclinics__count")).toHaveText(`${CLINICS.length} lugares`);
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

test("public pages in English and Spanish list every clinic", async ({ page }) => {
  for (const [path, h1] of [
    ["help/free-clinics/", "Free and low-cost clinics"],
    ["ayuda/clinicas-gratis/", "Clínicas gratis y de bajo costo"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
    for (const c of CLINICS) await expect(page.getByText(c.address).first(), c.id).toBeAttached();
    await expect(page.getByText("(888) 376-6246").first()).toBeVisible();
    await expectNoA11yViolations(page, "body");
  }
});
