// Demand letter for unpaid wages (pure: values in -> text out; unit-tested).
// Modeled on Legal Aid at Work's sample final-wages letter: facts and
// amounts, the Labor Code sections, a clear "please pay by" date, and the
// plain next step (a wage claim with the Labor Commissioner). It never
// threatens, and never mentions immigration status.
import type { Lang } from "../i18n";
import { longDate } from "./dates";
import { formatMoney, parseMoney } from "./money";
import { val, type LetterDef, type LetterField, type LetterValues } from "./letter-types";
import type { Ending } from "./wages";

const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-US" };

/** What the calculator found, in whole cents (already rounded down). */
export interface WageSummary {
  unpaidCents: number;
  /** Citation for the overtime rule used, e.g. "Lab. Code §510(a)". */
  wageCite: string;
  /** The rate was below the minimum wage. */
  minWageShort: boolean;
  /** Any overtime or double-time hours were counted. */
  overtime: boolean;
  mealDays: number;
  mealCents: number;
  restDays: number;
  restCents: number;
  penaltyDays: number;
  penaltyCents: number;
  totalCents: number;
  ending: Ending | null;
  /** ISO date of the last day worked, if the job ended. */
  lastDay: string | null;
}

/** "Lab. Code §510(a)" in the letter's language. */
export function citeIn(cite: string, lang: Lang): string {
  return lang === "es"
    ? cite.replace(/Lab\. Code/g, "Código Laboral").replace(/IWC Wage Orders?/g, "Orden Salarial de la IWC")
    : cite.replace(/Lab\. Code/g, "Labor Code");
}

const join = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("\n\n");

const YOU: LetterField = { id: "you", kind: "text", label: { en: "Your full name", es: "Su nombre completo" }, autoComplete: "name" };
const ADDR: LetterField = {
  id: "addr",
  kind: "multiline",
  label: { en: "Your mailing address", es: "Su dirección postal" },
  hint: { en: "Where the check should be mailed.", es: "Adonde deben mandar el cheque." },
  autoComplete: "street-address",
};
const CONTACT: LetterField = { id: "contact", kind: "text", label: { en: "Phone or email to reach you", es: "Teléfono o correo para contactarle" } };
const EMPLOYER: LetterField = {
  id: "employer",
  kind: "text",
  label: { en: "Employer’s legal name", es: "Nombre legal del empleador" },
  hint: { en: "As it appears on your pay stub or check.", es: "Como aparece en su talón de pago o cheque." },
};
const EMPLOYER_ADDR: LetterField = { id: "employerAddr", kind: "multiline", label: { en: "Employer’s address", es: "Dirección del empleador" } };
const JOB: LetterField = { id: "job", kind: "text", label: { en: "Your job", es: "Su trabajo" }, hint: { en: "Example: “a field worker”, “a cook”.", es: "Ejemplo: “trabajador del campo”, “cocinero”." } };
const DATES: LetterField = {
  id: "dates",
  kind: "text",
  label: { en: "Dates you worked there", es: "Fechas en que trabajó ahí" },
  hint: { en: "Example: “from March 3 to September 26, 2026”.", es: "Ejemplo: “del 3 de marzo al 26 de septiembre de 2026”." },
};
const PAY_BY: LetterField = {
  id: "payBy",
  kind: "date",
  label: { en: "Ask to be paid by", es: "Pida que le paguen a más tardar el" },
  hint: { en: "Give about 10 days.", es: "Dé unos 10 días." },
};
const OWED: LetterField = {
  id: "owed",
  kind: "money",
  label: { en: "Amount you are owed", es: "Cantidad que le deben" },
  hint: { en: "Use the calculator above, or type the amount.", es: "Use la calculadora de arriba, o escriba la cantidad." },
};
const RECORDS: LetterField = {
  id: "records",
  kind: "checks",
  label: { en: "Also ask for (optional)", es: "Pedir también (opcional)" },
  options: [
    { id: "payroll", label: { en: "Copies of my payroll records", es: "Copias de mis registros de pago" } },
    { id: "personnel", label: { en: "A copy of my personnel file", es: "Una copia de mi expediente de personal" } },
  ],
};
const asked = (v: LetterValues, opt: string) => Array.isArray(v.records) && v.records.includes(opt);

/** Fields the letter asks for. The amount field only appears when the
 *  calculator has no total to fill in. */
export function wageLetterFields(s: WageSummary | null): LetterField[] {
  const hasTotal = !!s && s.totalCents > 0;
  return [YOU, ADDR, CONTACT, EMPLOYER, EMPLOYER_ADDR, JOB, DATES, ...(hasTotal ? [] : [OWED]), PAY_BY, RECORDS];
}

const ENDING: Record<Lang, Record<Ending, (d: string) => string>> = {
  en: {
    fired: (d) => `My job ended on ${d}, when I was let go. Under Labor Code section 201, my final pay was due that day.`,
    quitNotice: (d) => `I quit on ${d}, after giving at least 72 hours’ notice. Under Labor Code section 202, my final pay was due on my last day.`,
    quitNoNotice: (d) => `I quit on ${d}. Under Labor Code section 202, my final pay was due within 72 hours.`,
    seasonal: (d) => `I was laid off with other workers on ${d}, at the end of the season. Under Labor Code section 201, my final pay was due within 72 hours.`,
  },
  es: {
    fired: (d) => `Mi trabajo terminó el ${d}, cuando me despidieron. Según el Código Laboral, sección 201, mi pago final se debía ese mismo día.`,
    quitNotice: (d) => `Renuncié el ${d}, después de avisar con por lo menos 72 horas. Según el Código Laboral, sección 202, mi pago final se debía en mi último día.`,
    quitNoNotice: (d) => `Renuncié el ${d}. Según el Código Laboral, sección 202, mi pago final se debía dentro de 72 horas.`,
    seasonal: (d) => `Me despidieron junto con otros trabajadores el ${d}, al terminar la temporada. Según el Código Laboral, sección 201, mi pago final se debía dentro de 72 horas.`,
  },
};

/** The itemized list of what is owed, one line per amount above zero. */
export function owedLines(s: WageSummary, lang: Lang): string[] {
  const m = (c: number) => formatMoney(c / 100, LOCALE[lang]);
  const es = lang === "es";
  const wageCite = citeIn(s.minWageShort ? `${s.wageCite}; Lab. Code §1182.12` : s.wageCite, lang);
  const lines: (string | false)[] = [
    s.unpaidCents > 0 &&
      (es
        ? `- Salarios no pagados por las horas que trabajé${s.minWageShort ? ", incluso el salario mínimo" : ""}${s.overtime ? " y las horas extra" : ""} (${wageCite}): ${m(s.unpaidCents)}`
        : `- Unpaid wages for the hours I worked${s.minWageShort ? ", including minimum wage" : ""}${s.overtime ? " and overtime" : ""} (${wageCite}): ${m(s.unpaidCents)}`),
    s.mealCents > 0 &&
      (es
        ? `- Pago por ${s.mealDays} día(s) de trabajo sin el periodo de comida requerido (Código Laboral §226.7): ${m(s.mealCents)}`
        : `- Premium pay for ${s.mealDays} workday(s) without a required meal period (Labor Code §226.7): ${m(s.mealCents)}`),
    s.restCents > 0 &&
      (es
        ? `- Pago por ${s.restDays} día(s) de trabajo sin el descanso requerido (Código Laboral §226.7): ${m(s.restCents)}`
        : `- Premium pay for ${s.restDays} workday(s) without a required rest period (Labor Code §226.7): ${m(s.restCents)}`),
    s.penaltyCents > 0 &&
      (es
        ? `- Penalidad por pago final atrasado, ${s.penaltyDays} día(s) de salario (Código Laboral §203): ${m(s.penaltyCents)}`
        : `- Waiting-time penalty for late final pay, ${s.penaltyDays} day(s) of wages (Labor Code §203): ${m(s.penaltyCents)}`),
  ];
  return lines.filter((x): x is string => !!x);
}

/** Build the letter definition for the current calculator result. */
export function wageLetter(s: WageSummary | null): LetterDef {
  const fields = wageLetterFields(s);
  const f = (id: string) => fields.find((x) => x.id === id);
  return {
    id: "wages",
    title: { en: "Letter asking for your unpaid wages", es: "Carta para pedir sus salarios no pagados" },
    blurb: {
      en: "Lists what you are owed and the Labor Code sections, and asks to be paid by a date. The amounts come from the calculator above. Send it to your employer and keep proof that you did.",
      es: "Enumera lo que le deben y las secciones del Código Laboral, y pide el pago para una fecha. Las cantidades vienen de la calculadora de arriba. Mándela a su empleador y guarde prueba de que la envió.",
    },
    fields,
    filename: "unpaid-wages-letter",
    render(v: LetterValues, lang: Lang, today: string) {
      const es = lang === "es";
      const loc = LOCALE[lang];
      const hasTotal = !!s && s.totalCents > 0;
      const typed = parseMoney(String(v.owed ?? ""));
      const total = hasTotal ? formatMoney(s!.totalCents / 100, loc) : typed != null && typed > 0 ? formatMoney(typed, loc) : `[${OWED.label[lang]}]`;
      const payByRaw = String(v.payBy ?? "");
      const payBy = payByRaw ? longDate(payByRaw, loc) : val(v, PAY_BY, lang);
      const ending = s?.ending && s.lastDay ? ENDING[lang][s.ending](longDate(s.lastDay, loc)) : "";
      const wantPayroll = asked(v, "payroll");
      const wantFile = asked(v, "personnel");
      const lines = hasTotal ? owedLines(s!, lang) : [];
      const list = lines.length
        ? es
          ? `Según mis registros, usted me debe lo siguiente:\n${lines.join("\n")}\nTotal: ${total}`
          : `By my records, you owe me the following:\n${lines.join("\n")}\nTotal: ${total}`
        : es
          ? `Según mis registros, usted me debe ${total} en salarios no pagados.`
          : `By my records, you owe me ${total} in unpaid wages.`;
      const recordsText =
        wantPayroll || wantFile
          ? es
            ? `También le pido ${[
                wantPayroll && "copias de mis registros de pago, que el Código Laboral, sección 226, exige entregar dentro de 21 días",
                wantFile && "una copia de mi expediente de personal, que la sección 1198.5 exige entregar dentro de 30 días",
              ]
                .filter(Boolean)
                .join(", y ")}.`
            : `Please also send me ${[
                wantPayroll && "copies of my payroll records, which Labor Code section 226 requires within 21 days",
                wantFile && "a copy of my personnel file, which section 1198.5 requires within 30 days",
              ]
                .filter(Boolean)
                .join(", and ")}.`
          : "";
      if (es)
        return join([
          longDate(today, loc),
          `${val(v, f("employer"), lang)}\n${val(v, f("employerAddr"), lang)}`,
          "Asunto: Solicitud de pago de salarios no pagados",
          `Estimado/a ${val(v, f("employer"), lang)}:`,
          `Trabajé para usted como ${val(v, f("job"), lang)} ${val(v, f("dates"), lang)}. ${ending}`.trim(),
          list,
          "Adjunto una lista de los días y las horas que trabajé y copias de mis talones de pago o registros.",
          `Le pido que me pague ${total} a más tardar el ${payBy}, con un cheque enviado a la dirección de abajo o listo para que yo lo recoja.`,
          recordsText,
          "Si no recibo el pago para esa fecha, mi siguiente paso será presentar un reclamo de salarios ante la Comisión Laboral de California.",
          `Puede comunicarse conmigo al ${val(v, f("contact"), lang)}. Guardo una copia de esta carta.`,
          `Atentamente,\n\n\n${val(v, f("you"), lang)}\n${val(v, f("addr"), lang)}`,
        ]);
      return join([
        longDate(today, loc),
        `${val(v, f("employer"), lang)}\n${val(v, f("employerAddr"), lang)}`,
        "Re: Request for payment of unpaid wages",
        `Dear ${val(v, f("employer"), lang)}:`,
        `I worked for you as ${val(v, f("job"), lang)} ${val(v, f("dates"), lang)}. ${ending}`.trim(),
        list,
        "I am attaching a list of the days and hours I worked and copies of my pay stubs or records.",
        `Please pay me ${total} by ${payBy}, by check mailed to the address below or ready for me to pick up.`,
        recordsText,
        "If I am not paid by that date, my next step will be to file a wage claim with the California Labor Commissioner.",
        `You can reach me at ${val(v, f("contact"), lang)}. I am keeping a copy of this letter.`,
        `Sincerely,\n\n\n${val(v, f("you"), lang)}\n${val(v, f("addr"), lang)}`,
      ]);
    },
  };
}
