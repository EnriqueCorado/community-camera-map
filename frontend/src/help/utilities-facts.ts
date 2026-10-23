// Help with gas and electric bills in Stanislaus County: shutoff protections,
// payment plans, medical rates and scams, with citations. The income limits and
// discount programs (CARE, FERA, MID CARES, TID CARES, LIHEAP) are the Benefits
// screener's (benefits-facts.ts TABLES and PROGRAMS), so there's one source of
// truth. Researched 2026-10-23 from the CPUC, PG&E (Electric Rule 11, program
// pages), MID, TID, CSD and Stanislaus County; archive:
// ~/dev/outreach-help-2026-10/research/utilities.{json,md}.
//
// RE-CHECK by UTIL_RECHECK (upkeep.ts tracks it):
//  - CPUC Resolution E-5468 (July 16, 2026: 90°F for PG&E electric shutoffs) in
//    PG&E's posted Electric Rule 11 (still 100°F), and its switch to CalHeatScore
//    (re-check around 2027-01-16); PG&E gas Rule 11 (still 100°F);
//  - CSD's 2027 LIHEAP table and federal LIHEAP funding;
//  - TID's 2027 CARES charge discount ($30 from Jan 1, 2027).
import type { Fact } from "./facts";
import type { Bilingual } from "./letter-types";
import type { SourceRef } from "../components/help/ui";

export const UTIL_CHECKED = "2026-10-23";
export const UTIL_RECHECK = "2027-01-15";

const RULE_11 = "https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_RULES_11.pdf";
const CPUC_FACTS =
  "https://www.cpuc.ca.gov/-/media/cpuc-website/about-cpuc/documents/transparency-and-reporting/fact_sheets/overview-of-bill-protections-and-disconnection-of-service-to-residential-gas-electric-customers.pdf";
const CPUC_E5468 = "https://docs.cpuc.ca.gov/PublishedDocs/Published/G000/M611/K624/611624910.PDF";
const GAS_RULE_11 = "https://www.pge.com/tariffs/assets/pdf/tariffbook/GAS_RULES_11.pdf";
const RULE_8 = "https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_RULES_8.pdf";
const LIHEAP_PLAN = "https://www.csd.ca.gov/Shared%20Documents/2026-Final-LIHEAP-State-Plan.pdf";
const AMP = "https://www.pge.com/en/account/billing-and-assistance/financial-assistance/arrearage-management-plan-amp.html";
const MED_BASELINE = "https://www.pge.com/en/account/billing-and-assistance/financial-assistance/medical-baseline-program.html";
const TID_MEDICAL = "https://www.tid.org/customer-service/payment-assistance-programs/medical-rate-program/";
const MID_MEDICAL = "https://www.mid.org/customer-service/payments-billing/financial-assistance/medical-life-support-program/";
const TID_MORE = "https://www.tid.org/customer-service/payment-assistance-programs/additional-programs/";
const PGE_SCAMS = "https://www.pge.com/en/account/customer-service/scams.html";
const CPUC_COMPLAINT = "https://www.cpuc.ca.gov/consumer-support/file-a-complaint/utility-complaint";
const COUNTY = "https://www.stancounty.com/living-visiting/utilities-assistance.shtm";

export const UTIL_FACTS = {
  /** Which company sends which bill. */
  which: [
    {
      id: "which-bill",
      cite: "Stanislaus County; MID; TID",
      en: "Look at the company name at the top of each bill. In Stanislaus County, electricity comes from the Modesto Irrigation District (MID), the Turlock Irrigation District (TID) or PG&E, depending on where you live. Natural gas comes from PG&E. Many homes get two bills: electricity from MID or TID, and gas from PG&E.",
      es: "Fíjese en el nombre de la compañía arriba de cada factura. En el condado de Stanislaus, la luz viene del Distrito de Riego de Modesto (MID), del Distrito de Riego de Turlock (TID) o de PG&E, según dónde viva. El gas natural viene de PG&E. Muchas casas reciben dos facturas: la luz de MID o TID, y el gas de PG&E.",
    },
    {
      id: "which-rules",
      cite: "CPUC Consumer Affairs",
      en: "PG&E is regulated by the state (the CPUC), so the state rules below apply to PG&E. MID and TID are public districts with their own rules, and the CPUC does not take complaints about them: call MID or TID directly.",
      es: "PG&E está regulada por el estado (la CPUC), así que las reglas estatales de abajo se aplican a PG&E. MID y TID son distritos públicos con sus propias reglas, y la CPUC no recibe quejas sobre ellos: llame directamente a MID o a TID.",
    },
  ],
  /** Got a shutoff notice? PG&E (state rules), then MID/TID and crisis help. */
  shutoff: [
    {
      id: "notices",
      cite: "PG&E Electric Rules 8 and 11; CPUC fact sheet",
      en: "Before shutting off service for an unpaid bill, PG&E sends a 15-day notice, then a 48-hour notice, and tries to reach an adult at home by phone or in person at least 24 hours before. Don’t wait for the last notice: call as soon as you get the first one.",
      es: "Antes de cortar el servicio por una factura sin pagar, PG&E manda un aviso de 15 días, luego un aviso de 48 horas, y trata de comunicarse con un adulto de la casa por teléfono o en persona al menos 24 horas antes. No espere al último aviso: llame en cuanto reciba el primero.",
    },
    {
      id: "plan-24",
      cite: "PG&E Electric Rule 11 (C.1)",
      en: "If you tell PG&E you can't pay, PG&E must offer you a payment plan that spreads what you owe over 24 months. Ask for a 'payment arrangement.' You must pay each new bill on time too: if you miss a plan payment or a new bill, the whole amount can come due and PG&E can shut off service after a 48-hour notice. If PG&E shuts you off for the first time, it must turn service back on when you agree to a payment plan.",
      es: "Si le dice a PG&E que no puede pagar, PG&E tiene que ofrecerle un plan que reparte lo que debe en 24 meses. Pida un 'payment arrangement' (arreglo de pagos). También tiene que pagar a tiempo cada factura nueva: si falla un pago del plan o una factura nueva, se puede cobrar toda la deuda y PG&E puede cortar el servicio después de un aviso de 48 horas. Si PG&E le corta el servicio por primera vez, tiene que reconectarlo cuando usted acepte un plan de pagos.",
    },
    {
      id: "benefits-first",
      cite: "PG&E Electric Rule 11 (C.1)",
      en: "PG&E can’t shut you off for nonpayment until it has offered to enroll you in the PG&E programs you qualify for, like CARE or FERA. If PG&E tells you about a program, you have two billing cycles to sign up.",
      es: "PG&E no puede cortarle el servicio por falta de pago hasta que le haya ofrecido inscribirle en los programas de PG&E para los que califica, como CARE o FERA. Si PG&E le informa de un programa, tiene dos ciclos de facturación para inscribirse.",
    },
    {
      id: "pledge",
      cite: "PG&E Electric and Gas Rule 11 (C.1)",
      en: "If you have applied for LIHEAP or crisis help and the agency has told PG&E a payment is coming (a 'pledge'), PG&E can't shut you off while that pledge is pending. Tell PG&E you applied and give the agency's name.",
      es: "Si solicitó LIHEAP o ayuda de emergencia y la agencia le avisó a PG&E que va a mandar un pago (un 'pledge' o compromiso de pago), PG&E no puede cortarle el servicio mientras ese pago esté pendiente. Dígale a PG&E que hizo la solicitud y el nombre de la agencia.",
    },
    {
      id: "cold",
      cite: "PG&E Rules 11 (electric and gas); CPUC Resolution E-5468",
      en: "PG&E won't shut off your home for an unpaid bill on a Saturday, Sunday or holiday, or when it forecasts temperatures below 32°F within the next 72 hours. For PG&E electricity, a CPUC order (Resolution E-5468, July 16, 2026) also stops shutoffs when PG&E forecasts temperatures hotter than 90°F within 72 hours. PG&E's posted tariff still says 100°F, so if you get a shutoff notice in a heat wave, call PG&E and mention this order. For PG&E gas, PG&E's rule for heat is still 100°F. MID's rules have no weather pause; ask TID about its rules. These rules only pause a shutoff; the bill is still owed.",
      es: "PG&E no le corta el servicio por una factura sin pagar en sábado, domingo o día feriado, ni cuando pronostica temperaturas bajo 32°F en las próximas 72 horas. Para la luz de PG&E, una orden de la CPUC (Resolución E-5468, 16 de julio de 2026) también detiene los cortes cuando PG&E pronostica más de 90°F en las próximas 72 horas. La tarifa publicada de PG&E todavía dice 100°F; si recibe un aviso de corte durante una ola de calor, llame a PG&E y mencione esta orden. Para el gas de PG&E, la regla de PG&E para el calor sigue siendo 100°F. Las reglas de MID no tienen pausa por el clima; pregunte a TID por sus reglas. Estas reglas solo detienen el corte; la factura se sigue debiendo.",
    },
    {
      id: "medical-visit",
      cite: "PG&E Electric Rule 11 (C.1)",
      en: "If someone in the home is on Medical Baseline or life support, or has told PG&E they have a serious illness that could become life-threatening without power, PG&E must visit in person in the 48 hours before, or at the time of, a shutoff. The visit doesn't stop the shutoff: ask for a payment arrangement first.",
      es: "Si alguien en la casa está en Medical Baseline o usa soporte vital, o le dijo a PG&E que tiene una enfermedad grave que podría poner su vida en peligro sin el servicio, PG&E tiene que visitar en persona en las 48 horas antes del corte, o en el momento del corte. La visita no detiene el corte: pida antes un arreglo de pagos.",
    },
    {
      id: "complaint",
      cite: "CPUC Consumer Affairs; PG&E Electric Rule 11",
      en: "If you and PG&E can't agree on a payment plan, file a free complaint with the CPUC at 1-800-649-7570 or online before your shutoff date. PG&E's rule says it's up to you to contact the CPUC in time. If you think a bill is wrong, complain to PG&E within 5 days of getting it; PG&E won't shut you off over that bill while it's reviewed, but keep paying your other bills.",
      es: "Si usted y PG&E no se ponen de acuerdo en un plan de pagos, presente una queja gratis ante la CPUC al 1-800-649-7570 o en internet antes de la fecha de corte. La regla de PG&E dice que a usted le toca comunicarse a tiempo con la CPUC. Si cree que una factura está mal, quéjese con PG&E dentro de 5 días de recibirla; PG&E no le cortará por esa factura mientras la revisan, pero siga pagando sus otras facturas.",
    },
    {
      id: "mid-tid",
      cite: "MID Rules 8 and 11, Budget Payment Plan, Third-Party Notification; TID",
      en: "MID or TID notice? Call the number on your bill right away and ask for a payment arrangement (TID: My TID or customer service). MID's Budget Payment Plan is only for accounts with no past-due balance. If MID shuts you off, you must pay in full or make a payment arrangement, plus fees and a deposit, to get service back. People 65 and older can name someone MID will contact before a missed bill leads to a shutoff.",
      es: "¿Aviso de MID o TID? Llame enseguida al número de su factura y pida un arreglo de pagos (TID: My TID o servicio al cliente). El Plan de Pagos Nivelados de MID es solo para cuentas sin saldo atrasado. Si MID le corta el servicio, tiene que pagar todo o hacer un arreglo de pagos, más cargos y un depósito, para que lo reconecten. Las personas de 65 años o más pueden nombrar a alguien a quien MID avisará antes de que un pago olvidado cause un corte.",
    },
    {
      id: "ecip",
      cite: "CSD: 2026 LIHEAP State Plan, §4",
      en: "Crisis help: if you have any shutoff notice, your service was already shut off, or you can't pay a past-due bill, the Central Valley Opportunity Center may pay up to $1,500 toward your gas or electric bill, and can help with propane, firewood, or a broken heater or air conditioner, while funds last. Same income and status rules as LIHEAP. Call as soon as you get any notice.",
      es: "Ayuda de emergencia: si tiene cualquier aviso de corte, ya le cortaron el servicio, o no puede pagar una factura atrasada, el Central Valley Opportunity Center puede pagar hasta $1,500 de su factura de gas o luz, y puede ayudar con propano, leña o un calentador o aire acondicionado descompuesto, mientras haya fondos. Los mismos requisitos de ingresos y estatus que LIHEAP. Llame en cuanto reciba cualquier aviso.",
    },
  ],
  /** Help with past-due PG&E bills. */
  debt: [
    {
      id: "amp",
      cite: "PG&E: Arrearage Management Plan (AMP)",
      en: "PG&E's Arrearage Management Plan (AMP) can erase old debt, up to $8,000. You must be on CARE or FERA, owe at least $500 ($250 if you only have PG&E gas), be more than 90 days behind, have been with PG&E 6 months or more, and have made at least one on-time payment. Each time you pay your new bill in full and on time, 1/12 of the old debt is erased. If you miss a payment, pay it along with the next bill by its due date. Missing two in a row, or three in total, ends the plan; you keep what was already erased, but the rest is still owed, and you must wait 12 months to rejoin. Not for homes with rooftop solar (NEM) or master meters.",
      es: "El Plan de Manejo de Atrasos (AMP) de PG&E puede borrar deuda vieja, hasta $8,000. Tiene que estar en CARE o FERA, deber al menos $500 ($250 si solo tiene gas de PG&E), tener más de 90 días de atraso, tener 6 meses o más con PG&E y haber hecho al menos un pago a tiempo. Cada vez que paga su factura nueva completa y a tiempo, se borra 1/12 de la deuda vieja. Si falla un pago, páguelo junto con la siguiente factura antes de su fecha límite. Si falla dos seguidos, o tres en total, el plan se termina; no pierde lo que ya se borró, pero el resto se sigue debiendo, y debe esperar 12 meses para volver a entrar. No es para casas con paneles solares (NEM) ni con medidor maestro.",
    },
    {
      id: "reach",
      cite: "Stanislaus County: Utilities Assistance",
      en: "One-time help: PG&E’s REACH program (through the Salvation Army) and the Salvation Army Modesto Corps’ utility bill assistance, while funds last.",
      es: "Ayuda de una sola vez: el programa REACH de PG&E (por medio del Ejército de Salvación) y la ayuda con facturas del Ejército de Salvación de Modesto, mientras haya fondos.",
    },
  ],
  /** Medical rates: not about income, except MID's. */
  medical: [
    {
      id: "baseline",
      cite: "PG&E: Medical Baseline",
      en: "PG&E Medical Baseline: if someone at home uses medical equipment like a CPAP, dialysis machine, respirator or power wheelchair, or has a condition that needs heating or cooling, you get more energy each month at the lowest price (about 500 kWh and/or 25 therms). It isn’t based on income. A medical practitioner signs the form, and you renew every 2 years (every 4 years, with no doctor's signature, for a permanent condition).",
      es: "Medical Baseline de PG&E: si alguien en la casa usa equipo médico como CPAP, máquina de diálisis, respirador o silla de ruedas eléctrica, o tiene una condición que necesita calefacción o aire, recibe más energía cada mes al precio más bajo (unos 500 kWh y/o 25 termias). No depende de los ingresos. Un profesional médico firma la solicitud, y se renueva cada 2 años (cada 4 años, sin firma del médico, si la condición es permanente).",
    },
    {
      id: "tid-medical",
      cite: "TID: Medical Rate Program",
      en: "TID Medical Rate: half price on the first 500 kWh each month, for a life-support device or a condition that needs heating or air conditioning. Your doctor signs the application. You must be on TID's DE, DG or DT home rate.",
      es: "Tarifa Médica de TID: mitad de precio en los primeros 500 kWh cada mes, por un aparato de soporte vital o una condición que necesita calefacción o aire acondicionado. Su doctor firma la solicitud. Tiene que estar en la tarifa residencial DE, DG o DT de TID.",
    },
    {
      id: "mid-medical",
      cite: "MID: Medical Life Support Program",
      en: "MID Medical Life Support: half price on the first 500 kWh each billing cycle, for homes with a life-support device or a condition that needs heating or air conditioning, and household income at or below $8,717 a month (gross). Your doctor signs the application. Reapply every year. This rate does not stop a shutoff for an unpaid bill.",
      es: "Soporte Vital Médico de MID: mitad de precio en los primeros 500 kWh de cada ciclo de facturación, para casas con un aparato de soporte vital o una condición que necesita calefacción o aire acondicionado, e ingresos del hogar de $8,717 al mes o menos (brutos). Su doctor firma la solicitud. Hay que volver a solicitar cada año. Esta tarifa no evita un corte por factura sin pagar.",
    },
  ],
  scams: [
    {
      id: "scam-calls",
      cite: "PG&E: Scams",
      en: "PG&E never threatens to cut your power “within the hour” over the phone, and never asks you to pay with gift cards, MoneyPak, Venmo or Zelle. If you get a call like that, hang up and call PG&E at 1-833-500-7226 (1-833-500-SCAM). For MID or TID, hang up and call the number printed on your bill. PG&E will never ask for your financial information over the phone. If someone comes to your door, ask for ID and call 1-833-500-SCAM.",
      es: "PG&E nunca amenaza por teléfono con cortarle la luz “en una hora”, y nunca le pide pagar con tarjetas de regalo, MoneyPak, Venmo o Zelle. Si recibe una llamada así, cuelgue y llame a PG&E al 1-833-500-7226 (1-833-500-SCAM). Para MID o TID, cuelgue y llame al número impreso en su factura. PG&E nunca le pide información financiera por teléfono. Si alguien llega a su puerta, pida identificación y llame al 1-833-500-SCAM.",
    },
  ],
} satisfies Record<string, Fact[]>;

export interface UtilContact {
  name: Bilingual;
  phone?: string;
  url: string;
  note?: Bilingual;
}

export const UTIL_CONTACTS = {
  pge: { name: { en: "PG&E customer service", es: "Servicio al cliente de PG&E" }, phone: "1-800-743-5000", url: "https://www.pge.com/en/account/billing-and-assistance/financial-assistance.html" },
  pgeAssist: { name: { en: "PG&E CARE, FERA and AMP", es: "CARE, FERA y AMP de PG&E" }, phone: "1-877-660-6789", url: AMP },
  mid: { name: { en: "MID customer service", es: "Servicio al cliente de MID" }, phone: "(209) 526-7337", url: "https://www.mid.org/customer-service/payments-billing/financial-assistance/" },
  tid: { name: { en: "TID customer service", es: "Servicio al cliente de TID" }, phone: "(209) 883-8222", url: "https://www.tid.org/customer-service/payment-assistance-programs/" },
  cvoc: {
    name: { en: "Central Valley Opportunity Center (LIHEAP and crisis help)", es: "Central Valley Opportunity Center (LIHEAP y ayuda de emergencia)" },
    phone: "(209) 537-9217",
    url: "https://www.csd.ca.gov/Pages/FindServicesInYourArea.aspx?ct=Energy_Bill",
    note: { en: "3860 Brickit Court, Ceres. Call for hours.", es: "3860 Brickit Court, Ceres. Llame para saber el horario." },
  },
  salvation: { name: { en: "Salvation Army, Modesto (utility bill help)", es: "Ejército de Salvación, Modesto (ayuda con facturas)" }, phone: "(209) 523-7577", url: COUNTY },
  cpuc: { name: { en: "CPUC Consumer Affairs (complaints about PG&E)", es: "Asuntos del Consumidor de la CPUC (quejas sobre PG&E)" }, phone: "1-800-649-7570", url: CPUC_COMPLAINT },
} satisfies Record<string, UtilContact>;

/** Medical rate applications. */
export const MEDICAL_LINKS = {
  pge: MED_BASELINE,
  tid: TID_MEDICAL,
  mid: MID_MEDICAL,
} as const;

export const UTIL_SOURCES: SourceRef[] = [
  { label: "PG&E Electric Rule 11: Discontinuance and Restoration of Service (Advice 7782-E, effective Dec 17, 2025)", url: RULE_11 },
  { label: "CPUC: Overview of Bill Protections and Disconnection of Service (fact sheet)", url: CPUC_FACTS },
  { label: "CPUC Resolution E-5468 (July 16, 2026): 90°F heat protection for PG&E electric shutoffs (PDF)", url: CPUC_E5468 },
  { label: "PG&E Gas Rule 11: Discontinuance and Restoration of Service (Advice 5150-G)", url: GAS_RULE_11 },
  { label: "PG&E Electric Rule 8: Notices", url: RULE_8 },
  { label: "CSD: 2026 LIHEAP State Plan (crisis help, §4; PDF)", url: LIHEAP_PLAN },
  { label: "CPUC: CARE/FERA program (income limits Jun 1, 2026 – May 31, 2027)", url: "https://www.cpuc.ca.gov/industries-and-topics/electrical-energy/electric-costs/care-fera-program" },
  { label: "CPUC: File a utility complaint", url: CPUC_COMPLAINT },
  { label: "PG&E: Arrearage Management Plan (AMP)", url: AMP },
  { label: "PG&E: Medical Baseline", url: MED_BASELINE },
  { label: "PG&E: Scams", url: PGE_SCAMS },
  { label: "MID: Financial assistance, MID CARES and Medical Life Support", url: MID_MEDICAL },
  { label: "TID: CARES, Medical Rate and additional programs", url: TID_MORE },
  { label: "CSD: Find your energy bill assistance provider (Stanislaus County)", url: "https://www.csd.ca.gov/Pages/FindServicesInYourArea.aspx?ct=Energy_Bill" },
  { label: "CSD: LIHEAP income eligibility", url: "https://www.csd.ca.gov/Pages/LIHEAP-Income-Eligibility.aspx" },
  { label: "Stanislaus County: Utilities assistance programs", url: COUNTY },
];
