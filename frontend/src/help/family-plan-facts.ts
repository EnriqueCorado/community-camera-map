// Family preparedness plan: what ILRC, the California courts, the Attorney
// General and Ready.gov say, in their words and their own Spanish where it
// exists. Research and quotes: ~/dev/outreach-help-2026-10/research/family-plan.*
// Some facts are shared with the know-your-rights page (rights-facts.ts), so
// they are checked and updated in one place.
import type { Fact } from "./facts";
import type { SourceRef } from "../components/help/ui";
import type { PlanSectionId } from "./family-plan";
import { RIGHTS_FACTS } from "./rights-facts";

export const PLAN_CHECKED = "2026-10-22";

const rights = (id: string): Fact => {
  const all = Object.values(RIGHTS_FACTS).flat() as Fact[];
  const fact = all.find((x) => x.id === id);
  if (!fact) throw new Error(`family plan: no rights fact "${id}"`);
  return fact;
};

const ILRC = "ILRC, Step-by-Step Family Preparedness Plan (2026)";
const CAA_FORM = "Judicial Council of California, Caregiver’s Authorization Affidavit (rev. Jan 1, 2026)";

export const PLAN_LINKS = {
  ilrc: "https://www.ilrc.org/community-resources/know-your-rights/step-step-family-preparedness-plan",
  ilrcPdf: { en: "https://www.ilrc.org/sites/default/files/2026-04/Step-by-Step-Family-Preparedness-Plan-ENG.pdf", es: "https://www.ilrc.org/sites/default/files/2026-04/Step-by-Step-Family-Preparedness-Plan-SPA.pdf" },
  caaForm: { en: "https://selfhelp.courts.ca.gov/sites/default/files/2026-01/CaregiversAuthorizationAffidavit_final.pdf", es: "https://selfhelp.courts.ca.gov/sites/default/files/2026-01/SP_CaregiversAuthorizationAffidavit_FiNAL.pdf" },
  caaPage: { en: "https://selfhelp.courts.ca.gov/guardianship/other-options", es: "https://selfhelp.courts.ca.gov/es/tutela/otras-opciones" },
  gc211: "https://selfhelp.courts.ca.gov/jcc-form/GC-211",
} as const;

/** Cited facts, shown under the plan section they belong to. */
export const PLAN_FACTS: Partial<Record<PlanSectionId, Fact[]>> = {
  contacts: [
    {
      id: "plan-memorize",
      cite: ILRC,
      en: "Memorize or carry the phone number of the person you will call in an emergency: someone who can put your plan into action, call your immigration lawyer, and get to your important documents.",
      es: "Memorice o lleve consigo el número de teléfono de la persona a la que llamará en una emergencia: alguien que pueda poner en marcha su plan, llamar a su abogado de inmigración y llegar a sus documentos importantes.",
    },
  ],
  caregiver: [
    rights("plan-caregiver-options"),
    {
      id: "caa-what",
      cite: CAA_FORM,
      en: "The Caregiver’s Authorization Affidavit lets an adult (18 or older) whose home the child lives in enroll the child in school and consent to school-related medical care. A relative can also consent to other medical and dental care. It does not give the caregiver legal custody, and it can’t be used to keep a child against a parent’s wishes. It doesn’t need a parent’s signature, a notary or a court. Schools must accept it. It is valid only in California.",
      es: "La Declaración Jurada de Autorización del Cuidador permite que un adulto (de 18 años o más) con quien vive el menor lo inscriba en la escuela y dé su consentimiento para la atención médica relacionada con la escuela. Un pariente también puede dar su consentimiento para otra atención médica y dental. No le da la custodia legal al cuidador, y no se puede usar para mantener a un menor en contra de la voluntad de sus padres. No necesita la firma de los padres, ni notario, ni la corte. La escuela, por ley, debe aceptarla. Solo es válida en California.",
    },
    {
      id: "caa-when",
      cite: `${ILRC}, Part IV`,
      en: "ILRC’s advice: have the caregiver fill out the affidavit now, but sign and date it only when it is needed. Don’t give it to the school or doctor until the child is living with the caregiver and you can’t make the decisions. Keep a copy in your file of important documents.",
      es: "El consejo del ILRC: que el cuidador llene la declaración desde ahora, pero que la firme y le ponga fecha solo cuando se necesite. No la entregue a la escuela ni al doctor hasta que el menor viva con el cuidador y usted no pueda tomar las decisiones. Guarde una copia en su archivo de documentos importantes.",
    },
    {
      id: "caa-expire",
      cite: `${CAA_FORM}; California Courts Self-Help Guide; ILRC`,
      en: "The official form (new version since January 1, 2026) says it does not expire, but it stops being valid if the child moves out, and the caregiver must tell the school and doctors. The courts’ help page still says to sign a new one each year, so making a fresh one each year is a simple way to stay current. If you have a version from before 2026, make a new one. If anything on the form changes, such as the caregiver’s address, fill out a new one.",
      es: "El formulario oficial (nueva versión desde el 1 de enero de 2026) dice que no tiene fecha de vencimiento, pero deja de ser válido si el menor ya no vive con el cuidador, y el cuidador debe avisar a la escuela y a los doctores. La página de ayuda de las cortes todavía dice que hay que firmar una nueva cada año, así que hacer una nueva cada año es una forma sencilla de mantenerla al día. Si tiene una versión de antes de 2026, haga una nueva. Si cambia algo del formulario, como la dirección del cuidador, llene uno nuevo.",
    },
    {
      id: "caa-who",
      cite: `${ILRC}, Part IV; ${CAA_FORM}`,
      en: "The caregiver does not need immigration status, but ideally is someone who is not also at risk of detention. On the form they give a California driver’s license or ID number, or a government-issued consular ID number; without those, another ID such as a Social Security or Medi-Cal number.",
      es: "El cuidador no necesita tener estatus migratorio, pero lo ideal es que no corra también el riesgo de ser detenido. En el formulario da el número de su licencia de manejo o identificación de California, o de una identificación consular emitida por un gobierno; si no tiene esas, otra identificación, como el número de Seguro Social o de Medi-Cal.",
    },
    rights("plan-joint-guardianship"),
    {
      id: "poa-children",
      cite: ILRC,
      en: "In California, a power of attorney can’t give someone custody of your children; only a court can. ILRC does not recommend using one to name a caregiver for your children.",
      es: "En California, un poder notarial no puede darle a otra persona la custodia de sus hijos; solo una corte puede hacerlo. El ILRC no recomienda usar uno para nombrar a un cuidador para sus hijos.",
    },
  ],
  children: [
    rights("plan-school-contacts"),
    {
      id: "children-medical",
      cite: ILRC,
      en: "Write down each child’s medical conditions, allergies, medicines, doctor and health insurance. Give a copy to the school and to the caregiver, and tell your children where to find it.",
      es: "Anote las condiciones médicas, alergias y medicamentos de cada niño, y la información de su doctor y su seguro médico. Dele una copia a la escuela y al cuidador, y dígales a sus hijos dónde encontrarla.",
    },
    {
      id: "children-talk",
      cite: ILRC,
      en: "Without worrying them, tell your children they will be taken care of if you can’t be there, even for a short time, and who will care for them until you can.",
      es: "Sin preocuparlos, dígales a sus hijos que estarán bien cuidados si usted no puede estar, aunque sea por poco tiempo, y quién los cuidará hasta que usted pueda.",
    },
    {
      id: "children-passports",
      cite: ILRC,
      en: "Make sure your children have passports. For children born in the U.S., see travel.state.gov; for children born in another country, ask that country’s embassy or consulate.",
      es: "Asegúrese de que sus hijos tengan pasaporte. Si nacieron en EE. UU., vea travel.state.gov; si nacieron en otro país, consulte con la embajada o el consulado de ese país.",
    },
  ],
  documents: [rights("plan-documents")],
  legal: [
    {
      id: "plan-consulate",
      cite: ILRC,
      en: "Have the contact information for your country’s nearest consulate. Many consulates have an emergency number; write it down in case you are detained.",
      es: "Tenga a mano la información de contacto del consulado de su país más cercano. Muchos consulados tienen un número de emergencia; anótelo por si lo detienen.",
    },
  ],
  money: [
    {
      id: "poa-money",
      cite: `${ILRC}; California Courts Self-Help Guide`,
      en: "A power of attorney can let someone you trust handle your money for you, for example to pay the rent or provide for your children. It has technical requirements, so talk to a trusted legal provider before you sign one.",
      es: "Un poder notarial puede permitir que alguien de confianza maneje su dinero, por ejemplo para pagar la renta o mantener a sus hijos. Tiene requisitos técnicos, así que hable con un proveedor legal de confianza antes de firmar uno.",
    },
  ],
  pets: [
    {
      id: "plan-pets",
      cite: "Ready.gov (FEMA), Make a Plan",
      en: "Talk with the people in your network about how they can help each other, including with the care of children and pets.",
      es: "Hablen con las personas de su red sobre cómo se pueden ayudar entre sí, incluso con el cuidado de los niños y las mascotas.",
    },
  ],
};

export const PLAN_SOURCES: SourceRef[] = [
  { label: "ILRC: Step-by-Step Family Preparedness Plan", url: PLAN_LINKS.ilrc },
  { label: "ILRC: Family Preparedness Plan (PDF, English)", url: PLAN_LINKS.ilrcPdf.en },
  { label: "ILRC: Plan de Preparación Familiar (PDF, español)", url: PLAN_LINKS.ilrcPdf.es },
  { label: "California Courts: Caregiver’s Authorization Affidavit (PDF, English)", url: PLAN_LINKS.caaForm.en },
  { label: "Cortes de California: Declaración jurada de autorización para el cuidador (PDF, español)", url: PLAN_LINKS.caaForm.es },
  { label: "California Courts Self-Help Guide: other options than guardianship", url: PLAN_LINKS.caaPage.en },
  { label: "California Courts: form GC-211, nomination of guardian", url: PLAN_LINKS.gc211 },
  { label: "California Attorney General: AB 495 bulletin (school emergency contacts)", url: "https://oag.ca.gov/system/files/media/ab-495-bulletin.pdf" },
  { label: "Ready.gov: Make a Plan", url: "https://www.ready.gov/plan" },
];
