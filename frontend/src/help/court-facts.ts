// Immigration court: finding your hearing, which court, moving, missing a
// hearing, lawyers, what changed in 2025–26, and scams, with citations.
// Researched 2026-10-23 from EOIR (court pages, the operational status page,
// the Immigration Court Online Resource, the self-help guides "Have You Moved?"
// and "Did You Miss Your Hearing?", the April 10 and May 1, 2026 notices on the
// San Francisco court, the 2022 scam alert), USCIS (AR-11), ILRC and AILA
// (expedited removal), and dated news reports (courthouse arrests). Facts
// shared with the rights page (the case-status line, ACIS, notarios) are reused
// from rights-facts.ts, not copied. Research archive:
// ~/dev/outreach-help-2026-10/research/court.{json,md}.
//
// RE-CHECK MONTHLY (upkeep.ts tracks COURT_RECHECK): the courthouse-arrest case
// (Pablo Sequen v. Albarran, N.D. Cal. 25-cv-06487-PCP, on appeal), the
// expedited removal case (Make the Road New York v. Mullin, D.C. Cir.), any
// further changes to the Bay Area courts, and EOIR's interpreter policy.
import type { Fact } from "./facts";
import type { SourceRef } from "../components/help/ui";
import type { Bilingual } from "./letter-types";

export const COURT_CHECKED = "2026-10-23";
export const COURT_RECHECK = "2026-11-23";

export const COURT_LINKS = {
  acis: "https://acis.eoir.justice.gov/en/",
  acisEs: "https://acis.eoir.justice.gov/es/",
  respondentPortal: "https://respondentaccess.eoir.justice.gov/",
  eService: "https://eserviceregistration.ice.gov/",
  ar11: "https://www.uscis.gov/ar-11",
  proBono: "https://www.justice.gov/eoir/List-of-Pro-Bono-Legal-Service-Providers-icor",
  legalRep: "https://www.justice.gov/eoir/legal-representation-icor",
  status: "https://www.justice.gov/eoir/immigration-court-operational-status",
} as const;

const MOVED = "EOIR Self-Help Guide, “Have You Moved?” (with Form EOIR-33/IC)";
const MISSED = "EOIR Self-Help Guide, “Did You Miss Your Hearing?” (Jan. 2022)";
const ICOR = "EOIR, Immigration Court Online Resource: Legal Representation";

export const COURT_FACTS = {
  find: [
    {
      id: "notice",
      cite: "EOIR, Automated Case Information; Immigration Court Online Resource",
      en: "Your hearing notice from the immigration court says which court has your case, the date and time, and whether the hearing is in person or by video. The court’s own papers are the official record; the phone line and the website are only for convenience.",
      es: "Su aviso de audiencia de la corte de inmigración dice qué corte tiene su caso, la fecha y la hora, y si la audiencia es en persona o por video. Los papeles de la corte son el registro oficial; la línea telefónica y el sitio web son solo para su comodidad.",
    },
    {
      id: "in-person",
      cite: "EOIR, Find an Immigration Court and Access Internet-Based Hearings",
      en: "If you don’t have a lawyer or accredited representative, your hearing is in person unless the court tells you otherwise. If you aren’t sure whether it is in person or by video, call the court that has your case.",
      es: "Si no tiene abogado ni representante acreditado, su audiencia es en persona, a menos que la corte le diga otra cosa. Si no está seguro de si es en persona o por video, llame a la corte que tiene su caso.",
    },
  ],
  courts: [
    {
      id: "no-local-court",
      cite: "EOIR, Immigration Court Operational Status",
      en: "There is no immigration court in Stanislaus County. Your notice says which court has your case; the closest are in Sacramento and Concord.",
      es: "No hay corte de inmigración en el condado de Stanislaus. Su aviso dice qué corte tiene su caso; las más cercanas están en Sacramento y Concord.",
    },
    {
      id: "sf-closed",
      cite: "EOIR notices of April 10 and May 1, 2026",
      en: "The San Francisco Immigration Court closed for good on September 4, 2026. Its Sansome Street location (630 Sansome Street) is now a hearing location run by the Concord Immigration Court, and EOIR said it would send new hearing notices to people whose cases moved. If your case was in San Francisco, check your newest notice or call 1-800-898-7180.",
      es: "La Corte de Inmigración de San Francisco cerró definitivamente el 4 de septiembre de 2026. Su sede de Sansome Street (630 Sansome Street) ahora es un lugar de audiencias de la Corte de Inmigración de Concord, y EOIR dijo que enviaría nuevos avisos de audiencia a las personas cuyos casos cambiaron. Si su caso estaba en San Francisco, revise su aviso más reciente o llame al 1-800-898-7180.",
    },
  ],
  move: [
    {
      id: "eoir33",
      cite: MOVED,
      en: "Moved? Tell the immigration court within 5 working days, on Form EOIR-33/IC: online in EOIR’s Respondent Portal, in person, or by mail. Give a copy to DHS too (ICE’s eService portal, by mail, or in person). Each person with a case needs their own form. The court sends notices and decisions to the address it has, so if it has your old address, you may never see them.",
      es: "¿Se mudó? Avísele a la corte de inmigración dentro de 5 días hábiles, con el formulario EOIR-33/IC: en línea en el Portal para Demandados (Respondent Portal) de EOIR, en persona o por correo. Dele una copia también al DHS (por el portal eService de ICE, por correo o en persona). Cada persona con un caso necesita su propio formulario. La corte manda los avisos y las decisiones a la dirección que tiene; si tiene su dirección vieja, puede que nunca los vea.",
    },
    {
      id: "ar11",
      cite: "USCIS, Form AR-11",
      en: "USCIS also requires most noncitizens to report a move within 10 days (Form AR-11; doing it online is easiest). The immigration court has its own form (above): do both.",
      es: "USCIS también exige que la mayoría de los no ciudadanos reporten una mudanza dentro de 10 días (formulario AR-11; es más fácil en línea). La corte de inmigración tiene su propio formulario (arriba): haga los dos.",
    },
    {
      id: "venue",
      cite: MOVED,
      en: "Moving doesn’t move your case. Until the judge approves a request to change venue (move the case to another court), you must go to every hearing at the court that has it now.",
      es: "Mudarse no cambia su caso de corte. Hasta que el juez apruebe una petición de cambio de sede (mover el caso a otra corte), tiene que ir a todas las audiencias en la corte que lo tiene ahora.",
    },
  ],
  missed: [
    {
      id: "attend",
      cite: ICOR,
      en: "EOIR says you are responsible for attending all of your court hearings.",
      es: "EOIR dice que usted es responsable de asistir a todas sus audiencias en la corte.",
    },
    {
      id: "absentia",
      cite: MISSED,
      en: "If you miss a hearing, the judge can order you deported without you there (an “in absentia” order). EOIR’s guide says it may not be too late to ask the judge to reopen the case, but there are strict deadlines. Call 1-800-898-7180 to find out whether there is an order, and talk to a lawyer or accredited representative right away.",
      es: "Si falta a una audiencia, el juez puede ordenar su deportación sin que usted esté presente (una orden “in absentia”). La guía de EOIR dice que tal vez no sea demasiado tarde para pedirle al juez que reabra el caso, pero hay plazos estrictos. Llame al 1-800-898-7180 para saber si hay una orden, y hable de inmediato con un abogado o un representante acreditado.",
    },
  ],
  lawyer: [
    {
      id: "no-cost",
      cite: ICOR,
      en: "You have the right to a lawyer in immigration court, but “at no cost to the government”: the government does not give you one. You can hire one, find free help, or represent yourself.",
      es: "Tiene derecho a un abogado en la corte de inmigración, pero “sin costo para el gobierno”: el gobierno no le da uno. Puede contratar uno, buscar ayuda gratis o representarse a sí mismo.",
    },
    {
      id: "pro-bono",
      cite: "EOIR, List of Pro Bono Legal Service Providers",
      en: "EOIR keeps a List of Pro Bono Legal Service Providers: nonprofits and lawyers willing to help for free in immigration court, listed by court.",
      es: "EOIR tiene una Lista de Proveedores de Servicios Legales Gratuitos (Pro Bono): organizaciones sin fines de lucro y abogados dispuestos a ayudar gratis en la corte de inmigración, por corte.",
    },
    {
      id: "who-represents",
      cite: ICOR,
      en: "Notarios, immigration consultants and visa specialists can’t represent you in immigration court. Before you hire a lawyer, check that they aren’t on EOIR’s List of Disciplined Practitioners.",
      es: "Los notarios, consultores de inmigración y especialistas en visas no pueden representarlo en la corte de inmigración. Antes de contratar a un abogado, revise que no esté en la Lista de Profesionales Sancionados de EOIR.",
    },
  ],
  changes: [
    {
      id: "expedited",
      cite: "ILRC, Toolkit on Expanded Expedited Removal (Feb. 2025); AILA (July 20, 2026)",
      en: "Since January 2025, the government has used “expedited removal” (deportation without a hearing before a judge) for some people anywhere in the U.S.: people who entered without being inspected and can’t show they have been here at least two years. A federal appeals court let this take effect in July 2026, and the lawsuit continues. People who entered with a visa or other papers still get a hearing before a judge, according to ILRC.",
      es: "Desde enero de 2025, el gobierno usa la “deportación acelerada” (expedited removal: deportación sin audiencia ante un juez) para algunas personas en cualquier parte del país: quienes entraron sin ser inspeccionados y no pueden demostrar que llevan al menos dos años aquí. Una corte federal de apelaciones permitió que esto entrara en vigor en julio de 2026, y la demanda sigue. Según ILRC, quienes entraron con visa u otros documentos todavía tienen derecho a una audiencia ante un juez.",
    },
    {
      id: "court-arrests",
      cite: "SF Standard (May 31, 2025); KRON4 (2025); CBS San Francisco (June 24, 2026)",
      en: "In 2025, news reports described government lawyers asking judges to dismiss cases and ICE arresting people at or near immigration courts, including in San Francisco, Concord and Sacramento, to put them in expedited removal. In June 2026, a federal judge in San Jose set aside ICE’s courthouse-arrest policies, and news reports said the ruling applies while the case goes on. The government can appeal and rulings can change, so this doesn’t mean an arrest can’t happen.",
      es: "En 2025, noticias informaron que abogados del gobierno pedían a los jueces cerrar casos y que ICE arrestaba a personas en o cerca de las cortes de inmigración, incluidas las de San Francisco, Concord y Sacramento, para ponerlas en deportación acelerada. En junio de 2026, un juez federal en San José anuló las políticas de ICE sobre arrestos en las cortes, y según las noticias el fallo aplica mientras sigue el caso. El gobierno puede apelar y los fallos pueden cambiar, así que esto no significa que no pueda haber un arresto.",
    },
    {
      id: "before-court",
      cite: "California Attorney General; ILRC Family Preparedness Plan",
      en: "The California Attorney General advises talking to a lawyer before a court date. Groups like ILRC also recommend making a family plan ahead of time.",
      es: "El Fiscal General de California aconseja hablar con un abogado antes de una fecha en la corte. Organizaciones como ILRC también recomiendan hacer un plan familiar con anticipación.",
    },
  ],
  scams: [
    {
      id: "fake-calls",
      cite: "EOIR, scam alerts (2021 and 2022)",
      en: "EOIR says its staff do not call people to ask for money, and scammers have faked court phone numbers. Don’t give personal information to callers you don’t know. Check your case only through 1-800-898-7180 or EOIR’s website.",
      es: "EOIR dice que su personal no llama para pedir dinero, y que los estafadores han falsificado números de teléfono de las cortes. No dé información personal a quien no conoce. Revise su caso solo por el 1-800-898-7180 o el sitio web de EOIR.",
    },
  ],
} satisfies Record<string, Fact[]>;

/** The immigration courts nearest Stanislaus County (EOIR court pages). */
export const COURTS: { name: Bilingual; phone: string; address: string; hours: Bilingual; url: string }[] = [
  {
    name: { en: "Sacramento Immigration Court", es: "Corte de Inmigración de Sacramento" },
    phone: "(916) 447-9301",
    address: "John E. Moss Federal Building, 650 Capitol Mall, Suite 4-200, Sacramento, CA 95814",
    hours: { en: "Mon–Fri 8 a.m.–4:30 p.m.; filing window 8 a.m.–4 p.m.", es: "Lun–vie 8 a.m.–4:30 p.m.; ventanilla de trámites 8 a.m.–4 p.m." },
    url: "https://www.justice.gov/eoir/sacramento-immigration-court",
  },
  {
    name: { en: "Concord Immigration Court", es: "Corte de Inmigración de Concord" },
    phone: "(925) 680-9015",
    address: "1855 Gateway Boulevard, Suite 850, Concord, CA 94520",
    hours: { en: "Mon–Fri 8 a.m.–4:30 p.m.; filing window 8 a.m.–4 p.m.", es: "Lun–vie 8 a.m.–4:30 p.m.; ventanilla de trámites 8 a.m.–4 p.m." },
    url: "https://www.justice.gov/eoir/concord-immigration-court",
  },
];

/** DOJ-recognized nonprofits near Modesto (EOIR roster, Oct. 18, 2026). Being
 *  recognized doesn't mean they take court cases: people are told to ask. */
export const COURT_HELP: { name: Bilingual; phone: string; address: string; url: string }[] = [
  {
    name: { en: "World Relief Modesto", es: "World Relief Modesto" },
    phone: "(209) 491-2712",
    address: "909 14th Street, Modesto",
    url: "https://worldrelief.org/modesto/",
  },
  {
    name: { en: "International Rescue Committee (IRC), Turlock", es: "Comité Internacional de Rescate (IRC), Turlock" },
    phone: "(209) 667-2378",
    address: "3446 N Golden State Blvd, Suite A, Turlock",
    url: "https://www.rescue.org/united-states/turlock-ca",
  },
  {
    name: { en: "Catholic Charities, Modesto (immigration services)", es: "Catholic Charities, Modesto (servicios de inmigración)" },
    phone: "(209) 444-5910",
    address: "1506 H Street, Modesto",
    url: "https://www.ccstockton.org/immigration-services",
  },
];

export const COURT_SOURCES: SourceRef[] = [
  { label: "EOIR: Automated Case Information (ACIS)", url: COURT_LINKS.acis },
  { label: "EOIR: Immigration Court Operational Status", url: COURT_LINKS.status },
  { label: "EOIR: Sacramento Immigration Court", url: "https://www.justice.gov/eoir/sacramento-immigration-court" },
  { label: "EOIR: Concord Immigration Court", url: "https://www.justice.gov/eoir/concord-immigration-court" },
  { label: "EOIR notice: San Francisco Immigration Court to close (May 1, 2026, PDF)", url: "https://www.justice.gov/eoir/media/1439236/dl?inline" },
  { label: "EOIR notice: San Francisco Montgomery Street hearings end (April 10, 2026, PDF)", url: "https://www.justice.gov/eoir/media/1435656/dl?inline" },
  { label: "EOIR: Find an Immigration Court and Access Internet-Based Hearings", url: "https://www.justice.gov/eoir/find-immigration-court-and-access-internet-based-hearings" },
  { label: "EOIR: Legal Representation (Immigration Court Online Resource)", url: COURT_LINKS.legalRep },
  { label: "EOIR: List of Pro Bono Legal Service Providers", url: COURT_LINKS.proBono },
  { label: "EOIR Self-Help Guide: Have You Moved? (PDF)", url: "https://www.justice.gov/eoir/page/file/1480756/dl" },
  { label: "EOIR Self-Help Guide: Did You Miss Your Hearing? (PDF)", url: "https://www.justice.gov/media/1211386/dl" },
  { label: "EOIR Respondent Portal (change of address online)", url: COURT_LINKS.respondentPortal },
  { label: "USCIS: Form AR-11, change of address", url: COURT_LINKS.ar11 },
  { label: "EOIR: scam alert about faked court phone numbers (2022)", url: "https://www.justice.gov/eoir/pr/eoir-warns-scammers-spoofing-agency-phone-number" },
  { label: "ILRC: Toolkit to Assist People Facing Expanded Expedited Removal (Feb. 2025, PDF)", url: "https://www.ilrc.org/sites/default/files/2025-02/Toolkit%20to%20Assist%20People%20Facing%20Expanded%20Expedited%20Removal_1.pdf" },
  { label: "AILA: D.C. Circuit allows expansion of expedited removal (July 20, 2026)", url: "https://www.aila.org/library/d-c-circuit-allows-expansion-of-expedited-removal" },
  { label: "CBS San Francisco: ICE barred from courthouse arrests (June 24, 2026)", url: "https://www.cbsnews.com/sanfrancisco/news/ice-banned-from-making-courthouse-arrests-nationwide-in-case-that-began-in-san-francisco/" },
];
