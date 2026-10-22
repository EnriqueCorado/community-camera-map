// Wording for the family preparedness plan builder, per language. What the
// form asks is in family-plan.ts; the cited facts in family-plan-facts.ts.
import type { Lang } from "../i18n";

export interface FamilyPlanCopy {
  title: string;
  lead: string;
  private: string;
  sensitive: string;
  emergency: string;
  rightsLink: string;
  learnMore: string;
  caaLinks: string;
  caaFormEn: string;
  caaFormEs: string;
  caaHelp: string;
  gc211: string;
  ilrcPlan: string;
  todo: string;
  add: (item: string) => string;
  remove: (item: string, n: number) => string;
  entry: (item: string, n: number) => string;
  added: (item: string, n: number) => string;
  removed: (item: string, n: number) => string;
  legalButton: string;
  doneTitle: string;
  printLang: string;
  print: string;
  printBlank: string;
  printHint: string;
  clear: string;
  clearAsk: string;
  clearYes: string;
  clearNo: string;
  cleared: string;
  // On paper
  paperTitle: string;
  paperMade: (date: string) => string;
  paperKeep: string;
  paperBlankLead: string;
  paperFrom: string;
}

const en: FamilyPlanCopy = {
  title: "Make a family emergency plan",
  lead: "Write down who can care for your children, who to call, and where your documents are, so your family knows what to do if you are detained or can’t come home. Then print it or save it as a PDF and give a copy to your caregiver. Free, with no sign-up.",
  private: "What you type stays on this device and is never sent anywhere. It is erased when you close Free Help or this page, so print or save it first.",
  sensitive: "This plan can hold private information. Write only what your caregiver needs, and keep the paper as safe as your documents.",
  emergency: "If agents are at your door right now, go to Know your rights.",
  rightsLink: "Know your rights",
  learnMore: "What the law and legal groups say",
  caaLinks: "The official form, free:",
  caaFormEn: "Caregiver’s Authorization Affidavit (PDF, English)",
  caaFormEs: "in Spanish (PDF)",
  caaHelp: "California Courts: how it works",
  gc211: "Form GC-211, nomination of guardian",
  ilrcPlan: "ILRC’s full family preparedness plan (PDF)",
  todo: "Done so far",
  add: (item) => `Add another (${item.toLowerCase()})`,
  remove: (item, n) => `Remove ${item.toLowerCase()} ${n}`,
  entry: (item, n) => `${item} ${n}`,
  added: (item, n) => `${item} ${n} added.`,
  removed: (item, n) => `${item} ${n} removed.`,
  legalButton: "See free legal help near you",
  doneTitle: "When you’re done",
  printLang: "Language of the printed plan",
  print: "Print or save as PDF",
  printBlank: "Print a blank plan to fill in by hand",
  printHint: "To save it as a PDF, choose “Save as PDF” in the print window. Only the plan is printed.",
  clear: "Erase everything",
  clearAsk: "Erase everything you typed in this plan? This can’t be undone.",
  clearYes: "Yes, erase it",
  clearNo: "Cancel",
  cleared: "Everything you typed was erased.",
  paperTitle: "Family emergency plan",
  paperMade: (d) => `Made on ${d}.`,
  paperKeep: "Keep this somewhere safe, and give a copy to your caregiver. Look it over every year.",
  paperBlankLead: "Fill this in by hand. Keep it somewhere safe, and give a copy to your caregiver.",
  paperFrom: "Free plan from the Community Camera Map’s Free Help tools. Not legal advice.",
};

const es: FamilyPlanCopy = {
  title: "Haga un plan familiar de emergencia",
  lead: "Anote quién puede cuidar a sus hijos, a quién llamar y dónde están sus documentos, para que su familia sepa qué hacer si lo detienen o no puede regresar a casa. Luego imprímalo o guárdelo como PDF y dele una copia a su cuidador. Gratis y sin registrarse.",
  private: "Lo que escribe se queda en este aparato y nunca se envía a ninguna parte. Se borra al cerrar Ayuda gratis o esta página, así que imprímalo o guárdelo antes.",
  sensitive: "Este plan puede tener información privada. Escriba solo lo que su cuidador necesita, y guarde el papel tan seguro como sus documentos.",
  emergency: "Si hay agentes en su puerta ahora mismo, vaya a Conozca sus derechos.",
  rightsLink: "Conozca sus derechos",
  learnMore: "Lo que dicen la ley y las organizaciones legales",
  caaLinks: "El formulario oficial, gratis:",
  caaFormEn: "Declaración jurada de autorización para el cuidador (PDF, en inglés)",
  caaFormEs: "en español (PDF)",
  caaHelp: "Cortes de California: cómo funciona",
  gc211: "Formulario GC-211, nominación de tutor",
  ilrcPlan: "El plan completo de preparación familiar del ILRC (PDF)",
  todo: "Lo que ya hicimos",
  add: (item) => `Agregar otro (${item.toLowerCase()})`,
  remove: (item, n) => `Quitar ${item.toLowerCase()} ${n}`,
  entry: (item, n) => `${item} ${n}`,
  added: (item, n) => `Se agregó: ${item.toLowerCase()} ${n}.`,
  removed: (item, n) => `Se quitó: ${item.toLowerCase()} ${n}.`,
  legalButton: "Ver ayuda legal gratis cerca de usted",
  doneTitle: "Cuando termine",
  printLang: "Idioma del plan impreso",
  print: "Imprimir o guardar como PDF",
  printBlank: "Imprimir un plan en blanco para llenarlo a mano",
  printHint: "Para guardarlo como PDF, elija “Guardar como PDF” en la ventana de impresión. Solo se imprime el plan.",
  clear: "Borrar todo",
  clearAsk: "¿Borrar todo lo que escribió en este plan? No se puede deshacer.",
  clearYes: "Sí, borrarlo",
  clearNo: "Cancelar",
  cleared: "Se borró todo lo que escribió.",
  paperTitle: "Plan familiar de emergencia",
  paperMade: (d) => `Hecho el ${d}.`,
  paperKeep: "Guárdelo en un lugar seguro y dele una copia a su cuidador. Revíselo cada año.",
  paperBlankLead: "Llénelo a mano. Guárdelo en un lugar seguro y dele una copia a su cuidador.",
  paperFrom: "Plan gratis de las herramientas de Ayuda Gratis del Mapa Comunitario de Cámaras. No es consejo legal.",
};

export const FAMILY_PLAN_COPY: Record<Lang, FamilyPlanCopy> = { en, es };
