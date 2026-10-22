// Unpaid-wage math (pure; unit-tested in e2e/tests/unit-wages.spec.ts).
//
// Units, so nothing is ever rounded until it is shown:
//  - time in whole MINUTES (typed decimals are floored to the minute),
//  - money in whole CENTS,
//  - pay before display in "pay units" of 1/120 of a cent: an hourly rate in
//    cents x minutes x (2 x the multiplier) is always a whole number, so
//    1x, 1.5x and 2x pay are exact. Each line is floored to the cent once,
//    which can only ever under-state what is owed, never over-state it.
// The legal thresholds themselves (8/40/12, 9/45, 30 days, minimum wage)
// live in wages-facts.ts with their citations; these functions take them as
// arguments.

/** Overtime thresholds for one rule set, in minutes. `null` = no such rule. */
export interface RuleSet {
  /** 1.5x after this many minutes in a workday. */
  dailyOt: number | null;
  /** 1.5x for "regular" minutes beyond this in the workweek. */
  weeklyOt: number | null;
  /** 2x after this many minutes in a workday. */
  dailyDt: number | null;
  /** On the 7th day of work in a workweek: 1.5x for the first `seventhDayDt`
   *  minutes and 2x after. `null` = no 7th-day rule. */
  seventhDayDt: number | null;
}

/** Every hour at 1x: used when we can't verify the overtime rules (so the
 *  result can only be too low, never too high). */
export const STRAIGHT_TIME: RuleSet = { dailyOt: null, weeklyOt: null, dailyDt: null, seventhDayDt: null };

export interface Split {
  reg: number;
  ot: number;
  dt: number;
}

const add = (a: Split, b: Split): Split => ({ reg: a.reg + b.reg, ot: a.ot + b.ot, dt: a.dt + b.dt });
const ZERO: Split = { reg: 0, ot: 0, dt: 0 };

/** One workday's minutes split into 1x / 1.5x / 2x by the daily rules. */
export function splitDay(minutes: number, r: RuleSet, seventh: boolean): Split {
  const m = Math.max(0, minutes);
  if (seventh && r.seventhDayDt != null) {
    // Lab. Code §510(a): no straight time on the 7th day of the workweek.
    const ot = Math.min(m, r.seventhDayDt);
    return { reg: 0, ot, dt: m - ot };
  }
  const dt = r.dailyDt != null ? Math.max(0, m - r.dailyDt) : 0;
  const reg = r.dailyOt != null ? Math.min(m, r.dailyOt) : m - dt;
  return { reg, ot: m - reg - dt, dt };
}

/**
 * A workweek (days in the employer's workweek order, minutes each) split
 * into 1x / 1.5x / 2x. Daily overtime first; then any straight-time minutes
 * past the weekly limit become 1.5x. Minutes already paid as daily overtime
 * don't count toward the weekly limit, so nothing is paid twice.
 */
export function splitWeek(days: readonly number[], r: RuleSet): Split {
  const worked = days.slice(0, 7);
  // The 7th-day rule needs work on all seven days of the workweek.
  const allSeven = worked.length === 7 && worked.every((d) => d > 0);
  let s = worked.reduce<Split>((acc, d, i) => add(acc, splitDay(d, r, allSeven && i === 6)), ZERO);
  if (r.weeklyOt != null && s.reg > r.weeklyOt) {
    const extra = s.reg - r.weeklyOt;
    s = { reg: r.weeklyOt, ot: s.ot + extra, dt: s.dt };
  }
  return s;
}

/** All weeks together. */
export function splitWeeks(weeks: readonly (readonly number[])[], r: RuleSet): Split {
  return weeks.reduce<Split>((acc, w) => add(acc, splitWeek(w, r)), ZERO);
}

/** Pay units (1/120 cent) for `minutes` at `rateCents`/hour times `halves`/2. */
export const payUnits = (rateCents: number, minutes: number, halves: 2 | 3 | 4) => rateCents * minutes * halves;

/** Pay units -> whole cents, rounded DOWN (never overstate). */
export const unitsToCents = (u: number) => Math.floor(u / 120);

export interface WageInput {
  weeks: readonly (readonly number[])[];
  /** Agreed hourly rate in cents, or null if not paid by the hour. */
  rateCents: number | null;
  /** The minimum wage for when the work was done, or null if unknown. */
  minWageCents: number | null;
  /** Gross pay actually received for these weeks, in cents. */
  paidCents: number;
  rules: RuleSet;
}

export interface WageResult {
  hours: Split;
  /** Rate the hours are valued at (agreed rate, or the minimum wage when no
   *  hourly rate was given). */
  rateCents: number;
  regularCents: number;
  overtimeCents: number;
  doubleCents: number;
  /** Extra owed because the rate was below the minimum wage (at 1x, 1.5x and 2x). */
  minWageGapCents: number;
  earnedCents: number;
  paidCents: number;
  /** earned - paid, never below 0. */
  unpaidCents: number;
}

/** What these hours should have paid, minus what was paid. Null when there's
 *  no rate to value the hours at. */
export function wagesOwed(i: WageInput): WageResult | null {
  const rate = i.rateCents ?? i.minWageCents;
  if (rate == null || rate <= 0) return null;
  const h = splitWeeks(i.weeks, i.rules);
  const regularCents = unitsToCents(payUnits(rate, h.reg, 2));
  const overtimeCents = unitsToCents(payUnits(rate, h.ot, 3));
  const doubleCents = unitsToCents(payUnits(rate, h.dt, 4));
  const gap = i.minWageCents != null ? Math.max(0, i.minWageCents - rate) : 0;
  const minWageGapCents = gap ? unitsToCents(payUnits(gap, h.reg, 2) + payUnits(gap, h.ot, 3) + payUnits(gap, h.dt, 4)) : 0;
  const earnedCents = regularCents + overtimeCents + doubleCents + minWageGapCents;
  const paidCents = Math.max(0, i.paidCents);
  return {
    hours: h,
    rateCents: rate,
    regularCents,
    overtimeCents,
    doubleCents,
    minWageGapCents,
    earnedCents,
    paidCents,
    unpaidCents: Math.max(0, earnedCents - paidCents),
  };
}

/** True when the rate is below the minimum wage (both in cents). */
export const belowMinimum = (rateCents: number, minWageCents: number) => rateCents < minWageCents;

/**
 * Meal/rest premiums (Lab. Code §226.7(c)): one extra hour at the regular
 * rate for each workday a meal break was missed, and one for each workday a
 * rest break was missed. The person enters DAYS, not breaks: two missed rest
 * breaks on one day are still one premium.
 */
export function breakPremiums(mealDays: number, restDays: number, rateCents: number): { mealCents: number; restCents: number } {
  const days = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  return { mealCents: days(mealDays) * rateCents, restCents: days(restDays) * rateCents };
}

// ------------------------------------------------------------ final pay

/** How the job ended (Lab. Code §201, §202). */
export type Ending = "fired" | "quitNotice" | "quitNoNotice" | "seasonal";

/** Days after the last day that final pay may wait: 0 = due that day.
 *  Fired or laid off: immediately (§201(a)). Quit with 72+ hours' notice:
 *  the last day (§202(a)). Quit without notice: within 72 hours (§202(a)).
 *  Group layoff at the end of seasonal curing/canning/drying work: within a
 *  reasonable time, at most 72 hours (§201(a)). */
export function graceDays(e: Ending): number {
  return e === "quitNoNotice" || e === "seasonal" ? 3 : 0;
}

/** Whole days final pay was late: from the due date to the day it was paid
 *  (or to today if it still hasn't been). Never negative. */
export function daysLate(lastDay: number, ending: Ending, paidOrToday: number): number {
  return Math.max(0, paidOrToday - (lastDay + graceDays(ending)));
}

/** A day's wages at the regular rate: rate x usual daily minutes, to the cent (down). */
export const dailyWageCents = (rateCents: number, minutesPerDay: number) => unitsToCents(payUnits(rateCents, Math.max(0, minutesPerDay), 2));

/** Waiting-time penalty (§203(a)): a day's wages per day late, capped. */
export function waitingPenalty(dailyCents: number, late: number, maxDays: number): { days: number; cents: number } {
  const days = Math.max(0, Math.min(Math.floor(late), maxDays));
  return { days, cents: days * Math.max(0, dailyCents) };
}

// ------------------------------------------------------------ parsing

/**
 * Typed hours for one day -> minutes. Accepts "8", "8.5", "8,5" (Spanish
 * decimal comma), "7.75" and "8:30". Blank = 0. Decimals are floored to the
 * minute. More than 24 hours, negatives or anything else -> null.
 */
export function parseHours(s: string): number | null {
  const t = s.trim();
  if (t === "") return 0;
  let m: RegExpExecArray | null;
  let minutes: number;
  if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(t))) {
    minutes = Number(m[1]) * 60 + Number(m[2]);
  } else if ((m = /^(\d{0,2})(?:[.,](\d{1,2}))?$/.exec(t)) && (m[1] !== "" || m[2] != null)) {
    const frac = m[2] ? Number(m[2].padEnd(2, "0")) : 0; // hundredths of an hour
    minutes = Number(m[1] || "0") * 60 + Math.floor((frac * 60) / 100);
  } else {
    return null;
  }
  return minutes <= 24 * 60 ? minutes : null;
}

/** A count of days (0-999). Blank = 0; anything else -> null. */
export function parseCount(s: string): number | null {
  const t = s.trim();
  if (t === "") return 0;
  return /^\d{1,3}$/.test(t) ? Number(t) : null;
}

/** Dollars (already validated by parseMoney) -> whole cents. */
export const toCents = (dollars: number) => Math.round(dollars * 100);

/** Minutes -> hours for display (e.g. 510 -> 8.5). */
export const minutesToHours = (m: number) => m / 60;

// ------------------------------------------------------------ which rules

/** Kind of job, as the person describes it. */
export type Job = "general" | "farm" | "attendant" | "household" | "livein";
export type FarmSize = "large" | "small" | "unsure";
/** When the work was done: a calendar year, the FIRST year of a span of
 *  years (rules count only if they applied for the whole span), or
 *  "earlier" (before any year we have rules for). */
export type WorkYear = number | "earlier";

export interface RuleEntry {
  rules: RuleSet;
  cite: string;
  /** First year these rules applied (farm phase-in), if it matters. */
  fromYear?: number;
}

export interface RuleTable {
  general: RuleEntry;
  /** All farms, once size no longer matters (from `farm.fromYear`). */
  farm: RuleEntry;
  farmLarge: RuleEntry;
  farmSmall: RuleEntry;
  attendant: RuleEntry;
  household: RuleEntry;
}

export interface PickedRules {
  rules: RuleSet;
  cite: string;
  /** False when we can't confirm the overtime rules for this job and year:
   *  every hour is then counted at 1x, which can only under-count. */
  known: boolean;
}

/**
 * The overtime rules for a job and year. Farm rules depend on size only for
 * work before the small-farm phase-in finished; "not sure" is treated as
 * small, and farm work from "earlier" years (still phasing in) counts
 * straight time, so the result is never too high.
 */
export function rulesFor(job: Job, size: FarmSize | null, year: WorkYear, t: RuleTable): PickedRules {
  if (job === "livein") return { rules: STRAIGHT_TIME, cite: "IWC Wage Order 15 §3(A)-(B)", known: false };
  if (job !== "farm") return { rules: t[job].rules, cite: t[job].cite, known: true };
  if (year !== "earlier" && year >= (t.farm.fromYear ?? 0)) return { rules: t.farm.rules, cite: t.farm.cite, known: true };
  const e = size === "large" ? t.farmLarge : t.farmSmall;
  const known = year !== "earlier" && year >= (e.fromYear ?? 0);
  return known ? { rules: e.rules, cite: e.cite, known } : { rules: STRAIGHT_TIME, cite: e.cite, known };
}

/** Minimum wage in cents for a year, or null if we don't have it. For a span
 *  of years this is its first year's rate (the minimum only goes up, so it
 *  can only under-count). */
export function minWageFor(year: WorkYear, table: readonly { year: number; cents: number }[]): number | null {
  if (year === "earlier") return null;
  return table.find((m) => m.year === year)?.cents ?? null;
}
