// Where the Help panel opens. Kept free of React so the URL code can use it.

export type HelpTab = "medical" | "rent" | "work" | "benefits" | "immigration" | "legal";
export const HELP_TABS: HelpTab[] = ["medical", "rent", "work", "benefits", "immigration", "legal"];

/** The tools inside the tabs that have more than one (the chips under the tabs). */
export const MEDICAL_VIEWS = ["bills", "clinics"] as const;
export const RENT_VIEWS = ["rent", "eviction", "repairs", "deposit", "mobile"] as const;
export const WORK_VIEWS = ["wages", "heat"] as const;
export const BENEFITS_VIEWS = ["screener", "medi-cal", "taxes", "utilities"] as const;
export const IMMIGRATION_VIEWS = ["rights", "citizenship", "plan", "daca", "court"] as const;
export type MedicalView = (typeof MEDICAL_VIEWS)[number];
export type RentView = (typeof RENT_VIEWS)[number];
export type WorkView = (typeof WORK_VIEWS)[number];
export type BenefitsView = (typeof BENEFITS_VIEWS)[number];
export type ImmigrationView = (typeof IMMIGRATION_VIEWS)[number];
export type HelpView = MedicalView | RentView | WorkView | BenefitsView | ImmigrationView;

const VIEWS: Partial<Record<HelpTab, readonly string[]>> = { medical: MEDICAL_VIEWS, rent: RENT_VIEWS, work: WORK_VIEWS, benefits: BENEFITS_VIEWS, immigration: IMMIGRATION_VIEWS };

export interface HelpTarget {
  tab: HelpTab;
  /** Medical, Rent, Work, Benefits or Immigration: which tool to show (each tab's first one by default). */
  view?: HelpView;
  /** Medical: preselect this hospital (id from hospitals.ts). */
  hospitalId?: string;
}

export function isHelpTab(v: unknown): v is HelpTab {
  return typeof v === "string" && (HELP_TABS as string[]).includes(v);
}

/** Is `v` one of the tools inside `tab`? */
export function isHelpView(tab: HelpTab, v: unknown): v is HelpView {
  return typeof v === "string" && (VIEWS[tab] ?? []).includes(v);
}

export const isMedicalView = (v: unknown): v is MedicalView => isHelpView("medical", v);
export const isRentView = (v: unknown): v is RentView => isHelpView("rent", v);
export const isWorkView = (v: unknown): v is WorkView => isHelpView("work", v);
export const isBenefitsView = (v: unknown): v is BenefitsView => isHelpView("benefits", v);
export const isImmigrationView = (v: unknown): v is ImmigrationView => isHelpView("immigration", v);
