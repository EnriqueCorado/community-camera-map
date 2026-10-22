import type { HelpCopy } from "../../help/copy";
import type { ImmigrationView } from "../../help/target";
import { RightsTool } from "./RightsTool";
import { CivicsTool } from "./CivicsTool";
import "./civics.css";

/** Immigration tab: know your rights with immigration agents, and citizenship test practice. */
export function ImmigrationTab({ c, view, onView, onLegal }: { c: HelpCopy; view: ImmigrationView; onView: (v: ImmigrationView) => void; onLegal: () => void }) {
  const views: [ImmigrationView, string][] = [
    ["rights", c.immigrationViewRights],
    ["citizenship", c.immigrationViewCitizenship],
  ];
  return (
    <>
      <div className="hsub" role="group" aria-label={c.immigrationViewLabel}>
        {views.map(([v, label]) => (
          <button key={v} type="button" className={`chip${view === v ? " chip--on" : ""}`} aria-pressed={view === v} onClick={() => onView(v)}>
            {label}
          </button>
        ))}
      </div>
      {view === "rights" ? <RightsTool c={c} onLegal={onLegal} /> : <CivicsTool c={c} />}
    </>
  );
}
