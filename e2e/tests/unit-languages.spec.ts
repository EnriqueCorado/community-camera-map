// Unit tests for the Punjabi and Dari pages (no browser): every string is
// really in that language's script, every tool has a translation, and the
// pages carry only phone numbers whose own sites state language help.
import { test, expect } from "@playwright/test";
import { AI_NOTE_EN, LANG_PAGES, langPath, langFlyerPath, type LangPage } from "../../frontend/src/landing/languages";
import { TOOLS, GROUPS } from "../../frontend/src/landing/tools";
import { LANGUAGES_CHECKED, LANGUAGES_REVIEW_BY, LINES, RED_CARD_PDFS, languageSources } from "../../frontend/src/help/languages-facts";
import { REPORT_EMAIL } from "../../frontend/src/help/report";
import { upkeepItems } from "../../frontend/src/help/upkeep";

const SCRIPT: Record<LangPage["id"], RegExp> = { pa: /[਀-੿]/, prs: /[؀-ۿ]/ };
/** Copy that is English on purpose (said or shown to an English speaker, or a link to an English/Spanish page). */
const ENGLISH_ON_PURPOSE = new Set(["sayEn", "inEnglish", "inSpanish"]);

const TRANSLATED_AT_LAUNCH = [
  "medical", "benefits", "medi-cal-work", "rent", "eviction", "repairs", "deposit", "mobile",
  "wages", "heat", "know-your-rights", "citizenship", "legal",
];

const strings = (o: unknown): string[] =>
  typeof o === "string" ? [o] : Array.isArray(o) ? o.flatMap(strings) : o && typeof o === "object" ? Object.values(o).flatMap(strings) : [];

test("two pages, Punjabi (left to right) and Dari (right to left), with their own paths", () => {
  expect(LANG_PAGES.map((p) => [p.id, p.htmlLang, p.dir, langPath(p), langFlyerPath(p)])).toEqual([
    ["pa", "pa", "ltr", "help/punjabi/", "help/flyers/punjabi/"],
    ["prs", "fa-AF", "rtl", "help/dari/", "help/flyers/dari/"],
  ]);
});

for (const page of LANG_PAGES) {
  test(`${page.englishName}: every visible string is written in its script`, () => {
    const re = SCRIPT[page.id];
    for (const [key, value] of Object.entries(page.copy)) {
      if (ENGLISH_ON_PURPOSE.has(key)) continue;
      const text = typeof value === "function" ? value("X", "Y") : value;
      for (const s of strings(text)) expect(s, `${page.id}.${key}`).toMatch(re);
    }
    for (const s of strings([page.groups, page.tools, page.lines.map((l) => [l.name, l.what]), page.newcomers ? [page.newcomers.title, page.newcomers.lead, page.newcomers.items.map((l) => [l.name, l.what])] : [], page.flyer.headline, page.flyer.bullets, page.flyer.promise, page.flyer.note]))
      expect(s).toMatch(re);
    expect(page.copy.sayEn).toBe(`I need a ${page.englishName} interpreter, please.`);
  });

  test(`${page.englishName}: every tool and group has a translation, and none is stale`, () => {
    // No stale entries; the 13 tools that existed when these were written are all translated.
    // A tool added later shows its English name and "(not yet in …)" until someone translates it.
    const ids = TOOLS.map((t) => t.id as string);
    for (const id of Object.keys(page.tools)) expect(ids, `${page.id}: stale "${id}"`).toContain(id);
    for (const id of Object.keys(page.groups)) expect(GROUPS.map((g) => g.id as string)).toContain(id);
    expect(Object.keys(page.tools).sort()).toEqual(TRANSLATED_AT_LAUNCH.slice().sort());
    // Translations name the same programs the English does.
    const toPersianDigits = (s: string) => (page.id === "prs" ? s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!) : s);
    for (const t of TOOLS) {
      const tr = page.tools[t.id];
      if (!tr) continue;
      for (const term of ["CalFresh", "WIC", "2027", "128", "21"]) {
        if (t.summary.en.includes(term)) expect(tr.summary, `${page.id}/${t.id}`).toContain(toPersianDigits(term));
      }
    }
  });
}

test("Dari uses Persian letters (ی ک), not their Arabic look-alikes (ي ك)", () => {
  const dari = LANG_PAGES.find((p) => p.id === "prs")!;
  for (const s of strings([dari.copy, dari.groups, dari.tools, dari.lines, dari.newcomers, dari.flyer, dari.redCards.map((r) => r.label)])) {
    expect(s).not.toMatch(/[يك]/);
  }
});

test("only phone lines whose own pages state language help, plus newcomer agencies kept apart", () => {
  const pa = LANG_PAGES.find((p) => p.id === "pa")!;
  const dari = LANG_PAGES.find((p) => p.id === "prs")!;
  // Interpreter (or Farsi-speaking) lines; IRC and World Relief name no language, so they're never in `lines`.
  expect(pa.lines.map((l) => l.id).sort()).toEqual(["court", "crla", "csa", "labor"]);
  expect(dari.lines.map((l) => l.id).sort()).toEqual(["court", "coveredFarsi", "crla", "csa", "labor"]);
  expect(dari.newcomers?.items.map((l) => l.id).sort()).toEqual(["irc", "worldRelief"]);
  expect(pa.newcomers).toBeUndefined();
  const verified = new Set(["8335264636", "2095773811", "8776520734", "2095303247", "8009218879", "2096672378", "2094912712"]);
  for (const line of Object.values(LINES)) {
    expect(verified).toContain(line.phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""));
    expect(line.url).toMatch(/^https:\/\//);
  }
  // Every listed line is cited in the page's sources.
  for (const page of LANG_PAGES) {
    const urls = languageSources([...page.lines, ...(page.newcomers?.items ?? [])].map((l) => l.id)).map((s) => s.url);
    for (const l of [...page.lines, ...(page.newcomers?.items ?? [])]) expect(urls).toContain(LINES[l.id].url);
  }
});

test("red cards link to ILRC's own PDFs in the page's languages", () => {
  for (const url of Object.values(RED_CARD_PDFS)) expect(url).toMatch(/^https:\/\/www\.ilrc\.org\//);
  expect(LANG_PAGES[0]!.redCards.map((r) => r.href)).toContain(RED_CARD_PDFS.punjabi);
  expect(LANG_PAGES[1]!.redCards.map((r) => r.href)).toEqual(expect.arrayContaining([RED_CARD_PDFS.dari, RED_CARD_PDFS.farsi, RED_CARD_PDFS.pashto]));
});

test("the AI-translation note is honest and in English too, with a way to send corrections", () => {
  expect(REPORT_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]+$/);
  expect(AI_NOTE_EN("Punjabi")).toMatch(/AI help.*not yet been checked by a native Punjabi speaker/);
  for (const p of LANG_PAGES) expect(p.flyer.note).toMatch(/AI/);
});

test("upkeep: a native-speaker review date and a yearly re-check of the lines", () => {
  const items = upkeepItems();
  expect(items.find((i) => i.id === "languages-review")?.due).toBe(LANGUAGES_REVIEW_BY);
  expect(items.map((i) => i.id)).toContain("yearly-languages");
  expect(LANGUAGES_REVIEW_BY > LANGUAGES_CHECKED).toBe(true);
});
