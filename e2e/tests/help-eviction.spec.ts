// End-to-end: the "Got an eviction notice?" deadline helper (Renters tab) in a
// real browser — the flow, the deadline text, the "Count my days" detail,
// refusing to guess, accessibility (light, dark, Spanish), a 320px screen,
// and the privacy promise (typed dates never sent or stored).
// The clock is fixed so "days from today" is deterministic.
import { test, expect, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
/** Monday, Oct 26, 2026, mid-morning in the browser's own time zone. */
const NOW = new Date(2026, 9, 26, 10, 0, 0);

async function openEviction(page: Page, lang: "en" | "es" = "en", now: Date = NOW) {
  await page.clock.setFixedTime(now);
  await page.goto(`./#help=rent${lang === "es" ? "&lang=es" : ""}`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: lang === "es" ? "¿Recibió un aviso de desalojo?" : "Got an eviction notice?" }).click();
  return dialog;
}

async function fill(dialog: ReturnType<Page["getByRole"]>, kind: RegExp, date: string, delivery: RegExp) {
  await dialog.getByRole("radio", { name: kind }).check();
  await dialog.getByLabel(/When did you get it|Cuándo lo recibió/).fill(date);
  await dialog.getByRole("radio", { name: delivery }).check();
}

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(".help__card").analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test("3-day notice to pay, handed over: Wednesday deadline, 2 days left, urgent, with the count", async ({ page }) => {
  const dialog = await openEviction(page);
  await expect(dialog.getByRole("heading", { name: /Find your deadline/ })).toBeVisible();
  await fill(dialog, /A 3-day notice to pay rent/, "2026-10-23", /Handed to me in person/);
  const out = dialog.locator(".hev-out");
  await expect(out).toHaveAttribute("aria-live", "polite");
  await expect(out.getByText("Last day to pay all the rent the notice asks for")).toBeVisible();
  await expect(out.locator(".hev-deadline")).toHaveText("Wednesday, October 28, 2026");
  await expect(out.getByText("That is 2 days from today.")).toBeVisible();
  await expect(out.locator(".hresult--bad")).toBeVisible(); // 3 days or less left
  await expect(out.getByText(/cannot lock you out themselves/)).toBeVisible();
  await out.getByText("Count my days").click();
  await expect(out.getByText("The day you got it (Friday, October 23, 2026) does not count.")).toBeVisible();
  await expect(out.getByText("Day 1: Monday, October 26, 2026")).toBeVisible();
  await expect(out.getByText("Day 3: Wednesday, October 28, 2026")).toBeVisible();
  await expect(out.getByText("Weekend days skipped: 2.")).toBeVisible();
  await expect(out.getByText(/Farmworkers Day 2027/)).toHaveCount(0); // only shown for 2027 counts
  // Next steps for a notice: you don't have to move by then; lockouts are illegal.
  await expect(dialog.getByText(/You do not have to move out by this date/)).toBeVisible();
  await expect(dialog.getByText(/up to \$100 per day/)).toBeVisible();
  await expect(dialog.getByText(/Threatening to call immigration/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "(209) 577-3811" }).first()).toHaveAttribute("href", "tel:2095773811");
});

test("court papers left with someone: service complete after 10 days, then 10 court days skipping Veterans Day", async ({ page }) => {
  const dialog = await openEviction(page);
  await fill(dialog, /Court papers/, "2026-10-21", /Left with another adult/);
  const out = dialog.locator(".hev-out");
  await expect(out.getByText("Last day to file your Answer")).toBeVisible();
  await expect(out.locator(".hev-deadline")).toHaveText("Monday, November 16, 2026");
  await expect(out.getByText("That is 21 days from today.")).toBeVisible();
  await expect(out.locator(".hresult--warn")).toBeVisible();
  await out.getByText("Count my days").click();
  await expect(out.getByText(/delivered 10 days after mailing.*that is Saturday, October 31, 2026/)).toBeVisible();
  await expect(out.getByText("Veterans Day: Wednesday, November 11, 2026")).toBeVisible();
  // Court-paper steps: Answer UD-105 at Turlock, fee waiver, Self-Help Center.
  await expect(dialog.getByText(/form UD-105/).first()).toBeVisible();
  await expect(dialog.getByText(/FW-001/).first()).toBeVisible();
  await expect(dialog.getByText("300 Starr Ave, Turlock, CA 95380")).toBeVisible();
  await expect(dialog.getByText("800 11th St, Room 220, Modesto, CA").first()).toBeVisible();
  await expect(dialog.getByText(/530-3178/)).toHaveCount(0);
});

test("refuses to guess: before 2026, and court papers posted when the 2027 rules apply", async ({ page }) => {
  const dialog = await openEviction(page, "en", new Date(2027, 0, 15, 10, 0, 0));
  await fill(dialog, /A 3-day notice to pay rent/, "2025-12-15", /Handed to me in person/);
  const out = dialog.locator(".hev-out");
  await expect(out.getByText("We can’t count days for that date — call now")).toBeVisible();
  await dialog.getByRole("radio", { name: /Court papers/ }).check();
  await dialog.getByLabel(/When did you get it/).fill("2026-12-28");
  await dialog.getByRole("radio", { name: /Posted on my door/ }).check();
  await expect(out.getByText(/change on January 1, 2027/)).toBeVisible();
  // A future date is caught.
  await dialog.getByLabel(/When did you get it/).fill("2027-01-16");
  await expect(out.getByText(/That date is in the future/)).toBeVisible();
});

test("a 2027 count across the disputed Farmworkers Day counts it as a court day and says so", async ({ page }) => {
  const dialog = await openEviction(page, "en", new Date(2027, 3, 8, 9, 0, 0));
  await fill(dialog, /A 3-day notice to pay rent/, "2027-04-07", /Handed to me in person/);
  const out = dialog.locator(".hev-out");
  await expect(out.locator(".hev-deadline")).toHaveText("Monday, April 12, 2027");
  await expect(out.getByText("That is 4 days from today.")).toBeVisible();
  await expect(out.getByText(/Farmworkers Day 2027 is listed on two different dates/)).toBeVisible();
  await out.getByText("Count my days").click();
  await expect(out.getByText("Day 2: Friday, April 9, 2027")).toBeVisible();
  await expect(out.getByText(/state law says March 31/)).toBeVisible();
});

test("past deadline and 'I'm not sure' give clear next steps", async ({ page }) => {
  const dialog = await openEviction(page);
  await fill(dialog, /A 3-day notice to move out/, "2026-10-01", /Handed to me in person/);
  await expect(dialog.getByText(/That date has passed \(21 days ago\)/)).toBeVisible();
  await expect(dialog.getByText(/The landlord may file a court case now/)).toBeVisible();
  await dialog.getByRole("radio", { name: /I’m not sure/ }).check();
  await expect(dialog.getByText("Look at the top of the paper")).toBeVisible();
});

test("the legal-help button opens the Legal help tab", async ({ page }) => {
  const dialog = await openEviction(page);
  await dialog.getByRole("button", { name: "Get free legal help now" }).click();
  await expect(dialog.getByRole("tab", { name: "Legal help" })).toHaveAttribute("aria-selected", "true");
});

test("Spanish: same deadline, Spanish dates", async ({ page }) => {
  const dialog = await openEviction(page, "es");
  await fill(dialog, /Papeles de la corte/, "2026-10-21", /Me los dieron en persona/);
  await expect(dialog.getByText("Último día para presentar su Respuesta")).toBeVisible();
  await expect(dialog.locator(".hev-deadline")).toHaveText("miércoles, 4 de noviembre de 2026");
  await expect(dialog.getByText("Faltan 9 días a partir de hoy.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Obtenga ayuda legal gratis ahora" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  for (const lang of ["en", "es"] as const) {
    test.describe(`a11y (${scheme}, ${lang})`, () => {
      test.use({ colorScheme: scheme });
      test(`eviction helper, filled, has no WCAG 2.2 AA violations`, async ({ page }) => {
        const dialog = await openEviction(page, lang);
        await expectNoA11yViolations(page);
        if (lang === "en") await fill(dialog, /A 3-day notice to pay rent/, "2026-10-23", /Posted on my door/);
        else await fill(dialog, /Papeles de la corte/, "2026-10-21", /Los dejaron con otro adulto/);
        await dialog.locator(".hev-count summary").click();
        await expect(dialog.locator(".hev-days li").first()).toBeVisible();
        await expectNoA11yViolations(page);
      });
    });
  }
}

test.describe("320 CSS px wide", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test("no sideways scrolling with a result and the count open", async ({ page }) => {
    const dialog = await openEviction(page);
    await fill(dialog, /Court papers/, "2026-10-21", /Left with another adult/);
    await dialog.locator(".hev-count summary").click();
    const overflow = await page.evaluate(() => {
      const body = document.querySelector(".help__body") as HTMLElement;
      return Math.max(body.scrollWidth - body.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth);
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("privacy: typed dates are never sent or stored", async ({ page }) => {
  const seen: Request[] = [];
  page.on("request", (r) => seen.push(r));
  const dialog = await openEviction(page);
  const typed = ["2026-09-04", "2026-08-17"];
  await fill(dialog, /A 3-day notice to pay rent/, typed[0], /Posted on my door/);
  await expect(dialog.locator(".hev-deadline")).toHaveText("Thursday, September 10, 2026"); // Labor Day skipped
  await dialog.getByRole("radio", { name: /A 60-day notice/ }).check();
  await dialog.getByLabel(/When did you get it/).fill(typed[1]);
  await expect(dialog.locator(".hev-deadline")).toHaveText("Friday, October 16, 2026");
  const variants = typed.flatMap((d) => {
    const [y, m, day] = d.split("-");
    return [d, `${m}/${day}/${y}`, `${y}${m}${day}`];
  });
  for (const r of seen) {
    const body = r.postData() ?? "";
    for (const v of variants) {
      expect(r.url(), `leaked in a URL: ${r.url()}`).not.toContain(v);
      expect(body, `leaked in a request body to ${r.url()}`).not.toContain(v);
    }
  }
  for (const v of variants) expect(page.url()).not.toContain(v);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  for (const v of variants) expect(stored).not.toContain(v);
});
