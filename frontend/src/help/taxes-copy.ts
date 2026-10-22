// Wording for the free tax help guide, per language. The facts themselves
// (with citations) are in taxes-facts.ts.
import type { Lang } from "../i18n";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface TaxesCopy {
  title: string;
  lead: string;
  seasonTitle: string;
  seasonText: Fn<[number, string]>;
  seasonPrivate: string;
  /** Before the ITIN how-to: the immigration-risk section comes first for some readers. */
  seasonImmigration: string;
  freeTitle: string;
  placesTitle: string;
  numbersTitle: string;
  numbersCaption: Fn<[number]>;
  colChildren: string;
  colCalEitc: Fn<[number]>;
  colFedEitc: string;
  colFedLimit: string;
  colFedLimitJoint: string;
  /** After the federal amount with no children (Pub. 596: ages 25 to 64). */
  noChildAges: string;
  children: readonly [string, string, string, string];
  numbersNote: Fn<[string, string, string]>;
  stateTitle: string;
  fedTitle: string;
  itinTitle: string;
  itinPlacesTitle: string;
  privacyTitle: string;
  refundsTitle: string;
  scamsTitle: string;
  legalButton: string;
  notAdvice: string;
}

const en: TaxesCopy = {
  title: "Free tax help for 2027",
  lead: "File your 2026 taxes for free and get the cash-back credits your family earned, with a Social Security number or an ITIN. Where to get free help in Stanislaus County, what you may get back, and how to avoid scams.",
  seasonTitle: "This tax season",
  seasonText: (year, due) => `These are your tax year ${year} returns, due ${due} (federal and California). Free help sites open around February.`,
  seasonPrivate: "Nothing on this page asks for your information.",
  seasonImmigration: "Applying for an ITIN, or have a deportation order? Read “Your information and immigration” below first.",
  freeTitle: "Ways to file for free",
  placesTitle: "Free help near you",
  numbersTitle: "What you may get back",
  numbersCaption: (year) => `Most you can get from each credit, by number of children (tax year ${year} unless noted)`,
  colChildren: "Children",
  colCalEitc: (year) => `CalEITC, up to (tax year ${year})`,
  colFedEitc: "Federal EITC, up to",
  colFedLimit: "Federal EITC income limit",
  colFedLimitJoint: "Married filing jointly",
  noChildAges: "(no children: ages 25 to 64)",
  children: ["None", "1", "2", "3 or more"],
  numbersNote: (income, yctc, fytc) =>
    `California: CalEITC is for incomes under ${income}. With a child under 6, add up to ${yctc} (Young Child Tax Credit). Former foster youth 18–25: up to ${fytc} more. The federal EITC needs a Social Security number; California’s credits take an ITIN too.`,
  stateTitle: "California’s credits (SSN or ITIN)",
  fedTitle: "Federal credits and the new rules",
  itinTitle: "ITIN: a tax number without a Social Security number",
  itinPlacesTitle: "Help with an ITIN near you",
  privacyTitle: "Your information and immigration",
  refundsTitle: "When your refund comes",
  scamsTitle: "Avoid tax scams",
  legalButton: "Find free immigration legal help",
  notAdvice: "This is general information, not tax or legal advice. A free tax site can look at your own situation.",
};

const es: TaxesCopy = {
  title: "Ayuda gratis con impuestos para 2027",
  lead: "Presente sus impuestos de 2026 gratis y reciba los créditos que su familia se ganó, con número de Seguro Social o con ITIN. Dónde conseguir ayuda gratis en el condado de Stanislaus, cuánto podría recibir y cómo evitar estafas.",
  seasonTitle: "Esta temporada de impuestos",
  seasonText: (year, due) => `Son sus declaraciones del año fiscal ${year}, que vencen el ${due} (federal y de California). Los sitios de ayuda gratis abren alrededor de febrero.`,
  seasonPrivate: "Nada en esta página le pide sus datos.",
  seasonImmigration: "¿Va a solicitar un ITIN o tiene una orden de deportación? Lea primero “Su información y la inmigración”, más abajo.",
  freeTitle: "Maneras de declarar gratis",
  placesTitle: "Ayuda gratis cerca de usted",
  numbersTitle: "Cuánto podría recibir",
  numbersCaption: (year) => `Lo máximo de cada crédito, según el número de hijos (año fiscal ${year} salvo que se indique otro)`,
  colChildren: "Hijos",
  colCalEitc: (year) => `CalEITC, hasta (año fiscal ${year})`,
  colFedEitc: "EITC federal, hasta",
  colFedLimit: "Límite de ingresos del EITC federal",
  colFedLimitJoint: "Casados que declaran juntos",
  noChildAges: "(sin hijos: de 25 a 64 años)",
  children: ["Ninguno", "1", "2", "3 o más"],
  numbersNote: (income, yctc, fytc) =>
    `California: CalEITC es para ingresos de menos de ${income}. Con un hijo menor de 6 años, sume hasta ${yctc} (Crédito Tributario por Hijos Menores). Jóvenes de 18 a 25 años que estuvieron en cuidado de crianza temporal: hasta ${fytc} más. El EITC federal necesita número de Seguro Social; los créditos de California también aceptan el ITIN.`,
  stateTitle: "Los créditos de California (SSN o ITIN)",
  fedTitle: "Créditos federales y las nuevas reglas",
  itinTitle: "ITIN: un número de impuestos sin número de Seguro Social",
  itinPlacesTitle: "Ayuda con el ITIN cerca de usted",
  privacyTitle: "Su información y la inmigración",
  refundsTitle: "Cuándo llega su reembolso",
  scamsTitle: "Evite las estafas de impuestos",
  legalButton: "Encuentre ayuda legal de inmigración gratis",
  notAdvice: "Es información general, no asesoría de impuestos ni legal. Un sitio de impuestos gratis puede revisar su caso.",
};

export const TAXES_COPY: Record<Lang, TaxesCopy> = { en, es };
