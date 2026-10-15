import { useEffect, useRef, useState } from "react";
import { geocode, report, type Fact, type FactGroup, type FoundPlace } from "../near-me";
import { formatDistance, type LonLat } from "../near-me-logic";
import { useI18n, type Key } from "../i18n";

export interface NearPoint {
  center: LonLat;
  label: string;
}

const GROUPS: [FactGroup, Key][] = [
  ["where", "nearGroupWhere"],
  ["hazards", "nearGroupHazards"],
  ["neighborhood", "nearGroupNeighborhood"],
  ["nearby", "nearGroupNearby"],
];

/** "What's near an address?": search -> pick a match -> a one-screen report. */
export function NearMe({ point, onPoint }: { point: NearPoint | null; onPoint: (p: NearPoint | null) => void }) {
  const { t, lang, locale } = useI18n();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<FoundPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  // A new point (searched or located): build its report.
  useEffect(() => {
    ctrl.current?.abort();
    setFacts(null);
    if (!point) return;
    const c = new AbortController();
    ctrl.current = c;
    setReporting(true);
    report(point.center, c.signal)
      .then((f) => !c.signal.aborted && setFacts(f))
      .finally(() => !c.signal.aborted && setReporting(false));
    return () => {
      c.abort();
      setReporting(false);
    };
  }, [point]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim() || searching) return;
    const seq = ++searchSeq.current; // only the latest search may update the list
    setSearching(true);
    setMatches(null);
    setNotice(null);
    geocode(q.trim(), lang)
      .then((m) => {
        if (seq !== searchSeq.current) return;
        setMatches(m);
        if (m.length === 1) onPoint(m[0]!); // one match: go straight there
      })
      .catch(() => seq === searchSeq.current && setNotice(t("nearSearchFailed")))
      .finally(() => seq === searchSeq.current && setSearching(false));
  };

  const locate = () => {
    setNotice(null);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const r4 = (v: number) => Math.round(v * 1e4) / 1e4; // ~10 m is plenty
        const acc = Math.round(pos.coords.accuracy);
        if (acc > 150) setNotice(t("nearApproximate", { m: acc.toLocaleString(locale) }));
        onPoint({ center: [r4(pos.coords.longitude), r4(pos.coords.latitude)], label: t("nearUseLocation") });
      },
      () => setNotice(t("nearLocationUnavailable")),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const value = (f: Fact) => (f.text ?? (f.phrase ? t(f.phrase.key, f.phrase.vars) : ""));

  return (
    <div className="nearme">
      <form className="nearme__form" role="search" onSubmit={search}>
        <input
          type="search"
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("nearPlaceholder")}
          aria-label={t("nearPlaceholder")}
          maxLength={200}
        />
        <button type="submit" className="chip" disabled={searching}>
          {t("nearSearch")}
        </button>
      </form>
      <div className="nearme__actions">
        {"geolocation" in navigator && (
          <button type="button" className="chip" onClick={locate}>
            {t("nearUseLocation")}
          </button>
        )}
        {point && (
          <button
            type="button"
            className="chip"
            onClick={() => {
              onPoint(null);
              setMatches(null);
            }}
          >
            {t("nearClear")}
          </button>
        )}
      </div>
      {searching && <p className="panel__note">{t("nearSearching")}</p>}
      {notice && <p className="panel__note">{notice}</p>}
      {matches && matches.length === 0 && <p className="panel__note">{t("nearNoResults")}</p>}
      {matches && matches.length > 1 && (
        <ul className="nearme__matches">
          {matches.map((m) => (
            <li key={`${m.center[0]},${m.center[1]}`}>
              <button type="button" className="linkbtn" onClick={() => onPoint(m)}>
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {point && (
        <div className="nearme__report" aria-live="polite">
          <p className="nearme__place">{point.label}</p>
          {reporting && <p className="panel__note">{t("nearLoading")}</p>}
          {facts &&
            GROUPS.map(([g, title]) => {
              const rows = facts.filter((f) => f.group === g && value(f));
              return rows.length ? (
                <div key={g} className="nearme__group">
                  <h3 className="nearme__h">{t(title)}</h3>
                  <dl>
                    {rows.map((f) => (
                      <div key={f.label} className="nearme__row">
                        <dt>{t(f.label)}</dt>
                        <dd>
                          {value(f)}
                          {f.meters != null && <span className="nearme__dist"> · {formatDistance(f.meters, locale)}</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null;
            })}
          <p className="panel__note">{t("nearPrivacy")}</p>
        </div>
      )}
    </div>
  );
}
