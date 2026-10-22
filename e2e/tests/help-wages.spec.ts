// End-to-end: the "Unpaid wages" tool (Work tab) in a real browser — the
// hours grid, the breakdown table, final pay, the letter, accessibility in
// both themes and Spanish, phone width, and the privacy promise.
import { test, expect, type Locator, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function openWages(page: Page, lang: "en" | "es" = "en") {
  await page.goto(`./#help=work${lang === "es" ? "&lang=es" : ""}`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Unpaid wages|Salarios no pagados/ })).toHaveAttribute("aria-pressed", "true");
  return dialog;
}

async function expectNoA11yViolations(page: Page, include: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(include).analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

/** Type one week of hours into week `n` (1-based). */
async function fillWeek(dialog: Locator, n: number, hours: string[], lang: "en" | "es" = "en") {
  const week = dialog.getByRole("group", { name: lang === "es" ? `Semana ${n}: horas de cada día` : `Week ${n}: hours each day` });
  const boxes = week.getByRole("textbox");
  await expect(boxes).toHaveCount(7);
  for (let i = 0; i < 7; i++) await boxes.nth(i).fill(hours[i] ?? "");
}

const amountIn = (dialog: Locator, row: string | RegExp) => dialog.getByRole("row", { name: row }).getByRole("cell").last();

/** The worked example: farm work in 2026, 5 x 10 h + 9 h on Saturday at $17.25, paid $1,000. */
async function fillExample(dialog: Locator, lang: "en" | "es" = "en") {
  const es = lang === "es";
  await dialog.getByRole("radio", { name: es ? /campo/ : /Farm or field work/ }).check();
  await fillWeek(dialog, 1, ["10", "10", "10", "10", "10", "9", ""], lang);
  await dialog.getByLabel(es ? "Su pago por hora" : "Your hourly pay").fill("17.25");
  await dialog.getByLabel(es ? /Lo que de verdad le pagaron/ : /What you were actually paid/).fill("1000");
}

test("farm week: daily and weekly overtime, what was paid, and the total", async ({ page }) => {
  const dialog = await openWages(page);
  await expect(dialog.getByText("Answer step 1 first.")).toBeVisible();
  await fillExample(dialog);
  await expect(dialog.getByText(/Farm work follows the same rules as most jobs/)).toBeVisible();
  await expect(dialog.getByText("Week total: 59 hours")).toBeVisible();
  const table = dialog.getByRole("table", { name: "How the amount adds up" });
  await expect(table).toBeVisible();
  // 40 regular x $17.25 = $690; 19 overtime (10 daily + 8 weekly + 1) x $25.875 = $491.625 -> $491.62.
  await expect(table.getByRole("row", { name: /Regular hours at \$17\.25/ }).getByRole("cell").first()).toHaveText("40");
  await expect(amountIn(table, /Regular hours/)).toHaveText("$690");
  await expect(table.getByRole("row", { name: /Overtime at 1\.5 times \(\$25\.875\)/ }).getByRole("cell").first()).toHaveText("19");
  await expect(amountIn(table, /Overtime at 1\.5/)).toHaveText("$491.62");
  await expect(amountIn(table, "What these hours should have paid")).toHaveText("$1,181.62");
  await expect(amountIn(table, "Minus what you were paid")).toHaveText("− $1,000");
  await expect(amountIn(table, "Unpaid wages")).toHaveText("$181.62");
  await expect(amountIn(table, "Total you may be owed")).toHaveText("$181.62");
  await expect(dialog.getByText("You may be owed about $181.62")).toBeVisible();
  await expect(table.getByRole("rowheader", { name: /Double time/ })).toHaveCount(0); // no 12+ hour day

  // Missed meal breaks on 3 days: 3 x $17.25 = $51.75 more.
  await dialog.getByLabel("Days you didn’t get a meal break you were owed").fill("3");
  await expect(amountIn(table, /Missed meal breaks: 3 day/)).toHaveText("$51.75");
  await expect(amountIn(table, "Total you may be owed")).toHaveText("$233.37");
});

test("double time and the 7th day of the workweek", async ({ page }) => {
  const dialog = await openWages(page);
  await dialog.getByRole("radio", { name: /Other work/ }).check();
  // Seven days in a row; the 7th has 10 hours: 8 at 1.5x and 2 at 2x.
  await fillWeek(dialog, 1, ["13", "8", "8", "8", "8", "8", "10"]);
  await dialog.getByLabel("Your hourly pay").fill("20");
  await expect(dialog.getByText(/Type what you were paid for these weeks \(0 if nothing\)/)).toBeVisible();
  await expect(dialog.getByRole("table")).toHaveCount(0); // a blank "paid" is not assumed to be $0
  await dialog.getByLabel(/What you were actually paid/).fill("0");
  const table = dialog.getByRole("table");
  // Days 1-6: 48 regular -> 40 + 8 weekly OT; day 1 adds 4 OT + 1 DT; day 7 adds 8 OT + 2 DT.
  await expect(table.getByRole("row", { name: /Regular hours/ }).getByRole("cell").first()).toHaveText("40");
  await expect(table.getByRole("row", { name: /Overtime/ }).getByRole("cell").first()).toHaveText("20");
  await expect(table.getByRole("row", { name: /Double time at 2 times \(\$40\.00\)/ }).getByRole("cell").first()).toHaveText("3");
  await expect(amountIn(table, "What these hours should have paid")).toHaveText("$1,520"); // 800 + 600 + 120
  await expect(dialog.getByText(/so Sun counts as the 7th day/)).toBeVisible();
  // Starting the workweek on Sunday relabels the boxes: the 7th box is now Saturday.
  await dialog.getByLabel("Your workweek starts on").selectOption({ label: "Sunday" });
  await expect(dialog.getByText(/so Sat counts as the 7th day/)).toBeVisible();
});

test("minimum wage: a rate below $16.90 adds the difference on every hour", async ({ page }) => {
  const dialog = await openWages(page);
  await dialog.getByRole("radio", { name: /Other work/ }).check();
  await fillWeek(dialog, 1, ["8", "8", "8", "8", "8", "", ""]);
  await dialog.getByLabel("Your hourly pay").fill("15");
  await dialog.getByLabel(/What you were actually paid/).fill("600");
  const table = dialog.getByRole("table");
  await expect(amountIn(table, /Extra to reach the minimum wage \(\$16\.90 an hour\)/)).toHaveText("$76");
  await expect(amountIn(table, "Unpaid wages")).toHaveText("$76");
  await expect(dialog.locator(".wnotes").getByText(/liquidated damages/)).toBeVisible();
  // Bad input is announced and doesn't produce a number.
  await dialog.getByLabel("Your hourly pay").fill("abc");
  await expect(dialog.getByRole("alert")).toContainText("dollar amount");
  await dialog.getByLabel("Your hourly pay").fill("15");
  await fillWeek(dialog, 1, ["25", "8", "8", "8", "8", "", ""]);
  await expect(dialog.getByRole("alert")).toContainText("no more than 24");
});

test("personal attendant: overtime after 9 a day / 45 a week; breaks are an 'ask'", async ({ page }) => {
  const dialog = await openWages(page);
  await dialog.getByRole("radio", { name: /In someone’s home/ }).check();
  await dialog.getByRole("radio", { name: "Personal attendant or caregiver" }).check();
  await expect(dialog.getByText(/^Personal attendants get 1\.5 times their pay after 9 hours in a day or 45 hours in a week/)).toBeVisible();
  await fillWeek(dialog, 1, ["10", "10", "10", "10", "10", "", ""]);
  await dialog.getByLabel("Your hourly pay").fill("20");
  await dialog.getByLabel(/What you were actually paid/).fill("0");
  const table = dialog.getByRole("table");
  await expect(table.getByRole("row", { name: /Regular hours/ }).getByRole("cell").first()).toHaveText("45");
  await expect(amountIn(table, "What these hours should have paid")).toHaveText("$1,050"); // 45 x 20 + 5 x 30
  await expect(dialog.getByText(/break rules apply to your kind of household job/)).toBeVisible();
  await expect(dialog.getByLabel(/meal break you were owed/)).toHaveCount(0);
});

test("final pay: the waiting-time penalty stops at 30 days", async ({ page }) => {
  const dialog = await openWages(page);
  await dialog.getByRole("radio", { name: /Other work/ }).check();
  await dialog.getByLabel("Your hourly pay").fill("20");
  await dialog.getByRole("radio", { name: "I was fired or laid off" }).check();
  await dialog.getByLabel("Your last day of work").fill("2026-01-05");
  await dialog.getByLabel("Hours in a usual workday").fill("8");
  await expect(dialog.getByRole("table")).toHaveCount(0); // nothing counted until they say whether they were paid
  await dialog.getByRole("radio", { name: "Not yet" }).check();
  const table = dialog.getByRole("table");
  await expect(amountIn(table, /Late final pay: 30 day/)).toHaveText("$4,800"); // 30 x 8 x $20
  await expect(dialog.getByText(/“willfully”/)).toBeVisible();
  // Paid 2 days late after quitting without notice: due within 72 hours, so 0 days.
  await dialog.getByRole("radio", { name: "I quit without 72 hours’ notice" }).check();
  await dialog.getByRole("radio", { name: "Yes", exact: true }).check();
  await dialog.getByLabel("Date you got your final pay").fill("2026-01-07");
  await expect(dialog.getByRole("table")).toHaveCount(0);
  await dialog.getByLabel("Date you got your final pay").fill("2026-01-10");
  await expect(amountIn(table, /Late final pay: 2 day/)).toHaveText("$320");
  await dialog.getByLabel("Date you got your final pay").fill("2026-01-01");
  await expect(dialog.getByRole("alert")).toContainText("can’t be before your last day");
});

test("farm work in 2022–2024 asks the employer size; small farms count straight time", async ({ page }) => {
  const dialog = await openWages(page);
  await dialog.getByRole("radio", { name: /Farm or field work/ }).check();
  await expect(dialog.getByRole("group", { name: /How many workers/ })).toHaveCount(0);
  await dialog.getByRole("radio", { name: "2022–2024" }).check();
  await dialog.getByRole("radio", { name: "25 or fewer" }).check();
  await expect(dialog.getByText(/still being phased in before 2025/)).toBeVisible();
  await fillWeek(dialog, 1, ["10", "10", "10", "10", "10", "", ""]);
  await dialog.getByLabel("Your hourly pay").fill("20");
  await dialog.getByLabel(/What you were actually paid/).fill("0");
  const table = dialog.getByRole("table");
  await expect(amountIn(table, "What these hours should have paid")).toHaveText("$1,000"); // 50 x $20, no overtime
  await expect(dialog.locator(".wnotes").getByText(/Overtime isn’t counted here/)).toBeVisible();
  await expect(dialog.locator(".wnotes").getByText(/haven’t confirmed the minimum wage for “2022–2024”/)).toBeVisible();
  await dialog.getByRole("radio", { name: "26 or more" }).check();
  await expect(amountIn(table, "What these hours should have paid")).toHaveText("$1,100"); // + 10 OT hours x $10
  await dialog.getByRole("radio", { name: "Before 2022" }).check();
  await expect(amountIn(table, "What these hours should have paid")).toHaveText("$1,000");
});

test("weeks: add (focus moves to the new week), remove, and stop at 8", async ({ page }) => {
  const dialog = await openWages(page);
  await dialog.getByRole("radio", { name: /Other work/ }).check();
  await fillWeek(dialog, 1, ["8", "8", "8", "8", "8", "8", ""]);
  const add = dialog.getByRole("button", { name: "Add another week" });
  await add.click();
  await expect(dialog.getByRole("group", { name: "Week 2: hours each day" }).getByRole("textbox").first()).toBeFocused();
  await fillWeek(dialog, 2, ["8", "8", "8", "8", "8", "8", ""]);
  await dialog.getByLabel("Your hourly pay").fill("20");
  await dialog.getByLabel(/What you were actually paid/).fill("0");
  // Overtime counts per week: 8 + 8 weekly hours, not 56 over 40.
  await expect(dialog.getByRole("table").getByRole("row", { name: /Overtime/ }).getByRole("cell").first()).toHaveText("16");
  await dialog.getByRole("button", { name: "Remove week 2" }).click();
  await expect(dialog.getByRole("group", { name: "Week 2: hours each day" })).toHaveCount(0);
  await expect(add).toBeFocused();
  for (let i = 0; i < 7; i++) await add.click();
  await expect(dialog.getByRole("group", { name: /^Week \d: hours each day$/ })).toHaveCount(8);
  await expect(add).toHaveCount(0);
  await expect(dialog.getByText("You can add up to 8 weeks at a time.")).toBeVisible();
});

test("letter lists the amounts with Labor Code sections; legal help button opens the Legal tab", async ({ page }) => {
  const dialog = await openWages(page);
  await fillExample(dialog);
  await dialog.getByLabel("Days you didn’t get a meal break you were owed").fill("3");
  await dialog.getByLabel("Your full name").fill("Ana López");
  await dialog.getByLabel("Employer’s legal name").fill("Valley Farms LLC");
  const preview = dialog.getByLabel("Your letter");
  await expect(preview).toHaveValue(/Dear Valley Farms LLC:/);
  await expect(preview).toHaveValue(/Unpaid wages for the hours I worked and overtime \(Labor Code §860\(d\), §862; IWC Wage Order 14 §3\(A\)\(1\), §3\(B\)\): \$181\.62/);
  await expect(preview).toHaveValue(/meal period \(Labor Code §226\.7\): \$51\.75/);
  await expect(preview).toHaveValue(/Total: \$233\.37/);
  await expect(preview).toHaveValue(/wage claim with the California Labor Commissioner/);
  await expect(preview).not.toHaveValue(/immigra/i);
  await dialog.getByRole("button", { name: "Español" }).click();
  await expect(preview).toHaveValue(/Comisión Laboral de California/);

  await expect(dialog.getByRole("link", { name: /\(209\) 948-7771/ })).toHaveAttribute("href", "tel:2099487771");
  await expect(dialog.getByText("3021 Reynolds Ranch Parkway, Suite 160, Lodi, CA 95240")).toBeVisible();
  await dialog.getByRole("button", { name: "See free legal help near you" }).click();
  await expect(dialog.getByRole("tab", { name: "Legal help" })).toHaveAttribute("aria-selected", "true");
});

test("privacy: rate, hours and pay are never sent or stored", async ({ page }) => {
  const seen: Request[] = [];
  page.on("request", (r) => seen.push(r));
  const dialog = await openWages(page);
  const secrets = { rate: "23.47", hours: "11.75", paid: "987.65", name: "Zyxwv Qutsr", lastDay: "2026-03-17" };
  await dialog.getByRole("radio", { name: /Other work/ }).check();
  await fillWeek(dialog, 1, [secrets.hours, "", "", "", "", "", ""]);
  await dialog.getByLabel("Your hourly pay").fill(secrets.rate);
  await dialog.getByLabel(/What you were actually paid/).fill(secrets.paid);
  await dialog.getByRole("radio", { name: "I was fired or laid off" }).check();
  await dialog.getByLabel("Your last day of work").fill(secrets.lastDay);
  await dialog.getByLabel("Your full name").fill(secrets.name);
  await expect(dialog.getByRole("table")).toBeVisible();
  await page.waitForTimeout(500);

  for (const r of seen) {
    const body = r.postData() ?? "";
    for (const s of Object.values(secrets)) {
      expect(r.url(), `leaked in a URL: ${r.url()}`).not.toContain(s);
      expect(r.url()).not.toContain(encodeURIComponent(s));
      expect(body, `leaked in a request body to ${r.url()}`).not.toContain(s);
    }
  }
  for (const s of Object.values(secrets)) expect(page.url()).not.toContain(s);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  for (const s of Object.values(secrets)) expect(stored).not.toContain(s);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`a11y (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    for (const lang of ["en", "es"] as const) {
      test(`filled-in wages tool (${lang}, ${scheme}) has no WCAG 2.2 AA violations`, async ({ page }) => {
        const dialog = await openWages(page, lang);
        await expectNoA11yViolations(page, ".help__card");
        await fillExample(dialog, lang);
        await dialog.getByRole("radio", { name: lang === "es" ? /Me despidieron o/ : "I was fired or laid off" }).check();
        await fillWeek(dialog, 1, ["abc", "10", "10", "10", "10", "9", ""], lang); // include an error state
        await expect(dialog.getByRole("alert")).toBeVisible();
        await fillWeek(dialog, 1, ["10", "10", "10", "10", "10", "9", ""], lang);
        await expect(dialog.getByRole("table")).toBeVisible();
        await expectNoA11yViolations(page, ".help__card");
      });
    }
  });
}

test.describe("400% zoom (320 CSS px wide)", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const lang of ["en", "es"] as const) {
    test(`the filled-in tool reflows without sideways scrolling (${lang})`, async ({ page }) => {
      const dialog = await openWages(page, lang);
      await fillExample(dialog, lang);
      await dialog.getByRole("button", { name: lang === "es" ? "Agregar otra semana" : "Add another week" }).click();
      await expect(dialog.getByRole("table")).toBeVisible();
      const overflow = await page.evaluate(() => {
        const body = document.querySelector(".help__body") as HTMLElement;
        return body.scrollWidth - body.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(0);
      const tableOverflow = await page.evaluate(() => {
        const wrap = document.querySelector(".wtable-wrap") as HTMLElement;
        return wrap.scrollWidth - wrap.clientWidth;
      });
      expect(tableOverflow, "table").toBeLessThanOrEqual(0);
    });
  }
});
