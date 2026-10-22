// Unit tests for the Benefits screener (no browser): every income table at,
// one cent over, and past the printed household sizes; each program's
// verdict rules; the explanation text; and a stale-data guard that fails
// once a table's period (or re-check date) is over.
import { test, expect } from "@playwright/test";
import { cents, check, isOld, limitFor, screen, type Answers, type ProgramResult } from "../../frontend/src/help/benefits";
import { BENEFITS_SOURCES, PROGRAMS, PUBLIC_CHARGE, TABLES, TAX, TIPS, type IncomeTable, type TableId } from "../../frontend/src/help/benefits-facts";
import { BENEFITS_COPY } from "../../frontend/src/help/benefits-copy";
import { MEDICAL_FACTS } from "../../frontend/src/help/facts";
import { povertyLine } from "../../frontend/src/help/fpl";
import { dayNumber } from "../../frontend/src/help/dates";
import { formatMoney } from "../../frontend/src/help/money";

const TODAY = "2026-10-21";
const money = (n: number) => formatMoney(n / 100, "en-US");

/** A complete set of answers (override what a test cares about). */
function answers(over: Partial<Answers> = {}): Answers {
  return {
    size: 1,
    income: 0,
    per: "month",
    children: 0,
    pregnant: "no",
    olderOrDisabled: "no",
    gets: [],
    electric: "pge",
    taxId: "ssn",
    ...over,
  };
}

function result(a: Answers, id: ProgramResult["id"], today = TODAY): ProgramResult | undefined {
  return screen(a, today).results.find((r) => r.id === id);
}

const verdict = (a: Answers, id: ProgramResult["id"], today = TODAY) => result(a, id, today)?.verdict;

// ------------------------------------------------------------- tables

test.describe("income tables", () => {
  const ids = Object.keys(TABLES) as TableId[];

  test("sizes 1–8 match the printed figures (to the cent)", () => {
    const printed: Record<string, number[]> = {
      calfresh: [2660, 3608, 4554, 5500, 6448, 7394, 8340, 9288],
      wic: [2461, 3337, 4212, 5088, 5964, 6839, 7715, 8591],
      mediCalKids: [3538, 4799, 6057, 7315, 8576, 9835, 11093, 12354],
      mediCalPregnant: [2833, 3843, 4851, 5858, 6868, 7875, 8883, 9892],
      mcap: [4283, 5809, 7332, 8855, 10382, 11905, 13428, 14954],
      mediCalAdults: [1836, 2490, 3143, 3795, 4450, 5102, 5755, 6409],
      coveredCa: [63840, 86560, 109280, 132000, 154720, 177440, 200160, 222880],
      care: [43280, 43280, 54640, 66000, 77360, 88720, 100080, 111440],
      fera: [54100, 54100, 68300, 82500, 96700, 110900, 125100, 139300],
      mid: [3607, 3607, 4553, 5500, 6447, 7393, 8340, 9287],
      // TID and LifeLine print sizes 1-4 and "+$X each additional": 5-8 come from that rule.
      tid: [43280, 43280, 54640, 66000, 77360, 88720, 100080, 111440],
      lifeline: [24600, 33300, 42100, 50800, 59500, 68200, 76900, 85600],
      liheap: [3331.66, 4356.83, 5382.0, 6407.16, 7432.25, 8457.41, 8649.66, 8841.83],
    };
    for (const [id, row] of Object.entries(printed)) {
      row.forEach((d, i) => expect(limitFor(TABLES[id as TableId], i + 1), `${id} size ${i + 1}`).toBe(cents(d)));
    }
  });

  test("past the printed sizes, each added person adds the source's amount", () => {
    for (const id of ids) {
      const t: IncomeTable = TABLES[id];
      const last = t.bySize.length;
      for (let n = last + 1; n <= 20; n++) {
        expect(limitFor(t, n) - limitFor(t, n - 1), `${id} size ${n}`).toBe(cents(t.perExtra));
      }
    }
    // Spot checks against the sources' own words.
    expect(limitFor(TABLES.calfresh, 9)).toBe(cents(9288 + 948));
    expect(limitFor(TABLES.wic, 10)).toBe(cents(8591 + 2 * 876));
    expect(limitFor(TABLES.liheap, 9)).toBe(cents(9034.08));
    expect(limitFor(TABLES.liheap, 10)).toBe(cents(9226.25));
    expect(limitFor(TABLES.liheap, 11)).toBe(cents(9418.46)); // +$192.21 over 10
    expect(limitFor(TABLES.mediCalAdults, 0)).toBe(cents(1836)); // clamped to 1
    expect(limitFor(TABLES.mediCalAdults, 99)).toBe(limitFor(TABLES.mediCalAdults, 20));
  });

  test("both bases agree where a source prints both (WIC, MID)", () => {
    for (const id of ["wic", "mid"] as const) {
      const t: IncomeTable = TABLES[id];
      for (let n = 1; n <= 12; n++) {
        // A printed monthly figure is the yearly one rounded to the dollar.
        expect(Math.abs(limitFor(t, n) * 12 - limitFor(t.alt!, n)), `${id} ${n}`).toBeLessThanOrEqual(600 * 12);
      }
    }
  });

  test("200%/400% tables match 2026 poverty guidelines", () => {
    const fpl = MEDICAL_FACTS.fpl;
    for (let n = 2; n <= 12; n++) {
      expect(limitFor(TABLES.care, n), `CARE ${n}`).toBe(cents(2 * povertyLine(fpl, n)));
      expect(limitFor(TABLES.tid, n), `TID ${n}`).toBe(cents(2 * povertyLine(fpl, n)));
      expect(limitFor(TABLES.coveredCa, n), `Covered CA ${n}`).toBe(cents(4 * povertyLine(fpl, n)));
    }
  });

  test("every table: at the limit is within, one cent over is not (typed in its own basis)", () => {
    for (const id of ids) {
      const t: IncomeTable = TABLES[id];
      for (let size = 1; size <= 10; size++) {
        const lim = limitFor(t, size);
        expect(check(id, { size, income: lim, per: t.per }).cmp, `${id} ${size} at`).toBe("at");
        expect(check(id, { size, income: lim + 1, per: t.per }).cmp, `${id} ${size} over`).toBe("over");
        expect(check(id, { size, income: lim - 1, per: t.per }).cmp, `${id} ${size} below`).toBe("below");
      }
    }
  });

  test("monthly-only tables with a yearly income: compare with limit × 12, no rounding", () => {
    const lim = limitFor(TABLES.calfresh, 3) * 12; // $54,648
    expect(check("calfresh", { size: 3, income: lim, per: "year" })).toMatchObject({ cmp: "at", per: "year", limit: lim });
    expect(check("calfresh", { size: 3, income: lim + 1, per: "year" }).cmp).toBe("over");
    // LIHEAP's cents survive scaling: $5,382.00 × 12 = $64,584.00.
    expect(check("liheap", { size: 3, income: cents(64584), per: "year" }).cmp).toBe("at");
    expect(check("liheap", { size: 3, income: cents(64584.01), per: "year" }).cmp).toBe("over");
  });

  test("yearly-only tables with a monthly income: income × 12, never a rounded-up monthly limit", () => {
    // CARE for 3 is $54,640 a year = $4,553.33… a month.
    expect(check("care", { size: 3, income: cents(4553.33), per: "month" })).toMatchObject({ cmp: "below", per: "year", income: cents(54639.96) });
    expect(check("care", { size: 3, income: cents(4553.34), per: "month" }).cmp).toBe("over");
    // LifeLine for 1 is $24,600 = exactly $2,050 a month.
    expect(check("lifeline", { size: 1, income: cents(2050), per: "month" }).cmp).toBe("at");
    expect(check("lifeline", { size: 1, income: cents(2050.01), per: "month" }).cmp).toBe("over");
  });

  test("printed both ways: compare in the basis typed (MID $3,607/month and $43,280/year)", () => {
    expect(check("mid", { size: 2, income: cents(3607), per: "month" }).cmp).toBe("at");
    expect(check("mid", { size: 2, income: cents(43280), per: "year" }).cmp).toBe("at");
    expect(check("mid", { size: 2, income: cents(43280.01), per: "year" }).cmp).toBe("over");
    expect(check("wic", { size: 4, income: cents(61050), per: "year" })).toMatchObject({ cmp: "at", per: "year" });
  });
});

// ------------------------------------------------------------- programs

test.describe("program verdicts", () => {
  test("CalFresh: $4,554 for 3 people; 60+/disabled over the limit is a maybe", () => {
    expect(verdict(answers({ size: 3, income: cents(4554) }), "calfresh")).toBe("likely");
    expect(verdict(answers({ size: 3, income: cents(4554.01) }), "calfresh")).toBe("unlikely");
    expect(verdict(answers({ size: 3, income: cents(4554.01), olderOrDisabled: "yes" }), "calfresh")).toBe("maybe");
    expect(verdict(answers({ size: 9, income: cents(10236) }), "calfresh")).toBe("likely"); // 9,288 + 948
    expect(verdict(answers({ size: 9, income: cents(10236.01) }), "calfresh")).toBe("unlikely");
    expect(result(answers({ size: 3, income: cents(100) }), "calfresh")?.upTo).toEqual({ cents: cents(808), per: "month" });
    expect(result(answers({ size: 10, income: cents(100) }), "calfresh")?.upTo?.cents).toBe(cents(1841 + 2 * 225));
  });

  test("WIC: needs pregnancy or a child under 5; 185% limit; programs count", () => {
    expect(result(answers({ size: 3, income: cents(1000) }), "wic")).toMatchObject({ verdict: "unlikely", reasons: [{ kind: "wicNoOne" }] });
    const kid = { size: 3, children: 1, youngest: "under5" as const };
    expect(verdict(answers({ ...kid, income: cents(4212) }), "wic")).toBe("likely");
    expect(verdict(answers({ ...kid, income: cents(4212.01) }), "wic")).toBe("maybe"); // kids' Medi-Cal reaches $6,057
    expect(verdict(answers({ ...kid, income: cents(6057.01) }), "wic")).toBe("unlikely");
    expect(verdict(answers({ ...kid, income: cents(9000), gets: ["calfresh"] }), "wic")).toBe("likely");
    expect(verdict(answers({ ...kid, income: cents(9000), gets: ["ssi"] }), "wic")).toBe("unlikely");
    expect(verdict(answers({ size: 2, pregnant: "yes", income: cents(3337) }), "wic")).toBe("likely");
    // Over pregnancy Medi-Cal ($3,843) but WIC may count the unborn baby: size 3 is $4,212.
    expect(result(answers({ size: 2, pregnant: "yes", income: cents(4212) }), "wic")).toMatchObject({ verdict: "maybe", reasons: [{ kind: "income" }, { kind: "unbornCounts" }] });
    expect(verdict(answers({ size: 2, pregnant: "yes", income: cents(4212.01) }), "wic")).toBe("unlikely");
    // Already on WIC but over the limit: check at renewal, not "probably not".
    expect(verdict(answers({ ...kid, income: cents(9000), gets: ["wic"] }), "wic")).toBe("maybe");
    expect(verdict(answers({ ...kid, youngest: "6to18", income: cents(100) }), "wic")).toBe("unlikely");
    expect(verdict(answers({ size: 3, children: 0, youngest: "under5", income: cents(100) }), "wic")).toBe("unlikely"); // stale age answer
  });

  test("Medi-Cal: children 266%, pregnancy 213% then MCAP 322%, adults 138%", () => {
    expect(result(answers({ income: cents(1) }), "medi-cal-kids")).toBeUndefined(); // no children
    const fam = { size: 4, children: 2, youngest: "6to18" as const };
    expect(verdict(answers({ ...fam, income: cents(7315) }), "medi-cal-kids")).toBe("likely");
    expect(verdict(answers({ ...fam, income: cents(7315.01) }), "medi-cal-kids")).toBe("unlikely");

    expect(result(answers({ income: cents(1) }), "medi-cal-pregnant")).toBeUndefined();
    const preg = { size: 2, pregnant: "yes" as const };
    expect(verdict(answers({ ...preg, income: cents(3843) }), "medi-cal-pregnant")).toBe("likely");
    expect(verdict(answers({ ...preg, income: cents(3843.01) }), "medi-cal-pregnant")).toBe("maybe");
    expect(verdict(answers({ ...preg, income: cents(5809) }), "medi-cal-pregnant")).toBe("maybe");
    expect(verdict(answers({ ...preg, income: cents(5809.01) }), "medi-cal-pregnant")).toBe("unlikely");

    expect(verdict(answers({ income: cents(1836) }), "medi-cal-adults")).toBe("likely");
    expect(result(answers({ income: cents(1836) }), "medi-cal-adults")?.reasons.map((r) => r.kind)).toContain("statusDepends");
    expect(verdict(answers({ income: cents(1836.01) }), "medi-cal-adults")).toBe("unlikely");
    expect(result(answers({ income: cents(1836.01), olderOrDisabled: "yes" }), "medi-cal-adults")).toMatchObject({ verdict: "maybe" });
    expect(result(answers({ income: cents(1836.01), olderOrDisabled: "yes" }), "medi-cal-adults")?.reasons.map((r) => r.kind)).toContain("mediCalOlder");
    expect(verdict(answers({ size: 11, income: cents(6409 + 3 * 655) }), "medi-cal-adults")).toBe("likely");
  });

  test("Covered California: between Medi-Cal and 400%", () => {
    expect(result(answers({ size: 4, income: cents(3795) }), "covered-ca")?.reasons[0]?.kind).toBe("mediCalInstead");
    expect(verdict(answers({ size: 4, income: cents(3795.01) }), "covered-ca")).toBe("likely");
    expect(verdict(answers({ size: 4, income: cents(132000), per: "year" }), "covered-ca")).toBe("likely");
    expect(verdict(answers({ size: 4, income: cents(132000.01), per: "year" }), "covered-ca")).toBe("unlikely");
  });

  test("PG&E electric: CARE to 200%, then FERA to 250% (never both)", () => {
    const y = (d: number) => answers({ size: 4, income: cents(d), per: "year", electric: "pge" });
    expect(verdict(y(66000), "pge-care")).toBe("likely");
    expect(result(y(66000), "pge-fera")).toBeUndefined();
    expect(verdict(y(66000.01), "pge-care")).toBe("unlikely");
    expect(verdict(y(66000.01), "pge-fera")).toBe("likely");
    expect(verdict(y(82500), "pge-fera")).toBe("likely");
    expect(verdict(y(82500.01), "pge-fera")).toBe("unlikely");
    // Sizes 1 and 2 share both limits.
    expect(verdict(answers({ size: 1, income: cents(43280), per: "year" }), "pge-care")).toBe("likely");
    expect(verdict(answers({ size: 2, income: cents(54100), per: "year" }), "pge-fera")).toBe("likely");
    // A program someone gets opens CARE at any income.
    expect(verdict(answers({ size: 4, income: cents(200000), per: "year", gets: ["wic"] }), "pge-care")).toBe("likely");
    expect(result(answers({ size: 4, income: cents(200000), per: "year", gets: ["wic"] }), "pge-fera")).toBeUndefined();
  });

  test("MID or TID electric with PG&E gas: the district's discount plus CARE on gas", () => {
    const mid = answers({ size: 2, income: cents(3607), electric: "mid", pgeGas: "yes" });
    expect(verdict(mid, "mid-cares")).toBe("likely");
    // CARE is yearly-only: $3,607 × 12 = $43,284 is over its $43,280.
    expect(verdict(mid, "pge-care")).toBe("unlikely");
    expect(verdict({ ...mid, income: cents(3606.66) }, "pge-care")).toBe("likely");
    expect(result(mid, "tid-cares")).toBeUndefined();
    expect(result(mid, "pge-fera")).toBeUndefined();
    expect(verdict(answers({ size: 2, income: cents(3607.01), electric: "mid", pgeGas: "no" }), "mid-cares")).toBe("unlikely");
    expect(result(answers({ electric: "mid", pgeGas: "no" }), "pge-care")).toBeUndefined();
    expect(verdict(answers({ electric: "tid", pgeGas: "unsure" }), "pge-care")).toBe("maybe");
    const tid = (d: number) => answers({ size: 5, income: cents(d), per: "year", electric: "tid", pgeGas: "no" });
    expect(verdict(tid(77360), "tid-cares")).toBe("likely");
    expect(verdict(tid(77360.01), "tid-cares")).toBe("unlikely");
  });

  test("not sure who sends the bill: each discount is at most a maybe", () => {
    const r = screen(answers({ size: 3, income: cents(1000), electric: "unsure" }), TODAY).results;
    for (const id of ["pge-care", "mid-cares", "tid-cares"] as const) expect(r.find((x) => x.id === id)?.verdict, id).toBe("maybe");
    expect(r.find((x) => x.id === "pge-fera")).toBeUndefined();
  });

  test("LIHEAP: last year's table caps it at maybe; CalFresh/CalWORKs open the income test", () => {
    const a = answers({ size: 3, income: cents(5382) });
    expect(verdict(a, "liheap", "2026-09-30")).toBe("likely");
    expect(verdict(a, "liheap", TODAY)).toBe("maybe");
    expect(result(a, "liheap")?.reasons.map((r) => r.kind)).toContain("oldTable");
    expect(verdict(answers({ size: 3, income: cents(5382.01) }), "liheap", "2026-09-30")).toBe("unlikely");
    expect(verdict(answers({ size: 3, income: cents(9000), gets: ["calworks"] }), "liheap", "2026-09-30")).toBe("likely");
    // Through CalFresh no limit is used, so last year's table doesn't matter.
    expect(verdict(answers({ size: 3, income: cents(9000), gets: ["calfresh"] }), "liheap", TODAY)).toBe("likely");
    expect(verdict(answers({ size: 3, income: cents(9000), gets: ["medi-cal"] }), "liheap", "2026-09-30")).toBe("unlikely");
    expect(isOld("liheap", TODAY)).toBe(true);
    expect(isOld("calfresh", TODAY)).toBe(false);
  });

  test("LifeLine: 150% yearly, or through a program", () => {
    expect(verdict(answers({ size: 6, income: cents(68200), per: "year" }), "lifeline")).toBe("likely");
    expect(verdict(answers({ size: 6, income: cents(68200.01), per: "year" }), "lifeline")).toBe("unlikely");
    expect(verdict(answers({ size: 6, income: cents(99999), per: "year", gets: ["ssi"] }), "lifeline")).toBe("likely");
  });

  test("CalEITC: $1 to $32,900 of earnings, SSN or ITIN", () => {
    const y = (d: number, over: Partial<Answers> = {}) => answers({ income: cents(d), per: "year", ...over });
    expect(verdict(y(32900), "caleitc")).toBe("likely");
    expect(verdict(y(32900.01), "caleitc")).toBe("unlikely");
    expect(verdict(y(20000, { taxId: "itin" }), "caleitc")).toBe("likely");
    expect(verdict(y(20000, { taxId: "none" }), "caleitc")).toBe("unlikely");
    expect(verdict(y(20000, { taxId: "unsure" }), "caleitc")).toBe("maybe");
    expect(verdict(y(0), "caleitc")).toBe("unlikely");
    expect(verdict(answers({ income: cents(2741.66) }), "caleitc")).toBe("likely"); // × 12 = 32,899.92
    expect(verdict(answers({ income: cents(2741.67) }), "caleitc")).toBe("unlikely"); // × 12 = 32,900.04
    expect(result(y(1, { children: 5 }), "caleitc")?.upTo?.cents).toBe(cents(3756));
  });

  test("YCTC: child under 6; no earnings needed", () => {
    const kid = { size: 2, children: 1, youngest: "under5" as const, per: "year" as const };
    expect(verdict(answers({ ...kid, income: 0 }), "yctc")).toBe("likely");
    expect(verdict(answers({ ...kid, income: cents(32900) }), "yctc")).toBe("likely");
    expect(verdict(answers({ ...kid, income: cents(32900.01) }), "yctc")).toBe("maybe");
    expect(verdict(answers({ ...kid, income: cents(35640) }), "yctc")).toBe("maybe");
    expect(verdict(answers({ ...kid, income: cents(35640.01) }), "yctc")).toBe("unlikely");
    expect(verdict(answers({ ...kid, youngest: "five", income: cents(1000) }), "yctc")).toBe("maybe");
    expect(verdict(answers({ ...kid, youngest: "6to18", income: cents(1000) }), "yctc")).toBe("unlikely");
    expect(verdict(answers({ ...kid, income: cents(1000), taxId: "itin" }), "yctc")).toBe("likely");
  });

  test("federal EITC: SSN only; income must be UNDER the single cap, then a maybe under the joint cap", () => {
    const y = (d: number, over: Partial<Answers> = {}) => answers({ size: 2, children: 1, youngest: "6to18", income: cents(d), per: "year", ...over });
    expect(verdict(y(50433.99), "federal-eitc")).toBe("likely");
    expect(verdict(y(50434), "federal-eitc")).toBe("maybe");
    expect(verdict(y(57553.99), "federal-eitc")).toBe("maybe");
    expect(verdict(y(57554), "federal-eitc")).toBe("unlikely");
    expect(result(y(60000), "federal-eitc")?.reasons[0]).toMatchObject({ kind: "taxIncome", filing: "joint", limit: cents(57554) });
    expect(verdict(y(20000, { taxId: "itin" }), "federal-eitc")).toBe("unlikely");
    expect(result(y(20000, { taxId: "unsure" }), "federal-eitc")?.reasons.map((r) => r.kind)).toContain("eitcSsnUnsure");
    expect(verdict(answers({ children: 0, income: cents(19103.99), per: "year" }), "federal-eitc")).toBe("likely");
    expect(verdict(answers({ children: 0, income: cents(19104), per: "year" }), "federal-eitc")).toBe("maybe");
    expect(verdict(answers({ size: 6, children: 4, youngest: "6to18", income: cents(61554.99), per: "year" }), "federal-eitc")).toBe("likely");
    expect(verdict(answers({ size: 6, children: 4, youngest: "6to18", income: cents(61555), per: "year" }), "federal-eitc")).toBe("maybe");
  });

  test("tax credits fall back to maybe once the next tax year's figures are due", () => {
    const a = answers({ income: cents(1000) });
    expect(verdict(a, "caleitc", TAX.recheckBy)).toBe("likely");
    const after = new Date(Date.parse(TAX.recheckBy) + 86_400_000).toISOString().slice(0, 10);
    expect(verdict(a, "caleitc", after)).toBe("maybe");
    expect(result(a, "caleitc", after)?.reasons.map((r) => r.kind)).toContain("oldTax");
  });

  test("questions not answered yet leave programs pending, not guessed", () => {
    const s = screen({ size: 3, income: cents(1500), per: "month" }, TODAY);
    expect(s.results.map((r) => r.id).sort()).toEqual(["covered-ca", "lifeline", "liheap"]);
    expect(s.pending).toEqual(expect.arrayContaining(["calfresh", "wic", "pge-care", "caleitc", "yctc", "federal-eitc"]));
    // Children answered but not the youngest's age: WIC and YCTC wait.
    const s2 = screen(answers({ size: 3, children: 1, youngest: undefined }), TODAY);
    expect(s2.pending.sort()).toEqual(["wic", "yctc"]);
  });
});

// ------------------------------------------------------------- copy

test.describe("explanations", () => {
  const en = BENEFITS_COPY.en;
  const es = BENEFITS_COPY.es;

  test("says the income, the limit used and the household size", () => {
    const c = check("calfresh", { size: 3, income: cents(2100), per: "month" });
    expect(en.reason({ kind: "income", check: c }, money)).toBe("Your income ($2,100 a month) is under the limit of $4,554 a month for 3 people.");
    const at = check("calfresh", { size: 3, income: cents(4554), per: "month" });
    expect(en.reason({ kind: "income", check: at }, money)).toContain("is exactly at the limit of $4,554 a month for 3 people. Being exactly at the limit still counts.");
    const conv = check("care", { size: 3, income: cents(2100), per: "month" });
    expect(en.reason({ kind: "income", check: conv }, money)).toBe("Your income ($2,100 a month, or $25,200 a year) is under the limit of $54,640 a year for 3 people.");
    const up = check("calfresh", { size: 1, income: cents(40000), per: "year" });
    expect(en.reason({ kind: "income", check: up }, money)).toBe("Your income ($40,000 a year) is over the limit of $2,660 a month ($31,920 a year) for 1 person.");
    expect(es.reason({ kind: "income", check: c }, (n) => formatMoney(n / 100, "es-US"))).toBe("Sus ingresos ($2,100 al mes) están por debajo del límite de $4,554 al mes para 3 personas.");
  });

  test("every reason kind has text in both languages", () => {
    const c = check("calfresh", { size: 1, income: 1, per: "month" });
    const kinds: Parameters<typeof en.reason>[0][] = [
      { kind: "income", check: c },
      { kind: "between", low: c, high: c },
      { kind: "gets", programs: ["medi-cal", "calfresh"], confirm: true },
      { kind: "already" },
      { kind: "olderOrDisabled" },
      { kind: "statusDepends" },
      { kind: "wicNoOne" },
      { kind: "wicViaMediCal" },
      { kind: "mcap", check: c },
      { kind: "utilityUnsure", company: "mid" },
      { kind: "pgeGasUnsure" },
      { kind: "oldTable", table: "liheap" },
      { kind: "taxNeedsId" },
      { kind: "taxIdUnsure" },
      { kind: "eitcSsnUnsure" },
      { kind: "oldTax" },
      { kind: "mediCalOlder" },
      { kind: "unbornCounts", check: c },
      { kind: "eitcNeedsSsn" },
      { kind: "earnedZero" },
      { kind: "earnedAssumption" },
      { kind: "taxIncome", cmp: "below", income: 1, limit: 2, children: 3 },
      { kind: "taxIncome", cmp: "at", income: 2, limit: 2, children: 1, filing: "joint", strict: true },
      { kind: "eitcJoint", limit: 1 },
      { kind: "yctcWages", limit: 1 },
      { kind: "yctcNoEarned" },
      { kind: "noYoungChild" },
      { kind: "childFive" },
      { kind: "mediCalInstead" },
    ];
    for (const k of kinds) {
      expect(en.reason(k, money).length, k.kind).toBeGreaterThan(10);
      expect(es.reason(k, money).length, k.kind).toBeGreaterThan(10);
      expect(es.reason(k, money), k.kind).not.toBe(en.reason(k, money));
    }
    expect(en.reason({ kind: "gets", programs: ["medi-cal", "calfresh", "wic"] }, money)).toContain("Medi-Cal, CalFresh or WIC");
    expect(en.reason({ kind: "taxIncome", cmp: "over", income: cents(70000), limit: cents(68675), children: 3, filing: "joint", strict: true }, money)).toBe(
      "Income for the year ($70,000) is over the $68,675 limit (married filing together, 3 or more children).",
    );
    expect(en.reason({ kind: "taxIncome", cmp: "at", income: cents(19104), limit: cents(19104), children: 0, filing: "single", strict: true }, money)).toContain(
      "(single or head of household, 0 children). It must be under the limit.",
    );
  });

  test("copy has the same keys in both languages", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
});

// ------------------------------------------------------------- data integrity

test.describe("benefits facts", () => {
  test("every program has both languages, a https apply link and sources", () => {
    for (const [id, p] of Object.entries(PROGRAMS)) {
      for (const field of [p.name, p.gives, p.immigration]) {
        expect(field.en.length, id).toBeGreaterThan(3);
        expect(field.es.length, id).toBeGreaterThan(3);
      }
      expect(p.apply.url, id).toMatch(/^https:\/\//);
      expect(p.sources.length, id).toBeGreaterThan(0);
      for (const ph of p.apply.phones) expect(ph.number.replace(/\D/g, "").length, `${id} ${ph.number}`).toBeGreaterThanOrEqual(10);
    }
    for (const s of [...BENEFITS_SOURCES, ...PUBLIC_CHARGE.sources]) expect(s.url).toMatch(/^https:\/\//);
    for (const t of TIPS) {
      expect(t.text.en.length).toBeGreaterThan(10);
      expect(t.text.es.length).toBeGreaterThan(10);
    }
  });

  test("table dates are real dates and periods run forward", () => {
    for (const [id, t] of Object.entries(TABLES) as [string, IncomeTable][]) {
      expect(dayNumber(t.to), id).not.toBeNull();
      if (t.from) expect(dayNumber(t.from)!, id).toBeLessThan(dayNumber(t.to)!);
      if (t.graceUntil) expect(dayNumber(t.graceUntil)!, id).toBeGreaterThan(dayNumber(t.to)!);
      expect(t.source.url, id).toMatch(/^https:\/\//);
    }
  });

  // These fail on purpose when the yearly figures need updating (see benefits-facts.ts).
  test("no income table is past its period (or re-check date)", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [id, t] of Object.entries(TABLES) as [string, IncomeTable][]) {
      const end = t.graceUntil ?? t.to;
      expect(dayNumber(today)!, `${id}: ${t.toIsRecheck ? "re-check" : "period ended"} ${t.to}; update TABLES.${id} from ${t.source.url}`).toBeLessThanOrEqual(
        dayNumber(end)!,
      );
    }
  });

  test("tax credit figures are for a tax year still being filed", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(dayNumber(today)!, `post the tax year ${TAX.year + 1} CalEITC/YCTC/EITC figures`).toBeLessThanOrEqual(dayNumber(TAX.recheckBy)!);
  });
});
