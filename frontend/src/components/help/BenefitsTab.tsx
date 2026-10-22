import type { HelpCopy } from "../../help/copy";
import type { BenefitsView } from "../../help/target";
import { BenefitsHelp } from "./BenefitsHelp";
import { MediCalWorkTool } from "./MediCalWorkTool";

/** Benefits tab: the benefits screener, and Medi-Cal's 2027 work rules. */
export function BenefitsTab({ c, view, onView }: { c: HelpCopy; view: BenefitsView; onView: (v: BenefitsView) => void }) {
  const views: [BenefitsView, string][] = [
    ["screener", c.benefitsViewScreener],
    ["medi-cal", c.benefitsViewWork],
  ];
  return (
    <>
      <div className="hsub" role="group" aria-label={c.benefitsViewLabel}>
        {views.map(([v, label]) => (
          <button key={v} type="button" className={`chip${view === v ? " chip--on" : ""}`} aria-pressed={view === v} onClick={() => onView(v)}>
            {label}
          </button>
        ))}
      </div>
      {view === "screener" ? <BenefitsHelp c={c} /> : <MediCalWorkTool c={c} />}
    </>
  );
}
