import type { HelpCopy } from "../../help/copy";
import type { BenefitsView } from "../../help/target";
import { BenefitsHelp } from "./BenefitsHelp";
import { MediCalWorkTool } from "./MediCalWorkTool";
import { TaxesTool } from "./TaxesTool";

/** Benefits tab: the benefits screener, Medi-Cal's 2027 work rules, and free tax help. */
export function BenefitsTab({
  c,
  view,
  onView,
  onLegal,
}: {
  c: HelpCopy;
  view: BenefitsView;
  onView: (v: BenefitsView) => void;
  onLegal: () => void;
}) {
  const views: [BenefitsView, string][] = [
    ["screener", c.benefitsViewScreener],
    ["medi-cal", c.benefitsViewWork],
    ["taxes", c.benefitsViewTaxes],
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
      {view === "screener" && <BenefitsHelp c={c} />}
      {view === "medi-cal" && <MediCalWorkTool c={c} />}
      {view === "taxes" && <TaxesTool c={c} onLegal={onLegal} />}
    </>
  );
}
