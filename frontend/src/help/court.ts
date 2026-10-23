// "Check your case": tidy an A-Number (Alien Registration Number) for the
// immigration court's phone line and website. Pure, so the unit tests can
// check it. The number lives only in the tool's state: never saved, sent or
// put in a URL.

export interface ANumber {
  /** Nine digits, as the court's phone line asks for them. */
  digits: string;
  /** True when an 8-digit number got a 0 in front. */
  padded: boolean;
  /** "A-012-345-678", easier to read back. */
  display: string;
}

/** The A-Number in `input` (8 or 9 digits, with or without "A", spaces or
 *  dashes), or null if it isn't one. */
export function parseANumber(input: string): ANumber | null {
  const t = input.trim().replace(/^a\s*[-#:]?\s*/i, "");
  if (!/^[\d\s.-]+$/.test(t)) return null;
  const d = t.replace(/\D/g, "");
  if ((d.length !== 8 && d.length !== 9) || /^0+$/.test(d)) return null;
  const digits = d.padStart(9, "0");
  return { digits, padded: d.length === 8, display: `A-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` };
}
