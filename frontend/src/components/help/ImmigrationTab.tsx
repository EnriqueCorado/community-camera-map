import { useState } from "react";
import type { HelpCopy } from "../../help/copy";
import type { ImmigrationView } from "../../help/target";
import { RightsTool } from "./RightsTool";
import { CivicsTool } from "./CivicsTool";
import { FamilyPlanTool, useFamilyPlan } from "./FamilyPlanTool";
import { DacaTool } from "./DacaTool";
import "./civics.css";

/** Immigration tab: know your rights with immigration agents, citizenship test
 *  practice, a family emergency plan, and DACA renewal timing. The plan's answers
 *  live here, so they survive switching views, and are erased when the tab closes. */
export function ImmigrationTab({ c, view, onView, onLegal }: { c: HelpCopy; view: ImmigrationView; onView: (v: ImmigrationView) => void; onLegal: () => void }) {
  const [plan, setPlan] = useFamilyPlan();
  // Set when a link in another view opens the plan, so focus follows the reader.
  const [linked, setLinked] = useState(false);
  const views: [ImmigrationView, string][] = [
    ["rights", c.immigrationViewRights],
    ["citizenship", c.immigrationViewCitizenship],
    ["plan", c.immigrationViewPlan],
    ["daca", c.immigrationViewDaca],
  ];
  const go = (v: ImmigrationView, fromLink = false) => {
    setLinked(fromLink);
    onView(v);
  };
  return (
    <>
      <div className="hsub" role="group" aria-label={c.immigrationViewLabel}>
        {views.map(([v, label]) => (
          <button key={v} type="button" className={`chip${view === v ? " chip--on" : ""}`} aria-pressed={view === v} onClick={() => go(v)}>
            {label}
          </button>
        ))}
      </div>
      {view === "rights" ? (
        <RightsTool c={c} onLegal={onLegal} onPlan={() => go("plan", true)} focusTitle={linked} />
      ) : view === "citizenship" ? (
        <CivicsTool c={c} />
      ) : view === "daca" ? (
        <DacaTool c={c} onLegal={onLegal} />
      ) : (
        <FamilyPlanTool c={c} plan={plan} setPlan={setPlan} onLegal={onLegal} onRights={() => go("rights", true)} focusTitle={linked} />
      )}
    </>
  );
}
