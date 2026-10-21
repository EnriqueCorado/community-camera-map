// Where the Help panel opens. Kept free of React so the URL code can use it.

export type HelpTab = "medical" | "rent" | "work" | "benefits" | "legal";
export const HELP_TABS: HelpTab[] = ["medical", "rent", "work", "benefits", "legal"];

export interface HelpTarget {
  tab: HelpTab;
  /** Medical: preselect this hospital (id from hospitals.ts). */
  hospitalId?: string;
  /** Renters: open the mobile home (space rent) path. */
  mobileHome?: boolean;
  /** Renters: open the eviction-notice deadline helper. */
  eviction?: boolean;
  /** Work: open the heat-safety card instead of unpaid wages. */
  heat?: boolean;
}

export function isHelpTab(v: unknown): v is HelpTab {
  return typeof v === "string" && (HELP_TABS as string[]).includes(v);
}
