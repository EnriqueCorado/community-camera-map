// Community & immigrant services pack (backend app/layers/national/services.py):
// colors, popups and official links for its layers. Self-contained (own
// EN/ES strings, no runtime imports) so other packs can grow independently.
// Properties use the pack's compact names: n name · o office · g organization
// · a street · c city · s state · p phone · rp enrollment phone · t type ·
// k site kind · l languages · sv services · es Spanish · sf sliding fee ·
// fo ICE field office · pop average population · u college id · d/d0/d1/bt/lt
// summer-meal days, dates and times · x approximate location. Medicare Care
// Compare layers (backend national/care_compare.py) add: id CMS certification
// number · st stars · ss survey stars · ow ownership · er emergency · bf
// birthing-friendly · ns stations · ls evening shift · sv service bit flags.
// Marketplace assisters (backend national/help_offices.py) use t as
// space-separated type codes, d hours, web website and x 2 = area served (CMS
// lists no public address, so the point is only near the area). Consulates
// (backend national/consulates.py) use cc country (ISO 3166 alpha-2) · t kind
// · pl place · web office page · ap appointments page · dl the government's
// consulate list · hl help line (every link is re-checked against the
// country's own hosts).
import type { Lang } from "./i18n"; // type-only: erased at build

export const SERVICE_COLORS: Record<string, string> = {
  "immigration-legal-help": "#0d9488",
  "detention-centers": "#7f1d1d",
  "immigration-offices": "#4338ca",
  "health-centers": "#db2777",
  "head-start": "#f59e0b",
  "early-head-start": "#fb923c",
  "job-centers": "#2563eb",
  "mental-health": "#8b5cf6",
  "addiction-treatment": "#6d28d9",
  "housing-counseling": "#059669",
  "public-housing": "#65a30d",
  colleges: "#1e40af",
  "va-facilities": "#334155",
  "border-ports": "#b45309",
  "summer-meals": "#ea580c",
  "social-security-offices": "#0369a1",
  "legal-aid-areas": "#0f766e",
  "post-offices": "#475569",
  "dialysis-facilities": "#0e7490",
  "hospice-providers": "#a21caf",
  "home-health-agencies": "#15803d",
  "hospital-ratings": "#b91c1c",
  "marketplace-assisters": "#9333ea",
  consulates: "#e11d48",
};

type Bi = [en: string, es: string];
const HEAD_START: [string, Bi] = ["https://headstart.gov/center-locator", ["Head Start center locator", "Buscador de centros Head Start"]];
const TREATMENT: [string, Bi] = ["https://findtreatment.gov/", ["FindTreatment.gov", "FindTreatment.gov (en español)"]];
const CARE_COMPARE: [string, Bi] = ["https://www.medicare.gov/care-compare/", ["Compare on Medicare Care Compare", "Comparar en Care Compare de Medicare"]];
/** Medicare Care Compare layers (star ratings, CMS ids, services). */
const CARE_LAYERS = new Set(["dialysis-facilities", "hospice-providers", "home-health-agencies", "hospital-ratings"]);

/** Official page for each layer (all https, government hosts). */
const LINKS: Record<string, [string, Bi]> = {
  "immigration-legal-help": [
    "https://www.justice.gov/eoir/recognized-organizations-and-accredited-representatives-roster-state-and-city",
    ["DOJ roster of recognized organizations", "Lista del DOJ de organizaciones reconocidas"],
  ],
  "detention-centers": ["https://locator.ice.gov/odls/", ["ICE online detainee locator", "Localizador de detenidos de ICE"]],
  "health-centers": ["https://findahealthcenter.hrsa.gov/", ["Find a health center (HRSA)", "Buscar un centro de salud (HRSA)"]],
  "head-start": HEAD_START,
  "early-head-start": HEAD_START,
  "job-centers": [
    "https://www.careeronestop.org/LocalHelp/AmericanJobCenters/find-american-job-centers.aspx",
    ["American Job Center finder", "Buscador de centros de empleo"],
  ],
  "mental-health": TREATMENT,
  "addiction-treatment": TREATMENT,
  "housing-counseling": ["https://www.hud.gov/findacounselor", ["Find a HUD housing counselor", "Buscar un asesor de vivienda de HUD"]],
  "public-housing": [
    "https://www.hud.gov/program_offices/public_indian_housing/pha/contacts",
    ["HUD list of housing authorities", "Lista de autoridades de vivienda de HUD"],
  ],
  "va-facilities": ["https://www.va.gov/find-locations/", ["Find VA locations", "Buscar centros del VA"]],
  "border-ports": ["https://bwt.cbp.gov/", ["Border wait times (CBP)", "Tiempos de espera en la frontera (CBP)"]],
  "summer-meals": ["https://www.fns.usda.gov/summer/sitefinder", ["USDA summer meal site finder", "Buscador de comidas de verano (USDA)"]],
  "social-security-offices": ["https://secure.ssa.gov/ICON/main.jsp", ["Social Security office locator", "Buscador de oficinas del Seguro Social"]],
  "legal-aid-areas": ["https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help", ["Find legal aid (LSC)", "Buscar ayuda legal (LSC)"]],
  "post-offices": ["https://tools.usps.com/locations/", ["USPS location finder (hours)", "Buscador de oficinas de USPS (horario)"]],
  "marketplace-assisters": [
    "https://www.healthcare.gov/find-assistance/",
    ["Find local help (HealthCare.gov)", "Buscar ayuda local (CuidadoDeSalud.gov)"],
  ],
  "dialysis-facilities": CARE_COMPARE,
  "hospice-providers": CARE_COMPARE,
  "home-health-agencies": CARE_COMPARE,
  "hospital-ratings": CARE_COMPARE,
};
/** Spanish pages, where the official site has its own (CuidadoDeSalud.gov). */
const LINKS_ES: Record<string, string> = {
  "marketplace-assisters": "https://www.cuidadodesalud.gov/es/find-assistance/",
};
const COLLEGE_NAVIGATOR = "https://nces.ed.gov/collegenavigator/?id=";
/** Hand-kept immigration offices link to the official page each row came from. */
const OFFICE_PAGES = ["https://www.justice.gov/eoir/", "https://www.ice.gov/"];

/** Consulates: the exact hosts each country's links may use, its own
 *  government domains only (an embassy site on a .org/.com domain isn't
 *  here). Mirrors backend national/consulates.py OFFICIAL_HOSTS; backend
 *  tests/test_consulates.py fails if the two drift. */
export const CONSULATE_HOSTS: Record<string, string[]> = {
  BR: ["www.gov.br", "econsular.itamaraty.gov.br"],
  CN: ["us.china-embassy.gov.cn", "newyork.china-consulate.gov.cn", "sanfrancisco.china-consulate.gov.cn", "losangeles.china-consulate.gov.cn", "chicago.china-consulate.gov.cn"],
  CO: [
    "atlanta.consulado.gov.co", "boston.consulado.gov.co", "chicago.consulado.gov.co", "houston.consulado.gov.co", "losangeles.consulado.gov.co", "miami.consulado.gov.co",
    "newark.consulado.gov.co", "nuevayork.consulado.gov.co", "orlando.consulado.gov.co", "sanfrancisco.consulado.gov.co", "sanjuan.consulado.gov.co", "washington.consulado.gov.co",
    "tramites.cancilleria.gov.co",
  ],
  CU: ["misiones.cubaminrex.cu"],
  DO: ["usa.mirex.gob.do", "consultas.mirex.gob.do"],
  EC: ["www.cancilleria.gob.ec", "citas.cancilleria.gob.ec"],
  GT: ["www.embaguateusa.gob.gt"],
  HN: ["sreci.gob.hn"],
  HT: ["ambetatsunis.gouv.ht", "cgatlanta.gouv.ht", "cgboston.gouv.ht", "cgchicago.gouv.ht", "cgmiami.gouv.ht", "cgnewyork.gouv.ht", "conorlando.gouv.ht", "mae.gouv.ht"],
  IN: ["indianembassyusa.gov.in", "www.indiainnewyork.gov.in", "www.cgisf.gov.in", "www.cgichicago.gov.in", "www.cgihouston.gov.in", "indiainatlanta.gov.in", "indiainseattle.gov.in", "www.indiainla.gov.in"],
  KR: ["overseas.mofa.go.kr"],
  MX: ["consulmex.sre.gob.mx", "citas.sre.gob.mx", "www.gob.mx"],
  PE: ["www.gob.pe"],
  PH: ["honolulupcg.dfa.gov.ph", "houstonpcg.dfa.gov.ph"],
  SV: ["rree.gob.sv", "www.rree.gob.sv"],
  UA: ["mfa.gov.ua", "usa.mfa.gov.ua", "ny.mfa.gov.ua", "chicago.mfa.gov.ua", "san-francisco.mfa.gov.ua", "houston.mfa.gov.ua", "online.mfa.gov.ua"],
};
/** The U.S. State Department's consular contact page for each country
 *  (travel.state.gov, ".../ConsularNotificationandAccess/<slug>.html"): the
 *  fallback link. Mirrors backend consulates.py ROSTER_SLUGS. */
export const CONSULATE_ROSTER: Record<string, string> = {
  AF: "Afghanistan",
  BR: "Brazil",
  CN: "China",
  CO: "Colombia",
  CU: "Cuba",
  DO: "DominicanRepublic",
  EC: "Ecuador",
  GT: "Guatemala",
  HN: "Honduras",
  HT: "Haiti",
  IN: "India",
  KR: "KoreaRepublicof",
  MX: "Mexico",
  NI: "Nicaragua",
  PE: "Peru",
  PH: "Philippines",
  SV: "ElSalvador",
  UA: "Ukraine",
  VE: "VenezuelaBolivarianRepublicof",
  VN: "VietNam",
};
const ROSTER_PAGE = "https://travel.state.gov/content/travel/en/consularnotification/ConsularNotificationandAccess/";
const ROSTER_HOSTS = ["travel.state.gov"];
const CONSULATE_NAMES: Record<string, Bi> = {
  AF: ["Afghanistan", "Afganistán"],
  BR: ["Brazil", "Brasil"],
  CN: ["China", "China"],
  CO: ["Colombia", "Colombia"],
  CU: ["Cuba", "Cuba"],
  DO: ["the Dominican Republic", "la República Dominicana"],
  EC: ["Ecuador", "Ecuador"],
  GT: ["Guatemala", "Guatemala"],
  HN: ["Honduras", "Honduras"],
  HT: ["Haiti", "Haití"],
  IN: ["India", "India"],
  KR: ["the Republic of Korea", "Corea del Sur"],
  MX: ["Mexico", "México"],
  NI: ["Nicaragua", "Nicaragua"],
  PE: ["Peru", "Perú"],
  PH: ["the Philippines", "Filipinas"],
  SV: ["El Salvador", "El Salvador"],
  UA: ["Ukraine", "Ucrania"],
  VE: ["Venezuela", "Venezuela"],
  VN: ["Vietnam", "Vietnam"],
};
/** Country-specific notes (official sources in backend data/consulates.json). */
const CONSULATE_NOTES: Record<string, Bi> = {
  // gob.mx/sre "Matrícula Consular de Alta Seguridad"; appointments on citas.sre.gob.mx
  MX: [
    "Mexican consulates issue Mexican passports and the matrícula consular (a high-security consular ID card) to Mexican citizens, by appointment through MiConsulado.",
    "Los consulados de México expiden pasaportes mexicanos y la matrícula consular de alta seguridad (identificación consular) a personas mexicanas, con cita a través de MiConsulado.",
  ],
};

/** Hosts this pack links to (merged into the popup link allowlist). */
// (Consulate links carry their own country's host list instead: see consulateLink.)
export const SERVICE_LINK_HOSTS: string[] = [
  ...new Set(
    [...Object.values(LINKS).map(([u]) => u), ...Object.values(LINKS_ES), COLLEGE_NAVIGATOR, ...OFFICE_PAGES].map((u) => new URL(u).hostname),
  ),
];

/** A short note per layer, shown in every popup of that layer. */
const NOTES: Record<string, Bi> = {
  "immigration-legal-help": [
    "Nonprofit recognized by the U.S. Justice Department. Never pay a “notario” for immigration help.",
    "Organización sin fines de lucro reconocida por el Departamento de Justicia. Nunca le pague a un “notario” por ayuda de inmigración.",
  ],
  "detention-centers": [
    "To find a detained relative, use ICE’s online detainee locator (name and country of birth, or A-number).",
    "Para encontrar a un familiar detenido, use el localizador de detenidos de ICE (nombre y país de nacimiento, o número A).",
  ],
  "health-centers": [
    "Care whether or not you can pay; fees are based on income.",
    "Atención aunque no pueda pagar; el costo depende de sus ingresos.",
  ],
  "head-start": ["Free for eligible families. Call the program to apply.", "Gratis para familias que califican. Llame al programa para inscribirse."],
  "early-head-start": ["Free for eligible families. Call the program to apply.", "Gratis para familias que califican. Llame al programa para inscribirse."],
  "job-centers": ["Free help finding work, training and benefits.", "Ayuda gratuita para buscar trabajo, capacitación y beneficios."],
  "mental-health": ["In a crisis, call or text 988 (press 2 for Spanish).", "En una crisis, llame o envíe un texto al 988 (marque 2 para español)."],
  "addiction-treatment": [
    "Free, confidential helpline (English and Spanish): 1-800-662-4357.",
    "Línea de ayuda gratuita y confidencial (inglés y español): 1-800-662-4357.",
  ],
  "housing-counseling": ["Free or low-cost advice from a HUD-approved agency.", "Asesoría gratuita o de bajo costo de una agencia aprobada por HUD."],
  "public-housing": [
    "Apply here for public housing or Section 8 vouchers (waiting lists may be closed).",
    "Solicite aquí vivienda pública o vales de Sección 8 (las listas de espera pueden estar cerradas).",
  ],
  "summer-meals": ["Free meals for kids and teens 18 and under.", "Comidas gratis para niños y jóvenes de 18 años o menos."],
  "social-security-offices": [
    "Many services are faster online at ssa.gov or by phone: 1-800-772-1213 (Spanish available).",
    "Muchos trámites son más rápidos en ssa.gov o por teléfono: 1-800-772-1213 (hay servicio en español).",
  ],
  "legal-aid-areas": [
    "Free civil legal help (eviction, benefits, family, domestic violence) for people with low incomes. Call the intake line.",
    "Ayuda legal civil gratuita (desalojos, beneficios, familia, violencia doméstica) para personas de bajos ingresos. Llame a la línea de admisión.",
  ],
  "marketplace-assisters": [
    "Free help from trained, certified helpers: they can’t charge you. Call first to make an appointment. Open enrollment starts November 1.",
    "Ayuda gratuita de personas capacitadas y certificadas: no le pueden cobrar. Llame antes para hacer una cita. La inscripción abierta empieza el 1 de noviembre.",
  ],
  "post-offices": [
    "Many post offices also accept passport applications; check the USPS finder.",
    "Muchas oficinas de correos también aceptan solicitudes de pasaporte; consulte el buscador de USPS.",
  ],
  "dialysis-facilities": [
    "Stars are Medicare’s quality-of-care rating (1 to 5). Ask your kidney doctor which center and type of dialysis fit you.",
    "Las estrellas son la calificación de calidad de Medicare (de 1 a 5). Pregunte a su médico de los riñones qué centro y tipo de diálisis le convienen.",
  ],
  "hospice-providers": [
    "Hospice care usually comes to the home. Stars come from a survey of patients’ families (1 to 5).",
    "Los cuidados de hospicio suelen darse en el hogar. Las estrellas vienen de una encuesta a las familias de los pacientes (de 1 a 5).",
  ],
  "home-health-agencies": [
    "Agencies send nurses and therapists to the home. Check which agencies serve your ZIP code on Care Compare.",
    "Las agencias envían enfermeras y terapeutas al hogar. Consulte en Care Compare qué agencias atienden su código postal.",
  ],
  "hospital-ratings": [
    "In an emergency, call 911. Stars are Medicare’s overall hospital rating (1 to 5).",
    "En una emergencia, llame al 911. Las estrellas son la calificación general de hospitales de Medicare (de 1 a 5).",
  ],
};

/** Notes for the hand-kept offices, by kind. */
const OFFICE_NOTES: Record<string, Bi> = {
  court: [
    "Check your case and hearing date: 1-800-898-7180 or acis.eoir.justice.gov.",
    "Consulte su caso y la fecha de su audiencia: 1-800-898-7180 o acis.eoir.justice.gov.",
  ],
  ice: [
    "ICE detention reporting and information line: 1-888-351-4024.",
    "Línea de información sobre detenciones de ICE: 1-888-351-4024.",
  ],
};
const OFFICE_LINKS: Record<string, Bi> = {
  court: ["Court page (DOJ EOIR)", "Página de la corte (DOJ EOIR)"],
  ice: ["ICE field offices", "Oficinas de campo de ICE"],
};

const LABELS: Record<string, Bi> = {
  office: ["Office", "Oficina"],
  org: ["Organization", "Organización"],
  program: ["Program", "Programa"],
  sponsor: ["Sponsor", "Patrocinador"],
  type: ["Type", "Tipo"],
  address: ["Address", "Dirección"],
  city: ["City", "Ciudad"],
  phone: ["Phone", "Teléfono"],
  enroll: ["Enrollment phone", "Teléfono de inscripción"],
  languages: ["Languages", "Idiomas"],
  services: ["Services", "Servicios"],
  spanish: ["Services in Spanish", "Servicios en español"],
  sliding: ["Sliding fee by income", "Pago según ingresos"],
  both: ["Also treats", "También trata"],
  fieldOffice: ["ICE field office", "Oficina de campo de ICE"],
  population: ["People held (daily average)", "Personas detenidas (promedio diario)"],
  dates: ["Dates", "Fechas"],
  days: ["Days", "Días"],
  hours: ["Hours", "Horario"],
  website: ["Website", "Sitio web"],
  breakfast: ["Breakfast", "Desayuno"],
  lunch: ["Lunch", "Almuerzo"],
  location: ["Location", "Ubicación"],
  note: ["Note", "Nota"],
  yes: ["Yes", "Sí"],
  approx: ["Approximate (ZIP code area)", "Aproximada (zona del código postal)"],
  area: ["Serves this area (no public address: call for a place to meet)", "Atiende esta zona (sin dirección pública: llame para saber dónde reunirse)"],
  bothMh: ["Substance use", "Adicciones"],
  bothSu: ["Mental health", "Salud mental"],
  stars: ["Medicare star rating", "Calificación de Medicare"],
  quality: ["Quality of care", "Calidad de la atención"],
  survey: ["Patient survey", "Encuesta a pacientes"],
  familySurvey: ["Family survey", "Encuesta a familias"],
  outOf: ["of 5", "de 5"],
  notRated: ["Not rated", "Sin calificación"],
  ownership: ["Ownership", "Tipo de propiedad"],
  emergency: ["Emergency room", "Sala de emergencias"],
  birthing: ["Birthing-friendly (Medicare)", "Buena atención de partos (Medicare)"],
  stations: ["Dialysis stations", "Estaciones de diálisis"],
  evening: ["Evening shift (after 5 pm)", "Turno de tarde-noche (después de las 5 p. m.)"],
  company: ["Company", "Empresa"],
  medicareId: ["Medicare provider number (CCN)", "Número de proveedor de Medicare (CCN)"],
  no: ["No", "No"],
  appointments: ["Appointments", "Citas"],
  helpLine: ["24-hour help line", "Línea de ayuda 24 horas"],
};
const CONSULATE_NOTE: Bi = [
  "Consulates issue passports and ID documents to their citizens and can help citizens who are detained or in an emergency. Call or make an appointment before you go.",
  "Los consulados emiten pasaportes y documentos de identidad a sus ciudadanos y pueden ayudar a los que están detenidos o en una emergencia. Llame o haga una cita antes de ir.",
];
const CONSULATE_LINKS: Record<"web" | "ap" | "dl" | "roster", Bi> = {
  web: ["Official consulate page", "Página oficial del consulado"],
  ap: ["Make an appointment (official site)", "Hacer una cita (sitio oficial)"],
  dl: ["Official list of consulates", "Lista oficial de consulados"],
  roster: ["Contact info (U.S. State Department)", "Contactos (Departamento de Estado de EE. UU.)"],
};
const CONSULATE_TITLES: Record<string, Bi> = {
  "consulate-general": ["Consulate General", "Consulado General"],
  consulate: ["Consulate", "Consulado"],
  "consular-agency": ["Consular Office", "Oficina Consular"],
};
/** The office's name in the popup's language. */
function consulateTitle(cc: string, kind: string, place: string, i: 0 | 1): string {
  const country = CONSULATE_NAMES[cc]?.[i] ?? cc;
  if (kind === "consular-section") return i ? `Embajada de ${country}: sección consular` : `Embassy of ${country}: consular section`;
  const head = (CONSULATE_TITLES[kind] ?? CONSULATE_TITLES.consulate!)[i];
  return i ? `${head} de ${country} en ${place}` : `${head} of ${country} in ${place}`;
}
/** `v` if it's an https URL on one of the country's official hosts, else "". */
export function consulateUrl(cc: string, v: unknown): string {
  if (typeof v !== "string") return "";
  try {
    const u = new URL(v.trim());
    const ok = u.protocol === "https:" && (CONSULATE_HOSTS[cc] ?? []).includes(u.hostname) && !u.username && !u.password;
    return ok ? u.href : "";
  } catch {
    return "";
  }
}
/** A consulate's single popup link: its own official page, else the official
 *  appointment site, else the government's consulate list, else the State
 *  Department's page for that country. */
function consulateLink(cc: string, p: Record<string, unknown>, i: 0 | 1): ServicePopup["link"] {
  // Each link carries its own allowlist, so these hosts never widen what
  // other layers' data may link to.
  const hosts = CONSULATE_HOSTS[cc] ?? [];
  for (const k of ["web", "ap", "dl"] as const) {
    const href = consulateUrl(cc, p[k]);
    if (href) return { href, label: CONSULATE_LINKS[k][i], hosts };
  }
  const slug = CONSULATE_ROSTER[cc];
  return slug ? { href: `${ROSTER_PAGE}${slug}.html`, label: CONSULATE_LINKS.roster[i], hosts: ROSTER_HOSTS } : undefined;
}

/** Care Compare codes -> words: ownership and the services each place offers. */
const OWNERSHIP: Record<string, Bi> = {
  fp: ["For-profit", "Con fines de lucro"],
  np: ["Nonprofit", "Sin fines de lucro"],
  gov: ["Government", "Gobierno"],
  tribal: ["Tribal", "Tribal"],
};
/** `sv` is a sum of these bit flags, in this order (backend _care_compare_parse.py). */
const CARE_SERVICES: Record<string, Bi[]> = {
  "dialysis-facilities": [
    ["In-center hemodialysis", "Hemodiálisis en el centro"],
    ["Peritoneal dialysis (at home)", "Diálisis peritoneal (en casa)"],
    ["Home hemodialysis training", "Capacitación para hemodiálisis en casa"],
  ],
  "home-health-agencies": [
    ["Nursing", "Enfermería"],
    ["Physical therapy", "Fisioterapia"],
    ["Occupational therapy", "Terapia ocupacional"],
    ["Speech therapy", "Terapia del habla"],
    ["Medical social services", "Servicios sociales médicos"],
    ["Home health aide", "Asistente de salud en el hogar"],
  ],
};

/** Type codes per layer -> readable labels (unknown codes are shown as-is). */
const TYPES: Record<string, Record<string, Bi>> = {
  "detention-centers": {
    CDF: ["Contract detention facility", "Centro de detención por contrato"],
    IGSA: ["Local jail (IGSA agreement)", "Cárcel local (acuerdo IGSA)"],
    DIGSA: ["Dedicated local facility (DIGSA)", "Centro local dedicado (DIGSA)"],
    SPC: ["ICE service processing center", "Centro de procesamiento de ICE"],
    "USMS IGA": ["Jail used by U.S. Marshals", "Cárcel usada por el Servicio de Alguaciles"],
    "USMS CDF": ["U.S. Marshals contract facility", "Centro por contrato del Servicio de Alguaciles"],
    STAGING: ["Staging (transfer) facility", "Centro de traslado"],
    STATE: ["State prison", "Prisión estatal"],
    BOP: ["Federal prison (BOP)", "Prisión federal (BOP)"],
    FAMILY: ["Family residential center", "Centro residencial familiar"],
  },
  "head-start": {
    m: ["Migrant & seasonal", "Para familias migrantes y de temporada"],
    ai: ["American Indian / Alaska Native", "Indígenas de EE. UU. y nativos de Alaska"],
  },
  "job-centers": {
    comp: ["Comprehensive center", "Centro integral"],
    aff: ["Affiliate center", "Centro afiliado"],
  },
  "health-centers": {
    School: ["School-based clinic", "Clínica escolar"],
    Hospital: ["Hospital-based clinic", "Clínica en hospital"],
    "All Other Clinic Types": ["Clinic", "Clínica"],
    "Nursing Home": ["Nursing home", "Asilo de ancianos"],
    Seasonal: ["Seasonal", "De temporada"],
    "Mobile Van": ["Mobile van", "Unidad móvil"],
  },
  "public-housing": {
    "Low-Rent": ["Public housing", "Vivienda pública"],
    "Section 8": ["Section 8 vouchers", "Vales de Sección 8"],
    Combined: ["Public housing + Section 8", "Vivienda pública + Sección 8"],
  },
  "va-facilities": {
    VAMC: ["VA medical center", "Centro médico del VA"],
    HCC: ["Health care center", "Centro de atención médica"],
    MSCBOC: ["Multi-specialty clinic", "Clínica de especialidades"],
    PCCBOC: ["Primary care clinic", "Clínica de atención primaria"],
    OOS: ["Other outpatient services", "Otros servicios ambulatorios"],
    VTCR: ["Vet Center (counseling)", "Vet Center (consejería)"],
    MVCTR: ["Mobile Vet Center", "Vet Center móvil"],
    CLC: ["Community living center", "Centro de vida comunitaria"],
    DRRTP: ["Residential rehab program", "Programa de rehabilitación residencial"],
  },
  "border-ports": {
    Mexico: ["Mexico border", "Frontera con México"],
    Canada: ["Canada border", "Frontera con Canadá"],
  },
  "hospital-ratings": {
    acute: ["Acute care hospital", "Hospital general"],
    cah: ["Critical access hospital (rural)", "Hospital de acceso crítico (rural)"],
    psych: ["Psychiatric hospital", "Hospital psiquiátrico"],
    kids: ["Children’s hospital", "Hospital infantil"],
    va: ["VA hospital", "Hospital del VA"],
    dod: ["Military hospital", "Hospital militar"],
    reh: ["Rural emergency hospital", "Hospital rural de emergencias"],
    ltc: ["Long-term care hospital", "Hospital de cuidados prolongados"],
  },
};
TYPES["early-head-start"] = TYPES["head-start"]!;
TYPES["social-security-offices"] = {
  "Resident station (limited services)": ["Resident station (limited services)", "Oficina auxiliar (servicios limitados)"],
};
TYPES["marketplace-assisters"] = {
  nav: ["Navigator", "Navegador"],
  cac: ["Certified application counselor", "Consejero de solicitudes certificado"],
  ipa: ["In-person assister", "Asistente en persona"],
  mcd: ["Medicaid help", "Ayuda con Medicaid"],
  chip: ["CHIP (children’s coverage) help", "Ayuda con CHIP (seguro para niños)"],
};
TYPES.consulates = {
  "consulate-general": ["Consulate general", "Consulado general"],
  consulate: ["Consulate", "Consulado"],
  "consular-section": ["Embassy consular section", "Sección consular de la embajada"],
  "consular-agency": ["Consular office", "Oficina consular"],
};
TYPES["immigration-offices"] = {
  court: ["Immigration court", "Corte de inmigración"],
  ice: ["ICE field office (ERO)", "Oficina de campo de ICE (ERO)"],
};

const LANG_ES: Record<string, string> = {
  English: "Inglés",
  Spanish: "Español",
  Chinese: "Chino",
  Vietnamese: "Vietnamita",
  Korean: "Coreano",
  Russian: "Ruso",
  French: "Francés",
  Arabic: "Árabe",
  // Marketplace assisters' language list (HealthCare.gov Find Local Help)
  Interpreters: "Intérpretes para otros idiomas",
  "American Sign Language": "Lengua de señas americana",
  "French Creole": "Criollo haitiano",
  "Spanish Creole": "Criollo de base española",
  Mandarin: "Mandarín",
  Cantonese: "Cantonés",
  Portuguese: "Portugués",
  Urdu: "Urdu",
  German: "Alemán",
  Greek: "Griego",
  Hindi: "Hindi",
  Italian: "Italiano",
  Gujarati: "Guyaratí",
  Japanese: "Japonés",
  Polish: "Polaco",
  Persian: "Persa",
  Tagalog: "Tagalo",
};

/** "(209) 555-0100" from bare 10-digit or dashed US numbers; others as-is. */
export function phone(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  const d = s.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 && !/[a-z]/i.test(s) ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : s;
}

export interface ServicePopup {
  title: string;
  rows: [string, string][];
  /** `hosts`: the allowlist the popup re-checks this link against (default:
   *  the shared WEBCAM_PAGE_HOSTS). */
  link?: { href: string; label: string; hosts?: readonly string[] };
}

/** Popup content for a services-pack feature. `tidy` turns ALL-CAPS source
 *  text into Title Case (MapView's helper, passed in to avoid an import cycle). */
export function servicePopup(
  layer: string,
  p: Record<string, unknown>,
  lang: Lang,
  locale: string,
  tidy: (s: string) => string,
): ServicePopup {
  const i = lang === "es" ? 1 : 0;
  const L = (k: string) => LABELS[k]![i];
  const raw = (v: unknown) => (v == null ? "" : String(v).trim().replace(/\s+/g, " "));
  const str = (v: unknown) => tidy(raw(v));
  const typeLabel = (v: unknown) => {
    const code = raw(v);
    if (layer === "marketplace-assisters") {
      // several codes per site ("nav cac"); unknown codes are left out
      return code
        .split(" ")
        .map((c) => TYPES[layer]![c]?.[i])
        .filter(Boolean)
        .join(", ");
    }
    const hit = TYPES[layer]?.[code];
    return hit ? hit[i] : str(code);
  };
  const hours = layer === "social-security-offices" || layer === "marketplace-assisters";
  const date = (v: unknown) => {
    const n = typeof v === "number" ? v : Number.NaN;
    return Number.isFinite(n) ? new Date(n).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" }) : "";
  };
  const langs = raw(p.l)
    .split(/[,;]\s*/)
    .filter(Boolean)
    .map((x) => (i ? (LANG_ES[x] ?? x) : x))
    .join(", ");
  if (layer === "legal-aid-areas") {
    // LSC service areas keep the tool's own names: name · phone · web.
    p = { n: p.name, p: p.phone, web: p.web };
  }
  const city = [str(p.c), raw(p.s).length === 2 ? raw(p.s) : str(p.s)].filter(Boolean).join(", ");
  const pop = typeof p.pop === "number" ? p.pop.toLocaleString(locale) : "";
  const both = p.t === "both" ? (layer === "mental-health" ? L("bothMh") : L("bothSu")) : "";
  const kind = raw(p.k) && raw(p.k) !== "Permanent" ? typeLabel(p.k) : "";
  const isTreatment = layer === "mental-health" || layer === "addiction-treatment";
  const consulate = layer === "consulates";
  const cc = raw(p.cc).toUpperCase();
  const shortUrl = (u: string) => u.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
  // Medicare Care Compare layers: stars, ownership and service codes.
  const care = CARE_LAYERS.has(layer);
  const starText = (v: unknown, unrated: boolean) => {
    const n = typeof v === "number" && v >= 1 && v <= 5 ? v : null;
    if (n == null) return unrated ? L("notRated") : "";
    const glyphs = "★".repeat(Math.floor(n)) + (n % 1 ? "½" : "");
    return `${glyphs} ${n.toLocaleString(locale)} ${L("outOf")}`;
  };
  const bits = typeof p.sv === "number" ? p.sv : 0;
  const services = care
    ? (CARE_SERVICES[layer] ?? [])
        .filter((_, b) => bits & (1 << b))
        .map((x) => x[i])
        .join(", ")
    : raw(p.sv);
  const yesNo = (v: unknown) => (v === 1 ? L("yes") : v === 0 || v == null ? L("no") : "");
  const starRows: [string, string][] = !care
    ? []
    : layer === "home-health-agencies"
      ? [
          [L("quality"), starText(p.st, true)],
          [L("survey"), starText(p.ss, true)],
        ]
      : [[layer === "hospice-providers" ? L("familySurvey") : L("stars"), starText(p.st, true)]];
  const rows: [string, string][] = [
    ...starRows,
    [L("type"), isTreatment ? "" : [typeLabel(p.t), kind].filter(Boolean).join(" · ")],
    [L("office"), raw(p.o)],
    [
      layer === "summer-meals" ? L("sponsor") : layer.endsWith("head-start") ? L("program") : layer === "dialysis-facilities" ? L("company") : L("org"),
      layer === "dialysis-facilities" ? raw(p.g) : str(p.g),
    ],
    [L("address"), str(p.a)],
    [L("city"), city],
    [L("phone"), phone(p.p)],
    [L("enroll"), phone(p.rp)],
    [L("helpLine"), consulate ? phone(p.hl) : ""],
    [L("appointments"), consulate ? shortUrl(consulateUrl(cc, p.ap)) : ""],
    [L("languages"), langs],
    [L("services"), services],
    [L("emergency"), layer === "hospital-ratings" ? yesNo(p.er) : ""],
    [L("birthing"), layer === "hospital-ratings" && p.bf === 1 ? L("yes") : ""],
    [L("stations"), layer === "dialysis-facilities" && typeof p.ns === "number" && p.ns > 0 ? p.ns.toLocaleString(locale) : ""],
    [L("evening"), layer === "dialysis-facilities" && p.ls === 1 ? L("yes") : ""],
    [L("ownership"), care ? (OWNERSHIP[raw(p.ow)]?.[i] ?? "") : ""],
    [L("medicareId"), care && /^[0-9A-Z]{6}$/.test(raw(p.id)) ? raw(p.id) : ""],
    [L("spanish"), p.es === 1 ? L("yes") : ""],
    [L("sliding"), p.sf === 1 ? L("yes") : ""],
    [L("both"), both],
    [L("fieldOffice"), raw(p.fo)],
    [L("population"), pop],
    [L("dates"), p.d0 != null || p.d1 != null ? [date(p.d0), date(p.d1)].filter(Boolean).join(" – ") : ""],
    [hours ? L("hours") : L("days"), hours ? raw(p.d) : str(p.d)],
    [L("breakfast"), raw(p.bt)],
    [L("lunch"), raw(p.lt)],
    [L("website"), consulate ? shortUrl(consulateUrl(cc, p.web)) : /^https:\/\/[^\s]+$/.test(raw(p.web)) ? shortUrl(raw(p.web)) : ""],
    [L("location"), p.x === 1 ? L("approx") : p.x === 2 ? L("area") : ""],
    [
      L("note"),
      consulate
        ? [CONSULATE_NOTES[cc]?.[i], CONSULATE_NOTE[i]].filter(Boolean).join(" ")
        : ((layer === "immigration-offices" ? OFFICE_NOTES[raw(p.t)]?.[i] : NOTES[layer]?.[i]) ?? ""),
    ],
  ];
  if (consulate) return { title: consulateTitle(cc, raw(p.t), str(p.pl), i), rows, link: consulateLink(cc, p, i) };
  const fixed = LINKS[layer];
  const unitid = raw(p.u);
  const page = raw(p.pg);
  const link =
    layer === "immigration-offices"
      ? OFFICE_PAGES.some((u) => page.startsWith(u)) && OFFICE_LINKS[raw(p.t)]
        ? { href: page, label: OFFICE_LINKS[raw(p.t)]![i] }
        : undefined
      : layer === "colleges" && /^\d{6}$/.test(unitid)
      ? { href: COLLEGE_NAVIGATOR + unitid, label: "College Navigator (NCES)" }
      : fixed
        ? { href: (i && LINKS_ES[layer]) || fixed[0], label: fixed[1][i] }
        : undefined;
  return { title: str(p.n) || "", rows, link };
}

/** Summer meal sites: keep only those whose season includes today (the
 *  service's own filter does this too; this guards against a stale where). */
export function mealsOpen(p: Record<string, unknown>, now = Date.now()): boolean {
  const start = typeof p.d0 === "number" ? p.d0 : null;
  const end = typeof p.d1 === "number" ? p.d1 : null;
  const day = 24 * 3600 * 1000;
  return (start == null || start <= now) && (end == null || end + day > now);
}
