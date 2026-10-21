import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { DEPOSIT_FACTS, MOBILE_FACTS, RENT_FACTS, RENT_SOURCES, REPAIR_FACTS, type Contact, type Fact } from "../../help/facts";
import { checkIncrease, coverage, type CoverageAnswers, type HomeType, type YesNo } from "../../help/rent-cap";
import { addDays, longDate } from "../../help/dates";
import { formatMoney, parseMoney } from "../../help/money";
import { depositLetter, repairLetter } from "../../help/letters";
import { builtAge, lookupAddress, type ParcelMatch } from "../../help/parcels";
import { Choice, ExtLink, Field, MoneyInput, Phone, Result, Sources } from "./ui";
import { LetterBuilder } from "./LetterBuilder";

type View = "rent" | "repairs" | "deposit" | "mobile";

export function RenterHelp({
  c,
  mobileHome,
  onMobileHome,
  onLegal,
}: {
  c: HelpCopy;
  mobileHome: boolean;
  onMobileHome: (on: boolean) => void;
  onLegal: () => void;
}) {
  const { lang, locale } = useI18n();
  const [view, setView] = useState<View>(mobileHome ? "mobile" : "rent");
  useEffect(() => {
    if (mobileHome) setView("mobile");
  }, [mobileHome]);
  const pick = (v: View) => {
    setView(v);
    if ((v === "mobile") !== mobileHome) onMobileHome(v === "mobile");
  };
  const views: [View, string][] = [
    ["rent", c.rentViewIncrease],
    ["repairs", c.rentViewRepairs],
    ["deposit", c.rentViewDeposit],
    ["mobile", c.rentViewMobile],
  ];

  return (
    <>
      <p className="help__lead">{c.rentLead}</p>
      <div className="hsub" role="group" aria-label={c.rentViewLabel}>
        {views.map(([v, label]) => (
          <button key={v} type="button" className={`chip${view === v ? " chip--on" : ""}`} aria-pressed={view === v} onClick={() => pick(v)}>
            {label}
          </button>
        ))}
      </div>

      {view === "rent" && <RentIncrease c={c} onMobileOwner={() => pick("mobile")} />}
      {view === "repairs" && (
        <>
          <h3>{c.repairsTitle}</h3>
          <FactList facts={REPAIR_FACTS.rights} />
          <h3>{repairLetter.title[lang]}</h3>
          <p>{repairLetter.blurb[lang]}</p>
          <LetterBuilder def={repairLetter} c={c} />
          <h3>{c.repairsInspectors}</h3>
          <p>{c.repairsInspectorsText}</p>
          <ContactList contacts={REPAIR_FACTS.codeEnforcement} c={c} />
        </>
      )}
      {view === "deposit" && (
        <>
          <h3>{c.depositTitle}</h3>
          <FactList facts={DEPOSIT_FACTS.rights} />
          <ContactList contacts={[DEPOSIT_FACTS.smallClaims]} c={c} />
          <h3>{depositLetter.title[lang]}</h3>
          <p>{depositLetter.blurb[lang]}</p>
          <LetterBuilder def={depositLetter} c={c} />
        </>
      )}
      {view === "mobile" && (
        <>
          <h3>{c.mobileTitle}</h3>
          <p>{c.mobileLead}</p>
          <FactList facts={MOBILE_FACTS.rights} />
          <ContactList contacts={MOBILE_FACTS.contacts} c={c} />
          <p>
            <button type="button" className="linkbtn" onClick={() => pick("rent")}>
              {c.mobileRentInstead}
            </button>
          </p>
        </>
      )}

      <Result tone="info" title={c.rentNeedHelp}>
        <p>{c.rentNeedHelpText}</p>
        <button type="button" className="hbtn" onClick={onLegal}>
          {c.rentSeeLegal}
        </button>
      </Result>
      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(RENT_FACTS.checked, locale))} items={RENT_SOURCES} newTab={c.newTab} />
    </>
  );
}

const useLang = () => useI18n().lang;

function FactList({ facts }: { facts: readonly Fact[] }) {
  const lang = useLang();
  return (
    <ul>
      {facts.map((f) => (
        <li key={f.id}>
          {f[lang]} <span className="hf__hint">({f.cite})</span>
        </li>
      ))}
    </ul>
  );
}

function ContactList({ contacts, c }: { contacts: readonly Contact[]; c: HelpCopy }) {
  const lang = useLang();
  return (
    <ul>
      {contacts.map((x) => (
        <li key={x.url}>
          <ExtLink href={x.url} newTab={c.newTab}>
            {x.name[lang]}
          </ExtLink>
          {x.phone && (
            <>
              {" · "}
              <Phone number={x.phone} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// --------------------------------------------------- "Is my increase legal?"

const EMPTY: CoverageAnswers = { type: null, newBuilt: null, affordable: null, exemptNotice: null, corporateOwner: null, ownerInDuplex: null };

function RentIncrease({ c, onMobileOwner }: { c: HelpCopy; onMobileOwner: () => void }) {
  const { lang, locale } = useI18n();
  const [a, setA] = useState<CoverageAnswers>(EMPTY);
  const set = <K extends keyof CoverageAnswers>(k: K, v: CoverageAnswers[K]) => setA((old) => ({ ...old, [k]: v }));
  const [lowest, setLowest] = useState("");
  const [next, setNext] = useState("");
  const [effective, setEffective] = useState("");
  const [noticed, setNoticed] = useState("");
  const [byMail, setByMail] = useState<YesNo | null>(null);

  const yn = (unsure = true) => [
    { value: "yes" as YesNo, label: c.yes },
    { value: "no" as YesNo, label: c.no },
    ...(unsure ? [{ value: "unsure" as YesNo, label: c.notSure }] : []),
  ];
  const isHouse = a.type === "house" || a.type === "mobile-rented";
  const answered =
    a.type != null &&
    (a.type === "mobile-rented" || a.newBuilt != null) &&
    a.affordable != null &&
    (!isHouse || (a.exemptNotice != null && a.corporateOwner != null)) &&
    (a.type !== "duplex" || a.ownerInDuplex != null);
  const cov = answered ? coverage(a) : null;

  const low = parseMoney(lowest);
  const high = parseMoney(next);
  const result =
    low != null && high != null && low > 0 && effective
      ? checkIncrease({ lowestRent: low, newRent: high, effective, noticed: noticed || undefined, byMail: byMail === "yes" }, RENT_FACTS.periods)
      : null;
  const fmt = (n: number) => formatMoney(n, locale);
  const exemptText = (id: string) => RENT_FACTS.exemptions.find((e) => e.id === id)?.[lang] ?? "";

  return (
    <>
      <h3>{c.capTitle}</h3>
      <p>{c.capIntro(RENT_FACTS.periods.at(-1)!.maxPct, longDate(RENT_FACTS.periods.at(-1)!.from, locale), longDate(RENT_FACTS.periods.at(-1)!.to, locale))}</p>

      <section className="hcard" aria-labelledby="cap-step1">
        <h4 id="cap-step1">{c.capStep1}</h4>
        <div className="hform hform--1">
          <Choice<HomeType | "mobile-owned">
            legend={c.capHomeType}
            value={a.type}
            onChange={(v) => (v === "mobile-owned" ? onMobileOwner() : set("type", v))}
            options={[
              { value: "apartment", label: c.homeApartment },
              { value: "house", label: c.homeHouse },
              { value: "duplex", label: c.homeDuplex },
              { value: "mobile-rented", label: c.homeMobileRented },
              { value: "mobile-owned", label: c.homeMobileOwned },
            ]}
          />
          {a.type && a.type !== "mobile-rented" && (
            <>
              <BuiltLookup c={c} onAge={(age) => set("newBuilt", age)} />
              <Choice legend={c.capNewBuilt} hint={c.capNewBuiltHint} value={a.newBuilt} onChange={(v) => set("newBuilt", v)} options={yn()} />
            </>
          )}
          {a.type && (
            <Choice legend={c.capAffordable} hint={c.capAffordableHint} value={a.affordable} onChange={(v) => set("affordable", v)} options={yn()} />
          )}
          {isHouse && (
            <>
              <Choice legend={c.capNotice} hint={c.capNoticeHint} value={a.exemptNotice} onChange={(v) => set("exemptNotice", v)} options={yn()} />
              <Choice
                legend={a.type === "mobile-rented" ? c.capCorporateMobile : c.capCorporate}
                hint={c.capCorporateHint}
                value={a.corporateOwner}
                onChange={(v) => set("corporateOwner", v)}
                options={yn()}
              />
            </>
          )}
          {a.type === "duplex" && (
            <Choice legend={c.capDuplexOwner} value={a.ownerInDuplex} onChange={(v) => set("ownerInDuplex", v)} options={yn()} />
          )}
        </div>
        <div aria-live="polite">
          {cov && (
            <Result
              tone={cov.status === "covered" ? "good" : cov.status === "exempt" ? "warn" : "info"}
              title={cov.status === "covered" ? c.covCovered : cov.status === "exempt" ? c.covExempt : c.covMaybe}
            >
              {cov.reasons.length > 0 && (
                <ul>
                  {cov.reasons.map((r) => (
                    <li key={r}>{exemptText(r)}</li>
                  ))}
                </ul>
              )}
              <p>{cov.status === "exempt" ? c.covExemptNext : cov.status === "maybe" ? c.covMaybeNext : c.covCoveredNext}</p>
            </Result>
          )}
        </div>
      </section>

      <section className="hcard" aria-labelledby="cap-step2">
        <h4 id="cap-step2">{c.capStep2}</h4>
        <div className="hform">
          <Field label={c.capLowest} hint={c.capLowestHint}>
            {({ id, describedBy }) => <MoneyInput id={id} describedBy={describedBy} value={lowest} onChange={setLowest} />}
          </Field>
          <Field label={c.capNew}>
            {({ id, describedBy }) => <MoneyInput id={id} describedBy={describedBy} value={next} onChange={setNext} />}
          </Field>
          <Field label={c.capEffective}>
            {({ id }) => <input id={id} type="date" className="hf__input" value={effective} onChange={(e) => setEffective(e.target.value)} />}
          </Field>
          <Field label={c.capNoticed} hint={c.capNoticedHint}>
            {({ id, describedBy }) => (
              <input id={id} aria-describedby={describedBy} type="date" className="hf__input" value={noticed} onChange={(e) => setNoticed(e.target.value)} />
            )}
          </Field>
          <Choice legend={c.capByMail} value={byMail} onChange={setByMail} options={yn(false)} />
        </div>

        <div aria-live="polite">
          {(lowest.trim() !== "" && low == null) || (next.trim() !== "" && high == null) ? <p role="alert">{c.moneyInvalid}</p> : null}
          {result && !result.period && <Result tone="info" title={c.capNoPeriod}>{c.capNoPeriodText}</Result>}
          {result && result.period && result.maxRent != null && (
            <>
              <Result tone={result.overBy > 0 ? "bad" : "good"} title={result.overBy > 0 ? c.capOver(fmt(result.overBy)) : c.capWithin}>
                <p className="hstat">{c.capPct(result.pct.toLocaleString(locale))}</p>
                <p>{c.capMath(fmt(low!), result.period.maxPct, fmt(result.maxRent), longDate(result.period.from, locale), longDate(result.period.to, locale))}</p>
                {cov && cov.status !== "covered" && <p>{c.capIfCovered}</p>}
                {result.overBy > 0 && <p>{c.capOverNext}</p>}
              </Result>
            </>
          )}
          {result && result.noticeGiven != null && (
            <Result
              tone={result.noticeGiven >= result.noticeRequired ? "good" : "bad"}
              title={result.noticeGiven >= result.noticeRequired ? c.noticeOk : c.noticeShort}
            >
              <p>
                {result.noticeGiven < 0
                  ? c.noticeAfter
                  : c.noticeMath(result.noticeGiven, result.noticeRequired, result.over10, byMail === "yes")}
              </p>
              {result.noticeGiven < result.noticeRequired && noticed && (
                <p>{c.noticeEarliest(longDate(addDays(noticed, result.noticeRequired) ?? noticed, locale))}</p>
              )}
            </Result>
          )}
        </div>
      </section>

      <h3>{c.capRulesTitle}</h3>
      <FactList facts={[...RENT_FACTS.capRules, ...RENT_FACTS.notice]} />
      <h4>{c.capExemptionsTitle}</h4>
      <FactList facts={RENT_FACTS.exemptions} />
      <p className="hf__hint">{c.capSunset(longDate(RENT_FACTS.sunset, locale))}</p>
    </>
  );
}

/** "When was my building built?" from the baked assessor roll, all in-browser. */
function BuiltLookup({ c, onAge }: { c: HelpCopy; onAge: (v: YesNo | null) => void }) {
  const { locale } = useI18n();
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "bad" | "none" | "error" | "done">("idle");
  const [hits, setHits] = useState<ParcelMatch[]>([]);
  const seq = useRef(0); // only the latest lookup may update the result
  const filled = useRef(false); // the age answer below came from a lookup
  const year = new Date().getFullYear();

  const look = (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    const mine = ++seq.current;
    lookupAddress(q)
      .then((found) => {
        if (mine !== seq.current) return;
        if (found == null) return setState("bad");
        setHits(found);
        setState(found.length ? "done" : "none");
        const ages = new Set(found.map((m) => builtAge(m, year)));
        if (ages.size === 1) {
          const age = [...ages][0];
          onAge(age === "new" ? "yes" : age === "old" ? "no" : "unsure");
          filled.current = true;
        } else if (filled.current) {
          // A new lookup that can't answer must not leave the last address's answer.
          onAge(null);
          filled.current = false;
        }
      })
      .catch(() => mine === seq.current && setState("error"));
  };

  return (
    <div className="hcard hcard--inset">
      <form className="hf" onSubmit={look}>
        <label className="hf__label" htmlFor="built-q">
          {c.lookupTitle}
        </label>
        <p className="hf__hint" id="built-hint">
          {c.lookupHint}
        </p>
        <div className="hf__row">
          <input
            id="built-q"
            aria-describedby="built-hint"
            className="hf__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="1234 Main St, Modesto"
            autoComplete="off"
            maxLength={120}
          />
          <button type="submit" className="hbtn hbtn--fixed" disabled={state === "busy"}>
            {c.lookupButton}
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {state === "busy" && <p className="hf__hint">{c.loading}</p>}
        {state === "bad" && <p>{c.lookupBad}</p>}
        {state === "none" && <p>{c.lookupNone}</p>}
        {state === "error" && <p>{c.lookupError}</p>}
        {state === "done" &&
          hits.map((m, i) => {
            const age = builtAge(m, year);
            return (
              <p key={i}>
                <strong>
                  {[m.number, m.dir, m.street, m.suffix].filter(Boolean).join(" ")}, {m.city}
                </strong>
                {": "}
                {c.lookupYears(m.minYear, m.maxYear)}
                {m.use && ` (${c.useLabel[m.use]})`}. {c.lookupAge[age](year - RENT_FACTS.newConstructionYears)}
              </p>
            );
          })}
        {state === "done" && <p className="hf__hint">{c.lookupCaveat(longDate(PARCEL_AS_OF, locale))}</p>}
      </div>
    </div>
  );
}

/** Date of the baked assessor snapshot (frontend/public/data/parcels/meta.json). */
const PARCEL_AS_OF = "2026-10-19";
