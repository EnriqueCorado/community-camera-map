// Free help: hospital bills, renters' rights, legal aid. A modal over the map
// (full screen on phones). Nothing typed here is stored or sent anywhere:
// state lives in these components and is gone when the panel closes.
import { lazy, Suspense, useRef } from "react";
import "./help.css";
import { useI18n } from "../../i18n";
import { useDialog } from "../../hooks/useDialog";
import { COPY } from "../../help/copy";
import { isBenefitsView, isRentView, isWorkView, type HelpTab, type HelpTarget } from "../../help/target";
import { Tabs } from "./Tabs";

// Each tab is its own download, fetched the first time it's opened: most
// visitors need one tool, often on a slow phone connection.
const MedicalHelp = lazy(() => import("./MedicalHelp").then((m) => ({ default: m.MedicalHelp })));
const RenterHelp = lazy(() => import("./RenterHelp").then((m) => ({ default: m.RenterHelp })));
const WorkHelp = lazy(() => import("./WorkHelp").then((m) => ({ default: m.WorkHelp })));
const BenefitsTab = lazy(() => import("./BenefitsTab").then((m) => ({ default: m.BenefitsTab })));
const LegalHelp = lazy(() => import("./LegalHelp").then((m) => ({ default: m.LegalHelp })));

interface Props {
  target: HelpTarget;
  onTarget: (t: HelpTarget) => void;
  onClose: () => void;
  /** Turn a map layer on (and optionally fly to a point), closing the panel. */
  onShowOnMap: (layer: string, center?: [number, number]) => void;
}

export default function HelpPanel({ target, onTarget, onClose, onShowOnMap }: Props) {
  const { lang } = useI18n();
  const c = COPY[lang];
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, { modal: true });

  const tabs: { id: HelpTab; label: string }[] = [
    { id: "medical", label: c.tabMedical },
    { id: "rent", label: c.tabRent },
    { id: "work", label: c.tabWork },
    { id: "benefits", label: c.tabBenefits },
    { id: "legal", label: c.tabLegal },
  ];
  const go = (t: HelpTarget) => {
    onTarget(t);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  return (
    <div
      className="help"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="help__card" role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1}>
        <div className="help__bar">
          <div>
            <h2 id="help-title">{c.title}</h2>
            <p className="help__privacy">
              <strong>{c.privacyStrong}</strong> {c.privacy}
            </p>
          </div>
          <button type="button" className="detail__close" onClick={onClose} aria-label={c.close}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <Tabs label={c.title} tabs={tabs} value={target.tab} onChange={(tab) => go({ tab })} idPrefix="help" />
        <div
          ref={bodyRef}
          className="help__body"
          role="tabpanel"
          id={`help-panel-${target.tab}`}
          aria-labelledby={`help-tab-${target.tab}`}
          tabIndex={0}
        >
          <Suspense
            fallback={
              <p className="hf__hint" role="status">
                {c.loading}
              </p>
            }
          >
            {target.tab === "medical" && <MedicalHelp c={c} hospitalId={target.hospitalId} onShowOnMap={onShowOnMap} />}
            {target.tab === "rent" && (
              <RenterHelp
                c={c}
                view={isRentView(target.view) ? target.view : "rent"}
                onView={(view) => onTarget({ tab: "rent", view })}
                onLegal={() => go({ tab: "legal" })}
              />
            )}
            {target.tab === "work" && (
              <WorkHelp
                c={c}
                view={isWorkView(target.view) ? target.view : "wages"}
                onView={(view) => onTarget({ tab: "work", view })}
                onLegal={() => go({ tab: "legal" })}
              />
            )}
            {target.tab === "benefits" && (
              <BenefitsTab
                c={c}
                view={isBenefitsView(target.view) ? target.view : "screener"}
                onView={(view) => onTarget({ tab: "benefits", view })}
              />
            )}
            {target.tab === "legal" && <LegalHelp c={c} onShowOnMap={onShowOnMap} />}
          </Suspense>
          <p className="hdisclaimer">{c.disclaimer}</p>
          <p className="hdisclaimer">
            {/* A new tab, so leaving for the flyers doesn't erase what was typed here. */}
            <a href={`${import.meta.env.BASE_URL}help/flyers/`} target="_blank" rel="noopener">
              {c.flyers}
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> ({c.newTab})</span>
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
