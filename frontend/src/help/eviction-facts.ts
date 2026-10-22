// Eviction facts with their citations, checked 2026-10-21 against the statutes
// (read on california.public.law, which mirrors leginfo and was marked
// verified 2026-10-19; leginfo blocked automated reads), the Judicial Council
// self-help guide, the DRE "California Tenants" 2026 guide, the CA Attorney
// General's eviction guide, and the Stanislaus Superior Court's own pages.
// Day-counting rules live in eviction.ts and court-days.ts.
//
// Spanish: the per-notice explanations, lockout and rights texts are the
// researcher's draft translations; the rest is ours. Have a qualified
// translator review before relying on it.
//
// RE-CHECK before 2027-01-01: AB 747 replaces CCP §415.20 and §415.45 (how
// court papers left with someone or posted are served). eviction.ts refuses to
// count those cases from then on until someone confirms the new rule.
// Also open: CRLA hours/intake (crla.org was down on 2026-10-21); local
// just-cause ordinances in Stanislaus cities were not checked.
import type { Bilingual } from "./letter-types";
import type { Fact } from "./facts";
import type { SourceRef } from "../components/help/ui";
import type { NoticeKind } from "./eviction";

const LEGINFO = (code: "CIV" | "CCP" | "GOV", section: string) =>
  `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=${code}&sectionNum=${section}`;

export interface Place {
  id: string;
  name: Bilingual;
  phone?: string;
  address?: string;
  hours?: Bilingual;
  note?: Bilingual;
  url: string;
}

/** What each kind of paper means and how its days are counted. */
const NOTICES: Record<NoticeKind, Fact> = {
  "pay-or-quit": {
    id: "pay-or-quit",
    cite: "CCP §1161(2), §1162",
    en: "You have 3 court days to pay ALL the rent the notice asks for, or move out. The days don't include the day you got it, Saturdays, Sundays or court holidays. The notice can only ask for past-due rent, with no late fees or utilities. Pay with something that gives you a receipt.",
    es: "Tiene 3 días hábiles de la corte para pagar TODA la renta que pide el aviso, o mudarse. No cuentan el día en que lo recibió, ni sábados, domingos ni feriados de la corte. El aviso solo puede pedir renta atrasada, sin cargos por pago tarde ni servicios. Pague de una forma que le dé recibo.",
  },
  "perform-or-quit": {
    id: "perform-or-quit",
    cite: "CCP §1161(3); Civ. Code §1946.2(c)",
    en: "You have 3 court days (not counting the day you got it, weekends or court holidays) to fix the problem described in the notice, or move out. Keep proof that you fixed it (photos, receipts) and tell the landlord in writing.",
    es: "Tiene 3 días hábiles de la corte (sin contar el día en que lo recibió, fines de semana ni feriados de la corte) para corregir el problema que describe el aviso, o mudarse. Guarde pruebas de que lo corrigió (fotos, recibos) y avise al dueño por escrito.",
  },
  "quit-no-cure": {
    id: "quit-no-cure",
    cite: "CCP §1161(4), §12a",
    en: "This notice does not let you fix the problem. Count every day, starting the day after you got it. If the 3rd day is a weekend or court holiday, your deadline is the next court day. Get legal help right away. You may have defenses.",
    es: "Este aviso no le permite corregir el problema. Cuente todos los días, empezando el día después de recibirlo. Si el 3er día cae en fin de semana o feriado de la corte, su plazo es el siguiente día hábil de la corte. Busque ayuda legal de inmediato; puede tener defensas.",
  },
  "30-day": {
    id: "30-day",
    cite: "Civ. Code §1946.1(c), (f)",
    en: "Count every day starting the day after you got the notice, or the day after it was mailed. If the last day is a weekend or court holiday, it moves to the next court day.",
    es: "Cuente todos los días a partir del día después de recibir el aviso o de que se envió por correo. Si el último día cae en fin de semana o feriado de la corte, pasa al siguiente día hábil.",
  },
  "60-day": {
    id: "60-day",
    cite: "Civ. Code §1946.1(b), (c)",
    en: "Same counting as a 30-day notice, but 60 days. A landlord usually must give 60 days when everyone in your home has lived there 1 year or more. If anyone has lived there less than 1 year, 30 days can be enough.",
    es: "Se cuenta igual que el aviso de 30 días, pero son 60 días. Normalmente el dueño debe dar 60 días cuando todos en su hogar han vivido ahí 1 año o más. Si alguien ha vivido ahí menos de 1 año, 30 días pueden ser suficientes.",
  },
  "90-day": {
    id: "90-day",
    cite: "Civ. Code §1954.535; CCP §1161b",
    en: "If you have Section 8 or other government rent help, the landlord usually must give 90 days and a reason. After a foreclosure, the new owner usually must give at least 90 days, and may have to honor your lease. Count every day starting the day after you got it.",
    es: "Si tiene Sección 8 u otra ayuda de renta del gobierno, normalmente el dueño debe darle 90 días y una razón. Después de una ejecución hipotecaria (foreclosure), el nuevo dueño normalmente debe darle al menos 90 días, y quizá respetar su contrato. Cuente todos los días a partir del día después de recibirlo.",
  },
  summons: {
    id: "summons",
    cite: "CCP §1167 (AB 2347); CCP §415.20(b), §415.45",
    en: "This means the landlord has filed an eviction case in court. You must file a written Answer (form UD-105) by the deadline. If you don't, the landlord can win automatically, without a trial.",
    es: "Esto quiere decir que el dueño ya presentó un caso de desalojo en la corte. Debe presentar una Respuesta por escrito (formulario UD-105) antes del plazo. Si no lo hace, el dueño puede ganar automáticamente, sin juicio.",
  },
};

export const EVICTION_FACTS = {
  checked: "2026-10-21",
  notices: NOTICES,

  /** After a notice (not court papers): what the deadline does and doesn't mean. */
  afterNotice: [
    {
      id: "court-only",
      cite: "Civ. Code §789.3",
      en: "You do not have to move out by this date. A notice is not a court order. Only a court can order an eviction, and only a sheriff can remove you.",
      es: "No tiene que mudarse para esta fecha. Un aviso no es una orden de la corte. Solo una corte puede ordenar un desalojo, y solo el sheriff puede sacarlo.",
    },
    {
      id: "lockout",
      cite: "Civ. Code §789.3",
      en: "Your landlord can NOT change the locks, take your things, remove doors or windows, or cut off water, power or gas to make you leave. If this happens, call the police non-emergency line and legal aid. You can sue for your losses plus up to $100 per day (at least $250).",
      es: "Su dueño NO puede cambiar las cerraduras, sacar sus cosas, quitar puertas o ventanas, ni cortar el agua, la luz o el gas para obligarlo a irse. Si pasa, llame a la policía (línea que no es de emergencia) y a asistencia legal. Puede demandar por sus pérdidas más hasta $100 por día (mínimo $250).",
    },
    {
      id: "just-cause",
      cite: "Civ. Code §1946.2",
      en: "If you have lived in your home 12 months or more, most landlords must have a legal reason to end your tenancy, and must write it in the notice. If the reason is not your fault (for example, the owner moving in or a major remodel), the landlord must pay you one month's rent or waive your last month. If they don't, the notice is void.",
      es: "Si ha vivido en su casa 12 meses o más, la mayoría de los dueños deben tener una razón legal para terminar su contrato y escribirla en el aviso. Si la razón no es su culpa (por ejemplo, el dueño se muda ahí o una remodelación mayor), el dueño debe pagarle un mes de renta o perdonarle el último mes. Si no lo hace, el aviso no es válido.",
    },
  ] satisfies Fact[],

  /** Court papers: the steps to answer in Stanislaus. */
  summonsSteps: [
    {
      id: "answer",
      cite: "CCP §1167; form UD-105",
      en: "Fill out the Answer, form UD-105 (if you need more space, attach form MC-025). File it at the court by the deadline. The Self-Help Center can help you fill it out.",
      es: "Llene la Respuesta, formulario UD-105 (si necesita más espacio, adjunte el formulario MC-025). Preséntela en la corte antes del plazo. El Centro de Ayuda le puede ayudar a llenarla.",
    },
    {
      id: "fee-waiver",
      cite: "Form FW-001",
      en: "Filing costs about $240 to $450 per person. If you can't pay, file form FW-001 (Request to Waive Court Fees) with your Answer. Your information on it is kept confidential.",
      es: "Presentar cuesta entre $240 y $450 por persona, más o menos. Si no puede pagar, presente el formulario FW-001 (Solicitud de exención de cuotas) junto con su Respuesta. Su información en ese formulario es confidencial.",
    },
    {
      id: "default",
      cite: "Form CIV-100",
      en: "If you miss the deadline, the landlord can ask for a default (form CIV-100) and win without a trial. If they haven't asked yet, you can still file your Answer — do it right away.",
      es: "Si no cumple el plazo, el dueño puede pedir un fallo por incumplimiento (formulario CIV-100) y ganar sin juicio. Si todavía no lo ha pedido, aún puede presentar su Respuesta; hágalo de inmediato.",
    },
    {
      id: "other-responses",
      cite: "Motion to Quash; Demurrer",
      en: "Instead of an Answer, a lawyer may file a Motion to Quash (the papers were served wrong) or a Demurrer (the complaint has legal problems). Get legal help for these.",
      es: "En lugar de una Respuesta, un abogado puede presentar una moción para anular la entrega (Motion to Quash) o una objeción (Demurrer). Pida ayuda legal para esto.",
    },
    {
      id: "after-judgment",
      cite: "CCP §715.010(b)(2), §715.020(c)",
      en: "If you lose, the sheriff posts a Notice to Vacate. You have 5 days (count every day, starting the day after). The lockout can happen as soon as day 6. Ask legal aid right away about asking the court for more time.",
      es: "Si pierde, el sheriff pega un Aviso de Desalojo. Tiene 5 días (cuente todos los días, empezando el día siguiente). El sheriff puede sacarlo desde el día 6. Pida ayuda legal de inmediato para solicitar más tiempo a la corte.",
    },
  ] satisfies Fact[],

  /** Protections that apply whatever paper you got. */
  rights: [
    {
      id: "retaliation",
      cite: "Civ. Code §1942.5",
      en: "Your landlord can't evict you, raise your rent or cut services to punish you for asking for repairs, complaining to the city, or joining a tenant group. Threatening to call immigration on you is illegal retaliation.",
      es: "Su dueño no puede desalojarlo, subirle la renta ni quitarle servicios para castigarlo por pedir reparaciones, quejarse con la ciudad o unirse a un grupo de inquilinos. Amenazar con llamar a inmigración es una represalia ilegal.",
    },
    {
      id: "immigration",
      cite: "Civ. Code §§1940.2, 1940.3, 1940.35; CCP §1161.4",
      en: "Your immigration status does not matter for your rights as a tenant. Your landlord can't ask about it, threaten to report you, or evict you because of it. If they report you to harass you or push you out, they can owe 6 to 12 months' rent per person.",
      es: "Su estatus migratorio no cambia sus derechos como inquilino. Su dueño no puede preguntar por él, amenazar con reportarlo ni desalojarlo por eso. Si lo reporta para acosarlo o sacarlo, puede deber de 6 a 12 meses de renta por persona.",
    },
    {
      id: "discrimination",
      cite: "Gov. Code §12955 (FEHA)",
      en: "It's illegal to evict or treat you differently because of your race, national origin, immigration status, language, disability, family with children, use of a housing voucher, and more. Civil Rights Department: (800) 884-1684.",
      es: "Es ilegal desalojarlo o tratarlo diferente por su raza, origen nacional, estatus migratorio, idioma, discapacidad, tener hijos, usar un vale (voucher) de vivienda, y más. Departamento de Derechos Civiles: (800) 884-1684.",
    },
  ] satisfies Fact[],

  /** Free help, most useful first. */
  places: {
    crla: {
      id: "crla",
      name: { en: "California Rural Legal Assistance (CRLA), Modesto", es: "California Rural Legal Assistance (CRLA), Modesto" },
      phone: "(209) 577-3811",
      address: "1020 15th St, Suite 22, Modesto, CA 95354",
      note: { en: "Free legal help for low-income residents. Call as soon as you can.", es: "Ayuda legal gratis para personas de bajos ingresos. Llame lo antes posible." },
      url: "https://crla.org/locations",
    },
    selfHelp: {
      id: "self-help",
      name: { en: "Stanislaus Court Self-Help Center", es: "Centro de Ayuda de la Corte de Stanislaus" },
      phone: "(209) 548-6237",
      address: "800 11th St, Room 220, Modesto, CA",
      hours: {
        en: "Walk in Mon–Fri, 8:00 a.m.–12:00 p.m. and 1:00–4:00 p.m. (first come, first served; plan for half a day). The phone is a voicemail; calls are returned on Wednesdays.",
        es: "Sin cita de lunes a viernes, de 8:00 a.m. a 12:00 p.m. y de 1:00 a 4:00 p.m. (por orden de llegada; calcule medio día). El teléfono es un buzón de voz; devuelven las llamadas los miércoles.",
      },
      note: {
        en: "Free help with court forms like the Answer. Staff are neutral, not your lawyer, and what you say there is not confidential.",
        es: "Ayuda gratis con formularios de la corte, como la Respuesta. El personal es neutral, no es su abogado, y lo que diga ahí no es confidencial.",
      },
      url: "https://www.stanislaus.courts.ca.gov/self-help/self-help-center-info",
    },
    turlock: {
      id: "turlock",
      name: { en: "Where to file: Stanislaus Superior Court, Turlock Division", es: "Dónde presentar: Corte Superior de Stanislaus, División de Turlock" },
      phone: "(209) 530-3100",
      address: "300 Starr Ave, Turlock, CA 95380",
      hours: {
        en: "Clerk Mon–Fri 8:15 a.m.–4:00 p.m. Phones 8:15 a.m.–3:00 p.m. Drop box 8:00 a.m.–4:00 p.m.",
        es: "Ventanilla de lunes a viernes, 8:15 a.m. a 4:00 p.m. Teléfonos de 8:15 a.m. a 3:00 p.m. Buzón de documentos de 8:00 a.m. a 4:00 p.m.",
      },
      note: {
        en: "Eviction cases are filed in TURLOCK, not at the Modesto courthouse.",
        es: "Los casos de desalojo se presentan en TURLOCK, no en la corte de Modesto.",
      },
      url: "https://www.stanislaus.courts.ca.gov/general-information/court-hours-holidays/operating-hours",
    },
    sentinel: {
      id: "sentinel",
      name: { en: "Project Sentinel (tenant-landlord counseling and fair housing)", es: "Project Sentinel (asesoría entre inquilinos y dueños, y vivienda justa)" },
      phone: "(800) 339-6043",
      address: "1231 8th St, Ste 425, Modesto",
      note: { en: "Counseling is by appointment. Discrimination line: (888) 324-7468.", es: "La asesoría es con cita. Línea de discriminación: (888) 324-7468." },
      url: "https://www.housing.org/contact",
    },
  } satisfies Record<string, Place>,

  forms: {
    answer: "https://courts.ca.gov/sites/default/files/courts/default/2024-11/ud105.pdf",
    respond: "https://selfhelp.courts.ca.gov/eviction-tenant/respond",
    feeWaiver: "https://selfhelp.courts.ca.gov/fee-waiver",
  },
};

export const EVICTION_SOURCES: SourceRef[] = [
  { label: "CCP §1161 (3-day notices)", url: LEGINFO("CCP", "1161") },
  { label: "CCP §1162 (how notices are served)", url: LEGINFO("CCP", "1162") },
  { label: "CCP §1167 (10 court days to answer)", url: LEGINFO("CCP", "1167") },
  { label: "CCP §12, §12a, §135 (counting days, court holidays)", url: LEGINFO("CCP", "12a") },
  { label: "Civil Code §1946.1 (30/60-day notices)", url: LEGINFO("CIV", "1946.1") },
  { label: "Civil Code §1946.2 (just cause)", url: LEGINFO("CIV", "1946.2") },
  { label: "Civil Code §789.3 (illegal lockouts)", url: LEGINFO("CIV", "789.3") },
  { label: "Civil Code §1942.5 (retaliation)", url: LEGINFO("CIV", "1942.5") },
  { label: "Civil Code §1940.35 (immigration-status threats)", url: LEGINFO("CIV", "1940.35") },
  { label: "Judicial Council: court holidays 2026–2027", url: "https://courts.ca.gov/about/court-holidays" },
  { label: "California Courts self-help: eviction notices", url: "https://selfhelp.courts.ca.gov/types-eviction-notices" },
  { label: "California Courts self-help: respond to an eviction case", url: "https://selfhelp.courts.ca.gov/eviction-tenant/respond" },
  { label: "Stanislaus Superior Court: hours and holidays", url: "https://www.stanislaus.courts.ca.gov/general-information/court-hours-holidays" },
  { label: "Stanislaus Superior Court: Self-Help Center", url: "https://www.stanislaus.courts.ca.gov/self-help/self-help-center-info" },
  { label: "CA Dept. of Real Estate: California Tenants guide (2026)", url: "https://lsnc.net/sites/default/files/inline-images/2026_Landlord_Tenant_Guide.pdf" },
  { label: "CA Attorney General: Know your rights, evictions", url: "https://www.oag.ca.gov/system/files/media/Know-Your-Rights-Eviction-Process-English.pdf" },
];
