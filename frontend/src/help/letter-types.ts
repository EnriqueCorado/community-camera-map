// Shape of a fill-in letter (see letters.ts). Each letter carries its own
// English and Spanish text, so the form can be in one language and the letter
// in another (letters to landlords and hospitals usually go out in English).
import type { Lang } from "../i18n";

export type Bilingual = Record<Lang, string>;

export interface LetterField {
  id: string;
  kind: "text" | "multiline" | "date" | "money" | "checks";
  label: Bilingual;
  hint?: Bilingual;
  /** For kind "checks": the items a person can tick. */
  options?: { id: string; label: Bilingual }[];
  /** Standard autofill token for name/address fields; money/dates stay "off". */
  autoComplete?: string;
}

export type LetterValues = Record<string, string | string[]>;

export interface LetterDef {
  id: string;
  title: Bilingual;
  /** One line under the title: what the letter does. */
  blurb: Bilingual;
  fields: LetterField[];
  /** Download file name (no extension). */
  filename: string;
  /** The letter text. `today` is ISO; blanks render as "[label]" so the
   *  preview always reads as a complete letter. */
  render: (v: LetterValues, lang: Lang, today: string) => string;
}

/** A field's typed value, or a "[label]" placeholder to fill in by hand. */
export function val(v: LetterValues, f: LetterField | undefined, lang: Lang): string {
  if (!f) return "";
  const x = v[f.id];
  const s = Array.isArray(x) ? x.join(", ") : (x ?? "").trim();
  return s || `[${f.label[lang]}]`;
}

/** Ticked options, as their labels in the letter's language. */
export function checked(v: LetterValues, f: LetterField | undefined, lang: Lang): string[] {
  const ids = f ? v[f.id] : undefined;
  if (!f || !Array.isArray(ids)) return [];
  return (f.options ?? []).filter((o) => ids.includes(o.id)).map((o) => o.label[lang]);
}
