// Free and low-cost clinics in Stanislaus County, with citations. Researched
// 2026-10-23 from HRSA's health-center site data (Stanislaus, FIPS 06099), each
// clinic's own pages (gvhc.org, lumirahealthcare.com, plannedparenthood.org),
// federal rules (42 CFR 51c.303 sliding fees, 45 CFR 92.201 interpreters),
// Covered California and Stanislaus County (HSA, BHRS). The research archive,
// with what couldn't be verified, is ~/dev/outreach-help-2026-10/research/clinics.{json,md}.
//
// RE-CHECK by CLINICS_RECHECK (upkeep.ts): hours and sites change; GVHC posts
// day-by-day closures. Coverage facts come from medi-cal-work-facts.ts,
// rights-facts.ts and benefits-facts.ts, so they stay in step with those tools.
import type { Contact, Fact } from "./facts";
import type { SourceRef } from "../components/help/ui";
import type { Bilingual } from "./letter-types";
import { factsById } from "./facts-by-id";
import { MCW_CONTACTS, MCW_FACTS } from "./medi-cal-work-facts";
import { RIGHTS_FACTS } from "./rights-facts";
import { PUBLIC_CHARGE } from "./benefits-facts";

export const CLINICS_CHECKED = "2026-10-23";
export const CLINICS_RECHECK = "2027-04-23";

export type Town =
  | "modesto"
  | "ceres"
  | "turlock"
  | "patterson"
  | "newman"
  | "riverbank"
  | "empire"
  | "hughson"
  | "waterford"
  | "westley"
  | "oakdale"
  | "salida"
  | "keyes"
  | "denair";

/** Town names, and a point near each town's center (for "nearest" when a town has none). */
export const TOWNS: Record<Town, { name: string; center: [number, number] }> = {
  modesto: { name: "Modesto", center: [-120.9969, 37.6391] },
  ceres: { name: "Ceres", center: [-120.9577, 37.5949] },
  turlock: { name: "Turlock", center: [-120.8466, 37.4947] },
  patterson: { name: "Patterson", center: [-121.1297, 37.4716] },
  newman: { name: "Newman", center: [-121.0208, 37.3138] },
  riverbank: { name: "Riverbank", center: [-120.9355, 37.736] },
  empire: { name: "Empire", center: [-120.9044, 37.6385] },
  hughson: { name: "Hughson", center: [-120.8663, 37.5966] },
  waterford: { name: "Waterford", center: [-120.7605, 37.6413] },
  westley: { name: "Westley", center: [-121.198, 37.548] },
  oakdale: { name: "Oakdale", center: [-120.8471, 37.7666] },
  salida: { name: "Salida", center: [-121.0849, 37.7058] },
  keyes: { name: "Keyes", center: [-120.9152, 37.5563] },
  denair: { name: "Denair", center: [-120.7969, 37.5266] },
};

export type Need = "primary" | "urgent" | "dental" | "mental" | "women" | "kids" | "vaccines";
export const NEEDS: readonly Need[] = ["primary", "urgent", "dental", "mental", "women", "kids", "vaccines"];

export type Org = "gvhc" | "lumira" | "pp" | "county" | "free" | "hospital";

export interface Clinic {
  id: string;
  org: Org;
  name: string;
  address: string;
  town: Town;
  /** Appointments (or the clinic's own line). */
  phone: string;
  /** A text-only line some sites give for dental appointments. */
  dentalText?: string;
  hours: Bilingual;
  needs: readonly Need[];
  note?: Bilingual;
  /** [lon, lat]: HRSA's point for health-center sites; the Census geocoder otherwise. */
  center: [number, number];
  /** On the map's "Community health centers" layer (HRSA sites only). */
  onMap: boolean;
  /** On a school campus or open only part of the week: ranked after full-time
   *  sites, and a town with only these also gets the nearest full-time one. */
  limited?: true;
  url: string;
}

const GVHC_PHONE = "(209) 722-4842";
const LUMIRA_PHONE = "(209) 850-3500";
const GVHC_LOC = "https://www.gvhc.org/locations/";
const LUMIRA_LOC = "https://lumirahealthcare.com/locations/";
const MF = (from: string, to: string): Bilingual => ({ en: `Mon–Fri ${from}–${to}`, es: `lunes a viernes ${from}–${to}` });
const SCHOOL: Bilingual = {
  en: "On a school campus: call to ask who can be seen.",
  es: "En el plantel de una escuela: llame para preguntar a quién atienden.",
};
const EVENINGS = (closeEn: string): Bilingual => ({
  en: `Urgent care and evening visits until ${closeEn} weekdays, plus Saturdays.`,
  es: `Atención urgente y citas en la tarde y la noche hasta las ${closeEn} entre semana, y los sábados.`,
});

/** Every site, in the order shown (Modesto first, then by town). */
export const CLINICS: readonly Clinic[] = [
  // ------------------------------------------------ Golden Valley Health Centers
  {
    id: "gvhc-paradise",
    org: "gvhc",
    name: "Golden Valley Health Centers – Modesto Paradise",
    address: "401 Paradise Rd., Modesto, CA 95351",
    town: "modesto",
    phone: GVHC_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1); urgent care Mon–Fri 8 a.m.–8:30 p.m. (closed 4–5 p.m.)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1); atención urgente lunes a viernes 8 a. m.–8:30 p. m. (cerrado de 4 a 5 p. m.)" },
    needs: ["primary", "urgent", "kids", "women", "mental"],
    note: { en: "GVHC’s largest Stanislaus clinic. Also addiction treatment (MAT) and HIV care.", es: "La clínica más grande de GVHC en Stanislaus. También tratamiento para adicciones (MAT) y atención del VIH." },
    center: [-121.01281, 37.62801],
    onMap: true,
    url: `${GVHC_LOC}modesto/modesto-paradise/`,
  },
  {
    id: "gvhc-west-modesto",
    org: "gvhc",
    name: "Golden Valley Health Centers – West Modesto",
    address: "1114 6th St., Modesto, CA 95354",
    town: "modesto",
    phone: GVHC_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–8:30 p.m.; Sat 8 a.m.–5:30 p.m.", es: "lunes a viernes 8 a. m.–8:30 p. m.; sábado 8 a. m.–5:30 p. m." },
    needs: ["primary", "urgent"],
    note: { en: "Pharmacy on site: (209) 763-4879.", es: "Farmacia en el lugar: (209) 763-4879." },
    center: [-121.00558, 37.63923],
    onMap: true,
    url: `${GVHC_LOC}modesto/golden-valley-health-centers-west-modesto-clinic/`,
  },
  {
    id: "gvhc-west-modesto-dental",
    org: "gvhc",
    name: "Golden Valley Health Centers – West Modesto Dental",
    address: "1008 6th St., Modesto, CA 95354",
    town: "modesto",
    phone: GVHC_PHONE,
    dentalText: "(209) 573-8880",
    hours: { en: "Mon–Fri 8 a.m.–4:30 p.m. (closed 12–12:45)", es: "lunes a viernes 8 a. m.–4:30 p. m. (cerrado de 12 a 12:45)" },
    needs: ["dental"],
    center: [-121.00417, 37.63823],
    onMap: true,
    url: `${GVHC_LOC}modesto/golden-valley-health-centers-west-modesto-clinic/modesto-w-modesto-dental/`,
  },
  {
    id: "gvhc-florida-suites",
    org: "gvhc",
    name: "Golden Valley Health Centers – Modesto Florida Suites",
    address: "1510 Florida Ave., Modesto, CA 95350",
    town: "modesto",
    phone: GVHC_PHONE,
    hours: { en: "Urgent care Mon–Fri 8 a.m.–8:30 p.m., Sat 8 a.m.–5:30 p.m.; family planning and behavioral health Mon–Fri 8 a.m.–5:30 p.m.; pediatrics Mon–Fri 8 a.m.–5 p.m.", es: "Atención urgente lunes a viernes 8 a. m.–8:30 p. m., sábado 8 a. m.–5:30 p. m.; planificación familiar y salud mental lunes a viernes 8 a. m.–5:30 p. m.; pediatría lunes a viernes 8 a. m.–5 p. m." },
    needs: ["urgent", "women", "mental", "kids"],
    center: [-120.99612, 37.66606],
    onMap: true,
    url: `${GVHC_LOC}modesto/modesto-florida-suites/`,
  },
  {
    id: "gvhc-womens-modesto",
    org: "gvhc",
    name: "Golden Valley Health Centers – Modesto Women’s Health",
    address: "1500 Florida Ave., Modesto, CA 95350",
    town: "modesto",
    phone: GVHC_PHONE,
    hours: MF("8 a.m.", "5 p.m."),
    needs: ["women"],
    center: [-120.9955, 37.66574],
    onMap: true,
    url: `${GVHC_LOC}modesto/modesto-womens-health/`,
  },
  {
    id: "gvhc-robertson-road",
    org: "gvhc",
    name: "Golden Valley Health Centers – Modesto Robertson Road",
    address: "1121 Hammond St., Modesto, CA 95351",
    town: "modesto",
    phone: GVHC_PHONE,
    hours: { en: "Medical Mon–Fri 8 a.m.–5 p.m. (closed noon–1); dental Mon–Fri 8 a.m.–4:30 p.m. (closed noon–1)", es: "Médica lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1); dental lunes a viernes 8 a. m.–4:30 p. m. (cerrado de 12 a 1)" },
    needs: ["primary", "dental"],
    center: [-121.0191, 37.61522],
    onMap: true,
    url: `${GVHC_LOC}modesto/modesto-robertson-road/`,
  },
  {
    id: "gvhc-hanshaw",
    org: "gvhc",
    name: "Golden Valley Health Centers – Modesto Hanshaw School",
    address: "1717 Las Vegas St., Modesto, CA 95358",
    town: "modesto",
    phone: GVHC_PHONE,
    dentalText: "(209) 556-5044",
    hours: { en: "Medical Mon–Fri 8 a.m.–5 p.m.; dental Mon–Fri 8 a.m.–4:30 p.m. (closed noon–1)", es: "Médica lunes a viernes 8 a. m.–5 p. m.; dental lunes a viernes 8 a. m.–4:30 p. m. (cerrado de 12 a 1)" },
    needs: ["primary", "dental"],
    note: SCHOOL,
    limited: true,
    center: [-121.00319, 37.60534],
    onMap: true,
    url: `${GVHC_LOC}modesto/modesto-hanshaw-school/`,
  },
  {
    id: "gvhc-coolidge",
    org: "gvhc",
    name: "Golden Valley Health Centers – Modesto W. Coolidge",
    address: "208 W. Coolidge Ave., Modesto, CA 95350",
    town: "modesto",
    phone: GVHC_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1)" },
    needs: ["primary"],
    center: [-120.99519, 37.66487],
    onMap: true,
    url: `${GVHC_LOC}modesto/coolidge/`,
  },
  {
    id: "gvhc-mission",
    org: "gvhc",
    name: "Golden Valley Health Centers – Modesto Mission",
    address: "209 Kerr Ave., Modesto, CA 95354",
    town: "modesto",
    phone: GVHC_PHONE,
    hours: { en: "Mon, Tue, Thu and Fri 8 a.m.–5 p.m. (closed noon–1)", es: "lunes, martes, jueves y viernes 8 a. m.–5 p. m. (cerrado de 12 a 1)" },
    needs: ["primary"],
    center: [-120.97177, 37.63668],
    onMap: true,
    url: `${GVHC_LOC}modesto/modesto-mission/`,
  },
  {
    id: "gvhc-tenaya",
    org: "gvhc",
    name: "Golden Valley Health Centers – Modesto Tenaya",
    address: "2101 Tenaya Dr., Modesto, CA 95354",
    town: "modesto",
    phone: "(209) 576-6766",
    hours: { en: "Mon–Sat 8 a.m.–5 p.m.", es: "lunes a sábado 8 a. m.–5 p. m." },
    needs: ["primary", "mental"],
    note: { en: "Recovery services and telepsychiatry. The addiction treatment (MAT) program moves to the Paradise clinic from November 5, 2026.", es: "Servicios de recuperación y telepsiquiatría. El programa de tratamiento para adicciones (MAT) se muda a la clínica Paradise desde el 5 de noviembre de 2026." },
    center: [-120.95675, 37.63269],
    onMap: true,
    url: `${GVHC_LOC}modesto/modesto-tenaya/`,
  },
  {
    id: "gvhc-mchenry",
    org: "gvhc",
    name: "Golden Valley Health Centers – Modesto McHenry",
    address: "1524 McHenry Ave. (Suites 300, 330, 535, 560), Modesto, CA 95350",
    town: "modesto",
    phone: GVHC_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1)" },
    needs: ["primary"],
    note: { en: "Specialty care: surgery, physical and occupational therapy, rheumatology, endocrinology.", es: "Especialidades: cirugía, terapia física y ocupacional, reumatología, endocrinología." },
    center: [-120.99395, 37.66621],
    onMap: true,
    url: `${GVHC_LOC}modesto/modesto-mchenry/`,
  },
  {
    id: "gvhc-empire",
    org: "gvhc",
    name: "Golden Valley Health Centers – Empire",
    address: "198 N. G St., Empire, CA 95319",
    town: "empire",
    phone: GVHC_PHONE,
    hours: { en: "Medical Mon–Fri 8 a.m.–5 p.m. (closed noon–1); dental Mon–Fri 8 a.m.–4:30 p.m.", es: "Médica lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1); dental lunes a viernes 8 a. m.–4:30 p. m." },
    needs: ["primary", "dental"],
    note: SCHOOL,
    limited: true,
    center: [-120.90088, 37.64091],
    onMap: true,
    url: `${GVHC_LOC}empire/`,
  },
  {
    id: "gvhc-ceres-east",
    org: "gvhc",
    name: "Golden Valley Health Centers – Ceres East",
    address: "1920 Memorial Dr., Ceres, CA 95307",
    town: "ceres",
    phone: GVHC_PHONE,
    dentalText: "(209) 541-3001",
    hours: { en: "Medical Mon–Fri 8 a.m.–8:30 p.m., Sat 8 a.m.–5:30 p.m.; dental 8 a.m.–4:30 p.m.", es: "Médica lunes a viernes 8 a. m.–8:30 p. m., sábado 8 a. m.–5:30 p. m.; dental 8 a. m.–4:30 p. m." },
    needs: ["primary", "urgent", "women", "dental", "kids"],
    note: EVENINGS("8:30 p.m."),
    center: [-120.96078, 37.60016],
    onMap: true,
    url: `${GVHC_LOC}ceres/ceres-east/`,
  },
  {
    id: "gvhc-ceres-whitmore",
    org: "gvhc",
    name: "Golden Valley Health Centers – Ceres E. Whitmore",
    address: "3109 E. Whitmore Ave., Ceres, CA 95307",
    town: "ceres",
    phone: GVHC_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–noon and 1–5 p.m.", es: "lunes a viernes 8 a. m.–12 p. m. y 1–5 p. m." },
    needs: ["primary", "kids"],
    note: { en: "The GVHC mobile clinic also stops here on some days (see its calendar).", es: "La clínica móvil de GVHC también se estaciona aquí algunos días (vea su calendario)." },
    center: [-120.93759, 37.59524],
    onMap: true,
    url: `${GVHC_LOC}ceres/ceres-whitmore/`,
  },
  {
    id: "gvhc-turlock-west",
    org: "gvhc",
    name: "Golden Valley Health Centers – Turlock West",
    address: "1200 W. Main St., Turlock, CA 95380",
    town: "turlock",
    phone: GVHC_PHONE,
    dentalText: "(209) 656-6000",
    hours: { en: "Medical Mon–Fri 8 a.m.–5 p.m.; dental Mon–Fri 8 a.m.–4:30 p.m.", es: "Médica lunes a viernes 8 a. m.–5 p. m.; dental lunes a viernes 8 a. m.–4:30 p. m." },
    needs: ["primary", "women", "dental", "kids"],
    center: [-120.86295, 37.49253],
    onMap: true,
    url: `${GVHC_LOC}turlock/turlock-west/`,
  },
  {
    id: "gvhc-turlock-monte-vista",
    org: "gvhc",
    name: "Golden Valley Health Centers – Turlock Monte Vista",
    address: "2240 W. Monte Vista Ave., Turlock, CA 95382",
    town: "turlock",
    phone: GVHC_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–8:30 p.m.; Sat 8 a.m.–5:30 p.m.", es: "lunes a viernes 8 a. m.–8:30 p. m.; sábado 8 a. m.–5:30 p. m." },
    needs: ["primary", "urgent", "kids", "mental"],
    center: [-120.87435, 37.52124],
    onMap: true,
    url: `${GVHC_LOC}turlock/turlock-monte-vista/`,
  },
  {
    id: "gvhc-turlock-pediatrics",
    org: "gvhc",
    name: "Golden Valley Health Centers – Turlock Pediatrics",
    address: "1100 Delbon Ave., Turlock, CA 95382",
    town: "turlock",
    phone: GVHC_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1)" },
    needs: ["kids"],
    note: { en: "More pediatric suites at 1120 and 1199 Delbon Ave.", es: "Más consultorios de pediatría en 1120 y 1199 Delbon Ave." },
    center: [-120.83577, 37.51045],
    onMap: true,
    url: `${GVHC_LOC}turlock/turlock-pediatrics/`,
  },
  {
    id: "gvhc-patterson",
    org: "gvhc",
    name: "Golden Valley Health Centers – Patterson",
    address: "200 C St., Patterson, CA 95363",
    town: "patterson",
    phone: GVHC_PHONE,
    dentalText: "(209) 892-6307",
    hours: { en: "Medical Mon–Fri 8 a.m.–5 p.m.; urgent care Mon–Fri until 8:30 p.m. and Sat 8 a.m.–5:30 p.m.; dental Mon–Fri 8 a.m.–4:30 p.m. (closed noon–1)", es: "Médica lunes a viernes 8 a. m.–5 p. m.; atención urgente lunes a viernes hasta las 8:30 p. m. y sábado 8 a. m.–5:30 p. m.; dental lunes a viernes 8 a. m.–4:30 p. m. (cerrado de 12 a 1)" },
    needs: ["primary", "urgent", "dental", "mental"],
    center: [-121.12578, 37.46727],
    onMap: true,
    url: `${GVHC_LOC}patterson/`,
  },
  {
    id: "gvhc-newman",
    org: "gvhc",
    name: "Golden Valley Health Centers – Newman",
    address: "637 Merced St., Newman, CA 95360",
    town: "newman",
    phone: GVHC_PHONE,
    hours: { en: "Medical Mon–Fri 8 a.m.–5 p.m.; dental Mon–Fri 8 a.m.–4:30 p.m. (closed 12–12:45) (dental appointments: (209) 862-9449)", es: "Médica lunes a viernes 8 a. m.–5 p. m.; dental lunes a viernes 8 a. m.–4:30 p. m. (cerrado de 12 a 12:45) (citas dentales: (209) 862-9449)" },
    needs: ["primary", "dental"],
    center: [-121.01635, 37.31502],
    onMap: true,
    url: `${GVHC_LOC}newman/`,
  },
  {
    id: "gvhc-riverbank",
    org: "gvhc",
    name: "Golden Valley Health Centers – Riverbank High School",
    address: "4150 Patterson Rd., Riverbank, CA 95367",
    town: "riverbank",
    phone: GVHC_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1)" },
    needs: ["primary"],
    note: SCHOOL,
    limited: true,
    center: [-120.92014, 37.73174],
    onMap: true,
    url: `${GVHC_LOC}riverbank/`,
  },
  {
    id: "gvhc-westley",
    org: "gvhc",
    name: "Golden Valley Health Centers – Westley",
    address: "301 Howard Rd. (Grayson Elementary campus), Westley, CA 95387",
    town: "westley",
    phone: GVHC_PHONE,
    hours: { en: "Mon and Thu 8:30 a.m.–2:30 p.m.", es: "lunes y jueves 8:30 a. m.–2:30 p. m." },
    needs: ["primary"],
    note: SCHOOL,
    limited: true,
    center: [-121.19877, 37.54478],
    onMap: true,
    url: `${GVHC_LOC}westley/`,
  },
  // --------------------------------------------------------- Lumira HealthCare
  {
    id: "lumira-orangeburg",
    org: "lumira",
    name: "Lumira HealthCare – Modesto Orangeburg Ave",
    address: "2116 E. Orangeburg Ave., Modesto, CA 95355",
    town: "modesto",
    phone: LUMIRA_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1)" },
    needs: ["primary", "dental", "mental"],
    center: [-120.95795, 37.6633],
    onMap: true,
    url: LUMIRA_LOC,
  },
  {
    id: "lumira-florida",
    org: "lumira",
    name: "Lumira HealthCare – Modesto Florida Ave",
    address: "1444 Florida Ave., Suite 202, Modesto, CA 95350",
    town: "modesto",
    phone: LUMIRA_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1)" },
    needs: ["primary", "mental"],
    center: [-120.99612, 37.6649],
    onMap: true,
    url: LUMIRA_LOC,
  },
  {
    id: "lumira-turlock",
    org: "lumira",
    name: "Lumira HealthCare – Turlock Colorado Ave",
    address: "2141 Colorado Ave., Turlock, CA 95382",
    town: "turlock",
    phone: LUMIRA_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1)" },
    needs: ["primary", "mental"],
    center: [-120.83583, 37.51227],
    onMap: true,
    url: LUMIRA_LOC,
  },
  {
    id: "lumira-hughson",
    org: "lumira",
    name: "Lumira HealthCare – Hughson 3rd St",
    address: "2412 3rd St., Suite B, Hughson, CA 95326",
    town: "hughson",
    phone: LUMIRA_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1)" },
    needs: ["primary", "mental"],
    center: [-120.8663, 37.59605],
    onMap: true,
    url: LUMIRA_LOC,
  },
  {
    id: "lumira-waterford",
    org: "lumira",
    name: "Lumira HealthCare – Waterford Bentley St",
    address: "12619 Bentley St., Waterford, CA 95386",
    town: "waterford",
    phone: LUMIRA_PHONE,
    hours: { en: "Mon–Fri 8 a.m.–5 p.m. (closed noon–1); first Saturday of the month 8 a.m.–4 p.m. (call to confirm)", es: "lunes a viernes 8 a. m.–5 p. m. (cerrado de 12 a 1); primer sábado del mes 8 a. m.–4 p. m. (llame para confirmar)" },
    needs: ["primary", "mental"],
    center: [-120.7613, 37.64094],
    onMap: true,
    url: LUMIRA_LOC,
  },
  // ------------------------------------------------------------------- others
  {
    id: "st-lukes",
    org: "free",
    name: "St. Luke’s Family Practice (free clinic)",
    address: "1700 McHenry Village Way, Suite 2, Modesto, CA 95350",
    town: "modesto",
    phone: "(209) 549-1057",
    hours: { en: "Mon, Tue, Thu and Fri 8:15 a.m.–5 p.m. (closed Wednesday)", es: "lunes, martes, jueves y viernes 8:15 a. m.–5 p. m. (cerrado los miércoles)" },
    needs: ["primary", "women", "kids"],
    note: {
      en: "Free doctor visits for people with no insurance (not for people with Medi-Cal, Medicare or other insurance). Not same-day: go in or call to get an appointment, and bring any letter denying you Medi-Cal or Covered California if you have one. Medicines, outside lab tests, X-rays and dental are not free.",
      es: "Consultas médicas gratis para personas sin seguro (no para quienes tienen Medi-Cal, Medicare u otro seguro). No atiende el mismo día: vaya o llame para hacer una cita, y lleve la carta en la que le negaron Medi-Cal o Covered California si la tiene. Las medicinas, los análisis fuera de la clínica, las radiografías y la atención dental no son gratis.",
    },
    center: [-120.98989, 37.66849],
    onMap: false,
    url: "https://stlukesfp.org/receive-care/",
  },
  {
    id: "oak-valley-oakdale",
    org: "hospital",
    name: "Oak Valley Hospital District – Oakdale Clinic",
    address: "1420 West H St., Oakdale, CA 95361",
    town: "oakdale",
    phone: "(209) 848-4180",
    hours: { en: "Open 7 days, 8 a.m.–6 p.m.; walk-ins welcome", es: "Abierto los 7 días, 8 a. m.–6 p. m.; atienden sin cita" },
    needs: ["primary", "urgent", "women", "kids"],
    note: {
      en: "Oak Valley Hospital District’s community clinic. Takes Medi-Cal; patient navigators can help you apply for Medi-Cal or Covered California.",
      es: "Clínica comunitaria del Distrito Hospitalario Oak Valley. Acepta Medi-Cal; sus navegadores de pacientes pueden ayudarle a solicitar Medi-Cal o Covered California.",
    },
    center: [-120.86172, 37.75825],
    onMap: false,
    url: "https://www.oakvalleycares.org/clinics/",
  },
  {
    id: "pp-modesto",
    org: "pp",
    name: "Planned Parenthood – Modesto Health Center",
    address: "1431 McHenry Ave., Suite 100, Modesto, CA 95350",
    town: "modesto",
    phone: "(209) 579-2300",
    hours: MF("8:30 a.m.", "5 p.m."),
    needs: ["women"],
    note: {
      en: "Birth control, emergency contraception, pregnancy testing, abortion, prenatal care, STD testing and treatment, vaccines and wellness exams. Takes Medi-Cal and Family PACT; insurance not required. Planned Parenthood says it will never turn you away if you can’t pay; otherwise you pay on the day of your visit. Walk-ins are seen when there is room.",
      es: "Anticonceptivos, anticoncepción de emergencia, pruebas de embarazo, aborto, atención prenatal, pruebas y tratamiento de enfermedades de transmisión sexual, vacunas y exámenes de bienestar. Acepta Medi-Cal y Family PACT; no necesita seguro. Planned Parenthood dice que nunca lo rechazará si no puede pagar; si no, se paga el día de la cita. Atienden sin cita cuando hay espacio.",
    },
    center: [-120.99401, 37.66474],
    onMap: false,
    url: "https://www.plannedparenthood.org/health-center/california/modesto/95350/modesto-health-center-2527-90130",
  },
  {
    id: "county-vaccines",
    org: "county",
    name: "Stanislaus County Immunization Clinic",
    address: "1524 McHenry Ave., Modesto, CA 95350",
    town: "modesto",
    phone: "(209) 558-7700",
    hours: { en: "Call for an appointment; limited walk-ins Mon, Wed and Fri 10 a.m.–4 p.m.", es: "Llame para hacer una cita; algunas visitas sin cita lunes, miércoles y viernes de 10 a. m. a 4 p. m." },
    needs: ["vaccines"],
    note: {
      en: "Free or low-cost vaccines for children and adults with no insurance (or whose insurance doesn’t cover vaccines), children 0–18 who have or qualify for Medi-Cal, and flu shots for anyone 6 months or older.",
      es: "Vacunas gratis o de bajo costo para niños y adultos sin seguro (o cuyo seguro no cubre vacunas), niños de 0 a 18 años que tienen Medi-Cal o califican para Medi-Cal, y vacunas contra la gripe para cualquier persona de 6 meses o más.",
    },
    center: [-120.99387, 37.66553],
    onMap: false,
    url: "https://www.schsa.org/PublicHealth/programs/immunizations",
  },
];

const CFR_51C = "https://www.law.cornell.edu/cfr/text/42/51c.303";
const CFR_92 = "https://www.law.cornell.edu/cfr/text/45/92.201";
const COVERED_CA = "https://www.coveredca.com/learning-center/information-for-immigrants/";
const IHCP = "https://www.schsa.org/services/indigent-health-care-program";

export const CLINICS_FACTS = {
  /** Paying when you have no insurance. */
  pay: [
    {
      id: "sliding",
      cite: "42 CFR 51c.303(f), (u)",
      en: "Community health centers that get federal health-center funding, like Golden Valley and Lumira, may not turn anyone away because they can’t pay. They charge on a sliding scale by income: at or below the federal poverty line you get a full discount (they may charge a small fee), and above twice the poverty line there is no discount.",
      es: "Los centros de salud comunitarios que reciben fondos federales de centros de salud, como Golden Valley y Lumira, no pueden rechazar a nadie porque no pueda pagar. Cobran según una escala por ingresos: si sus ingresos están en la línea federal de pobreza o por debajo, recibe el descuento completo (pueden cobrar una cuota pequeña), y si están por encima del doble de esa línea no hay descuento.",
    },
    {
      id: "gvhc-pay",
      cite: "Golden Valley Health Centers: Sliding Fee Scale and Payment pages",
      en: "Golden Valley says it sees all patients regardless of ability to pay, with a sliding-fee discount based on family size and income: ask at the registration desk. Its urgent care clinics take walk-ins after hours.",
      es: "Golden Valley dice que atiende a todos los pacientes sin importar su capacidad de pago, con un descuento según el tamaño y los ingresos de la familia: pregunte en la mesa de registro. Sus clínicas de atención urgente reciben pacientes sin cita después del horario normal.",
    },
    {
      id: "lumira-pay",
      cite: "Lumira HealthCare: Patient Resources",
      en: "Lumira says it will never refuse care because someone can’t pay. It offers a sliding-fee discount by family size and income, free help applying for coverage, and free rides to appointments for eligible patients. Call or text to book; walk-ins are seen when there is room.",
      es: "Lumira dice que nunca negará atención porque alguien no pueda pagar. Ofrece un descuento según el tamaño y los ingresos de la familia, ayuda gratis para solicitar cobertura y transporte gratis a las citas para pacientes que califican. Llame o mande un texto para hacer cita; atienden sin cita cuando hay espacio.",
    },
    {
      id: "bring",
      cite: "Lumira HealthCare: Patient Resources",
      en: "If you have them, bring a photo ID, any insurance or Medi-Cal card, and your medicines. For the sliding fee, bring proof of income such as pay stubs or your last tax return (Lumira asks for these). If you don’t have an ID or proof of income, call first and ask what they accept.",
      es: "Si los tiene, lleve una identificación con foto, su tarjeta de seguro o de Medi-Cal, y sus medicinas. Para el descuento, lleve comprobantes de ingresos, como talones de pago o su última declaración de impuestos (Lumira los pide). Si no tiene identificación ni comprobantes de ingresos, llame antes y pregunte qué aceptan.",
    },
  ] satisfies Fact[],

  /** Your rights at the clinic. */
  rights: [
    {
      id: "interpreter",
      cite: "45 CFR 92.201 (Affordable Care Act §1557)",
      en: "Clinics that take federal money must take reasonable steps to give you language help free of charge, and when you need an interpreter they must offer a qualified one. They may not make you bring or pay for your own interpreter. They may not use your child to interpret, except briefly in an emergency while they find a qualified interpreter. They may use an adult who came with you only in an emergency, or if you ask for it in private and that adult agrees.",
      es: "Las clínicas que reciben dinero federal deben tomar medidas razonables para darle ayuda con el idioma gratis y, cuando necesite un intérprete, deben ofrecerle uno calificado. No pueden obligarlo a traer ni a pagar su propio intérprete. No pueden usar a su hijo o hija como intérprete, salvo por poco tiempo en una emergencia mientras consiguen un intérprete calificado. Solo pueden usar a un adulto que lo acompañe en una emergencia, o si usted lo pide en privado y ese adulto está de acuerdo.",
    },
    {
      id: "status-checks",
      cite: "New York v. U.S. Dept. of Justice, D.R.I. 1:25-cv-00345 (Oregon DOJ litigation tracker)",
      en: "Health centers don’t have to check immigration status. In July 2025 the federal health department (HHS) said health-center care should be limited by immigration status, but a federal court blocked that in California and other states, and ruled for the states on September 21, 2026 (New York v. U.S. Department of Justice). HHS could try again with a new rule.",
      es: "Los centros de salud no tienen que revisar el estatus migratorio. En julio de 2025 el Departamento de Salud federal (HHS) dijo que la atención en los centros de salud debía limitarse según el estatus migratorio, pero una corte federal lo bloqueó en California y otros estados, y falló a favor de los estados el 21 de septiembre de 2026 (New York v. U.S. Department of Justice). HHS podría intentarlo de nuevo con una nueva regla.",
    },
    ...factsById(RIGHTS_FACTS.california, "law-sb81"),
  ] satisfies Fact[],

  /** Getting coverage. */
  coverage: [
    {
      id: "apply",
      cite: "Covered California: Information for Immigrants",
      en: "Anyone can apply: Covered California and Medi-Cal use the same application, and it checks every program you might qualify for. Children (0–18) can get full Medi-Cal, and so can pregnant people (during pregnancy and for a year after), whatever their immigration status.",
      es: "Cualquier persona puede solicitar: Covered California y Medi-Cal usan la misma solicitud, que revisa todos los programas para los que podría calificar. Los niños (de 0 a 18 años) pueden recibir Medi-Cal completo, y también las personas embarazadas (durante el embarazo y un año después), sin importar su estatus migratorio.",
    },
    ...factsById(MCW_FACTS.immigrants, "freeze"),
    {
      id: "emergency",
      cite: "Covered California: Information for Immigrants",
      en: "Everyone, whatever their immigration status, can get emergency Medi-Cal for serious medical emergencies, and emergency dental care for severe pain, infection or a tooth that must come out.",
      es: "Todas las personas, sin importar su estatus migratorio, pueden recibir Medi-Cal de emergencia para emergencias médicas graves, y atención dental de emergencia por dolor fuerte, infección o un diente que hay que sacar.",
    },
    {
      id: "covered-ca",
      cite: "Covered California: Information for Immigrants",
      en: "Covered California health plans are only for people who are lawfully present. People who are not, and DACA recipients (since August 2025), can’t buy a plan there, but can still apply to see what Medi-Cal they qualify for.",
      es: "Los planes de salud de Covered California son solo para personas con presencia legal. Quienes no la tienen, y quienes tienen DACA (desde agosto de 2025), no pueden comprar un plan ahí, pero sí pueden solicitar para ver a qué Medi-Cal califican.",
    },
    {
      id: "ihcp",
      cite: "Stanislaus County Health Services Agency: Indigent Health Care Program",
      en: "Stanislaus County’s Indigent Health Care Program gives limited coverage to low-income residents 21 to 65 who can’t get Medi-Cal, Covered California or other coverage (choosing not to apply doesn’t count). It has income and asset limits and is only for U.S. citizens and qualified immigrants. Call (209) 558-7232.",
      es: "El Programa de Atención Médica para Personas de Bajos Recursos del Condado de Stanislaus da cobertura limitada a residentes de bajos ingresos de 21 a 65 años que no pueden recibir Medi-Cal, Covered California ni otra cobertura (no solicitarlos no cuenta). Tiene límites de ingresos y bienes, y es solo para ciudadanos de EE. UU. e inmigrantes calificados. Llame al (209) 558-7232.",
    },
    {
      id: "public-charge",
      cite: "DHS Public Charge rule (effective Sept 18, 2026); California Health and Human Services: Public Charge",
      en: `${PUBLIC_CHARGE.text.en} ${PUBLIC_CHARGE.caveat.en} Public charge does not apply to most immigrants already in the U.S., and it doesn’t decide who can get care. Don’t skip care you need: ask a free immigration legal provider about your case.`,
      es: `${PUBLIC_CHARGE.text.es} ${PUBLIC_CHARGE.caveat.es} La carga pública no se aplica a la mayoría de los inmigrantes que ya están en EE. UU., y no decide quién puede recibir atención. No deje de recibir la atención que necesita: consulte su caso con un proveedor legal gratuito de inmigración.`,
    },
  ] satisfies Fact[],
};

export const CLINICS_CONTACTS = {
  crisis: {
    name: { en: "Stanislaus County mental health and substance use crisis line (24/7, mobile crisis team)", es: "Línea de crisis de salud mental y uso de sustancias del Condado de Stanislaus (24/7, equipo móvil de crisis)" },
    phone: "(888) 376-6246",
    url: "https://www.stancounty.com/bhrs/",
  } satisfies Contact,
  lifeline: {
    name: { en: "988 Suicide & Crisis Lifeline: call 988 and press 2 for Spanish, or text AYUDA to 988", es: "Línea 988 de Prevención del Suicidio y Crisis: llame al 988 y oprima el 2 para español, o mande la palabra AYUDA por texto al 988" },
    url: "https://988lifeline.org/get-help/",
  } satisfies Contact,
  mobile: {
    name: { en: "Golden Valley’s mobile clinic: where it parks each day", es: "Clínica móvil de Golden Valley: dónde se estaciona cada día" },
    url: "https://www.gvhc.org/services/mobileclinic/",
  } satisfies Contact,
  ihcp: {
    name: { en: "Stanislaus County Indigent Health Care Program", es: "Programa de Atención Médica para Personas de Bajos Recursos del Condado" },
    phone: "(209) 558-7232",
    url: IHCP,
  } satisfies Contact,
  mediCal: MCW_CONTACTS.county,
  hca: MCW_CONTACTS.hca,
};

/** Directions with a plain link (no embedded map, no script). */
export const directionsUrl = (address: string) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;

export const CLINICS_SOURCES: SourceRef[] = [
  { label: "HRSA: health center service delivery sites (Stanislaus County)", url: "https://gisportal.hrsa.gov/server/rest/services/HealthCareFacilities/HealthCareFacilities/MapServer/18" },
  { label: "Golden Valley Health Centers: locations", url: GVHC_LOC },
  { label: "Golden Valley Health Centers: sliding fee scale", url: "https://www.gvhc.org/sliding-fee-scale/" },
  { label: "Golden Valley Health Centers: payment", url: "https://www.gvhc.org/payment/" },
  { label: "Golden Valley Health Centers: language services", url: "https://www.gvhc.org/language-services/" },
  { label: "Lumira HealthCare: locations", url: LUMIRA_LOC },
  { label: "Lumira HealthCare: patient resources (payment, rides)", url: "https://lumirahealthcare.com/patient-resources/" },
  { label: "St. Luke’s Family Practice: Receive Care (free clinic)", url: "https://stlukesfp.org/receive-care/" },
  { label: "Stanislaus County BHRS: Community Provider Resource List (PDF)", url: "https://www.stancounty.com/bhrs/pdf/CommunityProviderResourceList_Eng.pdf" },
  { label: "Oak Valley Hospital District: Clinics", url: "https://www.oakvalleycares.org/clinics/" },
  { label: "Oregon DOJ litigation tracker: New York v. U.S. Dept. of Justice (D.R.I.)", url: "https://www.doj.state.or.us/oregon-department-of-justice/federal-oversight/federal-litigation-tracker/efforts-to-restrict-public-benefits-new-york-v-u-s-dept-of-justice-d-r-i-125-cv-00345/" },
  { label: "California Health and Human Services: Public Charge", url: "https://www.chhs.ca.gov/public-charge/" },
  { label: "988 Suicide & Crisis Lifeline: Get help (Spanish: press 2, text AYUDA)", url: "https://988lifeline.org/get-help/" },
  { label: "Planned Parenthood: Modesto Health Center", url: "https://www.plannedparenthood.org/health-center/california/modesto/95350/modesto-health-center-2527-90130" },
  { label: "42 CFR 51c.303: health center fees and discounts", url: CFR_51C },
  { label: "45 CFR 92.201: language assistance (ACA §1557)", url: CFR_92 },
  { label: "Covered California: information for immigrants", url: COVERED_CA },
  { label: "Stanislaus County HSA: Indigent Health Care Program", url: IHCP },
  { label: "Stanislaus County HSA: Immunization Program", url: "https://www.schsa.org/PublicHealth/programs/immunizations" },
  { label: "Stanislaus County Behavioral Health and Recovery Services", url: "https://www.stancounty.com/bhrs/" },
  { label: "Cal DOJ, SB 81 Bulletin (October 2025)", url: "https://oag.ca.gov/system/files/attachments/press-docs/SB%2081%20Bulletin%20-%20October%202025.pdf" },
];
