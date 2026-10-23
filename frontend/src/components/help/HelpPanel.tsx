// Free help: hospital bills, renters' rights, legal aid. A modal over the map
// (full screen on phones). Nothing typed here is stored or sent anywhere:
// state lives in these components and is gone when the panel closes. (When
// the usage counter is on, only "this tool was opened" is sent: help/count.ts.)
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "./help.css";
import { useI18n } from "../../i18n";
import { useDialog } from "../../hooks/useDialog";
import { COPY } from "../../help/copy";
import { isBenefitsView, isImmigrationView, isMedicalView, isRentView, isWorkView, type HelpTab, type HelpTarget } from "../../help/target";
import { appCountId, countEvent, mayCount, sendCount } from "../../help/count";
import { Tabs } from "./Tabs";
import { StartChooser } from "./StartChooser";
import { ShareLinks } from "./Share";
import { pageFor, pagePath } from "../../help/start";

// The anonymous usage counter (help/count.ts); empty = off. Each tool counts
// once per page load, however often it's reopened.
const COUNTER_URL = import.meta.env.VITE_COUNTER_URL ?? "";
const counted = new Set<string>();

// Each tab is its own download, fetched the first time it's opened: most
// visitors need one tool, often on a slow phone connection.
const MedicalTab = lazy(() => import("./MedicalTab").then((m) => ({ default: m.MedicalTab })));
const RenterHelp = lazy(() => import("./RenterHelp").then((m) => ({ default: m.RenterHelp })));
const WorkHelp = lazy(() => import("./WorkHelp").then((m) => ({ default: m.WorkHelp })));
const BenefitsTab = lazy(() => import("./BenefitsTab").then((m) => ({ default: m.BenefitsTab })));
const ImmigrationTab = lazy(() => import("./ImmigrationTab").then((m) => ({ default: m.ImmigrationTab })));
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
  // Once opened, the Immigration tab stays mounted (hidden when another tab is
  // shown), so a family plan being typed survives a look at another tool. It's
  // still erased when the panel closes or the page is left.
  const [keepImmigration, setKeepImmigration] = useState(false);
  if (target.tab === "immigration" && !keepImmigration) setKeepImmigration(true);

  const countId = appCountId(target);
  useEffect(() => {
    const event = countEvent("app", countId, lang);
    if (!COUNTER_URL || counted.has(event) || !mayCount(navigator)) return;
    counted.add(event);
    sendCount(COUNTER_URL, event);
  }, [countId, lang]);

  const tabs: { id: HelpTab; label: string }[] = [
    { id: "medical", label: c.tabMedical },
    { id: "rent", label: c.tabRent },
    { id: "work", label: c.tabWork },
    { id: "benefits", label: c.tabBenefits },
    { id: "immigration", label: c.tabImmigration },
    { id: "legal", label: c.tabLegal },
  ];
  const go = (t: HelpTarget) => {
    onTarget(t);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  // Share the public page for the tool that's open (it works without the map app).
  const page = pageFor(target);
  const shareUrl = page ? new URL(`${import.meta.env.BASE_URL}${pagePath(lang, page)}`, window.location.origin).href : null;

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
          <StartChooser
            onChoose={(t) => {
              go(t);
              bodyRef.current?.focus();
            }}
          />
          <Suspense
            fallback={
              <p className="hf__hint" role="status">
                {c.loading}
              </p>
            }
          >
            {target.tab === "medical" && (
              <MedicalTab
                c={c}
                view={isMedicalView(target.view) ? target.view : "bills"}
                onView={(view) => onTarget({ tab: "medical", view })}
                hospitalId={target.hospitalId}
                onShowOnMap={onShowOnMap}
              />
            )}
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
                onLegal={() => go({ tab: "legal" })}
              />
            )}
            {keepImmigration && (
              <div hidden={target.tab !== "immigration"}>
                <ImmigrationTab
                  c={c}
                  view={isImmigrationView(target.view) ? target.view : "rights"}
                  onView={(view) => onTarget({ tab: "immigration", view })}
                  onLegal={() => go({ tab: "legal" })}
                />
              </div>
            )}
            {target.tab === "legal" && <LegalHelp c={c} onShowOnMap={onShowOnMap} />}
          </Suspense>
          {shareUrl && <ShareLinks key={shareUrl} url={shareUrl} title={c.title} newTab={c.newTab} />}
          <p className="hdisclaimer">{c.disclaimer}</p>
          {COUNTER_URL && <p className="hdisclaimer">{c.countNote}</p>}
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
