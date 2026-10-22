// U.S. citizenship civics test practice: study the official questions, or take
// a practice test that stops like the real one (12 right or 9 wrong). Progress
// lives in this component's state only: nothing is saved or sent.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import type { HelpCopy } from "../../help/copy";
import { CIVICS_COPY, type CivicsCopy } from "../../help/civics-copy";
import { CIVICS_QUESTIONS } from "../../help/civics-questions";
import { CIVICS_CHECKED, CIVICS_FACTS, CIVICS_HELP, CIVICS_LINKS, CIVICS_SOURCES } from "../../help/civics-facts";
import { CIVICS_PARTS, FULL_TEST, SENIOR_TEST, pickQuestions, quizState, studyPool, type CivicsPart, type CivicsQuestion, type Mark } from "../../help/civics";
import { pickVoice } from "../../help/voices";
import { longDate } from "../../help/dates";
import { ExtLink, FactList, Phone, Result, Sources } from "./ui";

type Mode = "study" | "practice";

/** Speaks English questions with an on-device voice; null when there is none. */
function useEnglishVoice(): ((text: string) => void) | null {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  // Held so Chrome can't discard the utterance mid-sentence.
  const speaking = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
    const pick = () => setVoice(pickVoice(synth.getVoices(), "en"));
    pick();
    if (synth.addEventListener) synth.addEventListener("voiceschanged", pick);
    else synth.onvoiceschanged = pick;
    return () => {
      if (synth.removeEventListener) synth.removeEventListener("voiceschanged", pick);
      else synth.onvoiceschanged = null;
      synth.cancel();
    };
  }, []);
  if (!voice) return null;
  return (text) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.9;
    speaking.current = u;
    synth.speak(u);
  };
}

/** Links that go with a "today" note. */
const NOTE_LINK: Partial<Record<NonNullable<CivicsQuestion["note"]>, string>> = {
  representative: CIVICS_LINKS.house,
  speaker: CIVICS_LINKS.updates,
};

/** A question's answers: USCIS's English, today's answer where it changes, and Spanish help. */
function Answers({ q, m, c, spanish }: { q: CivicsQuestion; m: CivicsCopy; c: HelpCopy; spanish: boolean }) {
  const { lang, locale } = useI18n();
  const link = q.note && NOTE_LINK[q.note];
  return (
    <div className="hcivics__a">
      <p className="hf__hint">{m.answers}</p>
      <ul lang="en">
        {q.a.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
      {q.now && (
        <p>
          <strong>{m.today}</strong> <span lang="en">{q.now.join(" · ")}</span> <span className="hf__hint">({m.todayAsOf(longDate(CIVICS_CHECKED, locale))})</span>
        </p>
      )}
      {q.note && (
        <p className="hf__hint">
          {CIVICS_FACTS.notes[q.note][lang]}{" "}
          {link && (
            <ExtLink href={link} newTab={c.newTab}>
              {new URL(link).hostname.replace(/^www\./, "")}
            </ExtLink>
          )}
        </p>
      )}
      {spanish && q.es && (
        <ul lang="es" className="hcivics__es">
          {q.es.a.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListenButton({ q, m, lang, speak }: { q: CivicsQuestion; m: CivicsCopy; lang: string; speak: (t: string) => void }) {
  return (
    <button type="button" className="linkbtn hcivics__listen" onClick={() => speak(q.q)} aria-label={m.listen(q.n)} lang={lang}>
      <span aria-hidden="true">🔊</span>
    </button>
  );
}

function SpanishQuestion({ q, m }: { q: CivicsQuestion; m: CivicsCopy }) {
  if (!q.es) return null;
  return (
    <p className="hcivics__es" lang="es">
      {q.es.q} <span className="hf__hint">({q.es.official ? m.spanishOfficial : m.spanishStudy})</span>
    </p>
  );
}

/** The question line (English, as the officer asks it), Spanish help and a Listen button. */
function QuestionLine({
  q,
  m,
  spanish,
  showStar,
  speak,
  focusRef,
}: {
  q: CivicsQuestion;
  m: CivicsCopy;
  spanish: boolean;
  showStar: boolean;
  speak: ((t: string) => void) | null;
  focusRef?: React.Ref<HTMLParagraphElement>;
}) {
  const { lang } = useI18n();
  return (
    <>
      <p className="hcivics__q" lang="en" tabIndex={focusRef ? -1 : undefined} ref={focusRef}>
        <span className="hcivics__n">{q.n}.</span> {q.q} {speak && <ListenButton q={q} m={m} lang={lang} speak={speak} />}
      </p>
      {spanish && <SpanishQuestion q={q} m={m} />}
      {showStar && q.star && <p className="hf__hint">{m.starred}</p>}
    </>
  );
}

export function CivicsTool({ c }: { c: HelpCopy }) {
  const { lang, locale } = useI18n();
  const m = CIVICS_COPY[lang];
  const ids = useId();
  const speak = useEnglishVoice();
  const [mode, setMode] = useState<Mode>("study");
  const [seniors, setSeniors] = useState(false);
  const [spanish, setSpanish] = useState(lang === "es");
  const [part, setPart] = useState<CivicsPart | "all">("all");
  const pool = useMemo(() => studyPool(CIVICS_QUESTIONS, seniors), [seniors]);
  const rules = seniors ? SENIOR_TEST : FULL_TEST;
  const shown = part === "all" ? pool : pool.filter((q) => q.part === part);

  // Practice test: the questions drawn, the marks given, and whether the answer is showing.
  const [order, setOrder] = useState<number[] | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [revealed, setRevealed] = useState(false);
  const state = quizState(marks, rules);
  // The rules always end a test before the questions run out; this guards it anyway.
  const done = order != null && (state.done || marks.length >= order.length);
  const byN = useMemo(() => new Map(CIVICS_QUESTIONS.map((q) => [q.n, q])), []);
  const current = order && !done ? byN.get(order[marks.length]!) : undefined;

  // Keyboard and screen-reader focus follows the test: question → marks → next question.
  const questionRef = useRef<HTMLParagraphElement>(null);
  const markRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<"question" | "mark" | "result" | null>(null);
  useEffect(() => {
    const target = { question: questionRef.current, mark: markRef.current, result: resultRef.current }[focusNext.current ?? "question"];
    if (focusNext.current) target?.focus();
    focusNext.current = null;
  });

  const resetTest = () => {
    setOrder(null);
    setMarks([]);
    setRevealed(false);
  };
  const start = () => {
    setOrder(pickQuestions(pool, rules.asked));
    setMarks([]);
    setRevealed(false);
    focusNext.current = "question";
  };
  const reveal = () => {
    setRevealed(true);
    focusNext.current = "mark";
  };
  const mark = (x: Mark) => {
    const next = [...marks, x];
    setMarks(next);
    setRevealed(false);
    focusNext.current = quizState(next, rules).done || (order != null && next.length >= order.length) ? "result" : "question";
  };
  const missed = order ? order.slice(0, marks.length).filter((_, i) => marks[i] === "wrong").map((n) => byN.get(n)!) : [];

  // One short line, always mounted, so screen readers announce the score and the verdict.
  const announce = !order ? "" : done ? (state.passed ? m.passed(state.right) : m.failed(state.wrong)) : `${m.questionOf(marks.length + 1, rules.asked)}. ${m.score(state.right, state.wrong)}`;

  return (
    <>
      <h3>{m.title}</h3>
      <p className="help__lead">{m.lead}</p>
      <p className="hf__hint">{m.private}</p>

      <div className="hsub" role="group" aria-label={m.modeLabel}>
        {(["study", "practice"] as const).map((v) => (
          <button key={v} type="button" className={`chip${mode === v ? " chip--on" : ""}`} aria-pressed={mode === v} onClick={() => setMode(v)}>
            {v === "study" ? m.modeStudy : m.modePractice}
          </button>
        ))}
      </div>

      <div className="hchecks hcivics__opts">
        <label className="hcheck">
          <input
            type="checkbox"
            checked={seniors}
            onChange={() => {
              // A different question set ends any test in progress.
              setSeniors((v) => !v);
              resetTest();
            }}
            aria-describedby={`${ids}-seniors`}
          />
          <span>
            {m.seniors}
            <span className="hf__hint hcheck__note" id={`${ids}-seniors`}>
              {m.seniorsHint}
            </span>
          </span>
        </label>
        <label className="hcheck">
          <input type="checkbox" checked={spanish} onChange={() => setSpanish((v) => !v)} />
          {m.showSpanish}
        </label>
      </div>

      {mode === "study" && (
        <section aria-labelledby={`${ids}-study`}>
          <h4 id={`${ids}-study`} className="sr-only">
            {m.modeStudy}
          </h4>
          <div className="hf">
            <label className="hf__label" htmlFor={`${ids}-part`}>
              {m.part}
            </label>
            <select id={`${ids}-part`} className="hf__input" value={part} onChange={(e) => setPart(e.target.value as CivicsPart | "all")}>
              <option value="all">{m.allParts}</option>
              {CIVICS_PARTS.filter((p) => pool.some((q) => q.part === p)).map((p) => (
                <option key={p} value={p}>
                  {m.parts[p]}
                </option>
              ))}
            </select>
          </div>
          <p className="hstat">{m.count(shown.length)}</p>
          <ul className="hcivics__list">
            {shown.map((q) => (
              <li key={q.n}>
                <details className="hcivics__card">
                  <summary>
                    <span lang="en">
                      <span className="hcivics__n">{q.n}.</span> {q.q}
                    </span>
                    {q.star && !seniors && <span className="hf__hint"> ★</span>}
                  </summary>
                  {/* The question is already in the summary: here, only listening and the Spanish. */}
                  {speak && (
                    <p>
                      <ListenButton q={q} m={m} lang={lang} speak={speak} />
                    </p>
                  )}
                  {spanish && <SpanishQuestion q={q} m={m} />}
                  <Answers q={q} m={m} c={c} spanish={spanish} />
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mode === "practice" && (
        <section aria-labelledby={`${ids}-practice`} className="hcard">
          <h4 id={`${ids}-practice`} className="sr-only">
            {m.modePractice}
          </h4>
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
          {!order && (
            <button type="button" className="hbtn hbtn--primary" onClick={start}>
              {m.start(rules.asked, rules.pass)}
            </button>
          )}
          {order && current && (
            <>
              <p className="hstat">
                {m.questionOf(marks.length + 1, rules.asked)} · {m.score(state.right, state.wrong)}
              </p>
              <QuestionLine q={current} m={m} spanish={spanish} showStar={!seniors} speak={speak} focusRef={questionRef} />
              {!revealed ? (
                <>
                  <p className="hf__hint">{m.selfCheck}</p>
                  <button type="button" className="hbtn hbtn--primary" onClick={reveal}>
                    {m.showAnswer}
                  </button>
                </>
              ) : (
                <>
                  <Answers q={current} m={m} c={c} spanish={spanish} />
                  <p className="hcivics__marks">
                    <button type="button" className="hbtn hbtn--primary" onClick={() => mark("right")} ref={markRef}>
                      {m.gotIt}
                    </button>
                    <button type="button" className="hbtn" onClick={() => mark("wrong")}>
                      {m.missedIt}
                    </button>
                  </p>
                </>
              )}
            </>
          )}
          {order && done && (
            <div ref={resultRef} tabIndex={-1} className="hcivics__result">
              <Result tone={state.passed ? "good" : "warn"} title={m.score(state.right, state.wrong)}>
                <p>{state.passed ? m.passed(state.right) : m.failed(state.wrong)}</p>
              </Result>
              {missed.length > 0 && (
                <>
                  <h4>{m.review}</h4>
                  <ul className="hcivics__list">
                    {missed.map((q) => (
                      <li key={q.n} className="hcivics__card">
                        <QuestionLine q={q} m={m} spanish={spanish} showStar={!seniors} speak={speak} />
                        <Answers q={q} m={m} c={c} spanish={spanish} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button type="button" className="hbtn hbtn--primary" onClick={start}>
                {m.again}
              </button>
            </div>
          )}
        </section>
      )}

      <h3>{m.testTitle}</h3>
      <FactList facts={CIVICS_FACTS.test} />
      <ul>
        <li>
          <ExtLink href={CIVICS_LINKS.test2008} newTab={c.newTab} hrefLang="en">
            {m.test2008}
          </ExtLink>{" "}
          (
          <ExtLink href={CIVICS_LINKS.test2008Es} newTab={c.newTab} hrefLang="es">
            {m.test2008Es}
          </ExtLink>
          )
        </li>
        <li>
          <ExtLink href={CIVICS_LINKS.updates} newTab={c.newTab} hrefLang="en">
            {m.updates}
          </ExtLink>
        </li>
      </ul>
      <h4>{m.englishTitle}</h4>
      <ul>
        <li>
          <ExtLink href={CIVICS_LINKS.reading} newTab={c.newTab} hrefLang="en">
            {m.readingWords}
          </ExtLink>
        </li>
        <li>
          <ExtLink href={CIVICS_LINKS.writing} newTab={c.newTab} hrefLang="en">
            {m.writingWords}
          </ExtLink>
        </li>
      </ul>

      <h3>{m.feesTitle}</h3>
      <FactList facts={CIVICS_FACTS.fees} />
      <p>
        <ExtLink href={CIVICS_LINKS.n400} newTab={c.newTab} hrefLang="en">
          {m.n400}
        </ExtLink>
      </p>

      <h3>{m.helpTitle}</h3>
      <ul className="hplaces">
        {CIVICS_HELP.map((h) => (
          <li key={h.url}>
            <strong>{h.name[lang]}</strong> <Phone number={h.phone} />
            <br />
            {h.address}. <span className="hf__hint">{h.note[lang]}</span>{" "}
            <ExtLink href={h.url} newTab={c.newTab}>
              {c.website}
            </ExtLink>
          </li>
        ))}
      </ul>

      <p className="hf__hint">{m.credit}</p>
      <Sources heading={c.sourcesHeading} checked={c.checkedOn(longDate(CIVICS_CHECKED, locale))} items={CIVICS_SOURCES} newTab={c.newTab} />
    </>
  );
}
