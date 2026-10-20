// Fill-in letters (pure: values in -> text out; unit-tested). Each says only
// what the cited law says, asks for specific things by a specific date, and
// reminds the writer to keep a copy. They never threaten to withhold rent.
import type { Lang } from "../i18n";
import { daysBetween, longDate } from "./dates";
import { parseMoney, formatMoney } from "./money";
import { checked, val, type LetterDef, type LetterField, type LetterValues } from "./letter-types";

const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-US" };

function field(def: LetterField[], id: string): LetterField | undefined {
  return def.find((f) => f.id === id);
}

/** Build a letter from paragraphs, dropping empty ones. */
const join = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("\n\n");

const dateOr = (v: LetterValues, f: LetterField | undefined, lang: Lang) => {
  const raw = f ? String(v[f.id] ?? "") : "";
  return raw ? longDate(raw, LOCALE[lang]) : val(v, f, lang);
};

const moneyOr = (v: LetterValues, f: LetterField | undefined, lang: Lang) => {
  const n = f ? parseMoney(String(v[f.id] ?? "")) : null;
  return n != null ? formatMoney(n, LOCALE[lang]) : val(v, f, lang);
};

// Shared people/address fields.
const YOU: LetterField = { id: "you", kind: "text", label: { en: "Your full name", es: "Su nombre completo" }, autoComplete: "name" };
const CONTACT: LetterField = {
  id: "contact",
  kind: "text",
  label: { en: "Phone or email to reach you", es: "Teléfono o correo para contactarle" },
};
const LANDLORD: LetterField = {
  id: "landlord",
  kind: "text",
  label: { en: "Landlord or manager’s name", es: "Nombre del arrendador o administrador" },
};
const LANDLORD_ADDR: LetterField = {
  id: "landlordAddr",
  kind: "multiline",
  label: { en: "Landlord’s mailing address", es: "Dirección postal del arrendador" },
  hint: {
    en: "Use the address in your lease or on the notice posted at your building.",
    es: "Use la dirección de su contrato o del aviso que está en su edificio.",
  },
};
const RENTAL: LetterField = {
  id: "rental",
  kind: "text",
  label: { en: "Rental address (with unit number)", es: "Dirección de la vivienda que renta (con número de unidad)" },
  autoComplete: "street-address",
};

const SIGN: Record<Lang, string> = { en: "Sincerely,", es: "Atentamente," };
const KEEP: Record<Lang, string> = {
  en: "I am keeping a copy of this letter.",
  es: "Guardo una copia de esta carta.",
};

// ------------------------------------------------------------ repairs

const PROBLEMS: { id: string; label: Record<Lang, string> }[] = [
  { id: "heat", label: { en: "No heat or broken heater", es: "No hay calefacción o el calentador no funciona" } },
  { id: "water", label: { en: "No hot water or no running water", es: "No hay agua caliente o no hay agua" } },
  { id: "plumbing", label: { en: "Plumbing, toilet or sewage problem", es: "Problema de plomería, inodoro o drenaje" } },
  { id: "leak", label: { en: "Roof, window or wall leaks", es: "Goteras en el techo, ventanas o paredes" } },
  { id: "mold", label: { en: "Mold or dampness", es: "Moho o humedad" } },
  { id: "electric", label: { en: "Electrical problem (outlets, wiring, lights)", es: "Problema eléctrico (enchufes, cables, luces)" } },
  { id: "gas", label: { en: "Gas problem or gas smell", es: "Problema de gas u olor a gas" } },
  { id: "pests", label: { en: "Cockroaches, rats, mice or bed bugs", es: "Cucarachas, ratas, ratones o chinches" } },
  { id: "kitchen", label: { en: "Stove or refrigerator doesn’t work", es: "La estufa o el refrigerador no funcionan" } },
  { id: "doors", label: { en: "Broken doors, windows or locks", es: "Puertas, ventanas o cerraduras rotas" } },
  { id: "floors", label: { en: "Unsafe floors, stairs or railings", es: "Pisos, escaleras o barandales peligrosos" } },
  { id: "garbage", label: { en: "Garbage, debris or no trash bins", es: "Basura, escombros o faltan botes de basura" } },
];

const repairFields: LetterField[] = [
  YOU,
  RENTAL,
  LANDLORD,
  LANDLORD_ADDR,
  { id: "problems", kind: "checks", label: { en: "What needs repair?", es: "¿Qué necesita reparación?" }, options: PROBLEMS },
  {
    id: "details",
    kind: "multiline",
    label: { en: "Describe the problems (where, how bad)", es: "Describa los problemas (dónde, qué tan graves)" },
    hint: { en: "Example: “Bathroom ceiling leaks when it rains; the drywall is soft.”", es: "Ejemplo: “El techo del baño gotea cuando llueve; la pared está blanda.”" },
  },
  { id: "since", kind: "date", label: { en: "When did the problems start?", es: "¿Cuándo empezaron los problemas?" } },
  {
    id: "before",
    kind: "multiline",
    label: { en: "Did you ask before? When and how? (optional)", es: "¿Ya lo pidió antes? ¿Cuándo y cómo? (opcional)" },
    hint: { en: "Example: “I called on March 3 and texted on March 10.”", es: "Ejemplo: “Llamé el 3 de marzo y mandé un texto el 10 de marzo.”" },
  },
  CONTACT,
];

export const repairLetter: LetterDef = {
  id: "repair",
  title: { en: "Repair request letter", es: "Carta para pedir reparaciones" },
  blurb: {
    en: "Puts your request in writing, cites the law, and gives a deadline. Send it in a way you can prove (certified mail, or mail plus a text or email with a photo of the letter).",
    es: "Deja su solicitud por escrito, cita la ley y pone un plazo. Envíela de una forma que pueda comprobar (correo certificado, o por correo y además por texto o correo electrónico con una foto de la carta).",
  },
  fields: repairFields,
  filename: "repair-request",
  render(v, lang, today) {
    const f = (id: string) => field(repairFields, id);
    const items = checked(v, f("problems"), lang);
    const list = items.length ? items.map((i) => `- ${i}`).join("\n") : `- [${f("problems")!.label[lang]}]`;
    const details = String(v.details ?? "").trim();
    const before = String(v.before ?? "").trim();
    if (lang === "es")
      return join([
        longDate(today, LOCALE.es),
        `${val(v, f("landlord"), lang)}\n${val(v, f("landlordAddr"), lang)}`,
        `Asunto: Solicitud de reparaciones en ${val(v, f("rental"), lang)}`,
        `Estimado/a ${val(v, f("landlord"), lang)}:`,
        `Rento la vivienda en ${val(v, f("rental"), lang)}. Le escribo para pedirle que repare los siguientes problemas:\n${list}`,
        details && `Detalles: ${details}`,
        `Los problemas empezaron el ${dateOr(v, f("since"), lang)}.${before ? ` Ya se lo había informado antes: ${before}` : ""}`,
        "La ley de California exige que los arrendadores mantengan las viviendas en condiciones habitables (Código Civil, secciones 1941 y 1941.1). Le pido que haga estas reparaciones en un plazo razonable y a más tardar 30 días a partir de esta carta, o antes para cualquier problema que afecte la salud o la seguridad.",
        `Puede entrar a hacer las reparaciones avisándome por escrito con tiempo razonable (Código Civil, sección 1954). Puede comunicarse conmigo al ${val(v, f("contact"), lang)}.`,
        "Hago esta solicitud de buena fe. La ley de California prohíbe las represalias contra los inquilinos que piden reparaciones (Código Civil, sección 1942.5).",
        `${KEEP.es} También tengo fotos de los problemas.`,
        `${SIGN.es}\n\n\n${val(v, f("you"), lang)}`,
      ]);
    return join([
      longDate(today, LOCALE.en),
      `${val(v, f("landlord"), lang)}\n${val(v, f("landlordAddr"), lang)}`,
      `Re: Request for repairs at ${val(v, f("rental"), lang)}`,
      `Dear ${val(v, f("landlord"), lang)}:`,
      `I rent the home at ${val(v, f("rental"), lang)}. I am writing to ask you to repair the following problems:\n${list}`,
      details && `Details: ${details}`,
      `These problems started on ${dateOr(v, f("since"), lang)}.${before ? ` I told you about them before: ${before}` : ""}`,
      "California law requires landlords to keep rental homes fit to live in (Civil Code sections 1941 and 1941.1). Please make these repairs within a reasonable time, and no later than 30 days from the date of this letter, or sooner for anything that affects health or safety.",
      `You may enter to make repairs after giving me reasonable written notice (Civil Code section 1954). You can reach me at ${val(v, f("contact"), lang)}.`,
      "I am making this request in good faith. California law prohibits retaliation against tenants who ask for repairs (Civil Code section 1942.5).",
      `${KEEP.en} I also have photos of the problems.`,
      `${SIGN.en}\n\n\n${val(v, f("you"), lang)}`,
    ]);
  },
};

// ------------------------------------------------------------ deposits

const depositFields: LetterField[] = [
  YOU,
  { id: "forward", kind: "multiline", label: { en: "Your new mailing address", es: "Su nueva dirección postal" }, autoComplete: "street-address" },
  RENTAL,
  LANDLORD,
  LANDLORD_ADDR,
  { id: "moveOut", kind: "date", label: { en: "Date you moved out and returned the keys", es: "Fecha en que se mudó y entregó las llaves" } },
  { id: "deposit", kind: "money", label: { en: "Deposit you paid ($)", es: "Depósito que pagó ($)" } },
  {
    id: "returned",
    kind: "money",
    label: { en: "Amount already returned ($, if any)", es: "Cantidad que ya le devolvieron ($, si hay)" },
  },
  {
    id: "situation",
    kind: "checks",
    label: { en: "What happened?", es: "¿Qué pasó?" },
    options: [
      { id: "nothing", label: { en: "I got nothing back: no money and no itemized list", es: "No me devolvieron nada: ni dinero ni lista detallada" } },
      { id: "dispute", label: { en: "I got a list of deductions I disagree with", es: "Recibí una lista de descuentos con la que no estoy de acuerdo" } },
      { id: "noReceipts", label: { en: "Repair or cleaning charges came without receipts or photos", es: "Cobraron reparaciones o limpieza sin recibos ni fotos" } },
    ],
  },
  {
    id: "disputed",
    kind: "multiline",
    label: { en: "Which deductions are wrong, and why? (optional)", es: "¿Qué descuentos están mal y por qué? (opcional)" },
    hint: { en: "Example: “$300 for carpet: it was already worn when I moved in (see my move-in photos).”", es: "Ejemplo: “$300 por la alfombra: ya estaba gastada cuando llegué (vea mis fotos de entrada).”" },
  },
  {
    id: "method",
    kind: "text",
    label: { en: "How you want to be paid", es: "Cómo quiere que le paguen" },
    hint: { en: "A check to your new address, or (if you paid electronically) a bank transfer.", es: "Un cheque a su nueva dirección o, si pagó de forma electrónica, una transferencia bancaria." },
  },
  CONTACT,
];

export const depositLetter: LetterDef = {
  id: "deposit",
  title: { en: "Deposit demand letter", es: "Carta para exigir su depósito" },
  blurb: {
    en: "Asks for your deposit back, cites the 21-day rule, and says you’ll go to small claims if needed. Keep proof that you sent it.",
    es: "Pide la devolución de su depósito, cita la regla de 21 días y avisa que irá a la corte de reclamos menores si hace falta. Guarde prueba de que la envió.",
  },
  fields: depositFields,
  filename: "deposit-demand",
  render(v, lang, today) {
    const f = (id: string) => field(depositFields, id);
    const situation = Array.isArray(v.situation) ? v.situation : [];
    const deposit = parseMoney(String(v.deposit ?? ""));
    const returned = parseMoney(String(v.returned ?? "")) ?? 0;
    const owed = deposit != null ? Math.max(0, deposit - returned) : null;
    const owedText = owed != null ? formatMoney(owed, LOCALE[lang]) : `[${lang === "es" ? "cantidad que le deben" : "amount owed"}]`;
    const moveOut = String(v.moveOut ?? "");
    const days = moveOut ? daysBetween(moveOut, today) : null;
    const disputed = String(v.disputed ?? "").trim();
    if (lang === "es")
      return join([
        longDate(today, LOCALE.es),
        `${val(v, f("landlord"), lang)}\n${val(v, f("landlordAddr"), lang)}`,
        `Asunto: Devolución de mi depósito de garantía de ${val(v, f("rental"), lang)}`,
        `Estimado/a ${val(v, f("landlord"), lang)}:`,
        `Me mudé de ${val(v, f("rental"), lang)} el ${dateOr(v, f("moveOut"), lang)} y entregué las llaves. Pagué un depósito de garantía de ${moneyOr(v, f("deposit"), lang)}${returned ? `, y hasta ahora me han devuelto ${formatMoney(returned, LOCALE.es)}` : ""}.`,
        "Según el Código Civil de California, sección 1950.5(h), usted debe devolverme el depósito, o enviarme una lista detallada de los descuentos junto con el resto, dentro de los 21 días después de que me mudé.",
        situation.includes("nothing") &&
          `${days != null && days > 21 ? `Han pasado ${days} días y` : "Hasta hoy"} no he recibido ni el depósito ni una lista detallada.`,
        situation.includes("dispute") &&
          `Recibí su lista, pero no estoy de acuerdo con los descuentos${disputed ? `: ${disputed}` : "."} Solo se permite descontar renta no pagada, daños más allá del desgaste normal, y la limpieza necesaria para dejar la vivienda tan limpia como estaba al inicio (sección 1950.5(b) y (e)).`,
        situation.includes("noReceipts") &&
          "Le pido copias de los recibos o facturas y las fotos de antes y después de cualquier cargo por reparación o limpieza, como exige la sección 1950.5(g) y (h)(2).",
        `Le pido que me pague ${owedText} dentro de los 14 días a partir de la fecha de esta carta, por ${val(v, f("method"), lang)}, a esta dirección:\n${val(v, f("forward"), lang)}`,
        "Si un arrendador retiene un depósito de mala fe, la corte puede ordenarle pagar hasta el doble del depósito, además de la cantidad que debe (sección 1950.5(m)). Si no recibo el pago, pienso presentar una demanda en la corte de reclamos menores del condado de Stanislaus.",
        `Puede comunicarse conmigo al ${val(v, f("contact"), lang)}. ${KEEP.es}`,
        `${SIGN.es}\n\n\n${val(v, f("you"), lang)}`,
      ]);
    return join([
      longDate(today, LOCALE.en),
      `${val(v, f("landlord"), lang)}\n${val(v, f("landlordAddr"), lang)}`,
      `Re: Return of my security deposit for ${val(v, f("rental"), lang)}`,
      `Dear ${val(v, f("landlord"), lang)}:`,
      `I moved out of ${val(v, f("rental"), lang)} on ${dateOr(v, f("moveOut"), lang)} and returned the keys. I paid a security deposit of ${moneyOr(v, f("deposit"), lang)}${returned ? `, and so far ${formatMoney(returned, LOCALE.en)} has been returned to me` : ""}.`,
      "Under California Civil Code section 1950.5(h), you must return my deposit, or send an itemized statement of deductions with the balance, within 21 days after I moved out.",
      situation.includes("nothing") &&
        `${days != null && days > 21 ? `It has been ${days} days, and I` : "As of today, I"} have not received my deposit or an itemized statement.`,
      situation.includes("dispute") &&
        `I received your statement, but I dispute the deductions${disputed ? `: ${disputed}` : "."} Deductions are allowed only for unpaid rent, damage beyond ordinary wear and tear, and cleaning needed to return the home to the level of cleanliness it had when I moved in (section 1950.5(b) and (e)).`,
      situation.includes("noReceipts") &&
        "Please send me copies of the receipts or invoices and the before-and-after photos for any repair or cleaning charge, as section 1950.5(g) and (h)(2) require.",
      `Please pay me ${owedText} within 14 days of the date of this letter, by ${val(v, f("method"), lang)}, at this address:\n${val(v, f("forward"), lang)}`,
      "If a landlord keeps a deposit in bad faith, a court may award up to twice the amount of the deposit in addition to the amount owed (section 1950.5(m)). If I do not receive payment, I plan to file a claim in Stanislaus County small claims court.",
      `You can reach me at ${val(v, f("contact"), lang)}. ${KEEP.en}`,
      `${SIGN.en}\n\n\n${val(v, f("you"), lang)}`,
    ]);
  },
};

// ------------------------------------------------------------ hospital bills

const medicalFields: LetterField[] = [
  YOU,
  { id: "addr", kind: "multiline", label: { en: "Your mailing address", es: "Su dirección postal" }, autoComplete: "street-address" },
  { id: "hospital", kind: "text", label: { en: "Hospital name", es: "Nombre del hospital" } },
  { id: "account", kind: "text", label: { en: "Account or bill number", es: "Número de cuenta o de factura" }, hint: { en: "It’s printed on the bill.", es: "Viene impreso en la cuenta." } },
  { id: "dates", kind: "text", label: { en: "Date(s) of care", es: "Fecha(s) de la atención" } },
  {
    id: "asks",
    kind: "checks",
    label: { en: "What are you asking for?", es: "¿Qué está pidiendo?" },
    options: [
      { id: "itemized", label: { en: "An itemized bill", es: "Una cuenta detallada" } },
      { id: "apply", label: { en: "To apply for financial assistance (free or discounted care)", es: "Pedir asistencia financiera (atención gratis o con descuento)" } },
      { id: "spanish", label: { en: "The policy and application in Spanish", es: "La política y la solicitud en español" } },
      { id: "hold", label: { en: "A hold on collections while they review it", es: "Que detengan el cobro mientras la revisan" } },
      { id: "plan", label: { en: "An interest-free payment plan", es: "Un plan de pagos sin intereses" } },
    ],
  },
  {
    id: "situation",
    kind: "checks",
    label: { en: "About your situation (optional)", es: "Sobre su situación (opcional)" },
    options: [
      { id: "uninsured", label: { en: "I have no health insurance", es: "No tengo seguro médico" } },
      { id: "high", label: { en: "My medical costs are more than 10% of my family’s income", es: "Mis gastos médicos son más del 10% de los ingresos de mi familia" } },
    ],
  },
  {
    id: "household",
    kind: "text",
    label: { en: "People in your family and yearly income (optional)", es: "Personas en su familia e ingresos al año (opcional)" },
    hint: { en: "Example: “4 people, about $38,000 a year.” Leave blank to send it with the application instead.", es: "Ejemplo: “4 personas, unos $38,000 al año.” Déjelo en blanco para mandarlo con la solicitud." },
  },
  CONTACT,
];

export const medicalLetter: LetterDef = {
  id: "medical",
  title: { en: "Itemized bill and financial assistance request", es: "Solicitud de cuenta detallada y asistencia financiera" },
  blurb: {
    en: "Send it to the billing address on your bill (or hand it in at the billing office), and call the financial assistance number too. Keep a copy.",
    es: "Envíela a la dirección de cobros que viene en su cuenta (o entréguela en la oficina de cobros), y llame también al número de asistencia financiera. Guarde una copia.",
  },
  fields: medicalFields,
  filename: "hospital-bill-request",
  render(v, lang, today) {
    const f = (id: string) => field(medicalFields, id);
    const asks = Array.isArray(v.asks) ? v.asks : [];
    const sit = Array.isArray(v.situation) ? v.situation : [];
    const household = String(v.household ?? "").trim();
    const es = lang === "es";
    const want: string[] = [];
    if (asks.includes("itemized")) want.push(es ? "una cuenta detallada (itemized bill) de esta cuenta" : "an itemized bill for this account");
    if (asks.includes("apply"))
      want.push(
        es
          ? `su política de asistencia financiera (atención de caridad y pago con descuento) y la solicitud${asks.includes("spanish") ? ", en español" : ""}, porque quiero pedir esa ayuda`
          : `your financial assistance (charity care and discount payment) policy and application${asks.includes("spanish") ? ", in Spanish" : ""}, because I want to apply`,
      );
    else if (asks.includes("spanish")) want.push(es ? "su política de asistencia financiera en español" : "your financial assistance policy in Spanish");
    if (asks.includes("plan")) want.push(es ? "un plan de pagos extendido sin intereses" : "an extended, interest-free payment plan");
    const list = want.length ? want.map((w) => `- ${w}`).join("\n") : `- [${f("asks")!.label[lang]}]`;
    const about = [
      sit.includes("uninsured") && (es ? "No tengo seguro médico." : "I do not have health insurance."),
      sit.includes("high") &&
        (es ? "Mis gastos médicos de mi bolsillo son más del 10% de los ingresos de mi familia." : "My out-of-pocket medical costs are more than 10% of my family's income."),
      household && (es ? `Mi familia: ${household}.` : `My family: ${household}.`),
    ]
      .filter(Boolean)
      .join(" ");
    if (es)
      return join([
        longDate(today, LOCALE.es),
        `${val(v, f("hospital"), lang)}\nDepartamento de cobros / Asistencia financiera`,
        `Asunto: Cuenta ${val(v, f("account"), lang)}: solicitud de cuenta detallada y asistencia financiera`,
        "A quien corresponda:",
        `Recibí atención en ${val(v, f("hospital"), lang)} el ${val(v, f("dates"), lang)}. Le escribo para pedirle:\n${list}`,
        about,
        "Según la Ley de Precios Justos de Hospitales de California (Código de Salud y Seguridad, secciones 127400 y siguientes), podría calificar para atención gratuita o con descuento.",
        asks.includes("hold") && "Le pido que detenga el cobro de esta cuenta mientras revisa mi solicitud.",
        `Por favor, envíe su respuesta y su decisión por escrito a:\n${val(v, f("you"), lang)}\n${val(v, f("addr"), lang)}\nTambién puede comunicarse conmigo al ${val(v, f("contact"), lang)}.`,
        KEEP.es,
        `${SIGN.es}\n\n\n${val(v, f("you"), lang)}`,
      ]);
    return join([
      longDate(today, LOCALE.en),
      `${val(v, f("hospital"), lang)}\nPatient Billing / Financial Assistance`,
      `Re: Account ${val(v, f("account"), lang)}: request for an itemized bill and financial assistance`,
      "To whom it may concern:",
      `I received care at ${val(v, f("hospital"), lang)} on ${val(v, f("dates"), lang)}. I am writing to ask for:\n${list}`,
      about,
      "Under California's Hospital Fair Pricing Act (Health and Safety Code section 127400 and following), I may qualify for free or discounted care.",
      asks.includes("hold") && "Please hold all collection activity on this account while my application is reviewed.",
      `Please send your reply and your written decision to:\n${val(v, f("you"), lang)}\n${val(v, f("addr"), lang)}\nYou can also reach me at ${val(v, f("contact"), lang)}.`,
      KEEP.en,
      `${SIGN.en}\n\n\n${val(v, f("you"), lang)}`,
    ]);
  },
};
