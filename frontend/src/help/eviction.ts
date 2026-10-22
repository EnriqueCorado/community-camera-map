// Eviction-notice and court-paper deadlines. Pure (no React, no network);
// nothing the person enters leaves the browser.
//
// Every rule below comes from the eviction research checked 2026-10-21 (see
// eviction-facts.ts for citations). Where the law is unsettled we compute the
// EARLIEST possible date and attach a "may be later — don't wait" note:
//  - Notices posted or left with someone: count from the day after it was
//    posted/left and mailed (Judicial Council; Walters v. Meyers). Davidson
//    v. Quinn suggests counting from receipt (later), so we don't use it.
//  - Mailing never adds 5 days to a notice (Losornio v. Motta). Whether +5
//    applies to a 30/60/90-day notice sent ONLY by certified mail is
//    unsettled; we add nothing.
//  - Court papers by mail only: CCP §1167(b)'s extra 5 court days may be for
//    Safe at Home only; we add nothing.
//  - Court papers left with someone or posted: CCP §415.20/§415.45 are
//    replaced on 2027-01-01 (AB 747) and we could not confirm the new rule,
//    so if service would complete in 2027 or later we refuse ("call now").
import { addDays, daysBetween, dayNumber } from "./dates";
import { countCalendarDays, countCourtDays, inCoveredRange, type Count } from "./court-days";

export type NoticeKind = "pay-or-quit" | "perform-or-quit" | "quit-no-cure" | "30-day" | "60-day" | "90-day" | "summons";
export type Delivery = "hand" | "left" | "posted" | "mailed" | "electronic";

export const NOTICE_KINDS: readonly NoticeKind[] = ["pay-or-quit", "perform-or-quit", "quit-no-cure", "30-day", "60-day", "90-day", "summons"];
export const DELIVERIES: readonly Delivery[] = ["hand", "left", "posted", "mailed", "electronic"];

/** Extra things to tell the person about this deadline. */
export type NoteId =
  | "noFivePlus" // mailing does not add 5 days
  | "maybeLaterSubstituted" // posted/left notice: some courts count from receipt
  | "maybeLaterCertified" // 30/60/90 by mail only: +5 days unsettled
  | "mailOnly3Day" // 3-day notice only mailed: not one of the listed methods
  | "notValidService" // email/text/spoken: not valid service, act anyway
  | "summonsMail" // court papers by mail only: may be later
  | "summonsComplete" // left/posted court papers: service complete after 10 days
  | "tenancyEndsLater" // 30/60/90: the later of this and the notice's date
  | "subsidized90" // 90-day: Section 8 rules, 10 days to discuss
  | "disputedHoliday" // a disputed court holiday was counted as a court day
  | "deadlineMaybeClosed"; // the deadline itself is a disputed holiday: court may be closed

/** Court days vs calendar days, and how many, per the research. */
export const RULES: Record<NoticeKind, { days: number; count: "court" | "calendar" }> = {
  "pay-or-quit": { days: 3, count: "court" }, // CCP §1161(2)
  "perform-or-quit": { days: 3, count: "court" }, // CCP §1161(3)
  "quit-no-cure": { days: 3, count: "calendar" }, // CCP §1161(4): no court-day language
  "30-day": { days: 30, count: "calendar" }, // Civ. Code §1946.1(c)
  "60-day": { days: 60, count: "calendar" }, // Civ. Code §1946.1(b)
  "90-day": { days: 90, count: "calendar" }, // Civ. Code §1954.535; CCP §1161b
  summons: { days: 10, count: "court" }, // CCP §1167(a) (AB 2347)
};

/** Substituted or posted court papers are complete 10 days after mailing. */
export const SUMMONS_MAIL_COMPLETE_DAYS = 10;
/** From this date, AB 747 replaces the summons substituted/posting rules. */
export const AB747_FROM = "2027-01-01";

export type Deadline =
  | {
      ok: true;
      kind: NoticeKind;
      delivery: Delivery;
      /** The day counting starts after (the day itself doesn't count). */
      start: string;
      /** Left/posted court papers: the day service is complete. */
      serviceComplete?: string;
      /** The last day to act. */
      deadline: string;
      method: "court" | "calendar" | "calendar-then-court";
      days: number;
      count: Count;
      notes: NoteId[];
    }
  | { ok: false; reason: "invalid" | "out-of-range" | "rules-change-2027" };

const isThreeDay = (k: NoticeKind) => k === "pay-or-quit" || k === "perform-or-quit" || k === "quit-no-cure";

/** The deadline for a notice or court papers received (or posted/mailed) on
 *  `startIso`, delivered as `delivery`. */
export function evictionDeadline(kind: NoticeKind, delivery: Delivery, startIso: string): Deadline {
  if (dayNumber(startIso) == null) return { ok: false, reason: "invalid" };
  if (!inCoveredRange(startIso)) return { ok: false, reason: "out-of-range" };
  const rule = RULES[kind];
  const notes: NoteId[] = [];
  const substituted = delivery === "left" || delivery === "posted";

  if (kind === "summons") {
    if (substituted) {
      // Service is complete on the 10th calendar day after mailing, with no
      // weekend roll (research example: mailed 10/21, complete Sat 10/31).
      const complete = addDays(startIso, SUMMONS_MAIL_COMPLETE_DAYS)!;
      // If either date falls under the 2027 rewrite we can't be sure which
      // rule applies, so we don't guess.
      if (complete >= AB747_FROM) return { ok: false, reason: "rules-change-2027" };
      const count = countCourtDays(complete, rule.days);
      if (!count) return { ok: false, reason: "out-of-range" };
      notes.push("summonsComplete");
      if (count.disputed.length) notes.push(...disputedNotes(count.end, count.disputed));
      return { ok: true, kind, delivery, start: startIso, serviceComplete: complete, deadline: count.end, method: "calendar-then-court", days: rule.days, count, notes };
    }
    const count = countCourtDays(startIso, rule.days);
    if (!count) return { ok: false, reason: "out-of-range" };
    if (delivery === "mailed") notes.push("summonsMail");
    if (delivery === "electronic") notes.push("notValidService");
    if (count.disputed.length) notes.push(...disputedNotes(count.end, count.disputed));
    return { ok: true, kind, delivery, start: startIso, deadline: count.end, method: "court", days: rule.days, count, notes };
  }

  const count = rule.count === "court" ? countCourtDays(startIso, rule.days) : countCalendarDays(startIso, rule.days);
  if (!count) return { ok: false, reason: "out-of-range" };
  if (substituted) notes.push("noFivePlus", "maybeLaterSubstituted");
  if (delivery === "mailed") {
    notes.push("noFivePlus");
    notes.push(isThreeDay(kind) ? "mailOnly3Day" : "maybeLaterCertified");
  }
  if (delivery === "electronic") notes.push("notValidService");
  if (kind === "30-day" || kind === "60-day" || kind === "90-day") notes.push("tenancyEndsLater");
  if (kind === "90-day") notes.push("subsidized90");
  if (count.disputed.length) notes.push(...disputedNotes(count.end, count.disputed));
  return { ok: true, kind, delivery, start: startIso, deadline: count.end, method: rule.count, days: rule.days, count, notes };
}

/** Notes for disputed holidays in the count; if the deadline itself is one,
 *  the court may be closed that day, so say to file the court day before. */
function disputedNotes(deadline: string, disputed: readonly { date: string }[]): NoteId[] {
  return disputed.some((h) => h.date === deadline) ? ["disputedHoliday", "deadlineMaybeClosed"] : ["disputedHoliday"];
}

export type Urgency = "passed" | "today" | "soon" | "later";

/** Days from today to the deadline (0 = today), or null for a bad date. */
export function daysLeft(todayIso: string, deadlineIso: string): number | null {
  return daysBetween(todayIso, deadlineIso);
}

/** How loud the result should be: 3 days or less left is urgent. */
export function urgency(left: number): Urgency {
  if (left < 0) return "passed";
  if (left === 0) return "today";
  return left <= 3 ? "soon" : "later";
}
