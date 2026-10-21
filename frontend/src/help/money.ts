// Parsing and formatting dollar amounts typed by people ("$1,250", "1250.5").

/** "$1,234.50" / "1234" -> 1234.5; anything else (incl. negatives) -> null. */
export function parseMoney(s: string): number | null {
  const clean = s.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** 1234.5 -> "$1,234.50" (cents only when there are any). */
export function formatMoney(n: number, locale: string): string {
  return n.toLocaleString(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
