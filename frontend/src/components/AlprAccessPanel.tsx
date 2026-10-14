import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useDialog } from "../hooks/useDialog";
import { useI18n } from "../i18n";
import { BASIS_KEY, describe, formatRecordDate, type AlprAccess, type Attribution } from "../alpr-access";

interface Props {
  attribution: Attribution;
  onClose: () => void;
}

/** Full, sourced answer to "who can search this plate reader?" (modal). */
export function AlprAccessPanel({ attribution, onClose }: Props) {
  const { t, lang, locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, { modal: true, fallbackFocus: ".maplibregl-canvas" });
  const [access, setAccess] = useState<AlprAccess | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.alprAccess().then(
      (a) => live && setAccess(a),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const { profile, name: heading, summary, facts } = describe(attribution, access, lang, t("accessNoRecords"));
  const fmtDate = (d: string) => formatRecordDate(d, locale);

  const sourceLink = (id: string) => {
    const src = access?.sources[id];
    if (!src) return null;
    // First-party data, but never render a non-https href (e.g. javascript:).
    if (!/^https:\/\//.test(src.url)) return src.label[lang];
    return (
      <a href={src.url} target="_blank" rel="noopener noreferrer" hrefLang={lang === "es" ? "en" : undefined}>
        {src.label[lang]}
      </a>
    );
  };

  return (
    <div
      className="about"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(); // click on the backdrop
      }}
    >
      <div
        ref={ref}
        className="about__card access"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-title"
        tabIndex={-1}
      >
        <div className="about__bar">
          <h2 id="access-title">{t("accessTitle")}</h2>
          <button type="button" className="detail__close" onClick={onClose} aria-label={t("close")}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="about__body">
          <p className={`access__basis access__basis--${attribution.basis}`}>{t(BASIS_KEY[attribution.basis])}</p>
          {heading && <p className="access__name">{heading}</p>}
          {profile && (
            <p className="access__system">
              {t("accessSystem")}: {profile.system}
            </p>
          )}
          {summary && <p className="access__summary">{summary}</p>}
          {attribution.basis === "inferred" && <p className="access__note">{t("accessInferredNote")}</p>}

          {failed && (
            <p className="access__error" role="alert">
              {t("accessLoadError")}
            </p>
          )}
          {!access && !failed && <p role="status">{t("accessLoading")}</p>}

          {facts.length > 0 && (
            <>
              <h3>{t("accessRecord")}</h3>
              <ul className="access__facts">
                {facts.map((f, i) => (
                  <li key={i}>
                    <span className="access__date">{fmtDate(f.date)}</span> {f.text[lang]}{" "}
                    <span className="access__src">
                      ({sourceLink(f.source)})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {profile?.top_searchers && profile.top_searchers_period && (
            <>
              <h3>{t("accessTopSearchers", { period: fmtDate(profile.top_searchers_period) })}</h3>
              <ol className="access__top">
                {profile.top_searchers.map((s) => (
                  <li key={s.agency}>
                    <span>{s.agency}</span>
                    <span className="access__count">
                      {t("accessSearches", { n: s.searches.toLocaleString(locale) })}
                    </span>
                  </li>
                ))}
              </ol>
              {profile.top_searchers_source && (
                <p className="access__src">
                  {sourceLink(profile.top_searchers_source)}
                </p>
              )}
            </>
          )}

          {profile?.shares_with && (
            <details className="access__list">
              <summary>{t("accessSharesWith", { n: profile.shares_with.length })}</summary>
              <ul>
                {profile.shares_with.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              {profile.shares_with_source && (
                <p className="access__src">
                  {sourceLink(profile.shares_with_source)}
                </p>
              )}
            </details>
          )}

          <p className="access__how">{t("accessHowToAsk")}</p>
          {access && <p className="about__asof">{t("accessAsOf", { date: fmtDate(access.as_of) })}</p>}
        </div>
      </div>
    </div>
  );
}
