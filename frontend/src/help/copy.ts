// Help panel wording, written per language (not stitched together) so the
// Spanish reads naturally. `COPY: Record<Lang, HelpCopy>` makes a missing
// string a compile error. Legal facts and their citations live in facts.ts.
import type { Lang } from "../i18n";
import type { BuiltAge, ParcelUse } from "./parcels";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface HelpCopy {
  // panel
  title: string;
  privacyStrong: string;
  privacy: string;
  close: string;
  tabMedical: string;
  tabRent: string;
  tabLegal: string;
  tabWork: string;
  tabBenefits: string;
  workViewLabel: string;
  workViewWages: string;
  workViewHeat: string;
  benefitsViewLabel: string;
  benefitsViewScreener: string;
  benefitsViewWork: string;
  rentViewEviction: string;
  disclaimer: string;
  flyers: string;
  loading: string;
  newTab: string;
  website: string;
  showOnMap: string;
  sourcesHeading: string;
  checkedOn: Fn<[string]>;
  yes: string;
  no: string;
  notSure: string;
  moneyInvalid: string;
  // letters
  letterPreview: string;
  letterLanguage: string;
  letterLanguageHint: string;
  letterCopy: string;
  letterPrint: string;
  letterDownload: string;
  letterCopied: string;
  letterSelectToCopy: string;
  letterDownloaded: string;
  letterKeepCopy: string;
  // medical
  medLead: string;
  medCheckTitle: string;
  medHospital: string;
  medChooseHospital: string;
  medOtherHospital: string;
  medOtherHospitalText: string;
  medHousehold: string;
  medHouseholdHint: string;
  medIncome: string;
  medIncomeHint: string;
  medPer: string;
  perMonth: string;
  perYear: string;
  medTierFree: string;
  medTierDiscount: string;
  medTierOver: string;
  medPctOfPoverty: Fn<[string]>;
  medPctExplain: Fn<[string, number, string, number]>;
  medFreeNext: Fn<[number]>;
  medDiscountNext: Fn<[number]>;
  medOverNext: string;
  medInsured: string;
  medHighCostsQ: string;
  medHighCostsHint: string;
  medIfHighCosts: string;
  medBorderline: string;
  medCallBilling: string;
  medPageLink: string;
  medNoSpanish: string;
  medFreeHelpText: string;
  medPolicyLink: string;
  medApplicationLink: string;
  medPolicyDated: Fn<[string]>;
  medRightsTitle: string;
  medLetterTitle: string;
  medComplainTitle: string;
  medComplainText: string;
  // renters
  rentLead: string;
  rentViewLabel: string;
  rentViewIncrease: string;
  rentViewRepairs: string;
  rentViewDeposit: string;
  rentViewMobile: string;
  rentNeedHelp: string;
  rentNeedHelpText: string;
  rentSeeLegal: string;
  capTitle: string;
  capIntro: Fn<[number, string, string]>;
  capStep1: string;
  capHomeType: string;
  homeApartment: string;
  homeHouse: string;
  homeDuplex: string;
  homeMobileRented: string;
  homeMobileOwned: string;
  capNewBuilt: string;
  capNewBuiltHint: string;
  capAffordable: string;
  capAffordableHint: string;
  capNotice: string;
  capNoticeHint: string;
  capCorporate: string;
  capCorporateMobile: string;
  capCorporateHint: string;
  capDuplexOwner: string;
  covCovered: string;
  covExempt: string;
  covMaybe: string;
  covCoveredNext: string;
  covExemptNext: string;
  covMaybeNext: string;
  capStep2: string;
  capLowest: string;
  capLowestHint: string;
  capNew: string;
  capEffective: string;
  capNoticed: string;
  capNoticedHint: string;
  capByMail: string;
  capNoPeriod: string;
  capNoPeriodText: string;
  capWithin: string;
  capOver: Fn<[string]>;
  capPct: Fn<[string]>;
  capMath: Fn<[string, number, string, string, string]>;
  capIfCovered: string;
  capOverNext: string;
  noticeOk: string;
  noticeShort: string;
  noticeMath: Fn<[number, number, boolean, boolean]>;
  noticeAfter: string;
  noticeEarliest: Fn<[string]>;
  capRulesTitle: string;
  capExemptionsTitle: string;
  capSunset: Fn<[string]>;
  lookupTitle: string;
  lookupHint: string;
  lookupButton: string;
  lookupBad: string;
  lookupNone: string;
  lookupError: string;
  lookupYears: Fn<[number, number]>;
  useLabel: Record<Exclude<ParcelUse, "">, string>;
  lookupAge: Record<BuiltAge, Fn<[number]>>;
  lookupCaveat: Fn<[string]>;
  repairsTitle: string;
  repairsInspectors: string;
  repairsInspectorsText: string;
  depositTitle: string;
  mobileTitle: string;
  mobileLead: string;
  mobileRentInstead: string;
  // legal
  legalLead: string;
  notarioTitle: string;
  notarioText: string;
  legalListTitle: string;
  legalLoadError: string;
  legalFilter: string;
  legalAll: string;
  legalCount: Fn<[number]>;
  legalLanguages: string;
  legalCallFirst: string;
}

const pctText = (n: number) => `${n}%`;

const en: HelpCopy = {
  title: "Free help",
  privacyStrong: "Private:",
  privacy: "what you type stays on this device and is never saved or shared. Closing this window erases it.",
  close: "Close",
  tabMedical: "Medical bills",
  tabRent: "Renters",
  tabLegal: "Legal help",
  tabWork: "Work",
  tabBenefits: "Benefits",
  workViewLabel: "Choose a topic",
  workViewWages: "Unpaid wages",
  workViewHeat: "Heat at work today",
  benefitsViewLabel: "Choose a topic",
  benefitsViewScreener: "Which benefits can I get?",
  benefitsViewWork: "Medi-Cal work rules (2027)",
  rentViewEviction: "Got an eviction notice?",
  flyers: "Share these tools: free printable flyers in English and Spanish",
  disclaimer:
    "This is general information, not legal advice, from public law and official sources (checked dates are shown). Every situation is different. For advice about yours, contact one of the free legal help offices.",
  loading: "Loading…",
  newTab: "opens in a new tab",
  website: "Website",
  showOnMap: "Show on map",
  sourcesHeading: "Where this information comes from",
  checkedOn: (d) => `Last checked ${d}.`,
  yes: "Yes",
  no: "No",
  notSure: "Not sure",
  moneyInvalid: "Enter a dollar amount using numbers only, like 1250 or 1,250.50.",

  letterPreview: "Your letter",
  letterLanguage: "Letter language",
  letterLanguageHint: "Letters to landlords, hospitals and employers usually work best in English. You can print a Spanish copy for yourself.",
  letterCopy: "Copy letter",
  letterPrint: "Print or save as PDF",
  letterDownload: "Download (.txt)",
  letterCopied: "Copied. Paste it into an email, text or document.",
  letterSelectToCopy: "The letter is selected: press Ctrl+C (or ⌘+C) to copy it.",
  letterDownloaded: "Downloaded to this device.",
  letterKeepCopy: "Sign it, keep a copy, and send it in a way you can prove (like certified mail, or mail plus a photo of the letter by text or email).",

  medLead:
    "Every California hospital must offer free or discounted care to patients without insurance, and to insured patients with high medical bills, whose family income is up to 400% of the poverty line (about $132,000 a year for a family of four). You can apply even after you get the bill. Immigration status doesn’t matter.",
  medCheckTitle: "Check if you may qualify",
  medHospital: "Hospital",
  medChooseHospital: "Choose your hospital…",
  medOtherHospital: "Another California hospital",
  medOtherHospitalText:
    "Every general acute care hospital in California must follow the same state rules shown here. Ask its billing or financial counseling office for its “financial assistance” or “charity care” policy and application.",
  medHousehold: "People in your household",
  medHouseholdHint: "You, your spouse or partner, and the children or relatives you support.",
  medIncome: "Household income before taxes",
  medIncomeHint: "All the money your household earns, including cash work.",
  medPer: "That amount is…",
  perMonth: "per month",
  perYear: "per year",
  medTierFree: "You may qualify for FREE care",
  medTierDiscount: "You may qualify for DISCOUNTED care",
  medTierOver: "Your income is above the usual limits, but you may still get help",
  medPctOfPoverty: (n) => `${n}% of the poverty line`,
  medPctExplain: (income, size, line, year) =>
    `${income} a year for ${size} ${size === 1 ? "person" : "people"}, compared with the ${year} federal poverty line of ${line} for that household size.`,
  medFreeNext: (n) => `This hospital gives free care up to ${pctText(n)} of the poverty line. Ask for the financial assistance application.`,
  medDiscountNext: (n) =>
    `This hospital must give discounted care at or below ${pctText(n)} of the poverty line, and payment plans without interest. Ask for the financial assistance application.`,
  medOverNext:
    "Ask anyway: hospitals can be more generous than the minimum, and patients with very high medical costs can qualify at higher incomes.",
  medInsured: "Do you have health insurance (including Medi-Cal or Medicare)?",
  medHighCostsQ: "In the past 12 months, did you pay more than 10% of your family’s income in medical costs out of your own pocket?",
  medHighCostsHint: "Copays, deductibles and bills insurance didn’t pay, at any doctor or hospital. Example: a family earning $40,000 that paid over $4,000.",
  medIfHighCosts: "With insurance, this depends on your medical costs being high (more than 10% of your income). Apply anyway: the hospital will check.",
  medBorderline: "You’re close to a cutoff. Hospitals may use a different year’s poverty table or count income differently, so apply anyway.",
  medCallBilling: "Financial assistance:",
  medPageLink: "Hospital’s financial assistance page",
  medNoSpanish: "", // shown only in Spanish
  medFreeHelpText: "Need help applying or appealing? Free help:",
  medPolicyLink: "Financial assistance policy",
  medApplicationLink: "Application form",
  medPolicyDated: (d) => (d ? `Policy dated ${d}. Hospitals update these; the hospital’s own copy wins.` : "Hospitals update these; the hospital’s own copy wins."),
  medRightsTitle: "Your rights with hospital bills in California",
  medLetterTitle: "Letter: ask for an itemized bill and financial assistance",
  medComplainTitle: "If the hospital doesn’t follow the rules",
  medComplainText: "You can file a free complaint with the state:",

  rentLead:
    "Most renters in California are protected by limits on rent increases, rules on eviction, and the right to a livable home. Check your situation below. Nothing you enter is saved.",
  rentViewLabel: "Choose a topic",
  rentViewIncrease: "Is my rent increase legal?",
  rentViewRepairs: "Get repairs made",
  rentViewDeposit: "Get my deposit back",
  rentViewMobile: "Mobile home space rent",
  rentNeedHelp: "Facing eviction or a big problem?",
  rentNeedHelpText: "Free legal help can look at your papers and tell you your options. If you got court papers, call right away: you have very little time to respond.",
  rentSeeLegal: "See free legal help",
  capTitle: "California’s rent cap",
  capIntro: (max, from, to) =>
    `In Stanislaus County, a rent increase that takes effect between ${from} and ${to} can be at most ${max}% over 12 months, if the cap covers your home. Two quick steps:`,
  capStep1: "Step 1: Does the cap cover your home?",
  capHomeType: "What do you rent?",
  homeApartment: "An apartment, or a unit in a building with 3 or more homes",
  homeHouse: "A house, condo or townhome",
  homeDuplex: "Half of a duplex",
  homeMobileRented: "A mobile home I rent (I don’t own it)",
  homeMobileOwned: "I own my mobile home and rent the space",
  capNewBuilt: "Was the building finished in the last 15 years?",
  capNewBuiltHint: "Use the lookup above, or ask the manager. Newer buildings aren’t covered.",
  capAffordable: "Is it income-restricted affordable housing?",
  capAffordableHint: "Housing where your income was checked to qualify (not just a Section 8 voucher).",
  capNotice: "Does your lease (or a written notice) say the home is NOT subject to the rent limits of Civil Code §1947.12?",
  capNoticeHint: "Look in your lease for that exact wording. If it isn’t there, answer No.",
  capCorporate: "Is the owner a corporation, a real estate trust (REIT), or an LLC that has a corporation as a member?",
  capCorporateMobile: "Is the owner a corporation, a REIT, an LLC with a corporation as a member, or the park’s management?",
  capCorporateHint:
    "Check who you pay rent to and who signed the lease. A company name often ends in Inc. or Corp. An LLC owned only by people (not companies) counts as No; if you don’t know who owns the LLC, answer Not sure.",
  capDuplexOwner: "Did the owner live in the other half when you moved in, and do they still live there?",
  covCovered: "The rent cap most likely covers your home",
  covExempt: "Your home may be exempt from the rent cap",
  covMaybe: "Your home may or may not be covered",
  covCoveredNext: "Now check the numbers in step 2.",
  covExemptNext:
    "If so, the cap doesn’t limit the amount. The notice rules in step 2 still apply to every rental, and so do your rights to repairs and against retaliation.",
  covMaybeNext: "It depends on the item above. Step 2 shows what the cap would allow; free legal help can tell you if it applies.",
  capStep2: "Step 2: Check the increase",
  capLowest: "Lowest rent in the last 12 months",
  capLowestHint: "The lowest monthly rent you were charged in the past year, usually your rent before this increase. Don’t subtract discounts you were given.",
  capNew: "New monthly rent",
  capEffective: "Date the new rent starts",
  capNoticed: "Date you got the written notice",
  capNoticedHint: "Optional: to check the notice period.",
  capByMail: "Did the notice come by mail?",
  capNoPeriod: "We don’t have the cap for that date",
  capNoPeriodText: "The yearly cap changes every August 1. Check the California Attorney General’s rent cap page (in the sources below) or ask free legal help.",
  capWithin: "This increase is within the cap",
  capOver: (amt) => `This is ${amt} a month over the cap`,
  capPct: (pct) => `${pct}% increase`,
  capMath: (low, max, maxRent, from, to) =>
    `From ${low}, the most allowed is ${max}% for increases starting ${from}–${to}: up to ${maxRent} a month, counting every increase in the past 12 months.`,
  capIfCovered: "This applies only if the cap covers your home (see step 1).",
  capOverNext:
    "An owner can’t collect rent above the cap. Talk to free legal help before you decide what to pay, and keep paying what you know you owe. You can also report it to the California Attorney General.",
  noticeOk: "You got enough notice",
  noticeShort: "That’s not enough notice",
  noticeMath: (given, required, over10, mail) =>
    `You got ${given} days’ notice. For an increase of ${over10 ? "more than 10%" : "10% or less"} (counting the past 12 months), the law requires at least ${required} days${mail ? ", including 5 extra days for mail" : ""}.`,
  noticeAfter: "The notice date is after the date the new rent starts, so the notice came too late for that date.",
  noticeEarliest: (d) => `With the notice you got, the new rent can’t start before ${d}.`,
  capRulesTitle: "The rules",
  capExemptionsTitle: "Homes the cap doesn’t cover",
  capSunset: (d) => `These state protections are in effect until ${d} unless the Legislature extends them.`,
  lookupTitle: "Look up when your building was built",
  lookupHint:
    "Uses the county assessor’s records, stored on this site. Your address is matched on this device: only the first two letters of the street name are used to pick which file to load.",
  lookupButton: "Look up",
  lookupBad: "Enter a street address with a house number, like “1234 Main St, Modesto”.",
  lookupNone: "We couldn’t find that address in the county’s records. Check the spelling, or answer the question below yourself.",
  lookupError: "Couldn’t load the records. Answer the question below yourself, or try again.",
  lookupYears: (a, b) => (a === b ? `built ${a}` : `buildings from ${a} to ${b}`),
  useLabel: { sfr: "single-family home", condo: "condo", mobile: "mobile home lot", duplex: "duplex", multi: "apartments" },
  lookupAge: {
    new: () => "Built in the last 15 years: likely NOT covered by the cap.",
    old: () => "Older than 15 years: the new-building exemption doesn’t apply.",
    borderline: (y) => `Finished around ${y}, right at the 15-year line. Ask the city building department for the certificate of occupancy date.`,
    mixed: () => "This property has old and new buildings. It depends on which one you rent.",
  },
  lookupCaveat: (d) => `County assessor records as of ${d}. The “year built” is close to, but not always the same as, the official certificate of occupancy date.`,
  repairsTitle: "Your right to a livable home",
  repairsInspectors: "Ask a city or county inspector",
  repairsInspectorsText:
    "If repairs don’t happen, an inspector can check the home and order the landlord to fix it. Inspections are free. In other cities, call city hall and ask for code enforcement or building inspection.",
  depositTitle: "Getting your security deposit back",
  mobileTitle: "Mobile home parks: space rent",
  mobileLead:
    "If you own your mobile home and rent the space, a different law applies: the Mobilehome Residency Law. Here is what applies in Stanislaus County.",
  mobileRentInstead: "I rent the mobile home itself: check the regular rent cap",

  legalLead:
    "Free and low-cost legal help near Stanislaus County, checked against each office’s own information. Call before you go: hours and services change.",
  notarioTitle: "Watch out for fake “notarios”",
  notarioText:
    "In the U.S., a “notario público” is NOT a lawyer and can’t give immigration advice or go to court with you. Only a licensed lawyer or a DOJ-accredited representative at a recognized organization can. Never sign blank forms or pay for “guaranteed” papers. Check before you pay:",
  legalListTitle: "Free and low-cost offices",
  legalLoadError: "Couldn’t load the list. Check your connection and try again.",
  legalFilter: "Filter by type of help",
  legalAll: "All",
  legalCount: (n) => (n === 1 ? "1 office" : `${n} offices`),
  legalLanguages: "Languages",
  legalCallFirst:
    "“DOJ-recognized” means the U.S. Department of Justice approved the organization to give immigration legal help. Some of its staff may only help with applications, not in immigration court: ask.",
};

const es: HelpCopy = {
  title: "Ayuda gratis",
  privacyStrong: "Privado:",
  privacy: "lo que escriba se queda en este aparato y nunca se guarda ni se comparte. Al cerrar esta ventana se borra.",
  close: "Cerrar",
  tabMedical: "Cuentas médicas",
  tabRent: "Inquilinos",
  tabLegal: "Ayuda legal",
  tabWork: "Trabajo",
  tabBenefits: "Beneficios",
  workViewLabel: "Elija un tema",
  workViewWages: "Salarios no pagados",
  workViewHeat: "Calor en el trabajo hoy",
  benefitsViewLabel: "Elija un tema",
  benefitsViewScreener: "¿Qué beneficios puedo recibir?",
  benefitsViewWork: "Reglas de trabajo de Medi-Cal (2027)",
  rentViewEviction: "¿Recibió un aviso de desalojo?",
  flyers: "Comparta estas herramientas: volantes gratis para imprimir, en español e inglés",
  disclaimer:
    "Esta es información general, no consejo legal, tomada de la ley y de fuentes oficiales (se muestra la fecha de revisión). Cada caso es distinto. Para un consejo sobre su caso, comuníquese con una de las oficinas de ayuda legal gratuita.",
  loading: "Cargando…",
  newTab: "se abre en una pestaña nueva",
  website: "Sitio web",
  showOnMap: "Ver en el mapa",
  sourcesHeading: "De dónde viene esta información",
  checkedOn: (d) => `Revisado por última vez el ${d}.`,
  yes: "Sí",
  no: "No",
  notSure: "No sé",
  moneyInvalid: "Escriba una cantidad en dólares solo con números, como 1250 o 1,250.50.",

  letterPreview: "Su carta",
  letterLanguage: "Idioma de la carta",
  letterLanguageHint: "Las cartas a arrendadores, hospitales y empleadores suelen funcionar mejor en inglés. Puede imprimir una copia en español para usted.",
  letterCopy: "Copiar carta",
  letterPrint: "Imprimir o guardar como PDF",
  letterDownload: "Descargar (.txt)",
  letterCopied: "Copiada. Péguela en un correo, un texto o un documento.",
  letterSelectToCopy: "La carta está seleccionada: presione Ctrl+C (o ⌘+C) para copiarla.",
  letterDownloaded: "Descargada en este aparato.",
  letterKeepCopy:
    "Fírmela, guarde una copia y envíela de una forma que pueda comprobar (por ejemplo, correo certificado, o por correo y además una foto de la carta por texto o correo electrónico).",

  medLead:
    "Todo hospital de California debe ofrecer atención gratis o con descuento a pacientes sin seguro, y a pacientes con seguro que tienen cuentas médicas altas, cuyos ingresos familiares lleguen hasta el 400% de la línea de pobreza (unos $132,000 al año para una familia de cuatro). Puede pedirla incluso después de recibir la cuenta. Su estatus migratorio no importa.",
  medCheckTitle: "Vea si podría calificar",
  medHospital: "Hospital",
  medChooseHospital: "Elija su hospital…",
  medOtherHospital: "Otro hospital de California",
  medOtherHospitalText:
    "Todos los hospitales generales de California deben seguir las mismas reglas estatales que se muestran aquí. Pida en la oficina de cobros o de asesoría financiera su política de “asistencia financiera” o “atención de caridad” (charity care) y la solicitud.",
  medHousehold: "Personas en su hogar",
  medHouseholdHint: "Usted, su esposo/a o pareja, y los hijos o familiares que mantiene.",
  medIncome: "Ingresos del hogar antes de impuestos",
  medIncomeHint: "Todo el dinero que gana su hogar, incluso el trabajo pagado en efectivo.",
  medPer: "Esa cantidad es…",
  perMonth: "al mes",
  perYear: "al año",
  medTierFree: "Podría calificar para atención GRATIS",
  medTierDiscount: "Podría calificar para atención CON DESCUENTO",
  medTierOver: "Sus ingresos pasan los límites usuales, pero aún podría recibir ayuda",
  medPctOfPoverty: (n) => `${n}% de la línea de pobreza`,
  medPctExplain: (income, size, line, year) =>
    `${income} al año para ${size} ${size === 1 ? "persona" : "personas"}, comparado con la línea federal de pobreza de ${year}, que es ${line} para ese tamaño de hogar.`,
  medFreeNext: (n) => `Este hospital da atención gratis hasta el ${pctText(n)} de la línea de pobreza. Pida la solicitud de asistencia financiera.`,
  medDiscountNext: (n) =>
    `Este hospital debe dar atención con descuento hasta el ${pctText(n)} de la línea de pobreza, y planes de pago sin intereses. Pida la solicitud de asistencia financiera.`,
  medOverNext:
    "Pregunte de todos modos: los hospitales pueden ser más generosos que el mínimo, y los pacientes con gastos médicos muy altos pueden calificar con ingresos más altos.",
  medInsured: "¿Tiene seguro médico (incluso Medi-Cal o Medicare)?",
  medHighCostsQ: "En los últimos 12 meses, ¿pagó de su bolsillo más del 10% de los ingresos de su familia en gastos médicos?",
  medHighCostsHint: "Copagos, deducibles y cuentas que el seguro no pagó, con cualquier médico u hospital. Ejemplo: una familia que gana $40,000 y pagó más de $4,000.",
  medIfHighCosts: "Con seguro, esto depende de que sus gastos médicos sean altos (más del 10% de sus ingresos). Pídala de todos modos: el hospital lo revisará.",
  medBorderline: "Está cerca de un límite. Los hospitales pueden usar la tabla de pobreza de otro año o contar los ingresos de otra forma: pida la ayuda de todos modos.",
  medCallBilling: "Asistencia financiera:",
  medPageLink: "Página de asistencia financiera del hospital",
  medNoSpanish: "Este hospital no publica su solicitud en español. Por ley, debe darle la información en su idioma: pídala por teléfono.",
  medFreeHelpText: "¿Necesita ayuda para pedirla o apelar? Ayuda gratis:",
  medPolicyLink: "Política de asistencia financiera",
  medApplicationLink: "Formulario de solicitud",
  medPolicyDated: (d) =>
    d ? `Política con fecha del ${d}. Los hospitales las actualizan; vale la copia del hospital.` : "Los hospitales las actualizan; vale la copia del hospital.",
  medRightsTitle: "Sus derechos con las cuentas del hospital en California",
  medLetterTitle: "Carta: pida una cuenta detallada y asistencia financiera",
  medComplainTitle: "Si el hospital no cumple las reglas",
  medComplainText: "Puede presentar una queja gratis ante el estado:",

  rentLead:
    "La mayoría de los inquilinos de California tienen límites a los aumentos de renta, reglas contra desalojos injustos y derecho a una vivienda habitable. Revise su situación aquí. Nada de lo que escriba se guarda.",
  rentViewLabel: "Elija un tema",
  rentViewIncrease: "¿Es legal mi aumento de renta?",
  rentViewRepairs: "Conseguir reparaciones",
  rentViewDeposit: "Recuperar mi depósito",
  rentViewMobile: "Renta de espacio de casa móvil",
  rentNeedHelp: "¿Le quieren desalojar o tiene un problema grave?",
  rentNeedHelpText:
    "La ayuda legal gratuita puede revisar sus papeles y explicarle sus opciones. Si recibió papeles de la corte, llame de inmediato: tiene muy poco tiempo para responder.",
  rentSeeLegal: "Ver ayuda legal gratuita",
  capTitle: "El límite de renta de California",
  capIntro: (max, from, to) =>
    `En el condado de Stanislaus, un aumento de renta que empiece entre el ${from} y el ${to} puede ser como máximo del ${max}% en 12 meses, si el límite cubre su vivienda. Dos pasos rápidos:`,
  capStep1: "Paso 1: ¿El límite cubre su vivienda?",
  capHomeType: "¿Qué renta?",
  homeApartment: "Un apartamento, o una unidad en un edificio de 3 viviendas o más",
  homeHouse: "Una casa, condominio o townhome",
  homeDuplex: "La mitad de un dúplex",
  homeMobileRented: "Una casa móvil que rento (no es mía)",
  homeMobileOwned: "Soy dueño de mi casa móvil y rento el espacio",
  capNewBuilt: "¿El edificio se terminó en los últimos 15 años?",
  capNewBuiltHint: "Use la búsqueda de arriba o pregunte al administrador. Los edificios más nuevos no están cubiertos.",
  capAffordable: "¿Es vivienda asequible con límite de ingresos?",
  capAffordableHint: "Vivienda donde revisaron sus ingresos para que calificara (no solo un vale de la Sección 8).",
  capNotice: "¿Su contrato (o un aviso por escrito) dice que la vivienda NO está sujeta a los límites de renta del Código Civil §1947.12?",
  capNoticeHint: "Busque esas palabras exactas en su contrato. Si no están, conteste No.",
  capCorporate: "¿El dueño es una corporación, un fideicomiso de bienes raíces (REIT) o una LLC que tiene una corporación como socia?",
  capCorporateMobile: "¿El dueño es una corporación, un REIT, una LLC con una corporación como socia, o la administración del parque?",
  capCorporateHint:
    "Vea a quién le paga la renta y quién firmó el contrato. El nombre de una empresa suele terminar en Inc. o Corp. Una LLC cuyos dueños son solo personas (no empresas) cuenta como No; si no sabe quién es dueño de la LLC, conteste No sé.",
  capDuplexOwner: "¿El dueño vivía en la otra mitad cuando usted llegó, y todavía vive ahí?",
  covCovered: "Lo más probable es que el límite cubra su vivienda",
  covExempt: "Su vivienda podría estar exenta del límite",
  covMaybe: "Su vivienda podría estar cubierta o no",
  covCoveredNext: "Ahora revise los números en el paso 2.",
  covExemptNext:
    "Si es así, el límite no restringe la cantidad. Las reglas de aviso del paso 2 aplican a toda vivienda rentada, igual que su derecho a reparaciones y la protección contra represalias.",
  covMaybeNext:
    "Depende del punto de arriba. El paso 2 muestra lo que permitiría el límite; la ayuda legal gratuita puede decirle si aplica.",
  capStep2: "Paso 2: Revise el aumento",
  capLowest: "Renta más baja en los últimos 12 meses",
  capLowestHint: "La renta mensual más baja que le cobraron en el último año, normalmente su renta antes de este aumento. No reste los descuentos que le dieron.",
  capNew: "Renta mensual nueva",
  capEffective: "Fecha en que empieza la renta nueva",
  capNoticed: "Fecha en que recibió el aviso por escrito",
  capNoticedHint: "Opcional: para revisar el plazo del aviso.",
  capByMail: "¿El aviso llegó por correo?",
  capNoPeriod: "No tenemos el límite para esa fecha",
  capNoPeriodText:
    "El límite anual cambia cada 1 de agosto. Consulte la página de límites de renta del Procurador General de California (en las fuentes de abajo) o pregunte a la ayuda legal gratuita.",
  capWithin: "Este aumento está dentro del límite",
  capOver: (amt) => `Esto es ${amt} al mes por encima del límite`,
  capPct: (pct) => `Aumento del ${pct}%`,
  capMath: (low, max, maxRent, from, to) =>
    `Desde ${low}, lo máximo permitido es el ${max}% para aumentos que empiezan del ${from} al ${to}: hasta ${maxRent} al mes, sumando todos los aumentos de los últimos 12 meses.`,
  capIfCovered: "Esto aplica solo si el límite cubre su vivienda (vea el paso 1).",
  capOverNext:
    "El dueño no puede cobrar más del límite. Hable con la ayuda legal gratuita antes de decidir cuánto pagar, y siga pagando lo que sabe que debe. También puede reportarlo al Procurador General de California.",
  noticeOk: "Le dieron suficiente aviso",
  noticeShort: "No le dieron suficiente aviso",
  noticeMath: (given, required, over10, mail) =>
    `Le avisaron con ${given} días. Para un aumento ${over10 ? "de más del 10%" : "del 10% o menos"} (sumando los últimos 12 meses), la ley exige al menos ${required} días${mail ? ", con 5 días extra por correo" : ""}.`,
  noticeAfter: "La fecha del aviso es posterior a la fecha en que empieza la renta nueva: el aviso llegó tarde para esa fecha.",
  noticeEarliest: (d) => `Con el aviso que recibió, la renta nueva no puede empezar antes del ${d}.`,
  capRulesTitle: "Las reglas",
  capExemptionsTitle: "Viviendas que el límite no cubre",
  capSunset: (d) => `Estas protecciones estatales están vigentes hasta el ${d}, a menos que la Legislatura las extienda.`,
  lookupTitle: "Busque cuándo se construyó su edificio",
  lookupHint:
    "Usa los registros del tasador del condado, guardados en este sitio. Su dirección se compara en este aparato: solo se usan las dos primeras letras del nombre de la calle para elegir qué archivo cargar.",
  lookupButton: "Buscar",
  lookupBad: "Escriba una dirección con número de casa, como “1234 Main St, Modesto”.",
  lookupNone: "No encontramos esa dirección en los registros del condado. Revise cómo la escribió, o conteste usted la pregunta de abajo.",
  lookupError: "No se pudieron cargar los registros. Conteste usted la pregunta de abajo o inténtelo de nuevo.",
  lookupYears: (a, b) => (a === b ? `construido en ${a}` : `edificios de ${a} a ${b}`),
  useLabel: { sfr: "casa unifamiliar", condo: "condominio", mobile: "lote de casa móvil", duplex: "dúplex", multi: "apartamentos" },
  lookupAge: {
    new: () => "Construido en los últimos 15 años: probablemente el límite NO lo cubre.",
    old: () => "Tiene más de 15 años: la exención por edificio nuevo no aplica.",
    borderline: (y) =>
      `Terminado alrededor de ${y}, justo en el límite de 15 años. Pida al departamento de construcción de la ciudad la fecha del certificado de ocupación.`,
    mixed: () => "Esta propiedad tiene edificios viejos y nuevos. Depende de cuál renta usted.",
  },
  lookupCaveat: (d) =>
    `Registros del tasador del condado al ${d}. El “año de construcción” se acerca a la fecha oficial del certificado de ocupación, pero no siempre es igual.`,
  repairsTitle: "Su derecho a una vivienda habitable",
  repairsInspectors: "Pida un inspector de la ciudad o del condado",
  repairsInspectorsText:
    "Si no hacen las reparaciones, un inspector puede revisar la vivienda y ordenar al arrendador que la arregle. Las inspecciones son gratis. En otras ciudades, llame al ayuntamiento y pida “code enforcement” o inspección de construcción.",
  depositTitle: "Cómo recuperar su depósito de garantía",
  mobileTitle: "Parques de casas móviles: renta del espacio",
  mobileLead:
    "Si usted es dueño de su casa móvil y renta el espacio, aplica otra ley: la Ley de Residencia en Casas Móviles. Esto es lo que aplica en el condado de Stanislaus.",
  mobileRentInstead: "Rento la casa móvil: revisar el límite normal de renta",

  legalLead:
    "Ayuda legal gratuita y de bajo costo cerca del condado de Stanislaus, revisada con la información de cada oficina. Llame antes de ir: los horarios y servicios cambian.",
  notarioTitle: "Cuidado con los “notarios” falsos",
  notarioText:
    "En EE. UU., un “notario público” NO es abogado y no puede darle consejos de inmigración ni ir a la corte con usted. Solo un abogado con licencia o un representante acreditado por el DOJ en una organización reconocida puede hacerlo. Nunca firme formularios en blanco ni pague por papeles “garantizados”. Verifique antes de pagar:",
  legalListTitle: "Oficinas gratuitas y de bajo costo",
  legalLoadError: "No se pudo cargar la lista. Revise su conexión e inténtelo de nuevo.",
  legalFilter: "Filtrar por tipo de ayuda",
  legalAll: "Todas",
  legalCount: (n) => (n === 1 ? "1 oficina" : `${n} oficinas`),
  legalLanguages: "Idiomas",
  legalCallFirst:
    "“Reconocida por el DOJ” quiere decir que el Departamento de Justicia de EE. UU. aprobó a la organización para dar ayuda legal de inmigración. Parte de su personal quizá solo ayude con solicitudes y no en la corte de inmigración: pregunte.",
};

export const COPY: Record<Lang, HelpCopy> = { en, es };
