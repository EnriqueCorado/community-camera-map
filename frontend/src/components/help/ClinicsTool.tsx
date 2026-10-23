// Free and low-cost clinics in Stanislaus County: community health centers with
// sliding fees, picked by town and need, plus what to know about paying, your
// rights and coverage. The choices live only in this component's state: not in
// the URL, not stored, not sent.
import { useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { CLINICS_COPY, type ClinicsCopy } from "../../help/clinics-copy";
import {
  CLINICS_CHECKED,
  CLINICS_CONTACTS,
  CLINICS_FACTS,
  CLINICS_SOURCES,
  NEEDS,
  TOWNS,
  directionsUrl,
  type Clinic,
  type Need,
  type Town,
} from "../../help/clinics-facts";
import { pickClinics } from "../../help/clinics";
import { longDate } from "../../help/dates";
import { ExtLink, FactList, Field, Phone, Result, Sources } from "./ui";

const TOWN_ORDER = Object.keys(TOWNS) as Town[];

export function ClinicsTool({
  c,
  onShowOnMap,
  onBills,
}: {
  c: HelpCopy;
  onShowOnMap: (layer: string, center?: [number, number]) => void;
  onBills: () => void;
}) {
  const { lang, locale } = useI18n();
  const t = CLINICS_COPY[lang];
  const [town, setTown] = useState<Town | "all">("all");
  const [need, setNeed] = useState<Need | "all">("all");
  const pick = pickClinics({ town, need });
  const contacts = [CLINICS_CONTACTS.mediCal, CLINICS_CONTACTS.hca, CLINICS_CONTACTS.ihcp];

  return (
    <>
      <h3>{t.title}</h3>
      <p className="help__lead">{t.lead}</p>
      <p className="hf__hint">{t.private}</p>

      <Result tone="warn" title={t.crisisTitle}>
        <p>
          {CLINICS_CONTACTS.crisis.name[lang]}: <Phone number={CLINICS_CONTACTS.crisis.phone} />
        </p>
        <p>{CLINICS_CONTACTS.lifeline.name[lang]}</p>
        <p>{t.crisis911}</p>
      </Result>

      <div className="hform">
        <Field label={t.townLabel}>
          {({ id }) => (
            <select id={id} className="hf__input" value={town} onChange={(e) => setTown(e.target.value as Town | "all")}>
              <option value="all">{t.townAll}</option>
              {TOWN_ORDER.map((k) => (
                <option key={k} value={k}>
                  {TOWNS[k].name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t.needLabel}>
          {({ id }) => (
            <select id={id} className="hf__input" value={need} onChange={(e) => setNeed(e.target.value as Need | "all")}>
              <option value="all">{t.needAll}</option>
              {NEEDS.map((n) => (
                <option key={n} value={n}>
                  {t.needs[n]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <p className="hf__hint hclinics__count" role="status">
        {pick.nearest && town !== "all" ? t.nearest(TOWNS[town].name) : t.count(pick.clinics.length)}
      </p>
      <div className="hgrid">
        {pick.clinics.map((clinic) => (
          <ClinicCard key={clinic.id} clinic={clinic} t={t} c={c} onShowOnMap={onShowOnMap} />
        ))}
      </div>
      <p className="hf__hint">{t.callFirst}</p>
      <p>
        <ExtLink href={CLINICS_CONTACTS.mobile.url} newTab={c.newTab}>
          {CLINICS_CONTACTS.mobile.name[lang]}
        </ExtLink>
      </p>

      <section aria-labelledby="clinics-pay">
        <h3 id="clinics-pay">{t.payTitle}</h3>
        <FactList facts={CLINICS_FACTS.pay} />
      </section>

      <section aria-labelledby="clinics-rights">
        <h3 id="clinics-rights">{t.rightsTitle}</h3>
        <FactList facts={CLINICS_FACTS.rights} />
      </section>

      <section aria-labelledby="clinics-coverage">
        <h3 id="clinics-coverage">{t.coverageTitle}</h3>
        <FactList facts={CLINICS_FACTS.coverage} />
        <p>
          <button type="button" className="linkbtn" onClick={onBills}>
            {t.billsButton}
          </button>
        </p>
        <h4>{t.helpTitle}</h4>
        <ul className="hplaces">
          {contacts.map((p) => (
            <li key={p.url + (p.phone ?? "")}>
              <strong>{p.name[lang]}</strong> {p.phone && <Phone number={p.phone} />}{" "}
              <ExtLink href={p.url} newTab={c.newTab}>
                {t.page}
              </ExtLink>
            </li>
          ))}
        </ul>
      </section>

      <p className="hf__hint">{t.changing(longDate(CLINICS_CHECKED, locale))}</p>
      <Sources
        heading={c.sourcesHeading}
        checked={c.checkedOn(longDate(CLINICS_CHECKED, locale))}
        items={CLINICS_SOURCES}
        newTab={c.newTab}
        report={{ topic: t.title, checked: CLINICS_CHECKED }}
      />
    </>
  );
}

function ClinicCard({
  clinic,
  t,
  c,
  onShowOnMap,
}: {
  clinic: Clinic;
  t: ClinicsCopy;
  c: HelpCopy;
  onShowOnMap: (layer: string, center?: [number, number]) => void;
}) {
  const { lang } = useI18n();
  const text = clinic.dentalText?.replace(/\D/g, "");
  return (
    <article className="hcard hdir__item" aria-labelledby={`clinic-${clinic.id}`}>
      <h4 id={`clinic-${clinic.id}`}>{clinic.name}</h4>
      <div className="hdir__tags">
        <span className={`htag${clinic.org === "county" ? " htag--free" : ""}`}>{t.cost[clinic.org]}</span>
        {clinic.needs.map((n) => (
          <span key={n} className="htag">
            {t.needs[n]}
          </span>
        ))}
      </div>
      <p className="hdir__meta">{clinic.address}</p>
      <p className="hdir__meta">{clinic.hours[lang]}</p>
      {clinic.note && <p className="hdir__meta">{clinic.note[lang]}</p>}
      {text && (
        <p className="hdir__meta">
          {t.dentalText}: <a href={`sms:+1${text}`}>{clinic.dentalText}</a>
        </p>
      )}
      <div className="hdir__actions">
        <Phone number={clinic.phone} />
        <ExtLink href={directionsUrl(clinic.address)} newTab={c.newTab}>
          {t.directions}
        </ExtLink>
        <ExtLink href={clinic.url} newTab={c.newTab}>
          {t.page}
        </ExtLink>
        {clinic.onMap && (
          <button type="button" className="linkbtn" onClick={() => onShowOnMap("health-centers", clinic.center)}>
            {c.showOnMap}
          </button>
        )}
      </div>
    </article>
  );
}
