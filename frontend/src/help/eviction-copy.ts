// Wording for the eviction deadline helper, written per language. Facts and
// their citations live in eviction-facts.ts; day counting in eviction.ts.
import type { Lang } from "../i18n";
import type { Delivery, NoticeKind, NoteId } from "./eviction";

type Fn<A extends unknown[]> = (...args: A) => string;
export type KindOrUnsure = NoticeKind | "unsure";

export interface EvictionCopy {
  title: string;
  intro: string;
  step1: string;
  kinds: Record<KindOrUnsure, { label: string; top: string }>;
  unsureTitle: string;
  unsureText: string;
  step2: string;
  dateHint: string;
  step3: string;
  deliveries: Record<Delivery, string>;
  deliveriesSummons: Record<Delivery, string>;
  fillAll: string;
  invalidDate: string;
  futureDate: string;
  callNowTitle: string;
  callNowText: string;
  rulesChangeText: string;
  deadlineLabel: Record<NoticeKind, string>;
  inDays: Fn<[number]>;
  today: string;
  tomorrow: string;
  passed: Fn<[number]>;
  meaning: Record<NoticeKind, string>;
  passedNotice: string;
  passedSummons: string;
  safeNote: string;
  notes: Record<NoteId, string>;
  countTitle: string;
  countStart: Fn<[string]>;
  countStartSubstituted: Fn<[string]>;
  countStartMailed: Fn<[string]>;
  countSummonsComplete: Fn<[string]>;
  countCourt: Fn<[number]>;
  countCalendar: Fn<[number, string]>;
  dayN: Fn<[number, string]>;
  rolled: Fn<[string, string]>;
  holidaysSkipped: string;
  noHolidays: string;
  weekendsSkipped: Fn<[number]>;
  disputed: string;
  holidaySource: string;
  legalBtn: string;
  legalLead: string;
  nextTitle: string;
  noticeRightsTitle: string;
  summonsWhereTitle: string;
  summonsStepsTitle: string;
  formAnswer: string;
  formRespond: string;
  formFeeWaiver: string;
  rightsTitle: string;
  helpTitle: string;
}

const en: EvictionCopy = {
  title: "Got an eviction notice? Find your deadline",
  intro:
    "Answer 3 questions to see your last day to act. When the law is unclear, we show the earliest date, so you are never late. Nothing you enter is saved or sent.",
  step1: "1. What did you get?",
  kinds: {
    "pay-or-quit": { label: "A 3-day notice to pay rent", top: "The top usually says: “3-Day Notice to Pay Rent or Quit”" },
    "perform-or-quit": { label: "A 3-day notice to fix a problem", top: "The top usually says: “3-Day Notice to Perform Covenants or Quit”" },
    "quit-no-cure": { label: "A 3-day notice to move out, with no way to fix it", top: "The top usually says: “3-Day Notice to Quit”" },
    "30-day": { label: "A 30-day notice to end your rental", top: "Usually when you have lived there less than 1 year. The top says “30-Day Notice to Terminate Tenancy” or “Notice to Vacate”" },
    "60-day": { label: "A 60-day notice to end your rental", top: "Usually when you have lived there 1 year or more. The top says “60-Day Notice to Terminate Tenancy”" },
    "90-day": { label: "A 90-day notice", top: "For Section 8 or other government rent help, or after the building was sold in foreclosure" },
    summons: { label: "Court papers: a Summons and a Complaint", top: "Has a case number and says “Summons” and “Unlawful Detainer” (forms SUM-130 and UD-100). This is the most urgent." },
    unsure: { label: "I’m not sure", top: "We’ll tell you what to look for" },
  },
  unsureTitle: "Look at the top of the paper",
  unsureText:
    "If it has a case number and the words “Summons” or “Unlawful Detainer,” it is court papers, and you have only days to answer. If it says “Notice,” look for the number of days. If you still can’t tell, call for free legal help today and have the paper with you.",
  step2: "2. When did you get it?",
  dateHint:
    "If it was posted on your door or left with someone, use the day it was posted or left. If it only came by mail, use the postmark date on the envelope. Not sure? Use the earliest date it could be.",
  step3: "3. How was it delivered?",
  deliveries: {
    hand: "Handed to me in person",
    left: "Left with another adult at my home or work, and a copy mailed",
    posted: "Posted on my door, and a copy mailed",
    mailed: "Only mailed to me",
    electronic: "Email, text, or someone just told me",
  },
  deliveriesSummons: {
    hand: "Handed to me in person (or left near me when I refused them)",
    left: "Left with another adult at my home or work, and a copy mailed",
    posted: "Posted on my door (by court order), and a copy mailed",
    mailed: "Only mailed to me",
    electronic: "Email, text, or someone just told me",
  },
  fillAll: "Answer all 3 questions to see your deadline.",
  invalidDate: "Enter a real date.",
  futureDate: "That date is in the future. Enter the day you got the paper.",
  callNowTitle: "We can’t count days for that date — call now",
  callNowText: "We only have the court holiday list for 2026 and 2027. Call free legal help today so someone can count your days.",
  rulesChangeText:
    "The rules for court papers that are left with someone or posted change on January 1, 2027, and we could not confirm the new rule. Call free legal help today so someone can count your days.",
  deadlineLabel: {
    "pay-or-quit": "Last day to pay all the rent the notice asks for",
    "perform-or-quit": "Last day to fix the problem",
    "quit-no-cure": "Last day of the notice",
    "30-day": "Last day of the notice",
    "60-day": "Last day of the notice",
    "90-day": "Last day of the notice",
    summons: "Last day to file your Answer",
  },
  inDays: (n) => `That is ${n} days from today.`,
  today: "That is TODAY.",
  tomorrow: "That is tomorrow.",
  passed: (n) => `That date has passed (${n} ${n === 1 ? "day" : "days"} ago).`,
  meaning: {
    "pay-or-quit": "If you haven’t paid by then, after this date the landlord can file an eviction case in court. They cannot lock you out themselves.",
    "perform-or-quit": "If the problem isn’t fixed by then, after this date the landlord can file an eviction case in court. They cannot lock you out themselves.",
    "quit-no-cure": "After this date the landlord can file an eviction case in court. They cannot lock you out themselves.",
    "30-day": "After this date the landlord can file an eviction case in court. They cannot lock you out themselves.",
    "60-day": "After this date the landlord can file an eviction case in court. They cannot lock you out themselves.",
    "90-day": "After this date the landlord can file an eviction case in court. They cannot lock you out themselves.",
    summons: "File your Answer (form UD-105) at the court in Turlock by this day. The clerk’s window closes at 4:00 p.m. Go earlier if you can.",
  },
  passedNotice:
    "The landlord may file a court case now. If you get court papers, you will have only 10 court days to answer. Get legal help today.",
  passedSummons: "If the landlord hasn’t asked for a default yet, you can still file your Answer. Do it today, and call for legal help.",
  safeNote: "This is the earliest safe date. Don’t wait until the last day.",
  notes: {
    noFivePlus: "Mailing does NOT add 5 extra days to a notice.",
    maybeLaterSubstituted:
      "Some courts start counting later for a notice that was posted or left with someone. You may have more time, but don’t wait — use this date.",
    maybeLaterCertified:
      "If the notice came only by certified mail, the law is unsettled on whether you get 5 more days. You may have more time, but don’t wait — use this date.",
    mailOnly3Day:
      "The law lists other ways to deliver a 3-day notice (in person, or left or posted plus mailed). A lawyer can tell you if it was delivered properly. Until then, use this date.",
    notValidService:
      "Email, a text or just telling you is not a legal way to deliver this. But don’t ignore it. We counted from the day you got it, to be safe. Get legal help.",
    summonsMail:
      "Court papers sent only by mail are rare. You may have more time, but don’t wait — use this date and call for legal help.",
    summonsComplete: "For papers left with someone or posted, the law treats them as delivered 10 days after they were mailed.",
    tenancyEndsLater: "If the notice gives a later date, your tenancy ends on that later date.",
    subsidized90:
      "A Section 8 notice must give reasons and 10 days to talk it over with the landlord. A 90-day notice after foreclosure may not end a lease signed before the sale.",
    disputedHoliday:
      "Farmworkers Day 2027 is listed on two different dates. We counted both as normal court days, so your real deadline may be one court day later. Don’t wait.",
  },
  countTitle: "Count my days",
  countStart: (d) => `The day you got it (${d}) does not count.`,
  countStartSubstituted: (d) => `Counting starts the day after it was posted or left and mailed. We used ${d}; that day does not count.`,
  countStartMailed: (d) => `Counting starts the day after it was mailed. We used ${d}; that day does not count.`,
  countSummonsComplete: (d) => `The law treats the papers as delivered 10 days after mailing. Counting from the day they were left or posted (mailing is usually that day or later), that is ${d}. That day does not count.`,
  countCourt: (n) => `Then we counted ${n} court days: Monday to Friday, skipping court holidays.`,
  countCalendar: (n, d) => `Then we counted ${n} calendar days. Every day counts, even weekends and holidays. Day ${n} is ${d}.`,
  dayN: (n, d) => `Day ${n}: ${d}`,
  rolled: (from, to) => `${from} is a weekend or court holiday, so the deadline moves to the next court day: ${to}.`,
  holidaysSkipped: "Court holidays we skipped:",
  noHolidays: "No court holidays were skipped.",
  weekendsSkipped: (n) => `Weekend days skipped: ${n}.`,
  disputed:
    "Farmworkers Day 2027: state law says March 31, but the Judicial Council and the Stanislaus court list April 9. We counted both as normal court days, so the date above is the earlier one.",
  holidaySource: "Court holidays from the Judicial Council of California, checked against the Stanislaus court.",
  legalBtn: "Get free legal help now",
  legalLead: "Call today, and have the paper with you. Free legal help:",
  nextTitle: "What to do now",
  noticeRightsTitle: "What this notice does and doesn’t mean",
  summonsWhereTitle: "Where to get help and where to file",
  summonsStepsTitle: "How to answer",
  formAnswer: "Answer form UD-105 (PDF)",
  formRespond: "California Courts: how to respond to an eviction case",
  formFeeWaiver: "California Courts: ask to waive court fees (FW-001)",
  rightsTitle: "Your rights, whatever paper you got",
  helpTitle: "Free help in Stanislaus County",
};

const es: EvictionCopy = {
  title: "¿Recibió un aviso de desalojo? Vea su fecha límite",
  intro:
    "Conteste 3 preguntas para ver el último día para actuar. Cuando la ley no es clara, le mostramos la fecha más temprana, para que nunca llegue tarde. Nada de lo que escriba se guarda ni se envía.",
  step1: "1. ¿Qué recibió?",
  kinds: {
    "pay-or-quit": { label: "Un aviso de 3 días para pagar la renta", top: "Arriba suele decir (en inglés): “3-Day Notice to Pay Rent or Quit”" },
    "perform-or-quit": { label: "Un aviso de 3 días para corregir un problema", top: "Arriba suele decir (en inglés): “3-Day Notice to Perform Covenants or Quit”" },
    "quit-no-cure": { label: "Un aviso de 3 días para irse, sin opción de corregir", top: "Arriba suele decir (en inglés): “3-Day Notice to Quit”" },
    "30-day": { label: "Un aviso de 30 días para terminar su contrato", top: "Normalmente si ha vivido ahí menos de 1 año. Arriba dice “30-Day Notice to Terminate Tenancy” o “Notice to Vacate”" },
    "60-day": { label: "Un aviso de 60 días para terminar su contrato", top: "Normalmente si ha vivido ahí 1 año o más. Arriba dice “60-Day Notice to Terminate Tenancy”" },
    "90-day": { label: "Un aviso de 90 días", top: "Para Sección 8 u otra ayuda de renta del gobierno, o después de que vendieron el edificio por ejecución hipotecaria (foreclosure)" },
    summons: { label: "Papeles de la corte: Citatorio (Summons) y Demanda", top: "Tiene número de caso y dice “Summons” y “Unlawful Detainer” (formularios SUM-130 y UD-100). Es lo más urgente." },
    unsure: { label: "No estoy seguro", top: "Le diremos qué buscar" },
  },
  unsureTitle: "Mire la parte de arriba del papel",
  unsureText:
    "Si tiene un número de caso y las palabras “Summons” o “Unlawful Detainer”, son papeles de la corte y tiene solo unos días para responder. Si dice “Notice”, busque el número de días. Si aún no sabe, llame hoy a ayuda legal gratis y tenga el papel a la mano.",
  step2: "2. ¿Cuándo lo recibió?",
  dateHint:
    "Si lo pegaron en su puerta o lo dejaron con alguien, use el día en que lo pegaron o lo dejaron. Si solo llegó por correo, use la fecha del matasellos del sobre. ¿No está seguro? Use la fecha más temprana posible.",
  step3: "3. ¿Cómo se lo entregaron?",
  deliveries: {
    hand: "Me lo dieron en persona",
    left: "Lo dejaron con otro adulto en mi casa o trabajo, y enviaron una copia por correo",
    posted: "Lo pegaron en mi puerta, y enviaron una copia por correo",
    mailed: "Solo me lo enviaron por correo",
    electronic: "Por correo electrónico, texto, o solo me lo dijeron",
  },
  deliveriesSummons: {
    hand: "Me los dieron en persona (o los dejaron junto a mí cuando no quise tomarlos)",
    left: "Los dejaron con otro adulto en mi casa o trabajo, y enviaron una copia por correo",
    posted: "Los pegaron en mi puerta (con orden de la corte), y enviaron una copia por correo",
    mailed: "Solo me los enviaron por correo",
    electronic: "Por correo electrónico, texto, o solo me lo dijeron",
  },
  fillAll: "Conteste las 3 preguntas para ver su fecha límite.",
  invalidDate: "Escriba una fecha real.",
  futureDate: "Esa fecha es en el futuro. Escriba el día en que recibió el papel.",
  callNowTitle: "No podemos contar los días para esa fecha: llame ahora",
  callNowText: "Solo tenemos la lista de feriados de la corte de 2026 y 2027. Llame hoy a ayuda legal gratis para que alguien cuente sus días.",
  rulesChangeText:
    "Las reglas para papeles de la corte que se dejan con alguien o se pegan en la puerta cambian el 1 de enero de 2027, y no pudimos confirmar la regla nueva. Llame hoy a ayuda legal gratis para que alguien cuente sus días.",
  deadlineLabel: {
    "pay-or-quit": "Último día para pagar toda la renta que pide el aviso",
    "perform-or-quit": "Último día para corregir el problema",
    "quit-no-cure": "Último día del aviso",
    "30-day": "Último día del aviso",
    "60-day": "Último día del aviso",
    "90-day": "Último día del aviso",
    summons: "Último día para presentar su Respuesta",
  },
  inDays: (n) => `Faltan ${n} días a partir de hoy.`,
  today: "Es HOY.",
  tomorrow: "Es mañana.",
  passed: (n) => `Esa fecha ya pasó (hace ${n} ${n === 1 ? "día" : "días"}).`,
  meaning: {
    "pay-or-quit": "Si no ha pagado para entonces, después de esta fecha el dueño puede presentar un caso de desalojo en la corte. El dueño no puede sacarlo ni cambiar las cerraduras por su cuenta.",
    "perform-or-quit": "Si el problema no está corregido para entonces, después de esta fecha el dueño puede presentar un caso de desalojo en la corte. El dueño no puede sacarlo ni cambiar las cerraduras por su cuenta.",
    "quit-no-cure": "Después de esta fecha el dueño puede presentar un caso de desalojo en la corte. El dueño no puede sacarlo ni cambiar las cerraduras por su cuenta.",
    "30-day": "Después de esta fecha el dueño puede presentar un caso de desalojo en la corte. El dueño no puede sacarlo ni cambiar las cerraduras por su cuenta.",
    "60-day": "Después de esta fecha el dueño puede presentar un caso de desalojo en la corte. El dueño no puede sacarlo ni cambiar las cerraduras por su cuenta.",
    "90-day": "Después de esta fecha el dueño puede presentar un caso de desalojo en la corte. El dueño no puede sacarlo ni cambiar las cerraduras por su cuenta.",
    summons: "Presente su Respuesta (formulario UD-105) en la corte de Turlock a más tardar este día. La ventanilla cierra a las 4:00 p.m. Vaya antes si puede.",
  },
  passedNotice:
    "El dueño ya puede presentar un caso en la corte. Si le llegan papeles de la corte, tendrá solo 10 días hábiles para responder. Busque ayuda legal hoy.",
  passedSummons: "Si el dueño todavía no ha pedido un fallo por incumplimiento, aún puede presentar su Respuesta. Hágalo hoy y llame a ayuda legal.",
  safeNote: "Esta es la fecha segura más temprana. No espere hasta el último día.",
  notes: {
    noFivePlus: "El correo NO agrega 5 días extra a un aviso.",
    maybeLaterSubstituted:
      "Algunas cortes empiezan a contar más tarde cuando el aviso se pegó en la puerta o se dejó con alguien. Puede tener más tiempo, pero no espere: use esta fecha.",
    maybeLaterCertified:
      "Si el aviso llegó solo por correo certificado, la ley no está clara sobre si tiene 5 días más. Puede tener más tiempo, pero no espere: use esta fecha.",
    mailOnly3Day:
      "La ley indica otras formas de entregar un aviso de 3 días (en persona, o dejado o pegado y además enviado por correo). Un abogado puede decirle si se entregó bien. Mientras tanto, use esta fecha.",
    notValidService:
      "Un correo electrónico, un texto o solo decírselo no es una forma legal de entregarlo. Pero no lo ignore. Contamos desde el día en que lo recibió, para estar seguros. Busque ayuda legal.",
    summonsMail:
      "Es raro que los papeles de la corte lleguen solo por correo. Puede tener más tiempo, pero no espere: use esta fecha y llame a ayuda legal.",
    summonsComplete: "Si los papeles se dejaron con alguien o se pegaron en la puerta, la ley los da por entregados 10 días después de enviarlos por correo.",
    tenancyEndsLater: "Si el aviso da una fecha más tarde, su contrato termina en esa fecha más tarde.",
    subsidized90:
      "Un aviso de Sección 8 debe dar las razones y 10 días para hablarlo con el dueño. Un aviso de 90 días después de una ejecución hipotecaria quizá no termine un contrato firmado antes de la venta.",
    disputedHoliday:
      "El Día de los Trabajadores del Campo de 2027 aparece en dos fechas distintas. Contamos ambas como días hábiles normales, así que su plazo real podría ser un día hábil después. No espere.",
  },
  countTitle: "Contar mis días",
  countStart: (d) => `El día en que lo recibió (${d}) no cuenta.`,
  countStartSubstituted: (d) => `Se empieza a contar el día después de que lo pegaron o lo dejaron y lo enviaron por correo. Usamos el ${d}; ese día no cuenta.`,
  countStartMailed: (d) => `Se empieza a contar el día después de que se envió por correo. Usamos el ${d}; ese día no cuenta.`,
  countSummonsComplete: (d) => `La ley da los papeles por entregados 10 días después del envío por correo. Contando desde el día en que los dejaron o pegaron (el envío suele ser ese día o después), eso es el ${d}. Ese día no cuenta.`,
  countCourt: (n) => `Después contamos ${n} días hábiles de la corte: de lunes a viernes, sin los feriados de la corte.`,
  countCalendar: (n, d) => `Después contamos ${n} días calendario. Todos los días cuentan, aun fines de semana y feriados. El día ${n} es el ${d}.`,
  dayN: (n, d) => `Día ${n}: ${d}`,
  rolled: (from, to) => `El ${from} es fin de semana o feriado de la corte, así que el plazo pasa al siguiente día hábil: ${to}.`,
  holidaysSkipped: "Feriados de la corte que no contamos:",
  noHolidays: "No hubo feriados de la corte en esta cuenta.",
  weekendsSkipped: (n) => `Días de fin de semana que no contamos: ${n}.`,
  disputed:
    "Día de los Trabajadores del Campo 2027: la ley estatal dice 31 de marzo, pero el Consejo Judicial y la corte de Stanislaus dicen 9 de abril. Contamos ambos como días hábiles normales, así que la fecha de arriba es la más temprana.",
  holidaySource: "Feriados de la corte del Consejo Judicial de California, comparados con la corte de Stanislaus.",
  legalBtn: "Obtenga ayuda legal gratis ahora",
  legalLead: "Llame hoy y tenga el papel a la mano. Ayuda legal gratis:",
  nextTitle: "Qué hacer ahora",
  noticeRightsTitle: "Lo que este aviso significa y lo que no",
  summonsWhereTitle: "Dónde pedir ayuda y dónde presentar",
  summonsStepsTitle: "Cómo responder",
  formAnswer: "Formulario de Respuesta UD-105 (PDF, en inglés)",
  formRespond: "Cortes de California: cómo responder a un caso de desalojo",
  formFeeWaiver: "Cortes de California: pedir que no le cobren las cuotas (FW-001)",
  rightsTitle: "Sus derechos, sin importar qué papel recibió",
  helpTitle: "Ayuda gratis en el condado de Stanislaus",
};

export const EVICTION_COPY: Record<Lang, EvictionCopy> = { en, es };
