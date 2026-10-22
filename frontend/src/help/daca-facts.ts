// DACA renewal: where the program stands, when and how to renew, the fees,
// and the travel warning, with citations. Researched 2026-10-22 from USCIS
// (the DACA page, Form I-821D and I-765 pages and instructions, the DACA FAQ,
// fee schedule G-1055 edition 10/16/26, the fee exemption guidance, the Form
// I-131 alert on Matter of Delcarmen-Lara), the June 5, 2026 proposed rule
// (91 FR 34352) and, for the Texas case, the National Immigration Forum and
// FWD.us. The research archive is ~/dev/outreach-help-2026-10/research/daca.{json,md}.
//
// RE-CHECK MONTHLY (upkeep.ts tracks DACA_RECHECK): DACA is in court. Watch
// for an order from Judge Hanen in Texas v. United States (S.D. Tex.
// 1:18-cv-68), any change to renewals or initial requests on uscis.gov/DACA,
// a final version of the June 2026 work-permit rule (RIN 1615-AC98), and new
// fees in G-1055. Tests (e2e/tests/unit-daca.spec.ts) check the window math.
import type { Fact } from "./facts";
import type { SourceRef } from "../components/help/ui";
import type { Bilingual } from "./letter-types";

export const DACA_CHECKED = "2026-10-22";
export const DACA_RECHECK = "2026-11-22";

/** USCIS fee schedule G-1055, edition 10/16/26, in dollars. */
export const DACA_FEES = { i821d: 85, i765Online: 470, i765Paper: 520 } as const;
const online = DACA_FEES.i821d + DACA_FEES.i765Online;
const paper = DACA_FEES.i821d + DACA_FEES.i765Paper;

export const DACA_LINKS = {
  uscis: "https://www.uscis.gov/DACA",
  uscisEs: "https://www.uscis.gov/es/DACA",
  i821d: "https://www.uscis.gov/i-821d",
  fileOnline: "https://my.uscis.gov/",
  faq: "https://www.uscis.gov/humanitarian/consideration-of-deferred-action-for-childhood-arrivals-daca/frequently-asked-questions",
} as const;

const FAQ_CITE = "USCIS DACA Frequently Asked Questions";

export const DACA_FACTS = {
  status: [
    {
      id: "renewals",
      cite: "USCIS, DACA page (after the Jan. 17, 2025 court decision)",
      en: "USCIS is accepting and deciding DACA renewal requests.",
      es: "USCIS sigue aceptando y procesando las peticiones de renovación de DACA.",
    },
    {
      id: "initial",
      cite: "USCIS, DACA page; court order of July 16, 2021",
      en: "First-time (initial) requests: USCIS accepts them but is not deciding them, because of a court order.",
      es: "Peticiones iniciales (por primera vez): USCIS las acepta, pero no las está procesando, por una orden de la corte.",
    },
    {
      id: "valid",
      cite: "USCIS, DACA page",
      en: "Your current DACA and work permit stay valid until they expire, unless USCIS ends your DACA individually.",
      es: "Su DACA y su permiso de trabajo actuales siguen siendo válidos hasta que caduquen, a menos que USCIS cancele su DACA en su caso.",
    },
    {
      id: "texas",
      cite: "Texas v. United States (5th Cir., Jan. 17, 2025); National Immigration Forum; no new order found as of Oct. 22, 2026",
      en: "In the Texas court case, the appeals court said DACA work permits can be stopped, but only in Texas, and sent the case back to the judge there. That judge has not yet issued a new order (we found none as of October 22, 2026), and renewals continue everywhere, Texas included.",
      es: "En el caso de la corte de Texas, la corte de apelaciones dijo que se pueden detener los permisos de trabajo de DACA, pero solo en Texas, y regresó el caso al juez de allá. Ese juez todavía no ha dado una nueva orden (no encontramos ninguna al 22 de octubre de 2026), y las renovaciones siguen en todo el país, incluido Texas.",
    },
    {
      id: "proposed-rule",
      cite: "DHS proposed rule, 91 FR 34352 (June 5, 2026)",
      en: "A rule the government proposed in June 2026 would add rules on criminal history and fingerprints (biometrics) for work permits, DACA's included. It is only a proposal and is not in effect.",
      es: "Una regla que el gobierno propuso en junio de 2026 agregaría reglas sobre antecedentes penales y huellas (datos biométricos) para los permisos de trabajo, incluidos los de DACA. Es solo una propuesta y no está vigente.",
    },
  ],
  timing: [
    {
      id: "window",
      cite: "USCIS, Form I-821D page and instructions",
      en: "USCIS strongly encourages filing your renewal 120 to 150 days (4 to 5 months) before your DACA expires. Filing earlier won't get you a faster decision, and USCIS may send back a request filed more than 150 days early.",
      es: "USCIS recomienda enfáticamente presentar su renovación entre 120 y 150 días (de 4 a 5 meses) antes de que caduque su DACA. Presentarla antes no le dará una decisión más rápida, y USCIS puede devolver una petición presentada más de 150 días antes.",
    },
    {
      id: "processing",
      cite: "USCIS, Form I-821D page (updated June 1, 2026)",
      en: "USCIS says it decides most DACA renewals within 120 days.",
      es: "USCIS dice que decide la mayoría de las renovaciones de DACA en 120 días.",
    },
    {
      id: "lapse",
      cite: `${FAQ_CITE}, Q55`,
      en: "There is no automatic extension. If your DACA expires before the renewal is approved, you can't work until you get the new work permit. And unless you were under 18 when you filed the renewal, you build up “unlawful presence” for the days in between.",
      es: "No hay extensión automática. Si su DACA caduca antes de que aprueben la renovación, no puede trabajar hasta recibir el nuevo permiso de trabajo. Y, a menos que tuviera menos de 18 años cuando presentó la renovación, acumula “presencia ilegal” por los días entre uno y otro.",
    },
    {
      id: "one-year",
      cite: `${FAQ_CITE}, Q53; Form I-821D instructions`,
      en: "If your DACA already expired, you can still file a renewal within one year after it expired, if USCIS did not end it. After one year, you would have to file a new initial request, and USCIS is not deciding those now.",
      es: "Si su DACA ya caducó, todavía puede presentar una renovación dentro de un año después de que caducó, si USCIS no la canceló. Después de un año, tendría que presentar una nueva petición inicial, y USCIS no las está decidiendo ahora.",
    },
  ],
  gather: [
    {
      id: "forms",
      cite: "USCIS, Form I-821D instructions (edition 01/20/25)",
      en: "Form I-821D, Form I-765 and the Form I-765WS worksheet, all sent together. You can file online with a free USCIS account, or by mail.",
      es: "El formulario I-821D, el formulario I-765 y la hoja de trabajo I-765WS, todos juntos. Puede presentarlos en línea con una cuenta gratis de USCIS, o por correo.",
    },
    {
      id: "ead-copy",
      cite: "USCIS, Form I-765 instructions (edition 08/21/25)",
      en: "A copy of your current work permit (EAD), front and back.",
      es: "Una copia de su permiso de trabajo (EAD) actual, por los dos lados.",
    },
    {
      id: "photos",
      cite: "USCIS, Form I-765 instructions (edition 08/21/25)",
      en: "By mail: two identical color passport-style photos (2 by 2 inches), with your name and A-Number lightly written in pencil on the back.",
      es: "Por correo: dos fotos a color idénticas, tipo pasaporte (2 por 2 pulgadas), con su nombre y su número A escritos suavemente con lápiz por detrás.",
    },
    {
      id: "new-papers",
      cite: "USCIS, Form I-821D instructions (edition 01/20/25)",
      en: "Only new papers you haven't sent before about immigration court (removal proceedings) or any arrest, charge or conviction. Minor traffic tickets aren't needed unless alcohol or drugs were involved. If any of this happened since your last request, talk to a legal service before you file.",
      es: "Solo los papeles nuevos que no haya enviado antes sobre la corte de inmigración (proceso de deportación) o cualquier arresto, cargo o condena. No hacen falta las multas de tránsito menores, a menos que hubiera alcohol o drogas. Si algo de esto pasó desde su última petición, hable con un servicio legal antes de presentar.",
    },
    {
      id: "address",
      cite: "USCIS, Filing Addresses for Form I-821D; Form I-765 instructions (08/21/25)",
      en: "If you mail it, send all the forms together in one package to the address on USCIS’s “Filing Addresses for Form I-821D” page. Don’t send Form I-765 by itself to the Form I-765 address. Check the address right before you mail it.",
      es: "Si la manda por correo, envíe todos los formularios juntos en un solo paquete a la dirección de la página “Filing Addresses for Form I-821D” de USCIS. No mande el formulario I-765 por separado a la dirección del I-765. Revise la dirección justo antes de enviarla.",
    },
  ],
  fees: [
    {
      id: "fee",
      cite: "USCIS Fee Schedule, Form G-1055 (edition 10/16/26)",
      en: `The fee is $${online} online ($${DACA_FEES.i821d} for Form I-821D plus $${DACA_FEES.i765Online} for Form I-765), or $${paper} by mail ($${DACA_FEES.i821d} plus $${DACA_FEES.i765Paper}).`,
      es: `La cuota es de $${online} en línea ($${DACA_FEES.i821d} del formulario I-821D más $${DACA_FEES.i765Online} del formulario I-765), o de $${paper} por correo ($${DACA_FEES.i821d} más $${DACA_FEES.i765Paper}).`,
    },
    {
      id: "exemption",
      cite: "USCIS, DACA fee exemption guidance",
      en: "There is no regular fee waiver for DACA. A few people with income under 150% of the poverty level can ask for an exemption: people under 18 who are homeless, in foster care or without family support; people who can’t care for themselves because of a serious chronic disability; and people with $10,000 or more in debt from the last 12 months for unreimbursed medical costs (their own or an immediate family member’s). It must be requested by letter and approved before you file.",
      es: "No hay una dispensa de cuotas (fee waiver) regular para DACA. Algunas personas con ingresos por debajo del 150% del nivel de pobreza pueden pedir una exención: menores de 18 años sin hogar, en hogar de crianza o sin apoyo familiar; personas que no pueden cuidarse solas por una discapacidad crónica grave; y personas con $10,000 o más en deudas de los últimos 12 meses por gastos médicos no reembolsados (propios o de un familiar inmediato). Hay que pedirla por carta y que la aprueben antes de presentar.",
    },
  ],
  travel: [
    {
      id: "travel",
      cite: "USCIS, Form I-131 page (Matter of Delcarmen-Lara, 29 I&N Dec. 830, BIA Aug. 13, 2026); USCIS DACA FAQ, Q61",
      en: "Don't leave the United States, even with advance parole (a travel permit), before talking to an immigration lawyer. Since August 13, 2026, a trip on advance parole can trigger a 3- or 10-year bar for people who had more than 180 days of “unlawful presence” before (time without status after turning 18). Leaving without advance parole can end your DACA, keep you from renewing it, and you may not be let back in.",
      es: "No salga de Estados Unidos, ni siquiera con advance parole (permiso de viaje), sin hablar antes con un abogado de inmigración. Desde el 13 de agosto de 2026, un viaje con advance parole puede causar un castigo de 3 o 10 años para quienes acumularon más de 180 días de “presencia ilegal” antes (tiempo sin estatus después de cumplir 18 años). Salir sin advance parole puede terminar su DACA, impedir que la renueve, y puede que no lo dejen regresar.",
    },
  ],
} satisfies Record<string, Fact[]>;

/** Local nonprofits whose own pages list DACA renewal help. */
export const DACA_HELP: { name: Bilingual; phone: string; address: string; note: Bilingual; url: string }[] = [
  {
    name: { en: "Catholic Charities, Modesto: DACA renewals", es: "Catholic Charities, Modesto: renovaciones de DACA" },
    phone: "(209) 444-5910",
    address: "1506 H Street, Modesto",
    note: { en: "By appointment only. Call to ask about cost.", es: "Solo con cita. Llame para preguntar el costo." },
    url: "https://www.ccstockton.org/immigration-services",
  },
  {
    name: { en: "IRC in Turlock: DACA renewals, low-cost legal help", es: "IRC en Turlock: renovaciones de DACA, ayuda legal de bajo costo" },
    phone: "(209) 667-2378",
    address: "3446 N Golden State Blvd, Suite A, Turlock",
    note: { en: "Call to ask about an appointment.", es: "Llame para pedir una cita." },
    url: "https://www.rescue.org/united-states/turlock-ca",
  },
];

export const DACA_SOURCES: SourceRef[] = [
  { label: "USCIS: Consideration of Deferred Action for Childhood Arrivals (DACA)", url: DACA_LINKS.uscis },
  { label: "USCIS: DACA (en español)", url: DACA_LINKS.uscisEs },
  { label: "USCIS: Form I-821D (alerts, filing, where to file)", url: DACA_LINKS.i821d },
  { label: "USCIS: Form I-821D instructions (PDF)", url: "https://www.uscis.gov/sites/default/files/document/forms/i-821dinstr.pdf" },
  { label: "USCIS: Form I-765 instructions (PDF)", url: "https://www.uscis.gov/sites/default/files/document/forms/i-765instr.pdf" },
  { label: "USCIS: DACA Frequently Asked Questions", url: DACA_LINKS.faq },
  { label: "USCIS: Fee Schedule, Form G-1055", url: "https://www.uscis.gov/g-1055" },
  { label: "USCIS: DACA fee exemption guidance", url: "https://www.uscis.gov/forms/filing-fees/guidance-for-an-exemption-from-the-fees-for-a-form-i-821d-consideration-of-deferred-action-for" },
  { label: "USCIS: Form I-131 (advance parole alert)", url: "https://www.uscis.gov/i-131" },
  { label: "Federal Register: proposed rule on work permits, June 5, 2026 (PDF)", url: "https://www.govinfo.gov/content/pkg/FR-2026-06-05/pdf/2026-11285.pdf" },
  { label: "National Immigration Forum: Current status of DACA", url: "https://forumtogether.org/article/current-status-of-daca-explainer/" },
];
