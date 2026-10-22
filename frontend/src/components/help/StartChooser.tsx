// "Not sure where to start?": everyday problems, each opening the right tool.
// Collapsed by default; remembers nothing (closes after a choice, and is gone
// with the panel).
import { useId, useState } from "react";
import { useI18n } from "../../i18n";
import { START_COPY } from "../../help/start-copy";
import { PAGES, START_CHOICES } from "../../help/start";
import type { HelpTarget } from "../../help/target";

export function StartChooser({ onChoose }: { onChoose: (t: HelpTarget) => void }) {
  const { lang } = useI18n();
  const s = START_COPY[lang];
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <details className="hstart" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{s.startTitle}</summary>
      <p className="hstart__q" id={`${id}-q`}>
        {s.startQuestion}
      </p>
      <p className="hf__hint">{s.startHint}</p>
      <ul className="hstart__list" aria-labelledby={`${id}-q`}>
        {START_CHOICES.map((choice) => (
          <li key={choice.page}>
            <button
              type="button"
              className="hstart__opt"
              onClick={() => {
                setOpen(false);
                onChoose(PAGES[choice.page].target);
              }}
            >
              {choice.label[lang]}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
