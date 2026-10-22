// Citizenship civics test practice: types, the test's rules, and the practice
// quiz. Pure (no React, no storage). Questions in civics-questions.ts (official
// USCIS 2025 list); rules, fees and local help, with sources, in civics-facts.ts.

export type CivicsPart =
  | "gov-principles"
  | "gov-system"
  | "gov-rights"
  | "history-colonial"
  | "history-1800s"
  | "history-recent"
  | "symbols"
  | "holidays";

export const CIVICS_PARTS: readonly CivicsPart[] = [
  "gov-principles",
  "gov-system",
  "gov-rights",
  "history-colonial",
  "history-1800s",
  "history-recent",
  "symbols",
  "holidays",
];

export interface CivicsQuestion {
  n: number;
  part: CivicsPart;
  /** USCIS wording, exactly. */
  q: string;
  /** Every answer USCIS accepts, exactly. */
  a: readonly string[];
  /** One of the 20 questions for the 65/20 special consideration. */
  star?: boolean;
  /** Today's answer, where it depends on who serves or where you live. */
  now?: readonly string[];
  /** Why `now` may change soon. */
  note?: "representative" | "speaker" | "governor";
  /** Spanish: USCIS's official wording, or an unofficial study translation. */
  es?: { q: string; a: readonly string[]; official: boolean };
}

/** How the officer runs the test (USCIS Policy Manual 12 E.2; PA-2025-24). */
export interface TestRules {
  /** Most questions asked. */
  asked: number;
  /** Right answers that pass (the officer stops there). */
  pass: number;
  /** Wrong answers that fail (the officer stops there). */
  fail: number;
}

export const FULL_TEST: TestRules = { asked: 20, pass: 12, fail: 9 };
/** Age 65+ with 20+ years as a permanent resident: 10 of the 20 starred questions. */
export const SENIOR_TEST: TestRules = { asked: 10, pass: 6, fail: 5 };

export type Mark = "right" | "wrong";

export interface QuizState {
  right: number;
  wrong: number;
  /** The officer would stop now. */
  done: boolean;
  passed: boolean;
}

/** Where a practice test stands after these answers, by the officer's stop rule. */
export function quizState(marks: readonly Mark[], rules: TestRules): QuizState {
  const right = marks.filter((m) => m === "right").length;
  const wrong = marks.length - right;
  const done = right >= rules.pass || wrong >= rules.fail || marks.length >= rules.asked;
  return { right, wrong, done, passed: right >= rules.pass };
}

/** `count` different question numbers from `pool`, in random order. */
export function pickQuestions(pool: readonly CivicsQuestion[], count: number, random: () => number = Math.random): number[] {
  const ns = pool.map((q) => q.n);
  for (let i = ns.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ns[i], ns[j]] = [ns[j]!, ns[i]!];
  }
  return ns.slice(0, Math.min(count, ns.length));
}

/** The questions to study: everything, or only the 65/20 starred ones. */
export const studyPool = (all: readonly CivicsQuestion[], seniorsOnly: boolean) => (seniorsOnly ? all.filter((q) => q.star) : all);
