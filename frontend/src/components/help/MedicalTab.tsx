import { lazy, Suspense, useState } from "react";
import type { HelpCopy } from "../../help/copy";
import type { MedicalView } from "../../help/target";
import { MedicalHelp } from "./MedicalHelp";

// The clinic list loads only when opened.
const ClinicsTool = lazy(() => import("./ClinicsTool").then((m) => ({ default: m.ClinicsTool })));

/** Medical tab: help with a hospital bill, and free and low-cost clinics. */
export function MedicalTab({
  c,
  view,
  onView,
  hospitalId,
  onShowOnMap,
}: {
  c: HelpCopy;
  view: MedicalView;
  onView: (v: MedicalView) => void;
  /** Preselect this hospital in the bill tool (from a map popup). */
  hospitalId?: string;
  onShowOnMap: (layer: string, center?: [number, number]) => void;
}) {
  // The view a link in another view just opened, so focus follows the reader there.
  const [linked, setLinked] = useState<MedicalView | null>(null);
  const go = (v: MedicalView, fromLink = false) => {
    setLinked(fromLink ? v : null);
    onView(v);
  };
  const views: [MedicalView, string][] = [
    ["bills", c.medicalViewBills],
    ["clinics", c.medicalViewClinics],
  ];
  return (
    <>
      <div className="hsub" role="group" aria-label={c.medicalViewLabel}>
        {views.map(([v, label]) => (
          <button key={v} type="button" className={`chip${view === v ? " chip--on" : ""}`} aria-pressed={view === v} onClick={() => go(v)}>
            {label}
          </button>
        ))}
      </div>
      {view === "bills" ? (
        <MedicalHelp c={c} hospitalId={hospitalId} onShowOnMap={onShowOnMap} focusTitle={linked === "bills"} />
      ) : (
        <Suspense
          fallback={
            <p className="hf__hint" role="status">
              {c.loading}
            </p>
          }
        >
          <ClinicsTool c={c} onShowOnMap={onShowOnMap} onBills={() => go("bills", true)} />
        </Suspense>
      )}
    </>
  );
}
