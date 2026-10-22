// Medi-Cal's new work rules ("community engagement"), which start in 2027,
// with citations. Researched 2026-10-22 from the statute (Pub. L. 119-21
// §71119, SSA §1902(xx)), CMS's rule (CMS-2454-IFC, 91 FR 33348, 42 CFR
// 435.550–563), DHCS (ACWDL 25-30, the H.R. 1 implementation plan, member
// pages and letters; read via archived copies since dhcs.ca.gov blocks
// scripts), California law (AB 116, SB 164) and Stanislaus CSA. The research
// archive is ~/dev/outreach-help-2026-10/research/medi-cal-work.{json,md}.
//
// RE-CHECK (upkeep.ts tracks both dates):
//  - by MCW_RECHECK: the states' lawsuit (Massachusetts v. Oz, D. Mass.) could
//    change CMS's "medically frail" definition; DHCS promised more county
//    letters; confirm when current members are first checked (DHCS says March 2027).
//  - by MCW_IMMIGRANT_RECHECK: the premium amount for state-funded Medi-Cal
//    (set in the 2027-28 May Revision) and the July 1, 2027 changes.
import type { Contact, Fact } from "./facts";
import type { SourceRef } from "../components/help/ui";
import type { Bilingual } from "./letter-types";

export const MCW_CHECKED = "2026-10-22";
export const MCW_RECHECK = "2026-12-15";
export const MCW_IMMIGRANT_RECHECK = "2027-06-01";

export const MCW = {
  hours: 80,
  /** 80 × the FEDERAL minimum wage ($7.25): CMS bars states from using their own. */
  incomeCents: 58_000,
  /** In school less than half-time: each credit counts 3 hours a week × 4.33 weeks. */
  hoursPerCredit: 3 * 4.33,
  /** Most hours a month can hold (31 × 24): larger entries are typos. */
  maxMonthHours: 744,
  /** New applications are checked from this date. */
  applicantsFrom: "2027-01-01",
  /** DHCS: six-month renewals (with the rule) start this date for current members. */
  renewalsFrom: "2027-03-01",
};

const PL_119_21 = "https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm";
const CMS_RULE = "https://www.federalregister.gov/documents/2026/06/03/2026-11094/medicaid-program-community-engagement-requirement-for-certain-individuals";
const ACWDL_25_30 = "https://www.dhcs.ca.gov/wp-content/uploads/2026/04/25-30.pdf";
const DHCS_CHANGES = "https://www.dhcs.ca.gov/medi-cal/updates/medi-cal-changes/";

export const MCW_FACTS = {
  /** Who has to meet it, and how. */
  rule: [
    {
      id: "who",
      cite: "SSA §1902(xx)(9)(A)(i); 42 CFR 435.551; DHCS ACWDL 25-30",
      en: "The rule is for adults 19 to 64 in Medi-Cal’s “adult expansion” group, where most working-age adults who qualify by income are. It doesn’t apply to people on Medicare, or who get Medi-Cal another way, such as through SSI or a disability program. Your county will send a letter saying whether it applies to you.",
      es: "La regla es para adultos de 19 a 64 años en el grupo de “adultos de expansión” de Medi-Cal, donde está la mayoría de los adultos en edad de trabajar que califican por sus ingresos. No aplica a quienes tienen Medicare, ni a quienes tienen Medi-Cal por otra vía, como SSI o un programa por discapacidad. Su condado le mandará una carta que dice si la regla aplica a usted.",
    },
    {
      id: "uis",
      cite: "DHCS ACWDL 25-30 p. 2; SB 164 (2026)",
      en: "In California it ALSO applies to adults 19–64 with full Medi-Cal paid by the state because of their immigration status. It does NOT apply to restricted Medi-Cal (emergency and pregnancy care only).",
      es: "En California TAMBIÉN aplica a los adultos de 19 a 64 años con Medi-Cal completo pagado por el estado por su estatus migratorio. NO aplica a Medi-Cal restringido (solo emergencias y embarazo).",
    },
    {
      id: "80-hours",
      cite: "SSA §1902(xx)(2)(A)–(E); 42 CFR 435.552(a)",
      en: "Each month that counts, do at least 80 hours of work, community service, or a work program, or any mix of them that adds up to 80 hours. Being in school at least half-time also counts.",
      es: "En cada mes que cuenta, haga al menos 80 horas de trabajo, servicio comunitario o un programa de trabajo, o una combinación que sume 80 horas. Estar en la escuela al menos medio tiempo también cuenta.",
    },
    {
      id: "income",
      cite: "SSA §1902(xx)(2)(F); 42 CFR 435.552(f); 91 FR 33348; DHCS ACWDL 25-30 p. 7",
      en: "Or have at least $580 of income in the month, however many hours that takes. Pay counts, and so do things like unemployment or disability (SDI) payments. $580 is 80 × the federal minimum wage of $7.25; California’s higher minimum wage doesn’t raise it. The federal rule may also count your household’s income; the county decides.",
      es: "O tenga al menos $580 de ingresos en el mes, sin importar cuántas horas trabaje. Cuenta el sueldo, y también pagos como el desempleo o la incapacidad (SDI). $580 son 80 × el salario mínimo federal de $7.25; el salario mínimo más alto de California no sube esta cantidad. La regla federal también podría contar los ingresos de su hogar; el condado decide.",
    },
    {
      id: "seasonal",
      cite: "SSA §1902(xx)(2)(G); 42 CFR 435.552(g)",
      en: "Seasonal workers (like many farm workers) meet it if their income averaged at least $580 a month over the past 6 months.",
      es: "Los trabajadores y trabajadoras de temporada (como muchos en el campo) cumplen si sus ingresos fueron en promedio de al menos $580 al mes en los últimos 6 meses.",
    },
    {
      id: "work",
      cite: "42 CFR 435.552(b)",
      en: "“Work” includes paid work (also cash and gig jobs), work paid with goods or services, and unpaid work.",
      es: "El “trabajo” incluye el trabajo pagado (también en efectivo y por aplicaciones), el trabajo pagado con bienes o servicios, y el trabajo sin pago.",
    },
    {
      id: "community-service",
      cite: "42 CFR 435.552(b)",
      en: "Community service must be unpaid work in an organized program of a nonprofit or public agency that keeps track of your dates and hours and has someone who can confirm them. Court-ordered service counts.",
      es: "El servicio comunitario debe ser trabajo sin pago en un programa organizado de una organización sin fines de lucro o agencia pública que registre sus fechas y horas y tenga a alguien que pueda confirmarlas. El servicio ordenado por un tribunal cuenta.",
    },
    {
      id: "school",
      cite: "42 CFR 435.552(b)–(d); DHCS ACWDL 25-30 p. 8",
      en: "School means college, career and technical education, high school, GED or HiSET programs, and adult literacy programs. Your school decides if you are half-time. Less than half-time? Each credit counts as about 13 hours a month toward the 80, or count your hours in class. Job training programs are different: they count by the hour.",
      es: "La escuela es el colegio comunitario o la universidad, la educación técnica, la preparatoria, los programas de GED o HiSET, y los programas de alfabetización para adultos. Su escuela decide si estudia medio tiempo. ¿Menos de medio tiempo? Cada unidad cuenta como unas 13 horas al mes para las 80, o cuente sus horas de clase. Los programas de capacitación laboral son distintos: cuentan por hora.",
    },
    {
      id: "work-program",
      cite: "SSA §1902(xx)(9)(D); 42 CFR 435.552(b)",
      en: "Work programs include job training (WIOA), CalFresh Employment and Training, and other state, county or veterans’ job programs. Looking for work on your own doesn’t count.",
      es: "Los programas de trabajo incluyen capacitación laboral (WIOA), Empleo y Capacitación de CalFresh, y otros programas de empleo del estado, del condado o para veteranos. Buscar trabajo por su cuenta no cuenta.",
    },
  ] satisfies Fact[],

  /** Who doesn't have to. */
  exempt: [
    {
      id: "groups",
      cite: "SSA §1902(xx)(3), (9)(A)(ii); DHCS ACWDL 25-30",
      en: "These people don’t have to meet it: pregnant people, and for 12 months after; the parent of a child 13 or younger, or a relative or caregiver who mainly cares for one; family caregivers of a person with a disability; members of a U.S. tribe (American Indians and Alaska Natives) and people who can get Indian Health Service care; people who were in foster care at 18, until 26; veterans with a total disability rating; people in a drug or alcohol treatment program; people in jail, and for 3 months after release; people on Medicare.",
      es: "Estas personas no tienen que cumplirla: personas embarazadas, y hasta 12 meses después; el padre o la madre de un niño de 13 años o menos, o un pariente o cuidador que lo cuida principalmente; cuidadores familiares de una persona con discapacidad; miembros de una tribu de EE. UU. (indígenas americanos y nativos de Alaska) y personas que pueden recibir atención del Servicio de Salud Indígena (IHS); jóvenes que estuvieron en foster care a los 18 años, hasta los 26; veteranos con discapacidad total; personas en un programa de tratamiento por drogas o alcohol; personas en la cárcel, y hasta 3 meses después de salir; personas con Medicare.",
    },
    {
      id: "calfresh",
      cite: "SSA §1902(xx)(9)(A)(ii)(VI); 42 CFR 435.554",
      en: "People in CalWORKs Welfare-to-Work, and people in a CalFresh home whom the county holds to CalFresh work rules, don’t have to meet a second set of rules. Being exempt from CalFresh work rules doesn’t count here.",
      es: "Las personas en el programa de Bienestar al Trabajo de CalWORKs, y las personas en un hogar con CalFresh a quienes el condado les aplica las reglas de trabajo de CalFresh, no tienen que cumplir otras reglas más. Estar exento de las reglas de trabajo de CalFresh no cuenta aquí.",
    },
    {
      id: "frail",
      cite: "SSA §1902(xx)(9)(A)(ii)(V); 42 CFR 435.554(c)(5)",
      en: "People who are “medically frail” are exempt: blind or disabled, or with a substance use disorder, a disabling mental illness, or a serious or complex medical condition. Under CMS’s rule the condition must also make it much harder to meet the rule. 26 states, California among them, are suing over that limit. Having a disability doesn’t require getting disability benefits.",
      es: "Las personas “médicamente frágiles” están exentas: ciegas o con discapacidad, o con un trastorno por uso de sustancias, una enfermedad mental incapacitante, o una condición médica grave o compleja. Según la regla de CMS, la condición también debe hacer mucho más difícil cumplir la regla. 26 estados, entre ellos California, demandaron por ese límite. Tener una discapacidad no requiere recibir beneficios por discapacidad.",
    },
    {
      id: "hardship",
      cite: "SSA §1902(xx)(3)(B); 42 CFR 435.555; DHCS H.R. 1 Implementation Plan",
      en: "Short-term exceptions California will offer: any month you stayed in a hospital, nursing home or psychiatric hospital, even a few days, or had to travel far for a long time for serious medical care (ask for these); and living in a county with a federal disaster declaration or very high unemployment (applied automatically).",
      es: "Excepciones temporales que California ofrecerá: cualquier mes en que estuvo internado en un hospital, un hogar de ancianos o centro de enfermería, o un hospital psiquiátrico, aunque fueran pocos días, o tuvo que viajar lejos por mucho tiempo para atención médica seria (hay que pedirlas); y vivir en un condado con declaración federal de desastre o con desempleo muy alto (se aplican automáticamente).",
    },
    {
      id: "automatic",
      cite: "DHCS ACWDL 25-30 pp. 16–18; SSA §1902(xx)(5)",
      en: "Before asking you for anything, the county must check its own records (wages, CalFresh, CalWORKs and others). An exemption it finds there counts even if you never reported it.",
      es: "Antes de pedirle algo, el condado debe revisar sus propios registros (salarios, CalFresh, CalWORKs y otros). Una exención que encuentre ahí cuenta aunque usted nunca la haya reportado.",
    },
  ] satisfies Fact[],

  /** When it's checked. */
  when: [
    {
      id: "start",
      cite: "DHCS ACWDL 25-30 p. 2; DHCS “Medi-Cal changes” page",
      en: "New applications from January 1, 2027: the county looks at the month before you apply. If you already have Medi-Cal, it’s checked at your renewal; the state (DHCS) says these renewals start in March 2027 and come every 6 months. The county’s page still says January, so watch your mail.",
      es: "Solicitudes nuevas desde el 1 de enero de 2027: el condado revisa el mes antes de que usted solicite. Si ya tiene Medi-Cal, se revisa en su renovación; el estado (DHCS) dice que estas renovaciones empiezan en marzo de 2027 y son cada 6 meses. La página del condado todavía dice enero, así que esté pendiente de su correo.",
    },
    {
      id: "any-month",
      cite: "DHCS ACWDL 25-30 pp. 9, 13",
      en: "At a renewal, meeting the rule in any one month since your last review is enough.",
      es: "En una renovación, basta con haber cumplido la regla en cualquier mes desde su última revisión.",
    },
    {
      id: "pending",
      cite: "DHCS ACWDL 25-30 pp. 9–12",
      en: "Applying and didn’t meet it last month? If you start meeting it while your application is pending, coverage starts the 1st of the next month, with no new application. The months before that aren’t covered.",
      es: "¿Está solicitando y no cumplió el mes pasado? Si empieza a cumplir mientras su solicitud está pendiente, la cobertura empieza el día 1 del mes siguiente, sin nueva solicitud. Los meses anteriores no quedan cubiertos.",
    },
  ] satisfies Fact[],

  /** If a letter comes. */
  notice: [
    {
      id: "30-days",
      cite: "SSA §1902(xx)(6); 42 CFR 435.558; DHCS ACWDL 25-30 pp. 13, 19",
      en: "If the county can’t confirm you met the rule or are exempt, it must send a letter and give you 30 days to show it. Count the 30 days from the date printed on the letter. Your Medi-Cal continues during those days, and at a renewal you can still start a qualifying activity in that time and send proof. The county can’t end your coverage without checking every other way you qualify, and you have the right to a state fair hearing.",
      es: "Si el condado no puede confirmar que usted cumplió o está exento, debe mandarle una carta y darle 30 días para demostrarlo. Cuente los 30 días desde la fecha impresa en la carta. Su Medi-Cal sigue durante esos días, y en una renovación todavía puede empezar una actividad que cuente en ese tiempo y mandar el comprobante. El condado no puede cancelar su cobertura sin revisar todas las otras formas en que usted califica, y tiene derecho a una audiencia estatal imparcial.",
    },
    {
      id: "proof",
      cite: "42 CFR 435.557(b)(2)",
      en: "Before January 1, 2028, the county may accept your own statement when its records can’t confirm your hours. Keep pay stubs, a letter from your employer or volunteer program, or school records anyway. Nobody can be denied only because a document doesn’t exist.",
      es: "Antes del 1 de enero de 2028, el condado puede aceptar su propia declaración cuando sus registros no confirman sus horas. Aun así, guarde talones de pago, una carta de su empleador o programa de voluntariado, o comprobantes de la escuela. A nadie se le puede negar solo porque un documento no existe.",
    },
    {
      id: "90-days",
      cite: "DHCS ACWDL 25-30 p. 21",
      en: "If your Medi-Cal ends because of this rule, you have 90 days to come back without a new application by showing you met it.",
      es: "Si su Medi-Cal termina por esta regla, tiene 90 días para regresar sin nueva solicitud si demuestra que cumplió.",
    },
    {
      id: "covered-ca",
      cite: "SSA §1902(xx)(7)(B)",
      en: "Losing Medi-Cal for this rule also blocks financial help for a Covered California plan. Answer every letter. Exemptions can end too (for example when your youngest child turns 14), so plan ahead for your next renewal.",
      es: "Perder Medi-Cal por esta regla también le quita la ayuda para pagar un plan de Covered California. Conteste todas las cartas. Las exenciones también terminan (por ejemplo, cuando su hijo más pequeño cumple 14 años), así que prepárese para su próxima renovación.",
    },
  ] satisfies Fact[],

  /** Changes for immigrants (California). */
  immigrants: [
    {
      id: "freeze",
      cite: "Welf. & Inst. Code §14007.8; AB 116 (2025)",
      en: "Since January 1, 2026, adults 19 and older without a qualifying immigration status who apply for the first time can only get restricted Medi-Cal. If you already have full Medi-Cal, renew on time to keep it; if it lapses, you have 3 months to get it back. Children, pregnant people, and young people who were in foster care at 18 (until 26) can still enroll.",
      es: "Desde el 1 de enero de 2026, los adultos de 19 años o más sin un estatus migratorio que califique que solicitan por primera vez solo pueden recibir Medi-Cal restringido. Si ya tiene Medi-Cal completo, renueve a tiempo para mantenerlo; si se le vence, tiene 3 meses para recuperarlo. Los niños, las personas embarazadas, y los jóvenes que estuvieron en foster care a los 18 años (hasta los 26) todavía pueden inscribirse.",
    },
    {
      id: "dental",
      cite: "SB 164 (2026); DHCS 2026–27 Budget Act highlights",
      en: "Full dental care for those adults ends July 1, 2027. Emergency dental care stays covered. Pregnant people (and for a year after) and young people who were in foster care keep full dental.",
      es: "La atención dental completa para esos adultos termina el 1 de julio de 2027. La atención dental de emergencia sigue cubierta. Las personas embarazadas (y hasta un año después) y los jóvenes que estuvieron en foster care mantienen la dental completa.",
    },
    {
      id: "premiums",
      cite: "AB 116 (2025); SB 164 (2026)",
      en: "No sooner than July 2027, adults 19–59 in that group will pay a monthly premium to keep full Medi-Cal: between $30 and $50, not set yet. Not paying moves you to restricted Medi-Cal. Pregnant people (and for a year after) and young people who were in foster care don’t pay.",
      es: "No antes de julio de 2027, los adultos de 19 a 59 años de ese grupo pagarán una cuota mensual para mantener Medi-Cal completo: entre $30 y $50, todavía sin fijar. Si no paga, pasa a Medi-Cal restringido. Las personas embarazadas (y hasta un año después) y los jóvenes que estuvieron en foster care no pagan.",
    },
    {
      id: "refugees",
      cite: "Pub. L. 119-21 §71109; DHCS “Medi-Cal changes” page",
      en: "Refugees, asylees, parolees and some others who don’t have a green card yet lost federal Medicaid on October 1, 2026. California keeps them on full Medi-Cal, paid by the state, until June 30, 2027. From July 1, 2027, they can only get pregnancy-related and emergency care.",
      es: "Los refugiados, asilados, personas con permiso humanitario (parole) y algunos otros que todavía no tienen green card perdieron Medicaid federal el 1 de octubre de 2026. California los mantiene en Medi-Cal completo, pagado por el estado, hasta el 30 de junio de 2027. Desde el 1 de julio de 2027, solo podrán recibir atención de embarazo y de emergencia.",
    },
  ] satisfies Fact[],

  /** Said plainly in the tool: the rules are new and still being settled. */
  caveat: {
    en: "These rules are new. A lawsuit by 26 states, and more guidance from the state, may still change details before or after they start. Your county makes the final decision.",
    es: "Estas reglas son nuevas. Una demanda de 26 estados y nuevas instrucciones del estado todavía pueden cambiar detalles antes o después de que empiecen. Su condado toma la decisión final.",
  } satisfies Bilingual,
};

export const MCW_CONTACTS = {
  county: {
    name: { en: "Stanislaus County Community Services Agency (Medi-Cal), Monday–Friday 8–5", es: "Agencia de Servicios Comunitarios del Condado de Stanislaus (Medi-Cal), lunes a viernes de 8 a 5" },
    phone: "(877) 652-0734",
    url: "https://stanworks.com/hr1/index.html",
  } satisfies Contact,
  offices: {
    en: "Offices: 251 E. Hackett Rd., Modesto; 1310 W. Main St., Turlock; 1405 West F St., Ste. I, Oakdale; 101 W. Las Palmas Ave., Patterson.",
    es: "Oficinas: 251 E. Hackett Rd., Modesto; 1310 W. Main St., Turlock; 1405 West F St., Ste. I, Oakdale; 101 W. Las Palmas Ave., Patterson.",
  } satisfies Bilingual,
  benefitsCal: {
    name: { en: "BenefitsCal: renew, upload proof and get text or email alerts", es: "BenefitsCal: renueve, suba comprobantes y reciba avisos por texto o correo" },
    url: "https://benefitscal.com/",
  } satisfies Contact,
  hca: {
    name: { en: "Health Consumer Alliance: free help if you get a letter or lose Medi-Cal", es: "Health Consumer Alliance: ayuda gratis si recibe una carta o pierde Medi-Cal" },
    phone: "(888) 804-3536",
    url: "https://healthconsumer.org",
  } satisfies Contact,
  helpline: {
    name: { en: "Medi-Cal Helpline (state)", es: "Línea de Ayuda de Medi-Cal (estado)" },
    phone: "(800) 541-5555",
    url: DHCS_CHANGES,
  } satisfies Contact,
};

export const MCW_SOURCES: SourceRef[] = [
  { label: "Public Law 119-21 (H.R. 1), §71119: Medicaid community engagement (SSA §1902(xx))", url: PL_119_21 },
  { label: "CMS interim final rule CMS-2454-IFC, 91 FR 33348 (June 3, 2026)", url: CMS_RULE },
  { label: "DHCS All County Welfare Directors Letter 25-30 (work rules, preliminary)", url: ACWDL_25_30 },
  { label: "DHCS: Medi-Cal changes (member page)", url: DHCS_CHANGES },
  { label: "DHCS: immigration status and Medi-Cal eligibility (Spanish)", url: "https://www.dhcs.ca.gov/es/immigration-status-and-changes-to-medi-cal-eligibility/" },
  { label: "Stanislaus County CSA: H.R. 1 changes to Medi-Cal and CalFresh", url: "https://stanworks.com/hr1/index.html" },
  { label: "Health Consumer Alliance", url: "https://healthconsumer.org" },
];
