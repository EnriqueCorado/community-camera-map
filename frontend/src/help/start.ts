// "What do you need help with?": the plain-language starting point (Help panel
// and the public home pages), sharing, and the short links (/h/<word>/). One
// list per thing, kept free of React and of the facts files so the panel can
// import it without downloading every tool. A new tool is one line in PAGES,
// one in START_CHOICES and its short links in SHORT_LINKS. A unit test checks
// that PAGES matches the public pages in landing/tools.ts.
import type { Lang } from "../i18n";
import type { HelpTarget } from "./target";

type Bilingual = Record<Lang, string>;

/** Every public tool page: where it opens in the Help panel, and its URL segment
 *  under help/ (English) or ayuda/ (Spanish). Same ids and slugs as landing/tools.ts. */
export const PAGES = {
  medical: { target: { tab: "medical" }, slug: { en: "hospital-bills", es: "cuentas-de-hospital" } },
  clinics: { target: { tab: "medical", view: "clinics" }, slug: { en: "free-clinics", es: "clinicas-gratis" } },
  benefits: { target: { tab: "benefits" }, slug: { en: "benefits", es: "beneficios" } },
  "medi-cal-work": { target: { tab: "benefits", view: "medi-cal" }, slug: { en: "medi-cal-work-rules", es: "reglas-de-trabajo-medi-cal" } },
  rent: { target: { tab: "rent", view: "rent" }, slug: { en: "rent-increase", es: "aumento-de-renta" } },
  eviction: { target: { tab: "rent", view: "eviction" }, slug: { en: "eviction-notice", es: "aviso-de-desalojo" } },
  repairs: { target: { tab: "rent", view: "repairs" }, slug: { en: "repairs", es: "reparaciones" } },
  deposit: { target: { tab: "rent", view: "deposit" }, slug: { en: "security-deposit", es: "deposito" } },
  mobile: { target: { tab: "rent", view: "mobile" }, slug: { en: "mobile-home-space-rent", es: "renta-de-espacio-casa-movil" } },
  wages: { target: { tab: "work", view: "wages" }, slug: { en: "unpaid-wages", es: "salarios-no-pagados" } },
  heat: { target: { tab: "work", view: "heat" }, slug: { en: "heat-at-work", es: "calor-en-el-trabajo" } },
  "know-your-rights": { target: { tab: "immigration", view: "rights" }, slug: { en: "know-your-rights", es: "conozca-sus-derechos" } },
  citizenship: { target: { tab: "immigration", view: "citizenship" }, slug: { en: "citizenship-test", es: "examen-de-ciudadania" } },
  "family-plan": { target: { tab: "immigration", view: "plan" }, slug: { en: "family-plan", es: "plan-familiar" } },
  daca: { target: { tab: "immigration", view: "daca" }, slug: { en: "daca-renewal", es: "renovar-daca" } },
  taxes: { target: { tab: "benefits", view: "taxes" }, slug: { en: "free-tax-help", es: "impuestos-gratis" } },
  legal: { target: { tab: "legal" }, slug: { en: "legal-aid", es: "ayuda-legal" } },
} as const satisfies Record<string, { target: HelpTarget; slug: Bilingual }>;

export type PageId = keyof typeof PAGES;

/** The folder for each language's pages (same as SITE_COPY.dir). */
export const PAGE_DIR: Bilingual = { en: "help", es: "ayuda" };

/** Path of a public tool page under the site base: "ayuda/aumento-de-renta/". */
export const pagePath = (lang: Lang, id: PageId) => `${PAGE_DIR[lang]}/${PAGES[id].slug[lang]}/`;

/** The public page for the tool now open in the Help panel, if it has one. */
export function pageFor(t: HelpTarget): PageId | null {
  const target = (id: PageId): HelpTarget => PAGES[id].target;
  const sameTab = (Object.keys(PAGES) as PageId[]).filter((id) => target(id).tab === t.tab);
  // The tool's own page, else the tab's first one (its default view).
  return sameTab.find((id) => target(id).view === t.view) ?? sameTab[0] ?? null;
}

/** "What do you need help with?", in everyday words, most common first. */
export const START_CHOICES: readonly { page: PageId; label: Bilingual }[] = [
  { page: "medical", label: { en: "I got a hospital bill I can’t pay", es: "Me llegó una cuenta de hospital que no puedo pagar" } },
  { page: "clinics", label: { en: "I need a doctor or dentist and have no insurance", es: "Necesito un doctor o dentista y no tengo seguro" } },
  { page: "rent", label: { en: "My rent went up", es: "Me subieron la renta" } },
  { page: "eviction", label: { en: "My landlord wants me out, or I got a notice", es: "El dueño quiere sacarme, o recibí un aviso" } },
  { page: "repairs", label: { en: "My landlord won’t fix things", es: "El dueño no hace las reparaciones" } },
  { page: "deposit", label: { en: "My landlord kept my deposit", es: "El dueño no me devolvió el depósito" } },
  { page: "mobile", label: { en: "My mobile home space rent went up", es: "Me subieron la renta del espacio de mi casa móvil" } },
  { page: "wages", label: { en: "I wasn’t paid what I’m owed", es: "No me pagaron lo que me deben" } },
  { page: "heat", label: { en: "It’s too hot at work", es: "Hace demasiado calor en mi trabajo" } },
  { page: "benefits", label: { en: "I need food, cash or health coverage", es: "Necesito comida, dinero o seguro médico" } },
  { page: "medi-cal-work", label: { en: "Medi-Cal says I have to work", es: "Medi-Cal dice que tengo que trabajar" } },
  { page: "know-your-rights", label: { en: "Immigration agents: know my rights", es: "Agentes de inmigración: conocer mis derechos" } },
  { page: "citizenship", label: { en: "I’m studying for the citizenship test", es: "Estoy estudiando para el examen de ciudadanía" } },
  { page: "family-plan", label: { en: "I want a plan in case my family is separated", es: "Quiero un plan por si separan a mi familia" } },
  { page: "daca", label: { en: "I need to renew DACA", es: "Necesito renovar DACA" } },
  { page: "taxes", label: { en: "I need free help with my taxes", es: "Necesito ayuda gratis con mis impuestos" } },
  { page: "legal", label: { en: "I need a free or low-cost lawyer", es: "Necesito un abogado gratis o de bajo costo" } },
];

/** Short links, easy to say out loud or write on a whiteboard: /h/<slug>/
 *  opens the page in that language. Lowercase ASCII; "-es" when the Spanish
 *  word is the same as the English one. "home": the language's home page. */
export const SHORT_LINKS: readonly { slug: string; page: PageId | "home"; lang: Lang }[] = [
  { slug: "help", page: "home", lang: "en" },
  { slug: "ayuda", page: "home", lang: "es" },
  { slug: "hospital", page: "medical", lang: "en" },
  { slug: "hospital-es", page: "medical", lang: "es" },
  { slug: "clinics", page: "clinics", lang: "en" },
  { slug: "clinicas", page: "clinics", lang: "es" },
  { slug: "rent", page: "rent", lang: "en" },
  { slug: "renta", page: "rent", lang: "es" },
  { slug: "eviction", page: "eviction", lang: "en" },
  { slug: "desalojo", page: "eviction", lang: "es" },
  { slug: "repairs", page: "repairs", lang: "en" },
  { slug: "reparaciones", page: "repairs", lang: "es" },
  { slug: "deposit", page: "deposit", lang: "en" },
  { slug: "deposito", page: "deposit", lang: "es" },
  { slug: "mobile-home", page: "mobile", lang: "en" },
  { slug: "casa-movil", page: "mobile", lang: "es" },
  { slug: "wages", page: "wages", lang: "en" },
  { slug: "salarios", page: "wages", lang: "es" },
  { slug: "heat", page: "heat", lang: "en" },
  { slug: "calor", page: "heat", lang: "es" },
  { slug: "benefits", page: "benefits", lang: "en" },
  { slug: "beneficios", page: "benefits", lang: "es" },
  { slug: "medi-cal", page: "medi-cal-work", lang: "en" },
  { slug: "medi-cal-es", page: "medi-cal-work", lang: "es" },
  { slug: "rights", page: "know-your-rights", lang: "en" },
  { slug: "derechos", page: "know-your-rights", lang: "es" },
  { slug: "citizenship", page: "citizenship", lang: "en" },
  { slug: "ciudadania", page: "citizenship", lang: "es" },
  { slug: "plan", page: "family-plan", lang: "en" },
  { slug: "plan-familiar", page: "family-plan", lang: "es" },
  { slug: "daca", page: "daca", lang: "en" },
  { slug: "daca-es", page: "daca", lang: "es" },
  { slug: "taxes", page: "taxes", lang: "en" },
  { slug: "impuestos", page: "taxes", lang: "es" },
  { slug: "lawyer", page: "legal", lang: "en" },
  { slug: "abogado", page: "legal", lang: "es" },
];

export const SHORT_DIR = "h";

/** Where a short link lands, under the site base. */
export const shortTarget = (s: (typeof SHORT_LINKS)[number]) => (s.page === "home" ? `${PAGE_DIR[s.lang]}/` : pagePath(s.lang, s.page));

/** The short link for a page in a language, if there is one: "h/renta/". */
export function shortFor(lang: Lang, page: string): string | null {
  const s = SHORT_LINKS.find((x) => x.lang === lang && x.page === page);
  return s ? `${SHORT_DIR}/${s.slug}/` : null;
}

/** A WhatsApp link that opens the app with this message ready to send (no script, no tracking). */
export const whatsappHref = (text: string, url: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
