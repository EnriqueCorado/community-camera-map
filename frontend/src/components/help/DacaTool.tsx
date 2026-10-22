// "When to renew DACA": from the date DACA expires, USCIS's 120–150 day
// renewal window and where the person stands today, plus what to send, the
// fees, the travel warning and local help. The date lives in this
// component's state only: nothing is saved or sent.
import { useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { DACA_COPY, type DacaCopy } from "../../help/daca-copy";
import { DACA_CHECKED, DACA_FACTS, DACA_HELP, DACA_LINKS, DACA_SOURCES } from "../../help/daca-facts";
import { dacaPlan, type DacaPlan, type DacaStatus } from "../../help/daca";
import { RIGHTS_FACTS } from "../../help/rights-facts";
import { longDate, todayIso } from "../../help/dates";
import { ExtLink, FactList, Field, Phone, Result, Sources, type Tone } from "./ui";

const TONE: Record<DacaStatus, Tone> = {
  "too-early": "info",
  "file-now": "good",
  urgent: "warn",
  "expired-renew": "bad",
  "expired-initial": "bad",
};

const NOTARIO = RIGHTS_FACTS.scams.filter((f) => f.id === "scam-notario");

export function DacaTool({ c, onLegal }: { c: HelpCopy; onLegal: () => void }) {
  const { lang, locale } = useI18n();
  const t = DACA_COPY[lang];
  const [expires, setExpires] = useState("");
  const plan = expires ? dacaPlan(expires, todayIso()) : null;

  return (
    <>
      <h3>{t.title}</h3>
      <p className="help__lead">{t.lead}</p>
      <p className="hf__hint">{t.private}</p>

      <div className="hcard">
        <div className="hform hform--1">
          <Field label={t.dateLabel} hint={t.dateHint} wide>
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="date"
                className="hf__input"
                autoComplete="off"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            )}
          </Field>
        </div>
      </div>

      <div aria-live="polite">
        {!expires && <p className="hf__hint">{t.fillDate}</p>}
        {expires && !plan && <p role="alert">{t.invalidDate}</p>}
        {plan && <PlanView plan={plan} expires={expires} t={t} locale={locale} />}
      </div>

      <h3>{t.nowTitle}</h3>
      <FactList facts={DACA_FACTS.status} />
      <p>
        <ExtLink href={lang === "es" ? DACA_LINKS.uscisEs : DACA_LINKS.uscis} newTab={c.newTab} hrefLang={lang}>
          {t.uscisPage}
        </ExtLink>
      </p>

      <h3>{t.timingTitle}</h3>
      <FactList facts={DACA_FACTS.timing} />

      <h3>{t.gatherTitle}</h3>
      <FactList facts={DACA_FACTS.gather} />
      <p>
        <ExtLink href={DACA_LINKS.fileOnline} newTab={c.newTab} hrefLang="en">
          {t.fileOnline}
        </ExtLink>
      </p>

      <h3>{t.feesTitle}</h3>
      <FactList facts={DACA_FACTS.fees} />

      <h3>{t.travelTitle}</h3>
      <FactList facts={DACA_FACTS.travel} />

      <h3>{t.scamTitle}</h3>
      <FactList facts={NOTARIO} />

      <h3>{t.helpTitle}</h3>
      <ul className="hplaces">
        {DACA_HELP.map((h) => (
          <li key={h.url}>
            <strong>{h.name[lang]}</strong> <Phone number={h.phone} />
            <br />
            {h.address}. <span className="hf__hint">{h.note[lang]}</span>{" "}
            <ExtLink href={h.url} newTab={c.newTab}>
              {c.website}
            </ExtLink>
          </li>
        ))}
      </ul>
      <p>
        <button type="button" className="hbtn hbtn--primary" onClick={onLegal}>
          {t.legalButton}
        </button>
      </p>

      <p className="hf__hint">{t.changing(longDate(DACA_CHECKED, locale))}</p>
      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(DACA_CHECKED, locale))} items={DACA_SOURCES} newTab={c.newTab} report={{ topic: t.title, checked: DACA_CHECKED }} />
    </>
  );
}

function PlanView({ plan, expires, t, locale }: { plan: DacaPlan; expires: string; t: DacaCopy; locale: string }) {
  const d = (iso: string) => longDate(iso, locale);
  const dates = { opens: d(plan.opens), ideal: d(plan.ideal), expires: d(expires), yearAfter: d(plan.yearAfter) };
  return (
    <Result tone={TONE[plan.status]} title={t.statusTitle[plan.status]}>
      <p>{t.daysLeft(plan.daysLeft)}</p>
      <p>{t.statusText[plan.status](dates)}</p>
      {/* "Too early" already names the window; once it has passed, its dates would only confuse. */}
      {plan.status === "file-now" && <p>{t.window(dates.opens, dates.ideal)}</p>}
      {plan.far && <p role="alert">{t.farDate}</p>}
    </Result>
  );
}
