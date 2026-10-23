// "Money you may be missing": a quick, private screener for food, health,
// utility, phone and tax-credit programs. Answers stay in this component's
// state (never stored, never sent); the logic is in help/benefits.ts.
import { useState } from "react";
import "./benefits.css";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { BENEFITS_COPY, type BenefitsCopy, type Money } from "../../help/benefits-copy";
import { BENEFITS_CHECKED, BENEFITS_SOURCES, PROGRAMS, PUBLIC_CHARGE, TABLES, TAX, TIPS, type Per } from "../../help/benefits-facts";
import {
  byVerdict,
  screen,
  toCents,
  type Answers,
  type Electric,
  type Enrolled,
  type ProgramResult,
  type TaxId,
  type Verdict,
  type YesNo,
  type Youngest,
} from "../../help/benefits";
import { MAX_HOUSEHOLD } from "../../help/fpl";
import { formatMoney, parseMoney } from "../../help/money";
import { longDate, todayIso } from "../../help/dates";
import { Choice, ExtLink, Field, MoneyInput, Phone, Sources } from "./ui";

const ENROLLED: Enrolled[] = ["medi-cal", "calfresh", "wic", "calworks", "ssi"];
const TONE: Record<Verdict, string> = { likely: "good", maybe: "warn", unlikely: "info" };
const TAX_PROGRAMS = new Set(["caleitc", "yctc", "federal-eitc"]);

export function BenefitsHelp({ c }: { c: HelpCopy }) {
  const { lang, locale } = useI18n();
  const b = BENEFITS_COPY[lang];
  const [size, setSize] = useState(1);
  const [income, setIncome] = useState("");
  const [per, setPer] = useState<Per>("month");
  const [children, setChildren] = useState<number | null>(null);
  const [youngest, setYoungest] = useState<Youngest | null>(null);
  const [pregnant, setPregnant] = useState<YesNo | null>(null);
  const [older, setOlder] = useState<YesNo | null>(null);
  const [gets, setGets] = useState<Enrolled[]>([]);
  const [electric, setElectric] = useState<Electric | null>(null);
  const [pgeGas, setPgeGas] = useState<YesNo | "unsure" | null>(null);
  const [taxId, setTaxId] = useState<TaxId | null>(null);

  const cents = toCents(parseMoney(income));
  const answers: Answers | null =
    cents == null
      ? null
      : {
          size,
          income: cents,
          per,
          children: children ?? undefined,
          youngest: youngest ?? undefined,
          pregnant: pregnant ?? undefined,
          olderOrDisabled: older ?? undefined,
          gets,
          electric: electric ?? undefined,
          pgeGas: pgeGas ?? undefined,
          taxId: taxId ?? undefined,
        };
  const res = answers ? screen(answers, todayIso()) : null;
  const groups = res ? byVerdict(res.results) : null;
  const money: Money = (n) => formatMoney(n / 100, locale);
  const maxChildren = Math.max(0, size - 1);

  const onSize = (n: number) => {
    setSize(n);
    if (children != null && children > Math.max(0, n - 1)) {
      setChildren(Math.max(0, n - 1));
      if (n <= 1) setYoungest(null);
    }
  };
  const toggle = (e: Enrolled) => setGets((g) => (g.includes(e) ? g.filter((x) => x !== e) : [...g, e]));
  const yesNo = [
    { value: "yes" as const, label: c.yes },
    { value: "no" as const, label: c.no },
  ];

  return (
    <>
      <p className="help__lead">{b.lead}</p>
      <p>
        <strong>{b.privateNote}</strong>
      </p>

      <section className="hcard" aria-labelledby="ben-imm">
        <h3 id="ben-imm">{b.immigrationTitle}</h3>
        <p>{b.immigrationIntro}</p>
        <h4>{b.publicChargeTitle}</h4>
        <p>{PUBLIC_CHARGE.text[lang]}</p>
        <p className="hf__hint">{PUBLIC_CHARGE.caveat[lang]}</p>
        <div className="hdir__actions">
          {PUBLIC_CHARGE.sources.map((s) => (
            <ExtLink key={s.url} href={s.url} newTab={c.newTab} hrefLang="en">
              {s === PUBLIC_CHARGE.sources[1] ? b.freeLegal : s.label}
            </ExtLink>
          ))}
        </div>
      </section>

      <section className="hcard" aria-labelledby="ben-form">
        <h3 id="ben-form">{b.formTitle}</h3>
        <div className="hform">
          <Field label={b.size} hint={b.sizeHint}>
            {({ id, describedBy }) => (
              <select id={id} aria-describedby={describedBy} className="hf__input" value={size} onChange={(e) => onSize(Number(e.target.value))}>
                {Array.from({ length: MAX_HOUSEHOLD }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={b.income} hint={b.incomeHint}>
            {({ id, describedBy }) => <MoneyInput id={id} describedBy={describedBy} value={income} onChange={setIncome} />}
          </Field>
          <Choice
            legend={b.per}
            value={per}
            onChange={setPer}
            options={[
              { value: "month", label: c.perMonth },
              { value: "year", label: c.perYear },
            ]}
          />
          <Field label={b.children} hint={b.childrenHint}>
            {({ id, describedBy }) => (
              <select
                id={id}
                aria-describedby={describedBy}
                className="hf__input"
                value={children ?? ""}
                onChange={(e) => {
                  setChildren(e.target.value === "" ? null : Number(e.target.value));
                  if (e.target.value === "0") setYoungest(null);
                }}
              >
                <option value="">{b.choose}</option>
                {Array.from({ length: maxChildren + 1 }, (_, i) => i).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {children != null && children > 0 && (
            <Choice
              wide
              legend={b.youngest}
              value={youngest}
              onChange={setYoungest}
              options={(["under5", "five", "6to18"] as const).map((v) => ({ value: v, label: b.youngestOpts[v] }))}
            />
          )}
          <Choice wide legend={b.pregnant} value={pregnant} onChange={setPregnant} options={yesNo} />
          <Choice wide legend={b.olderOrDisabled} value={older} onChange={setOlder} options={yesNo} />
          <fieldset className="hchoice hf--wide" aria-describedby="ben-gets-hint">
            <legend className="hf__label">{b.gets}</legend>
            <p className="hf__hint" id="ben-gets-hint">
              {b.getsHint}
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
          <Choice
            wide
            legend={b.electric}
            hint={b.electricHint}
            value={electric}
            onChange={setElectric}
            options={(["mid", "tid", "pge", "unsure"] as const).map((v) => ({ value: v, label: b.electricOpts[v] }))}
          />
          {(electric === "mid" || electric === "tid") && (
            <Choice
              wide
              legend={b.pgeGas}
              value={pgeGas}
              onChange={setPgeGas}
              options={[...yesNo, { value: "unsure" as const, label: c.notSure }]}
            />
          )}
          <Choice
            wide
            legend={b.taxId}
            hint={b.taxIdHint}
            value={taxId}
            onChange={setTaxId}
            options={(["ssn", "itin", "none", "unsure"] as const).map((v) => ({ value: v, label: b.taxIdOpts[v] }))}
          />
        </div>
      </section>

      <section aria-labelledby="ben-results">
        <h3 id="ben-results">{b.resultsTitle}</h3>
        <div aria-live="polite">
          {income.trim() !== "" && cents == null && <p role="alert">{c.moneyInvalid}</p>}
          {!res && income.trim() === "" && <p>{b.fillFirst}</p>}
          {res && groups && (
            <>
              <p className="hstat hben__summary">{b.summary(groups.likely.length, groups.maybe.length, groups.unlikely.length)}</p>
              {res.pending.length > 0 && <p>{b.pending(res.pending.length)}</p>}
            </>
          )}
        </div>
        {res && groups && (
          <>
            <p className="hf__hint">{b.changeNote}</p>
            {(["likely", "maybe", "unlikely"] as const).map((v) =>
              groups[v].length === 0 ? null : (
                <section key={v} className="hben__group" aria-labelledby={`ben-${v}`}>
                  <h4 id={`ben-${v}`}>
                    {b.verdictTitle[v]} ({groups[v].length})
                  </h4>
                  <p className="hf__hint">{b.verdictIntro[v]}</p>
                  {groups[v].map((r) => (
                    <ProgramCard key={r.id} r={r} b={b} c={c} money={money} size={size} />
                  ))}
                </section>
              ),
            )}
          </>
        )}
      </section>

      <h3>{b.tipsTitle}</h3>
      <ul>
        {TIPS.map((t) => (
          <li key={t.id}>
            {t.text[lang]}
            {t.source && (
              <>
                {" "}
                <span className="hf__hint">
                  (
                  <ExtLink href={t.source.url} newTab={c.newTab} hrefLang="en">
                    {b.limitSource}
                  </ExtLink>
                  )
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(BENEFITS_CHECKED, locale))} items={BENEFITS_SOURCES} newTab={c.newTab} report={{ topic: c.benefitsViewScreener, checked: BENEFITS_CHECKED }} />
    </>
  );
}

/** One program's result (also used by the utility-bill tool). */
export function ProgramCard({ r, b, c, money, size }: { r: ProgramResult; b: BenefitsCopy; c: HelpCopy; money: Money; size: number }) {
  const { lang } = useI18n();
  const p = PROGRAMS[r.id];
  const headId = `ben-card-${r.id}`;
  const table = r.table ? TABLES[r.table] : null;
  const period = TAX_PROGRAMS.has(r.id) ? TAX.period[lang] : table?.period[lang];
  const source = table?.source ?? p.sources[0];
  const compact = r.verdict === "unlikely";
  return (
    <article className={`hresult hresult--${TONE[r.verdict]} hben__card`} aria-labelledby={headId}>
      <h5 id={headId} className="hresult__title">
        {p.name[lang]}
      </h5>
      <p>
        {p.gives[lang]}
        {r.upTo && !compact && <> {b.upTo(money(r.upTo.cents), r.upTo.per, size, r.upTo.year, TAX.year)}</>}
      </p>
      <p className="hben__label">{b.why}</p>
      <ul className="hben__why">
        {r.reasons.map((x, i) => (
          <li key={i}>{b.reason(x, money)}</li>
        ))}
      </ul>
      {period && (
        <p className="hf__hint">
          {b.limitsFor(period)}{" "}
          {source && (
            <ExtLink href={source.url} newTab={c.newTab} hrefLang="en">
              {b.limitSource}
            </ExtLink>
          )}
        </p>
      )}
      <p className="hben__label">{b.apply}</p>
      <div className="hdir__actions">
        <ExtLink href={p.apply.url} newTab={c.newTab}>
          {p.apply.urlLabel}
        </ExtLink>
        {p.apply.phones.map((ph) => (
          <span key={ph.number}>
            {ph.label ? `${ph.label[lang]}: ` : ""}
            <Phone number={ph.number} />
          </span>
        ))}
      </div>
      {!compact && p.apply.office && <p className="hben__office">{p.apply.office[lang]}</p>}
      {compact ? (
        <details className="hben__more">
          <summary>{b.immigration}</summary>
          <p>{p.immigration[lang]}</p>
        </details>
      ) : (
        <p className="hben__imm">
          <strong>{b.immigration}:</strong> {p.immigration[lang]}
        </p>
      )}
      {"notes" in p && p.notes && !compact && (
        <details className="hben__more">
          <summary>{b.more}</summary>
          <ul>
            {p.notes.map((n, i) => (
              <li key={i}>{n[lang]}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
