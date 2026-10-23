// Wording for the immigration court guide, per language. The facts are in
// court-facts.ts; the A-Number helper is in court.ts.
import type { Lang } from "../i18n";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface CourtCopy {
  title: string;
  lead: string;
  goTitle: string;
  goText: string;
  checkTitle: string;
  private: string;
  aLabel: string;
  aHint: string;
  aInvalid: string;
  aResult: Fn<[string]>;
  aPadded: string;
  aCall: string;
  aDial: Fn<[string]>;
  acisLink: string;
  acisNote: string;
  findTitle: string;
  courtsTitle: string;
  moveTitle: string;
  respondentPortal: string;
  ar11Link: string;
  missedTitle: string;
  lawyerTitle: string;
  proBonoLink: string;
  bringTitle: string;
  bring: string[];
  changesTitle: string;
  scamsTitle: string;
  helpTitle: string;
  helpNote: string;
  legalButton: string;
  planButton: string;
  changing: Fn<[string]>;
}

const en: CourtCopy = {
  title: "Immigration court: find your hearing and keep your case on track",
  lead: "How to find your hearing date, which court has your case, what to do if you move, what happens if you miss a hearing, and how to find a lawyer. This is general information from the immigration courts (EOIR) and established legal groups, not legal advice for your case.",
  goTitle: "Go to every hearing, and talk to a lawyer first",
  goText: "If you miss a hearing, the judge can order you deported without you there. Talk to a lawyer or accredited representative before your court date, and keep your address up to date with the court.",
  checkTitle: "Check your case",
  private: "Your A-Number stays on this device. It isn’t saved, sent or put in a web address.",
  aLabel: "Your A-Number",
  aHint: "It’s on your court papers, after the letter A: 8 or 9 digits.",
  aInvalid: "Check the number: an A-Number has 8 or 9 digits.",
  aResult: (n) => `Your A-Number, to read back: ${n}`,
  aPadded: "Yours has 8 digits. The phone line and EOIR’s website both ask for 9, so put a 0 in front, as shown.",
  aCall: "Call",
  aDial: (d) => `and type these 9 digits: ${d}`,
  acisLink: "Check online with EOIR’s case information site",
  acisNote: "On the website you type the 9 digits yourself (with a 0 in front if yours has 8) and pick your nationality. If it finds nothing, that doesn’t mean you have no case: call the phone line or the court.",
  findTitle: "Finding your hearing",
  courtsTitle: "Which court has your case",
  moveTitle: "If you move",
  respondentPortal: "EOIR Respondent Portal (change your address online)",
  ar11Link: "USCIS: change your address (Form AR-11)",
  missedTitle: "If you miss a hearing",
  lawyerTitle: "Lawyers and free legal help",
  proBonoLink: "EOIR’s list of free legal service providers",
  bringTitle: "Before your hearing",
  bring: [
    "Your hearing notice and every paper you got from the court or immigration.",
    "A photo ID, if you have one.",
    "The name and phone number of your lawyer, or of someone you trust.",
    "Plan to arrive early: courts have security screening.",
    "Tell the court which language (and dialect) you speak best as early as you can. EOIR’s Practice Manual says the court provides an interpreter at government expense when your English isn’t enough, and asks for requests at least 30 days before the hearing. Tell your lawyer too.",
  ],
  changesTitle: "What changed in 2025–26",
  scamsTitle: "Watch out for scams",
  helpTitle: "Nonprofits near Modesto approved to give immigration legal help",
  helpNote: "These are DOJ-recognized organizations. Not every one takes immigration court cases: call to ask, and ask about cost.",
  legalButton: "See free legal help near you",
  planButton: "Make a family emergency plan",
  changing: (d) => `Some of this is being decided in court right now. Last checked ${d}.`,
};

const es: CourtCopy = {
  title: "Corte de inmigración: encuentre su audiencia y mantenga su caso al día",
  lead: "Cómo encontrar la fecha de su audiencia, qué corte tiene su caso, qué hacer si se muda, qué pasa si falta a una audiencia y cómo encontrar un abogado. Es información general de las cortes de inmigración (EOIR) y de organizaciones legales reconocidas, no consejo legal para su caso.",
  goTitle: "Vaya a todas sus audiencias, y hable antes con un abogado",
  goText: "Si falta a una audiencia, el juez puede ordenar su deportación sin que usted esté presente. Hable con un abogado o un representante acreditado antes de su fecha en la corte, y mantenga su dirección al día con la corte.",
  checkTitle: "Revise su caso",
  private: "Su Número A se queda en este aparato. No se guarda, no se envía y no se pone en ninguna dirección web.",
  aLabel: "Su Número A (A-Number)",
  aHint: "Está en sus papeles de la corte, después de la letra A: 8 o 9 dígitos.",
  aInvalid: "Revise el número: un Número A tiene 8 o 9 dígitos.",
  aResult: (n) => `Su Número A, para leerlo: ${n}`,
  aPadded: "El suyo tiene 8 dígitos. La línea telefónica y el sitio web de EOIR piden 9, así que ponga un 0 al principio, como se ve aquí.",
  aCall: "Llame al",
  aDial: (d) => `y marque estos 9 dígitos: ${d}`,
  acisLink: "Revisar en línea en el sitio de información de casos de EOIR",
  acisNote: "En el sitio usted mismo escribe los 9 dígitos (con un 0 al principio si el suyo tiene 8) y elige su nacionalidad. Si no encuentra nada, eso no significa que no tenga un caso: llame a la línea telefónica o a la corte.",
  findTitle: "Cómo encontrar su audiencia",
  courtsTitle: "Qué corte tiene su caso",
  moveTitle: "Si se muda",
  respondentPortal: "Portal para Demandados de EOIR (cambie su dirección en línea, en inglés)",
  ar11Link: "USCIS: cambio de dirección (formulario AR-11, en inglés)",
  missedTitle: "Si falta a una audiencia",
  lawyerTitle: "Abogados y ayuda legal gratis",
  proBonoLink: "Lista de EOIR de proveedores de servicios legales gratis (en inglés)",
  bringTitle: "Antes de su audiencia",
  bring: [
    "Su aviso de audiencia y todos los papeles que recibió de la corte o de inmigración.",
    "Una identificación con foto, si tiene.",
    "El nombre y el teléfono de su abogado, o de alguien de confianza.",
    "Planee llegar temprano: en las cortes hay revisión de seguridad.",
    "Dígale a la corte lo antes posible qué idioma (y qué variante o dialecto) habla mejor. El Manual de Práctica de EOIR dice que la corte da un intérprete por cuenta del gobierno cuando su inglés no es suficiente, y pide solicitarlo al menos 30 días antes de la audiencia. Dígaselo también a su abogado.",
  ],
  changesTitle: "Qué cambió en 2025–26",
  scamsTitle: "Cuidado con las estafas",
  helpTitle: "Organizaciones sin fines de lucro cerca de Modesto aprobadas para dar ayuda legal de inmigración",
  helpNote: "Son organizaciones reconocidas por el Departamento de Justicia. No todas aceptan casos en la corte de inmigración: llame para preguntar, y pregunte el costo.",
  legalButton: "Ver ayuda legal gratis cerca de usted",
  planButton: "Hacer un plan familiar de emergencia",
  changing: (d) => `Parte de esto se está decidiendo en las cortes ahora mismo. Revisado por última vez el ${d}.`,
};

export const COURT_COPY: Record<Lang, CourtCopy> = { en, es };
