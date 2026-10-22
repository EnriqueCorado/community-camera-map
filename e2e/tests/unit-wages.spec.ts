// Unit tests for the "Unpaid wages" math (no browser): daily vs weekly
// overtime, double time, the 7th-day rule, farm and household rule sets,
// minimum wage, break premiums, the capped waiting-time penalty, exact
// cents, parsing, the demand letter, and that the facts haven't gone stale.
import { test, expect } from "@playwright/test";
import {
  STRAIGHT_TIME,
  belowMinimum,
  breakPremiums,
  dailyWageCents,
  daysLate,
  graceDays,
  minWageFor,
  parseCount,
  parseHours,
  rulesFor,
  splitDay,
  splitWeek,
  splitWeeks,
  toCents,
  unitsToCents,
  waitingPenalty,
  wagesOwed,
} from "../../frontend/src/help/wages";
import { LAB_226_7_RECHECK, MIN_WAGE, OT_RULES, WAGE_FACTS, WAGE_SOURCES } from "../../frontend/src/help/wages-facts";
import { WAGES_COPY } from "../../frontend/src/help/wages-copy";
import { citeIn, owedLines, wageLetter, wageLetterFields, type WageSummary } from "../../frontend/src/help/wages-letter";
import { dayNumber } from "../../frontend/src/help/dates";

const H = 60;
const G = OT_RULES.general.rules;
const h = (...hours: number[]) => hours.map((x) => Math.round(x * H));
const inHours = (s: { reg: number; ot: number; dt: number }) => ({ reg: s.reg / H, ot: s.ot / H, dt: s.dt / H });

// ------------------------------------------------------------ overtime split

test.describe("general rules (Lab. Code §510)", () => {
  test("8 a day, 5 days: all regular", () => {
    expect(inHours(splitWeek(h(8, 8, 8, 8, 8, 0, 0), G))).toEqual({ reg: 40, ot: 0, dt: 0 });
  });

  test("daily overtime after 8, double time after 12", () => {
    expect(inHours(splitDay(10 * H, G, false))).toEqual({ reg: 8, ot: 2, dt: 0 });
    expect(inHours(splitDay(12 * H, G, false))).toEqual({ reg: 8, ot: 4, dt: 0 });
    expect(inHours(splitDay(14 * H, G, false))).toEqual({ reg: 8, ot: 4, dt: 2 });
    expect(inHours(splitDay(0, G, false))).toEqual({ reg: 0, ot: 0, dt: 0 });
  });

  test("weekly overtime after 40 regular hours (6 days of 8)", () => {
    expect(inHours(splitWeek(h(8, 8, 8, 8, 8, 8, 0), G))).toEqual({ reg: 40, ot: 8, dt: 0 });
  });

  test("daily overtime is not counted again toward the weekly 40", () => {
    // 4 x 10 = 40 hours: 32 regular + 8 daily OT, no weekly OT.
    expect(inHours(splitWeek(h(10, 10, 10, 10, 0, 0, 0), G))).toEqual({ reg: 32, ot: 8, dt: 0 });
    // 6 x 9 = 54: 48 regular -> 40 + 8 weekly OT, plus 6 daily OT.
    expect(inHours(splitWeek(h(9, 9, 9, 9, 9, 9, 0), G))).toEqual({ reg: 40, ot: 14, dt: 0 });
  });

  test("7th day of the workweek: first 8 at 1.5x, after 8 at 2x, no straight time", () => {
    // 7 x 8: days 1-6 give 48 regular -> 40 + 8 weekly OT; day 7 is 8 OT.
    expect(inHours(splitWeek(h(8, 8, 8, 8, 8, 8, 8), G))).toEqual({ reg: 40, ot: 16, dt: 0 });
    expect(inHours(splitWeek(h(4, 4, 4, 4, 4, 4, 10), G))).toEqual({ reg: 24, ot: 8, dt: 2 });
    expect(inHours(splitDay(10 * H, G, true))).toEqual({ reg: 0, ot: 8, dt: 2 });
  });

  test("the 7th-day rule needs all seven days worked", () => {
    // Day 1 off: the last day isn't a 7th day of work.
    expect(inHours(splitWeek(h(0, 8, 8, 8, 8, 8, 10), G))).toEqual({ reg: 40, ot: 10, dt: 0 });
  });

  test("weeks add up independently (no carrying overtime across weeks)", () => {
    const a = h(8, 8, 8, 8, 8, 8, 0);
    const b = h(8, 8, 8, 0, 0, 0, 0);
    expect(inHours(splitWeeks([a, b], G))).toEqual({ reg: 64, ot: 8, dt: 0 });
  });

  test("more than 7 entries are ignored", () => {
    expect(splitWeek([...h(8, 8, 8, 8, 8, 8, 8), 600], G)).toEqual(splitWeek(h(8, 8, 8, 8, 8, 8, 8), G));
  });
});

test.describe("farm, household and attendant rule sets", () => {
  test("farm thresholds in 2026: 8/40/12 for large and small employers alike", () => {
    for (const r of [OT_RULES.farm, OT_RULES.farmLarge, OT_RULES.farmSmall]) {
      expect(r.rules).toEqual({ dailyOt: 8 * H, weeklyOt: 40 * H, dailyDt: 12 * H, seventhDayDt: 8 * H });
    }
    expect(OT_RULES.farmLarge.fromYear).toBe(2022);
    expect(OT_RULES.farmSmall.fromYear).toBe(2025);
    expect(OT_RULES.farm.fromYear).toBe(2025);
  });

  test("rulesFor: farms, any size, in 2025+ use 8/40/12 with the 7th day", () => {
    for (const size of ["large", "small", "unsure", null] as const) {
      for (const year of [2025, 2026]) {
        const p = rulesFor("farm", size, year, OT_RULES);
        expect(p).toMatchObject({ known: true, cite: OT_RULES.farm.cite });
        expect(inHours(splitWeek(h(10, 10, 10, 10, 10, 0, 0), p.rules))).toEqual({ reg: 40, ot: 10, dt: 0 });
        expect(inHours(splitWeek(h(13, 0, 0, 0, 0, 0, 0), p.rules))).toEqual({ reg: 8, ot: 4, dt: 1 });
      }
    }
  });

  test("rulesFor: 2022-2024 is known only for large farms (26+)", () => {
    expect(rulesFor("farm", "large", WAGE_FACTS.spanFrom, OT_RULES)).toMatchObject({ known: true, cite: OT_RULES.farmLarge.cite, rules: G });
    for (const size of ["small", "unsure", null] as const) {
      const p = rulesFor("farm", size, WAGE_FACTS.spanFrom, OT_RULES);
      expect(p.known).toBe(false);
      expect(p.rules).toEqual(STRAIGHT_TIME);
      expect(inHours(splitWeek(h(12, 12, 12, 12, 12, 12, 12), p.rules))).toEqual({ reg: 84, ot: 0, dt: 0 });
    }
  });

  test("rulesFor: farm work before 2022 (still phasing in) is never computed as overtime", () => {
    for (const size of ["large", "small", "unsure", null] as const) {
      expect(rulesFor("farm", size, "earlier", OT_RULES)).toMatchObject({ known: false, rules: STRAIGHT_TIME });
    }
  });

  test("the year options: recent years, the span, then earlier", () => {
    expect(WAGE_FACTS.spanFrom).toBe(OT_RULES.farmLarge.fromYear);
    expect(WAGE_FACTS.earliestYear).toBe(OT_RULES.farm.fromYear);
  });

  test("personal attendant: 1.5x after 9 a day or 45 a week, no double time, no 7th-day rule", () => {
    const p = rulesFor("attendant", null, 2026, OT_RULES);
    expect(p.cite).toBe("Lab. Code §1454");
    expect(inHours(splitDay(9 * H, p.rules, false))).toEqual({ reg: 9, ot: 0, dt: 0 });
    expect(inHours(splitDay(14 * H, p.rules, false))).toEqual({ reg: 9, ot: 5, dt: 0 });
    expect(inHours(splitWeek(h(9, 9, 9, 9, 9, 0, 0), p.rules))).toEqual({ reg: 45, ot: 0, dt: 0 });
    expect(inHours(splitWeek(h(8, 8, 8, 8, 8, 8, 8), p.rules))).toEqual({ reg: 45, ot: 11, dt: 0 });
  });

  test("household (not live-in) uses Wage Order 15 8/40/12; live-in is not computed", () => {
    expect(rulesFor("household", null, 2026, OT_RULES)).toMatchObject({ known: true, cite: "IWC Wage Order 15 §3(C)", rules: G });
    expect(rulesFor("livein", null, 2026, OT_RULES)).toMatchObject({ known: false, rules: STRAIGHT_TIME });
    expect(rulesFor("general", null, "earlier", OT_RULES)).toMatchObject({ known: true, cite: "Lab. Code §510(a)" });
  });
});

// ------------------------------------------------------------ money

test.describe("wages owed (integer cents)", () => {
  test("exact cents for 1.5x and 2x at an odd rate", () => {
    // $17.25/hr, one 14-hour day: 8 x 17.25 = 138.00; 4 x 25.875 = 103.50; 2 x 34.50 = 69.00.
    const r = wagesOwed({ weeks: [h(14)], rateCents: 1725, minWageCents: 1690, paidCents: 0, rules: G })!;
    expect(r).toMatchObject({ regularCents: 13800, overtimeCents: 10350, doubleCents: 6900, minWageGapCents: 0, earnedCents: 31050, unpaidCents: 31050 });
  });

  test("half cents are rounded down, never up", () => {
    // $16.95 x 1.5 = $25.425/hr; 1 hour of OT -> 2542 cents, not 2543.
    const r = wagesOwed({ weeks: [h(9)], rateCents: 1695, minWageCents: 1690, paidCents: 0, rules: G })!;
    expect(r.overtimeCents).toBe(2542);
    // 20 minutes at $20 = $6.666… -> 666 cents.
    expect(unitsToCents(1)).toBe(0);
    const t = wagesOwed({ weeks: [[20]], rateCents: 2000, minWageCents: null, paidCents: 0, rules: G })!;
    expect(t.regularCents).toBe(666);
  });

  test("owed = should have earned − paid, never negative", () => {
    const week = h(10, 10, 10, 10, 10, 0, 0); // 40 reg + 10 OT
    const r = wagesOwed({ weeks: [week], rateCents: 2000, minWageCents: 1690, paidCents: 100000, rules: G })!;
    expect(r.earnedCents).toBe(40 * 2000 + 10 * 3000);
    expect(r.unpaidCents).toBe(110000 - 100000);
    expect(wagesOwed({ weeks: [week], rateCents: 2000, minWageCents: 1690, paidCents: 200000, rules: G })!.unpaidCents).toBe(0);
  });

  test("straight-time pay for overtime hours: only the missing half is owed", () => {
    // Paid $20 x 50 hours flat = $1,000; owed 10 OT hours x $10 = $100.
    const r = wagesOwed({ weeks: [h(10, 10, 10, 10, 10)], rateCents: 2000, minWageCents: 1690, paidCents: 100000, rules: G })!;
    expect(r.unpaidCents).toBe(10000);
  });

  test("minimum wage shortfall on every hour, at 1x, 1.5x and 2x", () => {
    // $15/hr vs $16.90: gap $1.90. One 13-hour day: 8 reg, 4 OT, 1 DT.
    const r = wagesOwed({ weeks: [h(13)], rateCents: 1500, minWageCents: 1690, paidCents: 0, rules: G })!;
    expect(r.minWageGapCents).toBe(8 * 190 + 4 * 285 + 1 * 380);
    expect(r.earnedCents).toBe(8 * 1690 + 4 * 2535 + 1 * 3380);
    expect(belowMinimum(1500, 1690)).toBe(true);
    expect(belowMinimum(1690, 1690)).toBe(false);
  });

  test("no hourly rate: hours are valued at the minimum wage; no rate at all -> null", () => {
    const r = wagesOwed({ weeks: [h(8, 8)], rateCents: null, minWageCents: 1690, paidCents: 20000, rules: G })!;
    expect(r.rateCents).toBe(1690);
    expect(r.earnedCents).toBe(16 * 1690);
    expect(r.unpaidCents).toBe(16 * 1690 - 20000);
    expect(wagesOwed({ weeks: [h(8)], rateCents: null, minWageCents: null, paidCents: 0, rules: G })).toBeNull();
  });

  test("8 weeks of long days stays exact", () => {
    const week = h(11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 13);
    const r = wagesOwed({ weeks: Array(8).fill(week), rateCents: 1733, minWageCents: 1690, paidCents: 0, rules: G })!;
    const one = splitWeek(week, G);
    expect(r.hours).toEqual({ reg: one.reg * 8, ot: one.ot * 8, dt: one.dt * 8 });
    expect(Number.isInteger(r.earnedCents)).toBe(true);
    expect(r.earnedCents).toBe(r.regularCents + r.overtimeCents + r.doubleCents);
  });

  test("toCents", () => {
    expect(toCents(16.9)).toBe(1690);
    expect(toCents(0.29)).toBe(29);
    expect(toCents(1234.56)).toBe(123456);
  });
});

test.describe("minimum wage table", () => {
  test("2026 is $16.90 and 2027 is $17.40, for every employer size", () => {
    expect(minWageFor(2026, MIN_WAGE)).toBe(1690);
    expect(minWageFor(2027, MIN_WAGE)).toBe(1740);
    expect(minWageFor(2024, MIN_WAGE)).toBeNull();
    expect(minWageFor("earlier", MIN_WAGE)).toBeNull();
  });

  // Fails on purpose when a new year starts without its rate (see wages-facts.ts).
  test("the table has this year's minimum wage", () => {
    expect(minWageFor(new Date().getFullYear(), MIN_WAGE), "add this year's rate to MIN_WAGE").not.toBeNull();
  });

  test("re-read Lab. Code §226.7 before its stated end date", () => {
    expect(new Date().toISOString().slice(0, 10) < LAB_226_7_RECHECK, "§226.7 (break premiums) needs re-checking").toBe(true);
  });
});

// ------------------------------------------------------------ breaks and final pay

test.describe("break premiums (§226.7)", () => {
  test("one hour of pay per day, per type", () => {
    expect(breakPremiums(3, 2, 2000)).toEqual({ mealCents: 6000, restCents: 4000 });
    expect(breakPremiums(0, 0, 2000)).toEqual({ mealCents: 0, restCents: 0 });
    expect(breakPremiums(-2, Number.NaN, 2000)).toEqual({ mealCents: 0, restCents: 0 });
    expect(breakPremiums(2.9, 1, 1690)).toEqual({ mealCents: 3380, restCents: 1690 });
  });
});

test.describe("final pay and waiting-time penalty (§201-203)", () => {
  const d = (iso: string) => dayNumber(iso)!;

  test("due dates: fired / quit with notice same day; quit without notice or seasonal 72 hours", () => {
    expect(graceDays("fired")).toBe(0);
    expect(graceDays("quitNotice")).toBe(0);
    expect(graceDays("quitNoNotice")).toBe(3);
    expect(graceDays("seasonal")).toBe(3);
  });

  test("days late counts from the due date", () => {
    expect(daysLate(d("2026-10-01"), "fired", d("2026-10-01"))).toBe(0);
    expect(daysLate(d("2026-10-01"), "fired", d("2026-10-06"))).toBe(5);
    expect(daysLate(d("2026-10-01"), "quitNotice", d("2026-10-02"))).toBe(1);
    expect(daysLate(d("2026-10-01"), "quitNoNotice", d("2026-10-04"))).toBe(0);
    expect(daysLate(d("2026-10-01"), "quitNoNotice", d("2026-10-06"))).toBe(2);
    expect(daysLate(d("2026-10-01"), "seasonal", d("2026-10-03"))).toBe(0);
    expect(daysLate(d("2026-10-10"), "fired", d("2026-10-01"))).toBe(0); // paid "before" the last day
  });

  test("penalty: a day's wages per day late, capped at 30 days", () => {
    const daily = dailyWageCents(2000, 8 * H);
    expect(daily).toBe(16000);
    expect(waitingPenalty(daily, 5, WAGE_FACTS.penaltyMaxDays)).toEqual({ days: 5, cents: 80000 });
    expect(waitingPenalty(daily, 30, 30)).toEqual({ days: 30, cents: 480000 });
    expect(waitingPenalty(daily, 31, 30)).toEqual({ days: 30, cents: 480000 });
    expect(waitingPenalty(daily, 400, 30)).toEqual({ days: 30, cents: 480000 });
    expect(waitingPenalty(daily, -3, 30)).toEqual({ days: 0, cents: 0 });
    expect(WAGE_FACTS.penaltyMaxDays).toBe(30);
  });

  test("daily wage for a part-hour day is rounded down", () => {
    expect(dailyWageCents(1695, 7.5 * H)).toBe(12712); // 127.125
    expect(dailyWageCents(1690, -60)).toBe(0);
  });
});

// ------------------------------------------------------------ parsing

test.describe("parsing typed values", () => {
  test("hours", () => {
    expect(parseHours("")).toBe(0);
    expect(parseHours(" 8 ")).toBe(480);
    expect(parseHours("8.5")).toBe(510);
    expect(parseHours("8,5")).toBe(510);
    expect(parseHours("7.75")).toBe(465);
    expect(parseHours(".5")).toBe(30);
    expect(parseHours("8:30")).toBe(510);
    expect(parseHours("8.33")).toBe(499); // 499.8 floored
    expect(parseHours("24")).toBe(1440);
    expect(parseHours("24.5")).toBeNull();
    expect(parseHours("25")).toBeNull();
    expect(parseHours("8:75")).toBeNull();
    expect(parseHours("-1")).toBeNull();
    expect(parseHours("abc")).toBeNull();
    expect(parseHours(".")).toBeNull();
    expect(parseHours("8.123")).toBeNull();
  });

  test("counts", () => {
    expect(parseCount("")).toBe(0);
    expect(parseCount("3")).toBe(3);
    expect(parseCount("3.5")).toBeNull();
    expect(parseCount("-1")).toBeNull();
    expect(parseCount("1000")).toBeNull();
  });
});

// ------------------------------------------------------------ letter

test.describe("demand letter", () => {
  const s: WageSummary = {
    unpaidCents: 31050,
    wageCite: "Lab. Code §510(a)",
    minWageShort: false,
    overtime: true,
    mealDays: 3,
    mealCents: 6000,
    restDays: 0,
    restCents: 0,
    penaltyDays: 5,
    penaltyCents: 80000,
    totalCents: 117050,
    ending: "fired",
    lastDay: "2026-10-01",
  };
  const values = { you: "Ana López", employer: "Valley Farms LLC", job: "a field worker", dates: "from March 3 to October 1, 2026", payBy: "2026-11-02", records: ["payroll"] };

  test("lists each amount with its Labor Code section, the total, the date, and the next step", () => {
    const t = wageLetter(s).render(values, "en", "2026-10-21");
    expect(t).toContain("Dear Valley Farms LLC:");
    expect(t).toContain("I worked for you as a field worker from March 3 to October 1, 2026.");
    expect(t).toContain("My job ended on October 1, 2026, when I was let go. Under Labor Code section 201");
    expect(t).toContain("- Unpaid wages for the hours I worked and overtime (Labor Code §510(a)): $310.50");
    expect(t).toContain("- Premium pay for 3 workday(s) without a required meal period (Labor Code §226.7): $60");
    expect(t).not.toContain("rest period");
    expect(t).toContain("(Labor Code §203): $800");
    expect(t).toContain("Total: $1,170.50");
    expect(t).toContain("Please pay me $1,170.50 by November 2, 2026");
    expect(t).toContain("payroll records, which Labor Code section 226 requires within 21 days");
    expect(t).not.toContain("personnel file");
    expect(t).toContain("file a wage claim with the California Labor Commissioner");
  });

  test("never threatens or mentions immigration", () => {
    for (const lang of ["en", "es"] as const) {
      const t = wageLetter(s).render(values, lang, "2026-10-21").toLowerCase();
      for (const bad of ["immigra", "police", "polic", "criminal", "lawsuit", "sue ", "demand"]) expect(t, `${lang}: ${bad}`).not.toContain(bad);
    }
  });

  test("Spanish letter", () => {
    const t = wageLetter({ ...s, minWageShort: true }).render(values, "es", "2026-10-21");
    expect(t).toContain("Estimado/a Valley Farms LLC:");
    expect(t).toContain("incluso el salario mínimo");
    expect(t).toContain("Código Laboral §510(a); Código Laboral §1182.12");
    expect(t).toMatch(/Total: .*1.?170[.,]50/); // localized money
    expect(t).toContain("Comisión Laboral de California");
    expect(t).toContain("2 de noviembre de 2026");
  });

  test("says 'overtime' only when overtime was counted", () => {
    expect(owedLines({ ...s, overtime: false }, "en")[0]).toBe("- Unpaid wages for the hours I worked (Labor Code §510(a)): $310.50");
    expect(owedLines({ ...s, overtime: false }, "es")[0]).not.toContain("horas extra");
  });

  test("without a calculator total it asks for the amount and leaves blanks to fill in", () => {
    expect(wageLetterFields(null).some((f) => f.id === "owed")).toBe(true);
    expect(wageLetterFields(s).some((f) => f.id === "owed")).toBe(false);
    const blank = wageLetter(null).render({}, "en", "2026-10-21");
    expect(blank).toContain("you owe me [Amount you are owed] in unpaid wages");
    expect(blank).toContain("[Ask to be paid by]");
    expect(wageLetter(null).render({ owed: "450" }, "en", "2026-10-21")).toContain("Please pay me $450 by");
    expect(owedLines({ ...s, unpaidCents: 0, mealCents: 0, penaltyCents: 0, totalCents: 0 }, "en")).toEqual([]);
  });

  test("citeIn", () => {
    expect(citeIn("Lab. Code §860(d)(1), §862(a)-(b); IWC Wage Order 14 §3", "en")).toBe("Labor Code §860(d)(1), §862(a)-(b); IWC Wage Order 14 §3");
    expect(citeIn("IWC Wage Order 15 §3(C)", "es")).toBe("Orden Salarial de la IWC 15 §3(C)");
  });
});

// ------------------------------------------------------------ data integrity

test.describe("facts and copy", () => {
  test("every fact has a citation and both languages", () => {
    const lists = [WAGE_FACTS.overtime, WAGE_FACTS.minWage, WAGE_FACTS.breaks, WAGE_FACTS.finalPay, WAGE_FACTS.claim, WAGE_FACTS.retaliation];
    for (const f of lists.flat()) {
      expect(f.cite, f.id).toBeTruthy();
      expect(f.en.length, f.id).toBeGreaterThan(20);
      expect(f.es.length, f.id).toBeGreaterThan(20);
    }
    for (const b of WAGE_FACTS.bring) expect(b.es).toBeTruthy();
  });

  test("links are https and phone numbers are complete", () => {
    for (const s of WAGE_SOURCES) expect(s.url).toMatch(/^https:\/\//);
    for (const u of [WAGE_FACTS.office.url, WAGE_FACTS.statewide.online, ...Object.values(WAGE_FACTS.forms), WAGE_FACTS.legalAidAtWork.url]) expect(u).toMatch(/^https:\/\//);
    for (const p of [WAGE_FACTS.office.phone, WAGE_FACTS.statewide.phone, WAGE_FACTS.legalAidAtWork.phone!]) expect(p.replace(/\D/g, "")).toHaveLength(10);
  });

  test("facts were checked within the last year", () => {
    const age = (Date.now() - Date.parse(WAGE_FACTS.checked)) / 86_400_000;
    expect(age, "re-check wages-facts.ts").toBeLessThan(366);
  });

  test("copy has the same keys in both languages, and 7 day names", () => {
    expect(Object.keys(WAGES_COPY.es).sort()).toEqual(Object.keys(WAGES_COPY.en).sort());
    for (const l of ["en", "es"] as const) {
      expect(WAGES_COPY[l].days).toHaveLength(7);
      expect(WAGES_COPY[l].daysLong).toHaveLength(7);
    }
  });
});
