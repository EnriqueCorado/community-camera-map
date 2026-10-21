// Every legal fact the Help tools state, with its citation and source, in one
// place. Checked 2026-10-19 against the statutes (via california.public.law,
// which mirrors leginfo.legislature.ca.gov), the CA Attorney General, CA DIR,
// HHS, HCAI, HCD, the courts and each office's own site.
//
// UPDATE EACH YEAR:
//  - RENT_FACTS.periods: DIR publishes April's California CPI around mid-June;
//    the new cap covers increases from Aug 1. (Next: increases from 2027-08-01.)
//  - MEDICAL_FACTS.fpl: HHS publishes poverty guidelines each January.
// Tests (e2e/tests/unit-help.spec.ts) check the cap arithmetic and that the
// facts haven't gone stale.
import type { Bilingual } from "./letter-types";
import type { CapPeriod } from "./rent-cap";
import type { SourceRef } from "../components/help/ui";

export interface Fact extends Bilingual {
  id: string;
  /** Statute or rule, e.g. "Civ. Code §1947.12(a)". */
  cite: string;
}

export interface Contact {
  name: Bilingual;
  phone?: string;
  url: string;
}

const LEGINFO = (code: "CIV" | "CCP" | "HSC", section: string) =>
  `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=${code}&sectionNum=${section}`;

// ---------------------------------------------------------------- renters

export const RENT_FACTS = {
  checked: "2026-10-19",
  /** Stanislaus has no federal metro-area CPI, so the cap uses the California
   *  CPI (DIR), April to April (§1947.12(g)); the AG's "All other counties" row. */
  periods: [
    { from: "2024-08-01", to: "2025-07-31", cpiPct: 3.8, maxPct: 8.8 },
    { from: "2025-08-01", to: "2026-07-31", cpiPct: 2.7, maxPct: 7.7 },
    { from: "2026-08-01", to: "2027-07-31", cpiPct: 3.6, maxPct: 8.6 },
  ] satisfies CapPeriod[],
  sunset: "2030-01-01",
  /** The rent cap doesn't cover housing whose certificate of occupancy is under 15 years old. */
  newConstructionYears: 15,
  capRules: [
    {
      id: "formula",
      cite: "Civ. Code §1947.12(a)(1)",
      en: "Over any 12 months, rent can go up by at most 5% plus inflation, and never more than 10%. It's measured from the lowest rent you were charged in the 12 months before the increase (discounts you were given don't count).",
      es: "En cualquier periodo de 12 meses, la renta puede subir como máximo un 5% más la inflación, y nunca más del 10%. Se mide desde la renta más baja que le cobraron en los 12 meses antes del aumento (los descuentos que le dieron no cuentan).",
    },
    {
      id: "two",
      cite: "Civ. Code §1947.12(a)(2)",
      en: "No more than two increases in 12 months, and together they must stay under the cap.",
      es: "No más de dos aumentos en 12 meses, y juntos deben quedar dentro del límite.",
    },
    {
      id: "new-tenant",
      cite: "Civ. Code §1947.12(b)",
      en: "When a new tenant moves in, the owner can set the starting rent freely. The cap applies to increases after that.",
      es: "Cuando entra un inquilino nuevo, el dueño puede fijar la renta inicial libremente. El límite aplica a los aumentos después de eso.",
    },
    {
      id: "remedy",
      cite: "Civ. Code §1947.12(k)",
      en: "An owner who charges more than the cap owes the tenant the overpayment, and up to three times that if it was willful. Tenants have 3 years to sue. You can't sign away these rights.",
      es: "El dueño que cobra más del límite le debe al inquilino lo que pagó de más, y hasta tres veces esa cantidad si lo hizo a propósito. Tiene 3 años para demandar. Nadie puede hacerle renunciar a estos derechos.",
    },
    {
      id: "just-cause",
      cite: "Civ. Code §1946.2",
      en: "After 12 months in a covered home, you can only be evicted for a reason the law lists. For “no-fault” reasons (like the owner moving in), the owner must pay one month’s rent for relocation or waive your last month.",
      es: "Después de 12 meses en una vivienda cubierta, solo pueden desalojarle por una razón que la ley enumera. Por razones “sin culpa” (como que el dueño se mude ahí), el dueño debe pagarle un mes de renta para su mudanza o perdonarle el último mes.",
    },
    {
      id: "eviction-papers",
      cite: "CCP §1167",
      en: "If you are served with eviction court papers (a summons), you have only 10 court days to respond. Get help the same day.",
      es: "Si le entregan papeles de desalojo de la corte (un “summons”), tiene solo 10 días hábiles de la corte para responder. Busque ayuda el mismo día.",
    },
  ] satisfies Fact[],
  notice: [
    {
      id: "notice-30-90",
      cite: "Civ. Code §827(b)",
      en: "An increase must come in writing, handed to you or mailed: at least 30 days ahead for 10% or less, 90 days for more than 10% (counting all increases in the past 12 months). Mailed notices need 5 extra days. A call, text or email isn't enough.",
      es: "El aviso de aumento debe ser por escrito, entregado en mano o por correo: con al menos 30 días si es del 10% o menos, y 90 días si es de más del 10% (sumando todos los aumentos de los últimos 12 meses). Si llega por correo, se suman 5 días. Una llamada, un texto o un correo electrónico no bastan.",
    },
  ] satisfies Fact[],
  exemptions: [
    {
      id: "new",
      cite: "Civ. Code §1947.12(d)(4)",
      en: "Buildings that got their certificate of occupancy in the last 15 years (the window moves forward every year). This never applies to mobile homes.",
      es: "Edificios que recibieron su certificado de ocupación en los últimos 15 años (el plazo avanza cada año). Esto nunca aplica a casas móviles.",
    },
    {
      id: "house",
      cite: "Civ. Code §1947.12(d)(5)",
      en: "A single-family house or condo, only if BOTH: the owner isn’t a corporation, a REIT or an LLC with a corporate member, AND you were given a written notice saying the home is exempt from Civil Code §1947.12. For leases since July 1, 2020, that notice must be in the lease. No notice means no exemption.",
      es: "Una casa unifamiliar o condominio, solo si se cumplen LAS DOS cosas: el dueño no es una corporación, un REIT ni una LLC con un socio corporativo, Y le dieron un aviso por escrito de que la vivienda está exenta del Código Civil §1947.12. En contratos desde el 1 de julio de 2020, ese aviso debe estar en el contrato. Sin aviso, no hay exención.",
    },
    {
      id: "duplex",
      cite: "Civ. Code §1947.12(d)(6)",
      en: "A duplex where the owner lived in the other unit when your tenancy started and still lives there.",
      es: "Un dúplex donde el dueño vivía en la otra unidad cuando usted empezó a rentar y todavía vive ahí.",
    },
    {
      id: "affordable",
      cite: "Civ. Code §1947.12(d)(1)",
      en: "Income-restricted affordable housing (by deed or a government agreement). A Section 8 voucher in a regular apartment is NOT exempt.",
      es: "Vivienda asequible con restricción de ingresos (por escritura o acuerdo con el gobierno). Un vale de la Sección 8 en un apartamento normal NO está exento.",
    },
    {
      id: "dorm",
      cite: "Civ. Code §1947.12(d)(2)",
      en: "School and college dorms.",
      es: "Dormitorios de escuelas y universidades.",
    },
  ] satisfies Fact[],
  /** Stanislaus cities have no rent control for apartments or houses (AG's list, city codes). */
  localRentControl: false,
} as const;

export const REPAIR_FACTS = {
  rights: [
    {
      id: "duty",
      cite: "Civ. Code §1941, §1941.1",
      en: "Your landlord must keep the home livable: working heat, hot and cold water, plumbing, gas and electricity, a weather-tight roof and windows, no pests or garbage build-up, safe floors and stairs. For leases signed, renewed or changed since January 1, 2026, a working stove and refrigerator too.",
      es: "Su arrendador debe mantener la vivienda habitable: calefacción, agua caliente y fría, plomería, gas y electricidad que funcionen, techo y ventanas que no dejen pasar el agua, sin plagas ni basura acumulada, pisos y escaleras seguros. En contratos firmados, renovados o cambiados desde el 1 de enero de 2026, también una estufa y un refrigerador que funcionen.",
    },
    {
      id: "writing",
      cite: "CA Attorney General",
      en: "Ask in writing and keep a copy. Take dated photos and videos of the problem. Written requests are your proof.",
      es: "Pida las reparaciones por escrito y guarde una copia. Tome fotos y videos con fecha del problema. Las solicitudes por escrito son su prueba.",
    },
    {
      id: "retaliation",
      cite: "Civ. Code §1942.5",
      en: "If you’re current on rent, your landlord can’t evict you, raise your rent or cut services for 180 days after you ask for repairs or complain to the city. Threatening to report you to immigration is illegal retaliation.",
      es: "Si está al corriente con la renta, su arrendador no puede desalojarle, subirle la renta ni quitarle servicios durante 180 días después de que pida reparaciones o se queje con la ciudad. Amenazar con reportarle a inmigración es una represalia ilegal.",
    },
    {
      id: "code",
      cite: "Civ. Code §1942.4",
      en: "If a city or county inspector orders repairs and they’re still not done 35 days later, the landlord can’t collect or raise rent until they are.",
      es: "Si un inspector de la ciudad o del condado ordena reparaciones y 35 días después no están hechas, el arrendador no puede cobrar ni subir la renta hasta que las haga.",
    },
    {
      id: "deduct",
      cite: "Civ. Code §1942",
      en: "“Repair and deduct” has strict limits (up to one month’s rent, twice a year, after giving reasonable time, usually 30 days). Withholding rent can get you evicted. Talk to legal aid before doing either.",
      es: "“Reparar y descontar” tiene límites estrictos (hasta un mes de renta, dos veces al año, después de dar un tiempo razonable, normalmente 30 días). Dejar de pagar la renta puede llevar a un desalojo. Hable con ayuda legal antes de hacer cualquiera de las dos cosas.",
    },
    {
      id: "entry",
      cite: "Civ. Code §1954",
      en: "To make repairs, the landlord must give reasonable written notice (24 hours is presumed reasonable), except in an emergency.",
      es: "Para hacer reparaciones, el arrendador debe avisarle por escrito con tiempo razonable (se considera razonable 24 horas), excepto en una emergencia.",
    },
  ] satisfies Fact[],
  /** City/county inspectors who can order repairs (the cities not listed have their own; call city hall). */
  codeEnforcement: [
    { name: { en: "Modesto Code Enforcement", es: "Inspección de Códigos de Modesto (Code Enforcement)" }, phone: "(209) 577-5250", url: "https://www.modestogov.com/666/Code-Enforcement" },
    { name: { en: "Turlock Code Enforcement", es: "Code Enforcement de Turlock" }, phone: "(209) 664-7348", url: "https://www.cityofturlock.org/neighborhoodissues/safetyconcerns/unsafebuildings.asp" },
    { name: { en: "Ceres Code Enforcement", es: "Code Enforcement de Ceres" }, phone: "(209) 538-5799", url: "https://www.ceres.gov/714/Code-Enforcement" },
    { name: { en: "Stanislaus County (unincorporated areas): Environmental Resources", es: "Condado de Stanislaus (zonas no incorporadas): Recursos Ambientales" }, phone: "(209) 525-6700", url: "https://www.stancounty.com/er/codeenforcement/faq.shtm" },
  ] satisfies Contact[],
};

export const DEPOSIT_FACTS = {
  rights: [
    {
      id: "21",
      cite: "Civ. Code §1950.5(h)",
      en: "Within 21 days after you move out, the landlord must return your deposit, or send an itemized list of deductions with the rest.",
      es: "Dentro de los 21 días después de que se mude, el arrendador debe devolverle el depósito, o mandarle una lista detallada de descuentos junto con el resto.",
    },
    {
      id: "allowed",
      cite: "Civ. Code §1950.5(b), (e)",
      en: "They can only deduct unpaid rent, damage beyond normal wear and tear, and cleaning to get the home as clean as when you moved in. Never for normal wear or damage that was already there.",
      es: "Solo pueden descontar renta no pagada, daños más allá del desgaste normal, y limpieza para dejar la vivienda tan limpia como cuando usted llegó. Nunca por desgaste normal ni por daños que ya existían.",
    },
    {
      id: "receipts",
      cite: "Civ. Code §1950.5(g), (h)(2)",
      en: "For repair or cleaning charges over $125 they must include receipts or invoices, and (since April 1, 2025) before-and-after photos.",
      es: "Si cobran más de $125 por reparaciones o limpieza, deben incluir recibos o facturas y (desde el 1 de abril de 2025) fotos de antes y después.",
    },
    {
      id: "electronic",
      cite: "Civ. Code §1950.5(h)(1)",
      en: "If you paid your deposit or rent electronically, you can ask in writing for the refund to go to your bank account (since January 1, 2026).",
      es: "Si pagó el depósito o la renta de forma electrónica, puede pedir por escrito que le devuelvan el dinero a su cuenta de banco (desde el 1 de enero de 2026).",
    },
    {
      id: "penalty",
      cite: "Civ. Code §1950.5(m)",
      en: "A landlord who keeps a deposit in bad faith can be ordered to pay up to twice the deposit on top of what they owe you.",
      es: "Un arrendador que se queda con el depósito de mala fe puede tener que pagar hasta el doble del depósito además de lo que le debe.",
    },
    {
      id: "small-claims",
      cite: "CCP §116.221",
      en: "You can sue in small claims court for up to $12,500 without a lawyer. Filing costs $30–$75 (fee waivers exist).",
      es: "Puede demandar en la corte de reclamos menores hasta $12,500 sin abogado. Presentar el caso cuesta de $30 a $75 (hay exención de cuotas).",
    },
    {
      id: "cap",
      cite: "Civ. Code §1950.5(c)",
      en: "Since July 1, 2024, most landlords may ask for a deposit of no more than one month’s rent (two months for some small landlords).",
      es: "Desde el 1 de julio de 2024, la mayoría de los arrendadores no pueden pedir un depósito de más de un mes de renta (dos meses para algunos arrendadores pequeños).",
    },
  ] satisfies Fact[],
  smallClaims: {
    name: { en: "Stanislaus Superior Court, Small Claims (free advisor in English and Spanish)", es: "Corte Superior de Stanislaus, Reclamos Menores (asesor gratuito en inglés y español)" },
    phone: "(209) 530-3178",
    url: "https://www.stanislaus.courts.ca.gov/divisions/small-claims",
  } satisfies Contact,
};

export const MOBILE_FACTS = {
  rights: [
    {
      id: "notice-90",
      cite: "Civ. Code §798.30",
      en: "If you own your home and rent the space, the park must give you written notice at least 90 days before any rent increase.",
      es: "Si usted es dueño de su casa y renta el espacio, el parque debe avisarle por escrito al menos 90 días antes de cualquier aumento de renta.",
    },
    {
      id: "state-cap",
      cite: "Civ. Code §798.30.5",
      en: "California’s statewide space-rent cap (3% plus inflation, at most 5%) only covers parks that sit inside two or more cities. It almost certainly doesn’t apply to parks in Stanislaus County.",
      es: "El límite estatal de renta de espacios (3% más la inflación, máximo 5%) solo cubre parques que están dentro de dos o más ciudades. Casi seguro no aplica a los parques del condado de Stanislaus.",
    },
    {
      id: "modesto",
      cite: "Modesto Municipal Code Title 4, Ch. 19",
      en: "In the City of Modesto, a local rule limits yearly space-rent increases to the rise in inflation, at most 6%, in parks without a long-term agreement with the city. Call the city to ask this year’s allowed amount and whether your park has an agreement.",
      es: "En la ciudad de Modesto, una regla local limita los aumentos anuales de la renta del espacio a lo que subió la inflación, con un máximo del 6%, en parques sin un acuerdo a largo plazo con la ciudad. Llame a la ciudad para saber el aumento permitido este año y si su parque tiene un acuerdo.",
    },
    {
      id: "riverbank",
      cite: "Riverbank Municipal Code Ch. 121",
      en: "In Riverbank, parks with 10 or more spaces can raise space rent once a year (from May 1) by the rise in inflation. The city posts the allowed amount each January.",
      es: "En Riverbank, los parques de 10 espacios o más pueden subir la renta del espacio una vez al año (desde el 1 de mayo) según lo que subió la inflación. La ciudad publica el aumento permitido cada enero.",
    },
    {
      id: "renter",
      cite: "Civ. Code §1947.12(i), (j)",
      en: "If you RENT the mobile home itself (you don’t own it), the regular renter rent cap can protect you instead: use the rent increase check.",
      es: "Si usted RENTA la casa móvil (no es suya), le puede proteger el límite normal de renta para inquilinos: use la revisión del aumento de renta.",
    },
  ] satisfies Fact[],
  contacts: [
    { name: { en: "State Mobilehome Residency Law Protection Program (HCD): complaints from homeowners in parks", es: "Programa estatal de Protección de la Ley de Residencia en Casas Móviles (HCD): quejas de dueños de casas en parques" }, phone: "(800) 952-8356", url: "https://www.hcd.ca.gov/mmh/mac/mrlpp" },
    { name: { en: "2026 Mobilehome Residency Law booklet (CA Senate)", es: "Folleto de la Ley de Residencia en Casas Móviles 2026 (Senado de CA, en inglés)" }, url: "https://shou.senate.ca.gov/media/743" },
    { name: { en: "Senior Advocacy Network (60+): mobile home legal help", es: "Senior Advocacy Network (60+): ayuda legal con casas móviles" }, phone: "(209) 577-3814", url: "https://senioradvocacynetwork.org/" },
  ] satisfies Contact[],
};

export const RENT_SOURCES: SourceRef[] = [
  { label: "Civil Code §1947.12 (rent cap)", url: LEGINFO("CIV", "1947.12") },
  { label: "Civil Code §827 (notice of increase)", url: LEGINFO("CIV", "827") },
  { label: "Civil Code §1946.2 (just cause)", url: LEGINFO("CIV", "1946.2") },
  { label: "CA Attorney General: rent caps by county", url: "https://oag.ca.gov/rentcaps" },
  { label: "CA Dept. of Industrial Relations: California CPI", url: "https://www.dir.ca.gov/OPRL/CPI/PresentCCPI.PDF" },
  { label: "Civil Code §1941.1 (habitability)", url: LEGINFO("CIV", "1941.1") },
  { label: "Civil Code §1942.5 (retaliation)", url: LEGINFO("CIV", "1942.5") },
  { label: "Civil Code §1950.5 (security deposits)", url: LEGINFO("CIV", "1950.5") },
  { label: "CA Attorney General: tenant rights guides", url: "https://oag.ca.gov/housing" },
  { label: "Civil Code §798.30 and §798.30.5 (mobile home parks)", url: LEGINFO("CIV", "798.30.5") },
  { label: "Modesto mobile home rent stabilization ordinance", url: "https://modestogov.com/DocumentCenter/View/1052/Mobile-Home-Rent-Stabilization-Ordinance-PDF" },
  { label: "Riverbank mobile home space rent ordinance", url: "https://www.riverbank.org/DocumentCenter/View/1486/Ordinance-Mobile-Home-Rent-Increasepdf" },
  { label: "Stanislaus County Assessor parcels: year built (GIS data supplied by Stanislaus County)", url: "https://gis.stancounty.com/portal/home/item.html?id=ca28f879af8b4cbeae47ec1c7d25dd5b" },
];

// ------------------------------------------------------------ legal help

export const LEGAL_FACTS = {
  checked: "2026-10-19",
  verify: [
    { label: { en: "Check that a lawyer is licensed (State Bar of California)", es: "Verifique que un abogado tenga licencia (Colegio de Abogados de California)" }, url: "https://apps.calbar.ca.gov/attorney/LicenseeSearch/QuickSearch" },
    { label: { en: "Check a DOJ-recognized organization or accredited representative", es: "Verifique una organización reconocida o un representante acreditado por el DOJ" }, url: "https://www.justice.gov/eoir/recognition-accreditation-roster-reports" },
    { label: { en: "Check an immigration consultant’s bond (CA Secretary of State)", es: "Verifique la fianza de un consultor de inmigración (Secretaría de Estado de CA)" }, url: "https://specialfilings.sos.ca.gov/icbs" },
    { label: { en: "Report a fake “notario” to the State Bar (it won’t ask about your status)", es: "Denuncie a un “notario” falso ante el Colegio de Abogados (no le preguntarán su estatus)" }, url: "https://apps.calbar.ca.gov/complaint/Upl/Index" },
    { label: { en: "Report a scam to the FTC (in Spanish)", es: "Denuncie una estafa a la FTC (en español)" }, url: "https://reportfraud.ftc.gov/es" },
  ],
  sources: [
    { label: "DOJ EOIR recognized organizations and accredited representatives roster (2026-10-18)", url: "https://www.justice.gov/eoir/recognition-accreditation-roster-reports" },
    { label: "State Bar of California: avoid immigration consultant fraud", url: "https://www.calbar.ca.gov/public/concerns-about-attorney/avoid-legal-services-fraud/avoid-fraud-immigration-consultants" },
    { label: "CA Dept. of Social Services: immigration legal services providers", url: "https://www.cdss.ca.gov/inforesources/immigration/contractor-contact-information" },
    { label: "CA Labor Commissioner: wage claim offices", url: "https://www.dir.ca.gov/dlse/districtoffices.htm" },
    { label: "Stanislaus Superior Court: self-help", url: "https://www.stanislaus.courts.ca.gov/self-help" },
  ] satisfies SourceRef[],
};

// --------------------------------------------------------- medical bills

export const MEDICAL_FACTS = {
  checked: "2026-10-19",
  /** HHS 2026 poverty guidelines, 48 states (Federal Register 2026-01-15). */
  fpl: { year: 2026, base: 15_960, perAdditional: 5_680, source: "https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines" },
  rights: [
    {
      id: "who",
      cite: "HSC §127405",
      en: "Every California hospital must have a free-care and a discount policy. If you have no insurance, or your medical costs are high, and your family income is at or below 400% of the poverty line, you are eligible for one of them.",
      es: "Todo hospital de California debe tener una política de atención gratis y otra de descuentos. Si no tiene seguro, o sus gastos médicos son altos, y los ingresos de su familia son del 400% de la línea de pobreza o menos, usted califica para una de ellas.",
    },
    {
      id: "high",
      cite: "HSC §127400(g)",
      en: "“High medical costs” includes people with insurance: your out-of-pocket costs (at the hospital in the past year, or for any medical care in the past 12 months) are more than 10% of your family income.",
      es: "Los “gastos médicos altos” incluyen a personas con seguro: lo que pagó de su bolsillo (en el hospital en el último año, o por cualquier atención médica en los últimos 12 meses) es más del 10% de los ingresos de su familia.",
    },
    {
      id: "anytime",
      cite: "HSC §127405(e)(3)",
      en: "There is no deadline. You can apply after you get the bill, and even after it goes to collections.",
      es: "No hay fecha límite. Puede pedir la ayuda después de recibir la cuenta, e incluso después de que la manden a cobranza.",
    },
    {
      id: "assets",
      cite: "HSC §127405(b), (e)(1)",
      en: "The hospital can’t count your savings, home or car. To prove income, it can only require recent pay stubs or a tax return.",
      es: "El hospital no puede contar sus ahorros, su casa ni su carro. Para comprobar sus ingresos, solo puede exigir talones de pago recientes o una declaración de impuestos.",
    },
    {
      id: "status",
      cite: "HCAI",
      en: "Immigration status doesn’t matter. You don’t have to apply for Medi-Cal first.",
      es: "Su estatus migratorio no importa. No tiene que pedir Medi-Cal primero.",
    },
    {
      id: "plan",
      cite: "HSC §127405(c), §127400(i)",
      en: "If you get a discount, you can pay over time with no interest. If you can’t agree on a plan, payments are capped at 10% of your monthly income after basic living costs.",
      es: "Si recibe un descuento, puede pagar a plazos sin intereses. Si no se ponen de acuerdo en un plan, los pagos no pueden pasar del 10% de sus ingresos mensuales después de los gastos básicos.",
    },
    {
      id: "credit",
      cite: "HSC §127425(f); Civ. Code §1785.27",
      en: "Medical debt can’t be reported to credit bureaus in California, by anyone.",
      es: "En California nadie puede reportar deudas médicas a las agencias de crédito.",
    },
    {
      id: "sue",
      cite: "HSC §127425",
      en: "A hospital can’t sue you over a bill for 180 days after the first bill, and can’t garnish wages or put a lien on your home if you’re eligible for help. While you’re applying, it can only send the bill to collectors who follow these rules.",
      es: "El hospital no puede demandarle por una cuenta durante 180 días después de la primera cuenta, y si usted califica para la ayuda no puede embargar su sueldo ni poner un gravamen sobre su casa. Mientras usted pide la ayuda, solo puede mandar la cuenta a cobradores que siguen estas reglas.",
    },
    {
      id: "refund",
      cite: "HSC §127440",
      en: "If you already paid more than you should have under the policy, the hospital must refund the difference with interest.",
      es: "Si ya pagó más de lo que debía según la política, el hospital debe devolverle la diferencia con intereses.",
    },
    {
      id: "er",
      cite: "HSC §127450",
      en: "Emergency room doctors who bill separately must also offer discounts at or below 400%. Other doctors who bill separately (like anesthesia or radiology) may not be covered: ask them directly.",
      es: "Los médicos de la sala de emergencias que cobran por separado también deben ofrecer descuentos hasta el 400%. Otros médicos que cobran aparte (como anestesia o radiología) quizá no estén cubiertos: pregúnteles directamente.",
    },
    {
      id: "itemized",
      cite: "HSC §127425(e)",
      en: "You can ask for an itemized bill. Check it for charges you don’t recognize before you pay.",
      es: "Puede pedir una cuenta detallada. Revísela antes de pagar para ver si hay cargos que no reconoce.",
    },
  ] satisfies Fact[],
  complaint: {
    name: { en: "HCAI Hospital Bill Complaint Program (online, English or Spanish)", es: "Programa de Quejas por Cuentas de Hospital de HCAI (en línea, en inglés o español)" },
    url: "https://hcai.ca.gov/HospitalBillHelp",
  } satisfies Contact,
  /** Free help with medical bills and coverage (Health Consumer Alliance). */
  freeHelp: {
    name: { en: "Health Consumer Alliance: free help with medical bills and Medi-Cal", es: "Health Consumer Alliance: ayuda gratis con cuentas médicas y Medi-Cal" },
    phone: "(888) 804-3536",
    url: "https://healthconsumer.org",
  } satisfies Contact,
  sources: [
    { label: "Hospital Fair Pricing Act, Health & Safety Code §127400 and following", url: LEGINFO("HSC", "127405") },
    { label: "HCAI: hospital financial assistance policies (search any California hospital)", url: "https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-fair-pricing-policy-lookup/" },
    { label: "HCAI Hospital Bill Complaint Program", url: "https://hcai.ca.gov/HospitalBillHelp" },
    { label: "HHS poverty guidelines (2026)", url: "https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines" },
    { label: "Civil Code §1785.27 (no credit reporting of medical debt)", url: LEGINFO("CIV", "1785.27") },
  ] satisfies SourceRef[],
};
