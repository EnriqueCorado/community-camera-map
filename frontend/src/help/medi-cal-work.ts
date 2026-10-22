// "Do Medi-Cal's 2027 work rules apply to me, and do I meet them?" Pure
// logic (no React, no storage); rules and citations in medi-cal-work-facts.ts.
// Amounts are integer cents. This is an estimate: the county decides.
import { MCW } from "./medi-cal-work-facts";

export type Coverage = "full" | "applying" | "restricted" | "unsure";
export type AgeBand = "under19" | "19to64" | "65plus";

/** Answers that mean the rule doesn't apply at all. */
export type NotCoveredId = "restricted" | "under19" | "65plus" | "medicare" | "ssi" | "otherGroup";

/** Groups the law excludes. "frail" depends on how much the condition limits you. */
export type ExemptId =
  | "medicare"
  | "ssi"
  | "otherGroup"
  | "pregnant"
  | "child13"
  | "caregiver"
  | "frail"
  | "treatment"
  | "native"
  | "foster"
  | "veteran"
  | "calfresh"
  | "released";

/** Short-term exceptions that must be asked for. */
export type HardshipId = "hospital" | "travel";

/** School (an educational program), not job training: that counts by the hour. */
export type School = "half" | "less" | "no";

export interface WorkAnswers {
  coverage: Coverage | null;
  age: AgeBand | null;
  exempt: readonly ExemptId[];
  /** "None of these" was chosen: the exemption question is answered. */
  noneApply: boolean;
  hardship: readonly HardshipId[];
  /** Hours in a typical month (null = not answered). */
  workHours: number | null;
  volunteerHours: number | null;
  programHours: number | null;
  school: School | null;
  /** In school less than half-time: units or credits this term... */
  credits: number | null;
  /** ...or, for classes without credits, hours of class a month. */
  classHours: number | null;
  /** Income before taxes in a typical month (pay, unemployment, SDI…), cents. */
  incomeCents: number | null;
  seasonal: boolean;
  /** Average monthly income over the past 6 months, cents (seasonal workers). */
  seasonalAvgCents: number | null;
}

export type MeetsBy = "school" | "income" | "seasonal" | "hours";

/** How the person's month compares with the rule (null: nothing entered yet). */
export type Activity =
  | { kind: "meets"; by: MeetsBy; hours: number }
  | { kind: "short"; hours: number; missingHours: number; missingCents: number | null; hardship: HardshipId[] };

export type WorkOutcome =
  | { kind: "incomplete" }
  | { kind: "not-covered"; reason: NotCoveredId }
  | {
      kind: "exempt";
      reasons: ExemptId[];
      /** Only "frail": the county must agree it limits you, so the hours still matter. */
      maybe: boolean;
      activity: Activity | null;
    }
  | Activity;

/** Hours a month that `credits` count for, in school less than half-time (unrounded). */
export const creditHours = (credits: number) => Math.max(0, credits) * MCW.hoursPerCredit;

const hrs = (n: number | null) => (n != null && Number.isFinite(n) && n > 0 ? n : 0);

/** Qualifying hours in a month, unrounded: compare this with the 80, round only to show it. */
export function totalHours(a: Pick<WorkAnswers, "workHours" | "volunteerHours" | "programHours" | "school" | "credits" | "classHours">): number {
  const school = a.school === "less" ? creditHours(a.credits ?? 0) + hrs(a.classHours) : 0;
  return hrs(a.workHours) + hrs(a.volunteerHours) + hrs(a.programHours) + school;
}

/** Hours to show: never rounded up past what was entered (79.9 shows as 79). */
export const shownHours = (raw: number) => Math.floor(raw + 1e-9);

const NOT_COVERED: Partial<Record<ExemptId, NotCoveredId>> = { medicare: "medicare", ssi: "ssi", otherGroup: "otherGroup" };

export function activity(a: WorkAnswers): Activity | null {
  const answered =
    a.incomeCents != null ||
    a.workHours != null ||
    a.volunteerHours != null ||
    a.programHours != null ||
    a.school != null ||
    (a.seasonal && a.seasonalAvgCents != null);
  if (!answered) return null;
  const raw = totalHours(a);
  const hours = shownHours(raw);
  if (a.school === "half") return { kind: "meets", by: "school", hours };
  if (a.incomeCents != null && a.incomeCents >= MCW.incomeCents) return { kind: "meets", by: "income", hours };
  if (a.seasonal && a.seasonalAvgCents != null && a.seasonalAvgCents >= MCW.incomeCents) return { kind: "meets", by: "seasonal", hours };
  if (raw >= MCW.hours) return { kind: "meets", by: "hours", hours };
  const income = a.seasonal ? Math.max(a.incomeCents ?? 0, a.seasonalAvgCents ?? 0) : a.incomeCents;
  return {
    kind: "short",
    hours,
    missingHours: Math.ceil(MCW.hours - raw - 1e-9),
    missingCents: income != null && income > 0 ? MCW.incomeCents - income : null,
    hardship: [...a.hardship],
  };
}

export function workRules(a: WorkAnswers): WorkOutcome {
  if (a.coverage === "restricted") return { kind: "not-covered", reason: "restricted" };
  if (!a.coverage || !a.age) return { kind: "incomplete" };
  if (a.age === "under19") return { kind: "not-covered", reason: "under19" };
  if (a.age === "65plus") return { kind: "not-covered", reason: "65plus" };
  for (const e of a.exempt) {
    const r = NOT_COVERED[e];
    if (r) return { kind: "not-covered", reason: r };
  }
  if (a.exempt.length) {
    const maybe = a.exempt.every((e) => e === "frail");
    return { kind: "exempt", reasons: [...a.exempt], maybe, activity: maybe ? activity(a) : null };
  }
  if (!a.noneApply) return { kind: "incomplete" };
  return activity(a) ?? { kind: "incomplete" };
}

/** Parse "40", "12.5", "12,5" (hours or credits); null for blank or invalid. */
export function parseAmount(s: string, max: number): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= max ? n : null;
}
