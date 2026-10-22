// Family emergency plan builder: who cares for the children, who to call,
// where the documents are. Everything lives in memory (the Immigration tab
// holds it, so switching to "Know your rights" and back keeps it); nothing is
// stored or sent. "Print or save as PDF" prints only the plan.
import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal, flushSync } from "react-dom";
import { LOCALE, useI18n, type Lang } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { longDate, todayIso } from "../../help/dates";
import {
  addEntry,
  emptyPlan,
  hasContent,
  MULTILINE_MAX,
  PLAN_SECTIONS,
  printSections,
  removeEntry,
  setField,
  TEXT_MAX,
  toggleTodo,
  type PlanSection,
  type PlanState,
} from "../../help/family-plan";
import { FAMILY_PLAN_COPY, type FamilyPlanCopy } from "../../help/family-plan-copy";
import { PLAN_CHECKED, PLAN_FACTS, PLAN_LINKS, PLAN_SOURCES } from "../../help/family-plan-facts";
import { RAPID_RESPONSE } from "../../help/rights-facts";
import { ExtLink, FactList, Field, Phone, Sources } from "./ui";
import "./family-plan.css";

type Paper = { mode: "filled" | "blank"; lang: Lang };

/** What's typed stays on the device: no autofill, and no spell check or
 *  writing assistant (some send the text to their servers). */
const PRIVATE_FIELD = { autoComplete: "off", spellCheck: false, autoCorrect: "off", autoCapitalize: "off", "data-gramm": "false" } as const;

export function FamilyPlanTool({
  c,
  plan,
  setPlan,
  onLegal,
  onRights,
  focusTitle,
}: {
  c: HelpCopy;
  plan: PlanState;
  setPlan: Dispatch<SetStateAction<PlanState>>;
  onLegal: () => void;
  onRights: () => void;
  /** Move focus to the title on open (when reached from a link in another view). */
  focusTitle?: boolean;
}) {
  const { lang } = useI18n();
  const p = FAMILY_PLAN_COPY[lang];
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [printLang, setPrintLang] = useState<Lang>(lang);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [asking, setAsking] = useState(false);
  const [status, setStatus] = useState("");
  // What to focus after the next render: an entry's first field, or a button.
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  useEffect(() => {
    const sel = focusNext.current;
    if (!sel) return;
    focusNext.current = null;
    root.current?.querySelector<HTMLElement>(sel)?.focus();
  });

  useEffect(() => {
    if (asking) cancelRef.current?.focus();
  }, [asking]);

  const add = (s: PlanSection) => {
    const n = plan.entries[s.id].length + 1;
    setPlan((old) => addEntry(old, s.id));
    focusNext.current = `[data-entry="${s.id}-${n - 1}"]`;
    setStatus(p.added(s.repeat!.item[lang], n));
  };

  const remove = (s: PlanSection, i: number) => {
    setPlan((old) => removeEntry(old, s.id, i));
    focusNext.current = `[data-add="${s.id}"]`;
    setStatus(p.removed(s.repeat!.item[lang], i + 1));
  };

  const print = (mode: Paper["mode"]) => {
    // An empty plan prints the blank one, rather than a page with only a title.
    const next: Paper = { mode: mode === "filled" && !hasContent(plan) ? "blank" : mode, lang: printLang };
    // Render the paper now (print() needs it in the page), then show only it.
    // Cleanup waits for afterprint: phones return from print() before the
    // preview is ready.
    flushSync(() => setPaper(next));
    document.documentElement.classList.add("printing-plan");
    const done = () => {
      document.documentElement.classList.remove("printing-plan");
      setPaper(null);
    };
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  };

  const clearAll = () => {
    setPlan(emptyPlan());
    setAsking(false);
    setStatus(p.cleared);
    focusNext.current = "h3";
  };

  return (
    <div ref={root} className="hplan">
      <h3 ref={titleRef} tabIndex={-1}>
        {p.title}
      </h3>
      <p className="help__lead">{p.lead}</p>
      <p className="hf__hint">{p.private}</p>
      <p className="hf__hint">
        {p.emergency}{" "}
        <button type="button" className="linkbtn" onClick={onRights}>
          {p.rightsLink}
        </button>
        {" · "}
        {RAPID_RESPONSE.name[lang]}: <Phone number={RAPID_RESPONSE.phone} />
      </p>

      {PLAN_SECTIONS.map((s) => (
        <PlanSectionForm key={s.id} s={s} plan={plan} setPlan={setPlan} p={p} c={c} uid={uid} onAdd={add} onRemove={remove} onLegal={onLegal} />
      ))}

      <section className="hcard hplan__done" aria-labelledby={`${uid}-done`}>
        <h4 id={`${uid}-done`}>{p.doneTitle}</h4>
        <p className="hf__hint">{p.sensitive}</p>
        <div className="hsub" role="group" aria-label={p.printLang}>
          {(["en", "es"] as Lang[]).map((l) => (
            <button key={l} type="button" lang={l} className={`chip${printLang === l ? " chip--on" : ""}`} aria-pressed={printLang === l} onClick={() => setPrintLang(l)}>
              {l === "en" ? "English" : "Español"}
            </button>
          ))}
        </div>
        <div className="hplan__actions">
          <button type="button" className="hbtn hbtn--primary" onClick={() => print("filled")}>
            {p.print}
          </button>
          <button type="button" className="hbtn" onClick={() => print("blank")}>
            {p.printBlank}
          </button>
          <button type="button" className="hbtn" data-clear aria-expanded={asking} onClick={() => setAsking(true)}>
            {p.clear}
          </button>
        </div>
        <p className="hf__hint">{p.printHint}</p>
        {asking && (
          <div className="hresult hresult--warn" role="group" aria-labelledby={`${uid}-ask`}>
            <p id={`${uid}-ask`} className="hresult__title">
              {p.clearAsk}
            </p>
            <div className="hplan__actions">
              <button type="button" className="hbtn hbtn--primary" onClick={clearAll}>
                {p.clearYes}
              </button>
              <button
                ref={cancelRef}
                type="button"
                className="hbtn"
                onClick={() => {
                  setAsking(false);
                  focusNext.current = "[data-clear]";
                }}
              >
                {p.clearNo}
              </button>
            </div>
          </div>
        )}
      </section>
      <p className="sr-only" role="status">
        {status}
      </p>

      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(PLAN_CHECKED, LOCALE[lang]))} items={PLAN_SOURCES} newTab={c.newTab} report={{ topic: p.title, checked: PLAN_CHECKED }} />
      {paper && createPortal(<PlanPaper plan={plan} paper={paper} />, document.body)}
    </div>
  );
}

function PlanSectionForm({
  s,
  plan,
  setPlan,
  p,
  c,
  uid,
  onAdd,
  onRemove,
  onLegal,
}: {
  s: PlanSection;
  plan: PlanState;
  setPlan: Dispatch<SetStateAction<PlanState>>;
  p: FamilyPlanCopy;
  c: HelpCopy;
  uid: string;
  onAdd: (s: PlanSection) => void;
  onRemove: (s: PlanSection, i: number) => void;
  onLegal: () => void;
}) {
  const { lang } = useI18n();
  const list = plan.entries[s.id];
  const facts = PLAN_FACTS[s.id];
  const headingId = `${uid}-${s.id}`;
  const fields = (i: number) => (
    <div className="hform">
      {s.fields.map((f, j) => (
        <Field key={f.id} label={f.label[lang]} hint={f.hint?.[lang]} wide={f.kind === "multiline"}>
          {({ id, describedBy }) =>
            f.kind === "multiline" ? (
              <textarea
                id={id}
                aria-describedby={describedBy}
                className="hf__input"
                rows={3}
                maxLength={MULTILINE_MAX}
                {...PRIVATE_FIELD}
                data-entry={j === 0 ? `${s.id}-${i}` : undefined}
                value={list[i]![f.id] ?? ""}
                onChange={(e) => setPlan((old) => setField(old, s.id, i, f.id, e.target.value))}
              />
            ) : (
              <input
                id={id}
                aria-describedby={describedBy}
                className="hf__input"
                type={f.kind === "tel" ? "tel" : "text"}
                inputMode={f.kind === "tel" ? "tel" : undefined}
                maxLength={TEXT_MAX}
                {...PRIVATE_FIELD}
                data-entry={j === 0 ? `${s.id}-${i}` : undefined}
                value={list[i]![f.id] ?? ""}
                onChange={(e) => setPlan((old) => setField(old, s.id, i, f.id, e.target.value))}
              />
            )
          }
        </Field>
      ))}
    </div>
  );

  return (
    <section className="hcard" aria-labelledby={headingId}>
      <h4 id={headingId}>{s.title[lang]}</h4>
      {s.lead && <p className="hf__hint">{s.lead[lang]}</p>}

      {s.repeat ? (
        <>
          {list.map((_, i) => (
            <fieldset key={i} className="hplan__entry">
              <legend className="hf__label">{p.entry(s.repeat!.item[lang], i + 1)}</legend>
              {fields(i)}
              {list.length > s.repeat!.min && (
                <button type="button" className="linkbtn hplan__remove" onClick={() => onRemove(s, i)}>
                  {p.remove(s.repeat!.item[lang], i + 1)}
                </button>
              )}
            </fieldset>
          ))}
          {list.length < s.repeat.max && (
            <button type="button" className="hbtn" data-add={s.id} onClick={() => onAdd(s)}>
              {p.add(s.repeat.item[lang])}
            </button>
          )}
        </>
      ) : (
        fields(0)
      )}

      {s.todo && (
        <fieldset className="hchoice hplan__todo">
          <legend className="hf__label">{p.todo}</legend>
          <div className="hchecks">
            {s.todo.map((t) => (
              <label key={t.id} className="hcheck">
                <input type="checkbox" checked={!!plan.done[t.id]} onChange={() => setPlan((old) => toggleTodo(old, t.id))} />
                {t.label[lang]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {s.id === "caregiver" && <CaregiverLinks p={p} c={c} />}
      {s.id === "legal" && (
        <p>
          <button type="button" className="linkbtn" onClick={onLegal}>
            {p.legalButton}
          </button>
        </p>
      )}

      {facts && (
        <details className="hplan__why">
          <summary>{p.learnMore}</summary>
          <FactList facts={facts} />
        </details>
      )}
    </section>
  );
}

function CaregiverLinks({ p, c }: { p: FamilyPlanCopy; c: HelpCopy }) {
  const { lang } = useI18n();
  return (
    <>
      <p className="hf__label">{p.caaLinks}</p>
      <ul className="hplan__links">
        <li>
          <ExtLink href={PLAN_LINKS.caaForm.en} newTab={c.newTab} hrefLang="en">
            {p.caaFormEn}
          </ExtLink>
          {" · "}
          <ExtLink href={PLAN_LINKS.caaForm.es} newTab={c.newTab} hrefLang="es">
            {p.caaFormEs}
          </ExtLink>
        </li>
        <li>
          <ExtLink href={PLAN_LINKS.caaPage[lang]} newTab={c.newTab} hrefLang={lang}>
            {p.caaHelp}
          </ExtLink>
        </li>
        <li>
          <ExtLink href={PLAN_LINKS.gc211} newTab={c.newTab}>
            {p.gc211}
          </ExtLink>
        </li>
        <li>
          <ExtLink href={PLAN_LINKS.ilrcPdf[lang]} newTab={c.newTab} hrefLang={lang}>
            {p.ilrcPlan}
          </ExtLink>
        </li>
      </ul>
    </>
  );
}

/** The printed plan: only this is visible while printing (see family-plan.css). */
function PlanPaper({ plan, paper }: { plan: PlanState; paper: Paper }) {
  const p = FAMILY_PLAN_COPY[paper.lang];
  const sections = printSections(plan, paper.lang, paper.mode);
  const blank = paper.mode === "blank";
  return (
    <div className="plan-print" lang={paper.lang}>
      <h1>{p.paperTitle}</h1>
      <p>{blank ? p.paperBlankLead : p.paperMade(longDate(todayIso(), LOCALE[paper.lang]))}</p>
      {sections.map((s) => (
        <section key={s.id}>
          <h2>{s.title}</h2>
          {s.entries.map((e, i) => (
            <div key={i} className="plan-print__entry">
              {e.heading && <h3>{e.heading}</h3>}
              <dl>
                {e.lines.map((l) => (
                  <div key={l.label} className={blank ? `plan-print__blank${l.multiline ? " plan-print__blank--tall" : ""}` : undefined}>
                    <dt>{l.label}</dt>
                    <dd>{l.value || " "}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {s.todo.length > 0 && (
            <ul className="plan-print__todo">
              {s.todo.map((t) => (
                <li key={t.label}>
                  <span aria-hidden="true">{t.done ? "☑" : "☐"}</span> {t.label}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p>{p.paperKeep}</p>
      <p className="plan-print__from">{p.paperFrom}</p>
    </div>
  );
}
