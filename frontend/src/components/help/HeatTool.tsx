import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { HEAT_COPY, type HeatCopy } from "../../help/heat-copy";
import { HEAT_FACTS, type HeatContact, type HeatRule, type Symptoms } from "../../help/heat-facts";
import "./heat.css";
import { HEAT_CITIES, getForecast } from "../../help/heat-forecast";
import { displayTemp, heatRules, parseTemp, type DailyForecast, type Setting, type Tier, type WorkType } from "../../help/heat";
import { longDate } from "../../help/dates";
import { Choice, ExtLink, Field, Phone, Result, Sources, type Tone, FactList } from "./ui";

type Forecast = { city: string; status: "loading" } | { city: string; status: "error" } | { city: string; status: "ok"; data: DailyForecast };

const WORK_TYPES: WorkType[] = ["agriculture", "construction", "landscaping", "oil-gas", "heavy-transport", "other-outdoor"];
const TIERS: Tier[] = ["always", "over80", "high95", "indoor82", "indoor87"];

/** Work tab → "Heat at work today": the Cal/OSHA heat rules for a temperature,
 *  with a forecast heads-up for a Stanislaus city. Nothing typed leaves the page:
 *  the only request is the forecast for a fixed city-center point. */
export function HeatTool({ c }: { c: HelpCopy }) {
  const { lang, locale } = useI18n();
  const h = HEAT_COPY[lang];
  const [city, setCity] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [fc, setFc] = useState<Forecast | null>(null);
  const [typed, setTyped] = useState("");
  const [setting, setSetting] = useState<Setting | null>(null);
  const [work, setWork] = useState<WorkType | null>(null);
  const [special, setSpecial] = useState<"yes" | "no" | "unsure" | null>(null);

  useEffect(() => {
    if (!city) {
      setFc(null);
      return;
    }
    let live = true;
    setFc({ city, status: "loading" });
    getForecast(city).then(
      (data) => live && setFc({ city, status: "ok", data }),
      () => live && setFc({ city, status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [city, attempt]);

  const forecast = fc?.status === "ok" ? fc.data : null;
  // Rules use the raw forecast (80.4°F is over 80); round only for display.
  const forecastHigh = forecast?.todayHigh ?? null;
  const site = parseTemp(typed);
  const typedBad = typed.trim() !== "" && site == null;
  // A typed worksite reading wins; the forecast is only a stand-in.
  const temp = site ?? (typedBad ? null : forecastHigh);
  const fromSite = site != null;
  const ready = temp != null && setting != null && (setting === "indoor" || work != null);
  const res = ready ? heatRules({ tempF: temp, setting, work: work ?? undefined, indoorSpecial: special === "yes" }) : null;
  // A typed reading is shown as typed; a forecast is rounded (see displayTemp).
  const shown = temp == null ? 0 : fromSite ? Math.round(temp * 10) / 10 : displayTemp(temp);

  const tierTitle: Record<Tier, string> = {
    always: h.tierAlways,
    over80: h.tierOver80,
    high95: h.tierHigh95,
    indoor82: h.tierIndoor82,
    indoor87: h.tierIndoor87,
  };
  const tone: Tone = !res ? "info" : res.tiers.includes("high95") || res.tiers.includes("indoor87") ? "bad" : res.tiers.includes("over80") || res.tiers.includes("indoor82") ? "warn" : "info";
  const next: Record<number, string> = { 80: h.next80, 95: h.next95, 82: h.next82, 87: h.next87 };

  return (
    <>
      <p className="help__lead">{h.lead}</p>

      <section className="hcard" aria-labelledby="heat-step1">
        <h3 id="heat-step1">{h.step1}</h3>
        <div className="hform">
          <Field label={h.city} hint={h.cityHint} wide>
            {({ id, describedBy }) => (
              <select id={id} aria-describedby={describedBy} className="hf__input" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">{h.chooseCity}</option>
                {HEAT_CITIES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div aria-live="polite">
          {fc?.status === "loading" && <p>{c.loading}</p>}
          {fc?.status === "error" && (
            <p>
              {h.forecastError}{" "}
              <button type="button" className="linkbtn" onClick={() => setAttempt((n) => n + 1)}>
                {h.retry}
              </button>
            </p>
          )}
          {forecast && forecastHigh != null && (
            <>
              <p className="hstat heat__fc">
                {h.forecastToday(displayTemp(forecastHigh))}{" "}
                {forecast.tomorrowHigh != null && <span className="heat__tomorrow">{h.forecastTomorrow(Math.round(forecast.tomorrowHigh))}</span>}
              </p>
              {forecast.heatWave && forecast.pastAvg != null && (
                <Result tone="warn" title={h.heatWaveTitle}>
                  <p>{h.heatWave(displayTemp(forecastHigh), Math.round(forecast.pastAvg))}</p>
                </Result>
              )}
            </>
          )}
        </div>
        {forecast && (
          <p className="hf__hint">
            <ExtLink href="https://open-meteo.com/" newTab={c.newTab}>
              {h.attribution}
            </ExtLink>
          </p>
        )}
        <p className="hf__hint">{h.forecastCaveat}</p>
      </section>

      <section className="hcard" aria-labelledby="heat-step2">
        <h3 id="heat-step2">{h.step2}</h3>
        <div className="hform">
          <Field label={h.temp} hint={h.tempHint}>
            {({ id, describedBy }) => (
              <div className="hf__money">
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={typedBad || undefined}
                  className="hf__input"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={6}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
                <span aria-hidden="true">°F</span>
              </div>
            )}
          </Field>
          <Choice
            legend={h.setting}
            hint={`${h.indoor}: ${lowerFirst(HEAT_FACTS.indoorExamples[lang])}`}
            value={setting}
            onChange={setSetting}
            options={[
              { value: "outdoor", label: h.outdoor },
              { value: "indoor", label: h.indoor },
            ]}
          />
          {setting === "outdoor" && (
            <Choice wide legend={h.work} hint={h.workHint} value={work} onChange={setWork} options={WORK_TYPES.map((w) => ({ value: w, label: h.workTypes[w] }))} />
          )}
          {setting === "indoor" && (
            <Choice
              wide
              legend={h.indoorSpecial}
              hint={h.indoorSpecialHint}
              value={special}
              onChange={setSpecial}
              options={[
                { value: "yes", label: c.yes },
                { value: "no", label: c.no },
                { value: "unsure", label: c.notSure },
              ]}
            />
          )}
        </div>

        <div aria-live="polite">
          {typedBad && <p role="alert">{h.tempInvalid}</p>}
          {!res && !typedBad && <p className="hf__hint">{h.needMore}</p>}
          {res && temp != null && (
            <Result
              tone={tone}
              title={setting === "indoor" ? (res.indoorBelow ? h.resultIndoorBelow(shown) : h.resultIndoor(shown)) : h.resultOutdoor(shown)}
            >
              <p className="hf__hint">{fromSite ? h.basisSite : h.basisForecast}</p>
              {TIERS.filter((t) => res.tiers.includes(t)).map((t) => (
                <div key={t}>
                  <h4>{tierTitle[t]}</h4>
                  <FactList facts={res.rules.filter((r: HeatRule) => r.tier === t)} />
                </div>
              ))}
              {res.notHighHeatIndustry && (
                <>
                  <p>{h.notListed}</p>
                  <p className="hf__hint">{h.listedAre}</p>
                </>
              )}
              {res.nextAt != null && <p>{next[res.nextAt]}</p>}
              {setting === "indoor" && !res.tiers.includes("indoor87") && (
                <>
                  {special === "unsure" && <p>{h.indoorUnsure}</p>}
                  <p>{h.triggersTitle}</p>
                  <FactList facts={HEAT_FACTS.indoorTriggers} />
                </>
              )}
            </Result>
          )}
        </div>
        {setting === "indoor" && (
          <>
            <h4>{h.exceptionsTitle}</h4>
            <FactList facts={HEAT_FACTS.indoorExceptions} />
            <p className="hf__hint">{HEAT_FACTS.both[lang]}</p>
          </>
        )}
      </section>

      <h3>{h.payTitle}</h3>
      <FactList facts={HEAT_FACTS.pay} />

      <h3>{h.sickTitle}</h3>
      <Result tone="bad" title={h.strokeTitle}>
        <p>
          <strong>{h.ruleOfThumb}</strong>
        </p>
        <p>
          <a href="tel:911" className="hphone">
            {h.call911}
          </a>
        </p>
        <SymptomLists s={HEAT_FACTS.heatStroke} h={h} />
      </Result>
      <section className="hcard" aria-labelledby="heat-exhaustion">
        <h4 id="heat-exhaustion">{h.exhaustionTitle}</h4>
        <SymptomLists s={HEAT_FACTS.heatExhaustion} h={h} />
      </section>
      <section className="hcard" aria-labelledby="heat-cramps">
        <h4 id="heat-cramps">{h.crampsTitle}</h4>
        <SymptomLists s={HEAT_FACTS.heatCramps} h={h} />
      </section>

      <h3>{h.reportTitle}</h3>
      <p>
        <strong>{h.reportEmergency}</strong>
      </p>
      <p>{h.reportLead}</p>
      <ContactCard contact={HEAT_FACTS.calOshaLine} c={c} />
      <section className="hcard" aria-labelledby="heat-office">
        <h4 id="heat-office">{HEAT_FACTS.modestoOffice.name[lang]}</h4>
        <div className="hdir__actions">
          <Phone number={HEAT_FACTS.modestoOffice.phone} />
          <span>
            {h.email}: <a href={`mailto:${HEAT_FACTS.modestoOffice.email}`}>{HEAT_FACTS.modestoOffice.email}</a>
          </span>
        </div>
        <p className="hdir__meta">
          {h.address}: {HEAT_FACTS.modestoOffice.address}
        </p>
        <p className="hf__hint">{HEAT_FACTS.modestoOffice.hours[lang]}</p>
      </section>
      <p>
        <ExtLink href={HEAT_FACTS.complaintPage.url} newTab={c.newTab} hrefLang="en">
          {HEAT_FACTS.complaintPage.name[lang]}
        </ExtLink>
      </p>
      <FactList facts={HEAT_FACTS.complaint} />

      <h3>{h.rightsTitle}</h3>
      <FactList facts={HEAT_FACTS.rights} />
      <p>{h.retaliationReport}</p>
      <ContactCard contact={HEAT_FACTS.laborCommissioner} c={c} />
      <div className="hcard">
        <p className="hdir__meta">{HEAT_FACTS.retaliationUnit.name[lang]}</p>
        <div className="hdir__actions">
          <Phone number={HEAT_FACTS.retaliationUnit.phone} />
          <span>
            {h.email}: <a href={`mailto:${HEAT_FACTS.retaliationUnit.email}`}>{HEAT_FACTS.retaliationUnit.email}</a>
          </span>
          <ExtLink href={HEAT_FACTS.retaliationUnit.url} newTab={c.newTab} hrefLang="en">
            {c.website}
          </ExtLink>
        </div>
      </div>

      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(HEAT_FACTS.checked, locale))} items={HEAT_FACTS.sources} newTab={c.newTab} report={{ topic: c.workViewHeat, checked: HEAT_FACTS.checked }} />
    </>
  );
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);


function SymptomLists({ s, h }: { s: Symptoms; h: HeatCopy }) {
  const { lang } = useI18n();
  return (
    <>
      <p className="hf__label heat__label">{h.signs}</p>
      <ul>
        {s.signs[lang].map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="hf__label heat__label">{h.whatToDo}</p>
      <ul>
        {s.todo[lang].map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="hf__hint">CDC/NIOSH</p>
    </>
  );
}

function ContactCard({ contact, c }: { contact: HeatContact; c: HelpCopy }) {
  const { lang } = useI18n();
  const es = lang === "es" && contact.urlEs != null;
  return (
    <div className="hcard">
      <p className="hdir__meta">{contact.name[lang]}</p>
      <div className="hdir__actions">
        {contact.phone && <Phone number={contact.phone} />}
        <ExtLink href={es ? contact.urlEs! : contact.url} newTab={c.newTab} hrefLang={es ? "es" : "en"}>
          {c.website}
        </ExtLink>
      </div>
    </div>
  );
}
