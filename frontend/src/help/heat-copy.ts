// Wording for "Heat at work today", written per language. Legal facts and
// their citations live in heat-facts.ts; shared strings (yes/no, sources,
// new tab…) come from HelpCopy.
import type { Lang } from "../i18n";
import type { WorkType } from "./heat";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface HeatCopy {
  lead: string;
  step1: string;
  city: string;
  chooseCity: string;
  cityHint: string;
  forecastToday: Fn<[number]>;
  forecastTomorrow: Fn<[number]>;
  forecastCaveat: string;
  forecastError: string;
  retry: string;
  attribution: string;
  heatWaveTitle: string;
  heatWave: Fn<[number, number]>;
  step2: string;
  temp: string;
  tempHint: string;
  tempInvalid: string;
  setting: string;
  outdoor: string;
  indoor: string;
  work: string;
  workHint: string;
  workTypes: Record<WorkType, string>;
  indoorSpecial: string;
  indoorSpecialHint: string;
  needMore: string;
  resultOutdoor: Fn<[number]>;
  resultIndoor: Fn<[number]>;
  resultIndoorBelow: Fn<[number]>;
  basisForecast: string;
  basisSite: string;
  tierAlways: string;
  tierOver80: string;
  tierHigh95: string;
  tierIndoor82: string;
  tierIndoor87: string;
  notListed: string;
  listedAre: string;
  next80: string;
  next95: string;
  next82: string;
  next87: string;
  indoorUnsure: string;
  triggersTitle: string;
  exceptionsTitle: string;
  payTitle: string;
  sickTitle: string;
  strokeTitle: string;
  ruleOfThumb: string;
  exhaustionTitle: string;
  crampsTitle: string;
  signs: string;
  whatToDo: string;
  call911: string;
  reportTitle: string;
  reportLead: string;
  reportEmergency: string;
  email: string;
  address: string;
  rightsTitle: string;
  retaliationReport: string;
}

const en: HeatCopy = {
  lead: "California has heat rules for work, outdoors and indoors. See what your employer must do at today’s temperature, and what to do if someone gets sick.",
  step1: "1. Today’s heat",
  city: "Your city",
  chooseCity: "Choose a city",
  cityHint: "We look up the forecast for the city center only. Your own location is never sent.",
  forecastToday: (n) => `Today’s forecast high: about ${n}°F`,
  forecastTomorrow: (n) => `(tomorrow ${n}°F)`,
  forecastCaveat:
    "The legal rules go by the temperature at your worksite, measured in full sun (8 CCR §3395(b)). The forecast is only a heads-up. It can be hotter where you work.",
  forecastError: "We couldn’t get the forecast right now. You can still type the temperature at your worksite below.",
  retry: "Try again",
  attribution: "Weather data by Open-Meteo.com",
  heatWaveTitle: "Heads-up: today may be a heat wave day",
  heatWave: (n, avg) =>
    `The forecast high (about ${n}°F) is at least 80°F and at least 10°F above the past 5 days’ average high (about ${avg}°F). On a heat wave day, all outdoor workers must be watched closely (8 CCR §3395(g)(1)).`,
  step2: "2. Your work",
  temp: "Temperature at your worksite (°F)",
  tempHint: "Optional. If you know it, we use it instead of the forecast.",
  tempInvalid: "Type a temperature in °F, like 96.",
  setting: "Where do you work?",
  outdoor: "Outdoors",
  indoor: "Indoors",
  work: "What kind of outdoor work?",
  workHint: "Some kinds of work have extra rules at 95°F.",
  workTypes: {
    agriculture: "Farm or field work",
    construction: "Construction",
    landscaping: "Landscaping",
    "oil-gas": "Oil and gas",
    "heavy-transport": "Moving farm products, building materials or other heavy things",
    "other-outdoor": "Other outdoor work",
  },
  indoorSpecial: "Do you wear clothing that traps heat, or work near strong heat sources (like ovens or furnaces)?",
  indoorSpecialHint: "For example, protective suits. Either one makes more rules start at 82°F.",
  needMore: "Choose a city or type the temperature at your worksite, then answer the questions above to see the rules.",
  resultOutdoor: (t) => `At ${t}°F outdoors, your employer must provide:`,
  resultIndoor: (t) => `At ${t}°F indoors, your employer must provide:`,
  resultIndoorBelow: (t) => `At ${t}°F indoors, the indoor heat rule doesn’t apply yet`,
  basisForecast: "Based on the forecast high. Check the real temperature at your worksite.",
  basisSite: "Based on the temperature you typed for your worksite.",
  tierAlways: "Every work day, at any temperature",
  tierOver80: "Because it’s above 80°F",
  tierHigh95: "Because it’s 95°F or more (high-heat rules)",
  tierIndoor82: "Indoors at 82°F or more",
  tierIndoor87: "More indoor rules (87°F or more, or 82°F with heat-trapping clothing or strong heat sources)",
  notListed: "Your kind of work isn’t on the list for the extra 95°F rules, so those aren’t required. Everything above still applies.",
  listedAre: "The extra 95°F rules cover: farm work, construction, landscaping, oil and gas, and moving farm products, building materials or other heavy things (except only driving an air-conditioned vehicle with no loading or unloading).",
  next80: "Above 80°F, shade must be set up the whole time.",
  next95: "At 95°F, extra high-heat rules start for your kind of work.",
  next82: "California’s indoor heat rule starts at 82°F. Below that, it doesn’t require these steps yet.",
  next87: "At 87°F (or a heat index of 87°F), more rules start.",
  indoorUnsure: "Not sure? Ask your employer. The full indoor rules start at 82°F if either one is true.",
  triggersTitle: "The full indoor rules start when any one of these is true:",
  exceptionsTitle: "Not covered by the indoor rule",
  payTitle: "Cool-down breaks are paid",
  sickTitle: "If someone gets sick from the heat",
  strokeTitle: "Heat stroke is an emergency. Call 911.",
  ruleOfThumb: "Confused, passed out, or having a seizure? Treat it as heat stroke: call 911 now, cool them down, and stay with them.",
  exhaustionTitle: "Heat exhaustion",
  crampsTitle: "Heat cramps",
  signs: "Signs",
  whatToDo: "What to do",
  call911: "Call 911",
  reportTitle: "How to report a heat problem",
  reportLead: "You can complain to Cal/OSHA by phone or by email. We didn’t find an online complaint form.",
  reportEmergency: "If someone is in danger right now, call 911 first.",
  email: "Email",
  address: "Address",
  rightsTitle: "Your rights",
  retaliationReport: "If you were punished for complaining or for using your heat rights:",
};

const es: HeatCopy = {
  lead: "California tiene reglas contra el calor en el trabajo, al aire libre y en interiores. Vea lo que su empleador debe hacer con la temperatura de hoy, y qué hacer si alguien se enferma.",
  step1: "1. El calor de hoy",
  city: "Su ciudad",
  chooseCity: "Elija una ciudad",
  cityHint: "Solo buscamos el pronóstico para el centro de la ciudad. Nunca se envía su ubicación.",
  forecastToday: (n) => `Máxima pronosticada para hoy: unos ${n}°F`,
  forecastTomorrow: (n) => `(mañana ${n}°F)`,
  forecastCaveat:
    "Las reglas legales dependen de la temperatura en su lugar de trabajo, medida a pleno sol (8 CCR §3395(b)). El pronóstico es solo un aviso. Donde usted trabaja puede hacer más calor.",
  forecastError: "No pudimos obtener el pronóstico ahora. Igual puede escribir abajo la temperatura en su lugar de trabajo.",
  retry: "Intentar de nuevo",
  attribution: "Datos del tiempo de Open-Meteo.com",
  heatWaveTitle: "Aviso: hoy puede ser un día de ola de calor",
  heatWave: (n, avg) =>
    `La máxima pronosticada (unos ${n}°F) es de al menos 80°F y al menos 10°F más alta que el promedio de las máximas de los 5 días anteriores (unos ${avg}°F). En un día de ola de calor, se debe vigilar de cerca a todos los trabajadores al aire libre (8 CCR §3395(g)(1)).`,
  step2: "2. Su trabajo",
  temp: "Temperatura en su lugar de trabajo (°F)",
  tempHint: "Opcional. Si la sabe, la usamos en lugar del pronóstico.",
  tempInvalid: "Escriba una temperatura en °F, por ejemplo 96.",
  setting: "¿Dónde trabaja?",
  outdoor: "Al aire libre",
  indoor: "En interiores",
  work: "¿Qué tipo de trabajo al aire libre?",
  workHint: "Algunos tipos de trabajo tienen reglas adicionales a 95°F.",
  workTypes: {
    agriculture: "Agricultura o trabajo en el campo",
    construction: "Construcción",
    landscaping: "Jardinería",
    "oil-gas": "Petróleo y gas",
    "heavy-transport": "Transporte de productos agrícolas, materiales de construcción u otras cosas pesadas",
    "other-outdoor": "Otro trabajo al aire libre",
  },
  indoorSpecial: "¿Usa ropa que atrapa el calor, o trabaja cerca de fuentes de calor fuerte (como hornos)?",
  indoorSpecialHint: "Por ejemplo, trajes de protección. Cualquiera de las dos hace que más reglas empiecen a 82°F.",
  needMore: "Elija una ciudad o escriba la temperatura en su lugar de trabajo, y conteste las preguntas de arriba para ver las reglas.",
  resultOutdoor: (t) => `A ${t}°F al aire libre, su empleador debe darle:`,
  resultIndoor: (t) => `A ${t}°F en interiores, su empleador debe darle:`,
  resultIndoorBelow: (t) => `A ${t}°F en interiores, todavía no aplica la regla de calor en interiores`,
  basisForecast: "Según la máxima pronosticada. Revise la temperatura real en su lugar de trabajo.",
  basisSite: "Según la temperatura que usted escribió para su lugar de trabajo.",
  tierAlways: "Todos los días de trabajo, con cualquier temperatura",
  tierOver80: "Porque hace más de 80°F",
  tierHigh95: "Porque hace 95°F o más (reglas para calor extremo)",
  tierIndoor82: "En interiores, a 82°F o más",
  tierIndoor87: "Más reglas en interiores (87°F o más, o 82°F con ropa que atrapa el calor o fuentes de calor fuerte)",
  notListed: "Su tipo de trabajo no está en la lista de las reglas adicionales de 95°F, así que esas no son obligatorias. Todo lo de arriba sigue aplicando.",
  listedAre: "Las reglas adicionales de 95°F cubren: agricultura, construcción, jardinería, extracción de petróleo y gas, y transporte de productos agrícolas, materiales de construcción u otros materiales pesados (excepto solo manejar un vehículo con aire acondicionado sin cargar ni descargar).",
  next80: "A más de 80°F, la sombra debe estar instalada todo el tiempo.",
  next95: "A 95°F empiezan reglas adicionales para calor extremo en su tipo de trabajo.",
  next82: "La regla de calor en interiores de California empieza a 82°F. Por debajo de eso, todavía no exige estos pasos.",
  next87: "A 87°F (o con un índice de calor de 87°F), empiezan más reglas.",
  indoorUnsure: "¿No está seguro? Pregúntele a su empleador. Todas las reglas para interiores empiezan a 82°F si cualquiera de las dos es cierta.",
  triggersTitle: "Todas las reglas para interiores aplican cuando cualquiera de estas es cierta:",
  exceptionsTitle: "Lo que no cubre la regla para interiores",
  payTitle: "Los descansos para refrescarse son pagados",
  sickTitle: "Si alguien se enferma por el calor",
  strokeTitle: "El golpe de calor es una emergencia. Llame al 911.",
  ruleOfThumb: "¿Está confundido, se desmayó o tiene convulsiones? Trátelo como golpe de calor: llame al 911 ya, refrésquelo y quédese con él.",
  exhaustionTitle: "Agotamiento por calor",
  crampsTitle: "Calambres por calor",
  signs: "Señales",
  whatToDo: "Qué hacer",
  call911: "Llame al 911",
  reportTitle: "Cómo reportar un problema de calor",
  reportLead: "Puede quejarse ante Cal/OSHA por teléfono o por correo electrónico. No encontramos un formulario de quejas en línea.",
  reportEmergency: "Si alguien está en peligro ahora mismo, llame primero al 911.",
  email: "Correo electrónico",
  address: "Dirección",
  rightsTitle: "Sus derechos",
  retaliationReport: "Si le castigaron por quejarse o por usar sus derechos contra el calor:",
};

export const HEAT_COPY: Record<Lang, HeatCopy> = { en, es };
