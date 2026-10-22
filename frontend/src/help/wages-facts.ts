// Unpaid-wage facts with their citations, checked 2026-10-21 against the
// Labor Code (read on california.public.law, a mirror of
// leginfo.legislature.ca.gov, which blocked automated reads), IWC Wage
// Orders 14 and 15 (Rev. 11/2025), and the Labor Commissioner's (DLSE) own
// pages. Spanish is our own translation.
//
// UPDATE:
//  - MIN_WAGE: add each new year's rate when DIR announces it (usually by
//    Aug.). A unit test fails when today's year has no rate.
//  - LAB_226_7_RECHECK: §226.7 (break premiums) as read says it is in effect
//    "only until January 1, 2027". The successor text was not read; re-read it
//    and move this date. A unit test fails after it.
// Left out on purpose (not verified, or not safe to compute): the fast-food
// minimum's current amount, health care minimums (linked only), split-shift
// and reporting-time pay, live-in household overtime, and worker centers.
import type { Bilingual } from "./letter-types";
import type { Contact, Fact } from "./facts";
import type { SourceRef } from "../components/help/ui";
import type { RuleEntry, RuleSet } from "./wages";

const LAB = (section: string) =>
  `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=LAB&sectionNum=${section}`;

export const LAB_226_7_RECHECK = "2027-01-01";

/** State minimum wage by calendar year, in cents (no Stanislaus city or the
 *  county has a local minimum wage). */
export const MIN_WAGE: { year: number; cents: number; cite: string }[] = [
  { year: 2026, cents: 1690, cite: "Lab. Code §1182.12; IWC Wage Order 14 §4(A)(1)" },
  { year: 2027, cents: 1740, cite: "Lab. Code §1182.12(d)" },
];

const H = 60; // minutes per hour

/** 8 hours a day / 40 a week at 1.5x, 2x after 12 a day, and the 7th-day rule. */
const EIGHT_FORTY: RuleSet = { dailyOt: 8 * H, weeklyOt: 40 * H, dailyDt: 12 * H, seventhDayDt: 8 * H };

export const OT_RULES = {
  general: { rules: EIGHT_FORTY, cite: "Lab. Code §510(a)" },
  /** Farms with 26+ employees: 8/40 and 12-hour double time since 2022; the
   *  7th-day rule applies regardless of size. */
  farmLarge: { rules: EIGHT_FORTY, fromYear: 2022, cite: "Lab. Code §860(d)(1), §862(a)-(b); IWC Wage Order 14 §3" },
  /** Farms with 25 or fewer: the same rules since 2025 (phase-in complete). */
  farmSmall: { rules: EIGHT_FORTY, fromYear: 2025, cite: "Lab. Code §860(d)(2), §862(b)-(c); IWC Wage Order 14 §3" },
  /** Any farm, any size, for work since the small-farm phase-in ended. */
  farm: { rules: EIGHT_FORTY, fromYear: 2025, cite: "Lab. Code §860(d), §862; IWC Wage Order 14 §3(A)(1), §3(B)" },
  /** Domestic personal attendants: 1.5x after 9 a day or 45 a week, no double time. */
  attendant: { rules: { dailyOt: 9 * H, weeklyOt: 45 * H, dailyDt: null, seventhDayDt: null }, cite: "Lab. Code §1454" },
  /** Other household workers who don't live in. */
  household: { rules: EIGHT_FORTY, cite: "IWC Wage Order 15 §3(C)" },
} satisfies Record<string, RuleEntry>;

const f = (id: string, cite: string, en: string, es: string): Fact => ({ id, cite, en, es });

export const WAGE_FACTS = {
  checked: "2026-10-21",
  /** §203: a day's wages for each day late, up to 30 days. */
  penaltyMaxDays: 30,
  /** The form offers each year from now back to `earliestYear`, then the span
   *  `spanFrom`-(earliestYear - 1), then "earlier". Farm overtime before 2022
   *  (large) / 2025 (small) was still phasing in and isn't computed. */
  earliestYear: 2025,
  spanFrom: 2022,

  overtime: [
    f(
      "general",
      "Lab. Code §510(a)",
      "Most jobs: 1.5 times your pay for hours over 8 in a day or over 40 in a week, and for the first 8 hours on the 7th day you work in a workweek. 2 times your pay for hours over 12 in a day, and over 8 on that 7th day.",
      "La mayoría de los trabajos: 1.5 veces su pago por las horas de más de 8 al día o de más de 40 a la semana, y por las primeras 8 horas del 7.º día que trabaja en una semana laboral. 2 veces su pago por las horas de más de 12 al día, y de más de 8 en ese 7.º día.",
    ),
    f(
      "farm",
      "Lab. Code §860, §862; IWC Wage Order 14 §3",
      "Farm work: since January 1, 2025, every farm employer, big or small, follows the same 8-hour, 40-hour and 12-hour rules. Farms with 26 or more workers have followed them since January 1, 2022. The 7th-day rule applies to farms of any size.",
      "Trabajo del campo: desde el 1 de enero de 2025, todo empleador agrícola, grande o pequeño, sigue las mismas reglas de 8 horas, 40 horas y 12 horas. Los ranchos con 26 o más trabajadores las siguen desde el 1 de enero de 2022. La regla del 7.º día aplica a ranchos de cualquier tamaño.",
    ),
    f(
      "attendant",
      "Lab. Code §1454; §1451(d)",
      "Personal attendants in a private home (you watch, feed or dress a child, an older person or a person with a disability, and other work is no more than 20% of your hours): 1.5 times your pay after 9 hours in a day or 45 hours in a week.",
      "Asistentes personales en una casa particular (cuida, da de comer o viste a un niño, a una persona mayor o a una persona con discapacidad, y otro trabajo es como máximo el 20% de sus horas): 1.5 veces su pago después de 9 horas al día o 45 horas a la semana.",
    ),
    f(
      "attendant-excluded",
      "Lab. Code §1451(b)(2)",
      "The personal attendant rule doesn't cover IHSS providers, close family of the employer, babysitters under 18, or casual babysitters.",
      "La regla de asistentes personales no cubre a proveedores de IHSS, familiares cercanos del empleador, niñeras menores de 18 años ni niñeras ocasionales.",
    ),
    f(
      "household",
      "IWC Wage Order 15 §3(C)",
      "Other household work, if you don't live there (cleaning, cooking and similar): the same 8-hour, 40-hour, 12-hour and 7th-day rules as most jobs.",
      "Otro trabajo en una casa, si no vive ahí (limpieza, cocina y parecidos): las mismas reglas de 8 horas, 40 horas, 12 horas y del 7.º día que la mayoría de los trabajos.",
    ),
    f(
      "livein",
      "IWC Wage Order 15 §3(A)-(B)",
      "Live-in household workers have different rules: 12 hours off in a row in each 24 hours, 3 hours off within the 12-hour workday, and extra pay for work during time off and on a 6th or 7th day. This tool can’t count those for you.",
      "Las personas que viven en la casa donde trabajan tienen reglas distintas: 12 horas seguidas libres en cada 24 horas, 3 horas libres dentro del día de 12 horas, y pago extra por trabajar en su tiempo libre y en el 6.º o 7.º día. Esta herramienta no puede calcular eso.",
    ),
    f(
      "exceptions",
      "Lab. Code §510(a)(1)-(3), §511, §514",
      "Different rules can apply under a valid alternative workweek schedule or some union contracts. Salaried “exempt” workers are not covered.",
      "Pueden aplicar otras reglas si hay un horario alternativo válido o algunos contratos sindicales. Los trabajadores asalariados “exentos” no están cubiertos.",
    ),
  ],

  minWage: [
    f(
      "rate",
      "Lab. Code §1182.12; IWC Wage Order 14 §4(A)(1)",
      "The California minimum wage is $16.90 an hour in 2026 for every employer, big or small. It goes up to $17.40 on January 1, 2027.",
      "El salario mínimo de California es de $16.90 por hora en 2026 para todo empleador, grande o pequeño. Sube a $17.40 el 1 de enero de 2027.",
    ),
    f(
      "local",
      "UC Berkeley Labor Center inventory (linked by DIR)",
      "No city in Stanislaus County, and not the county itself, has its own higher minimum wage. The state rate applies.",
      "Ninguna ciudad del condado de Stanislaus, ni el condado, tiene su propio salario mínimo más alto. Aplica el de todo el estado.",
    ),
    f(
      "piece",
      "IWC Wage Order 14 §4(B); Lab. Code §226.2",
      "Paid by the piece, by the day or by salary? Your total pay must still be at least the minimum wage for every hour worked. Piece-rate workers must also be paid separately for rest breaks and for waiting or travel time.",
      "¿Le pagan por pieza, por día o por sueldo? Su pago total igual tiene que ser por lo menos el salario mínimo por cada hora trabajada. A quienes les pagan por pieza también les deben pagar aparte los descansos y el tiempo de espera o de traslado.",
    ),
    f(
      "liquidated",
      "Lab. Code §1194.2",
      "If you were paid less than the minimum wage, you can also ask for “liquidated damages”: an extra amount equal to the unpaid minimum wages, plus interest, unless the employer proves it acted in good faith. This tool does not add it.",
      "Si le pagaron menos del salario mínimo, también puede pedir “daños liquidados”: una cantidad extra igual a los salarios mínimos no pagados, más intereses, a menos que el empleador pruebe que actuó de buena fe. Esta herramienta no la suma.",
    ),
    f(
      "special",
      "Lab. Code §1474 et seq.; SB 525",
      "Some fast-food chain and health care workers have a higher minimum wage. Check the DIR pages in the sources below. This tool uses the state minimum.",
      "Algunos trabajadores de cadenas de comida rápida y de servicios de salud tienen un salario mínimo más alto. Revise las páginas del DIR en las fuentes de abajo. Esta herramienta usa el mínimo del estado.",
    ),
  ],

  breaks: [
    f(
      "meal",
      "Lab. Code §512(a); IWC Wage Orders 14 and 15 §11",
      "Meal break: 30 minutes off duty when you work more than 5 hours (you can agree to skip it only if the day is 6 hours or less). A second 30 minutes after 10 hours.",
      "Comida: 30 minutos libres cuando trabaja más de 5 horas (solo se puede acordar no tomarla si el día es de 6 horas o menos). Otros 30 minutos después de 10 horas.",
    ),
    f(
      "rest",
      "IWC Wage Orders 14 and 15 §12",
      "Rest break: 10 paid minutes for every 4 hours of work or major part of 4 hours (more than 2 hours). Not required if you work less than 3½ hours that day.",
      "Descanso: 10 minutos pagados por cada 4 horas de trabajo o la mayor parte de 4 horas (más de 2 horas). No es obligatorio si trabaja menos de 3½ horas ese día.",
    ),
    f(
      "premium",
      "Lab. Code §226.7(c)",
      "If your employer didn’t give you a required meal, rest or heat cool-down break, it owes you one extra hour of pay at your regular rate for each workday that happened.",
      "Si su empleador no le dio una comida, un descanso o una pausa para refrescarse del calor que le correspondía, le debe una hora extra de pago a su tarifa normal por cada día de trabajo en que pasó.",
    ),
  ],

  finalPay: [
    f("fired", "Lab. Code §201(a)", "Fired or laid off: all your pay is due right away, on your last day.", "Si lo despidieron o lo dejaron sin trabajo: le deben todo su pago de inmediato, en su último día."),
    f("quit-notice", "Lab. Code §202(a)", "Quit and gave at least 72 hours’ notice: your pay is due on your last day.", "Si renunció y avisó con por lo menos 72 horas: le deben su pago en su último día."),
    f(
      "quit-no-notice",
      "Lab. Code §202(a)",
      "Quit without 72 hours’ notice: your pay is due within 72 hours. You can ask for it by mail; the day it is mailed counts as the day you were paid.",
      "Si renunció sin avisar con 72 horas: le deben su pago dentro de 72 horas. Puede pedir que se lo manden por correo; el día que lo mandan cuenta como el día que le pagaron.",
    ),
    f(
      "seasonal",
      "Lab. Code §201(a)",
      "Narrow exception: when a group is laid off at the end of seasonal work curing, canning or drying fruit, fish or vegetables (canneries, dry yards), pay is due within 72 hours. This does not cover field harvest work.",
      "Excepción limitada: cuando despiden a un grupo al terminar la temporada de curado, enlatado o secado de fruta, pescado o verduras (enlatadoras, secaderos), deben pagar dentro de 72 horas. Esto no cubre la cosecha en el campo.",
    ),
    f(
      "penalty",
      "Lab. Code §203(a)-(b)",
      "If the employer willfully pays your final wages late, it owes a day’s wages for each day late, up to 30 days. You can claim it as long as you can still claim the wages themselves.",
      "Si el empleador a propósito le paga tarde su pago final, le debe el salario de un día por cada día de retraso, hasta 30 días. Puede reclamarlo mientras todavía pueda reclamar los salarios.",
    ),
  ],

  claim: [
    f(
      "status",
      "Lab. Code §1171.5",
      "Anyone who worked in California can file, whatever their immigration status. You don’t need a Social Security number or a photo ID.",
      "Cualquier persona que trabajó en California puede presentar un reclamo, sin importar su estatus migratorio. No necesita número de Seguro Social ni identificación con foto.",
    ),
    f(
      "fee",
      "DIR: How to file a wage claim",
      "The Labor Commissioner lists no fee to file a wage claim. You don’t need a lawyer.",
      "La Comisión Laboral no indica ningún costo para presentar un reclamo de salarios. No necesita abogado.",
    ),
    f(
      "interpreter",
      "DLSE Form 1, box 5a",
      "The Labor Commissioner will give you an interpreter in your language. Mark “Interpreter needed” on the form and write your language.",
      "La Comisión Laboral le dará un intérprete en su idioma. Marque “Interpreter needed” (necesito intérprete) en el formulario y escriba su idioma.",
    ),
    f(
      "deadlines",
      "CCP §337, §338(a), §339, §340(a)",
      "Deadlines, counted back from the day you file: 3 years for minimum wage, overtime and break premiums; 4 years for a written contract; 2 years for a spoken promise to pay more than the minimum; 1 year for some penalties. File soon: the oldest weeks drop off as time passes.",
      "Plazos, contados hacia atrás desde el día que presenta: 3 años para salario mínimo, horas extra y pagos por descansos; 4 años para un contrato escrito; 2 años para una promesa de palabra de pagar más del mínimo; 1 año para algunas multas. Presente pronto: las semanas más viejas se pierden con el tiempo.",
    ),
    f(
      "process",
      "Lab. Code §98 et seq.",
      "Usually there is first a meeting to try to settle. If it doesn’t settle, there is a hearing: informal, but under oath and binding. If you miss either one, your claim can be dismissed. The written decision comes within 15 days after the hearing.",
      "Por lo general primero hay una reunión para intentar llegar a un acuerdo. Si no hay acuerdo, hay una audiencia: es informal, pero bajo juramento y obligatoria. Si falta a cualquiera de las dos, pueden cerrar su reclamo. La decisión por escrito llega dentro de 15 días después de la audiencia.",
    ),
    f(
      "group",
      "DLSE brochure",
      "Co-workers have the same problem? A report to the Labor Commissioner’s Bureau of Field Enforcement can cover the whole group. Your own claim only gets your pay back.",
      "¿Sus compañeros tienen el mismo problema? Un reporte a la Oficina de Inspección (BOFE) de la Comisión Laboral puede cubrir a todo el grupo. Su propio reclamo solo recupera su pago.",
    ),
  ],

  bring: [
    { en: "Your employer’s name and address (a pay stub, labels or a license plate number can help)", es: "El nombre y la dirección de su empleador (un talón de pago, etiquetas o el número de placa pueden ayudar)" },
    { en: "Your own notes of the days and hours you worked (a calendar, notebook or photos)", es: "Sus propias notas de los días y horas que trabajó (un calendario, una libreta o fotos)" },
    { en: "Pay stubs and checks, including any check that bounced", es: "Talones de pago y cheques, incluso cualquier cheque sin fondos" },
    { en: "The written notice about your pay and employer (Labor Code §2810.5), if you got one", es: "El aviso por escrito sobre su pago y su empleador (Código Laboral §2810.5), si se lo dieron" },
    { en: "Any contract or piece-rate records", es: "Cualquier contrato o registro de pago por pieza" },
  ] satisfies Bilingual[],

  retaliation: [
    f(
      "no-retaliation",
      "Lab. Code §98.6",
      "It’s illegal to fire, threaten, demote or punish you for asking about your pay, complaining (even out loud) or filing a claim. If it happens within 90 days, the law presumes it was retaliation. You can get your job back, lost pay, and up to $10,000 per violation.",
      "Es ilegal despedirle, amenazarle, bajarle de puesto o castigarle por preguntar por su pago, quejarse (aunque sea de palabra) o presentar un reclamo. Si pasa dentro de 90 días, la ley supone que fue represalia. Puede recuperar su trabajo, el pago perdido y hasta $10,000 por cada violación.",
    ),
    f(
      "complaint",
      "Lab. Code §98.7(a)",
      "You have 1 year to file a retaliation complaint with the Labor Commissioner.",
      "Tiene 1 año para presentar una queja por represalias ante la Comisión Laboral.",
    ),
    f(
      "immigration",
      "Lab. Code §1019, §1019.1, §244(b)",
      "It’s illegal to threaten to call immigration, or to call it, on you or your family because you used your work rights. The same goes for suddenly asking for more papers or re-checking your papers to punish you.",
      "Es ilegal amenazar con llamar a inmigración, o llamarla, contra usted o su familia porque usó sus derechos laborales. Lo mismo vale para pedirle de repente más documentos o volver a revisar sus papeles para castigarle.",
    ),
    f(
      "whistle",
      "Lab. Code §1102.5",
      "You are also protected when you report a violation to a government agency or a supervisor, or refuse to break the law.",
      "También está protegido cuando reporta una violación a una agencia del gobierno o a un supervisor, o cuando se niega a violar la ley.",
    ),
  ],

  /** Labor Commissioner district office for every Stanislaus zip tested. */
  office: {
    name: { en: "Labor Commissioner’s Office, Lodi (serves Stanislaus County)", es: "Oficina de la Comisión Laboral en Lodi (atiende al condado de Stanislaus)" },
    address: "3021 Reynolds Ranch Parkway, Suite 160, Lodi, CA 95240",
    phone: "(209) 948-7771",
    email: "LaborComm.WCA.LOD@dir.ca.gov",
    hours: { en: "Monday to Friday, 9:00 to 12:30 and 1:30 to 5:00", es: "Lunes a viernes, de 9:00 a 12:30 y de 1:30 a 5:00" },
    url: "https://www.dir.ca.gov/dlse/DistrictOffices.htm",
  },
  statewide: { phone: "833-526-4636", online: "https://cadir.my.site.com/oc" },
  forms: {
    en: "https://www.dir.ca.gov/dlse/Forms/Wage/English.pdf",
    es: "https://www.dir.ca.gov/dlse/Forms/Wage/Spanish.pdf",
    howTo: "https://www.dir.ca.gov/dlse/HowToFileWageClaim.htm",
    retaliation: "https://www.dir.ca.gov/dlse/HowToFileRetaliationComplaint.htm",
  },
  /** Free information and referrals (not representation). */
  legalAidAtWork: {
    name: { en: "Legal Aid at Work: Workers’ Rights Clinic", es: "Legal Aid at Work: Clínica de Derechos de los Trabajadores" },
    phone: "(209) 497-4399",
    url: "https://legalaidatwork.org/clinics/workers-rights-clinic/",
  } satisfies Contact,
};

export const WAGE_SOURCES: SourceRef[] = [
  { label: "Labor Code §510 (overtime)", url: LAB("510") },
  { label: "Labor Code §860 and §862 (farm overtime)", url: LAB("860") },
  { label: "Labor Code §1451 and §1454 (domestic workers)", url: LAB("1454") },
  { label: "IWC Wage Order 14 (agriculture), Rev. 11/2025", url: "https://www.dir.ca.gov/iwc/IWCArticle14.pdf" },
  { label: "IWC Wage Order 15 (household), Rev. 11/2025", url: "https://www.dir.ca.gov/iwc/IWCArticle15.pdf" },
  { label: "DIR: minimum wage", url: "https://www.dir.ca.gov/dlse/minimum_wage.htm" },
  { label: "DIR: 2027 minimum wage announcement", url: "https://dir.ca.gov/DIRNews/2026/2026-66.html" },
  { label: "UC Berkeley Labor Center: local minimum wages", url: "https://laborcenter.berkeley.edu/inventory-of-us-city-and-county-minimum-wage-ordinances/" },
  { label: "DIR: fast food minimum wage FAQ", url: "https://www.dir.ca.gov/dlse/Fast-Food-Minimum-Wage-FAQ.htm" },
  { label: "DIR: health care worker minimum wage FAQ", url: "https://www.dir.ca.gov/dlse/Health-Care-Worker-Minimum-Wage-FAQ.htm" },
  { label: "Labor Code §512 and §226.7 (meal and rest breaks)", url: LAB("226.7") },
  { label: "DIR: rest periods FAQ", url: "https://www.dir.ca.gov/dlse/faq_restperiods.htm" },
  { label: "Labor Code §201, §202, §203 (final pay)", url: LAB("203") },
  { label: "DIR: waiting time penalty FAQ", url: "https://www.dir.ca.gov/dlse/faq_waitingtimepenalty.htm" },
  { label: "Labor Code §1194.2 (liquidated damages)", url: LAB("1194.2") },
  { label: "Labor Code §1171.5 (immigration status)", url: LAB("1171.5") },
  { label: "DIR: how to file a wage claim", url: "https://www.dir.ca.gov/dlse/HowToFileWageClaim.htm" },
  { label: "DIR: Labor Commissioner district offices", url: "https://www.dir.ca.gov/dlse/DistrictOffices.htm" },
  { label: "Labor Code §98.6, §98.7, §1019, §1102.5 (retaliation)", url: LAB("98.6") },
  { label: "Legal Aid at Work: sample letter for final wages", url: "https://legalaidatwork.org/sample-letters/letter-requesting-payment-of-final-wages/" },
];
