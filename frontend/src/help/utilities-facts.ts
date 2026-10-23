// Help with gas and electric bills in Stanislaus County: shutoff protections,
// payment plans, medical rates and scams, with citations. The income limits and
// discount programs (CARE, FERA, MID CARES, TID CARES, LIHEAP) are the Benefits
// screener's (benefits-facts.ts TABLES and PROGRAMS), so there's one source of
// truth. Researched 2026-10-23 from the CPUC, PG&E (Electric Rule 11, program
// pages), MID, TID, CSD and Stanislaus County; archive:
// ~/dev/outreach-help-2026-10/research/utilities.{json,md}.
//
// RE-CHECK by UTIL_RECHECK (upkeep.ts tracks it):
//  - the CPUC's July 2026 heat rule (90°F) in PG&E's Rule 11, and its winter rule;
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
const CALMATTERS = "https://calmatters.org/environment/2026/07/california-utility-heat-shutoff-rules-cpuc/";
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
      cite: "PG&E Electric Rule 11; CPUC fact sheet",
      en: "Before shutting off service for an unpaid bill, PG&E sends a 15-day notice, then a 48-hour notice, and tries to call you. Don’t wait for the last notice: call as soon as you get the first one.",
      es: "Antes de cortar el servicio por una factura sin pagar, PG&E manda un aviso de 15 días, luego un aviso de 48 horas, y trata de llamarle. No espere al último aviso: llame en cuanto reciba el primero.",
    },
    {
      id: "plan-24",
      cite: "PG&E Electric Rule 11 (C.1)",
      en: "If you tell PG&E you can’t pay, PG&E must offer you a payment plan that spreads what you owe over 24 months. Ask for it by name: a “payment arrangement”.",
      es: "Si le dice a PG&E que no puede pagar, PG&E tiene que ofrecerle un plan de pagos que reparte lo que debe en 24 meses. Pídalo por su nombre: un “payment arrangement” (arreglo de pagos).",
    },
    {
      id: "benefits-first",
      cite: "PG&E Electric Rule 11 (C.1)",
      en: "PG&E can’t shut you off for nonpayment until it has offered to enroll you in the PG&E programs you qualify for, like CARE or FERA.",
      es: "PG&E no puede cortarle el servicio por falta de pago hasta que le haya ofrecido inscribirle en los programas de PG&E para los que califica, como CARE o FERA.",
    },
    {
      id: "cold",
      cite: "PG&E Electric Rule 11; CPUC (July 2026)",
      en: "PG&E won’t shut off a home for an unpaid bill when it forecasts temperatures below 32°F within the next 72 hours. In summer, the CPUC lowered the heat limit from 100°F to 90°F in July 2026. These rules only pause a shutoff; the bill is still owed.",
      es: "PG&E no corta el servicio de una casa por una factura sin pagar cuando pronostica temperaturas bajo 32°F en las próximas 72 horas. En verano, la CPUC bajó el límite de calor de 100°F a 90°F en julio de 2026. Estas reglas solo detienen el corte; la factura se sigue debiendo.",
    },
    {
      id: "medical-visit",
      cite: "PG&E Electric Rule 11 (C.1)",
      en: "If someone in the home is on Medical Baseline or life support, or has told PG&E they have a serious illness that could become life-threatening without power, PG&E must visit in person before shutting off service.",
      es: "Si alguien en la casa está en Medical Baseline o usa soporte vital, o le dijo a PG&E que tiene una enfermedad grave que podría poner su vida en peligro sin electricidad, PG&E tiene que visitar en persona antes de cortar el servicio.",
    },
    {
      id: "complaint",
      cite: "CPUC Consumer Affairs",
      en: "If you and PG&E can’t agree on a payment plan, you can file a complaint with the CPUC (free) at 1-800-649-7570 or online. Ask them how to keep your service on while they review it.",
      es: "Si usted y PG&E no se ponen de acuerdo en un plan de pagos, puede presentar una queja ante la CPUC (gratis) al 1-800-649-7570 o en internet. Pregunte cómo mantener su servicio mientras la revisan.",
    },
    {
      id: "mid-tid",
      cite: "MID; TID",
      en: "MID or TID notice? Call the number on your bill right away and ask for a payment arrangement. TID offers payment arrangements through My TID or customer service; MID has a Budget Payment Plan that evens out your bill.",
      es: "¿Aviso de MID o TID? Llame enseguida al número de su factura y pida un arreglo de pagos. TID ofrece arreglos de pago por My TID o servicio al cliente; MID tiene un Plan de Pagos Nivelados (Budget Payment Plan) que empareja su factura.",
    },
    {
      id: "ecip",
      cite: "TID: Additional Programs; CSD",
      en: "Crisis help (ECIP): if you got a 48-hour shutoff notice (or a 15-day notice if you’re a senior or have a disability), the Central Valley Opportunity Center may make one payment a year to your utility, and can help with propane, firewood or a broken heater. Same eligibility as LIHEAP.",
      es: "Ayuda de emergencia (ECIP): si recibió un aviso de corte de 48 horas (o de 15 días si es persona mayor o tiene una discapacidad), el Central Valley Opportunity Center puede hacer un pago al año a su compañía, y puede ayudar con propano, leña o un calentador descompuesto. Los mismos requisitos que LIHEAP.",
    },
  ],
  /** Help with past-due PG&E bills. */
  debt: [
    {
      id: "amp",
      cite: "PG&E: Arrearage Management Plan (AMP)",
      en: "PG&E’s Arrearage Management Plan (AMP) can erase old debt. For CARE or FERA customers who owe at least $500 ($250 if you only have PG&E gas) and are more than 90 days behind: pay your new bill on time for 12 months and the old debt is forgiven, up to $8,000. You’ve been with PG&E 6 months or more, and made at least one on-time payment. Missing two payments in a row, or three in total, ends the plan.",
      es: "El Plan de Manejo de Atrasos (AMP) de PG&E puede borrar deuda vieja. Para clientes de CARE o FERA que deben al menos $500 ($250 si solo tienen gas de PG&E) y tienen más de 90 días de atraso: pague su factura nueva a tiempo por 12 meses y se le perdona la deuda vieja, hasta $8,000. Debe tener 6 meses o más con PG&E y haber hecho al menos un pago a tiempo. Si falla dos pagos seguidos, o tres en total, el plan se termina.",
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
      en: "PG&E Medical Baseline: if someone at home uses medical equipment like a CPAP, dialysis machine, respirator or power wheelchair, or has a condition that needs heating or cooling, you get more energy each month at the lowest price (about 500 kWh and/or 25 therms). It isn’t based on income. A medical practitioner signs the form, and you renew every 2 years.",
      es: "Medical Baseline de PG&E: si alguien en la casa usa equipo médico como CPAP, máquina de diálisis, respirador o silla de ruedas eléctrica, o tiene una condición que necesita calefacción o aire, recibe más energía cada mes al precio más bajo (unos 500 kWh y/o 25 termias). No depende de los ingresos. Un profesional médico firma la solicitud, y se renueva cada 2 años.",
    },
    {
      id: "tid-medical",
      cite: "TID: Medical Rate Program",
      en: "TID Medical Rate: half price on the first 500 kWh each month, for a life-support device or a condition that needs heating or air conditioning. Your doctor signs the application.",
      es: "Tarifa Médica de TID: mitad de precio en los primeros 500 kWh cada mes, por un aparato de soporte vital o una condición que necesita calefacción o aire acondicionado. Su doctor firma la solicitud.",
    },
    {
      id: "mid-medical",
      cite: "MID: Medical Life Support Program",
      en: "MID Medical Life Support: half price on the first 500 kWh each billing cycle, for homes with a life-support device or a condition that needs heating or air conditioning, and household income at or below $8,717 a month (gross). Your doctor signs the application.",
      es: "Soporte Vital Médico de MID: mitad de precio en los primeros 500 kWh de cada ciclo de facturación, para casas con un aparato de soporte vital o una condición que necesita calefacción o aire acondicionado, e ingresos del hogar de $8,717 al mes o menos (brutos). Su doctor firma la solicitud.",
    },
  ],
  scams: [
    {
      id: "scam-calls",
      cite: "PG&E: Scams",
      en: "PG&E never threatens to cut your power “within the hour” over the phone, and never asks you to pay with gift cards, MoneyPak, Venmo or Zelle. If you get a call like that, hang up and call PG&E at 1-833-500-7226 (1-833-500-SCAM). For MID or TID, hang up and call the number printed on your bill.",
      es: "PG&E nunca amenaza por teléfono con cortarle la luz “en una hora”, y nunca le pide pagar con tarjetas de regalo, MoneyPak, Venmo o Zelle. Si recibe una llamada así, cuelgue y llame a PG&E al 1-833-500-7226 (1-833-500-SCAM). Para MID o TID, cuelgue y llame al número impreso en su factura.",
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
  tid: { name: { en: "TID customer service", es: "Servicio al cliente de TID" }, phone: "(209) 883-8222", url: "https://www.tid.org/customer-service/payment-assistance/" },
  cvoc: {
    name: { en: "Central Valley Opportunity Center (LIHEAP and crisis help)", es: "Central Valley Opportunity Center (LIHEAP y ayuda de emergencia)" },
    phone: "(209) 537-9217",
    url: "https://www.csd.ca.gov/Pages/FindServicesInYourArea.aspx?ct=Energy_Bill",
    note: { en: "3860 Brickit Court, Ceres. Monday–Friday 7:30–4:00 (state listing).", es: "3860 Brickit Court, Ceres. Lunes a viernes de 7:30 a 4:00 (lista del estado)." },
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
  { label: "CalMatters: CPUC lowers the heat threshold for shutoffs (July 2026)", url: CALMATTERS },
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
