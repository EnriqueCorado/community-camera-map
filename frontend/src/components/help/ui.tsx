// Small form and layout pieces shared by the Help tools. Plain, labeled
// controls (no custom widgets) so they work with screen readers, zoom and
// phone keyboards.
import { useId, type ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  /** Render prop: gets the id/aria wiring for the control. */
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="hf">
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
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  hint?: string;
}) {
  const name = useId();
  return (
    <fieldset className="hchoice">
      <legend className="hf__label">{legend}</legend>
      {hint && <p className="hf__hint">{hint}</p>}
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

/** "Where this comes from" list with the date the facts were last checked. */
export function Sources({
  heading,
  checked,
  items,
  newTab,
}: {
  heading: string;
  checked: string;
  items: SourceRef[];
  newTab: string;
}) {
  return (
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
  );
}
