// "updated 5 min ago" for layer rows. Pure (unit-tested).

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** Relative time for an epoch-seconds timestamp, e.g. "5 minutes ago" /
 *  "hace 5 minutos". Under a minute reads "now"/"ahora". */
export function ago(epochSec: number, locale: string, nowMs = Date.now()): string {
  const secs = Math.max(0, nowMs / 1000 - epochSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  for (const [unit, size] of UNITS) {
    if (secs >= size) return rtf.format(-Math.floor(secs / size), unit);
  }
  return rtf.format(0, "second");
}
