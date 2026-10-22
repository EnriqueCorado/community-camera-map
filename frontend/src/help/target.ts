// Where the Help panel opens. Kept free of React so the URL code can use it.

export type HelpTab = "medical" | "rent" | "work" | "benefits" | "legal";
export const HELP_TABS: HelpTab[] = ["medical", "rent", "work", "benefits", "legal"];

/** The tools inside the tabs that have more than one (the chips under the tabs). */
export const RENT_VIEWS = ["rent", "eviction", "repairs", "deposit", "mobile"] as const;
export const WORK_VIEWS = ["wages", "heat"] as const;
export type RentView = (typeof RENT_VIEWS)[number];
export type WorkView = (typeof WORK_VIEWS)[number];
export type HelpView = RentView | WorkView;

const VIEWS: Partial<Record<HelpTab, readonly string[]>> = { rent: RENT_VIEWS, work: WORK_VIEWS };

export interface HelpTarget {
  tab: HelpTab;
  /** Rent or Work: which tool to show (each tab's first one by default). */
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

export const isRentView = (v: unknown): v is RentView => isHelpView("rent", v);
export const isWorkView = (v: unknown): v is WorkView => isHelpView("work", v);
