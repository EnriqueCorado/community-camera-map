// Family preparedness plan: what the form asks, and the pure helpers the tool
// and its tests share. Kept free of React. Nothing here is stored anywhere:
// the tool holds a PlanState in memory and prints it.
import type { Lang } from "../i18n";
import type { Bilingual } from "./letter-types";

export type PlanFieldKind = "text" | "tel" | "multiline";

export interface PlanField {
  id: string;
  kind: PlanFieldKind;
  label: Bilingual;
  hint?: Bilingual;
}

export type PlanSectionId = "contacts" | "caregiver" | "children" | "health" | "documents" | "legal" | "money" | "pets";

export interface PlanSection {
  id: PlanSectionId;
  title: Bilingual;
  lead?: Bilingual;
  /** A list of entries (people, children) instead of one set of fields. */
  repeat?: { min: number; max: number; item: Bilingual };
  fields: readonly PlanField[];
  /** Boxes to tick; printed as ☐ / ☑. */
  todo?: readonly { id: string; label: Bilingual }[];
}

export type Entry = Record<string, string>;

export interface PlanState {
  entries: Record<PlanSectionId, Entry[]>;
  /** Ticked to-do boxes, by id. */
  done: Record<string, boolean>;
}

export const TEXT_MAX = 200;
export const MULTILINE_MAX = 1000;

const f = (id: string, kind: PlanFieldKind, en: string, es: string, hint?: Bilingual): PlanField => ({ id, kind, label: { en, es }, hint });

export const PLAN_SECTIONS: readonly PlanSection[] = [
  {
    id: "contacts",
    title: { en: "Emergency contacts", es: "Contactos de emergencia" },
    lead: {
      en: "People who can help right away, in the order to call them.",
      es: "Personas que pueden ayudar de inmediato, en el orden en que hay que llamarlas.",
    },
    repeat: { min: 2, max: 5, item: { en: "Contact", es: "Contacto" } },
    fields: [f("name", "text", "Name", "Nombre"), f("relation", "text", "Relationship", "Parentesco o relación"), f("phone", "tel", "Phone", "Teléfono")],
    todo: [
      {
        id: "memorized",
        label: {
          en: "Everyone in the family has memorized at least one of these numbers, or carries it on paper.",
          es: "Todos en la familia se saben de memoria al menos uno de estos números, o lo llevan en un papel.",
        },
      },
    ],
  },
  {
    id: "caregiver",
    title: { en: "Back-up caregiver for the children", es: "Cuidador de emergencia para los niños" },
    lead: {
      en: "The adult who will care for your children if you can't. Choose someone you and your children trust.",
      es: "El adulto que cuidará a sus hijos si usted no puede. Elija a alguien en quien usted y sus hijos confíen.",
    },
    fields: [
      f("name", "text", "Name", "Nombre"),
      f("relation", "text", "Relationship", "Parentesco o relación"),
      f("phone", "tel", "Phone", "Teléfono"),
      f("backup", "text", "If they can’t: second choice (name and phone)", "Si no puede: segunda opción (nombre y teléfono)"),
      f("agreed", "multiline", "What we agreed", "Lo que acordamos", {
        en: "For example: for how long, where the children will sleep, and who pays for what they need.",
        es: "Por ejemplo: por cuánto tiempo, dónde dormirán los niños y quién paga lo que necesiten.",
      }),
    ],
    todo: [
      { id: "talked", label: { en: "We talked with the caregiver about the plan.", es: "Hablamos con el cuidador sobre el plan." } },
      {
        id: "caa",
        label: {
          en: "The caregiver filled out a Caregiver’s Authorization Affidavit, and will sign and date it only if it’s needed.",
          es: "El cuidador llenó una Declaración Jurada de Autorización del Cuidador, y la firmará y fechará solo si se necesita.",
        },
      },
      {
        id: "guardian",
        label: {
          en: "We asked a trusted legal provider about nominating a guardian (form GC-211).",
          es: "Le preguntamos a un proveedor legal de confianza sobre nominar a un tutor (formulario GC-211).",
        },
      },
    ],
  },
  {
    id: "children",
    title: { en: "The children", es: "Los niños" },
    repeat: { min: 1, max: 6, item: { en: "Child", es: "Niño o niña" } },
    fields: [
      f("name", "text", "Name", "Nombre"),
      f("birth", "text", "Date of birth", "Fecha de nacimiento"),
      f("school", "text", "School or child care, and its phone", "Escuela o guardería, y su teléfono"),
      f("pickup", "text", "Who can pick them up", "Quién puede recogerlos"),
      f("health", "multiline", "Allergies, health conditions and medicines", "Alergias, condiciones de salud y medicamentos"),
      f("doctor", "text", "Doctor or clinic, phone, and health insurance or Medi-Cal", "Doctor o clínica, teléfono, y seguro médico o Medi-Cal"),
    ],
    todo: [
      {
        id: "schoolCard",
        label: {
          en: "We updated the emergency contacts at school and child care.",
          es: "Actualizamos los contactos de emergencia en la escuela y la guardería.",
        },
      },
      {
        id: "toldKids",
        label: {
          en: "We told the children, calmly, who will take care of them.",
          es: "Les dijimos a los niños, con calma, quién los cuidará.",
        },
      },
      {
        id: "passports",
        label: {
          en: "The children have passports, or we know how to get them.",
          es: "Los niños tienen pasaporte, o sabemos cómo sacarlo.",
        },
      },
    ],
  },
  {
    id: "health",
    title: { en: "Health of the adults", es: "Salud de los adultos" },
    fields: [
      f("needs", "multiline", "Medicines, allergies or health needs of the adults in the home", "Medicamentos, alergias o necesidades de salud de los adultos de la casa"),
      f("doctor", "text", "Doctor or clinic, and phone", "Doctor o clínica, y teléfono"),
    ],
  },
  {
    id: "documents",
    title: { en: "Important documents", es: "Documentos importantes" },
    lead: {
      en: "Write where things are, not the numbers on them. Tick what is in your file.",
      es: "Escriba dónde están las cosas, no los números que tienen. Marque lo que está en su archivo.",
    },
    fields: [
      f("where", "multiline", "Where the documents are, or who has copies", "Dónde están los documentos, o quién tiene copias"),
      f("aNumber", "text", "Who has a copy of my A-Number (if I have one)", "Quién tiene una copia de mi Número A (si tengo uno)"),
    ],
    todo: [
      { id: "doc-passports", label: { en: "Passports", es: "Pasaportes" } },
      { id: "doc-births", label: { en: "Birth certificates", es: "Actas de nacimiento" } },
      { id: "doc-caregiver", label: { en: "Caregiver’s affidavit or form GC-211", es: "Declaración del cuidador o formulario GC-211" } },
      { id: "doc-immigration", label: { en: "A-Number and immigration papers", es: "Número A y papeles de inmigración" } },
      { id: "doc-presence", label: { en: "Proof of how long you have lived in the U.S.", es: "Pruebas de cuánto tiempo ha vivido en EE. UU." } },
      { id: "doc-ids", label: { en: "IDs and driver’s licenses", es: "Identificaciones y licencias de manejo" } },
      { id: "doc-ssn", label: { en: "Social Security card or ITIN", es: "Tarjeta de Seguro Social o ITIN" } },
      { id: "doc-medical", label: { en: "Medical records and insurance cards", es: "Información médica y tarjetas del seguro" } },
      { id: "doc-marriage", label: { en: "Marriage certificate", es: "Acta de matrimonio" } },
      { id: "doc-orders", label: { en: "Any restraining order", es: "Cualquier orden de restricción" } },
    ],
  },
  {
    id: "legal",
    title: { en: "Legal help and your consulate", es: "Ayuda legal y su consulado" },
    fields: [
      f("lawyer", "text", "Lawyer or legal aid: name and phone", "Abogado o ayuda legal: nombre y teléfono"),
      f("consulate", "text", "My consulate: address and emergency phone", "Mi consulado: dirección y teléfono de emergencia"),
    ],
  },
  {
    id: "money",
    title: { en: "Money, rent and bills", es: "Dinero, renta y cuentas" },
    fields: [
      f("who", "text", "Who can pay the rent and bills", "Quién puede pagar la renta y las cuentas"),
      f("bills", "multiline", "Bills to keep paying, and how", "Cuentas que hay que seguir pagando, y cómo", {
        en: "Rent, light and gas, phone, car. Don't write passwords or card numbers.",
        es: "Renta, luz y gas, teléfono, carro. No escriba contraseñas ni números de tarjetas.",
      }),
      f("work", "text", "My job: who to call there", "Mi trabajo: a quién llamar ahí"),
    ],
  },
  {
    id: "pets",
    title: { en: "Pets and the car", es: "Mascotas y el carro" },
    fields: [
      f("pets", "multiline", "Pets: who will care for them, food, vet", "Mascotas: quién las cuidará, comida, veterinario"),
      f("car", "multiline", "Car: who has a spare key, where the papers are", "Carro: quién tiene la llave de repuesto, dónde están los papeles"),
    ],
  },
];

export const sectionById = (id: PlanSectionId): PlanSection => {
  const s = PLAN_SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`family plan: no section "${id}"`);
  return s;
};

const blankEntry = (s: PlanSection): Entry => Object.fromEntries(s.fields.map((x) => [x.id, ""]));

export function emptyPlan(): PlanState {
  const entries = Object.fromEntries(PLAN_SECTIONS.map((s) => [s.id, Array.from({ length: s.repeat?.min ?? 1 }, () => blankEntry(s))])) as PlanState["entries"];
  return { entries, done: {} };
}

const limit = (s: PlanSection, field: string) => (s.fields.find((x) => x.id === field)?.kind === "multiline" ? MULTILINE_MAX : TEXT_MAX);

export function setField(plan: PlanState, section: PlanSectionId, index: number, field: string, value: string): PlanState {
  const s = sectionById(section);
  const list = plan.entries[section];
  if (!list[index] || !(field in list[index])) return plan;
  const next = list.map((e, i) => (i === index ? { ...e, [field]: value.slice(0, limit(s, field)) } : e));
  return { ...plan, entries: { ...plan.entries, [section]: next } };
}

export function addEntry(plan: PlanState, section: PlanSectionId): PlanState {
  const s = sectionById(section);
  const list = plan.entries[section];
  if (!s.repeat || list.length >= s.repeat.max) return plan;
  return { ...plan, entries: { ...plan.entries, [section]: [...list, blankEntry(s)] } };
}

export function removeEntry(plan: PlanState, section: PlanSectionId, index: number): PlanState {
  const s = sectionById(section);
  const list = plan.entries[section];
  if (!s.repeat || list.length <= s.repeat.min || !list[index]) return plan;
  return { ...plan, entries: { ...plan.entries, [section]: list.filter((_, i) => i !== index) } };
}

export function toggleTodo(plan: PlanState, id: string): PlanState {
  return { ...plan, done: { ...plan.done, [id]: !plan.done[id] } };
}

const filled = (e: Entry) => Object.values(e).some((v) => v.trim() !== "");

/** Has the person typed or ticked anything? (Used to warn before leaving.) */
export function hasContent(plan: PlanState): boolean {
  return Object.values(plan.entries).some((list) => list.some(filled)) || Object.values(plan.done).some(Boolean);
}

export interface PrintLine {
  label: string;
  value: string;
  /** Set for the long answers: the blank plan leaves more room to write. */
  multiline?: true;
}

export interface PrintSection {
  id: PlanSectionId;
  title: string;
  /** One group of lines per entry (contact, child), each with its heading. */
  entries: { heading?: string; lines: PrintLine[] }[];
  todo: { label: string; done: boolean }[];
}

/**
 * What goes on paper, in `lang`. "filled": only what the person wrote or
 * ticked (empty sections are left out). "blank": every field with room to
 * write by hand, and every box unticked.
 */
export function printSections(plan: PlanState, lang: Lang, mode: "filled" | "blank"): PrintSection[] {
  const out: PrintSection[] = [];
  for (const s of PLAN_SECTIONS) {
    const list = mode === "blank" ? Array.from({ length: s.repeat ? Math.max(s.repeat.min, 2) : 1 }, () => blankEntry(s)) : plan.entries[s.id];
    const entries = list
      .map((e, i) => ({
        heading: s.repeat ? `${s.repeat.item[lang]} ${i + 1}` : undefined,
        lines: s.fields
          .map((x): PrintLine => ({ label: x.label[lang], value: (e[x.id] ?? "").trim(), ...(x.kind === "multiline" ? { multiline: true as const } : {}) }))
          .filter((l) => mode === "blank" || l.value !== ""),
      }))
      .filter((e) => e.lines.length > 0)
      // Renumber after dropping empty entries, so the paper reads 1, 2, 3.
      .map((e, i) => (s.repeat ? { ...e, heading: `${s.repeat.item[lang]} ${i + 1}` } : e));
    const todo = (s.todo ?? []).map((t) => ({ label: t.label[lang], done: mode === "filled" && !!plan.done[t.id] })).filter((t) => mode === "blank" || t.done);
    if (entries.length || todo.length) out.push({ id: s.id, title: s.title[lang], entries, todo });
  }
  return out;
}
