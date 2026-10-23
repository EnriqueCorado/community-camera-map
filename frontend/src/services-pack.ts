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
// lists no public address, so the point is only near the area). Assisted
// housing (hud-multifamily, usda-rural-rentals) adds z ZIP · pr HUD program
// code · un apartments with rent help · ut all apartments; g is the
// management company (kept only when it reads as an organization: orgName).
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
  "hud-multifamily": "#c026d3",
  "usda-rural-rentals": "#a16207",
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
  "hud-multifamily": [
    "https://resources.hud.gov/",
    ["Find HUD-assisted apartments (HUD Resource Locator)", "Buscar apartamentos con ayuda de HUD (HUD Resource Locator)"],
  ],
  "usda-rural-rentals": [
    "https://rdmfhrentals.sc.egov.usda.gov/",
    ["Search USDA rural rentals (vacancies)", "Buscar apartamentos del USDA en zonas rurales (disponibles)"],
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

/** Hosts this pack links to (merged into the popup link allowlist). */
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
  "hud-multifamily": [
    "Apply at the property’s office (most have a waiting list). In an assisted apartment, rent is usually about 30% of your income.",
    "Solicite en la oficina de la propiedad (la mayoría tiene lista de espera). En un apartamento con ayuda, la renta suele ser de alrededor del 30% de sus ingresos.",
  ],
  "usda-rural-rentals": [
    "Apply with the property or its management company. With USDA rental assistance, rent is usually about 30% of your income.",
    "Solicite en la propiedad o con su empresa administradora. Con la ayuda del USDA, la renta suele ser de alrededor del 30% de sus ingresos.",
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
  serves: ["Who it’s for", "Para quién es"],
  managedBy: ["Managed by", "Administrado por"],
  apartments: ["Apartments", "Apartamentos"],
  rentHelp: ["With rent help", "Con ayuda para la renta"],
};

/** Housing layers whose popup adds program, apartments and ZIP rows. */
const ASSISTED_HOUSING = new Set(["hud-multifamily", "usda-rural-rentals"]);

/** HUD PROGRAM_TYPE1 codes ("202/8 NC", "PRAC/811", "LMSA", "RAD PH Conv") in
 *  plain words, first match wins; insurance-only codes show nothing. */
const HUD_PROGRAMS: [RegExp, Bi][] = [
  [/^RAD\b/, ["Section 8 (converted under RAD)", "Sección 8 (convertida con RAD)"]],
  [/811/, ["Section 811 (people with disabilities)", "Sección 811 (personas con discapacidad)"]],
  [/515/, ["Section 8 + USDA Section 515", "Sección 8 + Sección 515 del USDA"]],
  // 202/162 and PAC/202 are the old Section 202 for people with disabilities.
  [/202\/162|PAC\/202/, ["Section 202 (people with disabilities)", "Sección 202 (personas con discapacidad)"]],
  [/202|SPRAC/, ["Section 202 (seniors)", "Sección 202 (personas mayores)"]],
  [/Sec(tion)? 8|\/8 |LMSA|Preservation|Pension Fund/, ["Section 8 (project-based)", "Sección 8 (basada en el proyecto)"]],
];
/** A HUD program code in plain words ("" when it isn't a rent-help program). */
export function hudProgram(code: unknown, lang: Lang): string {
  const c = code == null ? "" : String(code);
  const hit = HUD_PROGRAMS.find(([re]) => re.test(c));
  return hit ? hit[1][lang === "es" ? 1 : 0] : "";
}

// Words that mark a management agent as an organization. Many USDA (and some
// HUD) agents are individuals ("MILLER, GLENN D", "Todd Byers"): without one
// of these words the name and the phone shown with it are dropped (post "mgmt").
// Surname-like words (Park, House, Trust, Church, Living, Ha, Co) are left out on purpose.
const ORG_WORDS =
  /\b(inc|incorporated|llc|l\.l\.c|l\.?p|llp|pllc|ltd|limited|corp|corporation|company|companies|management|mgmt|mgt|housing|hsg|authority|properties|property|props?|realty|real estate|group|services?|associates|assoc|association|partners|partnership|foundation|ministries|society|agency|enterprises|development|residential|communit(?:y|ies)|homes|apartments|apts|cent(?:er|ers|re)|cooperative|co-?op|organization|charities|catholic|lutheran|presbyterian|methodist|baptist|episcopal|commission|department|dept|university|institute|network|alliance|solutions|investments|capital|holdings|ventures|healthcare|health|behavioral|aging|counseling|ymca|ywca|h\/a|hra|cdc|cda|pha|mha)\b/i;
// A person riding along: "Inc./Robert Ercolini", "/ J. Roe", "c/o", "% BALDUS,
// ANDREA" (USDA's c/o), "Attn", "Acme - Jane Roe", "(Jane Roe)", "DBA RON MOLINE".
// ("H/A" is a housing authority.)
const PERSON_TAIL = /c\/o|%|\battn\b|(?<!\bh)\/\s*[a-z]|\s-\s|\(|\bdba\s+[a-z]+\s+[a-z]+$/i;
// Every comma must lead to a legal suffix ("SPM, LLC", "Ellis & Ellis, PLLC"):
// "MILLER, GLENN D", "CHURCH, JANET", "BENCHMARK REAL ESTATE, JO T" are people.
const LEGAL_AFTER_COMMA = /^\s*(inc|incorporated|llc|l\.l\.c|l\.?p|llp|pllc|ltd|corp|corporation)\b/i;
/** The name if it reads as an organization, else "". Errs toward dropping. */
export function orgName(v: unknown): string {
  const s = v == null ? "" : String(v).trim().replace(/\s+/g, " ");
  if (!s || !ORG_WORDS.test(s) || PERSON_TAIL.test(s)) return "";
  return s.split(",").slice(1).every((part) => LEGAL_AFTER_COMMA.test(part)) ? s : "";
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
TYPES["hud-multifamily"] = {
  Elderly: ["Seniors", "Personas mayores"],
  Disabled: ["People with disabilities", "Personas con discapacidad"],
  Family: ["Families and individuals", "Familias y personas que viven solas"],
  "Health Care": ["Health care residence", "Residencia con atención médica"],
};
TYPES["usda-rural-rentals"] = {
  "FA - Family": ["Families and individuals", "Familias y personas que viven solas"],
  "EL - Elderly": ["Seniors and people with disabilities", "Personas mayores y con discapacidad"],
  "MX - Mixed": ["Families and seniors", "Familias y personas mayores"],
  "CG - Congregate": ["Seniors (shared meals and services)", "Personas mayores (comidas y servicios compartidos)"],
  "GH - Group Home": ["Group home", "Hogar grupal"],
  "?? - Unknown": ["", ""],
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
  link?: { href: string; label: string };
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
  const zip = /^\d{5}$/.test(raw(p.z)) ? raw(p.z) : "";
  const state = [raw(p.s).length === 2 ? raw(p.s) : str(p.s), zip].filter(Boolean).join(" ");
  const city = [str(p.c), state].filter(Boolean).join(", ");
  const housing = ASSISTED_HOUSING.has(layer);
  const count = (v: unknown) => (typeof v === "number" && v > 0 ? v.toLocaleString(locale) : "");
  const pop = typeof p.pop === "number" ? p.pop.toLocaleString(locale) : "";
  const both = p.t === "both" ? (layer === "mental-health" ? L("bothMh") : L("bothSu")) : "";
  const kind = raw(p.k) && raw(p.k) !== "Permanent" ? typeLabel(p.k) : "";
  const isTreatment = layer === "mental-health" || layer === "addiction-treatment";
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
    [housing ? L("serves") : L("type"), isTreatment ? "" : [typeLabel(p.t), kind].filter(Boolean).join(" · ")],
    [L("program"), layer === "hud-multifamily" ? hudProgram(p.pr, lang) : ""],
    [L("rentHelp"), housing ? count(p.un) : ""],
    [L("apartments"), housing ? count(p.ut) : ""],
    [L("office"), raw(p.o)],
    [
      layer === "summer-meals" ? L("sponsor") : layer.endsWith("head-start") ? L("program") : layer === "dialysis-facilities" ? L("company") : housing ? L("managedBy") : L("org"),
      layer === "dialysis-facilities" ? raw(p.g) : housing ? str(orgName(p.g)) : str(p.g),
    ],
    [L("address"), str(p.a)],
    [L("city"), city],
    [L("phone"), phone(p.p)],
    [L("enroll"), phone(p.rp)],
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
    [L("website"), /^https:\/\/[^\s]+$/.test(raw(p.web)) ? raw(p.web).replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "") : ""],
    [L("location"), p.x === 1 ? L("approx") : p.x === 2 ? L("area") : ""],
    [L("note"), (layer === "immigration-offices" ? OFFICE_NOTES[raw(p.t)]?.[i] : NOTES[layer]?.[i]) ?? ""],
  ];
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
