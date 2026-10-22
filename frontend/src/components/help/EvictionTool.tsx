// "Got an eviction notice?" — finds the last day to act on a notice or on
// court papers, shows the count, and points to free help. All counting is
// local (help/eviction.ts); nothing typed here is stored or sent.
import { useId, useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { dayNumber, daysBetween, longDate, todayIso } from "../../help/dates";
import { COURT_HOLIDAYS_SOURCE } from "../../help/court-days";
import { daysLeft, evictionDeadline, urgency, DELIVERIES, NOTICE_KINDS, type Deadline, type Delivery, type NoticeKind } from "../../help/eviction";
import { EVICTION_FACTS, EVICTION_SOURCES, type Place } from "../../help/eviction-facts";
import { EVICTION_COPY, type EvictionCopy, type KindOrUnsure } from "../../help/eviction-copy";
import { Choice, ExtLink, Field, Phone, Result, Sources, type Tone, FactList } from "./ui";
import "./eviction.css";

/** "Wednesday, October 28, 2026" in the page language. */
function fullDate(iso: string, locale: string): string {
  const d = dayNumber(iso);
  if (d == null) return iso;
  return new Date(d * 86_400_000).toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function EvictionTool({ c, onLegal }: { c: HelpCopy; onLegal: () => void }) {
  const { lang, locale } = useI18n();
  const t = EVICTION_COPY[lang];
  const [kind, setKind] = useState<KindOrUnsure | null>(null);
  const [date, setDate] = useState("");
  const [delivery, setDelivery] = useState<Delivery | null>(null);

  const today = todayIso();
  const notice: NoticeKind | null = kind && kind !== "unsure" ? kind : null;
  const validDate = date !== "" && dayNumber(date) != null;
  const future = validDate && (daysBetween(today, date) ?? 0) > 0;
  const result = notice && validDate && !future && delivery ? evictionDeadline(notice, delivery, date) : null;
  const deliveries = notice === "summons" ? t.deliveriesSummons : t.deliveries;

  return (
    <>
      <h3>{t.title}</h3>
      <p>{t.intro}</p>

      <div className="hcard hev-q">
        <KindChoice t={t} value={kind} onChange={setKind} />
        {kind === "unsure" && (
          <Result tone="info" title={t.unsureTitle}>
            <p>{t.unsureText}</p>
          </Result>
        )}
      </div>

      <div className="hcard hev-q">
        <div className="hform">
          <Field label={t.step2} hint={t.dateHint} wide>
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="date"
                className="hf__input hev-date"
                autoComplete="off"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
        </div>
      </div>

      <div className="hcard hev-q">
        <div className="hform hform--1">
          <Choice<Delivery>
            legend={t.step3}
            value={delivery}
            onChange={setDelivery}
            options={DELIVERIES.map((d) => ({ value: d, label: deliveries[d] }))}
          />
        </div>
      </div>

      <div aria-live="polite" className="hev-out">
        {date !== "" && !validDate && <p role="alert">{t.invalidDate}</p>}
        {future && <p role="alert">{t.futureDate}</p>}
        {!result && kind !== "unsure" && !future && !(date !== "" && !validDate) && <p className="hf__hint">{t.fillAll}</p>}
        {result && <DeadlineView r={result} t={t} today={today} locale={locale} newTab={c.newTab} />}
      </div>

      <div className="hev-help">
        <p className="hev-help__lead">
          {t.legalLead} <strong>CRLA</strong> <Phone number={EVICTION_FACTS.places.crla.phone} />
        </p>
        <button type="button" className="hbtn hbtn--primary" onClick={onLegal}>
          {t.legalBtn}
        </button>
      </div>

      {notice && <NextSteps notice={notice} t={t} c={c} />}

      <h4>{t.rightsTitle}</h4>
      <FactList facts={EVICTION_FACTS.rights} />

      <h4>{t.helpTitle}</h4>
      <PlaceList places={[EVICTION_FACTS.places.crla, EVICTION_FACTS.places.selfHelp, EVICTION_FACTS.places.sentinel]} c={c} />

      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(EVICTION_FACTS.checked, locale))} items={EVICTION_SOURCES} newTab={c.newTab} />
    </>
  );
}

/** "What did you get?" with the words to look for at the top of the paper. */
function KindChoice({ t, value, onChange }: { t: EvictionCopy; value: KindOrUnsure | null; onChange: (v: KindOrUnsure) => void }) {
  const name = useId();
  // Court papers first: they are the most urgent and the easiest to miss.
  const kinds: KindOrUnsure[] = ["summons", ...NOTICE_KINDS.filter((k) => k !== "summons"), "unsure"];
  return (
    <fieldset className="hchoice">
      <legend className="hf__label">{t.step1}</legend>
      <div className="hev-kinds">
        {kinds.map((k) => (
          <label key={k} className={`hchoice__opt hev-kind${value === k ? " hchoice__opt--on" : ""}`}>
            <input type="radio" name={name} value={k} checked={value === k} onChange={() => onChange(k)} aria-describedby={`${name}-${k}`} />
            <span>
              <span className="hev-kind__label">{t.kinds[k].label}</span>
              <span className="hev-kind__top" id={`${name}-${k}`}>
                {t.kinds[k].top}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DeadlineView({ r, t, today, locale, newTab }: { r: Deadline; t: EvictionCopy; today: string; locale: string; newTab: string }) {
  const lang = useI18n().lang;
  if (!r.ok) {
    return (
      <Result tone="bad" title={t.callNowTitle}>
        <p>{r.reason === "rules-change-2027" ? t.rulesChangeText : t.callNowText}</p>
        <p>
          <strong>CRLA</strong> <Phone number={EVICTION_FACTS.places.crla.phone} />
        </p>
      </Result>
    );
  }
  const leftOrNull = daysLeft(today, r.deadline);
  if (leftOrNull == null) {
    return (
      <Result tone="bad" title={t.callNowTitle}>
        <p>{t.callNowText}</p>
        <p>
          <strong>CRLA</strong> <Phone number={EVICTION_FACTS.places.crla.phone} />
        </p>
      </Result>
    );
  }
  const left = leftOrNull;
  const u = urgency(left);
  const tone: Tone = u === "later" ? "warn" : "bad";
  const when = u === "passed" ? t.passed(-left) : u === "today" ? t.today : left === 1 ? t.tomorrow : t.inDays(left);
  const fd = (iso: string) => fullDate(iso, locale);
  const c = r.count;
  const substituted = r.delivery === "left" || r.delivery === "posted";

  return (
    <Result tone={tone} title={t.deadlineLabel[r.kind]}>
      <p className="hstat hev-deadline">{fd(r.deadline)}</p>
      <p className="hev-when">
        <strong>{when}</strong>
      </p>
      <p>{u === "passed" ? (r.kind === "summons" ? t.passedSummons : t.passedNotice) : t.meaning[r.kind]}</p>
      <p>
        <strong>{t.safeNote}</strong>
      </p>
      {r.notes.length > 0 && (
        <ul>
          {r.notes.map((n) => (
            <li key={n}>{t.notes[n]}</li>
          ))}
        </ul>
      )}
      <details className="hev-count">
        <summary>{t.countTitle}</summary>
        <p>
          {substituted
              ? t.countStartSubstituted(fd(r.start))
              : r.delivery === "mailed"
                ? t.countStartMailed(fd(r.start))
                : t.countStart(fd(r.start))}
        </p>
        {r.serviceComplete && <p>{t.countSummonsComplete(fd(r.serviceComplete))}</p>}
        {r.method === "calendar" ? (
          <>
            <p>{t.countCalendar(r.days, fd(c.rolledFrom ?? r.deadline))}</p>
            {c.rolledFrom && <p>{t.rolled(fd(c.rolledFrom), fd(r.deadline))}</p>}
          </>
        ) : (
          <>
            <p>{t.countCourt(r.days)}</p>
            <ol className="hev-days">
              {c.counted.map((d, i) => (
                <li key={d}>{t.dayN(i + 1, fd(d))}</li>
              ))}
            </ol>
          </>
        )}
        {c.holidays.length > 0 ? (
          <>
            <p>{t.holidaysSkipped}</p>
            <ul>
              {c.holidays.map((h) => (
                <li key={h.date}>
                  {h[lang]}: {fd(h.date)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>{t.noHolidays}</p>
        )}
        {c.weekendDays > 0 && <p>{t.weekendsSkipped(c.weekendDays)}</p>}
        {c.disputed.length > 0 && <p className="hf__hint">{t.disputed}</p>}
        <p className="hf__hint">
          <ExtLink href={COURT_HOLIDAYS_SOURCE.url} newTab={newTab}>
            {t.holidaySource}
          </ExtLink>
        </p>
      </details>
    </Result>
  );
}

function NextSteps({ notice, t, c }: { notice: NoticeKind; t: EvictionCopy; c: HelpCopy }) {
  const lang = useI18n().lang;
  const f = EVICTION_FACTS;
  if (notice === "summons") {
    return (
      <>
        <h4>{t.nextTitle}</h4>
        <p>{f.notices.summons[lang]}</p>
        <h4>{t.summonsWhereTitle}</h4>
        <PlaceList places={[f.places.turlock, f.places.selfHelp]} c={c} />
        <h4>{t.summonsStepsTitle}</h4>
        <FactList facts={f.summonsSteps} />
        <ul>
          <li>
            <ExtLink href={f.forms.answer} newTab={c.newTab}>
              {t.formAnswer}
            </ExtLink>
          </li>
          <li>
            <ExtLink href={f.forms.respond} newTab={c.newTab}>
              {t.formRespond}
            </ExtLink>
          </li>
          <li>
            <ExtLink href={f.forms.feeWaiver} newTab={c.newTab}>
              {t.formFeeWaiver}
            </ExtLink>
          </li>
        </ul>
      </>
    );
  }
  return (
    <>
      <h4>{t.nextTitle}</h4>
      <ul>
        <li>
          {f.notices[notice][lang]} <span className="hf__hint">({f.notices[notice].cite})</span>
        </li>
      </ul>
      <h4>{t.noticeRightsTitle}</h4>
      <FactList facts={f.afterNotice} />
    </>
  );
}


function PlaceList({ places, c }: { places: readonly Place[]; c: HelpCopy }) {
  const lang = useI18n().lang;
  return (
    <ul className="hev-places">
      {places.map((p) => (
        <li key={p.id}>
          <ExtLink href={p.url} newTab={c.newTab}>
            {p.name[lang]}
          </ExtLink>
          {p.phone && (
            <>
              {" · "}
              <Phone number={p.phone} />
            </>
          )}
          {p.address && <span className="hev-places__line">{p.address}</span>}
          {p.hours && <span className="hev-places__line">{p.hours[lang]}</span>}
          {p.note && <span className="hev-places__line hf__hint">{p.note[lang]}</span>}
        </li>
      ))}
    </ul>
  );
}
