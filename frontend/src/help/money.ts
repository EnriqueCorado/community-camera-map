// Parsing and formatting dollar amounts typed by people ("$1,250", "1250.5").

/** Amounts as people type them, in either convention:
 *  "$1,234.50" / "1234" / "1234.5" (US) and "16,90" / "1.250,50" (Spanish,
 *  decimal comma). Ambiguous or malformed input (incl. negatives) -> null,
 *  never a guess: "16,90" must not become $1,690. */
export function parseMoney(s: string): number | null {
  const t = s.replace(/[$\s]/g, "");
  let clean: string | null = null;
  if (/^\d+(\.\d{1,2})?$/.test(t)) clean = t; // 1234 / 1234.5
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) clean = t.replace(/,/g, ""); // 1,234.50
  else if (/^\d+,\d{1,2}$/.test(t)) clean = t.replace(",", "."); // 16,90
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) clean = t.replace(/\./g, "").replace(",", "."); // 1.250,50
  if (clean == null) return null;
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
