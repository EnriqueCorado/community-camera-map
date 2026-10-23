import { lazy, Suspense, useState } from "react";
import type { HelpCopy } from "../../help/copy";
import type { ImmigrationView } from "../../help/target";
import { RightsTool } from "./RightsTool";
import { useFamilyPlan } from "./useFamilyPlan";
import "./civics.css";

// The bigger tools load only when opened (the civics list alone is ~60 KB).
const CivicsTool = lazy(() => import("./CivicsTool").then((m) => ({ default: m.CivicsTool })));
const FamilyPlanTool = lazy(() => import("./FamilyPlanTool").then((m) => ({ default: m.FamilyPlanTool })));
const DacaTool = lazy(() => import("./DacaTool").then((m) => ({ default: m.DacaTool })));
const CourtTool = lazy(() => import("./CourtTool").then((m) => ({ default: m.CourtTool })));

/** Immigration tab: know your rights with immigration agents, citizenship test
 *  practice, a family emergency plan, DACA renewal timing, and immigration court. The plan's answers
 *  live here, so they survive switching views, and are erased when the tab closes. */
export function ImmigrationTab({ c, view, onView, onLegal }: { c: HelpCopy; view: ImmigrationView; onView: (v: ImmigrationView) => void; onLegal: () => void }) {
  const [plan, setPlan] = useFamilyPlan();
  // The view a link in another view just opened, so focus follows the reader
  // there (and only there: not when the chooser or a chip opens a view later).
  const [linked, setLinked] = useState<ImmigrationView | null>(null);
  const views: [ImmigrationView, string][] = [
    ["rights", c.immigrationViewRights],
    ["citizenship", c.immigrationViewCitizenship],
    ["plan", c.immigrationViewPlan],
    ["daca", c.immigrationViewDaca],
    ["court", c.immigrationViewCourt],
  ];
  const go = (v: ImmigrationView, fromLink = false) => {
    setLinked(fromLink ? v : null);
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
      <Suspense
        fallback={
          <p className="hf__hint" role="status">
            {c.loading}
          </p>
        }
      >
        {view === "rights" ? (
          <RightsTool c={c} onLegal={onLegal} onPlan={() => go("plan", true)} onCourt={() => go("court", true)} focusTitle={linked === "rights"} />
        ) : view === "citizenship" ? (
          <CivicsTool c={c} />
        ) : view === "daca" ? (
          <DacaTool c={c} onLegal={onLegal} onCourt={() => go("court", true)} />
        ) : view === "court" ? (
          <CourtTool c={c} onLegal={onLegal} onPlan={() => go("plan", true)} focusTitle={linked === "court"} />
        ) : (
          <FamilyPlanTool c={c} plan={plan} setPlan={setPlan} onLegal={onLegal} onRights={() => go("rights", true)} focusTitle={linked === "plan"} />
        )}
      </Suspense>
    </>
  );
}
