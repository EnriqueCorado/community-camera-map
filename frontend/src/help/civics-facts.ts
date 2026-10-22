// Facts for the citizenship test tool, with sources. Researched 2026-10-22
// from uscis.gov (the 2025 civics test, Policy Manual Vol. 12 Part E, N-400
// fees) and each local program's own site. Archive:
// ~/dev/outreach-help-2026-10/research/civics.{json,md}.
//
// RE-CHECK by CIVICS_OFFICIALS_RECHECK: California's governor changes on
// 2027-01-04; the Speaker may change and Stanislaus County's congressional
// districts change on 2027-01-03 (Prop. 50 map). Update `now` in
// make_civics.py, regenerate, and move the date. Fees: each USCIS fee rule.
import type { Fact } from "./facts";
import type { Bilingual } from "./letter-types";
import type { SourceRef } from "../components/help/ui";

export const CIVICS_CHECKED = "2026-10-22";
export const CIVICS_OFFICIALS_RECHECK = "2027-01-04";

const TEST_PAGE = "https://www.uscis.gov/citizenship-resource-center/naturalization-test-and-study-resources/2025-civics-test";
const LIST_PDF = "https://www.uscis.gov/sites/default/files/document/questions-and-answers/2025-Civics-Test-128-Questions-and-Answers.pdf";
const POLICY = "https://www.uscis.gov/policy-manual/volume-12-part-e-chapter-2";

export const CIVICS_LINKS = {
  updates: "https://www.uscis.gov/citizenship/testupdates",
  house: "https://www.house.gov/representatives/find-your-representative",
  test2008: "https://www.uscis.gov/sites/default/files/document/questions-and-answers/OoC_100_Questions_2008_Civics_Test_V1.pdf",
  test2008Es: "https://www.uscis.gov/sites/default/files/document/questions-and-answers/100q_Spanish_2021_SPA.docx",
  reading: "https://www.uscis.gov/sites/default/files/document/guides/reading_vocab.pdf",
  writing: "https://www.uscis.gov/sites/default/files/document/guides/writing_vocab.pdf",
  n400: "https://www.uscis.gov/n-400",
};

export const CIVICS_FACTS = {
  /** Which test, and how it works. */
  test: [
    {
      id: "which",
      cite: "USCIS Policy Manual 12 E.2",
      en: "Your filing date decides your test. If you filed Form N-400 on or after October 20, 2025, you take the 2025 civics test (the 128 questions here). If you filed before that, you take the 2008 test (100 questions); see the link below.",
      es: "La fecha en que presentó su solicitud decide su examen. Si presentó el formulario N-400 el 20 de octubre de 2025 o después, le toca el examen de civismo de 2025 (las 128 preguntas de aquí). Si lo presentó antes, le toca el examen de 2008 (100 preguntas); vea el enlace de abajo.",
    },
    {
      id: "how",
      cite: "USCIS, 2025 Civics Test; PA-2025-24",
      en: "The officer asks you up to 20 of the 128 questions, out loud, in English. You pass with 12 right answers. The officer stops when you get 12 right, or 9 wrong.",
      es: "El oficial le hace hasta 20 de las 128 preguntas, en voz alta y en inglés. Usted pasa con 12 respuestas correctas. El oficial se detiene cuando usted contesta 12 bien, o 9 mal.",
    },
    {
      id: "65-20",
      cite: "USCIS M-1778; Policy Manual 12 E.2",
      en: "Age 65 or older and a green card holder for 20 years or more when you filed? Study only the 20 questions marked with a star. The officer asks 10 of them and you pass with 6. You may take the test in your own language, with an interpreter you bring.",
      es: "¿Tenía 65 años o más y 20 años o más con green card cuando presentó su solicitud? Estudie solo las 20 preguntas marcadas con una estrella. El oficial le hace 10 de ellas y usted pasa con 6. Puede tomar el examen en su idioma, con un intérprete que usted lleve.",
    },
    {
      id: "50-55",
      cite: "USCIS, Exceptions and Accommodations",
      en: "Age 50 or older with 20 years as a green card holder, or 55 or older with 15 years: you don't take the English test, but you still take the full civics test. You may take it in your own language, with an interpreter you bring.",
      es: "Con 50 años o más y 20 años con green card, o con 55 años o más y 15 años: no toma el examen de inglés, pero sí el examen completo de civismo. Puede tomarlo en su idioma, con un intérprete que usted lleve.",
    },
    {
      id: "english",
      cite: "USCIS, Naturalization Test",
      en: "The English test: read one of three sentences out loud, and write one of three sentences. USCIS publishes the words the sentences use (links below).",
      es: "El examen de inglés: leer en voz alta una de tres oraciones, y escribir una de tres oraciones. USCIS publica las palabras que usan las oraciones (enlaces abajo).",
    },
    {
      id: "retest",
      cite: "USCIS, The Naturalization Interview and Test",
      en: "Didn't pass? You get one more try, 60 to 90 days later, only on the part you failed. Failing again means your application is denied.",
      es: "¿No pasó? Tiene un intento más, de 60 a 90 días después, solo en la parte que no pasó. Si no pasa otra vez, le niegan la solicitud.",
    },
    {
      id: "now",
      cite: "USCIS, Check for Test Updates",
      en: "Some answers change: who is President, Speaker, governor, your senators and your representative. Answer with the person serving on the day of your interview. California’s new governor takes office January 4, 2027, and new congressional districts start January 3, 2027.",
      es: "Algunas respuestas cambian: quién es Presidente, Presidente de la Cámara, gobernador, sus senadores y su representante. Conteste con la persona que esté en el cargo el día de su entrevista. El nuevo gobernador de California empieza el 4 de enero de 2027, y los nuevos distritos del Congreso empiezan el 3 de enero de 2027.",
    },
  ] satisfies Fact[],
  /** What applying costs. */
  fees: [
    {
      id: "fee",
      cite: "USCIS, Form N-400",
      en: "The application (Form N-400) costs $760 on paper or $710 online.",
      es: "La solicitud (formulario N-400) cuesta $760 en papel o $710 en línea.",
    },
    {
      id: "reduced",
      cite: "USCIS, Reduced fee request",
      en: "Reduced fee: $380, on paper only, if your household income is under 400% of the poverty line (ask in Part 10 of the form, with proof).",
      es: "Cuota reducida: $380, solo en papel, si los ingresos de su hogar son menos del 400% de la línea de pobreza (se pide en la Parte 10 del formulario, con comprobantes).",
    },
    {
      id: "waiver",
      cite: "USCIS, Form I-912",
      en: "Fee waiver (no fee), on paper only, with Form I-912: if you get a means-tested benefit like Medi-Cal or CalFresh, your household income is at or below 150% of the poverty line, or you have a financial hardship.",
      es: "Exención de cuota (sin pagar), solo en papel, con el formulario I-912: si recibe un beneficio según sus ingresos como Medi-Cal o CalFresh, si los ingresos de su hogar son del 150% de la línea de pobreza o menos, o si tiene una dificultad económica.",
    },
  ] satisfies Fact[],
  /** Why some `now` answers may change soon. */
  notes: {
    representative: {
      en: "Your representative depends on your street address: Modesto and Turlock are split between districts. Find yours at house.gov with your ZIP code and address. New districts start January 3, 2027.",
      es: "Su representante depende de su dirección: Modesto y Turlock están divididos entre distritos. Encuentre el suyo en house.gov con su código postal y dirección. Los nuevos distritos empiezan el 3 de enero de 2027.",
    },
    speaker: {
      en: "The new House chooses a Speaker on January 3, 2027; check USCIS’s test updates before your interview.",
      es: "La nueva Cámara elige a su Presidente el 3 de enero de 2027; revise las actualizaciones de USCIS antes de su entrevista.",
    },
    governor: {
      en: "California elects a new governor on November 3, 2026, who takes office January 4, 2027.",
      es: "California elige un nuevo gobernador el 3 de noviembre de 2026, que empieza el 4 de enero de 2027.",
    },
  } satisfies Record<string, Bilingual>,
};

/** Free or low-cost citizenship classes and help, each confirmed on its own site (2026-10-22). */
export const CIVICS_HELP: { name: Bilingual; phone: string; address: string; note: Bilingual; url: string }[] = [
  {
    name: { en: "IRC in Turlock: free citizenship class, low-cost legal help", es: "IRC en Turlock: clase de ciudadanía gratis, ayuda legal de bajo costo" },
    phone: "(209) 667-2378",
    address: "3446 N Golden State Blvd, Suite A, Turlock",
    note: { en: "Call to confirm the class schedule.", es: "Llame para confirmar el horario de la clase." },
    url: "https://www.rescue.org/united-states/turlock-ca",
  },
  {
    name: { en: "Catholic Charities, Modesto: help with Form N-400 and practice interviews", es: "Catholic Charities, Modesto: ayuda con el formulario N-400 y entrevistas de práctica" },
    phone: "(209) 444-5910",
    address: "1506 H Street, Modesto",
    note: { en: "By appointment only.", es: "Solo con cita." },
    url: "https://www.ccstockton.org/immigration-services",
  },
  {
    name: { en: "Turlock Adult School: free citizenship test preparation", es: "Turlock Adult School: preparación gratis para el examen de ciudadanía" },
    phone: "(209) 226-6475",
    address: "350 N. Kilroy Road, Turlock",
    note: { en: "Ask about this term’s schedule.", es: "Pregunte por el horario de este periodo." },
    url: "https://tas.turlock.k12.ca.us/our-school",
  },
  {
    name: { en: "Modesto Junior College: English for Citizenship (English for Life and Work)", es: "Modesto Junior College: inglés para la ciudadanía (English for Life and Work)" },
    phone: "(209) 575-7847",
    address: "ELL Welcome Center, MJC West Campus",
    note: { en: "Offered some terms: ask whether it runs this term.", es: "Se ofrece algunos periodos: pregunte si hay este periodo." },
    url: "https://www.mjc.edu/lae/elw.html",
  },
  {
    name: { en: "El Concilio: free and low-cost citizenship classes and legal help", es: "El Concilio: clases de ciudadanía y ayuda legal gratis o de bajo costo" },
    phone: "(209) 644-2600",
    address: "445 N. San Joaquin St., Stockton (main office)",
    note: { en: "Call and ask for the Stanislaus County location.", es: "Llame y pregunte por la oficina del condado de Stanislaus." },
    url: "https://www.elconcilio.org/departments/protective-legal-services/",
  },
  {
    name: { en: "Modesto Library: Citizenship Corner", es: "Biblioteca de Modesto: Rincón de la Ciudadanía" },
    phone: "(209) 558-7800",
    address: "1500 I Street, Modesto",
    note: { en: "Closed for renovation; the library reopens January 11, 2027.", es: "Cerrada por remodelación; la biblioteca abre otra vez el 11 de enero de 2027." },
    url: "https://www.stanislauslibrary.org/citizenship.shtm",
  },
];

export const CIVICS_SOURCES: SourceRef[] = [
  { label: "USCIS: 128 Civics Questions and Answers (2025 version), M-1778 (09/25)", url: LIST_PDF },
  { label: "USCIS: 2025 Civics Test", url: TEST_PAGE },
  { label: "USCIS Policy Manual, Vol. 12, Part E, Ch. 2 (English and civics testing)", url: POLICY },
  { label: "USCIS: Check for test updates (current officials)", url: "https://www.uscis.gov/citizenship/testupdates" },
  { label: "USCIS: Exceptions and accommodations", url: "https://www.uscis.gov/citizenship/exceptions-and-accommodations" },
  { label: "USCIS: Form N-400 (fees, reduced fee, fee waiver)", url: "https://www.uscis.gov/n-400" },
  { label: "U.S. House: find your representative", url: "https://www.house.gov/representatives/find-your-representative" },
];
