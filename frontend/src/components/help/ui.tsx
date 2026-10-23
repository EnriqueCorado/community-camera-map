// Small pieces shared by the Help tools: plain, labeled form controls (no
// custom widgets, so they work with screen readers, zoom and phone keyboards),
// results, links, cited facts and sources, plus copy-to-clipboard, a status
// announcer and lazily filled <details>.
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n";
import { longDate } from "../../help/dates";
import { REPORT_COPY, reportHref } from "../../help/report";

export function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  /** Span the whole form row (long labels, wide controls). */
  wide?: boolean;
  /** Render prop: gets the id/aria wiring for the control. */
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`hf${wide ? " hf--wide" : ""}`}>
      <label className="hf__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy: hintId })}
      {hint && (
        <p className="hf__hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Dollar amount. Kept as text so a half-typed "1,2" isn't rewritten under the
 *  cursor; parse with parseMoney(). */
export function MoneyInput({
  id,
  describedBy,
  value,
  onChange,
}: {
  id: string;
  describedBy?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="hf__money">
      <span aria-hidden="true">$</span>
      <input
        id={id}
        aria-describedby={describedBy}
        className="hf__input"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={12}
      />
    </div>
  );
}

/** A single-choice question as a radio group (big tap targets). */
export function Choice<T extends string>({
  legend,
  options,
  value,
  onChange,
  hint,
  wide,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  hint?: string;
  wide?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={`hchoice${wide ? " hf--wide" : ""}`} aria-describedby={hint ? `${name}-hint` : undefined}>
      <legend className="hf__label">{legend}</legend>
      {hint && (
        <p className="hf__hint" id={`${name}-hint`}>
          {hint}
        </p>
      )}
      <div className="hchoice__opts">
        {options.map((o) => (
          <label key={o.value} className={`hchoice__opt${value === o.value ? " hchoice__opt--on" : ""}`}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type Tone = "good" | "warn" | "bad" | "info";

/** A result message. `live` regions announce updates without moving focus. */
export function Result({ tone, title, children }: { tone: Tone; title: string; children?: ReactNode }) {
  return (
    <div className={`hresult hresult--${tone}`}>
      <p className="hresult__title">{title}</p>
      {children}
    </div>
  );
}

/** Link to another site, always in a new tab, announced as such. */
export function ExtLink({ href, children, newTab, hrefLang }: { href: string; children: ReactNode; newTab: string; hrefLang?: string }) {
  if (!/^https:\/\//.test(href)) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" hrefLang={hrefLang}>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> ({newTab})</span>
    </a>
  );
}

/** "(209) 555-0100" -> tappable tel: link (digits only in the href). */
export function Phone({ number }: { number: string }) {
  const digits = number.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 10) return <>{number}</>;
  return (
    <a href={`tel:${digits}`} className="hphone">
      {number}
    </a>
  );
}

export interface SourceRef {
  label: string;
  url: string;
}

/** "Where this comes from" list with the date the facts were last checked,
 *  and (with `report`) the "See something wrong? Tell us" email link. */
export function Sources({
  heading,
  checked,
  items,
  newTab,
  report,
}: {
  heading: string;
  checked: string;
  items: SourceRef[];
  newTab: string;
  /** The tool's name and its last-checked ISO date, for the correction email. */
  report?: { topic: string; checked: string };
}) {
  return (
    <>
      <details className="hsources">
        <summary>{heading}</summary>
        <ul>
          {items.map((s) => (
            <li key={s.url}>
              <ExtLink href={s.url} newTab={newTab}>
                {s.label}
              </ExtLink>
            </li>
          ))}
        </ul>
        <p className="hf__hint">{checked}</p>
      </details>
      {report && <ReportLink topic={report.topic} checked={report.checked} />}
    </>
  );
}

/** A quiet email link for corrections, in the reader's language. */
export function ReportLink({ topic, checked }: { topic: string; checked?: string }) {
  const { lang, locale } = useI18n();
  const r = REPORT_COPY[lang];
  return (
    <p className="hreport">
      <a href={reportHref(lang, topic, checked ? longDate(checked, locale) : undefined)} data-report>
        {r.link}
        <span className="sr-only"> ({r.opensEmail})</span>
      </a>
    </p>
  );
}

/** A cited fact: plain-language statement in both languages + its source. */
export interface CitedFact {
  id: string;
  cite: string;
  en: string;
  es: string;
}

/** Bulleted facts, each followed by its citation. */
export function FactList({ facts }: { facts: readonly CitedFact[] }) {
  const { lang } = useI18n();
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

/** A message for a `role="status"` element that's announced every time, even
 *  when it's the same words again (cleared first, then set a beat later). */
export function useAnnounce(): [string, (message: string) => void] {
  const [status, setStatus] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const announce = useCallback((message: string) => {
    window.clearTimeout(timer.current);
    setStatus("");
    timer.current = window.setTimeout(() => setStatus(message), 50);
  }, []);
  return [status, announce];
}

/** Copy text to the clipboard. When that's blocked (permissions, older
 *  browsers), `fallback` runs and `select` returns the field holding the text,
 *  which is focused and selected (focus first, so phones visibly select it) for
 *  the reader to copy by hand. Resolves to whether the clipboard took it. */
export async function copyText(
  text: string,
  select: () => HTMLInputElement | HTMLTextAreaElement | null,
  fallback?: () => void,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    fallback?.();
    // A frame later: the fallback may have just rendered the field.
    requestAnimationFrame(() => {
      const el = select();
      el?.focus();
      el?.select();
    });
    return false;
  }
}

/** A <details> whose body is built only once it's opened (long fact lists and
 *  answer cards cost nothing until someone looks). */
export function LazyDetails({ summary, className, children }: { summary: ReactNode; className?: string; children: () => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className={className} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}</summary>
      {open && children()}
    </details>
  );
}
