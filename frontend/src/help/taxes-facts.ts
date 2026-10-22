// Free tax help for the 2027 filing season (tax year 2026), with citations.
// Researched 2026-10-22 from the IRS (Rev. Proc. 2025-32, ITIN, VITA, refund
// and scam pages, the office locator), the FTB (2026 indexing memo of Sept 3,
// 2026; CalEITC, YCTC, FYTC, CalFile and time-frame pages), Pub. L. 119-21,
// the D.C. district court (No. 25-cv-457, ECF 53) and Circuit (No. 26-5006), CTEC,
// and the local sites' own pages. The
// research archive is ~/dev/outreach-help-2026-10/research/taxes.{json,md}.
//
// RE-CHECK by TAXES_RECHECK (upkeep.ts tracks it):
//  - FTB's 2026 CalEITC table by number of children (FTB said "late December");
//  - the IRS opening day, and this season's VITA / AARP sites in Stanislaus;
//  - Center for Taxpayer Rights v. IRS (IRS-ICE address sharing), still open.
import type { Fact } from "./facts";
import type { Bilingual } from "./letter-types";
import type { SourceRef } from "../components/help/ui";

export const TAXES_CHECKED = "2026-10-22";
export const TAXES_RECHECK = "2027-01-15";

/** The year these returns cover, and when they're due (IRC §6072(a): the
 *  15th day of the 4th month; California follows the same date). */
export const TAX_SEASON = { taxYear: 2026, due: "2027-04-15" } as const;

/** California's credits, tax year 2026 (FTB indexing memo, Sept 3, 2026). The
 *  per-child CalEITC amounts weren't published yet: `caleitcMax` is tax year 2025. */
export const CA_CREDITS = {
  /** "AGI of less than $34,051", with or without a qualifying child. */
  incomeUnder: 34051,
  investmentLimit: 4978,
  yctcMax: 1229,
  fytcMax: 1229,
  /** YCTC with no earned income or a loss: wages and the loss each up to this. */
  yctcNoEarningsCap: 36852,
  caleitcMax: { year: 2025, byChildren: [302, 2016, 3339, 3756] as const },
} as const;

/** Federal EITC and Child Tax Credit, tax year 2026 (Rev. Proc. 2025-32). */
export const FED_CREDITS = {
  /** By 0, 1, 2, 3+ qualifying children. */
  eitcMax: [664, 4427, 7316, 8231] as const,
  eitcLimitSingle: [19540, 51593, 58629, 62974] as const,
  eitcLimitJoint: [26820, 58863, 65899, 70244] as const,
  eitcInvestmentLimit: 12200,
  ctcMax: 2200,
  ctcRefundable: 1700,
} as const;

const REV_PROC = "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf";
const FTB_MEMO = "https://www.caltax.org/regulatory-issues/ftb/2026-PIT-Indexing-Memo.pdf";
const FTB_CALEITC = "https://www.ftb.ca.gov/file/personal/credits/caleitc/eligibility-and-credit-information.html";
const IRS_ITIN = "https://www.irs.gov/tin/itin/individual-taxpayer-identification-number-itin";
const IRS_VITA = "https://www.irs.gov/individuals/free-tax-return-preparation-for-qualifying-taxpayers";
const DC_CIR = "https://media.cadc.uscourts.gov/opinions/docs/2026/09/26-5006-2191763.pdf";
const DDC_ORDER = "https://storage.courtlistener.com/recap/gov.uscourts.dcd.277519/gov.uscourts.dcd.277519.53.0.pdf";
const ALC = "https://www.asianlawcaucus.org/news-resources/guides-reports/filing-taxes-itin";

export const TAXES_FACTS = {
  /** Free ways to file. */
  free: [
    {
      id: "vita",
      cite: "IRS: VITA/TCE, Oct 19, 2026",
      en: "VITA sites: IRS-certified volunteers prepare and e-file your federal and California returns for free. The IRS says sites generally serve people who make about $70,244 or less, people with disabilities, and people who speak limited English; each site can set its own limits. Every return gets a second check before it’s filed.",
      es: "Sitios VITA: voluntarios certificados por el IRS preparan y presentan electrónicamente sus declaraciones federal y de California, gratis. El IRS dice que los sitios generalmente atienden a personas que ganan unos $70,244 o menos, a personas con discapacidades y a quienes hablan poco inglés; cada sitio puede poner sus propios límites. Cada declaración se revisa otra vez antes de presentarla.",
    },
    {
      id: "aarp",
      cite: "IRS: VITA/TCE; AARP Foundation Tax-Aide",
      en: "AARP Foundation Tax-Aide also prepares taxes for free, with a focus on people over 50 with low to moderate income. You don’t need to be an AARP member. Its sites usually open from early February to mid-April.",
      es: "AARP Foundation Tax-Aide también prepara impuestos gratis, sobre todo para personas mayores de 50 años con ingresos bajos o moderados. No necesita ser miembro de AARP. Sus sitios suelen abrir de principios de febrero a mediados de abril.",
    },
    {
      id: "when",
      cite: "IRS: VITA/TCE; United Way of Stanislaus County",
      en: "This season’s sites and dates aren’t announced yet. Last season, United Way of Stanislaus County started on February 4. The IRS updates its site finder from February through April; Stanislaus 211 posts a local list.",
      es: "Los sitios y fechas de esta temporada todavía no se anuncian. La temporada pasada, United Way of Stanislaus County empezó el 4 de febrero. El IRS actualiza su buscador de sitios de febrero a abril; el 211 de Stanislaus publica una lista local.",
    },
    {
      id: "free-file",
      cite: "IRS: Free File, Oct 21, 2026",
      en: "IRS Free File: free tax software from IRS partners, for incomes of $89,000 or less last season. It reopens in January 2027. One partner (EzTaxReturn.com) works in Spanish. Always start at IRS.gov/freefile, or it may not be free.",
      es: "IRS Free File: programas de impuestos gratis de socios del IRS, para ingresos de $89,000 o menos la temporada pasada. Vuelve a abrir en enero de 2027. Un socio (EzTaxReturn.com) funciona en español. Empiece siempre en IRS.gov/freefile, o podría no ser gratis.",
    },
    {
      id: "calfile",
      cite: "FTB: CalFile",
      en: "CalFile: file your California return free, directly with the state (FTB). You need a MyFTB account, and you must have filed a California return in one of the last 5 years. It’s for simpler returns, so first-time filers and most self-employed people can’t use it.",
      es: "CalFile: presente su declaración de California gratis, directamente con el estado (FTB). Necesita una cuenta MyFTB y haber presentado una declaración de California en alguno de los últimos 5 años. Es para declaraciones sencillas, así que quienes declaran por primera vez y la mayoría de los que trabajan por su cuenta no lo pueden usar.",
    },
    {
      id: "direct-file",
      cite: "IRS email to states, Nov 3, 2025, via Federal News Network",
      en: "IRS Direct File was not offered last season, and the IRS has not said it will come back. Guides that still mention it are out of date.",
      es: "IRS Direct File no se ofreció la temporada pasada y el IRS no ha dicho que vuelva. Las guías que todavía la mencionan están desactualizadas.",
    },
    {
      id: "bring",
      cite: "United Way of Stanislaus County: what to bring",
      en: "What to bring: photo ID; Social Security cards or ITIN letters for everyone on the return; all W-2s and 1099s; health insurance forms (1095); last year’s returns; and a blank check for direct deposit. Married and filing jointly? Both spouses must come to sign. Birth dates for everyone on the return. Applying for an ITIN? Also bring proof of identity and foreign status, such as your passport.",
      es: "Qué llevar: identificación con foto; tarjetas de Seguro Social o cartas del ITIN de todas las personas en la declaración; todos los W-2 y 1099; formularios del seguro médico (1095); las declaraciones del año pasado; y un cheque en blanco para el depósito directo. ¿Casados y declaran juntos? Los dos deben ir a firmar. Fechas de nacimiento de todas las personas en la declaración. ¿Va a solicitar un ITIN? Lleve también prueba de identidad y de estatus extranjero, como su pasaporte.",
    },
  ],

  /** California's cash-back credits. */
  state: [
    {
      id: "itin-ok",
      cite: "FTB: CalEITC eligibility; FTB: ITIN",
      en: "California’s credits for workers and families can pay you cash back even if you owe no tax. You can claim them with a Social Security number OR an ITIN, for you, your spouse and your children. You must live in California more than half the year.",
      es: "Los créditos de California para trabajadores y familias le pueden dar dinero de vuelta aunque no deba impuestos. Los puede reclamar con número de Seguro Social O con ITIN, para usted, su cónyuge y sus hijos. Debe vivir en California más de la mitad del año.",
    },
    {
      id: "caleitc-2026",
      cite: "FTB indexing memo, Sept 3, 2026",
      en: "CalEITC (California Earned Income Tax Credit), tax year 2026: generally for incomes under $34,051, with or without children. Investment income (interest, dividends, capital gains) must be $4,978 or less.",
      es: "CalEITC (Crédito Tributario por Ingreso del Trabajo de California), año fiscal 2026: generalmente para ingresos de menos de $34,051, con o sin hijos. Los ingresos por inversiones (intereses, dividendos, ganancias de capital) deben ser de $4,978 o menos.",
    },
    {
      id: "caleitc-amount",
      cite: "FTB: CalEITC credit table, tax year 2025",
      en: "How much: for tax year 2025, CalEITC was up to $302 with no children, $2,016 with 1 child, $3,339 with 2 and $3,756 with 3 or more. The FTB hadn’t posted the 2026 amounts yet.",
      es: "Cuánto: para el año fiscal 2025, CalEITC fue de hasta $302 sin hijos, $2,016 con 1 hijo, $3,339 con 2 y $3,756 con 3 o más. El FTB todavía no publicaba las cantidades de 2026.",
    },
    {
      id: "yctc",
      cite: "FTB indexing memo, Sept 3, 2026; FTB: YCTC",
      en: "Young Child Tax Credit: up to $1,229 for tax year 2026 if you qualify for CalEITC and have a child under 6 at the end of the year. You can get it even with no earnings or a business loss, if your wages and your loss are each $36,852 or less.",
      es: "Crédito Tributario por Hijos Menores (YCTC): hasta $1,229 para el año fiscal 2026 si califica para CalEITC y tiene un hijo menor de 6 años al final del año. Lo puede recibir aun sin ingresos del trabajo o con una pérdida en su negocio, si su sueldo y su pérdida son cada uno de $36,852 o menos.",
    },
    {
      id: "fytc",
      cite: "FTB indexing memo, Sept 3, 2026; FTB: FYTC",
      en: "Foster Youth Tax Credit: up to $1,229 for tax year 2026 for people 18 to 25 who were in California foster care at age 13 or older and qualify for CalEITC (each spouse can qualify).",
      es: "Crédito Tributario para Jóvenes de Crianza Temporal (FYTC): hasta $1,229 para el año fiscal 2026 para personas de 18 a 25 años que estuvieron en cuidado de crianza temporal en California a los 13 años o más y califican para CalEITC (cada cónyuge puede calificar).",
    },
    {
      id: "past-years",
      cite: "FTB: CalEITC eligibility",
      en: "Missed it before? You can generally claim CalEITC for up to four past years by filing or amending your California return. All three credits go on form FTB 3514.",
      es: "¿No lo reclamó antes? Generalmente puede reclamar CalEITC hasta por cuatro años anteriores presentando o corrigiendo su declaración de California. Los tres créditos van en el formulario FTB 3514.",
    },
  ],

  /** Federal credits, and who needs a Social Security number. */
  federal: [
    {
      id: "eitc-ssn",
      cite: "IRS: Who qualifies for the EITC; IRS Pub. 596; IRS: ITIN",
      en: "The federal EITC needs a Social Security number valid for work, issued by the return’s due date, for you and your spouse if filing jointly. People filing with an ITIN can’t get it. To get the bigger amount for a child, the child needs one too. If your child doesn’t have one, you may still get the smaller no-children amount (ages 25 to 64).",
      es: "El EITC federal necesita un número de Seguro Social válido para trabajar, emitido antes de la fecha límite de la declaración, para usted y su cónyuge si declaran juntos. Quienes declaran con ITIN no lo pueden recibir. Para recibir la cantidad mayor por un hijo, el hijo también necesita uno. Si su hijo no lo tiene, todavía podría recibir la cantidad menor para personas sin hijos (de 25 a 64 años).",
    },
    {
      id: "eitc-2026",
      cite: "Rev. Proc. 2025-32 §4.06",
      en: "Federal EITC, tax year 2026: up to $664 with no children (no children: ages 25 to 64), $4,427 with 1, $7,316 with 2 and $8,231 with 3 or more. Income must be under $19,540, $51,593, $58,629 or $62,974 ($26,820, $58,863, $65,899 or $70,244 if married filing jointly). Investment income must be $12,200 or less.",
      es: "EITC federal, año fiscal 2026: hasta $664 sin hijos (sin hijos: de 25 a 64 años), $4,427 con 1, $7,316 con 2 y $8,231 con 3 o más. Los ingresos deben ser menos de $19,540, $51,593, $58,629 o $62,974 ($26,820, $58,863, $65,899 o $70,244 si son casados y declaran juntos). Los ingresos por inversiones deben ser de $12,200 o menos.",
    },
    {
      id: "ctc-ssn",
      cite: "Pub. L. 119-21 §70104(b), IRC §24(h)(7); IRS: Child Tax Credit",
      en: "Child Tax Credit (up to $2,200 per child under 17 for 2026, up to $1,700 of it as a refund): since tax year 2025, the child needs a Social Security number valid for work, and so does the person filing (on a joint return, one spouse is enough). The numbers must be issued by the return’s due date.",
      es: "Crédito Tributario por Hijos (hasta $2,200 por hijo menor de 17 años en 2026, hasta $1,700 de ese crédito como reembolso): desde el año fiscal 2025, el hijo necesita un número de Seguro Social válido para trabajar, y también la persona que declara (en una declaración conjunta, basta con un cónyuge). Los números deben emitirse antes de la fecha límite de la declaración.",
    },
    {
      id: "odc",
      cite: "IRS: Child Tax Credit; IRS: ITIN",
      en: "A child or other dependent who doesn’t qualify may still count for the $500 Credit for Other Dependents, with a Social Security number or an ITIN, if they’re a U.S. citizen, national or resident. It only lowers tax you owe; it isn’t paid out as a refund.",
      es: "Un hijo u otro dependiente que no califica todavía podría contar para el Crédito por Otros Dependientes de $500, con número de Seguro Social o ITIN, si es ciudadano, nacional o residente de EE. UU. Solo baja el impuesto que debe; no se paga como reembolso.",
    },
    {
      id: "tips-overtime",
      cite: "IRS FS-2025-03; FTB analysis of AB 1550",
      en: "New federal deductions for 2025 to 2028, for tips (up to $25,000) and for the extra “half” of overtime pay (up to $12,500, or $25,000 on a joint return), need a Social Security number on the return, and married couples must file jointly. California has no such deduction, so tips and overtime still count on your state return.",
      es: "Las nuevas deducciones federales de 2025 a 2028, por propinas (hasta $25,000) y por la “mitad” extra del pago de horas extra (hasta $12,500, o $25,000 en una declaración conjunta), necesitan un número de Seguro Social en la declaración, y los casados deben declarar juntos. California no tiene esa deducción, así que las propinas y las horas extra sí cuentan en su declaración estatal.",
    },
    {
      id: "trump-account",
      cite: "IRS IR-2026-31; IRS Form 4547",
      en: "Babies born from 2025 through 2028 who are U.S. citizens with a Social Security number can get a one-time $1,000 from the U.S. Treasury in a new savings account for children (a “Trump account”). A parent or guardian chooses it on IRS Form 4547; ask a free tax site.",
      es: "Los bebés nacidos de 2025 a 2028 que son ciudadanos de EE. UU. con número de Seguro Social pueden recibir una sola vez $1,000 del Tesoro en una nueva cuenta de ahorro para niños (una “cuenta Trump”). El padre, la madre o el tutor lo pide en el formulario 4547 del IRS; pregunte en un sitio de impuestos gratis.",
    },
  ],

  /** Individual Taxpayer Identification Numbers. */
  itin: [
    {
      id: "what",
      cite: "IRS: ITIN",
      en: "An ITIN is a tax number from the IRS for people who can’t get a Social Security number. You can get one whatever your immigration status. It’s for taxes only: it doesn’t give immigration status or permission to work.",
      es: "El ITIN es un número de impuestos del IRS para personas que no pueden obtener un número de Seguro Social. Lo puede obtener sin importar su estatus migratorio. Es solo para impuestos: no da estatus migratorio ni permiso para trabajar.",
    },
    {
      id: "apply",
      cite: "IRS: ITIN",
      en: "Apply with Form W-7, sent together with your tax return (not separately). The IRS takes about 7 weeks, or 9 to 11 weeks during tax season (January 15 to April 30).",
      es: "Solicítelo con el formulario W-7, junto con su declaración de impuestos (no por separado). El IRS tarda unas 7 semanas, o de 9 a 11 semanas en temporada de impuestos (del 15 de enero al 30 de abril).",
    },
    {
      id: "in-person",
      cite: "IRS: How to apply for an ITIN",
      en: "Applying in person means you don’t mail away your original passport or papers. An IRS Taxpayer Assistance Center with ITIN services reviews your W-7 and gives your documents back at the appointment, free (appointments can take weeks). Certifying Acceptance Agents do this for a fee.",
      es: "Si lo solicita en persona, no tiene que enviar por correo su pasaporte o documentos originales. Un Centro de Asistencia al Contribuyente del IRS con servicios de ITIN revisa su W-7 y le devuelve sus documentos en la cita, gratis (conseguir cita puede tardar semanas). Los Agentes Certificadores de Aceptación lo hacen cobrando.",
    },
    {
      id: "expire",
      cite: "IRS: How to renew an ITIN; IRS: ITIN",
      en: "An ITIN expires if it isn’t used on a federal return for 3 years in a row. Renew it with Form W-7, with your return. If you later get a Social Security number, stop using the ITIN and tell the IRS so your records are combined.",
      es: "El ITIN vence si no se usa en una declaración federal por 3 años seguidos. Renuévelo con el formulario W-7, junto con su declaración. Si después obtiene un número de Seguro Social, deje de usar el ITIN y avísele al IRS para que junten sus registros.",
    },
    {
      id: "extension",
      cite: "IRS: ITIN; FTB: Extension to file",
      en: "No ITIN yet? You can still ask for more time to file, until October 15, on Form 4868 (write “ITIN TO BE REQUESTED” where it asks for the number). Tax you owe is still due in April. California gives an automatic extension to October 15; no form needed.",
      es: "¿Todavía no tiene ITIN? Igual puede pedir más tiempo para declarar, hasta el 15 de octubre, con el formulario 4868 (escriba “ITIN TO BE REQUESTED” donde pide el número). El impuesto que deba se paga de todos modos en abril. California da una prórroga automática hasta el 15 de octubre; no se necesita formulario.",
    },
  ],

  /** What happens to your information. Said plainly: the courts are still deciding. */
  privacy: [
    {
      id: "law",
      cite: "IRC §6103; Center for Taxpayer Rights v. IRS, No. 26-5006, D.C. Cir. 2026",
      en: "Federal law bars the IRS from sharing your tax information with other agencies, except under strict conditions.",
      es: "La ley federal prohíbe que el IRS comparta su información de impuestos con otras agencias, salvo en condiciones estrictas.",
    },
    {
      id: "ice",
      cite: "D.D.C. No. 25-cv-457, Nov. 21, 2025, ECF 53; aff’d, D.C. Cir. No. 26-5006, Sept. 8, 2026",
      en: "In 2025 the IRS began giving ICE the addresses of people with deportation orders and turned over more than 47,000 records. On November 21, 2025, a federal court in Washington, D.C. paused that mass sharing. Now the IRS may share tax information with ICE only in individual criminal cases that strictly follow the law, and it must tell the court first. On September 8, 2026, the federal appeals court kept that order in place. The order protects everyone, not only the groups that sued. But it does not stop all sharing, ICE was only ordered to limit how it uses the records it already has, and the case isn’t over.",
      es: "En 2025 el IRS empezó a darle a ICE las direcciones de personas con órdenes de deportación y entregó más de 47,000 registros. El 21 de noviembre de 2025, una corte federal en Washington, D.C. detuvo ese intercambio masivo. Ahora el IRS solo puede compartir información de impuestos con ICE en casos penales individuales que cumplan estrictamente la ley, y antes debe avisarle a la corte. El 8 de septiembre de 2026, la corte federal de apelaciones mantuvo esa orden. La orden protege a todos, no solo a los grupos que demandaron. Pero no detiene todo intercambio, a ICE solo se le ordenó limitar el uso de los registros que ya tiene, y el caso no ha terminado.",
    },
    {
      id: "advice",
      cite: "Asian Law Caucus: Filing taxes with an ITIN, Mar 16, 2026; IRS: Form W-7 and Form 1040 instructions",
      en: "The Asian Law Caucus advises: talk to an immigration lawyer before you apply for an ITIN. ICE’s requests have focused on people with a final deportation order, so this matters most if you have one. Worried about giving your home address? The Asian Law Caucus suggests another mailing address, such as a P.O. box, on your return or extension. But IRS instructions say to use a P.O. box only if mail isn’t delivered to your home, and you can’t use a private mailbox on the W-7, where the IRS sends back your documents. Ask a lawyer before you decide. You don’t have to give an email address or phone number.",
      es: "El Asian Law Caucus aconseja: hable con un abogado de inmigración antes de solicitar un ITIN. Las solicitudes de ICE se han enfocado en personas con una orden final de deportación, así que esto importa más si usted tiene una. ¿Le preocupa dar la dirección de su casa? El Asian Law Caucus sugiere otra dirección postal, como un apartado postal (P.O. box), en su declaración o prórroga. Pero las instrucciones del IRS dicen que use un apartado postal solo si el correo no llega a su casa, y en el W-7, donde el IRS le devuelve sus documentos, no se puede usar un buzón privado. Pregúntele a un abogado antes de decidir. No tiene que dar correo electrónico ni número de teléfono.",
    },
    {
      id: "moral-character",
      cite: "Asian Law Caucus: Filing taxes with an ITIN",
      en: "Proof that you filed your taxes can help show “good moral character” in a later immigration case.",
      es: "Demostrar que presentó sus impuestos puede ayudar a mostrar “buen carácter moral” en un caso de inmigración más adelante.",
    },
    {
      id: "vita-private",
      cite: "IRS: VITA/TCE",
      en: "VITA volunteers are trained to keep your information private. That is about the volunteers: your return still goes to the IRS, so the court case above still applies.",
      es: "Los voluntarios de VITA están capacitados para mantener su información privada. Eso se refiere a los voluntarios: su declaración igual llega al IRS, así que el caso de la corte de arriba también aplica.",
    },
  ],

  /** When the money comes. */
  refunds: [
    {
      id: "irs",
      cite: "IRS: Refunds; IRS: Refund timing; IRS: ITIN",
      en: "Federal refunds usually take about 3 weeks after you e-file, or 6 weeks or more for a mailed return. If you claim the EITC or the Additional Child Tax Credit, the law holds your whole refund until mid-February; with e-file and direct deposit, most arrive by early March. Applying for an ITIN? Your return is mailed with the W-7, not e-filed. The ITIN takes about 7 weeks (9 to 11 in tax season) before the return is processed.",
      es: "Los reembolsos federales suelen tardar unas 3 semanas después de presentar electrónicamente, o 6 semanas o más si envía la declaración por correo. Si reclama el EITC o el Crédito Tributario Adicional por Hijos, la ley retiene todo su reembolso hasta mediados de febrero; con declaración electrónica y depósito directo, la mayoría llega a principios de marzo. ¿Va a solicitar un ITIN? Su declaración se envía por correo con el W-7, no electrónicamente. El ITIN tarda unas 7 semanas (de 9 a 11 en temporada de impuestos) antes de que se procese la declaración.",
    },
    {
      id: "ftb",
      cite: "FTB: Time frames",
      en: "California refunds take about 1 month for an e-filed return, and about 4 months on paper.",
      es: "Los reembolsos de California tardan cerca de 1 mes si declara electrónicamente, y cerca de 4 meses en papel.",
    },
    {
      id: "offset",
      cite: "IRS: Refunds",
      en: "Your refund can be reduced to pay past-due taxes, child support or other government debts. Check your federal refund with “Where’s My Refund?” on IRS.gov or at 800-829-1954.",
      es: "Su reembolso puede reducirse para pagar impuestos atrasados, manutención de hijos u otras deudas con el gobierno. Revise su reembolso federal en “¿Dónde está mi reembolso?” en IRS.gov o al 800-829-1954.",
    },
  ],

  /** Scams and bad preparers. */
  scams: [
    {
      id: "who-can",
      cite: "CTEC: Taxpayers",
      en: "In California, only CPAs, attorneys, IRS enrolled agents and preparers registered with CTEC can prepare taxes for a fee. A notary (“notario”) can’t do your taxes for pay unless they are one of these. Look up a preparer at ctec.org.",
      es: "En California, solo los contadores públicos (CPA), los abogados, los agentes inscritos ante el IRS y los preparadores registrados en CTEC pueden preparar impuestos cobrando. Un notario no puede hacer sus impuestos cobrando a menos que sea uno de estos. Busque al preparador en ctec.org.",
    },
    {
      id: "ghost",
      cite: "IRS IR-2024-96: ghost preparers",
      en: "Red flags: a preparer who won’t sign your return, charges a percentage of your refund, wants cash with no receipt, makes up income or deductions, or wants your refund sent to their bank account. Use your own account, and get a copy of everything you sign.",
      es: "Señales de alerta: un preparador que no firma su declaración, cobra un porcentaje de su reembolso, pide efectivo sin recibo, inventa ingresos o deducciones, o quiere que el reembolso llegue a su cuenta de banco. Use su propia cuenta y pida copia de todo lo que firme.",
    },
    {
      id: "impostors",
      cite: "IRS: How to know it’s the IRS; IRS: Tax scams",
      en: "The IRS usually contacts you first by U.S. mail. A call, text or email that is unexpected, rushes or threatens you (even with arrest or deportation), or asks for personal information or payment right now is not the IRS.",
      es: "El IRS normalmente lo contacta primero por correo postal. Una llamada, texto o correo electrónico inesperado, que lo apresura o lo amenaza (incluso con arresto o deportación), o que pide información personal o un pago inmediato, no es del IRS.",
    },
    {
      id: "report",
      cite: "IRS IR-2024-96; CTEC",
      en: "Report a bad preparer to the IRS (Form 14157) and to CTEC.",
      es: "Denuncie a un mal preparador ante el IRS (formulario 14157) y ante CTEC.",
    },
  ],
} satisfies Record<string, Fact[]>;

export interface TaxPlace {
  name: Bilingual;
  phone?: string;
  address?: string;
  hours?: Bilingual;
  note?: Bilingual;
  url: string;
}

const CHECK_2027: Bilingual = { en: "Check for 2027 dates.", es: "Pregunte por las fechas de 2027." };

export const TAX_PLACES = {
  unitedWay: {
    name: { en: "United Way of Stanislaus County: free tax help (VITA)", es: "United Way of Stanislaus County: ayuda gratis con impuestos (VITA)" },
    phone: "(209) 523-4562",
    address: "422 McHenry Ave., Modesto",
    note: { en: `English and Spanish. Last season it opened February 4; appointments recommended. ${CHECK_2027.en}`, es: `Inglés y español. La temporada pasada abrió el 4 de febrero; se recomienda hacer cita. ${CHECK_2027.es}` },
    url: "https://uwaystan.org/tax-free-assistance",
  },
  csuStan: {
    name: { en: "CSU Stanislaus VITA (free, Turlock campus)", es: "VITA de CSU Stanislaus (gratis, campus de Turlock)" },
    address: "1 University Circle, Turlock",
    note: { en: `Last season: February 12 to April 4, no appointment, Thursdays and Saturdays. ${CHECK_2027.en}`, es: `La temporada pasada: del 12 de febrero al 4 de abril, sin cita, jueves y sábados. ${CHECK_2027.es}` },
    url: "https://www.stancounty211.org/2025-free-tax-filing-locations",
  },
  aarp: {
    name: { en: "AARP Foundation Tax-Aide (free; you don’t need to be a member)", es: "AARP Foundation Tax-Aide (gratis; no necesita ser miembro)" },
    phone: "1-888-227-7669",
    note: { en: "Their site finder lists local sites from about January.", es: "Su buscador muestra los sitios locales desde enero, más o menos." },
    url: "https://www.aarp.org/money/taxes/aarp-taxaide/",
  },
  s211: {
    name: { en: "Stanislaus 211: free tax sites near you", es: "211 de Stanislaus: sitios de impuestos gratis cerca de usted" },
    phone: "1-877-211-7826",
    note: { en: "Or dial 211, or text your ZIP code to 898211.", es: "O marque 211, o mande un texto con su código postal al 898211." },
    url: "https://www.stancounty211.org/2025-free-tax-filing-locations",
  },
  irsLocator: {
    name: { en: "IRS: find a free VITA or TCE site", es: "IRS: encuentre un sitio VITA o TCE gratis" },
    phone: "800-906-9887",
    url: "https://irs.treasury.gov/freetaxprep/",
  },
  tacModesto: {
    name: { en: "IRS Taxpayer Assistance Center, Modesto (free ITIN help, by appointment)", es: "Centro de Asistencia al Contribuyente del IRS, Modesto (ayuda gratis con el ITIN, con cita)" },
    phone: "(844) 545-5640",
    address: "1700 Standiford Ave., Suite 150, Modesto",
    hours: { en: "Monday–Friday 8:30–4:30, appointments only", es: "Lunes a viernes de 8:30 a 4:30, solo con cita" },
    url: "https://www.irs.gov/tin/itin/irs-taxpayer-assistance-centers-with-itin-services",
  },
  mercedItin: {
    name: { en: "United Way of Merced County: VITA site that also helps with ITIN applications", es: "United Way of Merced County: sitio VITA que también ayuda a solicitar el ITIN" },
    phone: "(209) 384-1329",
    address: "531 W. Main St., Merced",
    note: { en: "The closest one the IRS lists. Call for an appointment.", es: "El más cercano en la lista del IRS. Llame para hacer una cita." },
    url: "https://www.irs.gov/tin/itin/volunteer-income-tax-assistance-vita-sites-with-itin-services",
  },
  caaList: {
    name: { en: "IRS list of Certifying Acceptance Agents (they charge a fee)", es: "Lista del IRS de Agentes Certificadores de Aceptación (cobran)" },
    url: "https://www.irs.gov/tin/itin/itin-acceptance-agents",
  },
  ctec: {
    name: { en: "CTEC: check that a paid preparer is registered", es: "CTEC: verifique que un preparador pagado esté registrado" },
    url: "https://ctec.org/taxpayers/find-verify-preparer/",
  },
} satisfies Record<string, TaxPlace>;

export const TAXES_SOURCES: SourceRef[] = [
  { label: "IRS Rev. Proc. 2025-32: 2026 EITC and Child Tax Credit amounts", url: REV_PROC },
  { label: "FTB: Indexing, Personal Income Tax Law, 2026 tax year (memo of Sept 3, 2026)", url: FTB_MEMO },
  { label: "FTB: CalEITC eligibility and credit amounts", url: FTB_CALEITC },
  { label: "FTB: Young Child Tax Credit", url: "https://www.ftb.ca.gov/file/personal/credits/young-child-tax-credit.html" },
  { label: "FTB: Foster Youth Tax Credit", url: "https://www.ftb.ca.gov/file/personal/credits/foster-youth-tax-credit.html" },
  { label: "FTB: CalFile", url: "https://www.ftb.ca.gov/file/ways-to-file/online/calfile/index.asp" },
  { label: "FTB: Extension to file", url: "https://www.ftb.ca.gov/file/when-to-file/extension-to-file.html" },
  { label: "FTB: Processing and refund time frames", url: "https://www.ftb.ca.gov/help/time-frames/" },
  { label: "Public Law 119-21 §70104 (Child Tax Credit Social Security number rule)", url: "https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm" },
  { label: "IRS: Child Tax Credit and Credit for Other Dependents", url: "https://www.irs.gov/credits-deductions/individuals/child-tax-credit" },
  { label: "IRS Publication 596: Earned Income Credit", url: "https://www.irs.gov/publications/p596" },
  { label: "IRS: Form W-7 instructions", url: "https://www.irs.gov/instructions/iw7" },
  { label: "IRS: Form 1040 instructions", url: "https://www.irs.gov/instructions/i1040gi" },
  { label: "IRS: Who qualifies for the EITC", url: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/who-qualifies-for-the-earned-income-tax-credit-eitc" },
  { label: "IRS FS-2025-03: deductions for tips, overtime and seniors", url: "https://www.irs.gov/newsroom/one-big-beautiful-bill-act-tax-deductions-for-working-americans-and-seniors" },
  { label: "FTB analysis of AB 1550 (state tips and overtime bill)", url: "https://www.ftb.ca.gov/tax-pros/law/legislation/2025-2026/AB1550-031626.pdf" },
  { label: "IRS IR-2026-31: Trump accounts $1,000 pilot contribution", url: "https://www.irs.gov/newsroom/treasury-irs-issue-proposed-regulations-for-trump-accounts-contribution-pilot-program-treasury-department-to-deposit-1000-into-the-account-of-each-eligible-child" },
  { label: "IRS: Individual Taxpayer Identification Number (ITIN)", url: IRS_ITIN },
  { label: "IRS: ITIN (Spanish)", url: "https://www.irs.gov/es/tin/itin/individual-taxpayer-identification-number-itin" },
  { label: "IRS: How to apply for an ITIN", url: "https://www.irs.gov/tin/itin/how-to-apply-for-an-itin" },
  { label: "IRS: How to renew an ITIN", url: "https://www.irs.gov/tin/itin/how-to-renew-an-itin" },
  { label: "IRS: Free tax return preparation (VITA and TCE)", url: IRS_VITA },
  { label: "IRS: Free File", url: "https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free" },
  { label: "Federal News Network: IRS tells states Direct File won’t be available (Nov 2025)", url: "https://federalnewsnetwork.com/it-modernization/2025/11/irs-direct-file-will-not-be-available-in-2026-agency-tells-states/" },
  { label: "IRS: Refunds", url: "https://www.irs.gov/refunds" },
  { label: "IRS: Refund timing for EITC and ACTC", url: "https://www.irs.gov/individuals/refund-timing" },
  { label: "IRS: How to know it’s really the IRS", url: "https://www.irs.gov/help/how-to-know-its-the-irs" },
  { label: "IRS IR-2024-96: ghost preparers", url: "https://www.irs.gov/newsroom/dirty-dozen-irs-urges-taxpayers-to-not-fall-prey-to-untrustworthy-tax-preparers-ghost-preparers-can-disappear-with-taxpayer-cash-information" },
  { label: "CTEC: For taxpayers", url: "https://ctec.org/taxpayers/" },
  { label: "Center for Taxpayer Rights v. IRS, No. 25-cv-457 (D.D.C.), order of Nov. 21, 2025 (ECF 53)", url: DDC_ORDER },
  { label: "Center for Taxpayer Rights v. IRS, No. 26-5006 (D.C. Cir. Sept 8, 2026)", url: DC_CIR },
  { label: "Asian Law Caucus: Filing taxes with an ITIN, Mar 16, 2026", url: ALC },
  { label: "United Way of Stanislaus County: free income tax assistance", url: "https://uwaystan.org/tax-free-assistance" },
  { label: "Stanislaus 211: free tax filing locations", url: "https://www.stancounty211.org/2025-free-tax-filing-locations" },
  { label: "AARP Foundation Tax-Aide", url: "https://www.aarp.org/money/taxes/aarp-taxaide/" },
];
