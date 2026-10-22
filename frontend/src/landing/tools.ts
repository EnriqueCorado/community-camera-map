// The public "Free help" pages: one per tool, in English and Spanish. Each page
// shows the same cited facts, contacts and sources the tool itself uses (from
// help/*-facts.ts), so a fact is checked and updated in one place. Only the
// short intro and card summary are written here.
import type { Lang } from "../i18n";
import type { Bilingual } from "../help/letter-types";
import type { HelpTarget } from "../help/target";
import type { CitedFact, SourceRef } from "../components/help/ui";
import { COPY, type HelpCopy } from "../help/copy";
import { DEPOSIT_FACTS, LEGAL_FACTS, MEDICAL_FACTS, MOBILE_FACTS, RENT_FACTS, RENT_SOURCES, REPAIR_FACTS } from "../help/facts";
import { EVICTION_FACTS, EVICTION_SOURCES } from "../help/eviction-facts";
import { WAGE_FACTS, WAGE_SOURCES } from "../help/wages-facts";
import { HEAT_FACTS } from "../help/heat-facts";
import { BENEFITS_CHECKED, BENEFITS_SOURCES, PROGRAMS, PUBLIC_CHARGE } from "../help/benefits-facts";
import { WAGES_COPY } from "../help/wages-copy";
import { MCW_CHECKED, MCW_CONTACTS, MCW_FACTS, MCW_SOURCES } from "../help/medi-cal-work-facts";
import { MEDI_CAL_WORK_COPY } from "../help/medi-cal-work-copy";
import { DETENTION_CENTERS, RAPID_RESPONSE, RIGHTS_CHECKED, RIGHTS_FACTS, RIGHTS_SOURCES } from "../help/rights-facts";
import { RIGHTS_COPY } from "../help/rights-copy";
import { CIVICS_CHECKED, CIVICS_FACTS, CIVICS_HELP, CIVICS_SOURCES } from "../help/civics-facts";
import { CIVICS_COPY } from "../help/civics-copy";
import { CIVICS_QUESTIONS } from "../help/civics-questions";
import { CIVICS_PARTS } from "../help/civics";
import { HEAT_COPY } from "../help/heat-copy";
import { PLAN_CHECKED, PLAN_FACTS, PLAN_SOURCES } from "../help/family-plan-facts";
import { FAMILY_PLAN_COPY } from "../help/family-plan-copy";
import { PLAN_SECTIONS } from "../help/family-plan";
import { DACA_CHECKED, DACA_FACTS, DACA_HELP, DACA_SOURCES } from "../help/daca-facts";
import { DACA_COPY } from "../help/daca-copy";

/** A place to call or visit (the shape every facts file's contacts share). */
export interface PlaceInfo {
  name: Bilingual;
  phone?: string;
  email?: string;
  address?: string;
  hours?: Bilingual;
  note?: Bilingual;
  url?: string;
}

export type ToolId =
  | "medical"
  | "rent"
  | "eviction"
  | "repairs"
  | "deposit"
  | "mobile"
  | "wages"
  | "heat"
  | "benefits"
  | "medi-cal-work"
  | "know-your-rights"
  | "citizenship"
  | "legal"
  | "family-plan"
  | "daca";

/** A line in a section. `esEn`: an English part shown first on the Spanish page
 *  (marked lang="en"), e.g. the official civics question the officer asks. */
export type SectionItem = Bilingual & { esEn?: string };

export interface FactGroup {
  title: Bilingual;
  facts: readonly CitedFact[];
}

export type GroupId = "health" | "housing" | "work" | "immigration" | "legal";

export interface ToolPage {
  id: ToolId;
  group: GroupId;
  /** URL segment under help/ (English) or ayuda/ (Spanish). */
  slug: Record<Lang, string>;
  /** Where "Open the free tool" lands in the map's Help panel. */
  target: HelpTarget;
  name: Bilingual;
  /** One line for the home page card and the search-result description. */
  summary: Bilingual;
  intro: Bilingual;
  /** Cited facts, under the same headings the tool uses. */
  groups: readonly FactGroup[];
  /** Extra lists without a citation per line, shown after the facts. */
  sections?: readonly { title: Bilingual; items: readonly SectionItem[] }[];
  places: readonly PlaceInfo[];
  sources: readonly SourceRef[];
  checked: string;
}

const group = (title: Bilingual, ...lists: (readonly CitedFact[])[]): FactGroup => ({ title, facts: lists.flat() });
const both = <K extends string>(en: Record<K, unknown>, es: Record<K, unknown>, key: K): Bilingual => ({ en: String(en[key]), es: String(es[key]) });
const wage = (key: "rulesMinWage" | "rulesOvertime" | "rulesBreaks" | "rulesFinal" | "claimTitle" | "retaliationTitle") => both(WAGES_COPY.en, WAGES_COPY.es, key);
const heat = (key: "tierIndoor82" | "tierIndoor87" | "payTitle" | "rightsTitle") => both(HEAT_COPY.en, HEAT_COPY.es, key);
type TextKey = { [K in keyof HelpCopy]: HelpCopy[K] extends string ? K : never }[keyof HelpCopy];
const copy = (key: TextKey): Bilingual => ({ en: COPY.en[key], es: COPY.es[key] });
const byId = (facts: readonly CitedFact[], ...ids: string[]) =>
  ids.map((id) => {
    const f = facts.find((x) => x.id === id);
    if (!f) throw new Error(`landing: no fact "${id}"`);
    return f;
  });

export const GROUPS: { id: GroupId; name: Bilingual; anchor: Bilingual }[] = [
  { id: "health", name: { en: "Health and benefits", es: "Salud y beneficios" }, anchor: { en: "health", es: "salud" } },
  { id: "housing", name: { en: "Renters", es: "Inquilinos" }, anchor: { en: "housing", es: "vivienda" } },
  { id: "work", name: { en: "Work", es: "Trabajo" }, anchor: { en: "work", es: "trabajo" } },
  { id: "immigration", name: { en: "Immigration", es: "Inmigración" }, anchor: { en: "immigration", es: "inmigracion" } },
  { id: "legal", name: { en: "Legal help", es: "Ayuda legal" }, anchor: { en: "legal", es: "legal" } },
];

const programs = Object.values(PROGRAMS);

export const TOOLS: readonly ToolPage[] = [
  {
    id: "medical",
    group: "health",
    slug: { en: "hospital-bills", es: "cuentas-de-hospital" },
    target: { tab: "medical" },
    name: { en: "Help with a hospital bill", es: "Ayuda con una cuenta de hospital" },
    summary: {
      en: "Free or discounted care at California hospitals, even after the bill comes. Check if you qualify and get a letter to ask for it.",
      es: "Atención gratis o con descuento en hospitales de California, aun después de recibir la cuenta. Vea si califica y obtenga una carta para pedirla.",
    },
    intro: copy("medLead"),
    groups: [group(copy("medRightsTitle"), MEDICAL_FACTS.rights)],
    places: [MEDICAL_FACTS.freeHelp, MEDICAL_FACTS.complaint],
    sources: MEDICAL_FACTS.sources,
    checked: MEDICAL_FACTS.checked,
  },
  {
    id: "benefits",
    group: "health",
    slug: { en: "benefits", es: "beneficios" },
    target: { tab: "benefits" },
    name: { en: "Which benefits can my family get?", es: "¿Qué beneficios puede recibir mi familia?" },
    summary: {
      en: "CalFresh, Medi-Cal, WIC, utility discounts and tax credits: see what your household may qualify for in about 2 minutes.",
      es: "CalFresh, Medi-Cal, WIC, descuentos en luz y gas, y créditos de impuestos: vea para qué podría calificar su hogar en unos 2 minutos.",
    },
    intro: {
      en: "Answer a few questions in the free tool to see which programs your household may qualify for. It takes about 2 minutes. It’s an estimate: each program makes the final decision.",
      es: "Conteste unas preguntas en la herramienta gratis para ver para qué programas podría calificar su hogar. Toma unos 2 minutos. Es un cálculo aproximado: cada programa toma la decisión final.",
    },
    groups: [],
    sections: [
      {
        title: { en: "Programs the tool checks", es: "Programas que revisa la herramienta" },
        items: programs.map((p) => ({ en: `${p.name.en}: ${p.gives.en}`, es: `${p.name.es}: ${p.gives.es}` })),
      },
      { title: { en: "Immigration and “public charge”", es: "Inmigración y “carga pública”" }, items: [PUBLIC_CHARGE.text, PUBLIC_CHARGE.caveat] },
    ],
    places: [],
    sources: BENEFITS_SOURCES,
    checked: BENEFITS_CHECKED,
  },
  {
    id: "medi-cal-work",
    group: "health",
    slug: { en: "medi-cal-work-rules", es: "reglas-de-trabajo-medi-cal" },
    target: { tab: "benefits", view: "medi-cal" },
    name: { en: MEDI_CAL_WORK_COPY.en.title, es: MEDI_CAL_WORK_COPY.es.title },
    summary: {
      en: "From 2027, many adults on Medi-Cal must show 80 hours a month or $580 in earnings. See if it applies to you, if you’re exempt, and what to do now.",
      es: "Desde 2027, muchos adultos con Medi-Cal deberán demostrar 80 horas al mes o $580 en ingresos. Vea si aplica a usted, si está exento y qué hacer ahora.",
    },
    intro: {
      en: `Starting in 2027, many adults on Medi-Cal must show 80 hours a month of work, school, job training or volunteering, or $580 a month in earnings, to keep it. Many people are exempt. The free tool asks a few questions and shows where you stand. ${MCW_FACTS.caveat.en}`,
      es: `Desde 2027, muchos adultos con Medi-Cal deberán demostrar 80 horas al mes de trabajo, escuela, capacitación o voluntariado, o ganar $580 al mes, para mantenerlo. Muchas personas están exentas. La herramienta gratis hace unas preguntas y le muestra su situación. ${MCW_FACTS.caveat.es}`,
    },
    groups: [
      group({ en: MEDI_CAL_WORK_COPY.en.ruleTitle, es: MEDI_CAL_WORK_COPY.es.ruleTitle }, MCW_FACTS.rule),
      group({ en: MEDI_CAL_WORK_COPY.en.exemptListTitle, es: MEDI_CAL_WORK_COPY.es.exemptListTitle }, MCW_FACTS.exempt),
      group({ en: MEDI_CAL_WORK_COPY.en.whenTitle, es: MEDI_CAL_WORK_COPY.es.whenTitle }, MCW_FACTS.when),
      group({ en: MEDI_CAL_WORK_COPY.en.noticeTitle, es: MEDI_CAL_WORK_COPY.es.noticeTitle }, MCW_FACTS.notice),
      group({ en: MEDI_CAL_WORK_COPY.en.immigrantsTitle, es: MEDI_CAL_WORK_COPY.es.immigrantsTitle }, MCW_FACTS.immigrants),
    ],
    sections: [{ title: { en: MEDI_CAL_WORK_COPY.en.todoTitle, es: MEDI_CAL_WORK_COPY.es.todoTitle }, items: MEDI_CAL_WORK_COPY.en.todo.map((en, i) => ({ en, es: MEDI_CAL_WORK_COPY.es.todo[i]! })) }],
    places: [MCW_CONTACTS.county, MCW_CONTACTS.hca, MCW_CONTACTS.helpline, MCW_CONTACTS.benefitsCal],
    sources: MCW_SOURCES,
    checked: MCW_CHECKED,
  },
  {
    id: "rent",
    group: "housing",
    slug: { en: "rent-increase", es: "aumento-de-renta" },
    target: { tab: "rent", view: "rent" },
    name: copy("rentViewIncrease"),
    summary: {
      en: "Check a rent increase against California’s rent cap and notice rules, and look up the year your building was built.",
      es: "Revise un aumento de renta con el tope de renta de California y las reglas de aviso, y busque el año en que se construyó su edificio.",
    },
    intro: {
      en: "California’s rent cap limits how much most landlords can raise the rent each year, and how much notice they must give. The free tool checks your increase to the cent, tells you if your home may be exempt, and can look up the year your building was built in Stanislaus County records.",
      es: "El tope de renta de California limita cuánto puede subir la renta cada año la mayoría de los arrendadores, y con cuánto aviso. La herramienta gratis revisa su aumento al centavo, le dice si su vivienda podría estar exenta, y puede buscar el año en que se construyó su edificio en los registros del condado de Stanislaus.",
    },
    groups: [group(copy("capTitle"), RENT_FACTS.capRules, RENT_FACTS.notice), group(copy("capExemptionsTitle"), RENT_FACTS.exemptions)],
    places: [EVICTION_FACTS.places.sentinel],
    sources: RENT_SOURCES,
    checked: RENT_FACTS.checked,
  },
  {
    id: "eviction",
    group: "housing",
    slug: { en: "eviction-notice", es: "aviso-de-desalojo" },
    target: { tab: "rent", view: "eviction" },
    name: copy("rentViewEviction"),
    summary: {
      en: "Count your deadline to respond to a notice or court papers, with Stanislaus court holidays, and find free help fast.",
      es: "Calcule su plazo para responder a un aviso o a papeles de la corte, con los días feriados de la corte de Stanislaus, y encuentre ayuda gratis rápido.",
    },
    intro: {
      en: "A notice from your landlord is not a court order: only a court can order an eviction, and only a sheriff can remove you. But the deadlines are short. Tell the free tool what kind of notice you got and when, and it counts your deadline, skipping weekends and court holidays when the law says to.",
      es: "Un aviso de su arrendador no es una orden de la corte: solo una corte puede ordenar un desalojo, y solo un sheriff puede sacarlo. Pero los plazos son cortos. Dígale a la herramienta gratis qué tipo de aviso recibió y cuándo, y calcula su fecha límite, sin contar fines de semana ni días feriados de la corte cuando la ley así lo dice.",
    },
    groups: [
      group(
        { en: "After you get a notice", es: "Después de recibir un aviso" },
        byId(RENT_FACTS.capRules, "eviction-papers"),
        // "court-only" is left out: it says "by this date", which needs the tool's answer.
        EVICTION_FACTS.afterNotice.filter((f) => f.id !== "court-only"),
      ),
      group({ en: "Your rights as a tenant", es: "Sus derechos como inquilino" }, EVICTION_FACTS.rights),
    ],
    places: [EVICTION_FACTS.places.crla, EVICTION_FACTS.places.selfHelp, EVICTION_FACTS.places.turlock, EVICTION_FACTS.places.sentinel],
    sources: EVICTION_SOURCES,
    checked: EVICTION_FACTS.checked,
  },
  {
    id: "repairs",
    group: "housing",
    slug: { en: "repairs", es: "reparaciones" },
    target: { tab: "rent", view: "repairs" },
    name: copy("rentViewRepairs"),
    summary: {
      en: "A free letter asking your landlord for repairs, in English or Spanish, and your rights while you wait.",
      es: "Una carta gratis para pedirle reparaciones a su arrendador, en inglés o español, y sus derechos mientras espera.",
    },
    intro: {
      en: "Your landlord must keep your home livable. The free tool writes a dated repair request letter, in English or Spanish, that you can print, copy or download, so you have written proof that you asked.",
      es: "Su arrendador debe mantener su vivienda habitable. La herramienta gratis escribe una carta con fecha para pedir reparaciones, en inglés o español, que puede imprimir, copiar o descargar, para que tenga prueba por escrito de que las pidió.",
    },
    groups: [group(copy("repairsTitle"), REPAIR_FACTS.rights)],
    places: REPAIR_FACTS.codeEnforcement,
    sources: RENT_SOURCES,
    checked: RENT_FACTS.checked,
  },
  {
    id: "deposit",
    group: "housing",
    slug: { en: "security-deposit", es: "deposito" },
    target: { tab: "rent", view: "deposit" },
    name: copy("rentViewDeposit"),
    summary: {
      en: "Moved out and didn’t get your deposit back? A free letter asking for it, and the 21-day rule.",
      es: "¿Se mudó y no le devolvieron su depósito? Una carta gratis para pedirlo, y la regla de los 21 días.",
    },
    intro: {
      en: "After you move out, your landlord has 21 days to return your security deposit or explain every deduction. The free tool writes a letter asking for it, in English or Spanish, based on California law.",
      es: "Después de que se muda, su arrendador tiene 21 días para devolverle el depósito o explicar cada descuento. La herramienta gratis escribe una carta para pedirlo, en inglés o español, según la ley de California.",
    },
    groups: [group(copy("depositTitle"), DEPOSIT_FACTS.rights)],
    places: [DEPOSIT_FACTS.smallClaims],
    sources: RENT_SOURCES,
    checked: RENT_FACTS.checked,
  },
  {
    id: "mobile",
    group: "housing",
    slug: { en: "mobile-home-space-rent", es: "renta-de-espacio-casa-movil" },
    target: { tab: "rent", view: "mobile" },
    name: copy("rentViewMobile"),
    summary: {
      en: "Own your mobile home and rent the space? The rules on space-rent increases in Stanislaus County.",
      es: "¿Es dueño de su casa móvil y renta el espacio? Las reglas sobre aumentos de la renta del espacio en el condado de Stanislaus.",
    },
    intro: copy("mobileLead"),
    groups: [group(copy("mobileTitle"), MOBILE_FACTS.rights)],
    places: MOBILE_FACTS.contacts,
    sources: RENT_SOURCES,
    checked: RENT_FACTS.checked,
  },
  {
    id: "wages",
    group: "work",
    slug: { en: "unpaid-wages", es: "salarios-no-pagados" },
    target: { tab: "work", view: "wages" },
    name: copy("workViewWages"),
    summary: {
      en: "Overtime, minimum wage, missed breaks and late final pay: see what you may be owed and how to claim it.",
      es: "Horas extra, salario mínimo, descansos y pago final atrasado: vea lo que le podrían deber y cómo reclamarlo.",
    },
    intro: {
      en: "Find out if you were paid everything you earned: overtime, minimum wage, missed breaks and late final pay. The free tool estimates what you may be owed and shows how to file a free claim with the Labor Commissioner.",
      es: "Averigüe si le pagaron todo lo que ganó: horas extra, salario mínimo, descansos que no le dieron y el pago final atrasado. La herramienta gratis calcula lo que le podrían deber y le muestra cómo presentar un reclamo gratis ante el Comisionado Laboral.",
    },
    groups: [
      group(wage("rulesMinWage"), WAGE_FACTS.minWage),
      group(wage("rulesOvertime"), WAGE_FACTS.overtime),
      group(wage("rulesBreaks"), WAGE_FACTS.breaks),
      group(wage("rulesFinal"), WAGE_FACTS.finalPay),
      group(wage("claimTitle"), WAGE_FACTS.claim),
      group(wage("retaliationTitle"), WAGE_FACTS.retaliation),
    ],
    places: [WAGE_FACTS.office, WAGE_FACTS.legalAidAtWork],
    sources: WAGE_SOURCES,
    checked: WAGE_FACTS.checked,
  },
  {
    id: "heat",
    group: "work",
    slug: { en: "heat-at-work", es: "calor-en-el-trabajo" },
    target: { tab: "work", view: "heat" },
    name: copy("workViewHeat"),
    summary: {
      en: "The heat rules your employer must follow, outdoors or indoors, and what to do if someone gets sick.",
      es: "Las reglas de calor que su empleador debe cumplir, afuera o adentro, y qué hacer si alguien se enferma.",
    },
    intro: {
      en: "California has heat rules for work, outdoors and indoors. Here is what employers must do at each temperature. The free tool checks today’s forecast for your city, shows only the rules that apply, and explains what to do if someone gets sick.",
      es: "California tiene reglas de calor para el trabajo, al aire libre y en interiores. Aquí está lo que los empleadores deben hacer a cada temperatura. La herramienta gratis revisa el pronóstico de hoy para su ciudad, muestra solo las reglas que aplican, y explica qué hacer si alguien se enferma.",
    },
    groups: [
      group({ en: "Outdoors, every work day", es: "Al aire libre, todos los días de trabajo" }, HEAT_FACTS.outdoorAlways),
      group({ en: "Outdoors, above 80°F", es: "Al aire libre, a más de 80°F" }, HEAT_FACTS.outdoorOver80),
      group({ en: "Outdoors, at 95°F or more (high-heat rules)", es: "Al aire libre, a 95°F o más (reglas para calor extremo)" }, HEAT_FACTS.outdoorHigh95),
      group(heat("tierIndoor82"), HEAT_FACTS.indoor82),
      group(heat("tierIndoor87"), HEAT_FACTS.indoor87),
      group(heat("payTitle"), HEAT_FACTS.pay),
      group(heat("rightsTitle"), HEAT_FACTS.rights),
    ],
    places: [HEAT_FACTS.calOshaLine, HEAT_FACTS.modestoOffice, HEAT_FACTS.laborCommissioner],
    sources: HEAT_FACTS.sources,
    checked: HEAT_FACTS.checked,
  },
  {
    id: "know-your-rights",
    group: "immigration",
    slug: { en: "know-your-rights", es: "conozca-sus-derechos" },
    target: { tab: "immigration", view: "rights" },
    name: { en: RIGHTS_COPY.en.title, es: RIGHTS_COPY.es.title },
    summary: {
      en: "What to do if immigration agents come to your door or stop you, free red cards, a family plan, and how to look for someone who was detained.",
      es: "Qué hacer si los agentes de inmigración llegan a su puerta o lo paran, tarjetas rojas gratis, un plan familiar, y cómo buscar a alguien detenido.",
    },
    intro: {
      en: `${RIGHTS_COPY.en.lead} ${RIGHTS_COPY.en.emergencyTitle}: ${RAPID_RESPONSE.name.en}, ${RAPID_RESPONSE.phone} (${RIGHTS_COPY.en.emergencyText}) ${RIGHTS_COPY.en.call911} ${RIGHTS_COPY.en.emergencyDoor}`,
      es: `${RIGHTS_COPY.es.lead} ${RIGHTS_COPY.es.emergencyTitle}: ${RAPID_RESPONSE.name.es}, ${RAPID_RESPONSE.phone} (${RIGHTS_COPY.es.emergencyText}) ${RIGHTS_COPY.es.call911} ${RIGHTS_COPY.es.emergencyDoor}`,
    },
    groups: [
      group({ en: RIGHTS_COPY.en.door, es: RIGHTS_COPY.es.door }, RIGHTS_FACTS.door),
      group({ en: RIGHTS_COPY.en.stopped, es: RIGHTS_COPY.es.stopped }, RIGHTS_FACTS.stopped),
      group({ en: RIGHTS_COPY.en.recording, es: RIGHTS_COPY.es.recording }, RIGHTS_FACTS.recording),
      group({ en: RIGHTS_COPY.en.plan, es: RIGHTS_COPY.es.plan }, RIGHTS_FACTS.plan),
      group({ en: RIGHTS_COPY.en.detained, es: RIGHTS_COPY.es.detained }, RIGHTS_FACTS.detained),
      group({ en: RIGHTS_COPY.en.california, es: RIGHTS_COPY.es.california }, RIGHTS_FACTS.california),
      group({ en: RIGHTS_COPY.en.scams, es: RIGHTS_COPY.es.scams }, RIGHTS_FACTS.scams),
    ],
    // The emergency line only: detention centers aren't "help", so they get their own section.
    places: [RAPID_RESPONSE],
    sections: [
      {
        title: { en: RIGHTS_COPY.en.centersTitle, es: RIGHTS_COPY.es.centersTitle },
        items: [
          { en: RIGHTS_COPY.en.centersNote, es: RIGHTS_COPY.es.centersNote },
          ...DETENTION_CENTERS.map((p) => p.note),
        ],
      },
    ],
    sources: RIGHTS_SOURCES,
    checked: RIGHTS_CHECKED,
  },
  {
    id: "citizenship",
    group: "immigration",
    slug: { en: "citizenship-test", es: "examen-de-ciudadania" },
    target: { tab: "immigration", view: "citizenship" },
    name: { en: CIVICS_COPY.en.title, es: CIVICS_COPY.es.title },
    summary: {
      en: "All 128 official civics questions and answers, practice tests that work like the real one, and free classes near you.",
      es: "Las 128 preguntas y respuestas oficiales de civismo, exámenes de práctica como el de verdad, y clases gratis cerca de usted.",
    },
    intro: {
      en: `${CIVICS_COPY.en.lead} All the questions are below, so you can study them here or save this page on your phone.`,
      es: `${CIVICS_COPY.es.lead} Todas las preguntas están abajo, para estudiarlas aquí o guardar esta página en su teléfono.`,
    },
    groups: [group({ en: CIVICS_COPY.en.testTitle, es: CIVICS_COPY.es.testTitle }, CIVICS_FACTS.test), group({ en: CIVICS_COPY.en.feesTitle, es: CIVICS_COPY.es.feesTitle }, CIVICS_FACTS.fees)],
    // The whole official list: answers in USCIS's English (the test's language),
    // with the Spanish study translation in the Spanish page where there is one.
    sections: CIVICS_PARTS.map((p) => ({
      title: { en: CIVICS_COPY.en.parts[p], es: CIVICS_COPY.es.parts[p] },
      items: CIVICS_QUESTIONS.filter((q) => q.part === p).map((q) => {
        const official = `${q.n}. ${q.q} ${q.star ? "★ " : ""}Answer: ${q.a.join("; ")}`;
        const note = q.note ? CIVICS_FACTS.notes[q.note] : null;
        return {
          en: `${official}${q.now ? ` (today: ${q.now.join(", ")})` : ""}${note ? ` ${note.en}` : ""}`,
          // Spanish page: the official English first (marked as English), then the Spanish study help.
          esEn: official,
          es: `${q.es ? `${q.es.q} ${q.es.a.join("; ")}` : ""}${q.now ? ` (hoy: ${q.now.join(", ")})` : ""}${note ? ` ${note.es}` : ""}`,
        };
      }),
    })),
    places: CIVICS_HELP,
    sources: CIVICS_SOURCES,
    checked: CIVICS_CHECKED,
  },
  {
    id: "legal",
    group: "legal",
    slug: { en: "legal-aid", es: "ayuda-legal" },
    target: { tab: "legal" },
    name: { en: "Free and low-cost legal help", es: "Ayuda legal gratis o de bajo costo" },
    summary: {
      en: "Legal aid offices near Stanislaus County, and how to avoid fake “notarios”.",
      es: "Oficinas de ayuda legal cerca del condado de Stanislaus, y cómo evitar a los “notarios” falsos.",
    },
    intro: copy("legalLead"),
    groups: [],
    places: [],
    sources: LEGAL_FACTS.sources,
    checked: LEGAL_FACTS.checked,
  },
  {
    id: "family-plan",
    group: "immigration",
    slug: { en: "family-plan", es: "plan-familiar" },
    target: { tab: "immigration", view: "plan" },
    name: { en: FAMILY_PLAN_COPY.en.title, es: FAMILY_PLAN_COPY.es.title },
    summary: {
      en: "Write down who will care for your children, who to call and where your documents are, then print it for your family. Private: nothing is saved.",
      es: "Anote quién cuidará a sus hijos, a quién llamar y dónde están sus documentos, y luego imprímalo para su familia. Privado: no se guarda nada.",
    },
    intro: {
      en: `${FAMILY_PLAN_COPY.en.lead} The free tool asks the questions below, keeps your answers only on your phone, and prints a clean copy. You can also print a blank plan to fill in by hand.`,
      es: `${FAMILY_PLAN_COPY.es.lead} La herramienta gratis hace las preguntas de abajo, guarda sus respuestas solo en su teléfono e imprime una copia limpia. También puede imprimir un plan en blanco para llenarlo a mano.`,
    },
    // The plan's own sections, with the facts each one carries.
    groups: PLAN_SECTIONS.filter((s) => PLAN_FACTS[s.id]).map((s) => group(s.title, PLAN_FACTS[s.id]!)),
    sections: [
      {
        title: { en: "What the plan asks you to write down", es: "Lo que el plan le pide anotar" },
        items: PLAN_SECTIONS.map((s) => ({
          en: `${s.title.en}: ${s.fields.map((f) => f.label.en).join("; ")}.`,
          es: `${s.title.es}: ${s.fields.map((f) => f.label.es).join("; ")}.`,
        })),
      },
    ],
    places: [RAPID_RESPONSE],
    sources: PLAN_SOURCES,
    checked: PLAN_CHECKED,
  },
  {
    id: "daca",
    group: "immigration",
    slug: { en: "daca-renewal", es: "renovar-daca" },
    target: { tab: "immigration", view: "daca" },
    name: { en: DACA_COPY.en.title, es: DACA_COPY.es.title },
    summary: {
      en: "When USCIS wants your DACA renewal (120 to 150 days before it expires), what to send, what it costs, and where DACA stands in court.",
      es: "Cuándo quiere USCIS su renovación de DACA (entre 120 y 150 días antes de que caduque), qué enviar, cuánto cuesta, y cómo va DACA en las cortes.",
    },
    intro: {
      en: "USCIS wants DACA renewals filed 120 to 150 days (4 to 5 months) before DACA expires. The free tool counts the dates for you from your expiration date, and tells you what to do if it has already expired. This is general information from USCIS, not legal advice for your case.",
      es: "USCIS quiere que las renovaciones de DACA se presenten entre 120 y 150 días (de 4 a 5 meses) antes de que caduque DACA. La herramienta gratis calcula las fechas con su fecha de vencimiento, y le dice qué hacer si ya caducó. Es información general de USCIS, no consejo legal para su caso.",
    },
    groups: [
      group({ en: DACA_COPY.en.nowTitle, es: DACA_COPY.es.nowTitle }, DACA_FACTS.status),
      group({ en: DACA_COPY.en.timingTitle, es: DACA_COPY.es.timingTitle }, DACA_FACTS.timing),
      group({ en: DACA_COPY.en.gatherTitle, es: DACA_COPY.es.gatherTitle }, DACA_FACTS.gather),
      group({ en: DACA_COPY.en.feesTitle, es: DACA_COPY.es.feesTitle }, DACA_FACTS.fees),
      group({ en: DACA_COPY.en.travelTitle, es: DACA_COPY.es.travelTitle }, DACA_FACTS.travel),
      group({ en: DACA_COPY.en.scamTitle, es: DACA_COPY.es.scamTitle }, byId(RIGHTS_FACTS.scams, "scam-notario")),
    ],
    places: DACA_HELP,
    sources: DACA_SOURCES,
    checked: DACA_CHECKED,
  },
];

export const toolById = (id: ToolId): ToolPage => {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`landing: no tool "${id}"`);
  return t;
};
