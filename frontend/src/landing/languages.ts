// Pages for people who read Punjabi or Dari better than English or Spanish:
// one landing page and one flyer per language. They explain the free tools,
// link to each tool's English and Spanish page, and list phone lines that say
// they give an interpreter (help/languages-facts.ts). The legal facts
// themselves are not translated here: they need a human review first.
//
// Written with AI help and not yet checked by a native speaker; every page
// says so and asks for corrections. Chosen from Census and school data:
// ~/dev/outreach-help-2026-10/research/languages.md.
import type { GroupId, ToolId } from "./tools";
import type { LineId } from "../help/languages-facts";
import { RED_CARD_PDFS } from "../help/languages-facts";

export type OtherLang = "pa" | "prs";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface LangCopy {
  /** Short name in the header ("Free help, Stanislaus County"). */
  siteName: string;
  title: string;
  description: string;
  heading: string;
  lead: string;
  skip: string;
  promiseLabel: string;
  promise: string[];
  aiTitle: string;
  aiText: string;
  howTitle: string;
  how: string[];
  sayTitle: string;
  /** Said or shown in English to get an interpreter. */
  sayEn: string;
  /** How sayEn sounds, written in this language's script. */
  sayHint: string;
  toolsTitle: string;
  inEnglish: string;
  inSpanish: string;
  /** Screen-reader text after a tool's name on its English / Spanish link. */
  openIn: Fn<[string, string]>;
  /** Shown next to a tool that has no translation yet (its English name is shown). */
  untranslated: string;
  linesTitle: string;
  linesLead: string;
  call: Fn<[string]>;
  emergency: string;
  redTitle: string;
  redText: string;
  flyerTitle: string;
  flyerText: string;
  flyerLink: string;
  otherLangsTitle: string;
  sourcesTitle: string;
  checked: Fn<[string]>;
  disclaimer: string;
  footerVolunteer: string;
  scan: string;
  print: string;
  back: string;
  listen: string;
  listenStop: string;
}

export interface LangPage {
  id: OtherLang;
  /** BCP 47 tag for lang="…" (Dari: fa-AF, which browsers and screen readers know). */
  htmlLang: string;
  dir: "ltr" | "rtl";
  /** Folder under help/: spelled in English so it can be said aloud. */
  slug: string;
  /** Date formatting (Gregorian calendar). */
  locale: string;
  nativeName: string;
  englishName: string;
  copy: LangCopy;
  groups: Partial<Record<GroupId, string>>;
  /** Tools without an entry (added later) are listed with their English name. */
  tools: Partial<Record<ToolId, { name: string; summary: string }>>;
  lines: readonly { id: LineId; name: string; what: string }[];
  /** Agencies that help newcomers but don't name this language (listed apart, without a language claim). */
  newcomers?: { title: string; lead: string; items: readonly { id: LineId; name: string; what: string }[] };
  redCards: readonly { href: string; label: string; lang: string; dir?: "rtl" }[];
  flyer: { headline: string; bullets: string[]; english: string; promise: string; note: string };
}

/** The honest label, also in English for whoever helps the reader. */
export const AI_NOTE_EN = (language: string) =>
  `This page was translated with AI help and has not yet been checked by a native ${language} speaker. Corrections are welcome:`;

const PUNJABI: LangPage = {
  id: "pa",
  htmlLang: "pa",
  dir: "ltr",
  slug: "punjabi",
  locale: "pa-IN",
  nativeName: "ਪੰਜਾਬੀ",
  englishName: "Punjabi",
  copy: {
    siteName: "ਮੁਫ਼ਤ ਮਦਦ, ਸਟੈਨਿਸਲੌਸ ਕਾਊਂਟੀ",
    title: "ਸਟੈਨਿਸਲੌਸ ਕਾਊਂਟੀ ਵਿੱਚ ਮੁਫ਼ਤ ਮਦਦ, ਪੰਜਾਬੀ ਵਿੱਚ | Free help in Punjabi",
    description:
      "ਸਟੈਨਿਸਲੌਸ ਕਾਊਂਟੀ, ਕੈਲੀਫੋਰਨੀਆ ਦੇ ਲੋਕਾਂ ਲਈ ਮੁਫ਼ਤ ਅਤੇ ਨਿੱਜੀ ਔਜ਼ਾਰ, ਪੰਜਾਬੀ ਵਿੱਚ ਸਮਝਾਏ ਗਏ, ਅਤੇ ਮੁਫ਼ਤ ਫ਼ੋਨ ਲਾਈਨਾਂ ਜਿੱਥੇ ਤੁਸੀਂ ਦੁਭਾਸ਼ੀਆ ਮੰਗ ਸਕਦੇ ਹੋ।",
    heading: "ਸਟੈਨਿਸਲੌਸ ਕਾਊਂਟੀ ਵਿੱਚ ਮੁਫ਼ਤ ਮਦਦ",
    lead: "ਹਸਪਤਾਲ ਦੇ ਬਿੱਲ, ਕਿਰਾਇਆ ਅਤੇ ਘਰ ਖ਼ਾਲੀ ਕਰਨ ਦੇ ਨੋਟਿਸ, ਨਾ ਮਿਲੀ ਤਨਖ਼ਾਹ, ਸਰਕਾਰੀ ਲਾਭ, ਇਮੀਗ੍ਰੇਸ਼ਨ ਅਤੇ ਮੁਫ਼ਤ ਕਾਨੂੰਨੀ ਮਦਦ ਲਈ ਸੌਖੇ ਔਜ਼ਾਰ। ਔਜ਼ਾਰ ਅੰਗਰੇਜ਼ੀ ਅਤੇ ਸਪੇਨੀ ਵਿੱਚ ਹਨ। ਇਹ ਸਫ਼ਾ ਉਹਨਾਂ ਨੂੰ ਪੰਜਾਬੀ ਵਿੱਚ ਸਮਝਾਉਂਦਾ ਹੈ ਅਤੇ ਦੱਸਦਾ ਹੈ ਕਿ ਪੰਜਾਬੀ ਵਿੱਚ ਮਦਦ ਕਿੱਥੋਂ ਮਿਲ ਸਕਦੀ ਹੈ।",
    skip: "ਮੁੱਖ ਸਮੱਗਰੀ 'ਤੇ ਜਾਓ",
    promiseLabel: "ਸਾਡਾ ਵਾਅਦਾ",
    promise: [
      "ਮੁਫ਼ਤ, ਕੋਈ ਸਾਈਨ-ਅੱਪ ਨਹੀਂ",
      "ਜੋ ਤੁਸੀਂ ਲਿਖਦੇ ਹੋ, ਉਹ ਨਾ ਸੰਭਾਲਿਆ ਜਾਂਦਾ ਹੈ, ਨਾ ਕਿਸੇ ਨਾਲ ਸਾਂਝਾ ਕੀਤਾ ਜਾਂਦਾ ਹੈ",
      "ਤੁਹਾਡੇ ਇਮੀਗ੍ਰੇਸ਼ਨ ਸਟੇਟਸ ਬਾਰੇ ਕਦੇ ਨਹੀਂ ਪੁੱਛਿਆ ਜਾਂਦਾ",
    ],
    aiTitle: "ਇਸ ਅਨੁਵਾਦ ਬਾਰੇ",
    aiText:
      "ਇਹ ਸਫ਼ਾ AI (ਕੰਪਿਊਟਰ) ਦੀ ਮਦਦ ਨਾਲ ਅਨੁਵਾਦ ਕੀਤਾ ਗਿਆ ਹੈ। ਕਿਸੇ ਪੰਜਾਬੀ ਬੋਲਣ ਵਾਲੇ ਨੇ ਅਜੇ ਇਸ ਦੀ ਜਾਂਚ ਨਹੀਂ ਕੀਤੀ। ਜੇ ਕੁਝ ਗ਼ਲਤ ਹੈ ਜਾਂ ਸਮਝ ਨਹੀਂ ਆਉਂਦਾ, ਤਾਂ ਕਿਰਪਾ ਕਰਕੇ ਸਾਨੂੰ ਈਮੇਲ ਕਰਕੇ ਦੱਸੋ:",
    howTitle: "ਇਹ ਕਿਵੇਂ ਵਰਤਣਾ ਹੈ",
    how: [
      "ਹੇਠਾਂ ਆਪਣੇ ਸਵਾਲ ਵਾਲਾ ਔਜ਼ਾਰ ਚੁਣੋ।",
      "ਔਜ਼ਾਰ ਅੰਗਰੇਜ਼ੀ (English) ਜਾਂ ਸਪੇਨੀ (Español) ਵਿੱਚ ਖੁੱਲ੍ਹਦਾ ਹੈ।",
      "ਪੜ੍ਹਨ ਵਿੱਚ ਮਦਦ ਚਾਹੀਦੀ ਹੈ? ਕਿਸੇ ਭਰੋਸੇਯੋਗ ਵਿਅਕਤੀ ਨੂੰ ਪੁੱਛੋ, ਜਾਂ ਹੇਠਾਂ ਦਿੱਤੀ ਕਿਸੇ ਮੁਫ਼ਤ ਲਾਈਨ 'ਤੇ ਫ਼ੋਨ ਕਰਕੇ ਪੰਜਾਬੀ ਦੁਭਾਸ਼ੀਆ ਮੰਗੋ।",
    ],
    sayTitle: "ਦੁਭਾਸ਼ੀਆ ਮੰਗਣ ਲਈ ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ ਇਹ ਕਹੋ, ਜਾਂ ਇਹ ਸਫ਼ਾ ਦਿਖਾਓ:",
    sayEn: "I need a Punjabi interpreter, please.",
    sayHint: "(ਆਈ ਨੀਡ ਅ ਪੰਜਾਬੀ ਇੰਟਰਪ੍ਰੈਟਰ, ਪਲੀਜ਼)",
    toolsTitle: "ਮੁਫ਼ਤ ਔਜ਼ਾਰ",
    inEnglish: "English",
    inSpanish: "Español",
    openIn: (tool, language) => `${tool}: ${language} ਵਿੱਚ`,
    untranslated: "(ਅਜੇ ਪੰਜਾਬੀ ਵਿੱਚ ਨਹੀਂ)",
    linesTitle: "ਮੁਫ਼ਤ ਫ਼ੋਨ ਲਾਈਨਾਂ ਜਿੱਥੇ ਦੁਭਾਸ਼ੀਆ ਮਿਲਦਾ ਹੈ",
    linesLead: "ਫ਼ੋਨ ਕਰੋ ਅਤੇ ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ “Punjabi” ਕਹੋ। ਹਰ ਲਾਈਨ ਦੀ ਆਪਣੀ ਵੈੱਬਸਾਈਟ ਦੱਸਦੀ ਹੈ ਕਿ ਉਹ ਦੁਭਾਸ਼ੀਆ ਦਿੰਦੀ ਹੈ।",
    call: (n) => `${n} 'ਤੇ ਫ਼ੋਨ ਕਰੋ`,
    emergency: "ਐਮਰਜੈਂਸੀ ਵਿੱਚ, ਜਾਂ ਜੇ ਕੋਈ ਖ਼ਤਰੇ ਵਿੱਚ ਹੈ, 911 'ਤੇ ਫ਼ੋਨ ਕਰੋ।",
    redTitle: "ਮੁਫ਼ਤ ਲਾਲ ਕਾਰਡ: ਆਪਣੇ ਹੱਕ ਜਾਣੋ",
    redText:
      "ਲਾਲ ਕਾਰਡ ਇਮੀਗ੍ਰੇਸ਼ਨ ਏਜੰਟ ਨੂੰ ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ ਦੱਸਦਾ ਹੈ ਕਿ ਤੁਸੀਂ ਆਪਣੇ ਸੰਵਿਧਾਨਕ ਹੱਕ ਵਰਤ ਰਹੇ ਹੋ। ਇਹ Immigrant Legal Resource Center (ILRC) ਮੁਫ਼ਤ ਦਿੰਦਾ ਹੈ। ਇੱਕ ਆਪਣੇ ਬਟੂਏ ਵਿੱਚ ਅਤੇ ਇੱਕ ਦਰਵਾਜ਼ੇ ਕੋਲ ਰੱਖੋ।",
    flyerTitle: "ਛਾਪਣ ਲਈ ਪਰਚਾ",
    flyerText: "ਗੁਰਦੁਆਰੇ, ਦਫ਼ਤਰ, ਕਲੀਨਿਕ ਜਾਂ ਕੰਮ ਵਾਲੀ ਥਾਂ ਲਈ QR ਕੋਡ ਵਾਲਾ ਪੰਜਾਬੀ ਪਰਚਾ।",
    flyerLink: "ਪੰਜਾਬੀ ਪਰਚਾ ਖੋਲ੍ਹੋ ਅਤੇ ਛਾਪੋ",
    otherLangsTitle: "ਹੋਰ ਭਾਸ਼ਾਵਾਂ",
    sourcesTitle: "ਇਹ ਜਾਣਕਾਰੀ ਕਿੱਥੋਂ ਆਈ ਹੈ",
    checked: (d) => `ਆਖ਼ਰੀ ਵਾਰ ਜਾਂਚ ਕੀਤੀ: ${d}।`,
    disclaimer: "ਇਹ ਆਮ ਜਾਣਕਾਰੀ ਹੈ, ਕਾਨੂੰਨੀ ਸਲਾਹ ਨਹੀਂ। ਆਪਣੇ ਕੇਸ ਬਾਰੇ ਸਲਾਹ ਲਈ ਕਿਸੇ ਮੁਫ਼ਤ ਕਾਨੂੰਨੀ ਮਦਦ ਦਫ਼ਤਰ ਨਾਲ ਗੱਲ ਕਰੋ।",
    footerVolunteer: "ਇੱਕ ਸਥਾਨਕ ਵਲੰਟੀਅਰ ਵੱਲੋਂ ਬਣਾਇਆ ਗਿਆ। ਇਹ ਸਰਕਾਰੀ ਵੈੱਬਸਾਈਟ ਨਹੀਂ ਹੈ।",
    scan: "ਆਪਣੇ ਫ਼ੋਨ ਦੇ ਕੈਮਰੇ ਨਾਲ ਸਕੈਨ ਕਰੋ",
    print: "ਇਹ ਪਰਚਾ ਛਾਪੋ",
    back: "ਪੰਜਾਬੀ ਸਫ਼ੇ 'ਤੇ ਵਾਪਸ",
    listen: "ਇਹ ਸਫ਼ਾ ਸੁਣੋ",
    listenStop: "ਸੁਣਨਾ ਬੰਦ ਕਰੋ",
  },
  groups: {
    health: "ਸਿਹਤ ਅਤੇ ਸਰਕਾਰੀ ਲਾਭ",
    housing: "ਕਿਰਾਏਦਾਰ",
    work: "ਕੰਮ",
    immigration: "ਇਮੀਗ੍ਰੇਸ਼ਨ",
    legal: "ਕਾਨੂੰਨੀ ਮਦਦ",
  },
  tools: {
    medical: {
      name: "ਹਸਪਤਾਲ ਦੇ ਬਿੱਲ ਵਿੱਚ ਮਦਦ",
      summary: "ਕੈਲੀਫੋਰਨੀਆ ਦੇ ਹਸਪਤਾਲਾਂ ਵਿੱਚ ਮੁਫ਼ਤ ਜਾਂ ਸਸਤਾ ਇਲਾਜ, ਬਿੱਲ ਆਉਣ ਤੋਂ ਬਾਅਦ ਵੀ। ਦੇਖੋ ਕਿ ਤੁਸੀਂ ਯੋਗ ਹੋ, ਅਤੇ ਮਦਦ ਮੰਗਣ ਲਈ ਚਿੱਠੀ ਲਓ।",
    },
    benefits: {
      name: "ਮੇਰੇ ਪਰਿਵਾਰ ਨੂੰ ਕਿਹੜੇ ਲਾਭ ਮਿਲ ਸਕਦੇ ਹਨ?",
      summary: "CalFresh (ਖਾਣੇ ਦੀ ਮਦਦ), Medi‑Cal (ਸਿਹਤ ਬੀਮਾ), WIC, ਬਿਜਲੀ-ਗੈਸ ਵਿੱਚ ਛੋਟ ਅਤੇ ਟੈਕਸ ਕ੍ਰੈਡਿਟ: ਲਗਭਗ 2 ਮਿੰਟਾਂ ਵਿੱਚ ਦੇਖੋ।",
    },
    "medi-cal-work": {
      name: "Medi‑Cal ਦੇ ਕੰਮ ਦੇ ਨਵੇਂ ਨਿਯਮ (2027)",
      summary: "2027 ਤੋਂ Medi‑Cal ਵਾਲੇ ਕਈ ਬਾਲਗਾਂ ਨੂੰ ਕੰਮ ਦੇ ਘੰਟੇ ਜਾਂ ਕਮਾਈ ਦਿਖਾਉਣੀ ਪਵੇਗੀ। ਦੇਖੋ ਕਿ ਇਹ ਤੁਹਾਡੇ 'ਤੇ ਲਾਗੂ ਹੁੰਦਾ ਹੈ ਜਾਂ ਤੁਹਾਨੂੰ ਛੋਟ ਹੈ।",
    },
    rent: {
      name: "ਕੀ ਮੇਰਾ ਕਿਰਾਇਆ ਵਧਾਉਣਾ ਕਾਨੂੰਨੀ ਹੈ?",
      summary: "ਕਿਰਾਏ ਦੇ ਵਾਧੇ ਨੂੰ ਕੈਲੀਫੋਰਨੀਆ ਦੀ ਹੱਦ ਅਤੇ ਨੋਟਿਸ ਦੇ ਨਿਯਮਾਂ ਨਾਲ ਮਿਲਾ ਕੇ ਦੇਖੋ।",
    },
    eviction: {
      name: "ਘਰ ਖ਼ਾਲੀ ਕਰਨ ਦਾ ਨੋਟਿਸ ਮਿਲਿਆ?",
      summary: "ਨੋਟਿਸ ਜਾਂ ਅਦਾਲਤ ਦੇ ਕਾਗ਼ਜ਼ਾਂ ਦਾ ਜਵਾਬ ਦੇਣ ਦੀ ਆਖ਼ਰੀ ਤਰੀਕ ਗਿਣੋ, ਅਤੇ ਜਲਦੀ ਮੁਫ਼ਤ ਮਦਦ ਲੱਭੋ।",
    },
    repairs: {
      name: "ਮੁਰੰਮਤ ਕਰਵਾਓ",
      summary: "ਮਕਾਨ-ਮਾਲਕ ਤੋਂ ਮੁਰੰਮਤ ਮੰਗਣ ਲਈ ਮੁਫ਼ਤ ਚਿੱਠੀ (ਅੰਗਰੇਜ਼ੀ ਜਾਂ ਸਪੇਨੀ ਵਿੱਚ), ਅਤੇ ਉਡੀਕ ਦੌਰਾਨ ਤੁਹਾਡੇ ਹੱਕ।",
    },
    deposit: {
      name: "ਮੇਰੀ ਜਮ੍ਹਾਂ ਰਕਮ (ਡਿਪਾਜ਼ਿਟ) ਵਾਪਸ ਲਓ",
      summary: "ਘਰ ਛੱਡ ਦਿੱਤਾ ਪਰ ਡਿਪਾਜ਼ਿਟ ਵਾਪਸ ਨਹੀਂ ਮਿਲਿਆ? ਇਸ ਨੂੰ ਮੰਗਣ ਲਈ ਮੁਫ਼ਤ ਚਿੱਠੀ, ਅਤੇ 21 ਦਿਨਾਂ ਦਾ ਨਿਯਮ।",
    },
    mobile: {
      name: "ਮੋਬਾਈਲ ਹੋਮ ਦੀ ਥਾਂ ਦਾ ਕਿਰਾਇਆ",
      summary: "ਮੋਬਾਈਲ ਹੋਮ ਤੁਹਾਡਾ ਹੈ ਅਤੇ ਥਾਂ ਕਿਰਾਏ 'ਤੇ ਹੈ? ਸਟੈਨਿਸਲੌਸ ਕਾਊਂਟੀ ਵਿੱਚ ਥਾਂ ਦਾ ਕਿਰਾਇਆ ਵਧਾਉਣ ਦੇ ਨਿਯਮ।",
    },
    wages: {
      name: "ਨਾ ਮਿਲੀ ਤਨਖ਼ਾਹ",
      summary: "ਓਵਰਟਾਈਮ, ਘੱਟੋ-ਘੱਟ ਤਨਖ਼ਾਹ, ਨਾ ਮਿਲੀਆਂ ਛੁੱਟੀਆਂ ਅਤੇ ਦੇਰ ਨਾਲ ਆਖ਼ਰੀ ਤਨਖ਼ਾਹ: ਦੇਖੋ ਕਿੰਨਾ ਬਕਾਇਆ ਹੋ ਸਕਦਾ ਹੈ ਅਤੇ ਕਿਵੇਂ ਮੰਗਣਾ ਹੈ।",
    },
    heat: {
      name: "ਅੱਜ ਕੰਮ 'ਤੇ ਗਰਮੀ",
      summary: "ਬਾਹਰ ਜਾਂ ਅੰਦਰ, ਗਰਮੀ ਦੇ ਨਿਯਮ ਜੋ ਮਾਲਕ ਨੂੰ ਮੰਨਣੇ ਪੈਂਦੇ ਹਨ, ਅਤੇ ਜੇ ਕੋਈ ਬਿਮਾਰ ਹੋ ਜਾਵੇ ਤਾਂ ਕੀ ਕਰਨਾ ਹੈ।",
    },
    "know-your-rights": {
      name: "ਇਮੀਗ੍ਰੇਸ਼ਨ ਏਜੰਟਾਂ ਨਾਲ ਆਪਣੇ ਹੱਕ ਜਾਣੋ",
      summary: "ਜੇ ਇਮੀਗ੍ਰੇਸ਼ਨ ਏਜੰਟ ਤੁਹਾਡੇ ਦਰਵਾਜ਼ੇ 'ਤੇ ਆਉਣ ਜਾਂ ਤੁਹਾਨੂੰ ਰੋਕਣ ਤਾਂ ਕੀ ਕਰਨਾ ਹੈ, ਪਰਿਵਾਰ ਦੀ ਯੋਜਨਾ, ਅਤੇ ਹਿਰਾਸਤ ਵਿੱਚ ਲਏ ਵਿਅਕਤੀ ਨੂੰ ਕਿਵੇਂ ਲੱਭਣਾ ਹੈ।",
    },
    citizenship: {
      name: "ਅਮਰੀਕੀ ਨਾਗਰਿਕਤਾ ਦੇ ਟੈਸਟ ਦੀ ਤਿਆਰੀ",
      summary: "ਸਾਰੇ 128 ਸਰਕਾਰੀ ਸਵਾਲ ਅਤੇ ਜਵਾਬ (ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ, ਜਿਵੇਂ ਟੈਸਟ ਹੁੰਦਾ ਹੈ), ਅਸਲੀ ਵਰਗੇ ਅਭਿਆਸ ਟੈਸਟ, ਅਤੇ ਨੇੜੇ ਮੁਫ਼ਤ ਕਲਾਸਾਂ।",
    },
    legal: {
      name: "ਮੁਫ਼ਤ ਅਤੇ ਸਸਤੀ ਕਾਨੂੰਨੀ ਮਦਦ",
      summary: "ਸਟੈਨਿਸਲੌਸ ਕਾਊਂਟੀ ਦੇ ਨੇੜੇ ਕਾਨੂੰਨੀ ਮਦਦ ਦੇ ਦਫ਼ਤਰ, ਅਤੇ ਨਕਲੀ “ਨੋਟਰੀਓ” ਤੋਂ ਕਿਵੇਂ ਬਚਣਾ ਹੈ।",
    },
  },
  lines: [
    {
      id: "csa",
      name: "ਸਟੈਨਿਸਲੌਸ ਕਾਊਂਟੀ ਕਮਿਊਨਿਟੀ ਸਰਵਿਸਿਜ਼ ਏਜੰਸੀ (CSA)",
      what: "CalFresh (ਖਾਣੇ ਦੀ ਮਦਦ), Medi‑Cal (ਸਿਹਤ ਬੀਮਾ) ਅਤੇ CalWORKs (ਨਕਦ ਮਦਦ)। CalFresh ਅਤੇ CalWORKs ਲਈ ਕਾਊਂਟੀ ਨੂੰ ਮੁਫ਼ਤ ਦੁਭਾਸ਼ੀਆ ਦੇਣਾ ਪੈਂਦਾ ਹੈ, ਅਤੇ ਤੁਹਾਡੇ ਬੱਚਿਆਂ ਤੋਂ ਅਨੁਵਾਦ ਨਹੀਂ ਕਰਵਾਇਆ ਜਾਣਾ ਚਾਹੀਦਾ।",
    },
    {
      id: "labor",
      name: "ਕੈਲੀਫੋਰਨੀਆ ਲੇਬਰ ਕਮਿਸ਼ਨਰ (Labor Commissioner)",
      what: "ਨਾ ਮਿਲੀ ਤਨਖ਼ਾਹ, ਓਵਰਟਾਈਮ, ਆਰਾਮ ਅਤੇ ਖਾਣੇ ਦੀਆਂ ਛੁੱਟੀਆਂ, ਸ਼ਿਕਾਇਤ ਕਰਨ 'ਤੇ ਬਦਲਾ। ਫ਼ੋਨ 'ਤੇ ਦੁਭਾਸ਼ੀਆ ਮਿਲਦਾ ਹੈ। ਤੁਹਾਡਾ ਇਮੀਗ੍ਰੇਸ਼ਨ ਸਟੇਟਸ ਮਾਇਨੇ ਨਹੀਂ ਰੱਖਦਾ।",
    },
    {
      id: "crla",
      name: "California Rural Legal Assistance (CRLA), ਮੋਡੈਸਟੋ",
      what: "ਘੱਟ ਆਮਦਨ ਵਾਲੇ ਲੋਕਾਂ ਲਈ ਮੁਫ਼ਤ ਕਾਨੂੰਨੀ ਮਦਦ: ਘਰ ਅਤੇ ਘਰ ਖ਼ਾਲੀ ਕਰਵਾਉਣਾ, ਕੰਮ, ਸਰਕਾਰੀ ਲਾਭ, ਪਰਿਵਾਰ। CRLA ਮੁਫ਼ਤ ਦੁਭਾਸ਼ੀਆ ਦਿੰਦਾ ਹੈ।",
    },
    {
      id: "court",
      name: "ਸਟੈਨਿਸਲੌਸ ਸੁਪੀਰੀਅਰ ਕੋਰਟ: ਦੁਭਾਸ਼ੀਆ ਦਫ਼ਤਰ",
      what: "ਹਰ ਕਿਸਮ ਦੇ ਕੇਸ ਲਈ ਦੁਭਾਸ਼ੀਆ। ਫ਼ਾਰਮ INT-300 ਭਰੋ ਅਤੇ ਅਦਾਲਤ ਦੀ ਤਰੀਕ ਤੋਂ 30 ਦਿਨ ਪਹਿਲਾਂ ਕਲਰਕ ਦੇ ਦਫ਼ਤਰ ਵਿੱਚ ਦਿਓ।",
    },
  ],
  redCards: [
    { href: RED_CARD_PDFS.punjabi, label: "ਪੰਜਾਬੀ ਵਿੱਚ ਲਾਲ ਕਾਰਡ (PDF)", lang: "pa" },
    { href: RED_CARD_PDFS.page, label: "ILRC: 59 ਭਾਸ਼ਾਵਾਂ ਵਿੱਚ ਲਾਲ ਕਾਰਡ", lang: "pa" },
  ],
  flyer: {
    headline: "ਸਟੈਨਿਸਲੌਸ ਕਾਊਂਟੀ ਵਿੱਚ ਮੁਫ਼ਤ ਮਦਦ",
    bullets: [
      "ਹਸਪਤਾਲ ਦਾ ਬਿੱਲ? ਦੇਖੋ ਕਿ ਤੁਹਾਨੂੰ ਮੁਫ਼ਤ ਜਾਂ ਸਸਤਾ ਇਲਾਜ ਮਿਲ ਸਕਦਾ ਹੈ।",
      "ਕਿਰਾਇਆ ਵਧਿਆ ਜਾਂ ਘਰ ਖ਼ਾਲੀ ਕਰਨ ਦਾ ਨੋਟਿਸ ਮਿਲਿਆ? ਨਿਯਮ ਅਤੇ ਆਪਣੀ ਆਖ਼ਰੀ ਤਰੀਕ ਦੇਖੋ।",
      "ਤਨਖ਼ਾਹ ਨਹੀਂ ਮਿਲੀ? ਦੇਖੋ ਕਿੰਨਾ ਬਕਾਇਆ ਹੋ ਸਕਦਾ ਹੈ ਅਤੇ ਕਿਵੇਂ ਮੰਗਣਾ ਹੈ।",
      "ਪਰਿਵਾਰ ਲਈ ਸਰਕਾਰੀ ਲਾਭ, ਇਮੀਗ੍ਰੇਸ਼ਨ ਵਿੱਚ ਆਪਣੇ ਹੱਕ, ਅਤੇ ਮੁਫ਼ਤ ਕਾਨੂੰਨੀ ਮਦਦ।",
      "ਮੁਫ਼ਤ ਫ਼ੋਨ ਲਾਈਨਾਂ ਜਿੱਥੇ ਤੁਸੀਂ ਪੰਜਾਬੀ ਦੁਭਾਸ਼ੀਆ ਮੰਗ ਸਕਦੇ ਹੋ।",
    ],
    english: "Free help in Stanislaus County, explained in Punjabi",
    promise: "ਮੁਫ਼ਤ। ਜੋ ਤੁਸੀਂ ਲਿਖਦੇ ਹੋ, ਉਹ ਨਾ ਸੰਭਾਲਿਆ ਜਾਂਦਾ ਹੈ, ਨਾ ਸਾਂਝਾ ਕੀਤਾ ਜਾਂਦਾ ਹੈ। ਤੁਹਾਡੇ ਇਮੀਗ੍ਰੇਸ਼ਨ ਸਟੇਟਸ ਬਾਰੇ ਕਦੇ ਨਹੀਂ ਪੁੱਛਿਆ ਜਾਂਦਾ।",
    note: "ਆਮ ਜਾਣਕਾਰੀ, ਕਾਨੂੰਨੀ ਸਲਾਹ ਨਹੀਂ। ਇੱਕ ਸਥਾਨਕ ਵਲੰਟੀਅਰ ਵੱਲੋਂ; ਸਰਕਾਰੀ ਸੇਵਾ ਨਹੀਂ। AI ਦੀ ਮਦਦ ਨਾਲ ਅਨੁਵਾਦ, ਅਜੇ ਜਾਂਚ ਨਹੀਂ ਹੋਈ।",
  },
};

const DARI: LangPage = {
  id: "prs",
  htmlLang: "fa-AF",
  dir: "rtl",
  slug: "dari",
  locale: "fa-AF-u-ca-gregory",
  nativeName: "دری",
  englishName: "Dari",
  copy: {
    siteName: "کمک رایگان، کاونتی ستانیسلاس",
    title: "کمک رایگان در کاونتی ستانیسلاس، به زبان دری | Free help in Dari",
    description:
      "ابزارهای رایگان و خصوصی برای مردم کاونتی ستانیسلاس، کالیفرنیا، به زبان دری توضیح داده شده، و خط‌های تلفون رایگان که در آن می‌توانید ترجمان بخواهید.",
    heading: "کمک رایگان در کاونتی ستانیسلاس",
    lead: "ابزارهای ساده برای بل‌های شفاخانه، کرایه و اخطار تخلیهٔ خانه، معاشی که پرداخت نشده، کمک‌های دولتی، مهاجرت و کمک حقوقی رایگان. ابزارها به انگلیسی و اسپانیایی هستند. این صفحه آن‌ها را به دری توضیح می‌دهد و می‌گوید از کجا به زبان دری کمک بگیرید.",
    skip: "رفتن به محتوای اصلی",
    promiseLabel: "وعدهٔ ما",
    promise: [
      "رایگان، بدون ثبت نام",
      "آنچه می‌نویسید ذخیره نمی‌شود و با کسی شریک نمی‌شود",
      "هرگز دربارهٔ وضعیت مهاجرتی شما پرسیده نمی‌شود",
    ],
    aiTitle: "دربارهٔ این ترجمه",
    aiText:
      "این صفحه با کمک هوش مصنوعی (AI) ترجمه شده است. هنوز یک دری‌زبان آن را بررسی نکرده است. اگر چیزی اشتباه یا نامفهوم است، لطفاً با ایمیل به ما بگویید:",
    howTitle: "چطور استفاده کنید",
    how: [
      "ابزاری را که به سوال شما مربوط است از پایین انتخاب کنید.",
      "ابزار به انگلیسی (English) یا اسپانیایی (Español) باز می‌شود.",
      "برای خواندن کمک لازم دارید؟ از یک شخص مورد اعتماد بپرسید، یا به یکی از خط‌های رایگان پایین زنگ بزنید و ترجمان دری بخواهید.",
    ],
    sayTitle: "برای خواستن ترجمان، این جمله را به انگلیسی بگویید یا این صفحه را نشان دهید:",
    sayEn: "I need a Dari interpreter, please.",
    sayHint: "(آی نید اِ دری اینترپریتر، پلیز)",
    toolsTitle: "ابزارهای رایگان",
    inEnglish: "English",
    inSpanish: "Español",
    openIn: (tool, language) => `${tool}: به ${language}`,
    untranslated: "(هنوز به دری نیست)",
    linesTitle: "خط‌های تلفون رایگان با ترجمان یا به زبان فارسی",
    linesLead: "زنگ بزنید و به انگلیسی بگویید «Dari». سایت هر یک از این خط‌ها می‌گوید که ترجمان می‌دهد یا به فارسی جواب می‌دهد.",
    call: (n) => `به ${n} زنگ بزنید`,
    emergency: "در حالت اضطرار، یا اگر کسی در خطر است، به 911 زنگ بزنید.",
    redTitle: "کارت‌های سرخ رایگان: حقوق خود را بدانید",
    redText:
      "کارت سرخ به مأمور مهاجرت به انگلیسی نشان می‌دهد که شما از حقوق قانون اساسی خود استفاده می‌کنید. Immigrant Legal Resource Center (ILRC) آن را رایگان می‌دهد. یکی را در بکس پول و یکی را کنار دروازه نگه دارید.",
    flyerTitle: "ورقهٔ چاپی",
    flyerText: "ورقهٔ دری با کد QR برای مسجد، دفتر، کلینیک یا محل کار.",
    flyerLink: "ورقهٔ دری را باز و چاپ کنید",
    otherLangsTitle: "زبان‌های دیگر",
    sourcesTitle: "این معلومات از کجا آمده است",
    checked: (d) => `آخرین بررسی: ${d}.`,
    disclaimer: "این معلومات عمومی است، نه مشورهٔ حقوقی. برای مشوره دربارهٔ وضعیت خود، با یکی از دفترهای کمک حقوقی رایگان تماس بگیرید.",
    footerVolunteer: "ساخته شده توسط یک داوطلب محلی. این سایت دولتی نیست.",
    scan: "با کمرهٔ تلفون خود اسکن کنید",
    print: "این ورقه را چاپ کنید",
    back: "بازگشت به صفحهٔ دری",
    listen: "به این صفحه گوش دهید",
    listenStop: "توقف",
  },
  groups: {
    health: "صحت و کمک‌های دولتی",
    housing: "کرایه‌نشینان",
    work: "کار",
    immigration: "مهاجرت",
    legal: "کمک حقوقی",
  },
  tools: {
    medical: {
      name: "کمک با بل شفاخانه",
      summary: "تداوی رایگان یا ارزان در شفاخانه‌های کالیفرنیا، حتی بعد از آمدن بل. ببینید واجد شرایط هستید یا نه، و یک نامه برای درخواست کمک بگیرید.",
    },
    benefits: {
      name: "خانوادهٔ من کدام کمک‌ها را می‌تواند بگیرد؟",
      summary: "CalFresh (کمک غذایی)، Medi‑Cal (بیمهٔ صحی)، WIC، تخفیف برق و گاز و اعتبار مالیاتی: در حدود ۲ دقیقه ببینید.",
    },
    "medi-cal-work": {
      name: "قواعد جدید کار برای Medi‑Cal (سال ۲۰۲۷)",
      summary: "از سال ۲۰۲۷ بسیاری از بزرگسالان دارای Medi‑Cal باید ساعت کار یا درآمد نشان دهند. ببینید این قاعده شامل شما می‌شود یا معاف هستید.",
    },
    rent: {
      name: "آیا افزایش کرایهٔ من قانونی است؟",
      summary: "افزایش کرایه را با سقف کرایهٔ کالیفرنیا و قواعد اخطار مقایسه کنید.",
    },
    eviction: {
      name: "اخطار تخلیهٔ خانه گرفته‌اید؟",
      summary: "مهلت جواب دادن به اخطار یا اسناد محکمه را حساب کنید و زود کمک رایگان پیدا کنید.",
    },
    repairs: {
      name: "ترمیم خانه را بخواهید",
      summary: "یک نامهٔ رایگان (به انگلیسی یا اسپانیایی) برای درخواست ترمیم از صاحب خانه، و حقوق شما در زمان انتظار.",
    },
    deposit: {
      name: "پول گروی (دیپازیت) خود را پس بگیرید",
      summary: "از خانه رفته‌اید و دیپازیت خود را پس نگرفته‌اید؟ یک نامهٔ رایگان برای درخواست آن، و قاعدهٔ ۲۱ روز.",
    },
    mobile: {
      name: "کرایهٔ جای خانهٔ سیار (موبایل هوم)",
      summary: "خانهٔ سیار مال شماست و جای آن را کرایه می‌کنید؟ قواعد افزایش کرایهٔ جای آن در کاونتی ستانیسلاس.",
    },
    wages: {
      name: "معاش پرداخت‌نشده",
      summary: "اضافه‌کاری، حداقل معاش، وقفه‌های گرفته‌نشده و معاش آخر که دیر داده شده: ببینید چقدر طلب دارید و چطور آن را بخواهید.",
    },
    heat: {
      name: "گرمی در محل کار امروز",
      summary: "قواعد گرمی که کارفرما باید رعایت کند، در بیرون یا داخل، و اگر کسی مریض شد چه کنید.",
    },
    "know-your-rights": {
      name: "حقوق خود را در برابر مأموران مهاجرت بدانید",
      summary: "اگر مأموران مهاجرت به دروازهٔ شما آمدند یا شما را متوقف کردند چه کنید، پلان خانوادگی، و چطور کسی را که بازداشت شده پیدا کنید.",
    },
    citizenship: {
      name: "تمرین برای امتحان تابعیت امریکا",
      summary: "همهٔ ۱۲۸ سوال و جواب رسمی (به انگلیسی، مثل امتحان)، امتحان‌های تمرینی مثل امتحان واقعی، و صنف‌های رایگان در نزدیکی شما.",
    },
    legal: {
      name: "کمک حقوقی رایگان و ارزان",
      summary: "دفترهای کمک حقوقی نزدیک کاونتی ستانیسلاس، و چطور از «نوتاریو»های جعلی دوری کنید.",
    },
  },
  lines: [
    {
      id: "csa",
      name: "ادارهٔ خدمات اجتماعی کاونتی ستانیسلاس (CSA)",
      what: "CalFresh (کمک غذایی)، Medi‑Cal (بیمهٔ صحی) و CalWORKs (کمک نقدی). برای CalFresh و CalWORKs، کاونتی باید ترجمان رایگان بدهد و نباید از اطفال شما برای ترجمه استفاده کند.",
    },
    {
      id: "coveredFarsi",
      name: "کاورد کالیفرنیا (Covered California)، خط فارسی",
      what: "بیمهٔ صحی. این خط به زبان فارسی است.",
    },
    {
      id: "labor",
      name: "کمیشنر کار کالیفرنیا (Labor Commissioner)",
      what: "معاش پرداخت‌نشده، اضافه‌کاری، وقفه‌های استراحت و نان، و انتقام کارفرما بعد از شکایت. ترجمان تلفونی موجود است. وضعیت مهاجرتی شما مهم نیست.",
    },
    {
      id: "crla",
      name: "California Rural Legal Assistance (CRLA)، مودستو",
      what: "کمک حقوقی رایگان برای افراد کم‌درآمد: خانه و تخلیه، کار، کمک‌های دولتی، خانواده. CRLA ترجمان رایگان می‌دهد.",
    },
    {
      id: "court",
      name: "محکمهٔ عالی ستانیسلاس: دفتر ترجمانان",
      what: "ترجمان برای همه نوع قضیه. فورم INT-300 را پر کنید و ۳۰ روز پیش از تاریخ محکمه به دفتر کلرک بدهید.",
    },
  ],
  newcomers: {
    title: "سازمان‌هایی که به تازه‌واردان کمک می‌کنند",
    lead: "این سازمان‌ها به پناهندگان و تازه‌واردان کمک می‌کنند. سایت آن‌ها زبان دری را نام نمی‌برد؛ وقتی زنگ می‌زنید بپرسید که آیا کسی دری صحبت می‌کند.",
    items: [
      {
        id: "irc",
        name: "کمیتهٔ بین‌المللی نجات (IRC)، تورلاک",
        what: "کمک به پناهندگان، دارندگان ویزهٔ خاص مهاجرت (SIV) و کسانی که پارول بشردوستانه دارند: مسکن، صحت، کار، و کمک حقوقی مهاجرت.",
      },
      {
        id: "worldRelief",
        name: "ورلد ریلیف (World Relief)، مودستو",
        what: "اسکان مجدد پناهندگان، صنف‌های انگلیسی و خدمات حقوقی مهاجرت.",
      },
    ],
  },
  redCards: [
    { href: RED_CARD_PDFS.dari, label: "کارت سرخ به دری (PDF)", lang: "fa-AF", dir: "rtl" },
    { href: RED_CARD_PDFS.farsi, label: "کارت سرخ به فارسی (PDF)", lang: "fa", dir: "rtl" },
    { href: RED_CARD_PDFS.pashto, label: "سور کارت په پښتو (PDF)", lang: "ps", dir: "rtl" },
    { href: RED_CARD_PDFS.page, label: "ILRC: کارت سرخ به ۵۹ زبان", lang: "fa-AF", dir: "rtl" },
  ],
  flyer: {
    headline: "کمک رایگان در کاونتی ستانیسلاس",
    bullets: [
      "بل شفاخانه دارید؟ ببینید آیا تداوی رایگان یا ارزان می‌توانید بگیرید.",
      "کرایه زیاد شده یا اخطار تخلیه گرفته‌اید؟ قواعد و مهلت خود را ببینید.",
      "معاش شما پرداخت نشده؟ ببینید چقدر طلب دارید و چطور آن را بخواهید.",
      "کمک‌های دولتی برای خانواده، حقوق شما در برابر مأموران مهاجرت، و کمک حقوقی رایگان.",
      "خط‌های تلفون رایگان که در آن می‌توانید ترجمان دری بخواهید.",
    ],
    english: "Free help in Stanislaus County, explained in Dari",
    promise: "رایگان. آنچه می‌نویسید ذخیره نمی‌شود و شریک نمی‌شود. هرگز دربارهٔ وضعیت مهاجرتی شما پرسیده نمی‌شود.",
    note: "معلومات عمومی، نه مشورهٔ حقوقی. ساختهٔ یک داوطلب محلی؛ خدمت دولتی نیست. با کمک AI ترجمه شده و هنوز بررسی نشده است.",
  },
};

export const LANG_PAGES: readonly LangPage[] = [PUNJABI, DARI];

/** Page paths under the site base. Under help/ so "Save all pages" keeps them. */
export const langPath = (p: LangPage) => `help/${p.slug}/`;
export const langFlyerPath = (p: LangPage) => `help/flyers/${p.slug}/`;
