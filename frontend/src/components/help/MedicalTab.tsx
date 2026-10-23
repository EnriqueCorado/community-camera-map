import { lazy, Suspense } from "react";
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
  const views: [MedicalView, string][] = [
    ["bills", c.medicalViewBills],
    ["clinics", c.medicalViewClinics],
  ];
  return (
    <>
      <div className="hsub" role="group" aria-label={c.medicalViewLabel}>
        {views.map(([v, label]) => (
          <button key={v} type="button" className={`chip${view === v ? " chip--on" : ""}`} aria-pressed={view === v} onClick={() => onView(v)}>
            {label}
          </button>
        ))}
      </div>
      {view === "bills" ? (
        <MedicalHelp c={c} hospitalId={hospitalId} onShowOnMap={onShowOnMap} />
      ) : (
        <Suspense
          fallback={
            <p className="hf__hint" role="status">
              {c.loading}
            </p>
          }
        >
          <ClinicsTool c={c} onShowOnMap={onShowOnMap} onBills={() => onView("bills")} />
        </Suspense>
      )}
    </>
  );
}
