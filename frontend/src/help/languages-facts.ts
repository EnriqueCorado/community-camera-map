// Facts behind the pages in other languages (Punjabi, Dari): the phone lines
// that say they give an interpreter, and ILRC's red cards in those languages.
// Only lines whose own page states language help are listed; the research is
// in ~/dev/outreach-help-2026-10/research/languages.{md,json}.
import type { SourceRef } from "../components/help/ui";

/** When the lines and links below were last checked. */
export const LANGUAGES_CHECKED = "2026-10-22";
/** The translations are AI-assisted: a native speaker should check them by
 *  this date (the "not yet reviewed" note stays until then). */
export const LANGUAGES_REVIEW_BY = "2027-01-22";
/** Where readers send corrections (a plain mailto link, nothing tracked). */
export const CORRECTIONS_EMAIL = "enrique@enriquecorado.com";

export type LineId = "labor" | "crla" | "csa" | "court" | "coveredFarsi" | "irc" | "worldRelief";

export interface Line {
  phone: string;
  address?: string;
  /** The page that states the language help (or, for newcomer agencies, the services). */
  url: string;
}

export const LINES: Record<LineId, Line> = {
  // "Phone interpreter services are available" (DIR, How to file a wage claim).
  labor: { phone: "833-526-4636", url: "https://www.dir.ca.gov/dlse/howtofilewageclaim.htm" },
  // "CRLA will provide an interpreter free of charge." (crla.org/locations)
  crla: { phone: "(209) 577-3811", address: "1020 15th Street, Suite 22, Modesto", url: "https://crla.org/locations" },
  // Counties must have free, competent interpreters (MPP 21-115.15; ACL 24-68), per LSNC's CalFresh guide.
  csa: { phone: "1-877-652-0734", url: "https://calfresh.guide/people-who-do-not-speak-english/" },
  // Interpreters for all case types; request with form INT-300 30 days ahead. (Cost isn't stated, so not claimed.)
  court: { phone: "(209) 530-3247", address: "800 11th Street, Modesto", url: "https://stanislaus.courts.ca.gov/general-information/interpreter-information" },
  // "فارسی (Farsi) (800) 921-8879". No Punjabi, Dari or Pashto line is listed.
  coveredFarsi: { phone: "(800) 921-8879", url: "https://www.coveredca.com/support/contact-us/" },
  // Newcomer help (refugees, SIV holders, humanitarian parolees). No language is named, so none is claimed.
  irc: { phone: "(209) 667-2378", address: "3446 N Golden State Blvd, Suite A, Turlock", url: "https://www.rescue.org/united-states/turlock-ca" },
  worldRelief: { phone: "(209) 491-2712", address: "909 14th Street, Modesto", url: "https://worldrelief.org/modesto/" },
};

/** ILRC red cards (the English side is what the agent reads). */
export const RED_CARD_PDFS = {
  page: "https://www.ilrc.org/red-cards",
  punjabi: "https://www.ilrc.org/sites/default/files/2025-03/Artwork%20for%20Printing%20Your%20Own%20Red%20Cards%20-%20Punjabi.pdf",
  dari: "https://www.ilrc.org/sites/default/files/2025-06/Artwork%20for%20Printing%20Your%20Own%20Red%20Cards%20-%20Dari.pdf",
  farsi: "https://www.ilrc.org/sites/default/files/2025-09/Artwork-for-Printing-Your-Own-Red-Cards-Farsi.pdf",
  pashto: "https://www.ilrc.org/sites/default/files/2024-12/Artwork%20for%20Printing%20Your%20Own%20Red%20Cards%20-%20Pashto.pdf",
} as const;

const SOURCE: Record<LineId, string> = {
  labor: "California Labor Commissioner, How to file a wage claim (phone interpreters)",
  crla: "CRLA, Locations (free interpreter)",
  csa: "LSNC CalFresh Policy Guide, People who do not speak English (MPP 21-115.15, ACL 24-68)",
  court: "Superior Court of Stanislaus County, Interpreter information",
  coveredFarsi: "Covered California, Contact us (language lines)",
  irc: "International Rescue Committee, Turlock",
  worldRelief: "World Relief Modesto",
};

/** Sources for a page that lists `lines`. */
export function languageSources(lines: readonly LineId[]): SourceRef[] {
  return [
    ...lines.map((id) => ({ label: SOURCE[id], url: LINES[id].url })),
    { label: "Immigrant Legal Resource Center (ILRC), Red Cards (59 languages)", url: RED_CARD_PDFS.page },
  ];
}
