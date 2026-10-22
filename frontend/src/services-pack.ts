// Community & immigrant services pack (backend app/layers/national/services.py):
// colors, popups and official links for its layers. Self-contained (own
// EN/ES strings, no runtime imports) so other packs can grow independently.
// Properties use the pack's compact names: n name · o office · g organization
// · a street · c city · s state · p phone · rp enrollment phone · t type ·
// k site kind · l languages · sv services · es Spanish · sf sliding fee ·
// fo ICE field office · pop average population · u college id · d/d0/d1/bt/lt
// summer-meal days, dates and times · x approximate location.
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
};

type Bi = [en: string, es: string];
const HEAD_START: [string, Bi] = ["https://headstart.gov/center-locator", ["Head Start center locator", "Buscador de centros Head Start"]];
const TREATMENT: [string, Bi] = ["https://findtreatment.gov/", ["FindTreatment.gov", "FindTreatment.gov (en español)"]];

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
};
const COLLEGE_NAVIGATOR = "https://nces.ed.gov/collegenavigator/?id=";
/** Hand-kept immigration offices link to the official page each row came from. */
const OFFICE_PAGES = ["https://www.justice.gov/eoir/", "https://www.ice.gov/"];

/** Hosts this pack links to (merged into the popup link allowlist). */
export const SERVICE_LINK_HOSTS: string[] = [
  ...new Set([...[...Object.values(LINKS).map(([u]) => u), COLLEGE_NAVIGATOR, ...OFFICE_PAGES].map((u) => new URL(u).hostname)]),
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
  "post-offices": [
    "Many post offices also accept passport applications; check the USPS finder.",
    "Muchas oficinas de correos también aceptan solicitudes de pasaporte; consulte el buscador de USPS.",
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
  bothMh: ["Substance use", "Adicciones"],
  bothSu: ["Mental health", "Salud mental"],
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
};
TYPES["early-head-start"] = TYPES["head-start"]!;
TYPES["social-security-offices"] = {
  "Resident station (limited services)": ["Resident station (limited services)", "Oficina auxiliar (servicios limitados)"],
};
TYPES["immigration-offices"] = {
  court: ["Immigration court", "Corte de inmigración"],
  ice: ["ICE field office (ERO)", "Oficina de campo de ICE (ERO)"],
};

const LANG_ES: Record<string, string> = { English: "Inglés", Spanish: "Español", Chinese: "Chino", Vietnamese: "Vietnamita", Korean: "Coreano", Russian: "Ruso", French: "Francés", Arabic: "Árabe" };

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
    const hit = TYPES[layer]?.[code];
    return hit ? hit[i] : str(code);
  };
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
  const rows: [string, string][] = [
    [L("type"), isTreatment ? "" : [typeLabel(p.t), kind].filter(Boolean).join(" · ")],
    [L("office"), raw(p.o)],
    [layer === "summer-meals" ? L("sponsor") : layer.endsWith("head-start") ? L("program") : L("org"), str(p.g)],
    [L("address"), str(p.a)],
    [L("city"), city],
    [L("phone"), phone(p.p)],
    [L("enroll"), phone(p.rp)],
    [L("languages"), langs],
    [L("services"), raw(p.sv)],
    [L("spanish"), p.es === 1 ? L("yes") : ""],
    [L("sliding"), p.sf === 1 ? L("yes") : ""],
    [L("both"), both],
    [L("fieldOffice"), raw(p.fo)],
    [L("population"), pop],
    [L("dates"), p.d0 != null || p.d1 != null ? [date(p.d0), date(p.d1)].filter(Boolean).join(" – ") : ""],
    [layer === "social-security-offices" ? L("hours") : L("days"), layer === "social-security-offices" ? raw(p.d) : str(p.d)],
    [L("breakfast"), raw(p.bt)],
    [L("lunch"), raw(p.lt)],
    [L("website"), /^https:\/\/[^\s]+$/.test(raw(p.web)) ? raw(p.web).replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "") : ""],
    [L("location"), p.x === 1 ? L("approx") : ""],
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
        ? { href: fixed[0], label: fixed[1][i] }
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
