// Every date by which a Help tool fact needs a human to re-check or update
// it, gathered from the facts files themselves (so a new table or period is
// tracked without editing this list). e2e/tests/unit-upkeep.spec.ts fails when
// one is overdue; the weekly help-links workflow opens an issue 45 days ahead.
import { LEGAL_FACTS, MEDICAL_FACTS, RENT_FACTS } from "./facts";
import { EVICTION_FACTS } from "./eviction-facts";
import { AB747_FROM } from "./eviction";
import { COURT_HOLIDAYS_SOURCE, COVERED_TO } from "./court-days";
import { LAB_226_7_RECHECK, MIN_WAGE, WAGE_FACTS } from "./wages-facts";
import { HEAT_FACTS, LAB_226_7_RECHECK as HEAT_226_7_RECHECK } from "./heat-facts";
import { BENEFITS_CHECKED, TABLES, TAX, type IncomeTable } from "./benefits-facts";
import { MCW_CHECKED, MCW_IMMIGRANT_RECHECK, MCW_RECHECK } from "./medi-cal-work-facts";
import { RIGHTS_CHECKED, RIGHTS_RECHECK } from "./rights-facts";
import { CIVICS_CHECKED, CIVICS_OFFICIALS_RECHECK } from "./civics-facts";
import { addDays } from "./dates";

export interface UpkeepItem {
  id: string;
  /** The first day the facts are out of date (ISO). */
  due: string;
  /** What to do, in a sentence. */
  task: string;
  /** Where the new figures come from. */
  source?: string;
}

/** Facts are re-read at least once a year, even when no figure changes (the
 *  unit tests fail once a "checked" date is 366 days old). */
const YEARLY = 366;
/** unit-eviction.spec.ts wants the holiday table to reach 60+ days ahead. */
const HOLIDAY_LEAD = 60;

const after = (iso: string, days: number) => {
  const d = addDays(iso, days);
  if (!d) throw new Error(`upkeep: bad date "${iso}"`);
  return d;
};

export function upkeepItems(): UpkeepItem[] {
  const lastCap = RENT_FACTS.periods.reduce((a, b) => (a.to > b.to ? a : b));
  const lastWageYear = Math.max(...MIN_WAGE.map((m) => m.year));
  const items: UpkeepItem[] = [
    {
      id: "rent-cap",
      due: after(lastCap.to, 1),
      task: "Add the next Aug–Jul rent cap to RENT_FACTS.periods (DIR's April California CPI, out mid-June; cross-check the AG's “All other counties” line).",
      source: "https://oag.ca.gov/rentcaps",
    },
    {
      id: "poverty-guidelines",
      due: `${MEDICAL_FACTS.fpl.year + 1}-03-01`,
      task: "Update MEDICAL_FACTS.fpl to this year's HHS poverty guidelines (published each January).",
      source: MEDICAL_FACTS.fpl.source,
    },
    {
      id: "minimum-wage",
      due: `${lastWageYear + 1}-01-01`,
      task: `Add the ${lastWageYear + 1} California minimum wage to MIN_WAGE (DIR announces it each August).`,
      source: "https://www.dir.ca.gov/dlse/minimum_wage.htm",
    },
    {
      id: "court-holidays",
      due: after(COVERED_TO, -HOLIDAY_LEAD),
      task: `Add the next year's Judicial Council court holidays to court-days.ts and move COVERED_TO (the table must reach ${HOLIDAY_LEAD}+ days ahead).`,
      source: COURT_HOLIDAYS_SOURCE.url,
    },
    {
      id: "lab-226-7",
      // The same date is kept in wages-facts.ts and heat-facts.ts; the earlier one counts.
      due: LAB_226_7_RECHECK < HEAT_226_7_RECHECK ? LAB_226_7_RECHECK : HEAT_226_7_RECHECK,
      task: "Re-read Labor Code §226.7 (version operative 2027-01-01), update the break-premium facts, then move LAB_226_7_RECHECK in wages-facts.ts and heat-facts.ts.",
    },
    {
      id: "ab-747",
      due: AB747_FROM,
      task: "Confirm the AB 747 service rules (CCP §415.20, §415.45) and teach eviction.ts to count those cases again, then move AB747_FROM.",
    },
    {
      id: "tax-credits",
      due: after(TAX.recheckBy, 1),
      task: `Post the tax year ${TAX.year + 1} CalEITC, YCTC and federal EITC figures (TAX in benefits-facts.ts).`,
    },
    {
      id: "medi-cal-work-start",
      due: MCW_RECHECK,
      task: "Before Medi-Cal's work rules start: check Massachusetts v. Oz (D. Mass.) for a ruling on CMS's rule, new DHCS county letters (medically frail list, verification), and when current members are first checked (DHCS: March 2027); update medi-cal-work-facts.ts and move MCW_RECHECK.",
      source: "https://www.dhcs.ca.gov/medi-cal/updates/medi-cal-changes/",
    },
    {
      id: "medi-cal-immigrants-2027",
      due: MCW_IMMIGRANT_RECHECK,
      task: "Update the state-funded Medi-Cal premium amount (2027-28 May Revision) and the July 1, 2027 changes (dental, refugees' state coverage) in medi-cal-work-facts.ts, then move MCW_IMMIGRANT_RECHECK.",
      source: "https://www.dhcs.ca.gov/medi-cal/updates/medi-cal-changes/",
    },
    {
      id: "rights-monthly",
      due: RIGHTS_RECHECK,
      task: "Monthly re-check of the know-your-rights page (ICE warrant memo case, SB 627/SB 805/AB 450 rulings, ICE locator, hotline still live, detention centers); update rights-facts.ts and move RIGHTS_RECHECK a month ahead.",
      source: "https://www.ilrc.org/community-resources/know-your-rights",
    },
    {
      id: "civics-officials",
      due: CIVICS_OFFICIALS_RECHECK,
      task: "Update the citizenship test's current officials (new governor 2027-01-04; Speaker and the new congressional districts 2027-01-03) in make_civics.py, and USCIS's official Spanish name lists (#30, #38, #39, #57) in research/civics-es-study.json from uscis.gov/es; regenerate civics-questions.ts and move CIVICS_OFFICIALS_RECHECK.",
      source: "https://www.uscis.gov/citizenship/testupdates",
    },
    ...(Object.entries(TABLES) as [string, IncomeTable][]).map(([id, t]) => ({
      id: `benefits-${id}`,
      due: after(t.graceUntil ?? t.to, 1),
      task: `${t.toIsRecheck ? "Re-check" : "Update"} the ${id} income limits in benefits-facts.ts TABLES (${t.toIsRecheck ? "re-check date" : "period ends"} ${t.to}).`,
      source: t.source.url,
    })),
    ...(
      [
        ["renters", RENT_FACTS.checked],
        ["legal-aid", LEGAL_FACTS.checked],
        ["medical", MEDICAL_FACTS.checked],
        ["eviction", EVICTION_FACTS.checked],
        ["wages", WAGE_FACTS.checked],
        ["heat", HEAT_FACTS.checked],
        ["benefits", BENEFITS_CHECKED],
        ["medi-cal-work", MCW_CHECKED],
        ["know-your-rights", RIGHTS_CHECKED],
        ["citizenship", CIVICS_CHECKED],
      ] as const
    ).map(([id, checked]) => ({
      id: `yearly-${id}`,
      due: after(checked, YEARLY),
      task: `Yearly re-check of the ${id} facts, phone numbers and links (last checked ${checked}); then update its “checked” date.`,
    })),
  ];
  return items.sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
}

/** Items whose due date is on or before `today + withinDays`. */
export function dueSoon(items: readonly UpkeepItem[], today: string, withinDays: number): UpkeepItem[] {
  const horizon = after(today, withinDays);
  return items.filter((i) => i.due <= horizon);
}
