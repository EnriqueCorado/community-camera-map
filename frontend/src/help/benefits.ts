// Pure logic for the Benefits screener ("money you may be missing"). No
// React/DOM, so it's unit-tested directly (e2e/tests/unit-benefits.spec.ts).
// It runs in the visitor's browser; nothing typed into it leaves the page.
//
// Money is integer cents. Each program's limit is compared in the basis the
// program publishes, or in the visitor's basis when the program prints both,
// by scaling UP to yearly (×12) rather than dividing: dividing a yearly income
// by 12 would round and could put someone on the wrong side of a limit.
// Limits are never rounded.
import { TABLES, TAX, type IncomeTable, type Per, type ProgramId, type TableId } from "./benefits-facts";
import { MAX_HOUSEHOLD } from "./fpl";
import { dayNumber } from "./dates";

export type Verdict = "likely" | "maybe" | "unlikely";
export type YesNo = "yes" | "no";
/** Programs someone in the home already gets (they open doors to others). */
export type Enrolled = "medi-cal" | "calfresh" | "wic" | "calworks" | "ssi";
export type Youngest = "under5" | "five" | "6to18";
export type Electric = "mid" | "tid" | "pge" | "unsure";
export type TaxId = "ssn" | "itin" | "none" | "unsure";

export interface Answers {
  size: number;
  /** Gross income before taxes, integer cents, in `per`. */
  income: number;
  per: Per;
  /** Children under 19 living in the home. */
  children?: number;
  /** Youngest child's age band (asked only when children > 0). */
  youngest?: Youngest;
  pregnant?: YesNo;
  /** Anyone 60+ or with a disability. */
  olderOrDisabled?: YesNo;
  gets?: Enrolled[];
  /** Who sends the electric bill. */
  electric?: Electric;
  /** PG&E gas bill (asked when electricity is not from PG&E). */
  pgeGas?: YesNo | "unsure";
  /** Number the tax filers use. */
  taxId?: TaxId;
}

export type Cmp = "below" | "at" | "over";

/** One income-vs-limit comparison, with everything needed to explain it. */
export interface IncomeCheck {
  table: TableId;
  cmp: Cmp;
  size: number;
  /** Basis the comparison was made in. */
  per: Per;
  /** Income and limit in `per`, cents. */
  income: number;
  limit: number;
  /** The visitor's figure as typed. */
  typed: { cents: number; per: Per };
  /** The program's own printed figure (may be in the other basis). */
  published: { cents: number; per: Per };
}

export type Reason =
  | { kind: "income"; check: IncomeCheck }
  /** FERA: above the CARE limit and at or below FERA's. */
  | { kind: "between"; low: IncomeCheck; high: IncomeCheck }
  /** Meets the income test through a program someone already gets. */
  | { kind: "gets"; programs: Enrolled[]; confirm?: boolean }
  | { kind: "already" }
  | { kind: "olderOrDisabled" }
  /** Medi-Cal: 65+ or disabled people have other (non-MAGI) programs. */
  | { kind: "mediCalOlder" }
  | { kind: "statusDepends" }
  | { kind: "wicNoOne" }
  | { kind: "wicViaMediCal" }
  | { kind: "mcap"; check: IncomeCheck }
  | { kind: "utilityUnsure"; company: "mid" | "tid" | "pge" }
  | { kind: "pgeGasUnsure" }
  | { kind: "oldTable"; table: TableId }
  | { kind: "taxNeedsId" }
  | { kind: "taxIdUnsure" }
  | { kind: "eitcSsnUnsure" }
  | { kind: "oldTax" }
  /** WIC counts an unborn baby: within the limit for one more person. */
  | { kind: "unbornCounts"; check: IncomeCheck }
  /** Medi-Cal counts the expected baby: household size includes it. */
  | { kind: "babyCounted"; size: number }
  | { kind: "eitcNeedsSsn" }
  | { kind: "earnedZero" }
  | { kind: "earnedAssumption" }
  | {
      kind: "taxIncome";
      cmp: Cmp;
      income: number;
      limit: number;
      /** Federal EITC: number of children (3 = 3 or more) and filing status. */
      children?: number;
      filing?: "single" | "joint";
      /** The limit itself doesn't qualify (IRS: income must be under it). */
      strict?: boolean;
    }
  | { kind: "eitcJoint"; limit: number }
  | { kind: "yctcWages"; limit: number }
  | { kind: "yctcNoEarned" }
  | { kind: "noYoungChild" }
  | { kind: "childFive" }
  | { kind: "mediCalInstead" };

export interface ProgramResult {
  id: ProgramId;
  verdict: Verdict;
  reasons: Reason[];
  /** Table whose limit decided the answer (for the "limits in effect" line). */
  table?: TableId;
  /** Largest amount it can give ("up to"), cents. */
  upTo?: { cents: number; per: Per | "return" };
}

export interface Screen {
  results: ProgramResult[];
  /** Programs that need more answers before they can be checked. */
  pending: ProgramId[];
}

/** Dollars as printed by a source (at most 2 decimals) -> exact cents. */
export const cents = (dollars: number): number => Math.round(dollars * 100);

const clampSize = (n: number) => Math.min(MAX_HOUSEHOLD, Math.max(1, Math.floor(n)));

/** A table's limit for a household, in cents and in the table's own basis.
 *  Sizes past the last printed one add the source's per-person amount. */
export function limitFor(t: Pick<IncomeTable, "bySize" | "perExtra">, size: number): number {
  const n = clampSize(size);
  const last = t.bySize.length;
  if (n <= last) return cents(t.bySize[n - 1]!);
  return cents(t.bySize[last - 1]!) + (n - last) * cents(t.perExtra);
}

const cmpOf = (income: number, limit: number): Cmp => (income < limit ? "below" : income === limit ? "at" : "over");
export const within = (c: Cmp) => c !== "over";

/** Compare the visitor's income with one table. */
export function check(id: TableId, a: Pick<Answers, "size" | "income" | "per">): IncomeCheck {
  const t: IncomeTable = TABLES[id];
  const size = clampSize(a.size);
  const typed = { cents: a.income, per: a.per };
  const published = { cents: limitFor(t, size), per: t.per };
  let per: Per;
  let income: number;
  let limit: number;
  if (t.per === a.per) {
    [per, income, limit] = [a.per, a.income, published.cents];
  } else if (t.alt && t.alt.per === a.per) {
    [per, income, limit] = [a.per, a.income, limitFor(t.alt, size)];
  } else if (t.per === "year") {
    // Typed monthly, yearly-only table: a month's pay × 12 is exact.
    [per, income, limit] = ["year", a.income * 12, published.cents];
  } else {
    // Typed yearly, monthly-only table: scale the limit up, never divide income.
    [per, income, limit] = ["year", a.income, published.cents * 12];
  }
  return { table: id, cmp: cmpOf(income, limit), size, per, income, limit, typed, published };
}

/** True once a table's period (or re-check date) is over and it's kept only
 *  because no newer table was published. */
export function isOld(id: TableId, today: string): boolean {
  const t: IncomeTable = TABLES[id];
  const d = dayNumber(today);
  const end = dayNumber(t.to);
  return d != null && end != null && d > end;
}

const yearlyCents = (a: Answers) => (a.per === "year" ? a.income : a.income * 12);
const anyOf = (gets: Enrolled[], list: Enrolled[]) => gets.filter((g) => list.includes(g));

/** Programs that open the door to each other program's income test. */
export const OPENS: Partial<Record<ProgramId, Enrolled[]>> = {
  wic: ["medi-cal", "calfresh", "calworks"],
  "pge-care": ["medi-cal", "wic", "calfresh", "calworks", "ssi"],
  lifeline: ["medi-cal", "calfresh", "wic", "calworks", "ssi"],
  liheap: ["calfresh", "calworks"],
};

function incomeResult(id: ProgramId, c: IncomeCheck, extra: Reason[] = []): ProgramResult {
  return { id, verdict: within(c.cmp) ? "likely" : "unlikely", reasons: [{ kind: "income", check: c }, ...extra], table: c.table };
}

/** Passes the income test through a program someone gets, else by income. */
function viaGetsOrIncome(id: ProgramId, table: TableId, a: Answers, confirm = false): ProgramResult {
  const via = anyOf(a.gets ?? [], OPENS[id] ?? []);
  if (via.length) return { id, verdict: "likely", reasons: [{ kind: "gets", programs: via, confirm }], table };
  return incomeResult(id, check(table, a));
}

const capMaybe = (r: ProgramResult, why: Reason): ProgramResult => ({
  ...r,
  verdict: r.verdict === "likely" ? "maybe" : r.verdict,
  reasons: [...r.reasons, why],
});

// ------------------------------------------------------------ programs

function calfresh(a: Answers): ProgramResult {
  const c = check("calfresh", a);
  const reasons: Reason[] = [{ kind: "income", check: c }];
  let verdict: Verdict = within(c.cmp) ? "likely" : "unlikely";
  if (!within(c.cmp) && a.olderOrDisabled === "yes") {
    verdict = "maybe";
    reasons.push({ kind: "olderOrDisabled" });
  }
  if (verdict !== "unlikely") reasons.push({ kind: "statusDepends" });
  if (a.gets?.includes("calfresh")) reasons.unshift({ kind: "already" });
  return { id: "calfresh", verdict, reasons, table: "calfresh", upTo: { cents: limitFor(TABLES.calfreshMax, a.size), per: "month" } };
}

function wic(a: Answers): ProgramResult {
  const hasCategory = a.pregnant === "yes" || ((a.children ?? 0) > 0 && a.youngest === "under5");
  if (!hasCategory) return { id: "wic", verdict: "unlikely", reasons: [{ kind: "wicNoOne" }], table: "wic" };
  const r = viaGetsOrIncome("wic", "wic", a, true);
  if (a.gets?.includes("wic")) r.reasons.unshift({ kind: "already" });
  if (r.verdict === "unlikely") {
    // On Medi-Cal, WIC counts that instead of income; kids and pregnancy
    // Medi-Cal reach higher incomes than WIC does.
    const kidsMediCal = (a.children ?? 0) > 0 && within(check("mediCalKids", a).cmp);
    const pregMediCal = a.pregnant === "yes" && within(check("mediCalPregnant", a).cmp);
    if (kidsMediCal || pregMediCal) return { ...r, verdict: "maybe", reasons: [...r.reasons, { kind: "wicViaMediCal" }] };
    // WIC may count the unborn baby (ask WIC), which raises the limit.
    const plusOne = check("wic", { ...a, size: a.size + 1 });
    if (a.pregnant === "yes" && within(plusOne.cmp)) return { ...r, verdict: "maybe", reasons: [...r.reasons, { kind: "unbornCounts", check: plusOne }] };
  }
  return r;
}

function mediCalKids(a: Answers): ProgramResult {
  const r = incomeResult("medi-cal-kids", check("mediCalKids", a));
  if (a.gets?.includes("medi-cal")) r.reasons.unshift({ kind: "already" });
  return r;
}

function mediCalPregnant(a: Answers): ProgramResult {
  // Medi-Cal counts a pregnant person's expected baby in the household
  // (42 CFR §435.603(b)); one baby assumed — twins only raise the limit.
  const withBaby = { ...a, size: a.size + 1 };
  const baby: Reason = { kind: "babyCounted", size: withBaby.size };
  const c = check("mediCalPregnant", withBaby);
  const m = check("mcap", withBaby);
  const r: ProgramResult = within(c.cmp) || !within(m.cmp)
    ? incomeResult("medi-cal-pregnant", c)
    : { id: "medi-cal-pregnant", verdict: "maybe", reasons: [{ kind: "income", check: c }, { kind: "mcap", check: m }], table: "mcap" };
  return { ...r, reasons: [baby, ...r.reasons] };
}

function mediCalAdults(a: Answers): ProgramResult {
  const c = check("mediCalAdults", a);
  const r = incomeResult("medi-cal-adults", c);
  if (!within(c.cmp) && a.olderOrDisabled === "yes") {
    r.verdict = "maybe";
    r.reasons.push({ kind: "mediCalOlder" });
  }
  if (r.verdict !== "unlikely") r.reasons.push({ kind: "statusDepends" });
  if (a.gets?.includes("medi-cal")) r.reasons.unshift({ kind: "already" });
  return r;
}

function coveredCa(a: Answers): ProgramResult {
  const mc = check("mediCalAdults", a);
  if (within(mc.cmp)) return { id: "covered-ca", verdict: "unlikely", reasons: [{ kind: "mediCalInstead" }], table: "mediCalAdults" };
  const r = incomeResult("covered-ca", check("coveredCa", a));
  if (r.verdict === "likely") r.reasons.push({ kind: "statusDepends" });
  return r;
}

/** Which electric discounts to show for the visitor's utility answers. */
function utilities(a: Answers): ProgramResult[] {
  const out: ProgramResult[] = [];
  const e = a.electric!;
  const unsure = (r: ProgramResult, company: "mid" | "tid" | "pge") => (e === "unsure" ? capMaybe(r, { kind: "utilityUnsure", company }) : r);

  const careApplies = e === "pge" || e === "unsure" || a.pgeGas === "yes" || a.pgeGas === "unsure";
  const care = viaGetsOrIncome("pge-care", "care", a);
  if (careApplies) {
    let r = unsure(care, "pge");
    if (e !== "pge" && e !== "unsure" && a.pgeGas === "unsure") r = capMaybe(r, { kind: "pgeGasUnsure" });
    out.push(r);
  }
  // FERA is only for PG&E electric customers whose income is too high for
  // CARE (which gives more); it's left out when CARE fits.
  if ((e === "pge" || e === "unsure") && care.verdict !== "likely") {
    const low = check("care", a);
    const high = check("fera", a);
    const r: ProgramResult = within(high.cmp)
      ? { id: "pge-fera", verdict: "likely", reasons: [{ kind: "between", low, high }], table: "fera" }
      : incomeResult("pge-fera", high);
    if (e === "pge" || r.verdict === "likely") out.push(unsure(r, "pge"));
  }
  if (e === "mid" || e === "unsure") out.push(unsure(incomeResult("mid-cares", check("mid", a)), "mid"));
  if (e === "tid" || e === "unsure") out.push(unsure(incomeResult("tid-cares", check("tid", a)), "tid"));
  return out;
}

function liheap(a: Answers): ProgramResult {
  const r = viaGetsOrIncome("liheap", "liheap", a);
  if (r.verdict === "likely") r.reasons.push({ kind: "statusDepends" });
  return r;
}

function lifeline(a: Answers): ProgramResult {
  return viaGetsOrIncome("lifeline", "lifeline", a);
}

const kidsIndex = (n: number) => Math.min(3, Math.max(0, Math.floor(n)));

function caleitc(a: Answers): ProgramResult {
  const kids = kidsIndex(a.children ?? 0);
  const upTo = { cents: cents(TAX.caleitc.maxCredit[kids]!), per: "return" as const };
  if (a.taxId === "none") return { id: "caleitc", verdict: "unlikely", reasons: [{ kind: "taxNeedsId" }], upTo };
  if (a.income === 0) return { id: "caleitc", verdict: "unlikely", reasons: [{ kind: "earnedZero" }], upTo };
  const income = yearlyCents(a);
  const limit = cents(TAX.caleitc.maxEarned);
  const cmp = cmpOf(income, limit);
  const r: ProgramResult = {
    id: "caleitc",
    verdict: within(cmp) ? "likely" : "unlikely",
    reasons: [{ kind: "taxIncome", cmp, income, limit }, { kind: "earnedAssumption" }],
    upTo,
  };
  return a.taxId === "unsure" ? capMaybe(r, { kind: "taxIdUnsure" }) : r;
}

function yctc(a: Answers): ProgramResult {
  const upTo = { cents: cents(TAX.yctc.maxCredit), per: "return" as const };
  if (a.taxId === "none") return { id: "yctc", verdict: "unlikely", reasons: [{ kind: "taxNeedsId" }], upTo };
  if (!a.children || a.youngest === "6to18") return { id: "yctc", verdict: "unlikely", reasons: [{ kind: "noYoungChild" }], upTo };
  const income = yearlyCents(a);
  const eitcLimit = cents(TAX.caleitc.maxEarned);
  const wageLimit = cents(TAX.yctc.maxWages);
  let r: ProgramResult;
  if (income === 0) {
    r = { id: "yctc", verdict: "likely", reasons: [{ kind: "yctcNoEarned" }], upTo };
  } else if (income <= eitcLimit) {
    r = { id: "yctc", verdict: "likely", reasons: [{ kind: "taxIncome", cmp: cmpOf(income, eitcLimit), income, limit: eitcLimit }, { kind: "earnedAssumption" }], upTo };
  } else if (income <= wageLimit) {
    r = { id: "yctc", verdict: "maybe", reasons: [{ kind: "taxIncome", cmp: "over", income, limit: eitcLimit }, { kind: "yctcWages", limit: wageLimit }], upTo };
  } else {
    r = { id: "yctc", verdict: "unlikely", reasons: [{ kind: "taxIncome", cmp: "over", income, limit: wageLimit }], upTo };
  }
  if (a.youngest === "five") r = capMaybe(r, { kind: "childFive" });
  return a.taxId === "unsure" ? capMaybe(r, { kind: "taxIdUnsure" }) : r;
}

function federalEitc(a: Answers): ProgramResult {
  const kids = kidsIndex(a.children ?? 0);
  const upTo = { cents: cents(TAX.federal.maxCredit[kids]!), per: "return" as const };
  if (a.taxId === "itin" || a.taxId === "none") return { id: "federal-eitc", verdict: "unlikely", reasons: [{ kind: "eitcNeedsSsn" }], upTo };
  if (a.income === 0) return { id: "federal-eitc", verdict: "unlikely", reasons: [{ kind: "earnedZero" }], upTo };
  const income = yearlyCents(a);
  const single = cents(TAX.federal.single[kids]!);
  const joint = cents(TAX.federal.joint[kids]!);
  // IRS: earned income and AGI must be LESS than the limit.
  const base = { kind: "taxIncome" as const, income, children: kids, strict: true };
  let r: ProgramResult;
  if (income < single) {
    r = { id: "federal-eitc", verdict: "likely", reasons: [{ ...base, cmp: "below", limit: single, filing: "single" }, { kind: "earnedAssumption" }], upTo };
  } else if (income < joint) {
    r = { id: "federal-eitc", verdict: "maybe", reasons: [{ ...base, cmp: cmpOf(income, single), limit: single, filing: "single" }, { kind: "eitcJoint", limit: joint }], upTo };
  } else {
    r = { id: "federal-eitc", verdict: "unlikely", reasons: [{ ...base, cmp: cmpOf(income, joint), limit: joint, filing: "joint" }], upTo };
  }
  return a.taxId === "unsure" ? capMaybe(r, { kind: "eitcSsnUnsure" }) : r;
}

// ------------------------------------------------------------ screener

/** Every program, in display order, with the answers it needs. */
const ORDER: { id: ProgramId; needs: (a: Answers) => boolean }[] = [
  { id: "calfresh", needs: (a) => a.olderOrDisabled != null },
  { id: "wic", needs: (a) => a.pregnant != null && childrenDone(a) },
  { id: "medi-cal-kids", needs: (a) => a.children != null },
  { id: "medi-cal-pregnant", needs: (a) => a.pregnant != null },
  { id: "medi-cal-adults", needs: (a) => a.olderOrDisabled != null },
  { id: "covered-ca", needs: () => true },
  { id: "pge-care", needs: (a) => a.electric != null && (a.electric === "pge" || a.electric === "unsure" || a.pgeGas != null) },
  { id: "liheap", needs: () => true },
  { id: "lifeline", needs: () => true },
  { id: "caleitc", needs: (a) => a.taxId != null && a.children != null },
  { id: "yctc", needs: (a) => a.taxId != null && childrenDone(a) },
  { id: "federal-eitc", needs: (a) => a.taxId != null && a.children != null },
];

function childrenDone(a: Answers): boolean {
  return a.children != null && (a.children === 0 || a.youngest != null);
}

/** Screen a household. `today` (ISO) decides whether a table is out of date. */
export function screen(a: Answers, today: string): Screen {
  const results: ProgramResult[] = [];
  const pending: ProgramId[] = [];
  for (const { id, needs } of ORDER) {
    if (!needs(a)) {
      pending.push(id);
      continue;
    }
    switch (id) {
      case "calfresh":
        results.push(calfresh(a));
        break;
      case "wic":
        results.push(wic(a));
        break;
      case "medi-cal-kids":
        if ((a.children ?? 0) > 0) results.push(mediCalKids(a));
        break;
      case "medi-cal-pregnant":
        if (a.pregnant === "yes") results.push(mediCalPregnant(a));
        break;
      case "medi-cal-adults":
        results.push(mediCalAdults(a));
        break;
      case "covered-ca":
        results.push(coveredCa(a));
        break;
      case "pge-care":
        // All electric/gas discounts are worked out together (CARE, FERA, MID, TID).
        results.push(...utilities(a));
        break;
      case "liheap":
        results.push(liheap(a));
        break;
      case "lifeline":
        results.push(lifeline(a));
        break;
      case "caleitc":
        results.push(caleitc(a));
        break;
      case "yctc":
        results.push(yctc(a));
        break;
      case "federal-eitc":
        results.push(federalEitc(a));
        break;
    }
  }
  const final = results.map((r) => {
    // Someone already enrolled should check at renewal, not give up.
    if (r.verdict === "unlikely" && r.reasons.some((x) => x.kind === "already")) r = { ...r, verdict: "maybe" };
    // A table whose period has ended (kept only because nothing newer was
    // published) can't support a "likely", unless no limit was used.
    const byIncome = r.reasons[0]?.kind !== "gets";
    if (r.table && byIncome && isOld(r.table, today)) r = capMaybe(r, { kind: "oldTable", table: r.table });
    if (TAX_IDS.has(r.id) && isTaxOld(today)) r = capMaybe(r, { kind: "oldTax" });
    return r;
  });
  return { results: final, pending };
}

const TAX_IDS = new Set<ProgramId>(["caleitc", "yctc", "federal-eitc"]);

/** True once the next tax year's figures should be out (TAX.recheckBy). */
export function isTaxOld(today: string): boolean {
  const d = dayNumber(today);
  const end = dayNumber(TAX.recheckBy);
  return d != null && end != null && d > end;
}

/** Results grouped for display. */
export function byVerdict(results: ProgramResult[]): Record<Verdict, ProgramResult[]> {
  return {
    likely: results.filter((r) => r.verdict === "likely"),
    maybe: results.filter((r) => r.verdict === "maybe"),
    unlikely: results.filter((r) => r.verdict === "unlikely"),
  };
}

/** Typed dollars -> cents, or null (uses the same rules as parseMoney). */
export function toCents(n: number | null): number | null {
  return n == null || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100);
}
