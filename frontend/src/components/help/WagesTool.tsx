// "Unpaid wages": a week-by-week hours log -> regular / overtime / double
// time under the right rule set, minimum-wage shortfall, missed-break
// premiums and the late-final-pay penalty, with each line's Labor Code
// section; then how to file a wage claim, retaliation protections, and a
// demand letter. Everything runs in this tab: nothing typed is stored or sent.
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { dayNumber, longDate, todayIso } from "../../help/dates";
import { formatMoney, parseMoney } from "../../help/money";
import {
  breakPremiums,
  dailyWageCents,
  daysLate,
  minWageFor,
  parseCount,
  parseHours,
  rulesFor,
  toCents,
  waitingPenalty,
  wagesOwed,
  type Ending,
  type FarmSize,
  type Job,
  type WorkYear,
} from "../../help/wages";
import { MIN_WAGE, OT_RULES, WAGE_FACTS, WAGE_SOURCES } from "../../help/wages-facts";
import { WAGES_COPY } from "../../help/wages-copy";
import { wageLetter, type WageSummary } from "../../help/wages-letter";
import { Choice, ExtLink, Field, MoneyInput, Phone, Result, Sources, FactList } from "./ui";
import { LetterBuilder } from "./LetterBuilder";
import "./wages.css";

const MAX_WEEKS = 8;
const EMPTY_WEEK = () => Array.from({ length: 7 }, () => "");

type JobPick = "farm" | "household" | "other";
type HouseholdPick = "attendant" | "household" | "livein";
type EndPick = "still" | Ending;

export function WagesTool({ c, onLegal }: { c: HelpCopy; onLegal: () => void }) {
  const { lang, locale } = useI18n();
  const w = WAGES_COPY[lang];
  const fmt = (cents: number) => formatMoney(cents / 100, locale);
  // Hourly rates can have a fraction of a cent (1.5 x $16.95 = $25.425): show it, don't round it.
  const fmtRate = (cents: number) =>
    (cents / 100).toLocaleString(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const hrs = (min: number) => (min / 60).toLocaleString(locale, { maximumFractionDigits: 2 });

  // Step 1: the job
  const [jobPick, setJobPick] = useState<JobPick | null>(null);
  const [hhPick, setHhPick] = useState<HouseholdPick | null>(null);
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  // Each recent year, then one span of older years, then "earlier".
  const years: string[] = [];
  for (let y = thisYear; y >= WAGE_FACTS.earliestYear; y--) years.push(String(y));
  years.push(String(WAGE_FACTS.spanFrom), "earlier");
  const [yearPick, setYearPick] = useState<string>(String(thisYear));
  const [size, setSize] = useState<FarmSize | null>(null);
  const year: WorkYear = yearPick === "earlier" ? "earlier" : Number(yearPick);

  const job: Job | null = jobPick === "farm" ? "farm" : jobPick === "other" ? "general" : jobPick === "household" ? hhPick : null;
  const picked = job ? rulesFor(job, size, year, OT_RULES) : null;
  const minWage = minWageFor(year, MIN_WAGE);
  const sizeMatters = job === "farm" && year !== "earlier" && year < (OT_RULES.farm.fromYear ?? 0);

  // Step 2: hours and pay
  const [weekStart, setWeekStart] = useState(1); // Monday
  const [weeks, setWeeks] = useState<string[][]>([EMPTY_WEEK()]);
  const [rate, setRate] = useState("");
  const [paid, setPaid] = useState("");
  const focusWeek = useRef<number | null>(null);
  useEffect(() => {
    if (focusWeek.current == null) return;
    document.getElementById(`wk-${focusWeek.current}-0`)?.focus();
    focusWeek.current = null;
  }, [weeks.length]);

  const setHour = (wi: number, di: number, v: string) =>
    setWeeks((old) => old.map((wk, i) => (i === wi ? wk.map((d, j) => (j === di ? v : d)) : wk)));
  const addWeek = () => {
    if (weeks.length >= MAX_WEEKS) return;
    focusWeek.current = weeks.length;
    setWeeks((old) => [...old, EMPTY_WEEK()]);
  };
  const addRef = useRef<HTMLButtonElement>(null);
  const refocusAdd = useRef(false);
  const removeWeek = (wi: number) => {
    setWeeks((old) => old.filter((_, i) => i !== wi));
    // The Remove button is gone; at the week limit the Add button only
    // reappears after this render, so focus it once it exists.
    refocusAdd.current = true;
  };
  useEffect(() => {
    if (!refocusAdd.current) return;
    refocusAdd.current = false;
    addRef.current?.focus();
  }, [weeks.length]);

  const minutes = weeks.map((wk) => wk.map(parseHours));
  const badHours = minutes.some((wk) => wk.some((m) => m == null));
  const weekMinutes = minutes.map((wk) => wk.map((m) => m ?? 0));
  const totalMinutes = weekMinutes.flat().reduce((a, b) => a + b, 0);

  const rateNum = rate.trim() === "" ? null : parseMoney(rate);
  const badRate = rate.trim() !== "" && (rateNum == null || rateNum <= 0);
  const rateCents = rateNum != null && rateNum > 0 ? toCents(rateNum) : null;
  const paidNum = paid.trim() === "" ? 0 : parseMoney(paid);
  const badPaid = paidNum == null;
  const paidCents = toCents(paidNum ?? 0);
  const rateUsed = rateCents ?? minWage; // value hours at the minimum when no hourly rate
  // Break premiums and the late-pay penalty are owed at no less than the minimum wage.
  const premiumRate = rateUsed == null ? null : Math.max(rateUsed, minWage ?? 0);

  const wages =
    picked && !badHours && !badRate && !badPaid && paid.trim() !== "" && totalMinutes > 0
      ? wagesOwed({ weeks: weekMinutes, rateCents, minWageCents: minWage, paidCents, rules: picked.rules })
      : null;
  const seventh = !!picked?.rules.seventhDayDt && weekMinutes.some((wk) => wk.every((m) => m > 0));

  // Step 3: breaks and final pay
  const breaksApply = job !== "attendant" && job !== "livein";
  const [meal, setMeal] = useState("");
  const [rest, setRest] = useState("");
  const mealDays = parseCount(meal);
  const restDays = parseCount(rest);
  const badCount = breaksApply && (mealDays == null || restDays == null);
  const prem = breaksApply && premiumRate != null && !badCount ? breakPremiums(mealDays ?? 0, restDays ?? 0, premiumRate) : null;

  const [ending, setEnding] = useState<EndPick | null>(null);
  const [lastDay, setLastDay] = useState("");
  const [finalPaid, setFinalPaid] = useState<"yes" | "no" | null>(null);
  const [paidOn, setPaidOn] = useState("");
  const [usual, setUsual] = useState("");
  const ended = ending != null && ending !== "still";
  const usualMin = parseHours(usual);
  const lastN = dayNumber(lastDay);
  const paidN = finalPaid === "yes" ? dayNumber(paidOn) : finalPaid === "no" ? dayNumber(today) : null;
  const badPaidOn = ended && lastN != null && finalPaid === "yes" && paidN != null && paidN < lastN;
  const penalty =
    ended && lastN != null && paidN != null && !badPaidOn && usualMin != null && usualMin > 0 && premiumRate != null
      ? waitingPenalty(dailyWageCents(premiumRate, usualMin), daysLate(lastN, ending, paidN), WAGE_FACTS.penaltyMaxDays)
      : null;

  const mealCents = prem?.mealCents ?? 0;
  const restCents = prem?.restCents ?? 0;
  const penaltyCents = penalty?.cents ?? 0;
  const showPenalty = !!penalty && penalty.days > 0;
  const unpaidCents = wages?.unpaidCents ?? 0;
  const totalCents = unpaidCents + mealCents + restCents + penaltyCents;
  const showTable = wages != null || mealCents > 0 || restCents > 0 || penaltyCents > 0;

  const summary: WageSummary | null = showTable
    ? {
        unpaidCents,
        wageCite: picked?.cite ?? OT_RULES.general.cite,
        minWageShort: (wages?.minWageGapCents ?? 0) > 0,
        overtime: !!wages && wages.hours.ot + wages.hours.dt > 0,
        mealDays: mealDays ?? 0,
        mealCents,
        restDays: restDays ?? 0,
        restCents,
        penaltyDays: showPenalty ? penalty!.days : 0,
        penaltyCents,
        totalCents,
        ending: ended ? ending : null,
        lastDay: ended && lastN != null ? lastDay : null,
      }
    : null;
  const summaryKey = JSON.stringify(summary);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const letter = useMemo(() => wageLetter(summary), [summaryKey]);

  const dayNames = w.days;
  const label = (i: number) => dayNames[(weekStart + i) % 7] ?? "";
  const yearLabel = (y: string) =>
    y === "earlier"
      ? w.yearEarlier(WAGE_FACTS.spanFrom)
      : y === String(WAGE_FACTS.spanFrom)
        ? w.yearSpan(WAGE_FACTS.spanFrom, WAGE_FACTS.earliestYear - 1)
        : y;

  const ruleText = (): string => {
    if (!job || !picked) return "";
    if (!picked.known)
      return job === "livein" ? w.rulesLiveIn : w.rulesFarmEarlier((size === "large" ? OT_RULES.farmLarge : OT_RULES.farmSmall).fromYear ?? 0);
    if (job === "attendant") return w.rulesAttendant;
    if (job === "farm") return w.rulesFarm;
    if (job === "household") return w.rulesHousehold;
    return w.rulesGeneral;
  };

  return (
    <>
      <p className="help__lead">{w.lead}</p>

      <section className="hcard" aria-labelledby="wg-step1">
        <h3 id="wg-step1">{w.step1}</h3>
        <div className="hform hform--1">
          <Choice<JobPick>
            legend={w.jobType}
            value={jobPick}
            onChange={setJobPick}
            options={[
              { value: "farm", label: w.jobFarm },
              { value: "household", label: w.jobHousehold },
              { value: "other", label: w.jobOther },
            ]}
          />
          {jobPick === "household" && (
            <Choice<HouseholdPick>
              legend={w.hhKind}
              hint={w.hhKindHint}
              value={hhPick}
              onChange={setHhPick}
              options={[
                { value: "attendant", label: w.hhAttendant },
                { value: "household", label: w.hhOther },
                { value: "livein", label: w.hhLiveIn },
              ]}
            />
          )}
          <Choice<string>
            legend={w.workYear}
            hint={w.workYearHint}
            value={yearPick}
            onChange={setYearPick}
            options={years.map((y) => ({ value: y, label: yearLabel(y) }))}
          />
          {sizeMatters && (
            <Choice<FarmSize>
              legend={w.farmSize}
              hint={w.farmSizeHint}
              value={size}
              onChange={setSize}
              options={[
                { value: "large", label: w.farmLarge },
                { value: "small", label: w.farmSmall },
                { value: "unsure", label: c.notSure },
              ]}
            />
          )}
        </div>
        <div aria-live="polite">
          {picked && (
            <Result tone={picked.known ? "info" : "warn"} title={w.rulesTitle}>
              <p>
                {ruleText()} <span className="hf__hint">({picked.cite})</span>
              </p>
            </Result>
          )}
        </div>
      </section>

      <section className="hcard" aria-labelledby="wg-step2">
        <h3 id="wg-step2">{w.step2}</h3>
        <p className="hf__hint">{w.hoursHint}</p>
        <div className="hform">
          <Field label={w.weekStart} hint={w.weekStartHint}>
            {({ id, describedBy }) => (
              <select id={id} aria-describedby={describedBy} className="hf__input" value={weekStart} onChange={(e) => setWeekStart(Number(e.target.value))}>
                {dayNames.map((d, i) => (
                  <option key={d} value={i}>
                    {w.daysLong[i]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {weeks.map((wk, wi) => {
          const total = (weekMinutes[wi] ?? []).reduce((a, b) => a + b, 0);
          return (
            <fieldset key={wi} className="wweek">
              <legend className="hf__label">{w.weekLegend(wi + 1)}</legend>
              <div className="wweek__days">
                {wk.map((v, di) => {
                  const bad = minutes[wi]?.[di] === null;
                  return (
                    <div className="hf wweek__day" key={di}>
                      <label className="hf__label" htmlFor={`wk-${wi}-${di}`}>
                        {label(di)}
                      </label>
                      <input
                        id={`wk-${wi}-${di}`}
                        className="hf__input"
                        inputMode="decimal"
                        autoComplete="off"
                        maxLength={5}
                        aria-invalid={bad || undefined}
                        value={v}
                        onChange={(e) => setHour(wi, di, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="wweek__foot">
                <p className="hf__hint">{w.weekTotal(hrs(total))}</p>
                {wi > 0 && (
                  <button type="button" className="linkbtn" onClick={() => removeWeek(wi)}>
                    {w.removeWeek(wi + 1)}
                  </button>
                )}
              </div>
            </fieldset>
          );
        })}
        <p>
          {weeks.length < MAX_WEEKS ? (
            <button type="button" className="hbtn" ref={addRef} onClick={addWeek}>
              {w.addWeek}
            </button>
          ) : (
            <span className="hf__hint">{w.maxWeeks(MAX_WEEKS)}</span>
          )}
        </p>
        <div className="hform">
          <Field label={w.rate} hint={w.rateHint}>
            {({ id, describedBy }) => <MoneyInput id={id} describedBy={describedBy} value={rate} onChange={setRate} />}
          </Field>
          <Field label={w.paid} hint={w.paidHint}>
            {({ id, describedBy }) => <MoneyInput id={id} describedBy={describedBy} value={paid} onChange={setPaid} />}
          </Field>
        </div>
        <div aria-live="polite">
          {badHours && <p role="alert">{w.hoursInvalid}</p>}
          {(badRate || badPaid) && <p role="alert">{c.moneyInvalid}</p>}
        </div>
      </section>

      <section className="hcard" aria-labelledby="wg-step3">
        <h3 id="wg-step3">{w.step3}</h3>
        <p className="hf__hint">{w.step3Hint}</p>
        <h4>{w.breaksTitle}</h4>
        {breaksApply ? (
          <>
            <div className="hform">
              <Field label={w.mealDays} hint={w.mealDaysHint}>
                {({ id, describedBy }) => (
                  <input id={id} aria-describedby={describedBy} className="hf__input" inputMode="numeric" autoComplete="off" maxLength={3} value={meal} onChange={(e) => setMeal(e.target.value)} />
                )}
              </Field>
              <Field label={w.restDays} hint={w.restDaysHint}>
                {({ id, describedBy }) => (
                  <input id={id} aria-describedby={describedBy} className="hf__input" inputMode="numeric" autoComplete="off" maxLength={3} value={rest} onChange={(e) => setRest(e.target.value)} />
                )}
              </Field>
            </div>
            <div aria-live="polite">{badCount && <p role="alert">{w.countInvalid}</p>}</div>
          </>
        ) : (
          <p>{w.breaksAsk}</p>
        )}

        <h4>{w.finalTitle}</h4>
        <div className="hform hform--1">
          <Choice<EndPick>
            legend={w.ended}
            value={ending}
            onChange={setEnding}
            options={[
              { value: "still", label: w.endStill },
              { value: "fired", label: w.endFired },
              { value: "quitNotice", label: w.endQuitNotice },
              { value: "quitNoNotice", label: w.endQuitNoNotice },
              { value: "seasonal", label: w.endSeasonal },
            ]}
          />
        </div>
        {ended && (
          <div className="hform wfinal">
            <Field label={w.lastDay}>
              {({ id }) => <input id={id} type="date" className="hf__input" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />}
            </Field>
            <Field label={w.usualHours} hint={w.usualHoursHint}>
              {({ id, describedBy }) => (
                <input id={id} aria-describedby={describedBy} className="hf__input" inputMode="decimal" autoComplete="off" maxLength={5} value={usual} onChange={(e) => setUsual(e.target.value)} />
              )}
            </Field>
            <Choice
              legend={w.finalPaid}
              wide
              value={finalPaid}
              onChange={setFinalPaid}
              options={[
                { value: "yes" as const, label: c.yes },
                { value: "no" as const, label: w.notYet },
              ]}
            />
            {finalPaid === "yes" && (
              <Field label={w.paidOn}>
                {({ id }) => <input id={id} type="date" className="hf__input" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}
              </Field>
            )}
          </div>
        )}
        <div aria-live="polite">
          {ended && usual.trim() !== "" && usualMin == null && <p role="alert">{w.hoursInvalid}</p>}
          {badPaidOn && <p role="alert">{w.paidBeforeLast}</p>}
        </div>
      </section>

      <section className="hcard" aria-labelledby="wg-results">
        <h3 id="wg-results">{w.resultsTitle}</h3>
        <div aria-live="polite">
          {!showTable && (
            <p className="hf__hint">
              {!job
                ? w.needJob
                : rateUsed == null && (totalMinutes > 0 || !!mealDays || !!restDays)
                  ? w.needRate
                  : totalMinutes > 0 && paid.trim() === ""
                    ? w.needPaid
                    : w.resultsEmpty}
            </p>
          )}
          {showTable && (
            <>
              <Result tone={totalCents > 0 ? "warn" : "good"} title={totalCents > 0 ? w.totalTitle(fmt(totalCents)) : w.nothingOwed}>
                <p>{w.estimate}</p>
              </Result>
              <div className="wtable-wrap">
                <table className="wtable">
                  <caption>{w.tableCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{w.colItem}</th>
                      <th scope="col">{w.colHours}</th>
                      <th scope="col">{w.colAmount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wages && (
                      <>
                        <Row item={w.rowRegular(fmtRate(wages.rateCents))} cite={picked!.cite} hours={hrs(wages.hours.reg)} amount={fmt(wages.regularCents)} />
                        <Row item={w.rowOvertime(fmtRate(wages.rateCents))} cite={picked!.cite} hours={hrs(wages.hours.ot)} amount={fmt(wages.overtimeCents)} />
                        {wages.hours.dt > 0 && (
                          <Row item={w.rowDouble(fmtRate(wages.rateCents))} cite={picked!.cite} hours={hrs(wages.hours.dt)} amount={fmt(wages.doubleCents)} />
                        )}
                        {minWage != null && wages.minWageGapCents > 0 && (
                          <Row
                            item={w.rowMinWage(fmt(minWage))}
                            cite={MIN_WAGE.find((m) => m.year === year)?.cite ?? ""}
                            hours=""
                            amount={fmt(wages.minWageGapCents)}
                          />
                        )}
                        <Row item={w.rowEarned} hours={hrs(totalMinutes)} amount={fmt(wages.earnedCents)} kind="sub" />
                        <Row item={w.rowPaid} hours="" amount={`− ${fmt(wages.paidCents)}`} />
                        <Row item={w.rowUnpaid} hours="" amount={fmt(wages.unpaidCents)} kind="sub" />
                      </>
                    )}
                    {mealCents > 0 && <Row item={w.rowMeal(mealDays ?? 0)} cite="Lab. Code §226.7(c)" hours={hrs((mealDays ?? 0) * 60)} amount={fmt(mealCents)} />}
                    {restCents > 0 && <Row item={w.rowRest(restDays ?? 0)} cite="Lab. Code §226.7(c)" hours={hrs((restDays ?? 0) * 60)} amount={fmt(restCents)} />}
                    {showPenalty && <Row item={w.rowWaiting(penalty!.days)} cite="Lab. Code §201-203" hours="" amount={fmt(penaltyCents)} />}
                    <Row item={w.rowTotal} hours="" amount={fmt(totalCents)} kind="total" />
                  </tbody>
                </table>
              </div>
              <ul className="wnotes">
                {picked && !picked.known && <li>{w.noteOtUnknown}</li>}
                {rateCents == null && minWage != null && <li>{w.noteRateFromMin(fmt(minWage))}</li>}
                {minWage == null && wages && <li>{w.noteNoMinWage(yearLabel(yearPick))}</li>}
                {wages && wages.minWageGapCents > 0 && <li>{w.noteBelowMin}</li>}
                {seventh && <li>{w.noteSeventh(label(6))}</li>}
                {wages && wages.paidCents > wages.earnedCents && <li>{w.notePaidMore}</li>}
                {mealCents > 0 && restCents > 0 && <li>{w.noteBothBreaks}</li>}
                {showPenalty && <li>{w.noteWillful}</li>}
                {showPenalty && finalPaid === "no" && penalty!.days < WAGE_FACTS.penaltyMaxDays && <li>{w.notePenaltyGrowing(WAGE_FACTS.penaltyMaxDays)}</li>}
                <li>{w.noteRegularRate}</li>
              </ul>
            </>
          )}
        </div>
      </section>

      <h3>{w.claimTitle}</h3>
      <p>{w.claimIntro}</p>
      <FactList facts={WAGE_FACTS.claim} />
      <div className="hcard hcard--inset">
        <h4>{WAGE_FACTS.office.name[lang]}</h4>
        <p className="hdir__meta">{WAGE_FACTS.office.address}</p>
        <p className="hdir__meta">{WAGE_FACTS.office.hours[lang]}</p>
        <div className="hdir__actions">
          <Phone number={WAGE_FACTS.office.phone} />
          <a href={`mailto:${WAGE_FACTS.office.email}`}>{WAGE_FACTS.office.email}</a>
          <ExtLink href={WAGE_FACTS.office.url} newTab={c.newTab}>
            {w.officePage}
          </ExtLink>
        </div>
        <p className="hf__hint">{w.officeNote}</p>
      </div>
      <ul>
        <li>
          {w.statewide} <Phone number={WAGE_FACTS.statewide.phone} />
        </li>
        <li>
          <ExtLink href={WAGE_FACTS.statewide.online} newTab={c.newTab}>
            {w.fileOnline}
          </ExtLink>
        </li>
        <li>
          <ExtLink href={WAGE_FACTS.forms.es} newTab={c.newTab} hrefLang="es">
            {w.formEs}
          </ExtLink>
          {" · "}
          <ExtLink href={WAGE_FACTS.forms.en} newTab={c.newTab} hrefLang="en">
            {w.formEn}
          </ExtLink>
        </li>
      </ul>
      <h4>{w.bringTitle}</h4>
      <ul>
        {WAGE_FACTS.bring.map((b) => (
          <li key={b.en}>{b[lang]}</li>
        ))}
      </ul>

      <h3>{w.retaliationTitle}</h3>
      <FactList facts={WAGE_FACTS.retaliation} />
      <p>
        <ExtLink href={WAGE_FACTS.forms.retaliation} newTab={c.newTab}>
          {w.retaliationLink}
        </ExtLink>
      </p>

      <h3>{letter.title[lang]}</h3>
      <p>{letter.blurb[lang]}</p>
      <p className="hf__hint">{w.letterNote}</p>
      <LetterBuilder def={letter} c={c} />

      <Result tone="info" title={w.helpTitle}>
        <p>{w.helpText}</p>
        <p>
          <ExtLink href={WAGE_FACTS.legalAidAtWork.url} newTab={c.newTab}>
            {WAGE_FACTS.legalAidAtWork.name[lang]}
          </ExtLink>
          {" · "}
          <Phone number={WAGE_FACTS.legalAidAtWork.phone!} />
        </p>
        <p className="hf__hint">{w.laawNote}</p>
        <button type="button" className="hbtn" onClick={onLegal}>
          {w.helpButton}
        </button>
      </Result>

      <h3>{w.rulesHeading}</h3>
      <h4>{w.rulesOvertime}</h4>
      <FactList facts={WAGE_FACTS.overtime} />
      <h4>{w.rulesMinWage}</h4>
      <FactList facts={WAGE_FACTS.minWage} />
      <h4>{w.rulesBreaks}</h4>
      <FactList facts={WAGE_FACTS.breaks} />
      <h4>{w.rulesFinal}</h4>
      <FactList facts={WAGE_FACTS.finalPay} />

      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(WAGE_FACTS.checked, locale))} items={WAGE_SOURCES} newTab={c.newTab} />
    </>
  );
}

function Row({ item, cite, hours, amount, kind }: { item: string; cite?: string; hours: string; amount: string; kind?: "sub" | "total" }) {
  return (
    <tr className={kind ? `wtable__${kind}` : undefined}>
      <th scope="row">
        {item}
        {cite && <span className="wtable__cite">{cite}</span>}
      </th>
      <td>{hours}</td>
      <td>{amount}</td>
    </tr>
  );
}


