import type { HelpCopy } from "../../help/copy";
import { WagesTool } from "./WagesTool";
import { HeatTool } from "./HeatTool";

import type { WorkView } from "../../help/target";

/** Work tab: unpaid wages, and today's heat rules. */
export function WorkHelp({ c, view, onView, onLegal }: { c: HelpCopy; view: WorkView; onView: (v: WorkView) => void; onLegal: () => void }) {
  const views: [WorkView, string][] = [
    ["wages", c.workViewWages],
    ["heat", c.workViewHeat],
  ];
  return (
    <>
      <div className="hsub" role="group" aria-label={c.workViewLabel}>
        {views.map(([v, label]) => (
          <button key={v} type="button" className={`chip${view === v ? " chip--on" : ""}`} aria-pressed={view === v} onClick={() => onView(v)}>
            {label}
          </button>
        ))}
      </div>
      {view === "wages" ? <WagesTool c={c} onLegal={onLegal} /> : <HeatTool c={c} />}
    </>
  );
}
