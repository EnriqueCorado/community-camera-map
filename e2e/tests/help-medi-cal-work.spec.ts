// End-to-end: the Medi-Cal work rules tool (Benefits tab) in a real browser —
// the main paths in English and Spanish, changing answers, invalid input,
// links to the tool, accessibility in every result state (light and dark), a
// 320px phone, and the privacy promise (nothing typed leaves the page).
import { test, expect, type Locator, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TOOL = { en: "Medi-Cal work rules (2027)", es: "Reglas de trabajo de Medi-Cal (2027)" };

async function openTool(page: Page, lang: "en" | "es" = "en", hash = "help=benefits&hv=medi-cal") {
  await page.goto("about:blank"); // a hash-only change wouldn't reload the app
  await page.goto(`./#${lang === "es" ? "lang=es&" : ""}${hash}`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  return page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
}

/** Full Medi-Cal, 19–64, no exemptions. */
async function basics(dialog: Locator) {
  await dialog.getByRole("radio", { name: "I have full Medi-Cal now" }).check();
  await dialog.getByRole("radio", { name: "19 to 64" }).check();
  await dialog.getByRole("checkbox", { name: "None of these" }).check();
}

const result = (dialog: Locator) => dialog.locator(".hresult");

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(".help__card").analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test("a gig worker with $600 of income a month meets it, whatever the hours", async ({ page }) => {
  const dialog = await openTool(page);
  await expect(dialog.getByRole("button", { name: TOOL.en })).toHaveAttribute("aria-pressed", "true");
  await basics(dialog);
  await expect(result(dialog)).toHaveCount(0); // no verdict before anything about the month is entered
  await dialog.getByLabel(/Your income in a typical month/).fill("600");
  await dialog.getByLabel("Hours of work a month").fill("30");
  await expect(result(dialog)).toContainText("You likely meet the work rule");
  await expect(result(dialog)).toContainText("Having at least $580 of income in a month counts");
});

test("short on hours: how many more, that $580 of income counts instead, and partial school adds up", async ({ page }) => {
  const dialog = await openTool(page);
  await basics(dialog);
  await dialog.getByLabel("Hours of work a month").fill("40");
  await dialog.getByLabel("Hours of volunteering a month").fill("20");
  await dialog.getByLabel(/Your income in a typical month/).fill("400");
  await expect(result(dialog)).toContainText("You may not meet the work rule yet");
  await expect(result(dialog)).toContainText("You have about 60 hours a month; you need 80 (20 more).");
  await expect(result(dialog)).toContainText("Or have $180 more income in a month");
  // Two units at community college (2 × 13 = about 26 hours) close the gap.
  await dialog.getByRole("radio", { name: "Yes, less than half-time" }).check();
  await dialog.getByLabel("Units or credits you’re taking").fill("2");
  await expect(result(dialog)).toContainText("Your 85 hours a month are at least the 80 needed.");
});

test("an invalid amount is called out and holds the result back", async ({ page }) => {
  const dialog = await openTool(page);
  await basics(dialog);
  await dialog.getByLabel(/Your income in a typical month/).fill("600 a month");
  await expect(dialog.getByRole("alert")).toContainText("Your income in a typical month");
  await expect(result(dialog)).toHaveCount(0);
  await dialog.getByLabel("Hours of work a month").fill("forty");
  await expect(dialog.getByLabel("Hours of work a month")).toHaveAttribute("aria-invalid", "true");
  await dialog.getByLabel(/Your income in a typical month/).fill("600");
  await dialog.getByLabel("Hours of work a month").fill("40");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(result(dialog)).toContainText("You likely meet the work rule");
});

test("exempt and not-covered paths, and changing earlier answers updates the result", async ({ page }) => {
  const dialog = await openTool(page);
  await dialog.getByRole("radio", { name: "I’m applying, or will apply" }).check();
  await dialog.getByRole("radio", { name: "19 to 64" }).check();
  await dialog.getByRole("checkbox", { name: /I’m the parent of a child 13 or younger/ }).check();
  await expect(result(dialog)).toContainText("You likely don’t have to meet the work rule");
  await expect(result(dialog)).toContainText("Because: you’re a parent or caretaker of a child 13 or younger.");
  await expect(result(dialog)).toContainText("when your youngest child turns 14");
  // No hours are asked of someone who's exempt.
  await expect(dialog.getByLabel("Hours of work a month")).toHaveCount(0);

  await dialog.getByRole("radio", { name: "65 or older" }).check();
  await expect(result(dialog)).toContainText("It’s only for adults 19 to 64.");
  await dialog.getByRole("radio", { name: "Under 19" }).check();
  await expect(result(dialog)).toContainText("It doesn’t apply until you turn 19.");
  await dialog.getByRole("radio", { name: /restricted/ }).check();
  await expect(result(dialog)).toContainText("doesn’t apply to restricted");
  await dialog.getByRole("radio", { name: "I have full Medi-Cal now" }).check();
  await dialog.getByRole("radio", { name: "19 to 64" }).check();
  await expect(result(dialog)).toContainText("You likely don’t have to meet the work rule"); // the checked box is remembered
});

test("boxes that are easy to misread carry a clarifying note", async ({ page }) => {
  const dialog = await openTool(page);
  await dialog.getByRole("radio", { name: "I have full Medi-Cal now" }).check();
  await dialog.getByRole("radio", { name: "19 to 64" }).check();
  const native = dialog.getByRole("checkbox", { name: /member of a U.S. tribe/ });
  await expect(native).toHaveAccessibleDescription("This doesn’t include Indigenous peoples from Mexico or Central America.");
  await expect(dialog.getByRole("checkbox", { name: /disability or aged program/ })).toHaveAccessibleDescription(/check the health box above instead/);
});

test("Spanish: a health condition alone is a 'maybe', and the hours are still compared", async ({ page }) => {
  const dialog = await openTool(page, "es");
  await expect(dialog.getByRole("button", { name: TOOL.es })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("radio", { name: "Tengo Medi-Cal completo" }).check();
  await dialog.getByRole("radio", { name: "De 19 a 64" }).check();
  await dialog.getByRole("checkbox", { name: /Tengo una discapacidad/ }).check();
  await expect(result(dialog)).toContainText("Puede que no tenga que cumplir la regla de trabajo");
  await expect(result(dialog)).toContainText("Pida a su médico o clínica una nota");
  await dialog.getByLabel("Horas de trabajo al mes").fill("30");
  await expect(result(dialog)).toContainText("Por si el condado no está de acuerdo");
  await expect(result(dialog)).toContainText("Tiene unas 30 horas al mes; necesita 80 (50 más).");
  await expect(dialog.getByRole("heading", { name: "Cambios para inmigrantes en California" })).toBeVisible();
  await expect(dialog.getByText(/TAMBIÉN aplica a los adultos de 19 a 64 años con Medi-Cal completo pagado por el estado/)).toBeVisible();
});

test("None of these clears checked exemptions, and the reverse", async ({ page }) => {
  const dialog = await openTool(page);
  await dialog.getByRole("radio", { name: "I have full Medi-Cal now" }).check();
  await dialog.getByRole("radio", { name: "19 to 64" }).check();
  const veteran = dialog.getByRole("checkbox", { name: /veteran/ });
  const none = dialog.getByRole("checkbox", { name: "None of these" });
  await veteran.check();
  await none.check();
  await expect(veteran).not.toBeChecked();
  await veteran.check();
  await expect(none).not.toBeChecked();
});

test("links: the tool chip updates the URL; a wrong tool name falls back to the screener", async ({ page }) => {
  let dialog = await openTool(page);
  await dialog.getByRole("button", { name: "Which benefits can I get?" }).click();
  await expect(page).toHaveURL(/help=benefits&hv=screener/);
  await dialog.getByRole("button", { name: TOOL.en }).click();
  await expect(page).toHaveURL(/help=benefits&hv=medi-cal/);
  dialog = await openTool(page, "en", "help=benefits&hv=nope");
  await expect(dialog.getByRole("button", { name: "Which benefits can I get?" })).toHaveAttribute("aria-pressed", "true");
  // The Work tab's tools don't take Benefits' names.
  dialog = await openTool(page, "en", "help=work&hv=medi-cal");
  await expect(dialog.getByRole("button", { name: "Unpaid wages" })).toHaveAttribute("aria-pressed", "true");
});

test("privacy: nothing typed is sent anywhere", async ({ page }) => {
  const dialog = await openTool(page);
  const sent: Request[] = [];
  page.on("request", (r) => sent.push(r));
  await basics(dialog);
  await dialog.getByLabel(/Your income in a typical month/).fill("4321");
  await dialog.getByLabel("Hours of work a month").fill("37");
  await expect(result(dialog)).toContainText("You likely meet the work rule");
  for (const r of sent) {
    const all = `${r.url()} ${r.postData() ?? ""}`;
    expect(all).not.toContain("4321");
    expect(all).not.toMatch(/[?&=]37\b/);
  }
  expect(page.url()).not.toContain("4321");
});

test("WCAG 2.2 AA in every result state (light and dark), and it fits a 320px phone", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const dialog = await openTool(page);
    await basics(dialog);
    await dialog.getByLabel("Hours of work a month").fill("20");
    await expect(result(dialog)).toContainText("You may not meet the work rule yet");
    await expectNoA11yViolations(page);
    await dialog.getByLabel("Hours of work a month").fill("abc");
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expectNoA11yViolations(page);
    await dialog.getByRole("checkbox", { name: /veteran/ }).check();
    await expect(result(dialog)).toContainText("You likely don’t have to meet the work rule");
    await expectNoA11yViolations(page);
    await dialog.getByRole("radio", { name: "65 or older" }).check();
    await expect(result(dialog)).toContainText("doesn’t apply to you");
    await expectNoA11yViolations(page);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  const dialog = await openTool(page, "es");
  await dialog.getByRole("radio", { name: "Tengo Medi-Cal completo" }).check();
  await dialog.getByRole("radio", { name: "De 19 a 64" }).check();
  await dialog.getByRole("checkbox", { name: "Ninguna" }).check();
  await dialog.getByLabel("Horas de trabajo al mes").fill("20");
  await expect(result(dialog)).toBeVisible();
  const overflow = await page.locator(".help__body").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
