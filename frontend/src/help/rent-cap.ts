// Pure rent-increase math for California's rent cap (Civil Code §1947.12,
// the Tenant Protection Act / AB 1482) and the notice rule (Civil Code §827).
// No React/DOM: unit-tested in e2e/tests/unit-help.spec.ts. Figures and their
// sources live in facts.ts.
import { daysBetween } from "./dates";

/** The yearly cap for increases that take effect in [from, to]. */
export interface CapPeriod {
  /** First and last day (ISO) an increase can take effect under this cap. */
  from: string;
  to: string;
  /** CPI change the cap is built from, in percent. */
  cpiPct: number;
  /** The cap itself: 5% + CPI, never more than 10%. */
  maxPct: number;
}

export interface IncreaseInput {
  /** Lowest rent charged in the 12 months before the increase takes effect. */
  lowestRent: number;
  /** Rent after the increase. */
  newRent: number;
  /** Date the new rent starts (ISO). */
  effective: string;
  /** Date the written notice was received (ISO); optional. */
  noticed?: string;
  /** Notice came by mail: §827 notices served by mail get 5 extra days. */
  byMail?: boolean;
}

export interface IncreaseResult {
  /** Increase over the 12-month low, in percent (2 decimals). */
  pct: number;
  /** Cap for this date, or null when we don't have that year's figure. */
  period: CapPeriod | null;
  /** Highest legal rent under the cap (rounded down to the cent). */
  maxRent: number | null;
  /** Dollars per month above the cap (0 when within it). */
  overBy: number;
  /** More than 10% over the 12-month low (exact, before rounding). */
  over10: boolean;
  /** Days of notice the law requires (30 if ≤10% over 12 months, else 90), plus 5 by mail. */
  noticeRequired: number;
  /** Days between the notice and the effective date, if known. */
  noticeGiven: number | null;
}

export function capPeriodFor(effective: string, periods: CapPeriod[]): CapPeriod | null {
  return (
    periods.find((p) => {
      const a = daysBetween(p.from, effective);
      const b = daysBetween(effective, p.to);
      return a != null && b != null && a >= 0 && b >= 0;
    }) ?? null
  );
}

export function checkIncrease(input: IncreaseInput, periods: CapPeriod[]): IncreaseResult {
  const { lowestRent, newRent, effective, noticed, byMail } = input;
  // Whole cents and tenths of a percent, so float error can't move a cent:
  // $1,200 at 7.7% is exactly $1,292.40.
  const low = Math.round(lowestRent * 100);
  const high = Math.round(newRent * 100);
  const pct = low > 0 ? Math.round(((high - low) / low) * 10_000) / 100 : 0;
  const period = capPeriodFor(effective, periods);
  // Round the ceiling down so we never call a rent legal that's a cent over.
  const maxCents = period ? Math.floor((low * Math.round((100 + period.maxPct) * 10)) / 1000) : null;
  const maxRent = maxCents != null ? maxCents / 100 : null;
  const overBy = maxCents != null ? Math.max(0, high - maxCents) / 100 : 0;
  // §827: more than 10% (exactly, not after rounding) needs 90 days.
  const over10 = high * 10 > low * 11;
  const noticeRequired = (over10 ? 90 : 30) + (byMail ? 5 : 0);
  const noticeGiven = noticed ? daysBetween(noticed, effective) : null;
  return { pct, period, maxRent, overBy, over10, noticeRequired, noticeGiven };
}

// ---------------------------------------------------------------- coverage

export type HomeType = "apartment" | "house" | "duplex" | "mobile-rented";
export type YesNo = "yes" | "no" | "unsure";

export interface CoverageAnswers {
  type: HomeType | null;
  /** Certificate of occupancy in the last 15 years (from the lookup or the person). */
  newBuilt: YesNo | null;
  /** Income-restricted affordable housing. */
  affordable: YesNo | null;
  /** House/condo: the lease (or a written notice) says it's exempt from §1947.12. */
  exemptNotice: YesNo | null;
  /** House/condo: owned by a corporation, REIT or LLC. */
  corporateOwner: YesNo | null;
  /** Duplex: the owner lived in the other unit at move-in and still does. */
  ownerInDuplex: YesNo | null;
}

/** Which §1947.12(d) exemptions might apply (ids match RENT_FACTS.exemptions). */
export type ExemptionId = "new" | "house" | "duplex" | "affordable";

export interface Coverage {
  status: "covered" | "exempt" | "maybe";
  /** Exemptions that apply (status "exempt") or might (status "maybe"). */
  reasons: ExemptionId[];
}

/** Screening only — the person's answers, not a ruling. Any exemption that
 *  clearly applies wins; otherwise an "unsure" leaves it open. */
export function coverage(a: CoverageAnswers): Coverage {
  const yes: ExemptionId[] = [];
  const maybe: ExemptionId[] = [];
  const add = (id: ExemptionId, v: YesNo | null) => (v === "yes" ? yes.push(id) : v === "unsure" ? maybe.push(id) : 0);

  // The 15-year exemption never applies to mobile homes (§1947.12(d)(4)).
  if (a.type !== "mobile-rented") add("new", a.newBuilt);
  add("affordable", a.affordable);
  if (a.type === "house" || a.type === "mobile-rented") {
    // Exempt only with the written notice AND a non-corporate owner (§1947.12(d)(5)).
    if (a.exemptNotice === "yes" && a.corporateOwner === "no") yes.push("house");
    else if (a.exemptNotice !== "no" && a.corporateOwner !== "yes" && (a.exemptNotice === "unsure" || a.corporateOwner === "unsure"))
      maybe.push("house");
  }
  if (a.type === "duplex") add("duplex", a.ownerInDuplex);

  if (yes.length) return { status: "exempt", reasons: yes };
  if (maybe.length) return { status: "maybe", reasons: maybe };
  return { status: "covered", reasons: [] };
}
