// Hospitals in Stanislaus County and their financial assistance ("charity
// care") policies, read from each hospital's own policy as filed with HCAI
// (hcai.ca.gov/affordability/hospital-billing-policies). Locations are from
// CDPH's licensed-facility list (2026-10-16). Checked 2026-10-19.
//
// Links point at the HCAI-filed copy when a hospital's own site blocks
// downloads; the hospital's page is linked too. Spanish links only where a
// Spanish document actually exists.
import type { Bilingual } from "./letter-types";
import type { CarePolicy } from "./fpl";
import { distanceM, type LonLat } from "../near-me-logic";

export interface Hospital {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lon: number;
  operator: string;
  phone: string;
  /** The hospital's own financial assistance page. */
  pageUrl: string;
  policyUrl: string;
  policyUrlEs?: string;
  applicationUrl: string;
  applicationUrlEs?: string;
  policy: CarePolicy;
  note: Bilingual;
  policyDate: string;
  /** Matches this hospital's name on the federal (HIFLD) map pins. */
  pin: RegExp;
}

const HCAI = (id: string) => `https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id=${id}`;

// Tenet's California policy (identical for its three county hospitals).
const TENET_POLICY: CarePolicy = {
  free: { maxFpl: 199.99, who: "uninsured" }, // "below 200%"
  discount: { maxFpl: 400, who: "uninsured-or-high-costs" },
};
const TENET_NOTE: Bilingual = {
  en: "Free care is for patients without insurance whose income is below 200% of the poverty line. Patients up to 400%, uninsured or with high medical costs, get discounts. Its Spanish web page doesn’t match the California policy, so ask for the California policy or use the English one.",
  es: "La atención gratis es para pacientes sin seguro con ingresos por debajo del 200% de la línea de pobreza. Los pacientes hasta el 400%, sin seguro o con gastos médicos altos, reciben descuentos. Su página web en español no coincide con la política de California: pida la política de California o use la de inglés.",
};

export const HOSPITALS: Hospital[] = [
  {
    id: "memorial-modesto",
    name: "Memorial Medical Center",
    address: "1700 Coffee Rd",
    city: "Modesto",
    lat: 37.668762,
    lon: -120.9746565,
    operator: "Sutter Health",
    phone: "(855) 398-1633",
    pageUrl: "https://www.sutterhealth.org/billing-insurance/financial-assistance",
    policyUrl: HCAI("f649d463-c3b8-4798-8a38-f8dc815ea008"),
    policyUrlEs:
      "https://www.sutterhealth.org/-/media/Project/SutterHealth/SutterHealth/files/billing-insurance/financial-assistance/hospital-financial-assistance-policy-spanish.pdf",
    applicationUrl: HCAI("26dff169-62b5-43ca-bbf4-fee4f9c31ce8"),
    policy: { free: { maxFpl: 400, who: "uninsured-or-high-costs" }, discount: null },
    note: {
      en: "The most generous policy in the county: free care at or below 400% of the poverty line for patients without insurance, and for insured patients whose out-of-pocket medical costs in the past 12 months are more than 10% of family income. (Its Spanish policy is an older translation.)",
      es: "La política más generosa del condado: atención gratis hasta el 400% de la línea de pobreza para pacientes sin seguro, y para pacientes con seguro cuyos gastos médicos de su bolsillo en los últimos 12 meses pasan del 10% de los ingresos de la familia. (Su política en español es una traducción antigua.)",
    },
    policyDate: "2026-01-01",
    pin: /MEMORIAL/,
  },
  {
    id: "doctors-modesto",
    name: "Doctors Medical Center",
    address: "1441 Florida Ave",
    city: "Modesto",
    lat: 37.665198,
    lon: -120.99735,
    operator: "Tenet Healthcare",
    phone: "(888) 233-7868",
    pageUrl: "https://www.dmc-modesto.com/patients/financial-assistance-program",
    policyUrl: HCAI("fdfeaf95-fe2e-422f-b339-9d51e0e57017"),
    applicationUrl: HCAI("030e6946-3f3e-4aa8-9b92-7622343fb7f5"),
    policy: TENET_POLICY,
    note: TENET_NOTE,
    policyDate: "2024-12-31",
    pin: /^DOCTORS MEDICAL CENTER$/,
  },
  {
    id: "doctors-behavioral",
    name: "Doctors Medical Center – Behavioral Health",
    address: "1501 Claus Rd",
    city: "Modesto",
    lat: 37.665423,
    lon: -120.922056,
    operator: "Tenet Healthcare",
    phone: "(888) 233-7868",
    pageUrl: "https://www.dmc-modesto.com/patients/financial-assistance-program",
    policyUrl: HCAI("b0fd0a5e-ed5a-4229-b005-d11611a5ef13"),
    applicationUrl: HCAI("f16b6c95-93f6-4af9-9c7d-1cee6e8ae356"),
    policy: TENET_POLICY,
    note: TENET_NOTE,
    policyDate: "2024-12-31",
    pin: /BEHAVIORAL/,
  },
  {
    id: "emanuel-turlock",
    name: "Emanuel Medical Center",
    address: "825 Delbon Ave",
    city: "Turlock",
    lat: 37.511172,
    lon: -120.8383335,
    operator: "Tenet Healthcare",
    phone: "(888) 233-7868",
    pageUrl: "https://www.emanuelmedicalcenter.org/patients/financial-assistance-program",
    policyUrl: HCAI("d5039c4f-0573-4440-a632-6e3c45a111ab"),
    applicationUrl: HCAI("2be508d7-f67d-4cea-97f0-33492f33551e"),
    policy: TENET_POLICY,
    note: TENET_NOTE,
    policyDate: "2024-12-31",
    pin: /^EMANUEL/,
  },
  {
    id: "kaiser-modesto",
    name: "Kaiser Permanente Modesto Medical Center",
    address: "4601 Dale Rd",
    city: "Modesto",
    lat: 37.705941,
    lon: -121.052853,
    operator: "Kaiser Permanente",
    phone: "(800) 390-3507",
    pageUrl: "https://healthy.kaiserpermanente.org/northern-california/help-paying-your-bill/medical-financial-assistance/documents",
    policyUrl:
      "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/mfa/northern-california/english-ncal/mfa-policy-and-addendum-ncal-english-ada.pdf",
    policyUrlEs:
      "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/mfa/northern-california/policy-translated-languages/mfa-policy-and-addendum-ncal-spanish-ada.pdf",
    applicationUrl:
      "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/mfa/northern-california/english-ncal/mfa-program-application-ncal-en-ada.pdf",
    applicationUrlEs:
      "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/mfa/northern-california/application-translated-languages/mfa-application-ncal-spanish.pdf",
    policy: { free: { maxFpl: 200, who: "anyone" }, discount: { maxFpl: 400, who: "anyone" } },
    note: {
      en: "For members and non-members. Free at or below 200% of the poverty line; 50% off from 201% to 400%. Also full help at any income if your out-of-pocket costs for its care in the past 12 months were 10% or more of household income. You can apply online at kp.org/helppaybills.",
      es: "Para miembros y no miembros. Gratis hasta el 200% de la línea de pobreza; 50% de descuento del 201% al 400%. También ayuda completa con cualquier ingreso si sus gastos de su bolsillo por su atención en los últimos 12 meses fueron el 10% o más de los ingresos del hogar. Puede pedirla en línea en kp.org/helppaybills.",
    },
    policyDate: "2025-01-01",
    pin: /KAISER/,
  },
  {
    id: "oak-valley-oakdale",
    name: "Oak Valley Hospital",
    address: "350 S Oak Ave",
    city: "Oakdale",
    lat: 37.757637,
    lon: -120.86091,
    operator: "Oak Valley Hospital District",
    phone: "(209) 848-5366",
    pageUrl: "https://oakvalleyhospital.com/oak-valley-hospital-financial-assistance/",
    policyUrl: "https://oakvalleyhospital.com/wp-content/uploads/2025/07/Financial-Assistance-Policy-Jan-1-2025-r-1.pdf",
    policyUrlEs: "https://oakvalleyhospital.com/wp-content/uploads/2025/07/Financial-Assistance-Policy-Jan-1-2025_ES-1.pdf",
    applicationUrl: "https://oakvalleyhospital.com/wp-content/uploads/2025/07/Financial-Assistance-Application-Jan-1-2025-r-1.pdf",
    applicationUrlEs: "https://oakvalleyhospital.com/wp-content/uploads/2025/07/Financial-Assistance-Application-Jan-1-2025_ES-1.pdf",
    policy: { free: { maxFpl: 200, who: "uninsured-or-high-costs" }, discount: { maxFpl: 400, who: "uninsured-or-high-costs" } },
    note: {
      en: "Free at or below 200% of the poverty line. From 201% to 400%, you pay no more than the Medicare or Medi-Cal rate. Patient Financial Services is open Mon–Fri 8:00–4:30.",
      es: "Gratis hasta el 200% de la línea de pobreza. Del 201% al 400%, no paga más de la tarifa de Medicare o Medi-Cal. La oficina de servicios financieros atiende de lunes a viernes de 8:00 a 4:30.",
    },
    policyDate: "2025-01-01",
    pin: /OAK VALLEY/,
  },
  {
    id: "central-valley-specialty",
    name: "Central Valley Specialty Hospital",
    address: "730 17th St",
    city: "Modesto",
    lat: 37.64349,
    lon: -120.990735,
    operator: "Central Valley Specialty Hospital, Inc.",
    phone: "(209) 488-4820",
    pageUrl: "https://centralvalleyspecialty.com/help-paying-your-bill/",
    policyUrl: HCAI("2835ba8f-0ec3-47c1-97ba-6152b93f9b9f"),
    applicationUrl: HCAI("0548fdea-eba8-4b33-b855-a8ac9c9f53a4"),
    policy: { free: { maxFpl: 400, who: "uninsured-or-high-costs" }, discount: { maxFpl: 600, who: "uninsured-or-high-costs" } },
    note: {
      en: "A long-term acute care hospital (no emergency room). Free at or below 400% of the poverty line; discounts from 400% to 600%.",
      es: "Un hospital de cuidados agudos a largo plazo (sin sala de emergencias). Gratis hasta el 400% de la línea de pobreza; descuentos del 400% al 600%.",
    },
    policyDate: "2025-06-17",
    pin: /CENTRAL VALLEY SPECIALTY/,
  },
  {
    id: "encompass-modesto",
    name: "Encompass Health Rehabilitation Hospital of Modesto",
    address: "1303 Mable Ave",
    city: "Modesto",
    lat: 37.69618652,
    lon: -120.9754811,
    operator: "Encompass Health",
    phone: "(209) 857-3436",
    pageUrl: "https://encompasshealth.com/locations/modesto-rehab/financial-information",
    policyUrl:
      "https://edge.sitecorecloud.io/encompasshee178-encompasshed9db-prodb258-07da/media/Project/EncompassHealth/encompasshealth/Files/Financial-Assistance/Financial_Assistance_Policy/modesto-financial-assistance-policy.pdf",
    policyUrlEs:
      "https://edge.sitecorecloud.io/encompasshee178-encompasshed9db-prodb258-07da/media/Project/EncompassHealth/encompasshealth/Files/Financial-Assistance/Financial_Assistance_Policy_SP/modesto-financial-assistance-policy-sp.pdf",
    applicationUrl:
      "https://edge.sitecorecloud.io/encompasshee178-encompasshed9db-prodb258-07da/media/Project/EncompassHealth/encompasshealth/Files/Financial-Assistance/Instructions_Applications/modesto-instructions-and-application.pdf",
    applicationUrlEs:
      "https://edge.sitecorecloud.io/encompasshee178-encompasshed9db-prodb258-07da/media/Project/EncompassHealth/encompasshealth/Files/Financial-Assistance/Instructions_Applications_SP/modesto-instruction-and-application-sp.pdf",
    policy: { free: { maxFpl: 200, who: "uninsured-or-high-costs" }, discount: { maxFpl: 400, who: "uninsured-or-high-costs" } },
    note: {
      en: "An inpatient rehabilitation hospital (no emergency room). Free at or below 200% of the poverty line; 75% off from 201% to 300%; 50% off from 301% to 400%. It says it never sues, places liens or reports to credit bureaus.",
      es: "Un hospital de rehabilitación (sin sala de emergencias). Gratis hasta el 200% de la línea de pobreza; 75% de descuento del 201% al 300%; 50% del 301% al 400%. Dice que nunca demanda, pone embargos ni reporta a las agencias de crédito.",
    },
    policyDate: "2025-10-01",
    pin: /HEALTHSOUTH|ENCOMPASS/,
  },
];

/** On the federal (HIFLD) hospital map but closed: Stanislaus Surgical Hospital
 *  suspended operations in September 2024 and isn't on CDPH's licensed list. */
const CLOSED: LonLat[] = [[-120.958499923, 37.664801074]];

/** How close a map pin must be to count as the same hospital. */
const MATCH_M = 400;

/** The curated hospital a map pin shows: close by AND the same name, so a
 *  nursing home next door never gets the hospital's policy. */
export function findHospital(at: LonLat, pinName = ""): Hospital | null {
  const name = pinName.trim().toUpperCase();
  let best: { h: Hospital; m: number } | null = null;
  for (const h of HOSPITALS) {
    if (name && !h.pin.test(name)) continue;
    const m = distanceM(at, [h.lon, h.lat]);
    if (m <= MATCH_M && (!best || m < best.m)) best = { h, m };
  }
  return best?.h ?? null;
}

export function isClosedHospital(at: LonLat): boolean {
  return CLOSED.some((c) => distanceM(at, c) <= 150);
}

/** The pin is in California: its STATE field when the data has one, else a
 *  coarse outline (box plus the slanted Nevada border). */
export function inCalifornia([lon, lat]: LonLat, props: Record<string, unknown>): boolean {
  const state = String(props.STATE ?? "").trim().toUpperCase();
  if (state) return state === "CA";
  if (lat < 32.5 || lat > 42 || lon < -124.5 || lon > -114.1) return false;
  // North of 39°N the border runs along 120°W; south of it, it slants to the Colorado River.
  return lat >= 39 ? lon <= -120 : lon <= -120 + ((39 - lat) / (39 - 35)) * 5.4;
}
