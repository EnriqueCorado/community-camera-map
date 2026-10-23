import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { MEDICAL_FACTS } from "../../help/facts";
import { HOSPITALS, type Hospital } from "../../help/hospitals";
import { careResult, displayPct, MAX_HOUSEHOLD, percentOfPoverty, povertyLine, STATE_FLOOR, yearly } from "../../help/fpl";
import { parseMoney, formatMoney } from "../../help/money";
import { longDate } from "../../help/dates";
import { medicalLetter } from "../../help/letters";
import { Choice, ExtLink, Field, MoneyInput, Phone, Result, Sources } from "./ui";
import { LetterBuilder } from "./LetterBuilder";

const OTHER = "other";

export function MedicalHelp({
  c,
  hospitalId,
  onShowOnMap,
  focusTitle,
}: {
  c: HelpCopy;
  hospitalId?: string;
  onShowOnMap: (layer: string, center?: [number, number]) => void;
  /** Move focus to the check's title on open (when reached from a link in another view). */
  focusTitle?: boolean;
}) {
  const { lang, locale } = useI18n();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);
  const [size, setSize] = useState(1);
  const [income, setIncome] = useState("");
  const [per, setPer] = useState<"month" | "year">("month");
  const [pick, setPick] = useState<string>(hospitalId && HOSPITALS.some((h) => h.id === hospitalId) ? hospitalId : "");
  const hospital: Hospital | null = HOSPITALS.find((h) => h.id === pick) ?? null;

  const [insured, setInsured] = useState<"yes" | "no" | null>(null);
  const [highCosts, setHighCosts] = useState<"yes" | "no" | "unsure" | null>(null);

  const g = MEDICAL_FACTS.fpl;
  const amount = parseMoney(income);
  const pct = amount != null && amount > 0 ? percentOfPoverty(yearly(amount, per), size, g) : null;
  const policy = hospital?.policy ?? STATE_FLOOR;
  const ready = pct != null && insured != null && (insured === "no" || highCosts != null);
  const res = ready ? careResult(pct!, policy, { insured: insured === "yes", highCosts: highCosts ?? "no" }) : null;
  const fmt = (n: number) => formatMoney(n, locale);
  const line = povertyLine(g, size);

  return (
    <>
      <p className="help__lead">{c.medLead}</p>

      <section className="hcard" aria-labelledby="med-check">
        <h3 id="med-check" ref={titleRef} tabIndex={-1}>
          {c.medCheckTitle}
        </h3>
        <div className="hform">
          <Field label={c.medHospital} wide>
            {({ id }) => (
              <select id={id} className="hf__input" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{c.medChooseHospital}</option>
                {HOSPITALS.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.city})
                  </option>
                ))}
                <option value={OTHER}>{c.medOtherHospital}</option>
              </select>
            )}
          </Field>
          <Field label={c.medHousehold} hint={c.medHouseholdHint}>
            {({ id, describedBy }) => (
              <select
                id={id}
                aria-describedby={describedBy}
                className="hf__input"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              >
                {Array.from({ length: MAX_HOUSEHOLD }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={c.medIncome} hint={c.medIncomeHint}>
            {({ id, describedBy }) => (
              <MoneyInput id={id} describedBy={describedBy} value={income} onChange={setIncome} />
            )}
          </Field>
          <Choice
            legend={c.medPer}
            value={per}
            onChange={setPer}
            options={[
              { value: "month", label: c.perMonth },
              { value: "year", label: c.perYear },
            ]}
          />
          <Choice
            wide
            legend={c.medInsured}
            value={insured}
            onChange={setInsured}
            options={[
              { value: "yes", label: c.yes },
              { value: "no", label: c.no },
            ]}
          />
          {insured === "yes" && (
            <Choice
              wide
              legend={c.medHighCostsQ}
              hint={c.medHighCostsHint}
              value={highCosts}
              onChange={setHighCosts}
              options={[
                { value: "yes", label: c.yes },
                { value: "no", label: c.no },
                { value: "unsure", label: c.notSure },
              ]}
            />
          )}
        </div>

        <div aria-live="polite">
          {income.trim() !== "" && amount == null && <p role="alert">{c.moneyInvalid}</p>}
          {res && pct != null && (
            <Result
              tone={res.tier === "over" ? "info" : "good"}
              title={res.tier === "free" ? c.medTierFree : res.tier === "discount" ? c.medTierDiscount : c.medTierOver}
            >
              <p className="hstat">{c.medPctOfPoverty(displayPct(pct, policy))}</p>
              <p>{c.medPctExplain(fmt(yearly(amount!, per)), size, fmt(line), g.year)}</p>
              {res.ifHighCosts && <p>{c.medIfHighCosts}</p>}
              <p>
                {res.tier === "free" && res.maxFpl != null
                  ? c.medFreeNext(Math.ceil(res.maxFpl))
                  : res.tier === "discount" && res.maxFpl != null
                    ? c.medDiscountNext(res.maxFpl)
                    : c.medOverNext}
              </p>
              {res.nearCutoff && <p>{c.medBorderline}</p>}
            </Result>
          )}
        </div>
      </section>

      {hospital ? <HospitalCard h={hospital} c={c} onShowOnMap={onShowOnMap} /> : <p>{c.medOtherHospitalText}</p>}

      <h3>{c.medRightsTitle}</h3>
      <ul>
        {MEDICAL_FACTS.rights.map((r) => (
          <li key={r.id}>
            {r[lang]}{" "}
            <span className="hf__hint">({r.cite})</span>
          </li>
        ))}
      </ul>

      <h3>{c.medLetterTitle}</h3>
      <p>{medicalLetter.blurb[lang]}</p>
      <LetterBuilder key={hospital?.id ?? OTHER} def={medicalLetter} c={c} initial={hospital ? { hospital: hospital.name } : undefined} />

      <h3>{c.medComplainTitle}</h3>
      <p>
        {c.medComplainText}{" "}
        <ExtLink href={MEDICAL_FACTS.complaint.url} newTab={c.newTab}>
          {MEDICAL_FACTS.complaint.name[lang]}
        </ExtLink>
      </p>
      <p>
        {c.medFreeHelpText}{" "}
        <ExtLink href={MEDICAL_FACTS.freeHelp.url} newTab={c.newTab}>
          {MEDICAL_FACTS.freeHelp.name[lang]}
        </ExtLink>
        {" · "}
        <Phone number={MEDICAL_FACTS.freeHelp.phone} />
      </p>

      <Sources
        heading={c.sourcesHeading}
        checked={c.checkedOn(longDate(MEDICAL_FACTS.checked, locale))}
        items={MEDICAL_FACTS.sources}
        newTab={c.newTab}
        report={{ topic: c.medicalViewBills, checked: MEDICAL_FACTS.checked }}
      />
    </>
  );
}

function HospitalCard({ h, c, onShowOnMap }: { h: Hospital; c: HelpCopy; onShowOnMap: (layer: string, center?: [number, number]) => void }) {
  const { lang, locale } = useI18n();
  const es = lang === "es";
  return (
    <section className="hcard" aria-labelledby={`hosp-${h.id}`}>
      <h3 id={`hosp-${h.id}`}>{h.name}</h3>
      <p className="hdir__meta">
        {h.address}, {h.city} · {h.operator}
      </p>
      <p>{h.note[lang]}</p>
      <div className="hdir__actions">
        <span>
          {c.medCallBilling} <Phone number={h.phone} />
        </span>
        <ExtLink href={h.pageUrl} newTab={c.newTab}>
          {c.medPageLink}
        </ExtLink>
      </div>
      <div className="hdir__actions">
        <ExtLink href={h.policyUrl} newTab={c.newTab} hrefLang="en">
          {c.medPolicyLink} (English)
        </ExtLink>
        {h.policyUrlEs && (
          <ExtLink href={h.policyUrlEs} newTab={c.newTab} hrefLang="es">
            {c.medPolicyLink} (español)
          </ExtLink>
        )}
        <ExtLink href={h.applicationUrl} newTab={c.newTab} hrefLang="en">
          {c.medApplicationLink} (English)
        </ExtLink>
        {h.applicationUrlEs && (
          <ExtLink href={h.applicationUrlEs} newTab={c.newTab} hrefLang="es">
            {c.medApplicationLink} (español)
          </ExtLink>
        )}
        <button type="button" className="linkbtn" onClick={() => onShowOnMap("hospitals", [h.lon, h.lat])}>
          {c.showOnMap}
        </button>
      </div>
      {!h.applicationUrlEs && es && <p className="hf__hint">{c.medNoSpanish}</p>}
      <p className="hf__hint">{c.medPolicyDated(longDate(h.policyDate, locale))}</p>
    </section>
  );
}
