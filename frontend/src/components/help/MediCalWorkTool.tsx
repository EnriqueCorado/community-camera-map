// "Medi-Cal's new work rules (2027)": does the rule apply, are you exempt, do
// your hours or income meet it, and what to do now. Answers stay in this
// component's state (never stored, never sent); logic in help/medi-cal-work.ts.
import { useId, useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { MEDI_CAL_WORK_COPY, type MediCalWorkCopy } from "../../help/medi-cal-work-copy";
import { MCW, MCW_CHECKED, MCW_CONTACTS, MCW_FACTS, MCW_SOURCES } from "../../help/medi-cal-work-facts";
import {
  creditHours,
  parseAmount,
  workRules,
  type Activity,
  type AgeBand,
  type Coverage,
  type ExemptId,
  type HardshipId,
  type School,
  type WorkOutcome,
} from "../../help/medi-cal-work";
import { formatMoney, parseMoney } from "../../help/money";
import { longDate } from "../../help/dates";
import { Choice, ExtLink, FactList, Field, MoneyInput, Phone, Result, Sources, type Tone } from "./ui";

const EXEMPT: ExemptId[] = ["pregnant", "child13", "caregiver", "frail", "treatment", "native", "foster", "veteran", "calfresh", "released", "medicare", "ssi", "otherGroup"];
const HARDSHIP: HardshipId[] = ["hospital", "travel"];
const TONE: Record<WorkOutcome["kind"], Tone> = { incomplete: "info", "not-covered": "good", exempt: "good", meets: "good", short: "warn" };

/** A typed field and how it parsed: `bad` when text is there but isn't a valid number. */
const amount = (s: string, max: number) => {
  const value = parseAmount(s, max);
  return { value, bad: s.trim() !== "" && value == null };
};
const money = (s: string) => {
  const n = parseMoney(s);
  return { value: n == null ? null : Math.round(n * 100), bad: s.trim() !== "" && n == null };
};

/** A count of hours (or credits): text, so "12.5" or "12,5" can be typed naturally. */
function NumberField({ label, hint, value, onChange, bad }: { label: string; hint?: string; value: string; onChange: (v: string) => void; bad: boolean }) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={bad || undefined}
          className="hf__input"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={7}
        />
      )}
    </Field>
  );
}

function titleOf(res: WorkOutcome, m: MediCalWorkCopy): string {
  switch (res.kind) {
    case "not-covered":
      return m.notCoveredTitle;
    case "exempt":
      return res.maybe ? m.exemptMaybeTitle : m.exemptTitle;
    case "meets":
      return m.meetsTitle;
    case "short":
      return m.shortTitle;
    default:
      return "";
  }
}

/** How a month compares with the rule (used alone, or under a "maybe" exemption). */
function ActivityText({ a, m, fmt }: { a: Activity; m: MediCalWorkCopy; fmt: (cents: number) => string }) {
  if (a.kind === "meets") {
    return (
      <>
        <p>{m.meetsBy(a.by, a.hours, fmt(MCW.incomeCents), MCW.hours)}</p>
        <p>{m.meetsTodo}</p>
      </>
    );
  }
  return (
    <>
      <p>{m.shortText(a.hours, a.missingHours, MCW.hours)}</p>
      {a.missingCents != null && <p>{m.shortMoney(fmt(a.missingCents), fmt(MCW.incomeCents))}</p>}
      {a.hardship.length > 0 && <p>{m.shortHardship}</p>}
      <ul>
        {m.shortIdeas.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

export function MediCalWorkTool({ c }: { c: HelpCopy }) {
  const { lang, locale } = useI18n();
  const m = MEDI_CAL_WORK_COPY[lang];
  const ids = useId();
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [age, setAge] = useState<AgeBand | null>(null);
  const [exempt, setExempt] = useState<ExemptId[]>([]);
  const [noneApply, setNoneApply] = useState(false);
  const [hardship, setHardship] = useState<HardshipId[]>([]);
  const [work, setWork] = useState("");
  const [volunteer, setVolunteer] = useState("");
  const [program, setProgram] = useState("");
  const [school, setSchool] = useState<School | null>(null);
  const [credits, setCredits] = useState("");
  const [classHours, setClassHours] = useState("");
  const [income, setIncome] = useState("");
  const [seasonal, setSeasonal] = useState(false);
  const [seasonalAvg, setSeasonalAvg] = useState("");

  const fmt = (n: number) => formatMoney(n / 100, locale);
  const showExemptions = coverage != null && coverage !== "restricted" && age === "19to64";
  const onlyFrail = exempt.length > 0 && exempt.every((e) => e === "frail");
  const askActivities = showExemptions && (noneApply || onlyFrail);

  // Only the fields on screen count, and a field that doesn't parse holds the result back.
  const f = {
    work: amount(work, MCW.maxMonthHours),
    volunteer: amount(volunteer, MCW.maxMonthHours),
    program: amount(program, MCW.maxMonthHours),
    credits: amount(credits, 40),
    classHours: amount(classHours, MCW.maxMonthHours),
    income: money(income),
    seasonalAvg: money(seasonalAvg),
  };
  // Messages for fields on screen that don't parse (money and counts word it differently).
  const visibleBad = askActivities
    ? [
        f.income.bad && `${m.income}: ${c.moneyInvalid}`,
        f.work.bad && m.numberInvalid(m.workHours),
        f.volunteer.bad && m.numberInvalid(m.volunteerHours),
        f.program.bad && m.numberInvalid(m.programHours),
        school === "less" && f.credits.bad && m.numberInvalid(m.credits),
        school === "less" && f.classHours.bad && m.numberInvalid(m.classHours),
        seasonal && f.seasonalAvg.bad && `${m.seasonalAvg}: ${c.moneyInvalid}`,
      ].filter((x): x is string => !!x)
    : [];
  const computed = workRules({
    coverage,
    age,
    exempt,
    noneApply,
    hardship,
    workHours: f.work.value,
    volunteerHours: f.volunteer.value,
    programHours: f.program.value,
    school,
    credits: f.credits.value,
    classHours: f.classHours.value,
    incomeCents: f.income.value,
    seasonal,
    seasonalAvgCents: f.seasonalAvg.value,
  });
  const res: WorkOutcome = visibleBad.length && (computed.kind === "meets" || computed.kind === "short") ? { kind: "incomplete" } : computed;

  const toggleExempt = (e: ExemptId) => {
    setNoneApply(false);
    setExempt((x) => (x.includes(e) ? x.filter((y) => y !== e) : [...x, e]));
  };
  const chooseNone = () => {
    setExempt([]);
    setNoneApply((v) => !v);
  };

  return (
    <>
      <h3>{m.title}</h3>
      <p className="help__lead">{m.lead}</p>
      <p className="hf__hint">{m.private}</p>

      <section className="hcard" aria-labelledby={`${ids}-form`}>
        <h4 id={`${ids}-form`} className="sr-only">
          {m.title}
        </h4>
        <div className="hform">
          <Choice
            wide
            legend={m.qCoverage}
            hint={coverage === "unsure" ? m.unsureNote : undefined}
            value={coverage}
            onChange={setCoverage}
            options={(["full", "applying", "restricted", "unsure"] as const).map((v) => ({ value: v, label: m.coverage[v] }))}
          />
          {coverage !== "restricted" && (
            <Choice wide legend={m.qAge} value={age} onChange={setAge} options={(["under19", "19to64", "65plus"] as const).map((v) => ({ value: v, label: m.age[v] }))} />
          )}
          {showExemptions && (
            <fieldset className="hchoice hf--wide" aria-describedby={`${ids}-exempt-hint`}>
              <legend className="hf__label">{m.qExempt}</legend>
              <p className="hf__hint" id={`${ids}-exempt-hint`}>
                {m.qExemptHint}
              </p>
              <div className="hchecks">
                {EXEMPT.map((e) => (
                  <label key={e} className="hcheck">
                    <input
                      type="checkbox"
                      checked={exempt.includes(e)}
                      onChange={() => toggleExempt(e)}
                      aria-describedby={m.exemptNote[e] ? `${ids}-note-${e}` : undefined}
                    />
                    <span>
                      {m.exempt[e]}
                      {m.exemptNote[e] && (
                        <span className="hf__hint hcheck__note" id={`${ids}-note-${e}`}>
                          {m.exemptNote[e]}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
                <label className="hcheck">
                  <input type="checkbox" checked={noneApply} onChange={chooseNone} />
                  {m.none}
                </label>
              </div>
            </fieldset>
          )}
          {askActivities && (
            <fieldset className="hf--wide hmcw__acts" aria-describedby={`${ids}-acts-hint`}>
              <legend className="hf__label">{m.activitiesTitle}</legend>
              <p className="hf__hint" id={`${ids}-acts-hint`}>
                {m.activitiesHint}
              </p>
              <div className="hform">
                <Field label={m.income} hint={m.incomeHint}>
                  {({ id, describedBy }) => <MoneyInput id={id} describedBy={describedBy} value={income} onChange={setIncome} />}
                </Field>
                <NumberField label={m.workHours} hint={m.workHoursHint} value={work} onChange={setWork} bad={f.work.bad} />
                <NumberField label={m.volunteerHours} hint={m.volunteerHoursHint} value={volunteer} onChange={setVolunteer} bad={f.volunteer.bad} />
                <NumberField label={m.programHours} hint={m.programHoursHint} value={program} onChange={setProgram} bad={f.program.bad} />
                <Choice
                  wide
                  legend={m.qSchool}
                  hint={m.qSchoolHint}
                  value={school}
                  onChange={setSchool}
                  options={(["half", "less", "no"] as const).map((v) => ({ value: v, label: m.school[v] }))}
                />
                {school === "less" && (
                  <>
                    <NumberField label={m.credits} hint={m.creditsHint(Math.round(creditHours(1)))} value={credits} onChange={setCredits} bad={f.credits.bad} />
                    <NumberField label={m.classHours} value={classHours} onChange={setClassHours} bad={f.classHours.bad} />
                  </>
                )}
                <label className="hcheck hf--wide">
                  <input type="checkbox" checked={seasonal} onChange={() => setSeasonal((v) => !v)} />
                  {m.seasonal}
                </label>
                {seasonal && (
                  <Field label={m.seasonalAvg}>{({ id, describedBy }) => <MoneyInput id={id} describedBy={describedBy} value={seasonalAvg} onChange={setSeasonalAvg} />}</Field>
                )}
                <fieldset className="hchoice hf--wide">
                  <legend className="hf__label">{m.qHardship}</legend>
                  <div className="hchecks">
                    {HARDSHIP.map((h) => (
                      <label key={h} className="hcheck">
                        <input type="checkbox" checked={hardship.includes(h)} onChange={() => setHardship((x) => (x.includes(h) ? x.filter((y) => y !== h) : [...x, h]))} />
                        {m.hardship[h]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </fieldset>
          )}
        </div>
      </section>

      {/* Announced: only problems and the one-line verdict (not the whole card on every keystroke). */}
      <div aria-live="polite">
        {visibleBad.map((msg) => (
          <p key={msg} role="alert" className="hmcw__bad">
            {msg}
          </p>
        ))}
        {res.kind !== "incomplete" && <p className="sr-only">{titleOf(res, m)}</p>}
      </div>
      {res.kind !== "incomplete" && (
        <Result tone={TONE[res.kind]} title={titleOf(res, m)}>
          {res.kind === "not-covered" && <p>{m.notCovered[res.reason]}</p>}
          {res.kind === "exempt" && (
            <>
              <p>{m.exemptBecause(res.reasons.map((r) => m.exemptShort[r]).join("; "))}</p>
              {res.maybe && <p>{m.exemptMaybeText}</p>}
              <p>{m.exemptTodo}</p>
              {res.maybe && res.activity && (
                <>
                  <p className="hresult__title">{m.exemptMaybeHours}</p>
                  <ActivityText a={res.activity} m={m} fmt={fmt} />
                </>
              )}
            </>
          )}
          {(res.kind === "meets" || res.kind === "short") && <ActivityText a={res} m={m} fmt={fmt} />}
        </Result>
      )}

      <h3>{m.todoTitle}</h3>
      <ul>
        {m.todo.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="hf__hint">{MCW_FACTS.caveat[lang]}</p>

      <h3>{m.ruleTitle}</h3>
      <FactList facts={MCW_FACTS.rule} />
      <h3>{m.exemptListTitle}</h3>
      <FactList facts={MCW_FACTS.exempt} />
      <h3>{m.whenTitle}</h3>
      <FactList facts={MCW_FACTS.when} />
      <h3>{m.noticeTitle}</h3>
      <FactList facts={MCW_FACTS.notice} />
      <h3>{m.immigrantsTitle}</h3>
      <FactList facts={MCW_FACTS.immigrants} />

      <h3>{m.helpTitle}</h3>
      <ul className="hplaces">
        {[MCW_CONTACTS.county, MCW_CONTACTS.hca, MCW_CONTACTS.helpline].map((p) => (
          <li key={p.url}>
            <strong>{p.name[lang]}</strong>
            {p.phone && (
              <>
                {" "}
                <Phone number={p.phone} />
              </>
            )}
            {" · "}
            <ExtLink href={p.url} newTab={c.newTab}>
              {c.website}
            </ExtLink>
          </li>
        ))}
        <li>{MCW_CONTACTS.offices[lang]}</li>
        <li>
          <ExtLink href={MCW_CONTACTS.benefitsCal.url} newTab={c.newTab}>
            {MCW_CONTACTS.benefitsCal.name[lang]}
          </ExtLink>
        </li>
      </ul>

      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(MCW_CHECKED, locale))} items={MCW_SOURCES} newTab={c.newTab} report={{ topic: m.title, checked: MCW_CHECKED }} />
    </>
  );
}
