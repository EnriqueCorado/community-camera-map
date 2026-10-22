// Wording for "Unpaid wages", written per language. Legal facts and their
// citations live in wages-facts.ts; shared strings (yes/no, sources, new
// tab, letter buttons…) come from HelpCopy.
import type { Lang } from "../i18n";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface WagesCopy {
  lead: string;
  step1: string;
  jobType: string;
  jobFarm: string;
  jobHousehold: string;
  jobOther: string;
  hhKind: string;
  hhKindHint: string;
  hhAttendant: string;
  hhOther: string;
  hhLiveIn: string;
  workYear: string;
  workYearHint: string;
  yearSpan: Fn<[number, number]>;
  yearEarlier: Fn<[number]>;
  farmSize: string;
  farmSizeHint: string;
  farmLarge: string;
  farmSmall: string;
  rulesTitle: string;
  rulesGeneral: string;
  rulesFarm: string;
  rulesAttendant: string;
  rulesHousehold: string;
  rulesLiveIn: string;
  rulesFarmEarlier: Fn<[number]>;
  step2: string;
  hoursHint: string;
  weekStart: string;
  weekStartHint: string;
  /** Short day names, Sunday first (labels for the hour boxes). */
  days: string[];
  /** Full day names, Sunday first. */
  daysLong: string[];
  weekLegend: Fn<[number]>;
  weekTotal: Fn<[string]>;
  removeWeek: Fn<[number]>;
  addWeek: string;
  maxWeeks: Fn<[number]>;
  hoursInvalid: string;
  rate: string;
  rateHint: string;
  paid: string;
  paidHint: string;
  step3: string;
  step3Hint: string;
  breaksTitle: string;
  mealDays: string;
  mealDaysHint: string;
  restDays: string;
  restDaysHint: string;
  countInvalid: string;
  breaksAsk: string;
  finalTitle: string;
  ended: string;
  endStill: string;
  endFired: string;
  endQuitNotice: string;
  endQuitNoNotice: string;
  endSeasonal: string;
  lastDay: string;
  usualHours: string;
  usualHoursHint: string;
  finalPaid: string;
  notYet: string;
  paidOn: string;
  paidBeforeLast: string;
  resultsTitle: string;
  needJob: string;
  needRate: string;
  needPaid: string;
  resultsEmpty: string;
  totalTitle: Fn<[string]>;
  nothingOwed: string;
  estimate: string;
  tableCaption: string;
  colItem: string;
  colHours: string;
  colAmount: string;
  rowRegular: Fn<[string]>;
  rowOvertime: Fn<[string]>;
  rowDouble: Fn<[string]>;
  rowMinWage: Fn<[string]>;
  rowEarned: string;
  rowPaid: string;
  rowUnpaid: string;
  rowMeal: Fn<[number]>;
  rowRest: Fn<[number]>;
  rowWaiting: Fn<[number]>;
  rowTotal: string;
  noteOtUnknown: string;
  noteRateFromMin: Fn<[string]>;
  noteNoMinWage: Fn<[string]>;
  noteBelowMin: string;
  noteSeventh: Fn<[string]>;
  notePaidMore: string;
  noteBothBreaks: string;
  noteWillful: string;
  notePenaltyGrowing: Fn<[number]>;
  noteRegularRate: string;
  claimTitle: string;
  claimIntro: string;
  officePage: string;
  officeNote: string;
  statewide: string;
  fileOnline: string;
  formEs: string;
  formEn: string;
  bringTitle: string;
  retaliationTitle: string;
  retaliationLink: string;
  letterNote: string;
  helpTitle: string;
  helpText: string;
  laawNote: string;
  helpButton: string;
  rulesHeading: string;
  rulesOvertime: string;
  rulesMinWage: string;
  rulesBreaks: string;
  rulesFinal: string;
}

const en: WagesCopy = {
  lead: "Find out if you were paid everything you earned: overtime, minimum wage, missed breaks, and late final pay. Then see how to ask for it. What you type stays on this device.",
  step1: "1. Your job",
  jobType: "What kind of work was it?",
  jobFarm: "Farm or field work",
  jobHousehold: "In someone’s home (caregiver, nanny, cleaner)",
  jobOther: "Other work (restaurant, store, warehouse, packing house…)",
  hhKind: "What did you do in the home?",
  hhKindHint: "A personal attendant mostly watches, feeds or dresses a child, an older person or a person with a disability.",
  hhAttendant: "Personal attendant or caregiver",
  hhOther: "Cleaning, cooking or other housework (I don’t live there)",
  hhLiveIn: "I live in the home where I work",
  workYear: "When did you do this work?",
  workYearHint: "The minimum wage changes each year. If your weeks are in different years, check each year separately.",
  yearSpan: (a, b) => `${a}–${b}`,
  yearEarlier: (y) => `Before ${y}`,
  farmSize: "How many workers does the farm employer have?",
  farmSizeHint: "Before 2025, farms with 25 or fewer workers had different overtime rules.",
  farmLarge: "26 or more",
  farmSmall: "25 or fewer",
  rulesTitle: "The overtime rules for your job",
  rulesGeneral: "1.5 times your pay after 8 hours in a day or 40 in a week. 2 times after 12 hours in a day. If you work all 7 days of the workweek, the 7th day is 1.5 times for the first 8 hours and 2 times after that.",
  rulesFarm: "Farm work follows the same rules as most jobs: 1.5 times your pay after 8 hours in a day or 40 in a week, 2 times after 12 hours in a day, and extra pay on the 7th day in a row.",
  rulesAttendant: "Personal attendants get 1.5 times their pay after 9 hours in a day or 45 hours in a week.",
  rulesHousehold: "1.5 times your pay after 8 hours in a day or 40 in a week. 2 times after 12 hours in a day, and extra pay on the 7th day of work in the week.",
  rulesLiveIn: "Live-in household workers have special overtime rules based on time off. This tool counts every hour at your regular pay only, so it may show less than you are owed. Ask the Labor Commissioner.",
  rulesFarmEarlier: (y) =>
    `Farm overtime for employers this size was still being phased in before ${y}, and we haven’t confirmed those rules. This tool counts every hour at your regular pay only, so it may show less than you are owed. Ask the Labor Commissioner.`,
  step2: "2. Your hours and pay",
  hoursHint: "Type the hours you worked each day, like 8, 9.5 or 10:30. Leave days off blank. Add one week at a time.",
  weekStart: "Your workweek starts on",
  weekStartHint: "Overtime counts by your employer’s workweek. If you don’t know, leave Monday.",
  days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  daysLong: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  weekLegend: (n) => `Week ${n}: hours each day`,
  weekTotal: (h) => `Week total: ${h} hours`,
  removeWeek: (n) => `Remove week ${n}`,
  addWeek: "Add another week",
  maxWeeks: (n) => `You can add up to ${n} weeks at a time.`,
  hoursInvalid: "Type hours as numbers, like 8, 8.5 or 8:30 (no more than 24 in a day).",
  rate: "Your hourly pay",
  rateHint: "Before taxes. Paid by the piece or by the day? Leave it blank: we’ll check against the minimum wage.",
  paid: "What you were actually paid for these weeks",
  paidHint: "The total before taxes (gross pay on your stub, or the cash you got). Taxes taken out still count as paid. Type 0 if you got nothing.",
  step3: "3. Breaks and final pay (optional)",
  step3Hint: "Skip what doesn’t apply to you.",
  breaksTitle: "Missed breaks",
  mealDays: "Days you didn’t get a meal break you were owed",
  mealDaysHint: "A 30-minute break when you work more than 5 hours.",
  restDays: "Days you didn’t get a rest break you were owed",
  restDaysHint: "10 paid minutes for about every 4 hours. Count days, not breaks. These can be days at this job outside the weeks above.",
  countInvalid: "Type a number of days, like 3.",
  breaksAsk: "We haven’t confirmed how the break rules apply to your kind of household job, so this tool doesn’t count them. Ask the Labor Commissioner.",
  finalTitle: "Final pay",
  ended: "Is this job over?",
  endStill: "No, I still work there",
  endFired: "I was fired or laid off",
  endQuitNotice: "I quit and gave at least 72 hours’ notice",
  endQuitNoNotice: "I quit without 72 hours’ notice",
  endSeasonal: "Laid off with a group when the season ended at a cannery or dry yard",
  lastDay: "Your last day of work",
  usualHours: "Hours in a usual workday",
  usualHoursHint: "Used to figure a day’s pay for the late-pay penalty.",
  finalPaid: "Did you get your final pay?",
  notYet: "Not yet",
  paidOn: "Date you got your final pay",
  paidBeforeLast: "The date you got paid can’t be before your last day.",
  resultsTitle: "What you may be owed",
  needJob: "Answer step 1 first.",
  needRate: "Type your hourly pay to see the amounts.",
  needPaid: "Type what you were paid for these weeks (0 if nothing) to see what is unpaid.",
  resultsEmpty: "Fill in your hours, breaks or final pay to see the amounts.",
  totalTitle: (a) => `You may be owed about ${a}`,
  nothingOwed: "From what you typed, you were paid enough for these hours",
  estimate: "This is an estimate from what you typed, not a decision. Each line shows the law it comes from. Amounts are rounded down to the cent.",
  tableCaption: "How the amount adds up",
  colItem: "What",
  colHours: "Hours",
  colAmount: "Amount",
  rowRegular: (r) => `Regular hours at ${r}`,
  rowOvertime: (r) => `Overtime at 1.5 × ${r}`,
  rowDouble: (r) => `Double time at 2 × ${r}`,
  rowMinWage: (m) => `Extra to reach the minimum wage (${m} an hour)`,
  rowEarned: "What these hours should have paid",
  rowPaid: "Minus what you were paid",
  rowUnpaid: "Unpaid wages",
  rowMeal: (n) => `Missed meal breaks: ${n} ${n === 1 ? "day" : "days"}, 1 hour of pay each`,
  rowRest: (n) => `Missed rest breaks: ${n} ${n === 1 ? "day" : "days"}, 1 hour of pay each`,
  rowWaiting: (n) => `Late final pay: ${n} ${n === 1 ? "day" : "days"} of wages`,
  rowTotal: "Total you may be owed",
  noteOtUnknown: "Overtime isn’t counted here because we couldn’t confirm the rules for your job and year (see step 1). You may be owed more.",
  noteRateFromMin: (m) => `No hourly pay was typed, so your hours are counted at the minimum wage (${m}). If you earned more per hour, you may be owed more.`,
  noteNoMinWage: (y) => `We haven’t confirmed the minimum wage for “${y}”, so the minimum wage check was skipped. Ask the Labor Commissioner.`,
  noteBelowMin: "Your hourly pay is below the minimum wage. You can also ask for “liquidated damages”: an extra amount equal to the unpaid minimum wages (Lab. Code §1194.2). It isn’t added here.",
  noteSeventh: (d) => `You worked all 7 days of a workweek, so ${d} counts as the 7th day: 1.5 times for the first 8 hours and 2 times after.`,
  notePaidMore: "You were paid more than these hours add up to. Check that the hours and pay cover the same weeks.",
  noteBothBreaks: "This counts one hour for missed meal breaks and one for missed rest breaks, even on the same day. Courts have allowed both; confirm with the Labor Commissioner.",
  noteWillful: "The late-pay penalty applies when the employer “willfully” paid late. The Labor Commissioner decides that.",
  notePenaltyGrowing: (n) => `Your final pay is still late, so the penalty keeps growing each day, up to ${n} days.`,
  noteRegularRate: "Overtime and break pay use your hourly pay as your regular rate. Bonuses or piece-rate pay can raise it, so you may be owed more.",
  claimTitle: "How to file a wage claim",
  claimIntro: "The Labor Commissioner is the state office that decides unpaid wage claims. You can file online, by email, by mail or in person, using the form called “Initial Report or Claim” (Form 1). It also comes in Spanish.",
  officePage: "Office page",
  officeNote: "There is no Labor Commissioner office in Stanislaus County. The Lodi office handles every Stanislaus County zip code we checked, including Modesto, Turlock, Ceres, Oakdale, Riverbank and Patterson.",
  statewide: "Statewide line (wages, breaks, retaliation; interpreters available):",
  fileOnline: "File a claim online",
  formEs: "Form 1 in Spanish (PDF)",
  formEn: "Form 1 in English (PDF)",
  bringTitle: "What to bring (copies, not originals)",
  retaliationTitle: "Your employer can’t punish you for this",
  retaliationLink: "How to file a retaliation complaint",
  letterNote: "A letter does not pause the deadline to file a claim. If time is short, file the claim too.",
  helpTitle: "Free help with a wage problem",
  helpText: "You don’t need a lawyer to file a wage claim. If you want advice first, these free services can help, in Spanish too.",
  laawNote: "Free, confidential information and referrals about work rights (not a lawyer for your case). Check its website for hours and holiday closures.",
  helpButton: "See free legal help near you",
  rulesHeading: "The rules this tool uses",
  rulesOvertime: "Overtime",
  rulesMinWage: "Minimum wage",
  rulesBreaks: "Meal and rest breaks",
  rulesFinal: "Final pay",
};

const es: WagesCopy = {
  lead: "Averigüe si le pagaron todo lo que ganó: horas extra, salario mínimo, descansos que no le dieron y el pago final atrasado. Luego vea cómo pedirlo. Lo que escriba se queda en este aparato.",
  step1: "1. Su trabajo",
  jobType: "¿Qué tipo de trabajo era?",
  jobFarm: "Trabajo del campo o agrícola",
  jobHousehold: "En la casa de alguien (cuidador, niñera, limpieza)",
  jobOther: "Otro trabajo (restaurante, tienda, bodega, empacadora…)",
  hhKind: "¿Qué hacía en la casa?",
  hhKindHint: "Un asistente personal principalmente cuida, da de comer o viste a un niño, a una persona mayor o a una persona con discapacidad.",
  hhAttendant: "Asistente personal o cuidador",
  hhOther: "Limpieza, cocina u otro quehacer (no vivo ahí)",
  hhLiveIn: "Vivo en la casa donde trabajo",
  workYear: "¿Cuándo hizo este trabajo?",
  workYearHint: "El salario mínimo cambia cada año. Si sus semanas son de años distintos, revise cada año por separado.",
  yearSpan: (a, b) => `${a}–${b}`,
  yearEarlier: (y) => `Antes de ${y}`,
  farmSize: "¿Cuántos trabajadores tiene el empleador agrícola?",
  farmSizeHint: "Antes de 2025, los ranchos con 25 trabajadores o menos tenían otras reglas de horas extra.",
  farmLarge: "26 o más",
  farmSmall: "25 o menos",
  rulesTitle: "Las reglas de horas extra para su trabajo",
  rulesGeneral: "1.5 veces su pago después de 8 horas al día o 40 a la semana. 2 veces después de 12 horas al día. Si trabaja los 7 días de la semana laboral, el 7.º día se paga 1.5 veces las primeras 8 horas y 2 veces después.",
  rulesFarm: "El trabajo del campo sigue las mismas reglas que la mayoría de los trabajos: 1.5 veces su pago después de 8 horas al día o 40 a la semana, 2 veces después de 12 horas al día, y pago extra el 7.º día seguido.",
  rulesAttendant: "Los asistentes personales reciben 1.5 veces su pago después de 9 horas al día o 45 horas a la semana.",
  rulesHousehold: "1.5 veces su pago después de 8 horas al día o 40 a la semana. 2 veces después de 12 horas al día, y pago extra el 7.º día de trabajo de la semana.",
  rulesLiveIn: "Quienes viven en la casa donde trabajan tienen reglas especiales de horas extra según su tiempo libre. Esta herramienta cuenta cada hora solo a su pago normal, así que puede mostrar menos de lo que le deben. Pregunte a la Comisión Laboral.",
  rulesFarmEarlier: (y) =>
    `Antes de ${y}, las horas extra del campo para empleadores de este tamaño se estaban introduciendo poco a poco, y no hemos confirmado esas reglas. Esta herramienta cuenta cada hora solo a su pago normal, así que puede mostrar menos de lo que le deben. Pregunte a la Comisión Laboral.`,
  step2: "2. Sus horas y su pago",
  hoursHint: "Escriba las horas que trabajó cada día, como 8, 9.5 o 10:30. Deje en blanco los días libres. Agregue una semana a la vez.",
  weekStart: "Su semana laboral empieza el",
  weekStartHint: "Las horas extra se cuentan por la semana laboral de su empleador. Si no sabe, deje lunes.",
  days: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  daysLong: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  weekLegend: (n) => `Semana ${n}: horas de cada día`,
  weekTotal: (h) => `Total de la semana: ${h} horas`,
  removeWeek: (n) => `Quitar la semana ${n}`,
  addWeek: "Agregar otra semana",
  maxWeeks: (n) => `Puede agregar hasta ${n} semanas a la vez.`,
  hoursInvalid: "Escriba las horas con números, como 8, 8.5 o 8:30 (no más de 24 al día).",
  rate: "Su pago por hora",
  rateHint: "Antes de impuestos. ¿Le pagan por pieza o por día? Déjelo en blanco: lo revisamos con el salario mínimo.",
  paid: "Lo que de verdad le pagaron por estas semanas",
  paidHint: "El total antes de impuestos (el pago bruto de su talón, o el efectivo que recibió). Los impuestos que le quitaron cuentan como pagados. Escriba 0 si no recibió nada.",
  step3: "3. Descansos y pago final (opcional)",
  step3Hint: "Sáltese lo que no aplica a su caso.",
  breaksTitle: "Descansos que no le dieron",
  mealDays: "Días sin el periodo de comida que le correspondía",
  mealDaysHint: "Una pausa de 30 minutos cuando trabaja más de 5 horas.",
  restDays: "Días sin el descanso que le correspondía",
  restDaysHint: "10 minutos pagados por cada 4 horas, más o menos. Cuente días, no descansos. Pueden ser días de este trabajo fuera de las semanas de arriba.",
  countInvalid: "Escriba un número de días, como 3.",
  breaksAsk: "No hemos confirmado cómo aplican las reglas de descansos a su tipo de trabajo en casa, así que esta herramienta no los cuenta. Pregunte a la Comisión Laboral.",
  finalTitle: "Pago final",
  ended: "¿Ya terminó este trabajo?",
  endStill: "No, todavía trabajo ahí",
  endFired: "Me despidieron o me dejaron sin trabajo",
  endQuitNotice: "Renuncié y avisé con por lo menos 72 horas",
  endQuitNoNotice: "Renuncié sin avisar con 72 horas",
  endSeasonal: "Me despidieron con un grupo al terminar la temporada en una enlatadora o secadero",
  lastDay: "Su último día de trabajo",
  usualHours: "Horas de un día normal de trabajo",
  usualHoursHint: "Sirve para calcular el pago de un día para la penalidad por pago atrasado.",
  finalPaid: "¿Recibió su pago final?",
  notYet: "Todavía no",
  paidOn: "Fecha en que recibió su pago final",
  paidBeforeLast: "La fecha en que le pagaron no puede ser antes de su último día.",
  resultsTitle: "Lo que le podrían deber",
  needJob: "Primero conteste el paso 1.",
  needRate: "Escriba su pago por hora para ver las cantidades.",
  needPaid: "Escriba lo que le pagaron por estas semanas (0 si no recibió nada) para ver lo que falta.",
  resultsEmpty: "Llene sus horas, descansos o pago final para ver las cantidades.",
  totalTitle: (a) => `Le podrían deber unos ${a}`,
  nothingOwed: "Según lo que escribió, le pagaron lo suficiente por estas horas",
  estimate: "Es un cálculo a partir de lo que escribió, no una decisión. Cada línea muestra la ley de donde viene. Las cantidades se redondean hacia abajo al centavo.",
  tableCaption: "Cómo se suma la cantidad",
  colItem: "Concepto",
  colHours: "Horas",
  colAmount: "Cantidad",
  rowRegular: (r) => `Horas normales a ${r}`,
  rowOvertime: (r) => `Horas extra a 1.5 × ${r}`,
  rowDouble: (r) => `Tiempo doble a 2 × ${r}`,
  rowMinWage: (m) => `Lo que falta para llegar al salario mínimo (${m} por hora)`,
  rowEarned: "Lo que debieron pagarle por estas horas",
  rowPaid: "Menos lo que le pagaron",
  rowUnpaid: "Salarios no pagados",
  rowMeal: (n) => `Comidas que no le dieron: ${n} ${n === 1 ? "día" : "días"}, 1 hora de pago cada uno`,
  rowRest: (n) => `Descansos que no le dieron: ${n} ${n === 1 ? "día" : "días"}, 1 hora de pago cada uno`,
  rowWaiting: (n) => `Pago final atrasado: ${n} ${n === 1 ? "día" : "días"} de salario`,
  rowTotal: "Total que le podrían deber",
  noteOtUnknown: "Aquí no se cuentan horas extra porque no pudimos confirmar las reglas para su trabajo y año (vea el paso 1). Le podrían deber más.",
  noteRateFromMin: (m) => `No escribió un pago por hora, así que sus horas se cuentan al salario mínimo (${m}). Si ganaba más por hora, le podrían deber más.`,
  noteNoMinWage: (y) => `No hemos confirmado el salario mínimo de “${y}”, así que no se revisó. Pregunte a la Comisión Laboral.`,
  noteBelowMin: "Su pago por hora es menor que el salario mínimo. También puede pedir “daños liquidados”: una cantidad extra igual a los salarios mínimos no pagados (Código Laboral §1194.2). No se suma aquí.",
  noteSeventh: (d) => `Trabajó los 7 días de una semana laboral, así que el ${d} cuenta como 7.º día: 1.5 veces las primeras 8 horas y 2 veces después.`,
  notePaidMore: "Le pagaron más de lo que suman estas horas. Revise que las horas y el pago sean de las mismas semanas.",
  noteBothBreaks: "Esto cuenta una hora por comidas y otra por descansos que no le dieron, aunque sea el mismo día. Las cortes han permitido las dos; confírmelo con la Comisión Laboral.",
  noteWillful: "La penalidad por pago atrasado aplica cuando el empleador pagó tarde “a propósito”. Eso lo decide la Comisión Laboral.",
  notePenaltyGrowing: (n) => `Su pago final sigue atrasado, así que la penalidad sigue creciendo cada día, hasta ${n} días.`,
  noteRegularRate: "Las horas extra y el pago por descansos usan su pago por hora como tarifa normal. Los bonos o el pago por pieza pueden subirla, así que le podrían deber más.",
  claimTitle: "Cómo presentar un reclamo de salarios",
  claimIntro: "La Comisión Laboral (Labor Commissioner) es la oficina del estado que decide los reclamos de salarios no pagados. Puede presentarlo en línea, por correo electrónico, por correo o en persona, con el formulario “Reporte Inicial o Reclamo” (Formulario 1), que también está en español.",
  officePage: "Página de la oficina",
  officeNote: "No hay oficina de la Comisión Laboral en el condado de Stanislaus. La oficina de Lodi atiende todos los códigos postales del condado que revisamos, entre ellos Modesto, Turlock, Ceres, Oakdale, Riverbank y Patterson.",
  statewide: "Línea de todo el estado (salarios, descansos, represalias; hay intérpretes):",
  fileOnline: "Presentar un reclamo en línea",
  formEs: "Formulario 1 en español (PDF)",
  formEn: "Formulario 1 en inglés (PDF)",
  bringTitle: "Qué llevar (copias, no originales)",
  retaliationTitle: "Su empleador no puede castigarle por esto",
  retaliationLink: "Cómo presentar una queja por represalias",
  letterNote: "Una carta no detiene el plazo para presentar un reclamo. Si queda poco tiempo, presente también el reclamo.",
  helpTitle: "Ayuda gratis con un problema de salarios",
  helpText: "No necesita abogado para presentar un reclamo de salarios. Si quiere un consejo antes, estos servicios gratis pueden ayudarle, también en español.",
  laawNote: "Información y referencias gratis y confidenciales sobre derechos laborales (no le asignan un abogado para su caso). Revise su sitio web para ver el horario y los días festivos en que cierra.",
  helpButton: "Ver ayuda legal gratis cerca de usted",
  rulesHeading: "Las reglas que usa esta herramienta",
  rulesOvertime: "Horas extra",
  rulesMinWage: "Salario mínimo",
  rulesBreaks: "Comidas y descansos",
  rulesFinal: "Pago final",
};

export const WAGES_COPY: Record<Lang, WagesCopy> = { en, es };
