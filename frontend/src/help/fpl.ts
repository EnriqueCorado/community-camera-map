// Pure income math for the hospital charity-care check (no React/DOM, so it's
// unit-tested directly: e2e/tests/unit-help.spec.ts). Everything runs in the
// visitor's browser; nothing typed into the check leaves the page.

/** HHS poverty guidelines for the 48 contiguous states (California uses these). */
export interface PovertyGuideline {
  year: number;
  /** Yearly amount for a household of one. */
  base: number;
  /** Added for each additional person. */
  perAdditional: number;
}

/** Who a tier of a hospital's policy covers. */
export type Who = "anyone" | "uninsured" | "uninsured-or-high-costs";

/** A hospital's (or the state's) cutoffs, as % of the poverty line. */
export interface CarePolicy {
  free: { maxFpl: number; who: Who } | null;
  discount: { maxFpl: number; who: Who } | null;
}

/** California's floor for every covered hospital: discounts at or below 400%
 *  for uninsured patients and patients with high medical costs; no state
 *  free-care cutoff (HSC §127405(a)(1)(A)). */
export const STATE_FLOOR: CarePolicy = { free: null, discount: { maxFpl: 400, who: "uninsured-or-high-costs" } };

export interface Patient {
  insured: boolean;
  /** Out-of-pocket medical costs over 10% of family income (HSC §127400(g)). */
  highCosts: "yes" | "no" | "unsure";
}

export type CareTier = "free" | "discount" | "over";

export interface CareResult {
  tier: CareTier;
  /** The cutoff (% of poverty) of the tier reached; null for "over". */
  maxFpl: number | null;
  /** True when the tier depends on having high medical costs ("unsure" answer). */
  ifHighCosts: boolean;
  /** Within NEAR points of a cutoff: hospitals may use another year's
   *  guidelines or count income differently, so it's worth applying. */
  nearCutoff: boolean;
}

const NEAR = 10;

/** The best tier a patient may reach. A hospital's policy can be more generous
 *  than the state floor, never less, so both are checked. */
export function careResult(pct: number, policy: CarePolicy, patient: Patient): CareResult {
  const qualifies = (who: Who): "yes" | "maybe" | "no" =>
    who === "anyone" || !patient.insured
      ? "yes"
      : who === "uninsured"
        ? "no"
        : patient.highCosts === "yes"
          ? "yes"
          : patient.highCosts === "unsure"
            ? "maybe"
            : "no";
  const tiers: [CareTier, CarePolicy["free"]][] = [
    ["free", policy.free],
    ["discount", policy.discount],
    ["discount", STATE_FLOOR.discount],
  ];
  const nearCutoff = tiers.some(([, t]) => t != null && Math.abs(pct - t.maxFpl) <= NEAR);
  for (const [tier, t] of tiers) {
    if (!t || pct > t.maxFpl) continue;
    const q = qualifies(t.who);
    if (q !== "no") return { tier, maxFpl: t.maxFpl, ifHighCosts: q === "maybe", nearCutoff };
  }
  return { tier: "over", maxFpl: null, ifHighCosts: false, nearCutoff };
}

export const MAX_HOUSEHOLD = 20;

/** Yearly poverty line for a household (size clamped to 1..MAX_HOUSEHOLD). */
export function povertyLine(g: PovertyGuideline, size: number): number {
  const n = Math.min(MAX_HOUSEHOLD, Math.max(1, Math.floor(size)));
  return g.base + g.perAdditional * (n - 1);
}

/** Household income as a % of the poverty line, unrounded: compare this
 *  against cutoffs (200.4% is over a 200% limit) and round only for display. */
export function percentOfPoverty(income: number, size: number, g: PovertyGuideline): number {
  if (!Number.isFinite(income) || income <= 0) return 0;
  return (income / povertyLine(g, size)) * 100;
}

/** Income → yearly. Monthly figures are what most people know offhand. */
export function yearly(amount: number, per: "year" | "month"): number {
  return per === "month" ? amount * 12 : amount;
}

/** % of poverty for display: whole numbers, but one decimal when rounding
 *  would put it on the wrong side of a cutoff (400.3% must not read "400%"). */
export function displayPct(pct: number, policy: CarePolicy): string {
  const cutoffs = [policy.free, policy.discount, STATE_FLOOR.discount].flatMap((t) => (t ? [t.maxFpl] : []));
  const whole = Math.round(pct);
  return cutoffs.some((c) => pct > c !== whole > c) ? pct.toFixed(1) : String(whole);
}
