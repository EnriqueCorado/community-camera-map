// Pure popup helpers — no React/DOM, so they're unit-tested directly
// (e2e/tests/unit-popup-logic.spec.ts).

export type FloodRiskKey = "floodHigh" | "floodModerate" | "floodMinimal" | "floodUndetermined";

/**
 * Plain-language risk for a FEMA NFHL flood zone.
 *  - A / AE / AH / AO / AR / A99 / V / VE: special flood hazard area (1% annual chance) -> high
 *  - "Shaded X": 0.2% annual chance, levee-protected, or 1% with < 1 ft depth -> moderate
 *  - Other X -> minimal; D / anything else -> undetermined
 */
export function floodRiskKey(zone: string, subtype: string): FloodRiskKey {
  const z = zone.trim().toUpperCase();
  if (/^(A|AE|AH|AO|AR|A99|V|VE)$/.test(z)) return "floodHigh";
  if (z === "X" && /0\.2|LEVEE|1 PCT/i.test(subtype)) return "floodModerate";
  if (z === "X") return "floodMinimal";
  return "floodUndetermined";
}

// Placeholders government datasets use for "missing". Numeric sentinels must be
// negative (-999, -9999) so a real value of 999 isn't hidden.
const MISSING = /^(not available|n\/?a|no data|unknown|none|null|-9{3,}(\.0+)?)$/i;

export function isMissing(v: unknown): boolean {
  return v == null || String(v).trim() === "" || MISSING.test(String(v).trim());
}

const SMALL_WORDS = new Set(["of", "the", "and", "an", "in", "on", "at", "to", "for", "de", "del", "la", "el", "y"]);
const STREET_SUFFIXES = new Set(["st", "rd", "dr", "ln", "ct", "av", "wy", "pl", "hw", "pk"]);

/** ALL-CAPS government data -> readable Title Case. Leaves mixed-case text,
 *  short codes (CA, AE), and tokens with digits (I-205, SR-99) alone. */
export function tidy(s: string): string {
  if (!/\p{Lu}{3}/u.test(s) || s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      if (/^\d+(st|nd|rd|th)$/.test(w)) return w; // 10th, 3rd
      if (/\d/.test(w)) return w.toUpperCase(); // I-205, SR-99
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      if (w.length <= 2 && !STREET_SUFFIXES.has(w)) return w.toUpperCase(); // CA, US, R, A
      return w.replace(/(^|[-/(])(\p{Ll})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
    })
    .join("");
}

