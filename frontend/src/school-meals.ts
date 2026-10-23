// Free school meals pack (backend app/layers/national/school_meals.py): one
// layer per state, "<st>-free-school-meals", for public schools where every
// student eats breakfast and lunch free. Self-contained like services-pack.ts
// (own EN/ES strings, type-only imports).
// Properties: n school · d district (absent when it's the school's own name)
// · r why it's free (l state law · o state program the district opts into ·
// c Community Eligibility Provision · p Provision 2/3) · y the school year
// it applies to (2024 = 2024-25).
import type { Lang } from "./i18n"; // type-only: erased at build
import type { ServicePopup } from "./services-pack"; // type-only

export const SCHOOL_MEALS_LAYER = /^([a-z]{2})-free-school-meals$/;
export const isSchoolMealsLayer = (name: string) => SCHOOL_MEALS_LAYER.test(name);

/** States with a layer (backend LAYER_STATES; a backend test keeps them in sync). */
export const SCHOOL_MEALS_STATES = (
  "AK AL AR AZ CA CO CT DC DE FL GA GU HI IA IL IN KS KY LA MA MD ME MI MN MO MP MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY"
).split(" ");

const COLOR = "#c2410c";
export const SCHOOL_MEAL_COLORS: Record<string, string> = Object.fromEntries(
  SCHOOL_MEALS_STATES.map((st) => [`${st.toLowerCase()}-free-school-meals`, COLOR]),
);

/** Each statewide program's page for families (backend UNIVERSAL "page"; a
 *  backend test keeps them in sync). */
export const STATE_MEAL_PAGES: Record<string, string> = {
  CA: "https://www.cde.ca.gov/ls/nu/sn/cauniversalmeals.asp",
  CO: "https://ed.cde.state.co.us/nutrition/nutrition-programs/healthy-school-meals-for-all-program",
  ME: "https://www.maine.gov/doe/schools/nutrition",
  MA: "https://www.doe.mass.edu/cnp/",
  MI: "https://www.michigan.gov/mde/services/food/michigan-school-meals",
  MN: "https://education.mn.gov/MDE/dse/FNS/SNP/free/",
  NM: "https://web.ped.nm.gov/bureaus/student-success-wellness/school-meals/",
  NY: "https://www.cn.nysed.gov/programs/national-school-lunch-program",
  VT: "https://education.vermont.gov/schools/nutrition",
};
/** USDA's Community Eligibility Provision page (fns.usda.gov now redirects here). */
export const CEP_PAGE = "https://www.fna.usda.gov/cn/cep";

/** Hosts this pack links to (merged into the popup link allowlist). */
export const SCHOOL_MEAL_LINK_HOSTS: string[] = [...new Set([...Object.values(STATE_MEAL_PAGES), CEP_PAGE].map((u) => new URL(u).hostname))];

type Bi = [en: string, es: string];
const LABELS: Record<string, Bi> = {
  district: ["District", "Distrito"],
  why: ["Why it’s free", "Por qué es gratis"],
  year: ["School year", "Ciclo escolar"],
  note: ["Note", "Nota"],
};
const REASONS: Record<string, Bi> = {
  l: ["State law: free for every public school student", "Ley estatal: gratis para todos los alumnos de escuelas públicas"],
  o: ["State program: free for every student where the district takes part", "Programa estatal: gratis para todos los alumnos donde el distrito participa"],
  c: ["Community Eligibility Provision (CEP) school", "Escuela con la Provisión de Elegibilidad Comunitaria (CEP)"],
  p: ["Provision 2 or 3 school (federal)", "Escuela con la Provisión 2 o 3 (federal)"],
};
const NOTES: Record<string, Bi> = {
  l: ["Breakfast and lunch are free for every student. No application needed.", "El desayuno y el almuerzo son gratis para todos los alumnos. No hay que llenar solicitud."],
  o: [
    "Breakfast and lunch are free for every student at schools in the state program. No application needed; ask the school to confirm.",
    "El desayuno y el almuerzo son gratis para todos los alumnos en las escuelas del programa estatal. No hay que llenar solicitud; confírmelo con la escuela.",
  ],
  fed: [
    "Breakfast and lunch are free for every student, with no application. Schools can join or leave each year: confirm with the school.",
    "El desayuno y el almuerzo son gratis para todos los alumnos, sin llenar solicitud. Las escuelas pueden entrar o salir cada año: confírmelo con la escuela.",
  ],
};
const LINKS: Record<string, Bi> = {
  state: ["State school meals page", "Página estatal de comidas escolares"],
  cep: ["About free meals for all (USDA CEP)", "Sobre comidas gratis para todos (USDA CEP, en inglés)"],
};

/** "2024-25" from 2024 (a plausible start year only). */
export function schoolYear(y: unknown): string {
  return typeof y === "number" && Number.isInteger(y) && y >= 2000 && y < 2100 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : "";
}

/** Popup content for a free school meals feature. `tidy` turns ALL-CAPS
 *  source names into Title Case (MapView's helper). */
export function schoolMealsPopup(layer: string, p: Record<string, unknown>, lang: Lang, tidy: (s: string) => string): ServicePopup {
  const i = lang === "es" ? 1 : 0;
  const raw = (v: unknown) => (v == null ? "" : String(v).trim().replace(/\s+/g, " "));
  const r = raw(p.r);
  const st = (SCHOOL_MEALS_LAYER.exec(layer)?.[1] ?? "").toUpperCase();
  const state = r === "l" || r === "o";
  const page = state ? STATE_MEAL_PAGES[st] : REASONS[r] ? CEP_PAGE : undefined;
  const rows: [string, string][] = [
    [LABELS.district![i], tidy(raw(p.d))],
    [LABELS.why![i], REASONS[r]?.[i] ?? ""],
    [LABELS.year![i], schoolYear(p.y)],
    [LABELS.note![i], (state ? NOTES[r] : REASONS[r] ? NOTES.fed : undefined)?.[i] ?? ""],
  ];
  return {
    title: tidy(raw(p.n)),
    rows,
    link: page ? { href: page, label: (state ? LINKS.state : LINKS.cep)![i] } : undefined,
  };
}
