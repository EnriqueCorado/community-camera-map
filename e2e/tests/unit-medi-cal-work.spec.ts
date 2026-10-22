// Unit tests for the Medi-Cal work rules tool (no browser): who the rule
// doesn't cover, exemptions (and the "medically frail" maybe), each way to
// meet it with its exact edge ($580, 80 hours, credits), parsing, and that
// every fact and every string exists in both languages.
import { test, expect } from "@playwright/test";
import { creditHours, parseAmount, shownHours, totalHours, workRules, type WorkAnswers } from "../../frontend/src/help/medi-cal-work";
import { MCW, MCW_CONTACTS, MCW_FACTS, MCW_SOURCES } from "../../frontend/src/help/medi-cal-work-facts";
import { MEDI_CAL_WORK_COPY } from "../../frontend/src/help/medi-cal-work-copy";

/** Someone 19–64 with full Medi-Cal, no exemptions, and nothing else yet. */
function a(over: Partial<WorkAnswers> = {}): WorkAnswers {
  return {
    coverage: "full",
    age: "19to64",
    exempt: [],
    noneApply: true,
    hardship: [],
    workHours: null,
    volunteerHours: null,
    programHours: null,
    school: null,
    credits: null,
    classHours: null,
    incomeCents: null,
    seasonal: false,
    seasonalAvgCents: null,
    ...over,
  };
}

test.describe("who the rule covers", () => {
  test("restricted Medi-Cal is never covered, even before the age is given", () => {
    expect(workRules(a({ coverage: "restricted", age: null }))).toEqual({ kind: "not-covered", reason: "restricted" });
  });

  test("needs Medi-Cal type and age before anything else", () => {
    expect(workRules(a({ coverage: null }))).toEqual({ kind: "incomplete" });
    expect(workRules(a({ age: null }))).toEqual({ kind: "incomplete" });
  });

  test("only ages 19 to 64", () => {
    expect(workRules(a({ age: "under19" }))).toEqual({ kind: "not-covered", reason: "under19" });
    expect(workRules(a({ age: "65plus" }))).toEqual({ kind: "not-covered", reason: "65plus" });
  });

  test("Medicare, SSI or a non-income Medi-Cal program means the rule doesn't apply, whatever else is checked", () => {
    expect(workRules(a({ exempt: ["child13", "medicare"] }))).toEqual({ kind: "not-covered", reason: "medicare" });
    expect(workRules(a({ exempt: ["ssi"] }))).toEqual({ kind: "not-covered", reason: "ssi" });
    expect(workRules(a({ exempt: ["otherGroup"] }))).toEqual({ kind: "not-covered", reason: "otherGroup" });
  });

  test("“Not sure” of the Medi-Cal type is treated as covered (the safe answer)", () => {
    expect(workRules(a({ coverage: "unsure", incomeCents: 60_000 })).kind).toBe("meets");
  });
});

test.describe("exemptions", () => {
  test("any listed group is exempt; a health condition alone is only a maybe", () => {
    expect(workRules(a({ exempt: ["child13"] }))).toEqual({ kind: "exempt", reasons: ["child13"], maybe: false, activity: null });
    expect(workRules(a({ exempt: ["frail"] }))).toEqual({ kind: "exempt", reasons: ["frail"], maybe: true, activity: null });
    expect(workRules(a({ exempt: ["frail", "pregnant"] }))).toEqual({ kind: "exempt", reasons: ["frail", "pregnant"], maybe: false, activity: null });
  });

  test("a 'maybe' still shows how the month compares, in case the county disagrees", () => {
    expect(workRules(a({ exempt: ["frail"], noneApply: false, workHours: 30 }))).toMatchObject({
      kind: "exempt",
      maybe: true,
      activity: { kind: "short", hours: 30, missingHours: 50 },
    });
    // A definite exemption doesn't ask about hours at all.
    expect(workRules(a({ exempt: ["pregnant"], workHours: 30 }))).toMatchObject({ kind: "exempt", activity: null });
  });

  test("the exemption question must be answered (an item, or None of these)", () => {
    expect(workRules(a({ noneApply: false }))).toEqual({ kind: "incomplete" });
  });
});

test.describe("meeting the rule", () => {
  test("half-time school counts on its own", () => {
    expect(workRules(a({ school: "half" }))).toMatchObject({ kind: "meets", by: "school" });
  });

  test("$580 of income in a month counts, whatever the hours; one cent less doesn't", () => {
    expect(MCW.incomeCents).toBe(80 * 725); // 80 × the $7.25 federal minimum wage
    expect(workRules(a({ incomeCents: 58_000, workHours: 10 }))).toMatchObject({ kind: "meets", by: "income" });
    expect(workRules(a({ incomeCents: 57_999, workHours: 10 }))).toEqual({ kind: "short", hours: 10, missingHours: 70, missingCents: 1, hardship: [] });
  });

  test("seasonal workers count their 6-month average, only if seasonal", () => {
    expect(workRules(a({ seasonal: true, incomeCents: 0, seasonalAvgCents: 60_000 }))).toMatchObject({ kind: "meets", by: "seasonal" });
    // Not seasonal: the 6-month average doesn't count (and alone isn't an answer).
    expect(workRules(a({ seasonal: false, seasonalAvgCents: 60_000 }))).toEqual({ kind: "incomplete" });
    expect(workRules(a({ seasonal: false, seasonalAvgCents: 60_000, workHours: 10 }))).toMatchObject({ kind: "short" });
    expect(workRules(a({ seasonal: true, incomeCents: 20_000, seasonalAvgCents: 50_000 }))).toMatchObject({ kind: "short", missingCents: 8_000 });
  });

  test("work, volunteering and job training add up to 80", () => {
    expect(workRules(a({ workHours: 40, volunteerHours: 20, programHours: 20 }))).toMatchObject({ kind: "meets", by: "hours", hours: 80 });
    expect(workRules(a({ workHours: 40, volunteerHours: 20, programHours: 19 }))).toEqual({ kind: "short", hours: 79, missingHours: 1, missingCents: null, hardship: [] });
  });

  test("never rounds up into compliance: 79.5 hours is short by 1", () => {
    expect(workRules(a({ workHours: 79.5 }))).toEqual({ kind: "short", hours: 79, missingHours: 1, missingCents: null, hardship: [] });
    expect(shownHours(79.99)).toBe(79);
    expect(shownHours(80)).toBe(80);
  });

  test("school less than half-time adds 3 × 4.33 hours a month per credit, or class hours", () => {
    expect(Math.round(creditHours(1))).toBe(13);
    expect(creditHours(6)).toBeCloseTo(77.94, 2);
    // 6 credits (77.94) + 2 hours of work = 79.94: still short, by 1.
    expect(workRules(a({ school: "less", credits: 6, workHours: 2 }))).toMatchObject({ kind: "short", hours: 79, missingHours: 1 });
    expect(workRules(a({ school: "less", credits: 6, workHours: 3 }))).toMatchObject({ kind: "meets", by: "hours", hours: 80 });
    // Classes without credits: their hours count directly.
    expect(workRules(a({ school: "less", classHours: 40, workHours: 40 }))).toMatchObject({ kind: "meets", hours: 80 });
    // Credits and class hours only count when the person said they're in school less than half-time.
    expect(totalHours({ workHours: 2, volunteerHours: null, programHours: null, school: "no", credits: 6, classHours: 10 })).toBe(2);
  });

  test("hardships asked for are passed through to the result", () => {
    expect(workRules(a({ workHours: 20, hardship: ["hospital"] }))).toMatchObject({ kind: "short", hardship: ["hospital"] });
  });

  test("no verdict until something about the month is entered", () => {
    expect(workRules(a())).toEqual({ kind: "incomplete" });
    expect(workRules(a({ school: "no" }))).toEqual({ kind: "short", hours: 0, missingHours: 80, missingCents: null, hardship: [] });
    // A seasonal box alone (no average yet) isn't an answer.
    expect(workRules(a({ seasonal: true }))).toEqual({ kind: "incomplete" });
  });
});

test("hours and credits parse like people type them", () => {
  expect(parseAmount("20", 744)).toBe(20);
  expect(parseAmount(" 12.5 ", 744)).toBe(12.5);
  expect(parseAmount("12,5", 744)).toBe(12.5); // Spanish decimal comma
  expect(parseAmount("", 744)).toBeNull();
  expect(parseAmount("abc", 744)).toBeNull();
  expect(parseAmount("-5", 744)).toBeNull();
  expect(parseAmount("800", 744)).toBeNull(); // more hours than a month has
  expect(parseAmount("41", 40)).toBeNull();
});

test("every fact is cited and in both languages; sources and contacts are https", () => {
  for (const [group, facts] of Object.entries(MCW_FACTS)) {
    if (!Array.isArray(facts)) continue;
    for (const f of facts) {
      expect(f.cite.length, `${group}/${f.id}`).toBeGreaterThan(3);
      expect(f.en.length, `${group}/${f.id}`).toBeGreaterThan(20);
      expect(f.es.length, `${group}/${f.id}`).toBeGreaterThan(20);
    }
  }
  for (const s of MCW_SOURCES) expect(s.url).toMatch(/^https:\/\//);
  for (const c of Object.values(MCW_CONTACTS)) if ("url" in c) expect(c.url).toMatch(/^https:\/\//);
  // The one figure people act on is the same everywhere it's written.
  for (const lang of ["en", "es"] as const) {
    expect(MCW_FACTS.rule.find((f) => f.id === "income")![lang]).toContain("$580");
    expect(MEDI_CAL_WORK_COPY[lang].lead).toContain("$580");
    expect(MEDI_CAL_WORK_COPY[lang].shortText(10, 70, MCW.hours)).toContain("80");
  }
});

test("copy has the same keys in both languages", () => {
  const keys = (o: object): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
  expect(keys(MEDI_CAL_WORK_COPY.es)).toEqual(keys(MEDI_CAL_WORK_COPY.en));
  expect(MEDI_CAL_WORK_COPY.es.todo.length).toBe(MEDI_CAL_WORK_COPY.en.todo.length);
  expect(MEDI_CAL_WORK_COPY.es.shortIdeas.length).toBe(MEDI_CAL_WORK_COPY.en.shortIdeas.length);
});
