import { useState } from "react";
import type { HelpCopy } from "../../help/copy";
import { WagesTool } from "./WagesTool";
import { HeatTool } from "./HeatTool";

type View = "wages" | "heat";

/** Work tab: unpaid wages, and today's heat rules. */
export function WorkHelp({ c, onLegal }: { c: HelpCopy; onLegal: () => void }) {
  const [view, setView] = useState<View>("wages");
  const views: [View, string][] = [
    ["wages", c.workViewWages],
    ["heat", c.workViewHeat],
  ];
  return (
    <>
      <div className="hsub" role="group" aria-label={c.workViewLabel}>
        {views.map(([v, label]) => (
          <button key={v} type="button" className={`chip${view === v ? " chip--on" : ""}`} aria-pressed={view === v} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </div>
      {view === "wages" ? <WagesTool c={c} onLegal={onLegal} /> : <HeatTool c={c} />}
    </>
  );
}
