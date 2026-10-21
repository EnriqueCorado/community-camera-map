// Calendar-date helpers on "YYYY-MM-DD" strings. Dates are handled as UTC
// days so daylight-saving changes never shift a count by one.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since the epoch for a valid ISO date, else null. */
export function dayNumber(iso: string): number | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Reject impossible dates like 2026-02-30 (Date would roll them over).
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / 86_400_000;
}

/** Whole days from `a` to `b` (b - a), or null if either is invalid. */
export function daysBetween(a: string, b: string): number | null {
  const x = dayNumber(a);
  const y = dayNumber(b);
  return x == null || y == null ? null : y - x;
}

/** `iso` plus `n` days, as ISO. */
export function addDays(iso: string, n: number): string | null {
  const d = dayNumber(iso);
  return d == null ? null : new Date((d + n) * 86_400_000).toISOString().slice(0, 10);
}

/** Today in the visitor's own time zone, as ISO. */
export function todayIso(now: Date = new Date()): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A long, localized date ("October 19, 2026" / "19 de octubre de 2026"). */
export function longDate(iso: string, locale: string): string {
  const d = dayNumber(iso);
  if (d == null) return iso;
  return new Date(d * 86_400_000).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
