// End-to-end: the Benefits screener in a real browser — a filled-in example,
// results grouped by verdict, accessibility (light, dark, Spanish), a 320px
// phone, and the privacy promise (typed income never leaves the page).
import { test, expect, type Locator, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function openBenefits(page: Page, lang: "en" | "es" = "en") {
  await page.goto(`./#help=benefits${lang === "es" ? "&lang=es" : ""}`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Benefits|Beneficios/ })).toHaveAttribute("aria-selected", "true");
  return dialog;
}

/** A family of 3 in Modesto: $2,100 a month, a toddler, MID power, PG&E gas, ITIN. */
async function fillExample(dialog: Locator, income = "2100") {
  await dialog.getByLabel("People in your household").selectOption("3");
  await dialog.getByLabel("Household income before taxes").fill(income);
  await dialog.getByRole("group", { name: /per month or per year/ }).getByRole("radio", { name: "per month" }).check();
  await dialog.getByLabel(/Children under 19/).selectOption("1");
  await dialog.getByRole("radio", { name: "Under 5" }).check();
  await dialog.getByRole("group", { name: /pregnant/ }).getByRole("radio", { name: "No", exact: true }).check();
  await dialog.getByRole("group", { name: /60 or older/ }).getByRole("radio", { name: "No", exact: true }).check();
  await dialog.getByRole("radio", { name: /^MID/ }).check();
  await dialog.getByRole("group", { name: /gas bill from PG&E/ }).getByRole("radio", { name: "Yes", exact: true }).check();
  await dialog.getByRole("radio", { name: "ITIN" }).check();
}

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(".help__card").analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test("filled example: results grouped Likely / Maybe / Probably not, with reasons and how to apply", async ({ page }) => {
  const dialog = await openBenefits(page);
  await expect(dialog.getByText("Enter your household size and income to see results.")).toBeVisible();
  await fillExample(dialog);

  await expect(dialog.getByText(/\d+ likely, \d+ maybe, \d+ probably not\./)).toBeVisible();
  const likely = dialog.getByRole("region", { name: /^Likely/ });
  const calfresh = likely.getByRole("article", { name: "CalFresh (food benefits)" });
  await expect(calfresh).toContainText("Your income ($2,100 a month) is under the limit of $4,554 a month for 3 people.");
  await expect(calfresh).toContainText("Up to $808 a month for 3 people.");
  await expect(calfresh).toContainText("Oct 1, 2026 – Sep 30, 2027");
  await expect(calfresh.getByRole("link", { name: /1-877-847-3663/ })).toHaveAttribute("href", "tel:18778473663");
  await expect(calfresh.getByRole("link", { name: /BenefitsCal\.com/ })).toHaveAttribute("href", "https://benefitscal.com");
  await expect(calfresh).toContainText("Immigration note:");

  await expect(likely.getByRole("article", { name: /^WIC/ })).toBeVisible();
  await expect(likely.getByRole("article", { name: "Medi-Cal for children under 19" })).toBeVisible();
  await expect(likely.getByRole("article", { name: /^MID CARES/ })).toContainText("$4,553 a month");
  await expect(likely.getByRole("article", { name: /^PG&E CARE/ })).toContainText("$2,100 a month, or $25,200 a year");
  await expect(likely.getByRole("article", { name: /^CalEITC/ })).toBeVisible();
  await expect(likely.getByRole("article", { name: /Young Child Tax Credit/ })).toBeVisible();

  // LIHEAP's newest table has ended, so it's a maybe that says why.
  const maybe = dialog.getByRole("region", { name: /^Maybe/ });
  await expect(maybe.getByRole("article", { name: /^LIHEAP/ })).toContainText("from last year");

  // ITIN filers: federal EITC is out, with the reason.
  const no = dialog.getByRole("region", { name: /^Probably not/ });
  await expect(no.getByRole("article", { name: /Federal Earned Income/ })).toContainText("needs a Social Security number");
  await expect(dialog.getByText(/These figures change every year/)).toBeVisible();

  // One cent over CalFresh's limit moves it out of "Likely".
  await dialog.getByLabel("Household income before taxes").fill("4554.01");
  await expect(no.getByRole("article", { name: "CalFresh (food benefits)" })).toContainText("is over the limit of $4,554 a month");
  await dialog.getByLabel("Household income before taxes").fill("4554");
  await expect(likely.getByRole("article", { name: "CalFresh (food benefits)" })).toContainText("Being exactly at the limit still counts.");
});

test("unanswered questions are pending, and bad input is flagged", async ({ page }) => {
  const dialog = await openBenefits(page);
  await dialog.getByLabel("Household income before taxes").fill("1500");
  await expect(dialog.getByText(/Answer the rest of the questions to check \d+ more programs\./)).toBeVisible();
  await dialog.getByLabel("Household income before taxes").fill("12.34.5");
  await expect(dialog.getByRole("alert")).toContainText("Enter a dollar amount");
});

test("Spanish: same example reads in Spanish", async ({ page }) => {
  const dialog = await openBenefits(page, "es");
  await dialog.getByLabel("Personas en su hogar").selectOption("3");
  await dialog.getByLabel("Ingresos del hogar antes de impuestos").fill("2100");
  await dialog.getByRole("group", { name: /embarazada/ }).getByRole("radio", { name: "No", exact: true }).check();
  await dialog.getByRole("group", { name: /60 años/ }).getByRole("radio", { name: "No", exact: true }).check();
  const card = dialog.getByRole("region", { name: /^Probable \(/ }).getByRole("article", { name: /^CalFresh/ });
  await expect(card).toContainText("Sus ingresos ($2,100 al mes) están por debajo del límite de $4,554 al mes para 3 personas.");
  await expect(card).toContainText("1 de oct. de 2026");
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`a11y (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test(`benefits with results (en, ${scheme}) has no WCAG 2.2 AA violations`, async ({ page }) => {
      const dialog = await openBenefits(page);
      await fillExample(dialog);
      await expect(dialog.getByRole("region", { name: /^Probably not/ })).toBeVisible();
      for (const d of await dialog.locator("details").all()) await d.evaluate((el) => ((el as HTMLDetailsElement).open = true));
      await expectNoA11yViolations(page);
    });
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`a11y Spanish (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test(`benefits in Spanish with results (${scheme}) has no WCAG 2.2 AA violations`, async ({ page }) => {
      const dialog = await openBenefits(page, "es");
      await dialog.getByLabel("Ingresos del hogar antes de impuestos").fill("1800");
      await dialog.getByRole("group", { name: /60 años/ }).getByRole("radio", { name: "Sí", exact: true }).check();
      await expect(dialog.getByRole("region", { name: /^Probable \(/ })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  });
}

test.describe("320px wide", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test("the form and results reflow without sideways scrolling", async ({ page }) => {
    const dialog = await openBenefits(page);
    await fillExample(dialog);
    await expect(dialog.getByRole("region", { name: /^Likely/ })).toBeVisible();
    const overflow = await page.evaluate(() => {
      const body = document.querySelector(".help__body") as HTMLElement;
      return body.scrollWidth - body.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("privacy: typed income never appears in a request, the URL or storage", async ({ page }) => {
  const dialog = await openBenefits(page);
  const seen: Request[] = [];
  page.on("request", (r) => seen.push(r));
  const secret = "2873.19";
  await fillExample(dialog, secret);
  await expect(dialog.getByText(/\$2,873\.19 a month/).first()).toBeVisible();
  await dialog.getByLabel("Household income before taxes").fill("31415");
  await dialog.getByRole("radio", { name: "per year" }).check();
  await expect(dialog.getByText(/\$31,415 a year/).first()).toBeVisible();

  const secrets = [secret, "2873", "31415", "31,415"];
  for (const r of seen) {
    const body = r.postData() ?? "";
    for (const s of secrets) {
      expect(r.url(), `leaked in a URL: ${r.url()}`).not.toContain(s);
      expect(body, `leaked in a request body to ${r.url()}`).not.toContain(s);
    }
  }
  for (const s of secrets) expect(page.url()).not.toContain(s);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  for (const s of secrets) expect(stored).not.toContain(s);
});
