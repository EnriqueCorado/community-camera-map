// Benefits screener wording, written per language (not stitched together).
// Shared strings (yes/no/not sure, per month/year, sources...) come from
// HelpCopy. Program names, what each gives, and immigration notes live with
// their sources in benefits-facts.ts.
import type { Lang } from "../i18n";
import type { Per } from "./benefits-facts";
import type { Cmp, Electric, Enrolled, IncomeCheck, Reason, TaxId, Verdict, Youngest } from "./benefits";

type Fn<A extends unknown[]> = (...args: A) => string;
/** Formats integer cents as dollars in the page's locale. */
export type Money = (cents: number) => string;

export interface BenefitsCopy {
  lead: string;
  privateNote: string;
  immigrationTitle: string;
  immigrationIntro: string;
  publicChargeTitle: string;
  formTitle: string;
  size: string;
  sizeHint: string;
  income: string;
  incomeHint: string;
  per: string;
  children: string;
  childrenHint: string;
  choose: string;
  youngest: string;
  youngestOpts: Record<Youngest, string>;
  pregnant: string;
  olderOrDisabled: string;
  gets: string;
  getsHint: string;
  enrolled: Record<Enrolled, string>;
  electric: string;
  electricHint: string;
  electricOpts: Record<Electric, string>;
  pgeGas: string;
  taxId: string;
  taxIdHint: string;
  taxIdOpts: Record<TaxId, string>;
  resultsTitle: string;
  fillFirst: string;
  summary: Fn<[number, number, number]>;
  pending: Fn<[number]>;
  verdictTitle: Record<Verdict, string>;
  verdictIntro: Record<Verdict, string>;
  why: string;
  upTo: Fn<[string, Per | "return", number]>;
  limitsFor: Fn<[string]>;
  limitSource: string;
  apply: string;
  immigration: string;
  more: string;
  changeNote: string;
  tipsTitle: string;
  freeLegal: string;
  reason: (r: Reason, money: Money) => string;
}

const list = (items: string[], and: string) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;

// ---------------------------------------------------------------- English

const perEn = (p: Per) => (p === "month" ? "a month" : "a year");
const peopleEn = (n: number) => (n === 1 ? "1 person" : `${n} people`);
const cmpEn: Record<Cmp, string> = { below: "is under", at: "is exactly at", over: "is over" };

function checkEn(c: IncomeCheck, m: Money): string {
  const income =
    c.typed.per === c.per ? `${m(c.typed.cents)} ${perEn(c.per)}` : `${m(c.typed.cents)} ${perEn(c.typed.per)}, or ${m(c.income)} ${perEn(c.per)}`;
  const limit =
    c.published.per === c.per
      ? `${m(c.limit)} ${perEn(c.per)}`
      : `${m(c.published.cents)} ${perEn(c.published.per)} (${m(c.limit)} ${perEn(c.per)})`;
  const at = c.cmp === "at" ? " Being exactly at the limit still counts." : "";
  return `Your income (${income}) ${cmpEn[c.cmp]} the limit of ${limit} for ${peopleEn(c.size)}.${at}`;
}

const ENROLLED_EN: Record<Enrolled, string> = { "medi-cal": "Medi-Cal", calfresh: "CalFresh", wic: "WIC", calworks: "CalWORKs", ssi: "SSI" };
const COMPANY = { mid: "MID", tid: "TID", pge: "PG&E" } as const;

const en: BenefitsCopy = {
  lead: "Answer a few questions to see which programs your household may qualify for. It takes about 2 minutes. This is an estimate: each program makes the final decision.",
  privateNote: "We never ask about immigration status. Nothing you type is saved or sent anywhere.",
  immigrationTitle: "Immigration and benefits",
  immigrationIntro: "Each result has an immigration note. Many programs help U.S.-citizen children even when a parent doesn’t qualify. Rules changed in 2026 and are still changing.",
  publicChargeTitle: "Public charge (green card applications)",
  formTitle: "Your household",
  size: "People in your household",
  sizeHint: "Count everyone who lives with you and shares food or money. Programs count people a little differently.",
  income: "Household income before taxes",
  incomeHint: "Add up pay and other money everyone in the home gets.",
  per: "Is that per month or per year?",
  children: "Children under 19 who live with you",
  childrenHint: "Used for children’s Medi-Cal, WIC and tax credits.",
  choose: "Choose…",
  youngest: "How old is the youngest child?",
  youngestOpts: { under5: "Under 5", five: "5 years old", "6to18": "6 to 18" },
  pregnant: "Is anyone in your home pregnant?",
  olderOrDisabled: "Is anyone in your home 60 or older, or living with a disability?",
  gets: "Does anyone in your home already get any of these?",
  getsHint: "Being on one program can qualify you for others. Leave blank if none.",
  enrolled: ENROLLED_EN,
  electric: "Who sends your electric bill?",
  electricHint: "Look at the top of your bill.",
  electricOpts: { mid: "MID (Modesto Irrigation District)", tid: "TID (Turlock Irrigation District)", pge: "PG&E", unsure: "Not sure, or I don’t get one" },
  pgeGas: "Do you get a gas bill from PG&E?",
  taxId: "When you file taxes, what number do you use?",
  taxIdHint: "Only used to show which tax credits fit.",
  taxIdOpts: { ssn: "Social Security number (SSN)", itin: "ITIN", none: "Neither yet", unsure: "Not sure" },
  resultsTitle: "Your results",
  fillFirst: "Enter your household size and income to see results.",
  summary: (l, m, u) => `${l} likely, ${m} maybe, ${u} probably not.`,
  pending: (n) => `Answer the rest of the questions to check ${n} more ${n === 1 ? "program" : "programs"}.`,
  verdictTitle: { likely: "Likely", maybe: "Maybe: worth asking", unlikely: "Probably not" },
  verdictIntro: {
    likely: "Based on your answers, you likely qualify. Apply: only the program can say yes.",
    maybe: "You might qualify. It depends on something we can’t check here.",
    unlikely: "Based on your answers, probably not right now. If things change, check again.",
  },
  why: "Why",
  upTo: (amount, per, size) =>
    per === "return" ? `Up to ${amount} (tax year 2025).` : `Up to ${amount} ${perEn(per)} for ${peopleEn(size)}.`,
  limitsFor: (period) => `Limits used: ${period.replace(/\.$/, "")}.`,
  limitSource: "Source",
  apply: "How to apply",
  immigration: "Immigration note",
  more: "More about this program",
  changeNote: "These figures change every year. Each card shows the dates its limits are for. Confirm with the program before you decide.",
  tipsTitle: "Also good to know",
  freeLegal: "Find a free immigration legal provider",
  reason: (r, m) => {
    switch (r.kind) {
      case "income":
        return checkEn(r.check, m);
      case "between":
        return `Your income is over the CARE limit (${m(r.low.limit)} ${perEn(r.low.per)}) but not over the FERA limit of ${m(r.high.limit)} ${perEn(r.high.per)} for ${peopleEn(r.high.size)}.`;
      case "gets":
        return `Someone in your home gets ${list(r.programs.map((p) => ENROLLED_EN[p]), "or")}, so you meet the income test${r.confirm ? " (confirm with the program)" : ""}.`;
      case "already":
        return "You said someone already gets this. Renew on time so it doesn’t stop.";
      case "olderOrDisabled":
        return "Your income is over the usual limit, but homes with someone 60+ or with a disability can qualify under other rules. Ask.";
      case "statusDepends":
        return "It also depends on immigration status: read the immigration note.";
      case "wicNoOne":
        return "WIC is only for homes with someone pregnant, a new mom, or a child under 5.";
      case "wicViaMediCal":
        return "Your income is over WIC’s limit, but your children or your pregnancy may qualify for Medi-Cal, and people on Medi-Cal meet WIC’s income test (confirm with WIC).";
      case "mcap":
        return `The Medi-Cal Access Program (MCAP) goes higher. ${checkEn(r.check, m)}`;
      case "utilityUnsure":
        return `Only if ${COMPANY[r.company]} serves your home. Check your bill.`;
      case "pgeGasUnsure":
        return "Only if PG&E sends you a gas bill. Check your bill.";
      case "oldTable":
        return "These limits are from last year; the new ones were not posted when we checked. Ask the program.";
      case "taxNeedsId":
        return "You need a Social Security number or an ITIN to claim it.";
      case "taxIdUnsure":
        return "Check which number you file with: this credit takes a Social Security number or an ITIN.";
      case "eitcSsnUnsure":
        return "Check which number you file with: the federal EITC needs a Social Security number.";
      case "eitcNeedsSsn":
        return "The federal EITC needs a Social Security number. With an ITIN you can still get CalEITC and YCTC.";
      case "oldTax":
        return "These are last tax year’s figures. Ask a free tax site for this year’s.";
      case "mediCalOlder":
        return "Your income is over the limit for adults, but people 65+ or with a disability can qualify through other Medi-Cal programs (those have an asset limit). Ask the county.";
      case "unbornCounts":
        return `WIC may count the unborn baby in your household (ask WIC). ${checkEn(r.check, m)}`;
      case "earnedZero":
        return "It needs some income from work.";
      case "earnedAssumption":
        return "We used your household income. The credit counts the tax filer’s pay from work for the year.";
      case "taxIncome": {
        const kids = r.children === 3 ? "3 or more children" : r.children === 1 ? "1 child" : `${r.children} children`;
        const status = r.filing === "joint" ? "married filing together" : "single or head of household";
        const who = r.children != null ? ` (${status}, ${kids})` : "";
        const at = r.cmp !== "at" ? "" : r.strict ? " It must be under the limit." : " Being exactly at the limit still counts.";
        return `Income for the year (${m(r.income)}) ${cmpEn[r.cmp]} the ${m(r.limit)} limit${who}.${at}`;
      }
      case "eitcJoint":
        return `If you are married and file together, the limit is ${m(r.limit)}. Ask a free tax site.`;
      case "yctcWages":
        return `The FTB allows wages up to ${m(r.limit)} for YCTC. Ask a free tax site.`;
      case "yctcNoEarned":
        return "You don’t need income from work to get YCTC.";
      case "noYoungChild":
        return "YCTC needs a child under 6.";
      case "childFive":
        return "The child must be under 6 on December 31 of the tax year.";
      case "mediCalInstead":
        return "At your income, adults usually get Medi-Cal instead, which costs less.";
    }
  },
};

// ---------------------------------------------------------------- Spanish

const perEs = (p: Per) => (p === "month" ? "al mes" : "al año");
const peopleEs = (n: number) => (n === 1 ? "1 persona" : `${n} personas`);
const cmpEs: Record<Cmp, string> = { below: "están por debajo del", at: "están justo en el", over: "están por encima del" };

function checkEs(c: IncomeCheck, m: Money): string {
  const income =
    c.typed.per === c.per ? `${m(c.typed.cents)} ${perEs(c.per)}` : `${m(c.typed.cents)} ${perEs(c.typed.per)}, o ${m(c.income)} ${perEs(c.per)}`;
  const limit =
    c.published.per === c.per
      ? `${m(c.limit)} ${perEs(c.per)}`
      : `${m(c.published.cents)} ${perEs(c.published.per)} (${m(c.limit)} ${perEs(c.per)})`;
  const at = c.cmp === "at" ? " Estar justo en el límite sí cuenta." : "";
  return `Sus ingresos (${income}) ${cmpEs[c.cmp]} límite de ${limit} para ${peopleEs(c.size)}.${at}`;
}

const ENROLLED_ES: Record<Enrolled, string> = { "medi-cal": "Medi-Cal", calfresh: "CalFresh", wic: "WIC", calworks: "CalWORKs", ssi: "SSI" };

const es: BenefitsCopy = {
  lead: "Conteste unas preguntas para ver para qué programas podría calificar su hogar. Toma unos 2 minutos. Es un cálculo aproximado: cada programa toma la decisión final.",
  privateNote: "Nunca preguntamos por su estatus migratorio. Nada de lo que escriba se guarda ni se envía.",
  immigrationTitle: "Inmigración y beneficios",
  immigrationIntro: "Cada resultado tiene una nota sobre inmigración. Muchos programas ayudan a los hijos ciudadanos aunque el padre o la madre no califique. Las reglas cambiaron en 2026 y siguen cambiando.",
  publicChargeTitle: "Carga pública (solicitudes de green card)",
  formTitle: "Su hogar",
  size: "Personas en su hogar",
  sizeHint: "Cuente a todos los que viven con usted y comparten comida o dinero. Cada programa cuenta a las personas de forma un poco distinta.",
  income: "Ingresos del hogar antes de impuestos",
  incomeHint: "Sume el sueldo y otro dinero que recibe cada persona de la casa.",
  per: "¿Es al mes o al año?",
  children: "Menores de 19 años que viven con usted",
  childrenHint: "Se usa para Medi-Cal de niños, WIC y créditos de impuestos.",
  choose: "Elija…",
  youngest: "¿Qué edad tiene el niño más pequeño?",
  youngestOpts: { under5: "Menos de 5 años", five: "5 años", "6to18": "De 6 a 18 años" },
  pregnant: "¿Hay alguien embarazada en su hogar?",
  olderOrDisabled: "¿Hay alguien en su hogar de 60 años o más, o con una discapacidad?",
  gets: "¿Alguien en su hogar ya recibe alguno de estos?",
  getsHint: "Recibir un programa puede hacerle calificar para otros. Déjelo en blanco si no recibe ninguno.",
  enrolled: ENROLLED_ES,
  electric: "¿Quién le manda la factura de la luz?",
  electricHint: "Fíjese en la parte de arriba de su factura.",
  electricOpts: { mid: "MID (Distrito de Riego de Modesto)", tid: "TID (Distrito de Riego de Turlock)", pge: "PG&E", unsure: "No sé, o no recibo factura" },
  pgeGas: "¿Recibe una factura de gas de PG&E?",
  taxId: "Cuando declara impuestos, ¿qué número usa?",
  taxIdHint: "Solo se usa para mostrar qué créditos de impuestos le corresponden.",
  taxIdOpts: { ssn: "Número de Seguro Social (SSN)", itin: "ITIN", none: "Ninguno todavía", unsure: "No sé" },
  resultsTitle: "Sus resultados",
  fillFirst: "Escriba el tamaño de su hogar y sus ingresos para ver los resultados.",
  summary: (l, m, u) => `${l} probable${l === 1 ? "" : "s"}, ${m} quizás, ${u} probablemente no.`,
  pending: (n) => `Conteste las demás preguntas para revisar ${n} ${n === 1 ? "programa más" : "programas más"}.`,
  verdictTitle: { likely: "Probable", maybe: "Quizás: vale la pena preguntar", unlikely: "Probablemente no" },
  verdictIntro: {
    likely: "Según sus respuestas, es probable que califique. Solicítelo: solo el programa puede decir que sí.",
    maybe: "Podría calificar. Depende de algo que no podemos revisar aquí.",
    unlikely: "Según sus respuestas, probablemente no por ahora. Si algo cambia, vuelva a revisar.",
  },
  why: "Por qué",
  upTo: (amount, per, size) =>
    per === "return" ? `Hasta ${amount} (año fiscal 2025).` : `Hasta ${amount} ${perEs(per)} para ${peopleEs(size)}.`,
  limitsFor: (period) => `Límites usados: ${period.replace(/\.$/, "")}.`,
  limitSource: "Fuente",
  apply: "Cómo solicitar",
  immigration: "Nota sobre inmigración",
  more: "Más sobre este programa",
  changeNote: "Estas cifras cambian cada año. Cada tarjeta muestra las fechas de sus límites. Confirme con el programa antes de decidir.",
  tipsTitle: "También es bueno saber",
  freeLegal: "Busque un proveedor legal gratuito de inmigración",
  reason: (r, m) => {
    switch (r.kind) {
      case "income":
        return checkEs(r.check, m);
      case "between":
        return `Sus ingresos están por encima del límite de CARE (${m(r.low.limit)} ${perEs(r.low.per)}) pero no del límite de FERA de ${m(r.high.limit)} ${perEs(r.high.per)} para ${peopleEs(r.high.size)}.`;
      case "gets":
        return `Alguien en su hogar recibe ${list(r.programs.map((p) => ENROLLED_ES[p]), "o")}, así que cumple con el requisito de ingresos${r.confirm ? " (confírmelo con el programa)" : ""}.`;
      case "already":
        return "Dijo que alguien ya lo recibe. Renueve a tiempo para que no se corte.";
      case "olderOrDisabled":
        return "Sus ingresos están por encima del límite normal, pero los hogares con alguien de 60 años o más o con una discapacidad pueden calificar con otras reglas. Pregunte.";
      case "statusDepends":
        return "También depende del estatus migratorio: lea la nota sobre inmigración.";
      case "wicNoOne":
        return "WIC es solo para hogares con alguien embarazada, una mamá reciente o un niño menor de 5 años.";
      case "wicViaMediCal":
        return "Sus ingresos están por encima del límite de WIC, pero sus hijos o su embarazo podrían calificar para Medi-Cal, y quienes tienen Medi-Cal cumplen con el requisito de ingresos de WIC (confírmelo con WIC).";
      case "mcap":
        return `El Programa de Acceso a Medi-Cal (MCAP) llega más alto. ${checkEs(r.check, m)}`;
      case "utilityUnsure":
        return `Solo si ${COMPANY[r.company]} da servicio a su casa. Revise su factura.`;
      case "pgeGasUnsure":
        return "Solo si PG&E le manda una factura de gas. Revise su factura.";
      case "oldTable":
        return "Estos límites son del año pasado; los nuevos no estaban publicados cuando revisamos. Pregunte al programa.";
      case "taxNeedsId":
        return "Necesita un número de Seguro Social o un ITIN para reclamarlo.";
      case "taxIdUnsure":
        return "Revise qué número usa al declarar: este crédito acepta número de Seguro Social o ITIN.";
      case "eitcSsnUnsure":
        return "Revise qué número usa al declarar: el EITC federal necesita un número de Seguro Social.";
      case "eitcNeedsSsn":
        return "El EITC federal necesita un número de Seguro Social. Con ITIN sí puede recibir CalEITC y YCTC.";
      case "oldTax":
        return "Estas cifras son del año fiscal pasado. Pregunte en un sitio gratis de impuestos por las de este año.";
      case "mediCalOlder":
        return "Sus ingresos están por encima del límite para adultos, pero las personas de 65 años o más o con una discapacidad pueden calificar por otros programas de Medi-Cal (tienen un límite de bienes). Pregunte al condado.";
      case "unbornCounts":
        return `WIC puede contar al bebé por nacer en su hogar (pregunte a WIC). ${checkEs(r.check, m)}`;
      case "earnedZero":
        return "Se necesita algo de ingreso por trabajo.";
      case "earnedAssumption":
        return "Usamos los ingresos de su hogar. El crédito cuenta el pago por trabajo de quien declara, en todo el año.";
      case "taxIncome": {
        const kids = r.children === 3 ? "3 hijos o más" : r.children === 1 ? "1 hijo" : `${r.children} hijos`;
        const status = r.filing === "joint" ? "casados que declaran juntos" : "soltero o cabeza de familia";
        const who = r.children != null ? ` (${status}, ${kids})` : "";
        const at = r.cmp !== "at" ? "" : r.strict ? " Debe estar por debajo del límite." : " Estar justo en el límite sí cuenta.";
        return `Los ingresos del año (${m(r.income)}) ${cmpEs[r.cmp]} límite de ${m(r.limit)}${who}.${at}`;
      }
      case "eitcJoint":
        return `Si está casado y declaran juntos, el límite es ${m(r.limit)}. Pregunte en un sitio gratis de impuestos.`;
      case "yctcWages":
        return `La FTB permite sueldos de hasta ${m(r.limit)} para el YCTC. Pregunte en un sitio gratis de impuestos.`;
      case "yctcNoEarned":
        return "No necesita ingresos por trabajo para recibir el YCTC.";
      case "noYoungChild":
        return "El YCTC necesita un hijo menor de 6 años.";
      case "childFive":
        return "El niño debe tener menos de 6 años el 31 de diciembre del año fiscal.";
      case "mediCalInstead":
        return "Con sus ingresos, los adultos normalmente reciben Medi-Cal, que cuesta menos.";
    }
  },
};

export const BENEFITS_COPY: Record<Lang, BenefitsCopy> = { en, es };
