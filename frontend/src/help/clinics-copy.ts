// Wording for the clinic finder, per language. The clinics and the cited facts
// are in clinics-facts.ts.
import type { Lang } from "../i18n";
import type { Need, Org } from "./clinics-facts";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface ClinicsCopy {
  title: string;
  lead: string;
  private: string;
  crisisTitle: string;
  crisis911: string;
  /** The 988 links (a 3-digit number, so not a regular phone link). */
  crisisCall: string;
  crisisText: string;
  townLabel: string;
  townAll: string;
  needLabel: string;
  needAll: string;
  needs: Record<Need, string>;
  count: Fn<[number]>;
  nearest: Fn<[string]>;
  cost: Record<Org, string>;
  dentalText: string;
  directions: string;
  page: string;
  callFirst: string;
  payTitle: string;
  rightsTitle: string;
  coverageTitle: string;
  billsButton: string;
  helpTitle: string;
  changing: Fn<[string]>;
}

const en: ClinicsCopy = {
  title: "Free and low-cost clinics",
  lead: "Community health centers in Stanislaus County that see you even if you have no insurance or can’t pay, with fees based on your income. Pick your town and what you need.",
  private: "Your choices stay on this device and aren’t saved or sent anywhere.",
  crisisTitle: "In a mental health or substance use crisis",
  crisis911: "If someone is in danger right now, call 911.",
  crisisCall: "Call 988",
  crisisText: "Text 988",
  townLabel: "Your town",
  townAll: "All towns",
  needLabel: "What do you need?",
  needAll: "Anything",
  needs: {
    primary: "Doctor visit",
    urgent: "Urgent care, evenings or Saturdays",
    dental: "Dental",
    mental: "Mental health",
    women: "Women’s health and birth control",
    kids: "Children",
    vaccines: "Vaccines",
  },
  count: (n) => (n === 1 ? "1 place" : `${n} places`),
  nearest: (town) => `None listed in ${town} for this. These are the closest:`,
  cost: { gvhc: "Sliding fee", lumira: "Sliding fee", pp: "Ask about cost", county: "Free or low cost" },
  dentalText: "Dental appointments (text only)",
  directions: "See on a map",
  page: "Their page",
  callFirst: "Hours change, and clinics close on some days: call before you go.",
  payTitle: "If you don’t have insurance",
  rightsTitle: "Your rights at the clinic",
  coverageTitle: "Getting coverage",
  billsButton: "Got a hospital bill? See if you qualify for free or discounted care",
  helpTitle: "Help applying for Medi-Cal or other coverage",
  changing: (d) => `Clinic hours and Medi-Cal rules change. Last checked ${d}.`,
};

const es: ClinicsCopy = {
  title: "Clínicas gratis y de bajo costo",
  lead: "Centros de salud comunitarios en el condado de Stanislaus que lo atienden aunque no tenga seguro o no pueda pagar, con cuotas según sus ingresos. Elija su ciudad y lo que necesita.",
  private: "Lo que elija se queda en este aparato y no se guarda ni se envía a ninguna parte.",
  crisisTitle: "En una crisis de salud mental o de uso de sustancias",
  crisis911: "Si alguien está en peligro ahora mismo, llame al 911.",
  crisisCall: "Llamar al 988",
  crisisText: "Mandar un texto al 988",
  townLabel: "Su ciudad",
  townAll: "Todas las ciudades",
  needLabel: "¿Qué necesita?",
  needAll: "Cualquier cosa",
  needs: {
    primary: "Consulta médica",
    urgent: "Atención urgente, por la tarde o sábados",
    dental: "Dental",
    mental: "Salud mental",
    women: "Salud de la mujer y anticonceptivos",
    kids: "Niños",
    vaccines: "Vacunas",
  },
  count: (n) => (n === 1 ? "1 lugar" : `${n} lugares`),
  nearest: (town) => `No hay ninguno en ${town} para esto. Estos son los más cercanos:`,
  cost: { gvhc: "Cuota según ingresos", lumira: "Cuota según ingresos", pp: "Pregunte el costo", county: "Gratis o de bajo costo" },
  dentalText: "Citas dentales (solo texto)",
  directions: "Ver en el mapa",
  page: "Su página",
  callFirst: "Los horarios cambian y las clínicas cierran algunos días: llame antes de ir.",
  payTitle: "Si no tiene seguro",
  rightsTitle: "Sus derechos en la clínica",
  coverageTitle: "Cómo conseguir cobertura",
  billsButton: "¿Le llegó una cuenta de hospital? Vea si califica para atención gratis o con descuento",
  helpTitle: "Ayuda para solicitar Medi-Cal u otra cobertura",
  changing: (d) => `Los horarios de las clínicas y las reglas de Medi-Cal cambian. Revisado por última vez el ${d}.`,
};

export const CLINICS_COPY: Record<Lang, ClinicsCopy> = { en, es };
