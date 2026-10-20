import { useRef, type KeyboardEvent } from "react";

/** WAI-ARIA tabs (automatic activation): arrows/Home/End move between tabs. */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  idPrefix,
}: {
  label: string;
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next == null) return;
    e.preventDefault();
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  };
  return (
    <div className="htabs" role="tablist" aria-label={label}>
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          className="htabs__tab"
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
