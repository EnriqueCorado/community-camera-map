// Wording for the Medi-Cal work rules tool, per language (written, not
// stitched, so the Spanish reads naturally). Rules and citations live in
// medi-cal-work-facts.ts; a missing Spanish string is a compile error.
// Labels follow the law's exact groups (checked against 42 CFR 435.554 and
// DHCS ACWDL 25-30), so nobody ticks a box that doesn't really fit them.
import type { Lang } from "../i18n";
import type { AgeBand, Coverage, ExemptId, HardshipId, MeetsBy, NotCoveredId, School } from "./medi-cal-work";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface MediCalWorkCopy {
  title: string;
  lead: string;
  private: string;
  qCoverage: string;
  coverage: Record<Coverage, string>;
  qAge: string;
  age: Record<AgeBand, string>;
  qExempt: string;
  qExemptHint: string;
  exempt: Record<ExemptId, string>;
  /** Extra words under a box, where its plain label could be misread. */
  exemptNote: Partial<Record<ExemptId, string>>;
  none: string;
  qHardship: string;
  hardship: Record<HardshipId, string>;
  activitiesTitle: string;
  activitiesHint: string;
  workHours: string;
  workHoursHint: string;
  volunteerHours: string;
  volunteerHoursHint: string;
  programHours: string;
  programHoursHint: string;
  qSchool: string;
  qSchoolHint: string;
  school: Record<School, string>;
  credits: string;
  creditsHint: Fn<[number]>;
  classHours: string;
  income: string;
  incomeHint: string;
  seasonal: string;
  seasonalAvg: string;
  /** "<field>: enter a number…" for hours and credits (money uses the shared message). */
  numberInvalid: Fn<[string]>;
  // results
  notCoveredTitle: string;
  notCovered: Record<NotCoveredId, string>;
  exemptTitle: string;
  exemptMaybeTitle: string;
  exemptBecause: Fn<[string]>;
  /** Each exemption as a short phrase for "Because: …". */
  exemptShort: Record<ExemptId, string>;
  exemptTodo: string;
  exemptMaybeText: string;
  exemptMaybeHours: string;
  meetsTitle: string;
  meetsBy: (by: MeetsBy, hours: number, money: string, needed: number) => string;
  meetsTodo: string;
  shortTitle: string;
  shortText: Fn<[number, number, number]>;
  shortMoney: Fn<[string, string]>;
  shortIdeas: string[];
  shortHardship: string;
  unsureNote: string;
  // reference sections
  ruleTitle: string;
  exemptListTitle: string;
  whenTitle: string;
  noticeTitle: string;
  todoTitle: string;
  todo: string[];
  immigrantsTitle: string;
  helpTitle: string;
}

const en: MediCalWorkCopy = {
  title: "Medi-Cal’s new work rules (2027)",
  lead: "Starting in 2027, many adults on Medi-Cal must show 80 hours a month of work, school, job training or volunteering, or $580 a month of income, to keep it. Many people are exempt. Answer a few questions to see where you stand and what to do now.",
  private: "Nothing you enter is saved or sent anywhere.",
  qCoverage: "Your Medi-Cal",
  coverage: {
    full: "I have full Medi-Cal now",
    applying: "I’m applying, or will apply",
    restricted: "I only have emergency or pregnancy Medi-Cal (restricted)",
    unsure: "Not sure",
  },
  qAge: "Your age",
  age: { under19: "Under 19", "19to64": "19 to 64", "65plus": "65 or older" },
  qExempt: "Do any of these describe you? Check all that apply.",
  qExemptHint: "Each one usually means you don’t have to meet the work rule.",
  exempt: {
    pregnant: "I’m pregnant, or was pregnant in the last 12 months",
    child13: "I’m the parent of a child 13 or younger, or a relative or caregiver who mainly cares for one",
    caregiver: "I regularly care for a family member, or someone I live with, who has a disability",
    frail: "I have a disability, or a serious physical or mental health condition or substance use problem, that makes it hard to work",
    treatment: "I’m in a drug or alcohol treatment program",
    native: "I’m a member of a U.S. tribe (American Indian or Alaska Native), or can get Indian Health Service care",
    foster: "I was in foster care when I turned 18, and I’m under 26",
    veteran: "I’m a veteran with a total disability rating",
    calfresh: "I get CalFresh and the county says CalFresh work rules apply to me, or I’m in CalWORKs Welfare-to-Work",
    released: "I was in jail or prison in the last 3 months",
    medicare: "I have Medicare",
    ssi: "I get SSI",
    otherGroup: "My Medi-Cal is through a disability or aged program (not based on income)",
  },
  exemptNote: {
    child13: "A parent counts even if the child doesn’t live with you. Other relatives count if the child lives with you and you’re mainly responsible; anyone else, with 80 or more hours of care a month.",
    caregiver: "Or someone else you give 80 or more hours of care a month.",
    native: "This doesn’t include Indigenous peoples from Mexico or Central America.",
    otherGroup: "If you have a disability but aren’t sure which Medi-Cal you have, check the health box above instead.",
  },
  none: "None of these",
  qHardship: "This month, did either of these happen? (optional)",
  hardship: {
    hospital: "I stayed in a hospital, nursing home or psychiatric hospital, even a few days",
    travel: "I had to travel far for a long time for serious medical care, for me or my child",
  },
  activitiesTitle: "What you do in a typical month",
  activitiesHint: "Rough numbers are fine. Add up all your jobs.",
  workHours: "Hours of work a month",
  workHoursHint: "Paid, cash, gig or farm work all count.",
  volunteerHours: "Hours of volunteering a month",
  volunteerHoursHint: "Only in an organized program of a nonprofit or public agency that can confirm your hours.",
  programHours: "Hours in a job training program a month",
  programHoursHint: "For example CalFresh Employment and Training, or a WIOA program.",
  qSchool: "Are you in school?",
  qSchoolHint: "College, career or technical classes, high school, a GED program, or an adult literacy program. Job training goes in the hours above.",
  school: { half: "Yes, at least half-time", less: "Yes, less than half-time", no: "No" },
  credits: "Units or credits you’re taking",
  creditsHint: (h) => `Each one counts as about ${h} hours a month.`,
  classHours: "Or, if your classes have no credits: hours of class a month",
  income: "Your income in a typical month, before taxes",
  incomeHint: "All jobs together, including cash and gig work, plus unemployment or disability (SDI) payments.",
  seasonal: "I’m a seasonal worker (my work depends on the season)",
  seasonalAvg: "Your average income per month over the last 6 months",
  numberInvalid: (field) => `${field}: enter a number, like 20 or 12.5.`,
  notCoveredTitle: "The work rule doesn’t apply to you",
  notCovered: {
    restricted: "It doesn’t apply to restricted (emergency or pregnancy-only) Medi-Cal.",
    under19: "It doesn’t apply until you turn 19.",
    "65plus": "It’s only for adults 19 to 64.",
    medicare: "People on Medicare don’t have to meet it.",
    ssi: "People who get SSI have Medi-Cal through a different group, which the rule doesn’t cover.",
    otherGroup: "It’s only for adults who qualify for Medi-Cal by income (the “adult expansion” group).",
  },
  exemptTitle: "You likely don’t have to meet the work rule",
  exemptMaybeTitle: "You may not have to meet the work rule",
  exemptBecause: (list) => `Because: ${list}.`,
  exemptShort: {
    pregnant: "you’re pregnant or were in the last 12 months",
    child13: "you’re a parent or caretaker of a child 13 or younger",
    caregiver: "you care for a person with a disability",
    frail: "your health condition",
    treatment: "you’re in a drug or alcohol treatment program",
    native: "you’re a member of a U.S. tribe or can get Indian Health Service care",
    foster: "you were in foster care at 18 and are under 26",
    veteran: "you’re a veteran with a total disability rating",
    calfresh: "you’re held to CalFresh or CalWORKs work rules",
    released: "you were released from jail or prison in the last 3 months",
    medicare: "you have Medicare",
    ssi: "you get SSI",
    otherGroup: "your Medi-Cal isn’t based on income",
  },
  exemptTodo:
    "The county should find many exemptions in its own records. If you get a letter asking about work hours, answer it and say why you’re exempt. Keep proof handy, like a child’s birth certificate or a doctor’s note. Some exemptions end (when your youngest child turns 14, 12 months after a pregnancy, 3 months after release), so plan ahead for your next renewal.",
  exemptMaybeText:
    "A health condition counts if it makes it much harder for you to work or meet the rule. Ask your doctor or clinic for a note that says how it limits you, and tell the county.",
  exemptMaybeHours: "In case the county doesn’t agree, here is how your month compares with the rule:",
  meetsTitle: "You likely meet the work rule",
  meetsBy: (by, hours, money, needed) =>
    by === "school"
      ? "Being in school at least half-time counts on its own."
      : by === "income"
        ? `Having at least ${money} of income in a month counts, whatever your hours.`
        : by === "seasonal"
          ? `As a seasonal worker, averaging at least ${money} a month over 6 months counts.`
          : `Your ${hours} hours a month are at least the ${needed} needed.`,
  meetsTodo: "Keep proof of a recent month (pay stubs, a letter from your boss, program or school), and answer every letter from the county.",
  shortTitle: "You may not meet the work rule yet",
  shortText: (hours, missing, needed) => `You have about ${hours} hours a month; you need ${needed} (${missing} more).`,
  shortMoney: (more, threshold) => `Or have ${more} more income in a month: ${threshold} of income counts, whatever your hours.`,
  shortIdeas: [
    "Hours from work, volunteering, job training and school add up together.",
    "Check the list above again: if any exemption fits, you don’t need the hours.",
    "Volunteer hours count only in an organized program that can confirm them, for example at a nonprofit, food bank or church program.",
    "CalFresh Employment and Training, community college, and adult school classes toward a diploma or GED can count too. Ask whether other adult school classes count.",
  ],
  shortHardship: "A month in the hospital or traveling for serious care can be excused: ask the county for a short-term exception.",
  unsureNote: "Not sure which Medi-Cal you have? Your card or your county letters say. Restricted Medi-Cal covers only emergencies and pregnancy.",
  ruleTitle: "The rule",
  exemptListTitle: "Who doesn’t have to meet it",
  whenTitle: "When it’s checked",
  noticeTitle: "If you get a letter",
  todoTitle: "What to do now",
  todo: [
    "Make sure the county has your current address and phone number.",
    "Open every letter from the county and answer by the date it gives.",
    "Create a BenefitsCal account to renew, upload proof and get text or email alerts.",
    "Keep pay stubs, or a letter from your employer, volunteer program or school, for at least one recent month.",
  ],
  immigrantsTitle: "Changes for immigrants in California",
  helpTitle: "Questions or a letter you don’t understand",
};

const es: MediCalWorkCopy = {
  title: "Las nuevas reglas de trabajo de Medi-Cal (2027)",
  lead: "Desde 2027, muchos adultos con Medi-Cal deberán demostrar 80 horas al mes de trabajo, escuela, capacitación o voluntariado, o tener $580 de ingresos al mes, para mantenerlo. Muchas personas están exentas. Conteste unas preguntas para ver su situación y qué hacer ahora.",
  private: "Nada de lo que escriba se guarda ni se envía.",
  qCoverage: "Su Medi-Cal",
  coverage: {
    full: "Tengo Medi-Cal completo",
    applying: "Estoy solicitando, o voy a solicitar",
    restricted: "Solo tengo Medi-Cal de emergencia o de embarazo (restringido)",
    unsure: "No sé",
  },
  qAge: "Su edad",
  age: { under19: "Menos de 19", "19to64": "De 19 a 64", "65plus": "65 o más" },
  qExempt: "¿Alguna de estas situaciones es la suya? Marque todas las que apliquen.",
  qExemptHint: "Por lo general, cada una significa que no tiene que cumplir la regla de trabajo.",
  exempt: {
    pregnant: "Estoy embarazada, o estuve embarazada en los últimos 12 meses",
    child13: "Soy el padre o la madre de un niño de 13 años o menos, o un pariente o cuidador que lo cuida principalmente",
    caregiver: "Cuido con regularidad a un familiar, o a alguien que vive conmigo, que tiene una discapacidad",
    frail: "Tengo una discapacidad, o una condición de salud física o mental seria o un problema con drogas o alcohol, que me dificulta trabajar",
    treatment: "Estoy en un programa de tratamiento por drogas o alcohol",
    native: "Soy miembro de una tribu de EE. UU. (indígena americano o nativo de Alaska), o puedo recibir atención del Servicio de Salud Indígena (IHS)",
    foster: "Estuve en foster care (cuidado de crianza) cuando cumplí 18 años, y tengo menos de 26",
    veteran: "Soy veterano con una calificación de discapacidad total",
    calfresh: "Recibo CalFresh y el condado dice que me aplican sus reglas de trabajo, o estoy en el programa de Bienestar al Trabajo de CalWORKs",
    released: "Estuve en la cárcel o en prisión en los últimos 3 meses",
    medicare: "Tengo Medicare",
    ssi: "Recibo SSI",
    otherGroup: "Mi Medi-Cal es por un programa de discapacidad o de personas mayores (no por mis ingresos)",
  },
  exemptNote: {
    child13: "El padre o la madre cuenta aunque el niño no viva con usted. Otros parientes cuentan si el niño vive con usted y usted es el principal responsable; cualquier otra persona, con 80 horas o más de cuidado al mes.",
    caregiver: "O alguien más a quien le da 80 horas o más de cuidado al mes.",
    native: "Esto no incluye a los pueblos indígenas de México o Centroamérica.",
    otherGroup: "Si tiene una discapacidad pero no sabe qué Medi-Cal tiene, marque mejor la casilla de salud de arriba.",
  },
  none: "Ninguna",
  qHardship: "¿Este mes pasó alguna de estas cosas? (opcional)",
  hardship: {
    hospital: "Estuve internado en un hospital, un hogar de ancianos o centro de enfermería, o un hospital psiquiátrico, aunque fueran pocos días",
    travel: "Tuve que viajar lejos por mucho tiempo por atención médica seria, para mí o mi hijo",
  },
  activitiesTitle: "Lo que hace en un mes normal",
  activitiesHint: "Los números aproximados están bien. Sume todos sus trabajos.",
  workHours: "Horas de trabajo al mes",
  workHoursHint: "Cuenta el trabajo pagado, en efectivo, por aplicaciones o en el campo.",
  volunteerHours: "Horas de voluntariado al mes",
  volunteerHoursHint: "Solo en un programa organizado de una organización sin fines de lucro o agencia pública que pueda confirmar sus horas.",
  programHours: "Horas en un programa de capacitación laboral al mes",
  programHoursHint: "Por ejemplo Empleo y Capacitación de CalFresh, o un programa de WIOA.",
  qSchool: "¿Está en la escuela?",
  qSchoolHint: "Colegio comunitario o universidad, clases técnicas, preparatoria, un programa de GED, o un programa de alfabetización para adultos. La capacitación laboral va en las horas de arriba.",
  school: { half: "Sí, al menos medio tiempo", less: "Sí, menos de medio tiempo", no: "No" },
  credits: "Unidades o créditos que está tomando",
  creditsHint: (h) => `Cada una cuenta como unas ${h} horas al mes.`,
  classHours: "O, si sus clases no tienen créditos: horas de clase al mes",
  income: "Sus ingresos en un mes normal, antes de impuestos",
  incomeHint: "Todos sus trabajos juntos, incluso en efectivo y por aplicaciones, más pagos de desempleo o incapacidad (SDI).",
  seasonal: "Soy trabajador(a) de temporada (mi trabajo depende de la temporada)",
  seasonalAvg: "Sus ingresos promedio al mes en los últimos 6 meses",
  numberInvalid: (field) => `${field}: escriba un número, como 20 o 12,5.`,
  notCoveredTitle: "La regla de trabajo no aplica a usted",
  notCovered: {
    restricted: "No aplica a Medi-Cal restringido (solo emergencias o embarazo).",
    under19: "No aplica hasta que cumpla 19 años.",
    "65plus": "Es solo para adultos de 19 a 64 años.",
    medicare: "Las personas con Medicare no tienen que cumplirla.",
    ssi: "Las personas que reciben SSI tienen Medi-Cal por otro grupo, que la regla no cubre.",
    otherGroup: "Es solo para adultos que califican para Medi-Cal por sus ingresos (el grupo de “adultos de expansión”).",
  },
  exemptTitle: "Probablemente no tiene que cumplir la regla de trabajo",
  exemptMaybeTitle: "Puede que no tenga que cumplir la regla de trabajo",
  exemptBecause: (list) => `Porque: ${list}.`,
  exemptShort: {
    pregnant: "está embarazada o lo estuvo en los últimos 12 meses",
    child13: "es padre, madre o cuidador de un niño de 13 años o menos",
    caregiver: "cuida a una persona con discapacidad",
    frail: "su condición de salud",
    treatment: "está en un programa de tratamiento por drogas o alcohol",
    native: "es miembro de una tribu de EE. UU. o puede recibir atención del IHS",
    foster: "estuvo en foster care a los 18 años y tiene menos de 26",
    veteran: "es veterano con discapacidad total",
    calfresh: "le aplican las reglas de trabajo de CalFresh o CalWORKs",
    released: "salió de la cárcel o prisión en los últimos 3 meses",
    medicare: "tiene Medicare",
    ssi: "recibe SSI",
    otherGroup: "su Medi-Cal no es por sus ingresos",
  },
  exemptTodo:
    "El condado debería encontrar muchas exenciones en sus propios registros. Si le llega una carta que pregunta por sus horas de trabajo, contéstela y explique por qué está exento. Tenga a la mano comprobantes, como el acta de nacimiento de un hijo o una nota del médico. Algunas exenciones terminan (cuando su hijo más pequeño cumple 14 años, 12 meses después de un embarazo, 3 meses después de salir de la cárcel), así que prepárese para su próxima renovación.",
  exemptMaybeText:
    "Una condición de salud cuenta si le hace mucho más difícil trabajar o cumplir la regla. Pida a su médico o clínica una nota que diga cómo le limita, y dígaselo al condado.",
  exemptMaybeHours: "Por si el condado no está de acuerdo, así se compara su mes con la regla:",
  meetsTitle: "Probablemente cumple la regla de trabajo",
  meetsBy: (by, hours, money, needed) =>
    by === "school"
      ? "Estar en la escuela al menos medio tiempo cuenta por sí solo."
      : by === "income"
        ? `Tener al menos ${money} de ingresos en un mes cuenta, sin importar sus horas.`
        : by === "seasonal"
          ? `Como trabajador(a) de temporada, tener un promedio de al menos ${money} al mes en 6 meses cuenta.`
          : `Sus ${hours} horas al mes llegan a las ${needed} que se necesitan.`,
  meetsTodo: "Guarde comprobantes de un mes reciente (talones de pago, una carta de su jefe, programa o escuela) y conteste todas las cartas del condado.",
  shortTitle: "Puede que todavía no cumpla la regla de trabajo",
  shortText: (hours, missing, needed) => `Tiene unas ${hours} horas al mes; necesita ${needed} (${missing} más).`,
  shortMoney: (more, threshold) => `O tenga ${more} más de ingresos en un mes: ${threshold} de ingresos cuenta, sin importar sus horas.`,
  shortIdeas: [
    "Las horas de trabajo, voluntariado, capacitación y escuela se suman.",
    "Revise otra vez la lista de arriba: si alguna exención es la suya, no necesita las horas.",
    "Las horas de voluntariado solo cuentan en un programa organizado que pueda confirmarlas, por ejemplo en una organización sin fines de lucro, un banco de comida o un programa de su iglesia.",
    "Empleo y Capacitación de CalFresh, el colegio comunitario y las clases de la escuela para adultos que llevan a un diploma o GED también pueden contar. Pregunte si otras clases de la escuela para adultos cuentan.",
  ],
  shortHardship: "Un mes en el hospital o viajando por atención médica seria se puede excusar: pida al condado una excepción temporal.",
  unsureNote: "¿No sabe qué Medi-Cal tiene? Su tarjeta o las cartas del condado lo dicen. El Medi-Cal restringido solo cubre emergencias y embarazo.",
  ruleTitle: "La regla",
  exemptListTitle: "Quién no tiene que cumplirla",
  whenTitle: "Cuándo se revisa",
  noticeTitle: "Si le llega una carta",
  todoTitle: "Qué hacer ahora",
  todo: [
    "Asegúrese de que el condado tenga su dirección y teléfono actuales.",
    "Abra todas las cartas del condado y conteste antes de la fecha que indican.",
    "Cree una cuenta en BenefitsCal para renovar, subir comprobantes y recibir avisos por texto o correo.",
    "Guarde talones de pago, o una carta de su empleador, programa de voluntariado o escuela, de al menos un mes reciente.",
  ],
  immigrantsTitle: "Cambios para inmigrantes en California",
  helpTitle: "Preguntas o una carta que no entiende",
};

export const MEDI_CAL_WORK_COPY: Record<Lang, MediCalWorkCopy> = { en, es };
