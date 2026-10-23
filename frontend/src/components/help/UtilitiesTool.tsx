// Help with gas and electric bills: which bill discounts a household may get
// (CARE, FERA, MID CARES, TID CARES, LIHEAP, worked out by the Benefits
// screener's own rules), what the rules say about shutoffs, help with past-due
// bills, medical rates and scams. Answers stay in this component's state
// (never stored, never sent).
import { useRef, useState } from "react";
import "./benefits.css";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { BENEFITS_COPY, type Money } from "../../help/benefits-copy";
import { byVerdict, screenUtilities, toCents, type Electric, type Enrolled, type YesNo } from "../../help/benefits";
import { MAX_HOUSEHOLD } from "../../help/fpl";
import { formatMoney, parseMoney } from "../../help/money";
import { longDate, todayIso } from "../../help/dates";
import type { Per } from "../../help/benefits-facts";
import { MEDICAL_LINKS, UTIL_CHECKED, UTIL_CONTACTS, UTIL_FACTS, UTIL_SOURCES } from "../../help/utilities-facts";
import { UTILITIES_COPY } from "../../help/utilities-copy";
import { ProgramCard } from "./BenefitsHelp";
import { Choice, ExtLink, FactList, Field, MoneyInput, Phone, Result, Sources } from "./ui";

const ENROLLED: Enrolled[] = ["medi-cal", "calfresh", "wic", "calworks", "ssi"];

export function UtilitiesTool({ c }: { c: HelpCopy }) {
  const { lang, locale } = useI18n();
  const u = UTILITIES_COPY[lang];
  const b = BENEFITS_COPY[lang];
  const [electric, setElectric] = useState<Electric | null>(null);
  const [pgeGas, setPgeGas] = useState<YesNo | "unsure" | null>(null);
  const [size, setSize] = useState(1);
  const [income, setIncome] = useState("");
  const [per, setPer] = useState<Per>("month");
  const [gets, setGets] = useState<Enrolled[]>([]);
  const shutoffRef = useRef<HTMLHeadingElement>(null);

  const cents = toCents(parseMoney(income));
  // MID and TID homes say whether PG&E also sends a gas bill before CARE is checked.
  const utilityKnown = electric != null && (electric === "pge" || electric === "unsure" || pgeGas != null);
  const results =
    cents != null && electric != null
      ? screenUtilities({ size, income: cents, per, gets, electric, pgeGas: pgeGas ?? undefined }, todayIso())
      : null;
  const groups = results ? byVerdict(results) : null;
  const money: Money = (n) => formatMoney(n / 100, locale);
  const toggle = (e: Enrolled) => setGets((g) => (g.includes(e) ? g.filter((x) => x !== e) : [...g, e]));
  const yesNoUnsure = [
    { value: "yes" as const, label: c.yes },
    { value: "no" as const, label: c.no },
    { value: "unsure" as const, label: c.notSure },
  ];

  return (
    <>
      <h3>{u.title}</h3>
      <p className="help__lead">{u.lead}</p>

      <Result tone="warn" title={u.shutoffBoxTitle}>
        <p>{u.shutoffBoxText}</p>
        <p>
          <button type="button" className="linkbtn" onClick={() => shutoffRef.current?.focus()}>
            {u.shutoffBoxLink}
          </button>
        </p>
      </Result>

      <section aria-labelledby="util-which">
        <h4 id="util-which">{u.whichTitle}</h4>
        <FactList facts={UTIL_FACTS.which} />
      </section>

      <section className="hcard" aria-labelledby="util-form">
        <h4 id="util-form">{u.formTitle}</h4>
        <p>
          <strong>{u.privateNote}</strong>
        </p>
        <div className="hform">
          <Choice
            wide
            legend={u.electric}
            hint={u.electricHint}
            value={electric}
            onChange={(v) => {
              setElectric(v);
              if (v === "pge" || v === "unsure") setPgeGas(null);
            }}
            options={(["mid", "tid", "pge", "unsure"] as const).map((v) => ({ value: v, label: u.electricOpts[v] }))}
          />
          {(electric === "mid" || electric === "tid") && <Choice wide legend={u.pgeGas} value={pgeGas} onChange={setPgeGas} options={yesNoUnsure} />}
          <Field label={u.size} hint={u.sizeHint}>
            {({ id, describedBy }) => (
              <select id={id} aria-describedby={describedBy} className="hf__input" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {Array.from({ length: MAX_HOUSEHOLD }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={u.income} hint={u.incomeHint}>
            {({ id, describedBy }) => <MoneyInput id={id} describedBy={describedBy} value={income} onChange={setIncome} />}
          </Field>
          <Choice
            legend={u.per}
            value={per}
            onChange={setPer}
            options={[
              { value: "month", label: c.perMonth },
              { value: "year", label: c.perYear },
            ]}
          />
          <fieldset className="hchoice hf--wide" aria-describedby="util-gets-hint">
            <legend className="hf__label">{u.gets}</legend>
            <p className="hf__hint" id="util-gets-hint">
              {u.getsHint}
            </p>
            <div className="hchecks">
              {ENROLLED.map((e) => (
                <label key={e} className="hcheck">
                  <input type="checkbox" checked={gets.includes(e)} onChange={() => toggle(e)} />
                  {b.enrolled[e]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section aria-labelledby="util-results">
        <h4 id="util-results">{u.resultsTitle}</h4>
        <div aria-live="polite">
          {income.trim() !== "" && cents == null && <p>{c.moneyInvalid}</p>}
          {(cents == null || electric == null) && income.trim() === "" && <p>{u.fillFirst}</p>}
          {cents != null && electric == null && <p>{u.chooseUtility}</p>}
          {groups && <p className="hstat hben__summary">{u.summary(groups.likely.length, groups.maybe.length, groups.unlikely.length)}</p>}
        </div>
        {groups && (
          <>
            {!utilityKnown && <p className="hf__hint">{u.gasPending}</p>}
            {(["likely", "maybe", "unlikely"] as const).map((v) =>
              groups[v].length === 0 ? null : (
                <section key={v} className="hben__group" aria-labelledby={`util-${v}`}>
                  <h5 id={`util-${v}`}>
                    {b.verdictTitle[v]} ({groups[v].length})
                  </h5>
                  {groups[v].map((r) => (
                    <ProgramCard key={r.id} r={r} b={b} c={c} money={money} size={size} />
                  ))}
                </section>
              ),
            )}
          </>
        )}
      </section>

      <section aria-labelledby="util-shutoff">
        <h4 id="util-shutoff" ref={shutoffRef} tabIndex={-1}>
          {u.shutoffTitle}
        </h4>
        <h5>{u.shutoffPge}</h5>
        <FactList facts={UTIL_FACTS.shutoff.filter((f) => f.id !== "mid-tid" && f.id !== "ecip")} />
        <h5>{u.shutoffOthers}</h5>
        <FactList facts={UTIL_FACTS.shutoff.filter((f) => f.id === "mid-tid" || f.id === "ecip")} />
      </section>

      <section aria-labelledby="util-debt">
        <h4 id="util-debt">{u.debtTitle}</h4>
        <FactList facts={UTIL_FACTS.debt} />
      </section>

      <section aria-labelledby="util-medical">
        <h4 id="util-medical">{u.medicalTitle}</h4>
        <FactList facts={UTIL_FACTS.medical} />
        <div className="hdir__actions">
          {(["pge", "tid", "mid"] as const).map((k) => (
            <ExtLink key={k} href={MEDICAL_LINKS[k]} newTab={c.newTab}>
              {u.medicalApply[k]}
            </ExtLink>
          ))}
        </div>
      </section>

      <section aria-labelledby="util-scams">
        <h4 id="util-scams">{u.scamsTitle}</h4>
        <FactList facts={UTIL_FACTS.scams} />
      </section>

      <section aria-labelledby="util-call">
        <h4 id="util-call">{u.callTitle}</h4>
        <ul className="hplaces">
          {Object.values(UTIL_CONTACTS).map((p) => (
            <li key={p.phone}>
              <strong>{p.name[lang]}</strong> <Phone number={p.phone} />
              {"note" in p && p.note && (
                <>
                  <br />
                  <span className="hf__hint">{p.note[lang]}</span>
                </>
              )}
              <br />
              <ExtLink href={p.url} newTab={c.newTab}>
                {u.website}
                <span className="sr-only"> ({p.name[lang]})</span>
              </ExtLink>
            </li>
          ))}
        </ul>
      </section>

      <p className="hf__hint">{u.notAdvice}</p>
      <Sources
        heading={c.sourcesHeading}
        checked={c.checkedOn(longDate(UTIL_CHECKED, locale))}
        items={UTIL_SOURCES}
        newTab={c.newTab}
        report={{ topic: u.title, checked: UTIL_CHECKED }}
      />
    </>
  );
}
