// Wording for the utility-bill help tool, per language. The facts (with
// citations) are in utilities-facts.ts; the discount programs and their income
// limits are the Benefits screener's (benefits-facts.ts).
import type { Lang } from "../i18n";

export interface UtilitiesCopy {
  title: string;
  lead: string;
  privateNote: string;
  shutoffBoxTitle: string;
  shutoffBoxText: string;
  shutoffBoxLink: string;
  whichTitle: string;
  formTitle: string;
  electric: string;
  electricHint: string;
  electricOpts: Record<"mid" | "tid" | "pge" | "unsure", string>;
  pgeGas: string;
  /** MID/TID homes before the gas question is answered: CARE isn't checked yet. */
  gasPending: string;
  website: string;
  size: string;
  sizeHint: string;
  income: string;
  incomeHint: string;
  per: string;
  gets: string;
  getsHint: string;
  resultsTitle: string;
  fillFirst: string;
  chooseUtility: string;
  shutoffTitle: string;
  shutoffPge: string;
  shutoffOthers: string;
  debtTitle: string;
  medicalTitle: string;
  medicalApply: Record<"pge" | "tid" | "mid", string>;
  scamsTitle: string;
  callTitle: string;
  notAdvice: string;
}

const en: UtilitiesCopy = {
  title: "Help with gas and electric bills",
  lead: "Discounts on your PG&E, MID or TID bill, help paying a bill you’re behind on, and what to do if you get a shutoff notice. For Stanislaus County. Free, and nothing you type leaves this page.",
  privateNote: "Your answers stay on this device and are erased when you leave this tool.",
  shutoffBoxTitle: "Got a shutoff notice?",
  shutoffBoxText: "Call your utility today and ask for a payment arrangement. If you’re behind, also call the Central Valley Opportunity Center at (209) 537-9217 about crisis help.",
  shutoffBoxLink: "What the rules say about shutoffs",
  whichTitle: "Which company sends your bill?",
  formTitle: "Which discounts can you get?",
  electric: "Who sends your ELECTRIC bill?",
  electricHint: "It’s the company name at the top of the bill.",
  electricOpts: { mid: "MID (Modesto Irrigation District)", tid: "TID (Turlock Irrigation District)", pge: "PG&E", unsure: "I’m not sure" },
  pgeGas: "Do you also get a GAS bill from PG&E?",
  gasPending: "Answer whether PG&E sends you a gas bill to see PG&E’s CARE discount.",
  website: "Website",
  size: "People in your household",
  sizeHint: "Everyone who lives with you and shares the bills, including you.",
  income: "Household income before taxes",
  incomeHint: "Add up everyone’s pay and other income, before taxes.",
  per: "That amount is",
  gets: "Does anyone in your home get any of these?",
  getsHint: "Some programs let you in through these, whatever your income.",
  resultsTitle: "What you may get",
  fillFirst: "Choose who sends your electric bill and enter your income to see your results.",
  chooseUtility: "Choose who sends your electric bill to see the discounts for your utility.",
  shutoffTitle: "If you get a shutoff notice",
  shutoffPge: "PG&E (state rules)",
  shutoffOthers: "MID, TID and crisis help",
  debtTitle: "Behind on a PG&E bill",
  medicalTitle: "Medical equipment or a health condition at home",
  medicalApply: { pge: "PG&E Medical Baseline", tid: "TID Medical Rate", mid: "MID Medical Life Support" },
  scamsTitle: "Watch out for scams",
  callTitle: "Who to call",
  notAdvice: "General information, not legal advice. Each company decides who qualifies.",
};

const es: UtilitiesCopy = {
  title: "Ayuda con las facturas de luz y gas",
  lead: "Descuentos en su factura de PG&E, MID o TID, ayuda para pagar una factura atrasada, y qué hacer si recibe un aviso de corte. Para el condado de Stanislaus. Gratis, y nada de lo que escriba sale de esta página.",
  privateNote: "Sus respuestas se quedan en este aparato y se borran al salir de esta herramienta.",
  shutoffBoxTitle: "¿Recibió un aviso de corte?",
  shutoffBoxText: "Llame hoy a su compañía y pida un arreglo de pagos. Si está atrasado, llame también al Central Valley Opportunity Center al (209) 537-9217 para pedir ayuda de emergencia.",
  shutoffBoxLink: "Lo que dicen las reglas sobre los cortes",
  whichTitle: "¿Qué compañía le manda la factura?",
  formTitle: "¿Qué descuentos puede recibir?",
  electric: "¿Quién le manda la factura de LUZ?",
  electricHint: "Es el nombre de la compañía arriba de la factura.",
  electricOpts: { mid: "MID (Distrito de Riego de Modesto)", tid: "TID (Distrito de Riego de Turlock)", pge: "PG&E", unsure: "No estoy seguro" },
  pgeGas: "¿También recibe una factura de GAS de PG&E?",
  gasPending: "Conteste si PG&E le manda una factura de gas para ver el descuento CARE de PG&E.",
  website: "Sitio web",
  size: "Personas en su hogar",
  sizeHint: "Todos los que viven con usted y comparten los gastos, incluyéndole a usted.",
  income: "Ingresos del hogar antes de impuestos",
  incomeHint: "Sume el pago y otros ingresos de todos, antes de impuestos.",
  per: "Esa cantidad es",
  gets: "¿Alguien en su casa recibe alguno de estos?",
  getsHint: "Algunos programas le dejan entrar por estos, sin importar sus ingresos.",
  resultsTitle: "Lo que puede recibir",
  fillFirst: "Elija quién le manda la factura de luz y escriba sus ingresos para ver los resultados.",
  chooseUtility: "Elija quién le manda la factura de luz para ver los descuentos de su compañía.",
  shutoffTitle: "Si recibe un aviso de corte",
  shutoffPge: "PG&E (reglas estatales)",
  shutoffOthers: "MID, TID y ayuda de emergencia",
  debtTitle: "Atrasado con una factura de PG&E",
  medicalTitle: "Equipo médico o una condición de salud en casa",
  medicalApply: { pge: "Medical Baseline de PG&E", tid: "Tarifa Médica de TID", mid: "Soporte Vital Médico de MID" },
  scamsTitle: "Cuidado con las estafas",
  callTitle: "A quién llamar",
  notAdvice: "Información general, no consejo legal. Cada compañía decide quién califica.",
};

export const UTILITIES_COPY: Record<Lang, UtilitiesCopy> = { en, es };
