// Wording for the citizenship test tool, per language. The questions are
// USCIS's (civics-questions.ts); rules and help in civics-facts.ts.
import type { Lang } from "../i18n";
import type { CivicsPart } from "./civics";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface CivicsCopy {
  title: string;
  lead: string;
  private: string;
  modeLabel: string;
  modeStudy: string;
  modePractice: string;
  seniors: string;
  seniorsHint: string;
  showSpanish: string;
  part: string;
  allParts: string;
  parts: Record<CivicsPart, string>;
  count: Fn<[number]>;
  showAnswer: string;
  answers: string;
  today: string;
  todayAsOf: Fn<[string]>;
  spanishOfficial: string;
  spanishStudy: string;
  starred: string;
  listen: Fn<[number]>;
  start: Fn<[number, number]>;
  questionOf: Fn<[number, number]>;
  score: Fn<[number, number]>;
  gotIt: string;
  missedIt: string;
  selfCheck: string;
  passed: Fn<[number]>;
  failed: Fn<[number]>;
  review: string;
  again: string;
  testTitle: string;
  englishTitle: string;
  readingWords: string;
  writingWords: string;
  test2008: string;
  test2008Es: string;
  updates: string;
  n400: string;
  feesTitle: string;
  helpTitle: string;
  credit: string;
}

const en: CivicsCopy = {
  title: "U.S. citizenship test practice",
  lead: "Study all 128 official civics questions and answers, and take practice tests that work like the real one. The questions and answers are USCIS’s own words. Free, with no sign-up.",
  private: "Your answers stay on this device and are erased when you leave this tool.",
  modeLabel: "Choose how to study",
  modeStudy: "Study the questions",
  modePractice: "Practice test",
  seniors: "Only the 20 questions for age 65+ with 20 years as a green card holder (65/20)",
  seniorsHint: "If that’s you, these are the only questions you need to study.",
  showSpanish: "Show Spanish to help me study",
  part: "Topic",
  allParts: "All topics",
  parts: {
    "gov-principles": "Government: principles",
    "gov-system": "Government: system of government",
    "gov-rights": "Government: rights and responsibilities",
    "history-colonial": "History: colonial period and independence",
    "history-1800s": "History: the 1800s",
    "history-recent": "History: recent history",
    symbols: "Symbols",
    holidays: "Holidays",
  },
  count: (n) => `${n} questions`,
  showAnswer: "Show the answer",
  answers: "Answers USCIS accepts (you need only one unless the question asks for more):",
  today: "Today’s answer in Stanislaus County:",
  todayAsOf: (d) => `as of ${d}`,
  spanishOfficial: "Official USCIS Spanish",
  spanishStudy: "Unofficial Spanish, to help you study (the test is in English)",
  starred: "★ 65/20 question",
  listen: (n) => `Listen to question ${n} in English`,
  start: (asked, pass) => `Start a practice test (up to ${asked} questions; ${pass} right to pass)`,
  questionOf: (i, max) => `Question ${i} of up to ${max}`,
  score: (right, wrong) => `${right} right, ${wrong} wrong`,
  gotIt: "I got it right",
  missedIt: "I missed it",
  selfCheck: "Say your answer out loud, like at the interview. Then check it and mark it.",
  passed: (n) => `You passed this practice test, with ${n} right. Keep practicing until it feels easy.`,
  failed: (n) => `Not this time: ${n} wrong. Study the ones you missed and try again.`,
  review: "Questions to review",
  again: "Take another practice test",
  testTitle: "How the test works",
  englishTitle: "The English test: official word lists",
  readingWords: "Reading words (PDF)",
  writingWords: "Writing words (PDF)",
  test2008: "Filed before October 20, 2025? The 2008 test’s 100 questions (PDF)",
  test2008Es: "the same in Spanish (USCIS, Word)",
  updates: "USCIS: current answers for questions that change (test updates)",
  n400: "USCIS: Form N-400, fees and how to apply",
  feesTitle: "What it costs to apply",
  helpTitle: "Free classes and help near you",
  credit: "Questions and answers: U.S. Citizenship and Immigration Services (USCIS), 2025 civics test. This site isn’t connected to USCIS.",
};

const es: CivicsCopy = {
  title: "Práctica para el examen de ciudadanía de EE. UU.",
  lead: "Estudie las 128 preguntas y respuestas oficiales de civismo, y haga exámenes de práctica que funcionan como el de verdad. Las preguntas y respuestas son las palabras de USCIS. Gratis y sin registrarse.",
  private: "Sus respuestas se quedan en este aparato y se borran al salir de esta herramienta.",
  modeLabel: "Elija cómo estudiar",
  modeStudy: "Estudiar las preguntas",
  modePractice: "Examen de práctica",
  seniors: "Solo las 20 preguntas para personas de 65 años o más con 20 años con green card (65/20)",
  seniorsHint: "Si es su caso, son las únicas preguntas que necesita estudiar.",
  showSpanish: "Mostrar español para ayudarme a estudiar",
  part: "Tema",
  allParts: "Todos los temas",
  parts: {
    "gov-principles": "Gobierno: principios",
    "gov-system": "Gobierno: sistema de gobierno",
    "gov-rights": "Gobierno: derechos y responsabilidades",
    "history-colonial": "Historia: la época colonial y la independencia",
    "history-1800s": "Historia: el siglo XIX (1800s)",
    "history-recent": "Historia: historia reciente",
    symbols: "Símbolos",
    holidays: "Días festivos",
  },
  count: (n) => `${n} preguntas`,
  showAnswer: "Ver la respuesta",
  answers: "Respuestas que acepta USCIS (solo necesita una, a menos que la pregunta pida más):",
  today: "Respuesta de hoy en el condado de Stanislaus:",
  todayAsOf: (d) => `al ${d}`,
  spanishOfficial: "Español oficial de USCIS",
  spanishStudy: "Español no oficial, para ayudarle a estudiar (el examen es en inglés)",
  starred: "★ pregunta 65/20",
  listen: (n) => `Escuchar la pregunta ${n} en inglés`,
  start: (asked, pass) => `Empezar un examen de práctica (hasta ${asked} preguntas; ${pass} correctas para pasar)`,
  questionOf: (i, max) => `Pregunta ${i} de hasta ${max}`,
  score: (right, wrong) => `${right} bien, ${wrong} mal`,
  gotIt: "La contesté bien",
  missedIt: "La contesté mal",
  selfCheck: "Diga su respuesta en voz alta, como en la entrevista. Luego revísela y márquela.",
  passed: (n) => `Pasó este examen de práctica, con ${n} correctas. Siga practicando hasta que le sea fácil.`,
  failed: (n) => `Esta vez no: ${n} incorrectas. Estudie las que falló e intente otra vez.`,
  review: "Preguntas para repasar",
  again: "Hacer otro examen de práctica",
  testTitle: "Cómo funciona el examen",
  englishTitle: "El examen de inglés: listas oficiales de palabras",
  readingWords: "Palabras para leer (PDF)",
  writingWords: "Palabras para escribir (PDF)",
  test2008: "¿Presentó antes del 20 de octubre de 2025? Las 100 preguntas del examen de 2008 (PDF)",
  test2008Es: "las mismas en español (USCIS, Word)",
  updates: "USCIS: respuestas actuales de las preguntas que cambian (en inglés)",
  n400: "USCIS: formulario N-400, cuotas y cómo solicitar (en inglés)",
  feesTitle: "Cuánto cuesta solicitar",
  helpTitle: "Clases y ayuda gratis cerca de usted",
  credit: "Preguntas y respuestas: Servicio de Ciudadanía e Inmigración de EE. UU. (USCIS), examen de civismo de 2025. Este sitio no tiene relación con USCIS.",
};

export const CIVICS_COPY: Record<Lang, CivicsCopy> = { en, es };
