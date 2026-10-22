// "Free tax help for 2027": where to file for free in Stanislaus County, the
// cash-back credits (with an SSN or an ITIN), ITINs, privacy, refunds and
// scams, all cited. A page to read: nothing to type, nothing stored.
import { useRef } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { TAXES_COPY } from "../../help/taxes-copy";
import { CA_CREDITS, FED_CREDITS, TAX_PLACES, TAX_SEASON, TAXES_CHECKED, TAXES_FACTS, TAXES_SOURCES, type TaxPlace } from "../../help/taxes-facts";
import { longDate } from "../../help/dates";
import { formatMoney } from "../../help/money";
import { ExtLink, FactList, Phone, Result, Sources } from "./ui";
import "./taxes.css";

export function TaxesTool({ c, onLegal }: { c: HelpCopy; onLegal: () => void }) {
  const { lang, locale } = useI18n();
  const t = TAXES_COPY[lang];
  // Not an #anchor: the app keeps the Help panel's place in the URL hash.
  const privacyRef = useRef<HTMLHeadingElement>(null);
  const usd = (n: number) => formatMoney(n, locale);
  const places = (list: TaxPlace[]) => (
    <ul className="hplaces htax__places">
      {list.map((p) => (
        <li key={p.name.en}>
          <strong>{p.name[lang]}</strong>
          {p.phone && (
            <>
              {" "}
              <Phone number={p.phone} />
            </>
          )}
          {p.address && (
            <>
              <br />
              {p.address}
            </>
          )}
          {p.hours && (
            <>
              <br />
              {p.hours[lang]}
            </>
          )}
          {p.note && (
            <>
              <br />
              <span className="hf__hint">{p.note[lang]}</span>
            </>
          )}
          <br />
          <ExtLink href={p.url} newTab={c.newTab}>
            {c.website}
          </ExtLink>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <h3>{t.title}</h3>
      <p className="help__lead">{t.lead}</p>

      <Result tone="info" title={t.seasonTitle}>
        <p>{t.seasonText(TAX_SEASON.taxYear, longDate(TAX_SEASON.due, locale))}</p>
        <p>
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              privacyRef.current?.scrollIntoView({ block: "start" });
              privacyRef.current?.focus();
            }}
          >
            {t.seasonImmigration}
          </button>
        </p>
        <p>{t.seasonPrivate}</p>
      </Result>

      <section aria-labelledby="taxes-free">
        <h3 id="taxes-free">{t.freeTitle}</h3>
        <FactList facts={TAXES_FACTS.free} />
        <h4>{t.placesTitle}</h4>
        {places([TAX_PLACES.unitedWay, TAX_PLACES.csuStan, TAX_PLACES.aarp, TAX_PLACES.s211, TAX_PLACES.irsLocator])}
      </section>

      <section aria-labelledby="taxes-numbers">
        <h3 id="taxes-numbers">{t.numbersTitle}</h3>
        <div className="htax__wrap">
          <table className="htax__table">
            <caption>{t.numbersCaption(TAX_SEASON.taxYear)}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colChildren}</th>
                <th scope="col">{t.colCalEitc(CA_CREDITS.caleitcMax.year)}</th>
                <th scope="col">{t.colFedEitc}</th>
                <th scope="col">{t.colFedLimit}</th>
              </tr>
            </thead>
            <tbody>
              {t.children.map((label, i) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{usd(CA_CREDITS.caleitcMax.byChildren[i]!)}</td>
                  <td>
                    {usd(FED_CREDITS.eitcMax[i]!)}
                    {i === 0 && <span className="htax__joint">{t.noChildAges}</span>}
                  </td>
                  <td>
                    {usd(FED_CREDITS.eitcLimitSingle[i]!)}
                    <span className="htax__joint">
                      {t.colFedLimitJoint}: {usd(FED_CREDITS.eitcLimitJoint[i]!)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t.numbersNote(usd(CA_CREDITS.incomeUnder), usd(CA_CREDITS.yctcMax), usd(CA_CREDITS.fytcMax))}</p>
        <h4>{t.stateTitle}</h4>
        <FactList facts={TAXES_FACTS.state} />
        <h4>{t.fedTitle}</h4>
        <FactList facts={TAXES_FACTS.federal} />
      </section>

      <section aria-labelledby="taxes-itin">
        <h3 id="taxes-itin">{t.itinTitle}</h3>
        <FactList facts={TAXES_FACTS.itin} />
        <h4>{t.itinPlacesTitle}</h4>
        {places([TAX_PLACES.tacModesto, TAX_PLACES.mercedItin, TAX_PLACES.caaList])}
      </section>

      <section aria-labelledby="taxes-privacy">
        <h3 id="taxes-privacy" ref={privacyRef} tabIndex={-1}>
          {t.privacyTitle}
        </h3>
        <FactList facts={TAXES_FACTS.privacy} />
        <p>
          <button type="button" className="linkbtn" onClick={onLegal}>
            {t.legalButton}
          </button>
        </p>
      </section>

      <section aria-labelledby="taxes-refunds">
        <h3 id="taxes-refunds">{t.refundsTitle}</h3>
        <FactList facts={TAXES_FACTS.refunds} />
      </section>

      <section aria-labelledby="taxes-scams">
        <h3 id="taxes-scams">{t.scamsTitle}</h3>
        <FactList facts={TAXES_FACTS.scams} />
        {places([TAX_PLACES.ctec])}
      </section>

      <p className="hf__hint">{t.notAdvice}</p>
      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(TAXES_CHECKED, locale))} items={TAXES_SOURCES} newTab={c.newTab} report={{ topic: t.title, checked: TAXES_CHECKED }} />
    </>
  );
}
