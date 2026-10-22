// "Know your rights with immigration agents": what ILRC, ACLU, the California
// Attorney General and the courts say, in their words, plus red cards, a
// family plan, how to find someone who was detained, and an emergency line.
// Nothing to type: a page to read (and print).
import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { RIGHTS_COPY } from "../../help/rights-copy";
import {
  CARD_FREE,
  CARD_NOT_ADVICE,
  CARD_TEXT,
  DETENTION_CENTERS,
  INDIGENOUS_VIDEOS,
  LEGAL_DIRECTORIES,
  RAPID_RESPONSE,
  RED_CARDS,
  RIGHTS_CHECKED,
  RIGHTS_FACTS,
  RIGHTS_SOURCES,
  WHO_CAN_ADVISE,
} from "../../help/rights-facts";
import { longDate } from "../../help/dates";
import { ExtLink, FactList, Phone, Result, Sources } from "./ui";

export function RightsTool({ c, onLegal, onPlan, focusTitle }: { c: HelpCopy; onLegal: () => void; onPlan?: () => void; focusTitle?: boolean }) {
  const { lang, locale } = useI18n();
  const r = RIGHTS_COPY[lang];
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);
  const sections: [string, keyof typeof RIGHTS_FACTS][] = [
    [r.door, "door"],
    [r.stopped, "stopped"],
    [r.recording, "recording"],
    [r.plan, "plan"],
  ];

  return (
    <>
      <h3 ref={titleRef} tabIndex={-1}>
        {r.title}
      </h3>
      <p className="help__lead">{r.lead}</p>

      <Result tone="warn" title={r.emergencyTitle}>
        <p>
          {r.emergencyText} <strong>{RAPID_RESPONSE.name[lang]}</strong>: <Phone number={RAPID_RESPONSE.phone} />
        </p>
        <p>{r.call911}</p>
        <p>{r.emergencyDoor}</p>
      </Result>

      <section className="hcard" aria-labelledby="rights-card">
        <h4 id="rights-card">{r.cardTitle}</h4>
        <p>{r.cardLead}</p>
        <p>{CARD_TEXT[lang]}</p>
        <ul>
          <li>
            <ExtLink href={RED_CARDS.page} newTab={c.newTab}>
              {r.cardGet}
            </ExtLink>
          </li>
          <li>
            <ExtLink href={RED_CARDS.spanish} newTab={c.newTab} hrefLang="es">
              {r.cardSpanish}
            </ExtLink>
            {" · "}
            <ExtLink href={RED_CARDS.english} newTab={c.newTab} hrefLang="en">
              {r.cardEnglish}
            </ExtLink>
          </li>
          <li>
            {r.cardIndigenous}{" "}
            <ExtLink href={RED_CARDS.indigenous.mam} newTab={c.newTab}>
              Mam
            </ExtLink>
            {" · "}
            <ExtLink href={RED_CARDS.indigenous.nahuatl} newTab={c.newTab}>
              Nahuatl
            </ExtLink>
            {" · "}
            <ExtLink href={RED_CARDS.indigenous.tsotsil} newTab={c.newTab}>
              Tsotsil
            </ExtLink>
          </li>
        </ul>
        <p className="hf__hint">{CARD_FREE[lang]}</p>
        <p className="hf__hint">{CARD_NOT_ADVICE[lang]}</p>
        <h4>{r.videosTitle}</h4>
        <ul>
          {INDIGENOUS_VIDEOS.map((v) => (
            <li key={v.url}>
              <ExtLink href={v.url} newTab={c.newTab}>
                {v.name[lang]}
              </ExtLink>
              <span className="hf__hint"> ({v.facebook ? `${r.facebook}; ${r.notReviewed}` : r.notReviewed})</span>
            </li>
          ))}
        </ul>
      </section>

      {sections.map(([title, key]) => (
        <section key={key} aria-labelledby={`rights-${key}`}>
          <h3 id={`rights-${key}`}>{title}</h3>
          <FactList facts={RIGHTS_FACTS[key]} />
          {key === "plan" && onPlan && (
            <p>
              <button type="button" className="hbtn hbtn--primary" onClick={onPlan}>
                {r.planButton}
              </button>
            </p>
          )}
        </section>
      ))}

      <section aria-labelledby="rights-detained">
        <h3 id="rights-detained">{r.detained}</h3>
        <FactList facts={RIGHTS_FACTS.detained} />
        <h4>{r.centersTitle}</h4>
        <p className="hf__hint">{r.centersNote}</p>
        <ul className="hplaces">
          {DETENTION_CENTERS.map((p) => (
            <li key={p.phone}>
              <strong>{p.name[lang]}</strong> <Phone number={p.phone} />
              <br />
              <span className="hf__hint">{p.note[lang]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rights-california">
        <h3 id="rights-california">{r.california}</h3>
        <FactList facts={RIGHTS_FACTS.california} />
      </section>

      <section aria-labelledby="rights-scams">
        <h3 id="rights-scams">{r.scams}</h3>
        <FactList facts={RIGHTS_FACTS.scams} />
      </section>

      <section aria-labelledby="rights-legal">
        <h3 id="rights-legal">{r.legal}</h3>
        <p>{WHO_CAN_ADVISE[lang]}</p>
        <p>{LEGAL_DIRECTORIES[lang]}</p>
        <p>
          <button type="button" className="linkbtn" onClick={onLegal}>
            {r.legalButton}
          </button>
        </p>
      </section>

      <p className="hf__hint">{r.changing(longDate(RIGHTS_CHECKED, locale))}</p>
      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(RIGHTS_CHECKED, locale))} items={RIGHTS_SOURCES} newTab={c.newTab} report={{ topic: r.title, checked: RIGHTS_CHECKED }} />
    </>
  );
}
