// "Money you may be missing": the program rules and income tables behind the
// Benefits screener, checked 2026-10-21 on each program's own page (CDSS,
// USDA FNS, DHCS via Covered California's chart, CPUC, MID, TID, CSD, FTB,
// IRS, DHS/Federal Register, Stanislaus CSA and HSA). Figures are copied
// exactly as each source prints them (dollars; a few annual-only tables list
// sizes 1-4 plus a "+$X each additional" rule, which we extend).
//
// Anything we could not confirm on an official page is either left out or
// worded as "ask/confirm" in the text below.
//
// UPDATE EACH YEAR (unit tests in e2e/tests/unit-benefits.spec.ts fail when a
// table's period, or its re-check date, has passed):
//  - CalFresh: Oct 1 (CDSS "Income Inserts", item 220000).
//  - WIC: Jul 1 (USDA FNS Federal Register notice, published each spring).
//  - PG&E CARE/FERA and California LifeLine: Jun 1 (CPUC).
//  - Medi-Cal: when DHCS adopts the new poverty guidelines (spring).
//  - MID/TID CARES: after the new poverty guidelines (MID updated Mar 1, 2026).
//  - LIHEAP: CSD's program-year table (Oct 1). The 2027 table was NOT posted
//    when we checked, so the screener caps LIHEAP at "maybe" and says so.
//  - CalEITC/YCTC and federal EITC: when FTB/IRS post the next tax year.
import type { Bilingual } from "./letter-types";
import type { SourceRef } from "../components/help/ui";

export type Per = "month" | "year";

/** One published income-limit table (gross income, before taxes). */
export interface IncomeTable {
  /** Dollars for household sizes 1, 2, 3 ... exactly as published. */
  bySize: readonly number[];
  /** Added for each person beyond the last listed size. */
  perExtra: number;
  per: Per;
  /** The same limits in the other basis, when the source prints those too
   *  (then income is compared in whichever basis the visitor typed). */
  alt?: { per: Per; bySize: readonly number[]; perExtra: number };
  /** Percent of the federal poverty guidelines, for the label only. */
  pctFpl?: number;
  /** First day these limits apply, when the source states it. */
  from?: string;
  /** Last day of the period, or (when `toIsRecheck`) the day by which we
   *  must re-check because the source gives no end date. */
  to: string;
  toIsRecheck?: boolean;
  /** Already past `to` when checked (no newer table published yet). The
   *  screener caps it at "maybe" whenever it's past `to`; unit tests allow
   *  that only until this date, so someone looks for the new table. */
  graceUntil?: string;
  /** Shown on the card: which period these figures are for. */
  period: Bilingual;
  source: SourceRef;
}

export interface Phone {
  number: string;
  label?: Bilingual;
}

export interface ProgramFacts {
  name: Bilingual;
  /** What it gives, in one line. */
  gives: Bilingual;
  immigration: Bilingual;
  apply: {
    url: string;
    urlLabel: string;
    phones: Phone[];
    office?: Bilingual;
  };
  /** Extra rules worth knowing (shown under "More about this program"). */
  notes?: Bilingual[];
  sources: SourceRef[];
}

export const BENEFITS_CHECKED = "2026-10-21";

// ---------------------------------------------------------------- sources

const SRC = {
  calfresh: { label: "CDSS: 2026-2027 CalFresh Income & Eligibility Limits (Oct 1, 2026 – Sep 30, 2027)", url: "https://cdss.ca.gov/portals/9/calfreshoutreach/220000_English_Income_Inserts_FFY2027.pdf" },
  calfreshFaq: { label: "CDSS: CalFresh questions and answers (H.R. 1 changes)", url: "https://cdss.ca.gov/benefits-services/food-nutrition-services/calfresh/frequently-asked-questions" },
  stanCalfresh: { label: "Stanislaus County StanWORKs: CalFresh", url: "https://stanworks.com/cal-fresh/" },
  lao: { label: "Legislative Analyst’s Office: CFAP expansion (Feb 2026)", url: "https://www.lao.ca.gov/Publications/Report/5126" },
  nourish: { label: "Nourish California: Food4All in the 2026-27 budget (Jul 2026)", url: "https://nourishca.org/whats-fresh/news-and-media-releases/press-release/food4all-2026-27-state-budget/" },
  wic: { label: "USDA FNS: WIC 2026/2027 Income Eligibility Guidelines (Federal Register 2026-08323)", url: "https://public-inspection.federalregister.gov/2026-08323.pdf" },
  wicOffices: { label: "Stanislaus County Health Services Agency: WIC offices", url: "https://www.schsa.org/publichealth/programs/wic/offices.shtm" },
  fplChart: { label: "Covered California: income chart (Medi-Cal monthly values from DHCS ACWDL 26-01; 2027 coverage)", url: "https://www.coveredca.com/pdfs/FPL-chart.pdf" },
  dhcsJuly: { label: "DHCS: Coverage Ambassadors webinar, July 2026 (Medi-Cal changes)", url: "https://www.dhcs.ca.gov/wp-content/uploads/2026/07/July-2026-Coverage-Ambassadors-Presentation.pdf" },
  stanMediCal: { label: "Stanislaus County StanWORKs: Medi-Cal", url: "https://stanworks.com/medi-cal/" },
  dhcsDental: { label: "DHCS: Medi-Cal dental benefit changes", url: "https://www.dhcs.ca.gov/services/medi-cal-dental-benefit-changes/" },
  senate: { label: "CA Senate Republican Fiscal Office: 2026-27 budget highlights (Sept 30, 2026)", url: "https://src.senate.ca.gov/sites/src.senate.ca.gov/files/2026-27%20Highlights%20and%20Analysis%20-%20Sept%2030%20Final.pdf" },
  ccImmigrant: { label: "Covered California: 2027 changes for lawfully present immigrants", url: "https://hbex.coveredca.com/toolkit/PDFs/Final-LPI-Consumer-Fact-Sheet.pdf" },
  cpucCare: { label: "CPUC: CARE and FERA programs (income limits Jun 1, 2026 – May 31, 2027)", url: "https://www.cpuc.ca.gov/industries-and-topics/electrical-energy/electric-costs/care-fera-program" },
  mid: { label: "Modesto Irrigation District: MID CARES", url: "https://www.mid.org/yourhome/programs/mid_cares.html" },
  tid: { label: "Turlock Irrigation District: TID CARES", url: "https://www.tid.org/cares" },
  lifeline: { label: "CPUC: California LifeLine fact sheet (Jun 1, 2026 – May 31, 2027)", url: "https://www.cpuc.ca.gov/-/media/cpuc-website/about-cpuc/documents/transparency-and-reporting/fact_sheets/california-lifeline/lifeline_onesheet_051126.pdf" },
  liheapIncome: { label: "CSD: LIHEAP income eligibility (2026 program year)", url: "https://www.csd.ca.gov/Pages/LIHEAP-Income-Eligibility.aspx" },
  liheapPlan: { label: "CSD: 2026 LIHEAP State Plan", url: "https://www.csd.ca.gov/Shared%20Documents/2026-Final-LIHEAP-State-Plan.pdf" },
  caleitc: { label: "FTB: CalEITC (tax year 2026 limits, FTB memo Sept 3, 2026)", url: "https://www.caltax.org/regulatory-issues/ftb/2026-PIT-Indexing-Memo.pdf" },
  caleitcAmounts: { label: "FTB: CalEITC eligibility and credit amounts (tax year 2025 amounts)", url: "https://www.ftb.ca.gov/file/personal/credits/caleitc/eligibility-and-credit-information.html" },
  yctc: { label: "FTB: Young Child Tax Credit", url: "https://www.ftb.ca.gov/file/personal/credits/young-child-tax-credit.html" },
  eitc: { label: "IRS Rev. Proc. 2025-32: tax year 2026 EITC", url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf" },
  vita: { label: "IRS: find free tax help (VITA)", url: "https://irs.treasury.gov/freetaxprep/" },
  publicCharge: { label: "DHS final rule: Public Charge Ground of Inadmissibility (91 FR 45324, Jul 20, 2026; effective Sept 18, 2026)", url: "https://www.govinfo.gov/content/pkg/FR-2026-07-20/html/2026-14539.htm" },
  immigrationProviders: { label: "CA Dept. of Social Services: free immigration legal services providers", url: "https://www.cdss.ca.gov/inforesources/immigration/contractor-contact-information" },
  cde: { label: "CA Dept. of Education: Alternative Household Income Forms", url: "https://www.cde.ca.gov/fg/aa/pa/altincomeforms.asp" },
  fpl: { label: "HHS: 2026 poverty guidelines (Federal Register, Jan 15, 2026)", url: "https://www.govinfo.gov/content/pkg/FR-2026-01-15/html/2026-00755.htm" },
} satisfies Record<string, SourceRef>;

// ---------------------------------------------------------------- tables

const MEDI_CAL_PERIOD: Bilingual = {
  en: "2026 limits (DHCS letter ACWDL 26-01; start date not confirmed)",
  es: "Límites de 2026 (carta ACWDL 26-01 del DHCS; fecha de inicio no confirmada)",
};

/** Tables that drive a likely/maybe/unlikely answer. */
export const TABLES = {
  /** 200% FPL gross monthly (California broad-based categorical eligibility). */
  calfresh: {
    bySize: [2660, 3608, 4554, 5500, 6448, 7394, 8340, 9288],
    perExtra: 948,
    per: "month",
    pctFpl: 200,
    from: "2026-10-01",
    to: "2027-09-30",
    period: { en: "Oct 1, 2026 – Sep 30, 2027", es: "1 de oct. de 2026 – 30 de sept. de 2027" },
    source: SRC.calfresh,
  },
  /** Maximum monthly CalFresh benefit (same CDSS insert). */
  calfreshMax: {
    bySize: [306, 562, 808, 1023, 1217, 1463, 1616, 1841],
    perExtra: 225,
    per: "month",
    from: "2026-10-01",
    to: "2027-09-30",
    period: { en: "Oct 1, 2026 – Sep 30, 2027", es: "1 de oct. de 2026 – 30 de sept. de 2027" },
    source: SRC.calfresh,
  },
  /** 185% FPL; USDA prints monthly and annual figures. */
  wic: {
    bySize: [2461, 3337, 4212, 5088, 5964, 6839, 7715, 8591],
    perExtra: 876,
    per: "month",
    alt: { per: "year", bySize: [29526, 40034, 50542, 61050, 71558, 82066, 92574, 103082], perExtra: 10508 },
    pctFpl: 185,
    from: "2026-07-01",
    to: "2027-06-30",
    period: { en: "Jul 1, 2026 – Jun 30, 2027", es: "1 de jul. de 2026 – 30 de jun. de 2027" },
    source: SRC.wic,
  },
  /** Children 0-18, 266% FPL monthly. */
  mediCalKids: {
    bySize: [3538, 4799, 6057, 7315, 8576, 9835, 11093, 12354],
    perExtra: 1261,
    per: "month",
    pctFpl: 266,
    to: "2027-04-01",
    toIsRecheck: true,
    period: MEDI_CAL_PERIOD,
    source: SRC.fplChart,
  },
  /** Pregnancy Medi-Cal, 213% FPL monthly. */
  mediCalPregnant: {
    bySize: [2833, 3843, 4851, 5858, 6868, 7875, 8883, 9892],
    perExtra: 1010,
    per: "month",
    pctFpl: 213,
    to: "2027-04-01",
    toIsRecheck: true,
    period: MEDI_CAL_PERIOD,
    source: SRC.fplChart,
  },
  /** Medi-Cal Access Program (MCAP) for pregnant people, 322% FPL monthly. */
  mcap: {
    bySize: [4283, 5809, 7332, 8855, 10382, 11905, 13428, 14954],
    perExtra: 1527,
    per: "month",
    pctFpl: 322,
    to: "2027-04-01",
    toIsRecheck: true,
    period: MEDI_CAL_PERIOD,
    source: SRC.fplChart,
  },
  /** Adults 19-64, 138% FPL monthly (MAGI). */
  mediCalAdults: {
    bySize: [1836, 2490, 3143, 3795, 4450, 5102, 5755, 6409],
    perExtra: 655,
    per: "month",
    pctFpl: 138,
    to: "2027-04-01",
    toIsRecheck: true,
    period: MEDI_CAL_PERIOD,
    source: SRC.fplChart,
  },
  /** 400% FPL: above this there is no federal premium help (2027 coverage). */
  coveredCa: {
    bySize: [63840, 86560, 109280, 132000, 154720, 177440, 200160, 222880],
    perExtra: 22720,
    per: "year",
    pctFpl: 400,
    from: "2027-01-01",
    to: "2027-12-31",
    period: { en: "2027 coverage year", es: "Cobertura del año 2027" },
    source: SRC.fplChart,
  },
  /** PG&E CARE, 200% FPL annual (sizes 1 and 2 share a limit). */
  care: {
    bySize: [43280, 43280, 54640, 66000, 77360, 88720, 100080, 111440],
    perExtra: 11360,
    per: "year",
    pctFpl: 200,
    from: "2026-06-01",
    to: "2027-05-31",
    period: { en: "Jun 1, 2026 – May 31, 2027", es: "1 de jun. de 2026 – 31 de mayo de 2027" },
    source: SRC.cpucCare,
  },
  /** PG&E FERA, 250% FPL annual: income must be ABOVE the CARE limit. */
  fera: {
    bySize: [54100, 54100, 68300, 82500, 96700, 110900, 125100, 139300],
    perExtra: 14200,
    per: "year",
    pctFpl: 250,
    from: "2026-06-01",
    to: "2027-05-31",
    period: { en: "Jun 1, 2026 – May 31, 2027", es: "1 de jun. de 2026 – 31 de mayo de 2027" },
    source: SRC.cpucCare,
  },
  /** MID prints monthly and annual figures (effective Mar 1, 2026; no end date). */
  mid: {
    bySize: [3607, 3607, 4553, 5500, 6447, 7393, 8340, 9287],
    perExtra: 947,
    per: "month",
    alt: { per: "year", bySize: [43280, 43280, 54640, 66000, 77360, 88720, 100080, 111440], perExtra: 11360 },
    pctFpl: 200,
    from: "2026-03-01",
    to: "2027-03-01",
    toIsRecheck: true,
    period: { en: "In effect since Mar 1, 2026", es: "Vigentes desde el 1 de marzo de 2026" },
    source: SRC.mid,
  },
  /** TID lists sizes 1-4 and "+$11,360 each additional"; no date on the page. */
  tid: {
    bySize: [43280, 43280, 54640, 66000],
    perExtra: 11360,
    per: "year",
    pctFpl: 200,
    to: "2027-03-01",
    toIsRecheck: true,
    period: { en: "Current TID figures (no date given; they match the 2026 poverty guidelines)", es: "Cifras actuales de TID (sin fecha; coinciden con las guías de pobreza de 2026)" },
    source: SRC.tid,
  },
  /** California LifeLine, 150% FPL annual; CPUC lists 1-4 and "+$8,700 each additional". */
  lifeline: {
    bySize: [24600, 33300, 42100, 50800],
    perExtra: 8700,
    per: "year",
    pctFpl: 150,
    from: "2026-06-01",
    to: "2027-05-31",
    period: { en: "Jun 1, 2026 – May 31, 2027", es: "1 de jun. de 2026 – 31 de mayo de 2027" },
    source: SRC.lifeline,
  },
  /** LIHEAP, 60% of State Median Income, monthly; CSD lists 1-10 then +$192.21. */
  liheap: {
    bySize: [3331.66, 4356.83, 5382.0, 6407.16, 7432.25, 8457.41, 8649.66, 8841.83, 9034.08, 9226.25],
    perExtra: 192.21,
    per: "month",
    from: "2025-10-01",
    to: "2026-09-30",
    graceUntil: "2027-01-31",
    period: {
      en: "2026 program year (Oct 1, 2025 – Sep 30, 2026). The next table was not posted when we checked.",
      es: "Año del programa 2026 (1 de oct. de 2025 – 30 de sept. de 2026). La tabla nueva no estaba publicada cuando revisamos.",
    },
    source: SRC.liheapIncome,
  },
} satisfies Record<string, IncomeTable>;

export type TableId = keyof typeof TABLES;

/** Tax credits: limits by number of children, not household size. */
export const TAX = {
  year: 2026,
  /** Tax year 2027 figures (FTB memo, Rev. Proc.) come out around September; re-check by this date. */
  recheckBy: "2027-10-15",
  period: { en: "Tax year 2026 (returns filed in 2027)", es: "Año fiscal 2026 (declaraciones presentadas en 2027)" } as Bilingual,
  caleitc: {
    /** FTB memo (Sept 3, 2026): earned income and AGI must be LESS than $34,051. */
    maxEarned: 34051,
    /** 0, 1, 2, 3+ children. FTB hadn't posted tax year 2026's amounts: these are 2025's. */
    maxCredit: [302, 2016, 3339, 3756] as const,
    maxCreditYear: 2025,
  },
  yctc: {
    maxCredit: 1229,
    /** FTB: with total earned income of $0 or less, wages and the loss may each be up to this. */
    maxWages: 36852,
  },
  federal: {
    /** Rev. Proc. 2025-32 §4.06: AGI caps by 0, 1, 2, 3+ qualifying children. */
    single: [19540, 51593, 58629, 62974] as const,
    joint: [26820, 58863, 65899, 70244] as const,
    maxCredit: [664, 4427, 7316, 8231] as const,
    investmentIncomeLimit: 12200,
  },
} as const;

// ---------------------------------------------------------------- programs

const CSA_OFFICES: Bilingual = {
  en: "Stanislaus County Community Services Agency (CSA): 251 E. Hackett Rd, Modesto (Mon–Fri 8–5). Also 1310 W. Main St, Turlock; 1405 West F St, Oakdale; 101 W. Las Palmas Ave, Patterson.",
  es: "Agencia de Servicios Comunitarios del Condado de Stanislaus (CSA): 251 E. Hackett Rd, Modesto (lun.–vie. 8–5). También 1310 W. Main St, Turlock; 1405 West F St, Oakdale; 101 W. Las Palmas Ave, Patterson.",
};

const CSA_PHONE: Phone = { number: "1-877-652-0734", label: { en: "Stanislaus CSA", es: "CSA de Stanislaus" } };

const MEDI_CAL_APPLY: ProgramFacts["apply"] = {
  url: "https://benefitscal.com",
  urlLabel: "BenefitsCal.com",
  phones: [CSA_PHONE],
  office: CSA_OFFICES,
};

const MEDI_CAL_NOTES: Bilingual[] = [
  {
    en: "Starting Jan 1, 2027 (federal law H.R. 1): some adults must report 80 hours a month of work, school or volunteering (or $580 a month in income), and some adults renew every 6 months.",
    es: "Desde el 1 de enero de 2027 (ley federal H.R. 1): algunos adultos deberán reportar 80 horas al mes de trabajo, estudio o voluntariado (o $580 al mes de ingresos), y algunos adultos renovarán cada 6 meses.",
  },
  {
    en: "People 65+ or with a disability may qualify through other Medi-Cal programs. Those have an asset limit ($130,000 for one person plus $65,000 for each added person since Jan 1, 2026; it is set to drop to $21,000, or $31,000 for a couple, on Jul 1, 2027).",
    es: "Las personas de 65 años o más o con una discapacidad pueden calificar por otros programas de Medi-Cal. Esos tienen un límite de bienes ($130,000 para una persona más $65,000 por cada persona adicional desde el 1 de enero de 2026; está previsto que baje a $21,000, o $31,000 para una pareja, el 1 de julio de 2027).",
  },
];

const PGE_APPLY_PHONE: Phone = { number: "1-866-743-2273", label: { en: "PG&E", es: "PG&E" } };

const TAX_APPLY: ProgramFacts["apply"] = {
  url: "https://www.ftb.ca.gov/file/ways-to-file/online/calfile/",
  urlLabel: "CalFile (FTB)",
  phones: [{ number: "(877) 211-7826", label: { en: "Stanislaus 211 (free tax help near you)", es: "211 de Stanislaus (ayuda gratis con impuestos)" } }],
  office: {
    en: "Free tax help (VITA): use the IRS locator from February. We could not confirm this season’s Stanislaus sites; past years had United Way of Stanislaus County and county library branches.",
    es: "Ayuda gratis con impuestos (VITA): use el buscador del IRS a partir de febrero. No pudimos confirmar los sitios de Stanislaus para esta temporada; en años pasados hubo sitios de United Way of Stanislaus County y bibliotecas del condado.",
  },
};

export const PROGRAMS = {
  calfresh: {
    name: { en: "CalFresh (food benefits)", es: "CalFresh (ayuda para comprar comida)" },
    gives: { en: "Money every month on an EBT card to buy food.", es: "Dinero cada mes en una tarjeta EBT para comprar comida." },
    immigration: {
      en: "Since Apr 1, 2026 (federal law H.R. 1), CalFresh is only for U.S. citizens and nationals, green-card holders, Cuban/Haitian entrants and COFA citizens. Refugees, asylees, most parolees and some other groups lose it at their first renewal after that date. Undocumented family members can’t get CalFresh, but they can apply for eligible members, like U.S.-citizen children; part of their income still counts. The state CFAP program covers few of the people who lost CalFresh, and its planned expansion to adults 55+ regardless of status (Oct 2027) is not available yet and still needs funding.",
      es: "Desde el 1 de abril de 2026 (ley federal H.R. 1), CalFresh es solo para ciudadanos y nacionales de EE. UU., residentes permanentes (green card), entrantes cubanos/haitianos y ciudadanos COFA. Refugiados, asilados, la mayoría de las personas con parole y otros grupos la pierden en su primera renovación después de esa fecha. Las personas indocumentadas no pueden recibir CalFresh, pero pueden solicitarlo para los miembros que sí califican, como hijos ciudadanos; parte de sus ingresos sí cuenta. El programa estatal CFAP cubre a pocas de las personas que perdieron CalFresh, y su expansión a adultos de 55 años o más sin importar el estatus (oct. de 2027) todavía no existe y aún necesita fondos.",
    },
    apply: {
      url: "https://benefitscal.com",
      urlLabel: "BenefitsCal.com",
      phones: [{ number: "1-877-847-3663", label: { en: "CalFresh statewide", es: "CalFresh estatal" } }, CSA_PHONE],
      office: CSA_OFFICES,
    },
    notes: [
      {
        en: "Since Jun 1, 2026, adults 18–64 must do 80 hours a month of work, volunteering or training, or they get only 3 months of benefits in 3 years. Many people are exempt, for example parents of a child under 14, pregnant people, and people who can’t work for health reasons. Ask the county.",
        es: "Desde el 1 de junio de 2026, los adultos de 18 a 64 años deben hacer 80 horas al mes de trabajo, voluntariado o capacitación, o solo reciben 3 meses de ayuda en 3 años. Muchas personas están exentas, por ejemplo padres de un niño menor de 14 años, embarazadas y personas que no pueden trabajar por su salud. Pregunte al condado.",
      },
      {
        en: "The amount depends on income and costs like rent and utilities. The county decides.",
        es: "La cantidad depende de los ingresos y de gastos como la renta y los servicios. El condado decide.",
      },
    ],
    sources: [SRC.calfresh, SRC.calfreshFaq, SRC.stanCalfresh, SRC.lao, SRC.nourish],
  },
  wic: {
    name: { en: "WIC (food for moms, babies and young children)", es: "WIC (comida para mamás, bebés y niños pequeños)" },
    gives: {
      en: "Healthy foods and nutrition help for pregnant people, new moms, babies and children under 5, plus breastfeeding support.",
      es: "Alimentos saludables y ayuda con la nutrición para embarazadas, mamás recientes, bebés y niños menores de 5 años, además de apoyo para la lactancia.",
    },
    immigration: {
      en: "WIC does not ask for a particular immigration status or a Social Security number (confirm with WIC). Public charge: see the note at the top of this page.",
      es: "WIC no pide un estatus migratorio en particular ni número de Seguro Social (confírmelo con WIC). Carga pública: vea la nota al principio de esta página.",
    },
    apply: {
      url: "https://www.schsa.org/publichealth/programs/wic/offices.shtm",
      urlLabel: "Stanislaus WIC offices",
      phones: [
        { number: "(209) 558-7377", label: { en: "Stanislaus WIC", es: "WIC de Stanislaus" } },
        { number: "(888) 413-8165", label: { en: "text", es: "mensaje de texto" } },
      ],
      office: {
        en: "Modesto: 251 E. Hackett Rd (Mon–Fri). North Modesto: 1209 Woodrow Ave B-10 (Tue/Fri). Oakdale: 1405 West F St Ste J (Mon/Wed/Thu). Patterson: 101 W. Las Palmas Ave (Tue/Fri). Turlock: 1125 N. Golden State Blvd A&B (Mon/Wed/Thu). Hours 8–5; closed the 3rd Tuesday 1–5 pm. The Ceres office closed in 2025.",
        es: "Modesto: 251 E. Hackett Rd (lun.–vie.). Norte de Modesto: 1209 Woodrow Ave B-10 (mar./vie.). Oakdale: 1405 West F St Ste J (lun./mié./jue.). Patterson: 101 W. Las Palmas Ave (mar./vie.). Turlock: 1125 N. Golden State Blvd A&B (lun./mié./jue.). Horario 8–5; cerrado el 3.er martes de 1 a 5 pm. La oficina de Ceres cerró en 2025.",
      },
    },
    notes: [
      {
        en: "WIC is for people who are pregnant, breastfeeding (up to 1 year) or recently gave birth (up to 6 months), and for babies and children under 5. A pregnant woman may count her unborn baby in the household size. Ask WIC.",
        es: "WIC es para personas embarazadas, que dan pecho (hasta 1 año) o que dieron a luz hace poco (hasta 6 meses), y para bebés y niños menores de 5 años. Una embarazada puede contar a su bebé por nacer en el tamaño del hogar. Pregunte a WIC.",
      },
      {
        en: "At the WIC appointment, staff do a short nutrition check.",
        es: "En la cita de WIC, el personal hace una breve revisión de nutrición.",
      },
    ],
    sources: [SRC.wic, SRC.wicOffices],
  },
  "medi-cal-kids": {
    name: { en: "Medi-Cal for children under 19", es: "Medi-Cal para menores de 19 años" },
    gives: { en: "Free or low-cost health coverage for children.", es: "Seguro médico gratis o de bajo costo para los niños." },
    immigration: {
      en: "Children under 19 get full Medi-Cal regardless of immigration status. From Jan 1, 2027, children without satisfactory status move from health plans to regular (fee-for-service) Medi-Cal: same benefits, using the Medi-Cal BIC card.",
      es: "Los menores de 19 años reciben Medi-Cal completo sin importar su estatus migratorio. Desde el 1 de enero de 2027, los niños sin estatus satisfactorio pasan de los planes de salud a Medi-Cal regular (pago por servicio): los mismos beneficios, usando la tarjeta BIC de Medi-Cal.",
    },
    apply: MEDI_CAL_APPLY,
    sources: [SRC.fplChart, SRC.dhcsJuly, SRC.stanMediCal],
  },
  "medi-cal-pregnant": {
    name: { en: "Medi-Cal during pregnancy", es: "Medi-Cal durante el embarazo" },
    gives: {
      en: "Health care during pregnancy and for 12 months after the baby is born.",
      es: "Atención médica durante el embarazo y por 12 meses después de que nace el bebé.",
    },
    immigration: {
      en: "Pregnant people get full Medi-Cal during pregnancy and for 12 months after, regardless of immigration status.",
      es: "Las embarazadas reciben Medi-Cal completo durante el embarazo y por 12 meses después, sin importar su estatus migratorio.",
    },
    apply: MEDI_CAL_APPLY,
    notes: [
      {
        en: "Above the regular limit, the Medi-Cal Access Program (MCAP) covers pregnant people with higher incomes. Ask the county or apply on BenefitsCal.",
        es: "Por encima del límite normal, el Programa de Acceso a Medi-Cal (MCAP) cubre a embarazadas con ingresos más altos. Pregunte al condado o solicite en BenefitsCal.",
      },
    ],
    sources: [SRC.fplChart, SRC.dhcsJuly, SRC.stanMediCal],
  },
  "medi-cal-adults": {
    name: { en: "Medi-Cal for adults", es: "Medi-Cal para adultos" },
    gives: { en: "Free or low-cost health coverage.", es: "Seguro médico gratis o de bajo costo." },
    immigration: {
      en: "Rules for adults depend on immigration status and are changing. Undocumented adults (19 and older): since Jan 1, 2026, NEW sign-ups for full Medi-Cal are on hold; they can get restricted Medi-Cal (emergencies, pregnancy, long-term care). Adults who had full Medi-Cal before Jan 1, 2026 keep it if they renew on time; if it lapses, there are 3 months to re-enroll. Full dental for these adults is set to end Jul 1, 2027, and a $30 monthly premium (ages 19–59, not pregnant) is set to start Jul 1, 2027. Refugees, asylees and some other immigrants lost federal Medicaid on Oct 1, 2026; California pays for their full coverage until Jul 1, 2027. Green-card holders with 5+ years keep full coverage. Ask the county or a free immigration legal provider about your situation before you decide.",
      es: "Las reglas para adultos dependen del estatus migratorio y están cambiando. Adultos indocumentados (19 años o más): desde el 1 de enero de 2026 no se aceptan NUEVAS inscripciones en Medi-Cal completo; pueden recibir Medi-Cal restringido (emergencias, embarazo, cuidado a largo plazo). Quienes tenían Medi-Cal completo antes del 1 de enero de 2026 lo conservan si renuevan a tiempo; si se pierde, hay 3 meses para volver a inscribirse. Está previsto que el dental completo para estos adultos termine el 1 de julio de 2027, y que empiece una prima de $30 al mes (de 19 a 59 años, no embarazadas) el 1 de julio de 2027. Refugiados, asilados y otros inmigrantes perdieron Medicaid federal el 1 de octubre de 2026; California paga su cobertura completa hasta el 1 de julio de 2027. Los residentes permanentes con 5 años o más conservan la cobertura completa. Pregunte al condado o a un proveedor legal gratuito de inmigración sobre su caso antes de decidir.",
    },
    apply: MEDI_CAL_APPLY,
    notes: MEDI_CAL_NOTES,
    sources: [SRC.fplChart, SRC.dhcsJuly, SRC.stanMediCal, SRC.dhcsDental, SRC.senate],
  },
  "covered-ca": {
    name: { en: "Covered California (help paying for a health plan)", es: "Covered California (ayuda para pagar un seguro médico)" },
    gives: { en: "Money off the monthly cost of a health plan.", es: "Descuento en el costo mensual de un seguro médico." },
    immigration: {
      en: "Starting in 2027 (federal law H.R. 1), only green-card holders, Cuban/Haitian entrants and COFA migrants can get financial help. People with work or student visas, asylum, refugee status, U/T visas, TPS and other statuses can still buy a plan, but with no financial help in 2027. Undocumented people can’t buy through Covered California (confirm with Covered California).",
      es: "Desde 2027 (ley federal H.R. 1), solo los residentes permanentes, los entrantes cubanos/haitianos y los migrantes COFA pueden recibir ayuda financiera. Las personas con visa de trabajo o de estudiante, asilo, refugio, visas U/T, TPS y otros estatus pueden comprar un plan, pero sin ayuda financiera en 2027. Las personas indocumentadas no pueden comprar por Covered California (confírmelo con Covered California).",
    },
    apply: {
      url: "https://www.coveredca.com",
      urlLabel: "CoveredCA.com",
      phones: [
        { number: "800-300-1506", label: { en: "English", es: "inglés" } },
        { number: "1-800-300-0213", label: { en: "Spanish", es: "español" } },
      ],
      office: { en: "Free in-person help: find a certified enroller on CoveredCA.com.", es: "Ayuda gratis en persona: busque un consejero certificado en CoveredCA.com." },
    },
    sources: [SRC.fplChart, SRC.ccImmigrant],
  },
  "pge-care": {
    name: { en: "PG&E CARE (gas and electric discount)", es: "PG&E CARE (descuento en gas y luz)" },
    gives: { en: "20% off PG&E gas, and 30–35% off PG&E electricity.", es: "20% de descuento en el gas de PG&E y 30–35% en la luz de PG&E." },
    immigration: {
      en: "CARE asks for household size and income (or a program you’re on). The CPUC lists no immigration status requirement.",
      es: "CARE pide el tamaño del hogar y los ingresos (o un programa que ya recibe). La CPUC no menciona ningún requisito migratorio.",
    },
    apply: {
      url: "https://www.pge.com/en/account/billing-and-assistance/financial-assistance/california-alternate-rates-for-energy-program.html",
      urlLabel: "PG&E CARE application",
      phones: [PGE_APPLY_PHONE],
      office: { en: "Apply online or by mail.", es: "Solicite en línea o por correo." },
    },
    notes: [
      {
        en: "In Modesto and Turlock, PG&E usually sends the GAS bill while MID or TID sends the electric bill. CARE lowers the PG&E bill; apply to MID CARES or TID CARES for electricity.",
        es: "En Modesto y Turlock, PG&E normalmente cobra el GAS y MID o TID cobran la luz. CARE baja la factura de PG&E; para la luz, solicite MID CARES o TID CARES.",
      },
      {
        en: "Income counts everyone in the home, taxable and nontaxable.",
        es: "Se cuentan los ingresos de todos en la casa, con o sin impuestos.",
      },
    ],
    sources: [SRC.cpucCare],
  },
  "pge-fera": {
    name: { en: "PG&E FERA (family electric discount)", es: "PG&E FERA (descuento eléctrico para familias)" },
    gives: { en: "18% off PG&E electricity (not gas).", es: "18% de descuento en la luz de PG&E (no en el gas)." },
    immigration: { en: "The CPUC lists no immigration status requirement.", es: "La CPUC no menciona ningún requisito migratorio." },
    apply: {
      url: "https://www.pge.com/en/account/billing-and-assistance/financial-assistance/fera-program.html",
      urlLabel: "PG&E FERA application",
      phones: [PGE_APPLY_PHONE],
      office: { en: "Apply online or by mail.", es: "Solicite en línea o por correo." },
    },
    notes: [
      {
        en: "Only for homes that get ELECTRICITY from PG&E. A home can have CARE or FERA, not both.",
        es: "Solo para hogares que reciben la LUZ de PG&E. Un hogar puede tener CARE o FERA, no los dos.",
      },
    ],
    sources: [SRC.cpucCare],
  },
  "mid-cares": {
    name: { en: "MID CARES (Modesto Irrigation District electric discount)", es: "MID CARES (descuento en la luz del Distrito de Riego de Modesto)" },
    gives: {
      en: "The fixed monthly charge drops from $32 to $12.80, plus 23% off the first 850 kWh each month, for up to 3 years.",
      es: "El cargo fijo mensual baja de $32 a $12.80, más 23% de descuento en los primeros 850 kWh cada mes, por hasta 3 años.",
    },
    immigration: { en: "MID’s page does not mention immigration status.", es: "La página de MID no menciona el estatus migratorio." },
    apply: {
      url: "https://www.mid.org/mid-cares-application/",
      urlLabel: "MID CARES application",
      phones: [{ number: "(209) 526-7435", label: { en: "MID (Mon–Fri 8–5)", es: "MID (lun.–vie. 8–5)" } }],
      office: { en: "MID, 1231 11th St, Modesto (help with the application).", es: "MID, 1231 11th St, Modesto (ayuda con la solicitud)." },
    },
    notes: [
      {
        en: "Bring proof of one month’s income (received in the last 3 months) for everyone in the home.",
        es: "Lleve comprobante de un mes de ingresos (recibido en los últimos 3 meses) de todos en la casa.",
      },
    ],
    sources: [SRC.mid],
  },
  "tid-cares": {
    name: { en: "TID CARES (Turlock Irrigation District electric discount)", es: "TID CARES (descuento en la luz del Distrito de Riego de Turlock)" },
    gives: {
      en: "$20 off the monthly customer charge ($30 from Jan 1, 2027), plus 10% off the first 800 kWh each month.",
      es: "$20 de descuento en el cargo mensual ($30 desde el 1 de enero de 2027), más 10% de descuento en los primeros 800 kWh cada mes.",
    },
    immigration: {
      en: "TID asks for an ID or Social Security card for each adult. It does not state an immigration requirement. If you don’t have an SSN, ask TID which IDs it accepts.",
      es: "TID pide una identificación o tarjeta de Seguro Social de cada adulto. No menciona un requisito migratorio. Si no tiene SSN, pregunte a TID qué identificaciones acepta.",
    },
    apply: {
      url: "https://www.tid.org/customer-service/payment-assistance-programs/cares-low-income-program/cares-online-application/",
      urlLabel: "TID CARES application",
      phones: [{ number: "(209) 883-8222", label: { en: "TID", es: "TID" } }],
      office: { en: "TID Customer Service, Turlock. Paper applications in English and Spanish are on TID’s page.", es: "Servicio al cliente de TID, Turlock. En la página de TID hay solicitudes en papel en inglés y español." },
    },
    notes: [
      {
        en: "The home must be your main home, and you can’t be claimed as a dependent on someone else’s taxes. Bring proof of monthly income for everyone in the home.",
        es: "La vivienda debe ser su casa principal, y nadie más puede declararle como dependiente en sus impuestos. Lleve comprobante de ingresos mensuales de todos en la casa.",
      },
    ],
    sources: [SRC.tid],
  },
  liheap: {
    name: { en: "LIHEAP / HEAP (help paying energy bills)", es: "LIHEAP / HEAP (ayuda para pagar la luz y el gas)" },
    gives: {
      en: "A once-a-year payment toward your energy bill, crisis help if you get a shut-off notice, and help weatherizing your home.",
      es: "Un pago una vez al año para su factura de energía, ayuda de emergencia si recibe un aviso de corte, y ayuda para proteger su casa del clima (weatherization).",
    },
    immigration: {
      en: "The person who applies must be a U.S. citizen or a “qualified” immigrant. In a mixed-status home, another member who qualifies can apply. People who don’t qualify aren’t counted in the household size, but their income still counts.",
      es: "La persona que solicita debe ser ciudadana o inmigrante “calificado”. En un hogar de estatus mixto, otro miembro que califique puede solicitar. Las personas que no califican no cuentan en el tamaño del hogar, pero sus ingresos sí cuentan.",
    },
    apply: {
      url: "https://www.csd.ca.gov/Pages/FindServicesInYourArea.aspx",
      urlLabel: "CSD: find your local provider",
      phones: [
        { number: "(209) 537-9217", label: { en: "Central Valley Opportunity Center (CVOC)", es: "Central Valley Opportunity Center (CVOC)" } },
        { number: "(877) 211-7826", label: { en: "Stanislaus 211", es: "211 de Stanislaus" } },
      ],
      office: {
        en: "Central Valley Opportunity Center, 3860 Brickit Court, Ceres (as listed in the 2026 state plan; call to confirm the address).",
        es: "Central Valley Opportunity Center, 3860 Brickit Court, Ceres (según el plan estatal de 2026; llame para confirmar la dirección).",
      },
    },
    notes: [
      {
        en: "Money is first-come, first-served and can run out. The federal government has proposed ending LIHEAP for next year; we could not confirm what happened.",
        es: "El dinero se da por orden de llegada y se puede acabar. El gobierno federal propuso eliminar LIHEAP para el próximo año; no pudimos confirmar qué pasó.",
      },
    ],
    sources: [SRC.liheapIncome, SRC.liheapPlan],
  },
  lifeline: {
    name: { en: "California LifeLine (phone discount)", es: "California LifeLine (descuento en el teléfono)" },
    gives: {
      en: "Up to $19 a month off home or cell phone service, plus up to $39 off the connection fee. One per household.",
      es: "Hasta $19 al mes de descuento en el teléfono de casa o celular, más hasta $39 en el costo de conexión. Uno por hogar.",
    },
    immigration: { en: "The CPUC fact sheet lists no immigration status requirement.", es: "La hoja informativa de la CPUC no menciona ningún requisito migratorio." },
    apply: {
      url: "https://www.californialifeline.com",
      urlLabel: "CaliforniaLifeLine.com",
      phones: [{ number: "1-866-272-0357", label: { en: "LifeLine Call Center", es: "Centro de llamadas de LifeLine" } }],
      office: { en: "Apply through a phone company that takes part.", es: "Solicite por medio de una compañía de teléfono participante." },
    },
    sources: [SRC.lifeline],
  },
  caleitc: {
    name: { en: "CalEITC (California tax credit for workers)", es: "CalEITC (crédito de impuestos de California para trabajadores)" },
    gives: { en: "Money back when you file your California taxes.", es: "Dinero de vuelta cuando declara sus impuestos de California." },
    immigration: {
      en: "You can claim it with an SSN or an ITIN, for you, your spouse and your children.",
      es: "Lo puede reclamar con SSN o ITIN, para usted, su cónyuge y sus hijos.",
    },
    apply: TAX_APPLY,
    notes: [
      {
        en: "File a California return with form FTB 3514. You can claim up to 4 past years. You must have lived in California more than half the year.",
        es: "Presente la declaración de California con el formulario FTB 3514. Puede reclamar hasta 4 años anteriores. Debe haber vivido en California más de la mitad del año.",
      },
    ],
    sources: [SRC.caleitc, SRC.caleitcAmounts, SRC.vita],
  },
  yctc: {
    name: { en: "Young Child Tax Credit (YCTC)", es: "Crédito Tributario por Hijos Menores (YCTC)" },
    gives: { en: "Extra money back on your California taxes if you have a child under 6.", es: "Dinero extra de vuelta en sus impuestos de California si tiene un hijo menor de 6 años." },
    immigration: {
      en: "You can claim it with an SSN or an ITIN.",
      es: "Lo puede reclamar con SSN o ITIN.",
    },
    apply: TAX_APPLY,
    notes: [
      {
        en: "The child must be under 6 at the end of the tax year. You don’t need earned income to get it. Claim it on form FTB 3514.",
        es: "El niño debe ser menor de 6 años al final del año fiscal. No necesita ingresos de trabajo para recibirlo. Se reclama en el formulario FTB 3514.",
      },
    ],
    sources: [SRC.yctc, SRC.caleitc],
  },
  "federal-eitc": {
    name: { en: "Federal Earned Income Tax Credit (EITC)", es: "Crédito Federal por Ingreso del Trabajo (EITC)" },
    gives: { en: "Money back when you file your federal taxes.", es: "Dinero de vuelta cuando declara sus impuestos federales." },
    immigration: {
      en: "The federal EITC needs a Social Security number valid for work, issued by the return’s due date, for you and your spouse if filing jointly. People filing with an ITIN can’t get it. To get the bigger amount for a child, the child needs one too. If your child doesn’t have one, you may still get the smaller no-children amount (ages 25 to 64). ITIN families can still get CalEITC and YCTC.",
      es: "El EITC federal necesita un número de Seguro Social válido para trabajar, emitido antes de la fecha límite de la declaración, para usted y su cónyuge si declaran juntos. Quienes declaran con ITIN no lo pueden recibir. Para recibir la cantidad mayor por un hijo, el hijo también necesita uno. Si su hijo no lo tiene, todavía podría recibir la cantidad menor para personas sin hijos (de 25 a 64 años). Las familias con ITIN sí pueden recibir CalEITC y YCTC.",
    },
    apply: { ...TAX_APPLY, url: "https://irs.treasury.gov/freetaxprep/", urlLabel: "IRS free tax help (VITA)" },
    notes: [
      {
        en: "Both your earned income and your adjusted gross income must be under the limit, and investment income must be $12,200 or less.",
        es: "Sus ingresos del trabajo y su ingreso bruto ajustado deben estar por debajo del límite, y los ingresos por inversiones deben ser de $12,200 o menos.",
      },
    ],
    sources: [SRC.eitc, SRC.vita],
  },
} satisfies Record<string, ProgramFacts>;

export type ProgramId = keyof typeof PROGRAMS;

/** Public charge, in plain words (DHS rule effective Sept 18, 2026). */
export const PUBLIC_CHARGE = {
  effective: "2026-09-18",
  text: {
    en: "Public charge is a test used mainly when someone applies for a green card through family. Benefits your children or other family members get generally do not count against you. Benefits you got before Sept 18, 2026 are judged under the old rule: only cash aid and long-term care counted. Since Sept 18, 2026, officers can look at almost any income-based benefit that you, the person applying, receive. Refugees, asylees, U/T visa holders, VAWA and SIJ applicants are exempt. Green-card holders applying for citizenship don’t face this test. Before you cancel or turn down help, talk to a free immigration legal provider.",
    es: "La “carga pública” es una prueba que se usa sobre todo cuando alguien pide la green card por medio de un familiar. Los beneficios que reciben sus hijos u otros familiares generalmente no cuentan en su contra. Los beneficios que recibió antes del 18 de septiembre de 2026 se juzgan con la regla anterior: solo contaban la ayuda en efectivo y el cuidado a largo plazo. Desde el 18 de septiembre de 2026, los oficiales pueden considerar casi cualquier beneficio basado en ingresos que reciba usted, la persona que solicita. Refugiados, asilados, personas con visa U/T, VAWA y SIJ están exentos. Los residentes permanentes que piden la ciudadanía no pasan por esta prueba. Antes de cancelar o rechazar una ayuda, hable con un proveedor legal gratuito de inmigración.",
  } as Bilingual,
  caveat: {
    en: "This rule is new. How it treats each program, and whether courts change it, was not clear when we checked.",
    es: "Esta regla es nueva. Cómo trata cada programa, y si las cortes la cambian, no estaba claro cuando revisamos.",
  } as Bilingual,
  sources: [SRC.publicCharge, SRC.immigrationProviders],
};

/** Short tips that don't need a yes/no (each worded to match how sure we are). */
export const TIPS: { id: string; text: Bilingual; source?: SourceRef }[] = [
  {
    id: "school-meals",
    text: {
      en: "School meals: California public schools serve free breakfast and lunch to every student (confirm with your school). Still return the school’s meal form if asked: it brings money to the school, and being approved for free meals also qualifies your home for PG&E CARE and California LifeLine.",
      es: "Comidas escolares: las escuelas públicas de California dan desayuno y almuerzo gratis a todos los estudiantes (confírmelo con su escuela). Aun así, entregue el formulario de comidas de la escuela si se lo piden: le trae dinero a la escuela, y si le aprueban comidas gratis su hogar también califica para PG&E CARE y California LifeLine.",
    },
    source: SRC.cde,
  },
  {
    id: "modesto-water",
    text: {
      en: "City of Modesto water, sewer and trash: a 2023 news report said the city gave a discount to homes on a state or federal assistance program. We could not confirm it on a city page. Ask City of Modesto utility billing.",
      es: "Agua, drenaje y basura de la Ciudad de Modesto: una noticia de 2023 dijo que la ciudad daba un descuento a hogares que reciben un programa de ayuda estatal o federal. No pudimos confirmarlo en una página de la ciudad. Pregunte a la oficina de facturación de servicios de la Ciudad de Modesto.",
    },
  },
];

export const POVERTY_SOURCE = SRC.fpl;

/** Every source used on the Benefits tab, for the "Where this comes from" list. */
export const BENEFITS_SOURCES: SourceRef[] = Object.values(SRC);
