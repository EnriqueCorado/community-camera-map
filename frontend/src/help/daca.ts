// When to file a DACA renewal, from the date the current DACA expires.
// USCIS: file 120 to 150 days before the expiration date (earlier than 150
// days may be rejected); after expiration, a renewal is still possible within
// one year; after that, only a new initial request (not being decided now).
// Facts and sources: daca-facts.ts. Dates are "YYYY-MM-DD" calendar days.
import { addDays, dayNumber, daysBetween } from "./dates";

export const DACA_WINDOW = {
  /** The earliest USCIS takes a renewal: 150 days before expiration. */
  opens: 150,
  /** Filing by this many days before expiration is USCIS's "ideally". */
  ideal: 120,
  /** DACA is granted for two years; a date further out than this is likely a typo. */
  farDays: 3 * 366,
  /** DACA started on this date, so no grant expired before it. */
  earliest: "2012-08-15",
} as const;

export type DacaStatus =
  /** More than 150 days left: wait until the window opens. */
  | "too-early"
  /** 120–150 days left: USCIS's recommended window. */
  | "file-now"
  /** 0–119 days left: file as soon as possible (it may lapse first). */
  | "urgent"
  /** Expired less than a year ago: a renewal is still possible. */
  | "expired-renew"
  /** Expired a year ago or more: only a new initial request. */
  | "expired-initial";

export interface DacaPlan {
  status: DacaStatus;
  /** Days from today to the expiration date (negative once it has passed). */
  daysLeft: number;
  /** First day of USCIS's window (150 days before). */
  opens: string;
  /** Last day of USCIS's window (120 days before). */
  ideal: string;
  /** One year after expiration: renewals must be filed before this day. */
  yearAfter: string;
  /** The date is more than about three years away: check it. */
  far: boolean;
}

/** The same calendar day one year later; Feb 29 becomes Feb 28 (the earlier,
 *  safer day) in a year without one. */
export function oneYearAfter(iso: string): string | null {
  if (dayNumber(iso) == null) return null;
  const [y, m, d] = iso.split("-");
  const y1 = String(Number(y) + 1).padStart(4, "0");
  const next = `${y1}-${m}-${d}`;
  return dayNumber(next) != null ? next : `${y1}-02-28`;
}

/** Where someone stands, given their DACA expiration date and today's date;
 *  null for an impossible date or one before DACA existed. */
export function dacaPlan(expires: string, today: string): DacaPlan | null {
  const daysLeft = daysBetween(today, expires);
  const opens = addDays(expires, -DACA_WINDOW.opens);
  const ideal = addDays(expires, -DACA_WINDOW.ideal);
  const yearAfter = oneYearAfter(expires);
  if (daysLeft == null || opens == null || ideal == null || yearAfter == null) return null;
  if (expires < DACA_WINDOW.earliest) return null;
  let status: DacaStatus;
  if (daysLeft > DACA_WINDOW.opens) status = "too-early";
  else if (daysLeft >= DACA_WINDOW.ideal) status = "file-now";
  else if (daysLeft >= 0) status = "urgent";
  else status = today < yearAfter ? "expired-renew" : "expired-initial";
  return { status, daysLeft, opens, ideal, yearAfter, far: daysLeft > DACA_WINDOW.farDays };
}
