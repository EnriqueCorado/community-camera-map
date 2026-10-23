// "Immigration court": finding your hearing (with a small A-Number helper),
// which court has the case, moving, missed hearings, lawyers, what changed in
// 2025–26 and scams. The A-Number lives in this component's state only:
// nothing is saved, sent or put in a URL.
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { COURT_COPY } from "../../help/court-copy";
import { COURT_CHECKED, COURT_FACTS, COURT_HELP, COURT_LINKS, COURT_SOURCES, COURTS, EOIR_PHONE } from "../../help/court-facts";
import { parseANumber } from "../../help/court";
import { LEGAL_DIRECTORIES, RIGHTS_FACTS, WHO_CAN_ADVISE } from "../../help/rights-facts";
import { factsById } from "../../help/facts-by-id";
import { longDate } from "../../help/dates";
import { ExtLink, FactList, Field, Phone, Result, Sources } from "./ui";

// Reviewed facts shared with the rights page.
const FIND = factsById(RIGHTS_FACTS.detained, "find-eoir-phone", "find-eoir-acis");
const NO_SIGN = factsById(RIGHTS_FACTS.stopped, "right-no-sign");
const SCAMS = factsById(RIGHTS_FACTS.scams, "scam-notario", "scam-report");

export function CourtTool({ c, onLegal, onPlan, focusTitle }: { c: HelpCopy; onLegal: () => void; onPlan?: () => void; focusTitle?: boolean }) {
  const { lang, locale } = useI18n();
  const t = COURT_COPY[lang];
  const [aNumber, setANumber] = useState("");
  const [left, setLeft] = useState(false);
  const parsed = aNumber.trim() ? parseANumber(aNumber) : null;
  // Every half-typed number is "invalid": say so only once it's long enough
  // to be one (8+ digits) or the reader has moved on from the field.
  const showInvalid = !parsed && aNumber.trim() !== "" && (left || aNumber.replace(/\D/g, "").length >= 8);
  // Opened from a link in another view: focus follows the reader here.
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  return (
    <>
      <h3 ref={titleRef} tabIndex={-1}>
        {t.title}
      </h3>
      <p className="help__lead">{t.lead}</p>

      <Result tone="warn" title={t.goTitle}>
        <p>{t.goText}</p>
      </Result>

      <section className="hcard" aria-labelledby="court-check">
        <h4 id="court-check">{t.checkTitle}</h4>
        <p className="hf__hint">{t.private}</p>
        <div className="hform hform--1">
          <Field label={t.aLabel} hint={t.aHint} wide>
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="text"
                inputMode="numeric"
                className="hf__input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-gramm="false"
                maxLength={20}
                aria-invalid={showInvalid || undefined}
                value={aNumber}
                onChange={(e) => {
                  setANumber(e.target.value);
                  setLeft(false);
                }}
                onBlur={() => setLeft(true)}
              />
            )}
          </Field>
        </div>
        <div aria-live="polite">
          {showInvalid && <p>{t.aInvalid}</p>}
          {parsed && (
            <>
              <p>
                <strong>{t.aResult(parsed.display)}</strong>
              </p>
              {parsed.padded && <p className="hf__hint">{t.aPadded}</p>}
              <p>
                {t.aCall} <Phone number={EOIR_PHONE} /> {t.aDial(parsed.digits.split("").join(" "))}
              </p>
            </>
          )}
        </div>
        <p>
          <ExtLink href={lang === "es" ? COURT_LINKS.acisEs : COURT_LINKS.acis} newTab={c.newTab} hrefLang={lang}>
            {t.acisLink}
          </ExtLink>
          <br />
          <span className="hf__hint">{t.acisNote}</span>
        </p>
      </section>

      <h3>{t.findTitle}</h3>
      <FactList facts={[...COURT_FACTS.find, ...FIND]} />

      <h3>{t.courtsTitle}</h3>
      <FactList facts={COURT_FACTS.courts} />
      <ul className="hplaces">
        {COURTS.map((p) => (
          <li key={p.url}>
            <strong>{p.name[lang]}</strong> <Phone number={p.phone} />
            <br />
            {p.address}. <span className="hf__hint">{p.hours[lang]}</span>{" "}
            <ExtLink href={p.url} newTab={c.newTab}>
              {c.website}
            </ExtLink>
          </li>
        ))}
      </ul>

      <h3>{t.moveTitle}</h3>
      <FactList facts={COURT_FACTS.move} />
      <ul>
        <li>
          <ExtLink href={COURT_LINKS.respondentPortal} newTab={c.newTab} hrefLang="en">
            {t.respondentPortal}
          </ExtLink>
        </li>
        <li>
          <ExtLink href={COURT_LINKS.ar11} newTab={c.newTab} hrefLang="en">
            {t.ar11Link}
          </ExtLink>
        </li>
      </ul>

      <h3>{t.missedTitle}</h3>
      <FactList facts={COURT_FACTS.missed} />

      <h3>{t.bringTitle}</h3>
      <ul>
        {t.bring.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      <h3>{t.lawyerTitle}</h3>
      <FactList facts={COURT_FACTS.lawyer} />
      <p>{WHO_CAN_ADVISE[lang]}</p>
      <p>{LEGAL_DIRECTORIES[lang]}</p>
      <p>
        <ExtLink href={COURT_LINKS.proBono} newTab={c.newTab} hrefLang="en">
          {t.proBonoLink}
        </ExtLink>
      </p>
      <h4>{t.helpTitle}</h4>
      <p className="hf__hint">{t.helpNote}</p>
      <ul className="hplaces">
        {COURT_HELP.map((h) => (
          <li key={h.url}>
            <strong>{h.name[lang]}</strong> <Phone number={h.phone} />
            <br />
            {h.address}.{" "}
            <ExtLink href={h.url} newTab={c.newTab}>
              {c.website}
            </ExtLink>
            {h.note && (
              <>
                <br />
                <span className="hf__hint">{h.note[lang]}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      <p>
        <button type="button" className="hbtn hbtn--primary" onClick={onLegal}>
          {t.legalButton}
        </button>
      </p>

      <h3>{t.changesTitle}</h3>
      <FactList facts={[...COURT_FACTS.changes, ...NO_SIGN]} />
      {onPlan && (
        <p>
          <button type="button" className="hbtn" onClick={onPlan}>
            {t.planButton}
          </button>
        </p>
      )}

      <h3>{t.scamsTitle}</h3>
      <FactList facts={[...COURT_FACTS.scams, ...SCAMS]} />

      <p className="hf__hint">{t.changing(longDate(COURT_CHECKED, locale))}</p>
      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(COURT_CHECKED, locale))} items={COURT_SOURCES} newTab={c.newTab} report={{ topic: t.title, checked: COURT_CHECKED }} />
    </>
  );
}
