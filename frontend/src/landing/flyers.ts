// Printable flyers: one letter-size page with English and Spanish side by
// side, each with its own QR code to that language's page. Kept free of
// figures that change every year (wage rates, poverty lines), so a printed
// stack stays correct.
import type { Lang } from "../i18n";
import { GROUPS, toolById, type GroupId, type ToolId } from "./tools";

export interface FlyerSide {
  headline: string;
  bullets: string[];
}

export interface Flyer {
  id: string;
  /** Where each side's QR code points: a tool page, or a section of the home page. */
  to: { tool: ToolId } | { group: GroupId } | "home";
  /** "cards": four small cards per sheet, to cut apart and hand out. */
  layout: "page" | "cards";
  side: Record<Lang, FlyerSide>;
}

export const FLYERS: readonly Flyer[] = [
  {
    id: "general",
    to: "home",
    layout: "page",
    side: {
      en: {
        headline: "Free help with hospital bills, rent, work and benefits",
        bullets: [
          "Hospital bill? See if you qualify for free or discounted care.",
          "Rent increase or eviction notice? Check the rules and your deadline.",
          "Unpaid wages or heat at work? See what your employer must do.",
          "Find benefits your family may get, and free legal help.",
        ],
      },
      es: {
        headline: "Ayuda gratis con cuentas de hospital, renta, trabajo y beneficios",
        bullets: [
          "¿Cuenta de hospital? Vea si califica para atención gratis o con descuento.",
          "¿Aumento de renta o aviso de desalojo? Revise las reglas y su plazo.",
          "¿Salarios no pagados o calor en el trabajo? Vea lo que su empleador debe hacer.",
          "Encuentre beneficios para su familia y ayuda legal gratis.",
        ],
      },
    },
  },
  {
    id: "hospital-bills",
    to: { tool: "medical" },
    layout: "page",
    side: {
      en: {
        headline: "Got a hospital bill you can’t pay?",
        bullets: [
          "No insurance, or high medical bills? Many families can get free or discounted care at any California hospital.",
          "You can apply even after the bill comes, even if it went to collections.",
          "Immigration status doesn’t matter.",
          "Check in a few minutes if you may qualify, and get a letter to ask for help.",
        ],
      },
      es: {
        headline: "¿Tiene una cuenta de hospital que no puede pagar?",
        bullets: [
          "¿No tiene seguro, o sus gastos médicos son altos? Muchas familias pueden recibir atención gratis o con descuento en cualquier hospital de California.",
          "Puede pedirla aun después de recibir la cuenta, incluso si ya está en cobranza.",
          "Su estatus migratorio no importa.",
          "Vea en unos minutos si podría calificar, y obtenga una carta para pedir la ayuda.",
        ],
      },
    },
  },
  {
    id: "medi-cal",
    to: { tool: "medi-cal-work" },
    layout: "page",
    side: {
      en: {
        headline: "New Medi-Cal work rules start in 2027",
        bullets: [
          "Many adults 19–64 will need 80 hours a month of work, school, training or volunteering, or $580 a month in pay.",
          "Many are exempt: parents of young children, pregnant people, people with serious health conditions, and more.",
          "It includes state-funded Medi-Cal. Answer every county letter.",
          "See if it applies to you, and what to do now.",
        ],
      },
      es: {
        headline: "Nuevas reglas de trabajo de Medi-Cal desde 2027",
        bullets: [
          "Muchos adultos de 19 a 64 años necesitarán 80 horas al mes de trabajo, escuela, capacitación o voluntariado, o ganar $580 al mes.",
          "Muchos están exentos: padres de niños pequeños, personas embarazadas, con problemas de salud serios, y más.",
          "Incluye el Medi-Cal pagado por el estado. Conteste toda carta del condado.",
          "Vea si aplica a usted y qué hacer ahora.",
        ],
      },
    },
  },
  {
    id: "citizenship",
    to: { tool: "citizenship" },
    layout: "page",
    side: {
      en: {
        headline: "Free citizenship test practice",
        bullets: [
          "All 128 official civics questions and answers, in USCIS’s own words.",
          "Practice tests that work like the real interview.",
          "Spanish help to study, and listen to each question in English.",
          "Free classes and help in Stanislaus County.",
        ],
      },
      es: {
        headline: "Práctica gratis para el examen de ciudadanía",
        bullets: [
          "Las 128 preguntas y respuestas oficiales de civismo, con las palabras de USCIS.",
          "Exámenes de práctica que funcionan como la entrevista de verdad.",
          "Ayuda en español para estudiar, y escuche cada pregunta en inglés.",
          "Clases y ayuda gratis en el condado de Stanislaus.",
        ],
      },
    },
  },
  {
    id: "renters",
    to: { group: "housing" },
    layout: "page",
    side: {
      en: {
        headline: "Renters: know your rights",
        bullets: [
          "Is your rent increase legal? Check it against California’s rent cap.",
          "Got an eviction notice? Count your deadline to respond and get free help fast.",
          "Need repairs, or your deposit back? Get a free letter in English or Spanish.",
          "A notice is not a court order. Only a court can order an eviction.",
        ],
      },
      es: {
        headline: "Inquilinos: conozca sus derechos",
        bullets: [
          "¿Es legal su aumento de renta? Revíselo con el tope de renta de California.",
          "¿Recibió un aviso de desalojo? Calcule su plazo para responder y consiga ayuda gratis rápido.",
          "¿Necesita reparaciones, o que le devuelvan su depósito? Obtenga una carta gratis en español o inglés.",
          "Un aviso no es una orden de la corte. Solo una corte puede ordenar un desalojo.",
        ],
      },
    },
  },
  {
    id: "workers",
    to: { group: "work" },
    layout: "page",
    side: {
      en: {
        headline: "Workers: get paid what you earned",
        bullets: [
          "Overtime, minimum wage, missed breaks, late final pay: see what you may be owed.",
          "Learn how to file a free wage claim, without a lawyer.",
          "Heat at work: water, shade and cool-down breaks are your right.",
          "California protects workers whatever their immigration status.",
        ],
      },
      es: {
        headline: "Trabajadores: cobre lo que ganó",
        bullets: [
          "Horas extra, salario mínimo, descansos, pago final atrasado: vea lo que le podrían deber.",
          "Aprenda a presentar un reclamo de salario gratis, sin abogado.",
          "Calor en el trabajo: el agua, la sombra y los descansos para refrescarse son su derecho.",
          "California protege a los trabajadores sin importar su estatus migratorio.",
        ],
      },
    },
  },
  {
    id: "cards",
    to: "home",
    layout: "cards",
    side: {
      en: { headline: "Free help: hospital bills, rent, work, benefits", bullets: ["Free. Private. No sign‑up."] },
      es: { headline: "Ayuda gratis: hospital, renta, trabajo, beneficios", bullets: ["Gratis. Privado. Sin registrarse."] },
    },
  },
];

/** Shared flyer wording (both languages appear on every flyer). */
export const FLYER_COPY: Record<Lang, { scan: string; promise: string; note: string; print: string; back: string; indexTitle: string; indexLead: string }> = {
  en: {
    scan: "Scan with your phone camera",
    promise: "Free. Nothing you type is saved or shared. Your immigration status is never asked.",
    note: "General information, not legal advice. Built by a local volunteer; not a government service.",
    print: "Print this flyer",
    back: "All flyers",
    indexTitle: "Free printable flyers",
    indexLead:
      "Print these bilingual flyers for your office, clinic, church, school or workplace. Each has a QR code in English and one in Spanish. Letter size; print in color or black and white.",
  },
  es: {
    scan: "Escanee con la cámara de su teléfono",
    promise: "Gratis. Lo que escriba nunca se guarda ni se comparte. Nunca le preguntamos su estatus migratorio.",
    note: "Información general, no asesoría legal. Hecho por un voluntario local; no es un servicio del gobierno.",
    print: "Imprimir este volante",
    back: "Todos los volantes",
    indexTitle: "Volantes gratis para imprimir",
    indexLead:
      "Imprima estos volantes bilingües para su oficina, clínica, iglesia, escuela o lugar de trabajo. Cada uno tiene un código QR en inglés y otro en español. Tamaño carta; a color o en blanco y negro.",
  },
};

/** Page path (under the site base) a flyer side's QR code opens. */
export function flyerTarget(f: Flyer, lang: Lang, dir: string): string {
  if (f.to === "home") return `${dir}/`;
  if ("tool" in f.to) return `${dir}/${toolById(f.to.tool).slug[lang]}/`;
  const id = f.to.group;
  const g = GROUPS.find((x) => x.id === id);
  return `${dir}/#${g?.anchor[lang] ?? ""}`;
}
