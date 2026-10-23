// Unit tests for the Immigration tab (no browser): the official civics list is
// complete and intact, the practice test stops like the real one, voices are
// chosen safely, and the rights page carries only verified phone numbers.
import { test, expect } from "@playwright/test";
import { CIVICS_QUESTIONS } from "../../frontend/src/help/civics-questions";
import { CIVICS_PARTS, FULL_TEST, SENIOR_TEST, pickQuestions, quizState, studyPool, type Mark } from "../../frontend/src/help/civics";
import { CIVICS_FACTS, CIVICS_HELP } from "../../frontend/src/help/civics-facts";
import { CIVICS_COPY } from "../../frontend/src/help/civics-copy";
import * as RIGHTS from "../../frontend/src/help/rights-facts";
import { RIGHTS_COPY } from "../../frontend/src/help/rights-copy";
import { pickVoice } from "../../frontend/src/help/voices";
import { upkeepItems } from "../../frontend/src/help/upkeep";

const marks = (right: number, wrong: number): Mark[] => [...Array<Mark>(right).fill("right"), ...Array<Mark>(wrong).fill("wrong")];

test.describe("the official civics list", () => {
  test("all 128 questions, numbered 1–128, each with answers, a topic and Spanish", () => {
    expect(CIVICS_QUESTIONS.map((q) => q.n)).toEqual(Array.from({ length: 128 }, (_, i) => i + 1));
    for (const q of CIVICS_QUESTIONS) {
      expect(q.a.length, `#${q.n}`).toBeGreaterThan(0);
      expect(CIVICS_PARTS, `#${q.n}`).toContain(q.part);
      expect(q.es?.q.length ?? 0, `#${q.n}`).toBeGreaterThan(5);
      // A study translation keeps every accepted answer, one for one.
      if (q.es && !q.es.official) expect(q.es.a.length, `#${q.n}`).toBe(q.a.length);
    }
    expect(CIVICS_QUESTIONS.filter((q) => q.es?.official).map((q) => q.n)).toEqual([23, 29, 30, 38, 39, 57, 61]);
  });

  test("exactly USCIS's 20 starred (65/20) questions", () => {
    expect(studyPool(CIVICS_QUESTIONS, true).map((q) => q.n)).toEqual([2, 7, 12, 20, 30, 36, 38, 39, 44, 52, 61, 66, 74, 78, 86, 94, 113, 115, 121, 126]);
  });

  test("spot-check the wording against USCIS M-1778", () => {
    const q = (n: number) => CIVICS_QUESTIONS[n - 1]!;
    expect(q(1).q).toBe("What is the form of government of the United States?");
    expect(q(1).a).toEqual(["Republic", "Constitution-based federal republic", "Representative democracy"]);
    expect(q(62).now).toEqual(["Sacramento"]);
  });

  test("answers that change carry today's answer, and why it may change", () => {
    const dynamic = CIVICS_QUESTIONS.filter((q) => q.now).map((q) => q.n);
    expect(dynamic).toEqual([23, 29, 30, 38, 39, 57, 61, 62]);
    for (const n of [29, 30, 61]) expect(CIVICS_QUESTIONS[n - 1]!.note, `#${n}`).toBeTruthy();
  });
});

test.describe("practice test (the officer's stop rule)", () => {
  test("full test: stop at 12 right (pass), at 9 wrong (fail), or after 20", () => {
    expect(quizState(marks(11, 8), FULL_TEST)).toEqual({ right: 11, wrong: 8, done: false, passed: false });
    expect(quizState(marks(12, 0), FULL_TEST)).toMatchObject({ done: true, passed: true });
    expect(quizState(marks(3, 9), FULL_TEST)).toMatchObject({ done: true, passed: false });
    expect(quizState(marks(11, 8), FULL_TEST).done).toBe(false);
    expect(quizState(marks(12, 8), FULL_TEST)).toMatchObject({ done: true, passed: true });
  });

  test("65/20: 10 questions, 6 right to pass, 5 wrong to fail", () => {
    expect(quizState(marks(6, 0), SENIOR_TEST)).toMatchObject({ done: true, passed: true });
    expect(quizState(marks(5, 4), SENIOR_TEST)).toMatchObject({ done: false });
    expect(quizState(marks(0, 5), SENIOR_TEST)).toMatchObject({ done: true, passed: false });
  });

  test("questions are drawn without repeats, from the chosen pool", () => {
    const drawn = pickQuestions(CIVICS_QUESTIONS, FULL_TEST.asked);
    expect(new Set(drawn).size).toBe(20);
    const seniors = pickQuestions(studyPool(CIVICS_QUESTIONS, true), 10);
    expect(seniors.every((n) => CIVICS_QUESTIONS[n - 1]!.star)).toBe(true);
    // Asking for more than the pool has gives the whole pool, once each.
    expect(new Set(pickQuestions(studyPool(CIVICS_QUESTIONS, true), 50)).size).toBe(20);
    // Deterministic with a fixed random source.
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const a = pickQuestions(CIVICS_QUESTIONS, 20, rnd);
    seed = 1;
    expect(pickQuestions(CIVICS_QUESTIONS, 20, rnd)).toEqual(a);
  });
});

test("read-aloud voice: on-device only, no joke voices, US English first", () => {
  const v = (name: string, lang: string, localService: boolean, def = false) => ({ name, lang, localService, default: def });
  expect(pickVoice([v("Cloud", "en-US", false)], "en")).toBeNull();
  expect(pickVoice([v("Bad News", "en-US", true), v("Daniel", "en-GB", true)], "en")?.name).toBe("Daniel");
  expect(pickVoice([v("Daniel", "en-GB", true), v("Samantha", "en-US", true)], "en")?.name).toBe("Samantha");
  expect(pickVoice([v("Paulina", "es-MX", true)], "en")).toBeNull();
});

test("the rights page lists only phone numbers verified in the research", () => {
  // From ~/dev/outreach-help-2026-10/research/know-your-rights.md ("Use only…") and the cited fact entries.
  const verified = new Set([
    "5592060151", // Valley Watch Network rapid response
    "8883514024", // ICE detention information line (DRIL)
    "8008987180", // EOIR immigration court status line
    "4153658800", // ICE San Francisco field office
    "6617922731", "6617923492", "6618591028", "7604918104", "7604918150", // detention centers (ice.gov)
    "8008703676", // USCIS forms line
    "8008841684", // CA Civil Rights Department
  ]);
  const text = JSON.stringify(RIGHTS);
  const found = [...text.matchAll(/(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g)].map((m) => m[1]! + m[2]! + m[3]!);
  expect(found.length).toBeGreaterThan(5);
  for (const n of found) expect(verified, n).toContain(n);
});

test("rights and citizenship facts are cited and complete in both languages", () => {
  for (const [name, list] of Object.entries({ ...RIGHTS.RIGHTS_FACTS, test: CIVICS_FACTS.test, fees: CIVICS_FACTS.fees })) {
    for (const f of list as { id: string; cite: string; en: string; es: string }[]) {
      expect(f.cite.length, `${name}/${f.id}`).toBeGreaterThan(2);
      expect(f.en.length, `${name}/${f.id}`).toBeGreaterThan(20);
      expect(f.es.length, `${name}/${f.id}`).toBeGreaterThan(20);
    }
  }
  for (const h of CIVICS_HELP) expect(h.url).toMatch(/^https:\/\//);
  const keys = (o: object) => Object.keys(o).sort();
  expect(keys(RIGHTS_COPY.es)).toEqual(keys(RIGHTS_COPY.en));
  expect(keys(CIVICS_COPY.es)).toEqual(keys(CIVICS_COPY.en));
  expect(keys(CIVICS_COPY.es.parts)).toEqual(keys(CIVICS_COPY.en.parts));
});

test("upkeep tracks the monthly rights re-check and the January officials update", () => {
  const ids = upkeepItems().map((i) => i.id);
  expect(ids).toContain("rights-monthly");
  expect(ids).toContain("civics-officials");
});
