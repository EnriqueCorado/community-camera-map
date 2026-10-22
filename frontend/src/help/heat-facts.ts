// Heat-at-work facts with their citations, checked 2026-10-21 against the
// official Cal/OSHA regulation text (dir.ca.gov/title8), Cal/OSHA's 2026
// news releases (English and Spanish), the DLSE, and CDC/NIOSH (English and
// Spanish pages). Labor Code text was read on california.public.law because
// leginfo.legislature.ca.gov blocked automated reads.
//
// Spanish: the symptom lists, the industry names, the bilingual line's hours,
// "protected regardless of immigration status", the indoor examples and the
// "both rules" line are quoted from the Spanish government pages. The rest is
// our own translation.
//
// RE-CHECK: Labor Code §226.7 (paid cool-down breaks) as read says it is in
// effect "only until January 1, 2027". A successor version reportedly keeps
// the recovery-period rules, but we have not seen its text. Unit tests fail
// after LAB_226_7_RECHECK so someone re-reads it.
import type { Bilingual } from "./letter-types";
import type { Contact, Fact } from "./facts";
import type { SourceRef } from "../components/help/ui";
import type { Tier, WorkType } from "./heat";

export interface HeatRule extends Fact {
  tier: Tier;
  /** Only applies at or below this temperature (shade "on request"). */
  maxF?: number;
  /** Only for this kind of outdoor work. */
  only?: WorkType;
}

/** A contact whose page also exists in Spanish. */
export interface HeatContact extends Contact {
  urlEs?: string;
}

export interface Symptoms {
  signs: Record<"en" | "es", string[]>;
  todo: Record<"en" | "es", string[]>;
}

const DIR_3395 = "https://www.dir.ca.gov/title8/3395.html";
const DIR_3396 = "https://www.dir.ca.gov/title8/3396.html";

export const LAB_226_7_RECHECK = "2027-01-01";

export const HEAT_FACTS = {
  checked: "2026-10-21",
  thresholds: {
    /** §3395(d)(1): shade must be up when the temperature "exceeds 80". */
    shadeOver: 80,
    /** §3395(e): high-heat procedures when it "equals or exceeds 95". */
    highHeatAt: 95,
    /** §3396(a)(1): indoor rules at 82°F or above. */
    indoorAt: 82,
    /** §3396(a)(2)(A)-(B): the full indoor rules at 87°F or above. */
    indoorFullAt: 87,
    /** §3395(g)(1): a heat wave is a predicted high of at least 80°F ... */
    heatWaveMin: 80,
    /** ... and at least 10°F above the average high of the past 5 days. */
    heatWaveAbove: 10,
  },

  // ------------------------------------------------------------ outdoors

  outdoorAlways: [
    {
      id: "water",
      tier: "always",
      cite: "8 CCR §3395(c)",
      en: "Free drinking water that is fresh, pure and cool, as close as possible to where you work. There must be enough for each worker to drink 1 quart (4 cups) every hour, for the whole shift.",
      es: "Agua para tomar gratis, fresca, limpia y fría, lo más cerca posible de donde trabaja. Debe haber suficiente para que cada trabajador tome 1 cuarto de galón (4 tazas) cada hora, durante todo el turno.",
    },
    {
      id: "shade-on-request",
      tier: "always",
      maxF: 80,
      cite: "8 CCR §3395(d)(2)",
      en: "Shade: at 80°F or less, the employer must either have shade set up, or get you to shade quickly when you ask for it.",
      es: "Sombra: a 80°F o menos, el empleador debe tener sombra instalada, o llevarle a la sombra pronto cuando usted la pida.",
    },
    {
      id: "cooldown",
      tier: "always",
      cite: "8 CCR §3395(d)(3)",
      en: "You can take a cool-down rest in the shade any time you feel you need it. It lasts at least 5 minutes, plus the time to get to the shade. A supervisor must check on you, and you can’t be sent back to work until you feel better.",
      es: "Puede tomar un descanso para refrescarse en la sombra cada vez que lo necesite. Dura al menos 5 minutos, más el tiempo para llegar a la sombra. Un supervisor debe vigilarle, y no le pueden mandar de regreso al trabajo hasta que se sienta bien.",
    },
    {
      id: "new-workers",
      tier: "always",
      cite: "8 CCR §3395(g)(2)",
      en: "New workers in a high-heat area must be watched closely by a supervisor (or someone they choose) for their first 14 days.",
      es: "A los trabajadores nuevos en un área de mucho calor los debe vigilar de cerca un supervisor (o alguien que él designe) durante sus primeros 14 días.",
    },
    {
      id: "heat-wave",
      tier: "always",
      cite: "8 CCR §3395(g)(1)",
      en: "On a heat wave day, ALL workers must be watched closely. A heat wave is when the predicted high is at least 80°F and at least 10°F hotter than the average high of the past 5 days.",
      es: "En un día de ola de calor, se debe vigilar de cerca a TODOS los trabajadores. Hay ola de calor cuando la máxima pronosticada es de al menos 80°F y al menos 10°F más alta que el promedio de las máximas de los 5 días anteriores.",
    },
    {
      id: "emergency",
      tier: "always",
      cite: "8 CCR §3395(f), (f)(2)(C)",
      en: "An emergency plan: a way to reach a supervisor or 911, first aid, and clear directions to the worksite for an ambulance. A worker with signs of heat illness must not be left alone or sent home without being offered first aid or emergency medical care.",
      es: "Un plan de emergencia: una forma de comunicarse con un supervisor o con el 911, primeros auxilios e indicaciones claras para que una ambulancia llegue al lugar. A un trabajador con señales de enfermedad por calor no se le puede dejar solo ni mandar a casa sin ofrecerle primeros auxilios o atención médica de emergencia.",
    },
    {
      id: "training",
      tier: "always",
      cite: "8 CCR §3395(h)",
      en: "Training for workers and supervisors before working in the heat: the risks, drinking water, signs of heat illness, first aid and what to do in an emergency.",
      es: "Capacitación para trabajadores y supervisores antes de trabajar en el calor: los riesgos, tomar agua, las señales de enfermedad por calor, primeros auxilios y qué hacer en una emergencia.",
    },
    {
      id: "plan",
      tier: "always",
      cite: "8 CCR §3395(i)",
      en: "A written heat illness prevention plan, in English and in the language most workers understand, kept at the worksite.",
      es: "Un plan escrito de prevención de enfermedades por calor, en inglés y en el idioma que entiende la mayoría de los trabajadores, disponible en el lugar de trabajo.",
    },
  ] satisfies HeatRule[],

  outdoorOver80: [
    {
      id: "shade-up",
      tier: "over80",
      cite: "8 CCR §3395(d)(1)",
      en: "Shade must already be set up (not only when someone asks) the whole time workers are there. It must be open to the air or cooled, and big enough for everyone on a rest or meal break.",
      es: "La sombra debe estar ya instalada (no solo cuando alguien la pida) todo el tiempo que haya trabajadores. Debe estar al aire libre o con ventilación o aire fresco, y tener espacio para todos los que estén en su descanso o comida.",
    },
  ] satisfies HeatRule[],

  outdoorHigh95: [
    {
      id: "contact",
      tier: "high95",
      cite: "8 CCR §3395(e)(1)",
      en: "A way for workers to reach a supervisor when needed (by voice, by sight, or by phone or radio).",
      es: "Una forma de que los trabajadores se comuniquen con un supervisor cuando lo necesiten (de voz, a la vista, o por teléfono o radio).",
    },
    {
      id: "observe",
      tier: "high95",
      cite: "8 CCR §3395(e)(2)",
      en: "Someone must watch workers for signs of heat illness: a supervisor watching 20 or fewer workers, a required buddy system, regular radio or phone check-ins with anyone working alone, or another method that works.",
      es: "Alguien debe vigilar a los trabajadores para ver si tienen señales de enfermedad por calor: un supervisor que vigile a 20 trabajadores o menos, un sistema obligatorio de compañeros, llamadas regulares por radio o teléfono a quien trabaje solo, u otro método que funcione.",
    },
    {
      id: "remind",
      tier: "high95",
      cite: "8 CCR §3395(e)(4)",
      en: "Reminders all through the shift to drink plenty of water.",
      es: "Recordatorios durante todo el turno para que tomen mucha agua.",
    },
    {
      id: "meeting",
      tier: "high95",
      cite: "8 CCR §3395(e)(5)",
      en: "A short meeting before the shift to go over the high-heat plan, encourage drinking water, and remind everyone of their right to a cool-down rest.",
      es: "Una reunión corta antes del turno para repasar el plan para calor extremo, animar a todos a tomar agua y recordarles su derecho a un descanso para refrescarse.",
    },
    {
      id: "ag-rest",
      tier: "high95",
      only: "agriculture",
      cite: "8 CCR §3395(e)(6)",
      en: "Farm work: the employer must make sure each worker takes a cool-down rest of at least 10 minutes every 2 hours. In an 8-hour day it can be the same time as the regular breaks. After 8 hours, another one is due at the end of the 8th hour, again at the end of the 10th, and so on.",
      es: "Trabajo agrícola: el empleador debe asegurarse de que cada trabajador tome un descanso para refrescarse de al menos 10 minutos cada 2 horas. En un día de 8 horas puede ser a la misma hora que los descansos normales. Después de 8 horas, se debe dar otro al final de la 8.ª hora, otro al final de la 10.ª, y así sucesivamente.",
    },
  ] satisfies HeatRule[],

  // ------------------------------------------------------------- indoors

  indoor82: [
    {
      id: "in-water",
      tier: "indoor82",
      cite: "8 CCR §3396(c)",
      en: "Free, fresh, clean, cool drinking water: 1 quart per worker per hour, for the whole shift.",
      es: "Agua para tomar gratis, fresca, limpia y fría: 1 cuarto de galón por trabajador por hora, durante todo el turno.",
    },
    {
      id: "in-cool-area",
      tier: "indoor82",
      cite: "8 CCR §3396(d)(1)",
      en: "At least one cool-down area kept below 82°F (unless that’s not possible), open at all times while people are working.",
      es: "Al menos un área para refrescarse a menos de 82°F (a menos que no sea posible), abierta en todo momento mientras haya gente trabajando.",
    },
    {
      id: "in-cooldown",
      tier: "indoor82",
      cite: "8 CCR §3396(d)(2)",
      en: "A cool-down rest whenever you need it: at least 5 minutes plus the time to get to the cool area. You can’t be sent back until you feel better.",
      es: "Un descanso para refrescarse cada vez que lo necesite: al menos 5 minutos más el tiempo para llegar al área fresca. No le pueden mandar de regreso hasta que se sienta bien.",
    },
    {
      id: "in-watch",
      tier: "indoor82",
      cite: "8 CCR §3396(g)",
      en: "New workers watched closely for their first 14 days. During a heat wave, everyone is watched closely if the workplace has no cooling that works.",
      es: "Vigilar de cerca a los trabajadores nuevos durante sus primeros 14 días. Durante una ola de calor, vigilar de cerca a todos si el lugar no tiene un sistema de enfriamiento que funcione.",
    },
    {
      id: "in-plan",
      tier: "indoor82",
      cite: "8 CCR §3396(f), (h), (i)",
      en: "An emergency plan, training, and a written indoor heat plan in English and in the language most workers understand.",
      es: "Un plan de emergencia, capacitación y un plan escrito para el calor en interiores, en inglés y en el idioma que entiende la mayoría de los trabajadores.",
    },
  ] satisfies HeatRule[],

  indoor87: [
    {
      id: "in-measure",
      tier: "indoor87",
      cite: "8 CCR §3396(e)(1)",
      en: "The employer must measure the temperature and the heat index and write down the higher one, with the date, time and place. Workers can see these records if they ask.",
      es: "El empleador debe medir la temperatura y el índice de calor y anotar el más alto, con la fecha, la hora y el lugar. Los trabajadores pueden ver estos registros si los piden.",
    },
    {
      id: "in-controls",
      tier: "indoor87",
      cite: "8 CCR §3396(e)(2)(A)-(C)",
      en: "The employer must first try to cool the workplace below 87°F (below 82°F if you wear heat-trapping clothing or work near strong heat sources), for example with cooling or fans, unless that’s not possible. Next come work changes, like different hours or more rest. Last comes protective gear for heat.",
      es: "El empleador debe primero tratar de enfriar el lugar a menos de 87°F (a menos de 82°F si usa ropa que atrapa el calor o trabaja cerca de fuentes de calor fuerte), por ejemplo con aire frío o ventiladores, a menos que no sea posible. Después vienen cambios en el trabajo, como otros horarios o más descanso. Al final, equipo de protección contra el calor.",
    },
  ] satisfies HeatRule[],

  /** When the full indoor rules start (§3396(a)(2)). */
  indoorTriggers: [
    { id: "t-temp", cite: "8 CCR §3396(a)(2)(A)", en: "The temperature is 87°F or more.", es: "La temperatura es de 87°F o más." },
    { id: "t-index", cite: "8 CCR §3396(a)(2)(B)", en: "The heat index (heat plus humidity) is 87°F or more.", es: "El índice de calor (calor más humedad) es de 87°F o más." },
    { id: "t-clothing", cite: "8 CCR §3396(a)(2)(C)", en: "Workers wear clothing that traps heat, and it’s 82°F or more.", es: "Los trabajadores usan ropa que atrapa el calor, y hace 82°F o más." },
    { id: "t-radiant", cite: "8 CCR §3396(a)(2)(D), (b)(11)", en: "Workers are near strong heat sources (a “high radiant heat area”), and it’s 82°F or more.", es: "Los trabajadores están cerca de fuentes de calor fuerte (un “área de alto calor radiante”), y hace 82°F o más." },
  ] satisfies Fact[],

  indoorExceptions: [
    {
      id: "x-short",
      cite: "8 CCR §3396(a)(1)(C)",
      en: "Not covered: being in 82–95°F heat for less than 15 minutes in any hour. This exception does not cover vehicles without working air conditioning, or shipping containers while loading or unloading.",
      es: "No está cubierto: estar en 82–95°F por menos de 15 minutos en cualquier hora. Esta excepción no cubre vehículos sin aire acondicionado que funcione, ni contenedores de carga mientras se cargan o descargan.",
    },
    {
      id: "x-other",
      cite: "8 CCR §3396(a)(1)(B), (D), (E)",
      en: "Also not covered: working from a home or place you choose, emergency operations, and some jails and detention centers.",
      es: "Tampoco está cubierto: trabajar desde su casa o un lugar que usted elige, operaciones de emergencia, y algunas cárceles y centros de detención.",
    },
  ] satisfies Fact[],

  /** Cal/OSHA's own examples (official Spanish). */
  indoorExamples: {
    en: "Most indoor workplaces, such as restaurants, warehouses and manufacturing facilities.",
    es: "La mayoría de los lugares de trabajo en interiores, como restaurantes, almacenes e instalaciones de manufactura.",
  } satisfies Bilingual,
  both: {
    en: "Employers can be covered by both the indoor and outdoor rules if they have workers in each setting.",
    es: "Los empleadores pueden estar sujetos a ambas regulaciones si tienen trabajadores en ambos entornos.",
  } satisfies Bilingual,

  // ------------------------------------------------------- pay and rights

  pay: [
    {
      id: "paid",
      cite: "Lab. Code §226.7(a), (d)",
      en: "Cool-down breaks for heat are paid. The law counts them as hours worked, with nothing taken out of your pay.",
      es: "Los descansos para refrescarse por el calor son pagados. La ley los cuenta como horas trabajadas, sin descontarle nada de su pago.",
    },
    {
      id: "no-work",
      cite: "Lab. Code §226.7(b)",
      en: "Your employer can’t make you work during a required cool-down (recovery) break.",
      es: "Su empleador no le puede obligar a trabajar durante un descanso obligatorio para refrescarse (periodo de recuperación).",
    },
    {
      id: "premium",
      cite: "Lab. Code §226.7(c)",
      en: "If you don’t get a required cool-down break, the employer owes you 1 extra hour of pay at your regular rate for each workday it happens.",
      es: "Si no le dan un descanso obligatorio para refrescarse, el empleador le debe 1 hora extra de pago a su tarifa normal por cada día de trabajo en que pase.",
    },
  ] satisfies Fact[],

  rights: [
    {
      id: "retaliation",
      cite: "Lab. Code §6310(a)(1), (b); 8 CCR §3395 Note 2",
      en: "It’s illegal to fire or punish you for complaining about heat or safety, out loud or in writing, to your boss or to Cal/OSHA, or for using your heat rights. You can get your job back and the pay and benefits you lost.",
      es: "Es ilegal despedirle o castigarle por quejarse del calor o de la seguridad, en voz alta o por escrito, a su jefe o a Cal/OSHA, o por usar sus derechos contra el calor. Puede recuperar su trabajo y el pago y los beneficios que perdió.",
    },
    {
      id: "one-year",
      cite: "Lab. Code §98.6",
      en: "If you are punished for complaining, file a retaliation complaint with the Labor Commissioner within 1 year.",
      es: "Si le castigan por quejarse, presente una queja por represalias ante el Comisionado Laboral dentro de 1 año.",
    },
    {
      id: "status",
      cite: "Cal/OSHA; Lab. Code §1171.5",
      en: "Workers in California are protected regardless of immigration status. Under state law your status doesn’t change what the employer owes, and nobody may ask about it in these cases unless federal immigration law requires it.",
      es: "Los trabajadores en California están protegidos independientemente de su estatus migratorio. Según la ley estatal, su estatus no cambia lo que el empleador le debe, y nadie le puede preguntar por él en estos casos a menos que la ley federal de inmigración lo exija.",
    },
    {
      id: "threats",
      cite: "Lab. Code §1019",
      en: "Threats about your immigration status (an “unfair immigration-related practice”) are a form of retaliation. The Labor Commissioner investigates them.",
      es: "Las amenazas sobre su estatus migratorio (una “práctica injusta relacionada con la inmigración”) son una forma de represalia. El Comisionado Laboral las investiga.",
    },
  ] satisfies Fact[],

  // --------------------------------------------------------- symptoms (CDC)

  heatStroke: {
    signs: {
      en: ["Confusion, acting strange, slurred speech", "Passing out", "Hot, dry skin, or very heavy sweating", "Seizures", "Very high body temperature", "It can kill if treatment is delayed"],
      es: ["Confusión, estado mental alterado, habla arrastrada o enredada", "Pérdida del conocimiento (coma)", "Piel caliente y seca o sudoración profusa", "Convulsiones", "Temperatura corporal muy alta", "Es mortal si se demora el tratamiento"],
    },
    todo: {
      en: [
        "Call 911.",
        "Stay with the worker until help arrives.",
        "Move them to a cool, shady place and take off outer clothing.",
        "Cool them fast: cold water or ice, wet their skin, cold wet cloths, soak their clothes with cool water.",
        "Fan the air around them.",
      ],
      es: [
        "Llame al 911 para obtener atención médica de emergencia.",
        "Quédese con el trabajador hasta que lleguen los servicios médicos de emergencias.",
        "Lleve al trabajador a un área fresca y con sombra y quítele las prendas de vestir externas.",
        "Refresque rápidamente al trabajador (baño de agua fría o hielo, de ser posible; humedézcale la piel; paños húmedos fríos; empape la ropa con agua fría).",
        "Haga circular el aire alrededor del trabajador para acelerar el enfriamiento.",
      ],
    },
  } satisfies Symptoms,
  heatExhaustion: {
    signs: {
      en: ["Headache", "Nausea (feeling sick to your stomach)", "Dizziness", "Weakness", "Feeling irritable", "Thirst", "Heavy sweating", "Higher body temperature", "Peeing less than usual"],
      es: ["Dolor de cabeza", "Náuseas", "Mareos", "Debilidad", "Irritabilidad", "Sed", "Sudoración abundante", "Temperatura corporal elevada", "Menor eliminación de orina"],
    },
    todo: {
      en: [
        "Take the worker to a clinic or emergency room. Call 911 if no medical care is available.",
        "Have someone stay with them until help arrives.",
        "Get them out of the heat and give them liquids to drink.",
        "Take off extra clothing, including shoes and socks.",
        "Cool them with cold compresses, or have them wash their head, face and neck with cold water.",
        "Have them take small sips of cool water often.",
      ],
      es: [
        "Lleve al trabajador a un centro médico o a la sala de emergencias para evaluación y tratamiento. Llame al 911 si no hay atención médica disponible.",
        "Haga que alguien permanezca con el trabajador hasta que llegue la ayuda.",
        "Retire al trabajador del área calurosa y dele líquidos para beber.",
        "Quítele las prendas de vestir innecesarias, incluidos zapatos y medias.",
        "Refresque al trabajador con compresas frías o haga que se lave la cabeza, la cara y el cuello con agua fría.",
        "Aliéntelo a que tome sorbos de agua fresca con frecuencia.",
      ],
    },
  } satisfies Symptoms,
  heatCramps: {
    signs: {
      en: ["Muscle cramps", "Pain or spasms in the belly, arms or legs"],
      es: ["Calambres musculares", "Dolores o espasmos musculares en el abdomen, los brazos o las piernas"],
    },
    todo: {
      en: [
        "Drink water and have a snack or a sports drink every 15 to 20 minutes.",
        "Don’t take salt tablets.",
        "Get medical help if the worker has heart problems, is on a low-salt diet, or the cramps don’t stop within 1 hour.",
      ],
      es: [
        "Beber agua y comer un snack o tomar una bebida que remplace carbohidratos y electrolitos cada 15 a 20 minutos.",
        "Evite las pastillas de sal.",
        "Busque atención médica si tiene problemas del corazón, sigue una dieta baja en sodio o tiene calambres que no se alivian en el transcurso de una hora.",
      ],
    },
  } satisfies Symptoms,

  // ------------------------------------------------------------ reporting

  complaint: [
    {
      id: "c-confidential",
      cite: "Cal/OSHA complaint page",
      en: "By law, Cal/OSHA keeps your name private unless you ask otherwise. You can leave your name out, but then the complaint is treated as “non-formal”.",
      es: "Por ley, Cal/OSHA mantiene su nombre en privado a menos que usted pida otra cosa. Puede no dar su nombre, pero entonces la queja se trata como “no formal”.",
    },
    {
      id: "c-anyone",
      cite: "Cal/OSHA complaint page",
      en: "Anyone can file a complaint, not only the worker.",
      es: "Cualquier persona puede presentar una queja, no solo el trabajador.",
    },
    {
      id: "c-next",
      cite: "Cal/OSHA complaint page",
      en: "Cal/OSHA either inspects the worksite without warning the employer, or sends the employer a letter that must be answered within 14 days.",
      es: "Cal/OSHA inspecciona el lugar de trabajo sin avisar al empleador, o le manda una carta al empleador que debe contestar en 14 días.",
    },
  ] satisfies Fact[],

  calOshaLine: {
    name: { en: "Cal/OSHA bilingual line: talk to a live bilingual person, 9 a.m. to 7 p.m., Monday to Friday", es: "Línea bilingüe de Cal/OSHA: hable con un representante bilingüe en vivo, de 9 a.m. a 7 p.m., de lunes a viernes" },
    phone: "833-579-0927",
    url: "https://dir.ca.gov/DIRNews/2026/2026-79.html",
    urlEs: "https://dir.ca.gov/DIRNews/2026/Spanish/2026-79.html",
  } satisfies HeatContact,
  /** Covers every Stanislaus County ZIP (checked with DOSH's ZIP locator). */
  modestoOffice: {
    name: { en: "Cal/OSHA Modesto District Office (covers all of Stanislaus County)", es: "Oficina de Distrito de Cal/OSHA en Modesto (cubre todo el condado de Stanislaus)" },
    phone: "(209) 545-7310",
    email: "DOSHMod@dir.ca.gov",
    address: "4206 Technology Dr., Suite 3, Modesto, CA 95356",
    hours: { en: "Phone hours: 8 a.m. to 5 p.m., Monday to Friday, except state holidays.", es: "Horario por teléfono: de 8 a.m. a 5 p.m., de lunes a viernes, excepto días festivos del estado." } satisfies Bilingual,
    url: "https://www.dir.ca.gov/dosh/districtoffices.htm",
  },
  complaintPage: {
    name: { en: "How to file a Cal/OSHA complaint (by phone or email; English)", es: "Cómo presentar una queja ante Cal/OSHA (por teléfono o correo electrónico; en inglés)" },
    url: "https://www.dir.ca.gov/dosh/Complaint.htm",
  } satisfies Contact,
  laborCommissioner: {
    name: { en: "Labor Commissioner: unpaid breaks, pay and retaliation", es: "Comisionado Laboral: descansos o pagos que no le dieron, y represalias" },
    phone: "833-526-4636",
    url: "https://www.dir.ca.gov/dosh/HeatIllnessInfo.html",
  } satisfies Contact,
  retaliationUnit: {
    name: { en: "Labor Commissioner, safety retaliation unit (leave a message; they call back within 1 business day)", es: "Comisionado Laboral, unidad de represalias por quejas de seguridad (deje un mensaje; le llaman dentro de 1 día hábil)" },
    phone: "(714) 558-4913",
    email: "oshaRetaliation@dir.ca.gov",
    url: "https://www.dir.ca.gov/dlse/rci_osha_complaint.htm",
  },

  sources: [
    { label: "8 CCR §3395: Heat illness prevention, outdoor workplaces (Cal/OSHA)", url: DIR_3395 },
    { label: "8 CCR §3396: Heat illness prevention, indoor workplaces (Cal/OSHA)", url: DIR_3396 },
    { label: "Cal/OSHA news release 2026-79 (October 2, 2026)", url: "https://dir.ca.gov/DIRNews/2026/2026-79.html" },
    { label: "Cal/OSHA comunicado 2026-79 (en español)", url: "https://dir.ca.gov/DIRNews/2026/Spanish/2026-79.html" },
    { label: "Cal/OSHA comunicado 2026-47 (en español)", url: "https://dir.ca.gov/DIRNews/2026/Spanish/2026-47.html" },
    { label: "Cal/OSHA: heat illness information and phone numbers", url: "https://www.dir.ca.gov/dosh/HeatIllnessInfo.html" },
    { label: "Cal/OSHA: how to file a complaint", url: "https://www.dir.ca.gov/dosh/Complaint.htm" },
    { label: "Cal/OSHA district offices", url: "https://www.dir.ca.gov/dosh/districtoffices.htm" },
    { label: "Cal/OSHA district office ZIP code lookup", url: "https://www.dir.ca.gov/asp/DoshZipSearch.html" },
    { label: "Labor Code §226.7 (paid recovery periods)", url: "https://california.public.law/codes/labor_code_section_226.7" },
    { label: "Labor Code §6310 (safety retaliation)", url: "https://california.public.law/codes/labor_code_section_6310" },
    { label: "Labor Code §1171.5 (immigration status)", url: "https://california.public.law/codes/labor_code_section_1171.5" },
    { label: "Labor Commissioner: retaliation", url: "https://www.dir.ca.gov/dlse/dlseRetaliation.html" },
    { label: "Labor Commissioner: report safety retaliation", url: "https://www.dir.ca.gov/dlse/rci_osha_complaint.htm" },
    { label: "Labor Commissioner: code sections and deadlines", url: "https://www.dir.ca.gov/dlse/HowToFileLinkCodeSections.htm" },
    { label: "CDC/NIOSH: heat-related illnesses", url: "https://www.cdc.gov/niosh/heat-stress/about/illnesses.html" },
    { label: "CDC/NIOSH: enfermedades relacionadas con el calor (en español)", url: "https://www.cdc.gov/niosh/heat-stress/es/about/enfermedades-relacionadas-con-el-calor.html" },
    { label: "Weather forecast: Open-Meteo (CC BY 4.0)", url: "https://open-meteo.com/" },
  ] satisfies SourceRef[],
};
