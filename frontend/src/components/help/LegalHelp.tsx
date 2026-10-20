import { useEffect, useMemo, useState } from "react";
import { useI18n, type Key } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { LEGAL_FACTS } from "../../help/facts";
import { loadOffices, type LegalKind, type LegalOffice } from "../../help/legal-dir";
import { longDate } from "../../help/dates";
import { ExtLink, Phone, Result, Sources } from "./ui";

const KIND_KEYS: Record<LegalKind, Key> = {
  immigration: "kindImmigration",
  housing: "kindHousing",
  general: "kindGeneral",
  seniors: "kindSeniors",
  family: "kindFamily",
  workers: "kindWorkers",
  "court-self-help": "kindCourt",
  consumer: "kindConsumer",
};
const COST_KEYS = { free: "costFree", "low-cost": "costLowCost", varies: "costVaries" } as const;

const KIND_ORDER: LegalKind[] = ["immigration", "housing", "court-self-help", "general", "family", "seniors", "workers", "consumer"];

export function LegalHelp({ c, onShowOnMap }: { c: HelpCopy; onShowOnMap: (layer: string, center?: [number, number]) => void }) {
  const { t, lang, locale } = useI18n();
  const [offices, setOffices] = useState<LegalOffice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<LegalKind | "all">("all");

  useEffect(() => {
    let live = true;
    loadOffices()
      .then((o) => live && setOffices(o))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const kinds = useMemo(() => KIND_ORDER.filter((k) => offices?.some((o) => o.kinds.includes(k))), [offices]);
  const shown = (offices ?? []).filter((o) => kind === "all" || o.kinds.includes(kind));

  return (
    <>
      <p className="help__lead">{c.legalLead}</p>

      <Result tone="warn" title={c.notarioTitle}>
        <p>{c.notarioText}</p>
        <ul>
          {LEGAL_FACTS.verify.map((v) => (
            <li key={v.url}>
              <ExtLink href={v.url} newTab={c.newTab}>
                {v.label[lang]}
              </ExtLink>
            </li>
          ))}
        </ul>
      </Result>

      <h3>{c.legalListTitle}</h3>
      {failed && <p role="alert">{c.legalLoadError}</p>}
      {!offices && !failed && <p role="status">{c.loading}</p>}
      {offices && (
        <>
          <div className="hsub" role="group" aria-label={c.legalFilter}>
            {(["all", ...kinds] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`chip${kind === k ? " chip--on" : ""}`}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k === "all" ? c.legalAll : t(KIND_KEYS[k])}
              </button>
            ))}
          </div>
          <p className="hf__hint" role="status">
            {c.legalCount(shown.length)}
          </p>
          <div className="hgrid">
            {shown.map((o) => (
              <article key={o.id} className="hcard hdir__item" aria-labelledby={`legal-${o.id}`}>
                <h4 id={`legal-${o.id}`}>{o.name}</h4>
                <div className="hdir__tags">
                  <span className={`htag${o.cost === "free" ? " htag--free" : ""}`}>{t(COST_KEYS[o.cost])}</span>
                  {o.eoir && <span className="htag">{t("legalEoir")}</span>}
                  {o.kinds.map((k) => (
                    <span key={k} className="htag">
                      {t(KIND_KEYS[k])}
                    </span>
                  ))}
                </div>
                {o.note[lang] && <p className="hdir__meta">{o.note[lang]}</p>}
                <p className="hdir__meta">
                  {[o.address, o.city, o.zip].filter(Boolean).join(", ")}
                </p>
                {o.languages.length > 0 && (
                  <p className="hdir__meta">
                    {c.legalLanguages}: {o.languages.join(", ")}
                  </p>
                )}
                <div className="hdir__actions">
                  {o.phone && <Phone number={o.phone} />}
                  {o.website && (
                    <ExtLink href={o.website} newTab={c.newTab}>
                      {c.website}
                    </ExtLink>
                  )}
                  <button type="button" className="linkbtn" onClick={() => onShowOnMap("legal-help", o.center)}>
                    {c.showOnMap}
                  </button>
                </div>
                {o.checked && <p className="hf__hint">{c.checkedOn(longDate(o.checked, locale))}</p>}
              </article>
            ))}
          </div>
          <p className="hf__hint">{c.legalCallFirst}</p>
        </>
      )}

      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(LEGAL_FACTS.checked, locale))} items={LEGAL_FACTS.sources} newTab={c.newTab} />
    </>
  );
}
