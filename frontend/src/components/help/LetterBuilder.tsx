// Fill-in letter: form -> live preview -> copy / print / download. Everything
// happens in this tab; the letter is never uploaded or stored.
import { useId, useMemo, useState } from "react";
import { useI18n, type Lang } from "../../i18n";
import { todayIso } from "../../help/dates";
import type { LetterDef, LetterValues } from "../../help/letter-types";
import { triggerDownload } from "../../download";
import { Field } from "./ui";
import type { HelpCopy } from "../../help/copy";

export function LetterBuilder({ def, c, initial }: { def: LetterDef; c: HelpCopy; initial?: LetterValues }) {
  const { lang } = useI18n();
  const [values, setValues] = useState<LetterValues>(initial ?? {});
  // Default the letter to English: landlords, hospitals and courts expect it.
  const [letterLang, setLetterLang] = useState<Lang>("en");
  const [status, setStatus] = useState("");
  const previewId = useId();
  const text = useMemo(() => def.render(values, letterLang, todayIso()), [def, values, letterLang]);

  const set = (id: string, v: string | string[]) => setValues((old) => ({ ...old, [id]: v }));
  const toggle = (id: string, opt: string) => {
    const cur = values[id];
    const list = Array.isArray(cur) ? cur : [];
    set(id, list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt]);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(c.letterCopied);
    } catch {
      // Clipboard blocked (permissions/older browser): select it for Ctrl+C.
      const el = document.getElementById(previewId) as HTMLTextAreaElement | null;
      el?.focus();
      el?.select();
      setStatus(c.letterSelectToCopy);
    }
  };

  const print = () => {
    // Print just the letter: a throwaway node that print CSS shows alone.
    // Cleanup waits for afterprint (phones return from print() before the
    // preview renders); a leftover from a print that never reported back is
    // cleared here first.
    document.querySelectorAll(".letter-print").forEach((n) => n.remove());
    const node = document.createElement("div");
    node.className = "letter-print";
    node.textContent = text;
    document.body.appendChild(node);
    document.documentElement.classList.add("printing-letter");
    const done = () => {
      node.remove();
      document.documentElement.classList.remove("printing-letter");
    };
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  };

  const download = () => {
    triggerDownload(`${def.filename}.txt`, new Blob([text], { type: "text/plain;charset=utf-8" }));
    setStatus(c.letterDownloaded);
  };

  return (
    <div className="hletter">
      <div className="hletter__form">
        {def.fields.map((f) =>
          f.kind === "checks" ? (
            <fieldset key={f.id} className="hchoice">
              <legend className="hf__label">{f.label[lang]}</legend>
              {f.hint && <p className="hf__hint">{f.hint[lang]}</p>}
              <div className="hchecks">
                {(f.options ?? []).map((o) => {
                  const on = Array.isArray(values[f.id]) && (values[f.id] as string[]).includes(o.id);
                  return (
                    <label key={o.id} className="hcheck">
                      <input type="checkbox" checked={on} onChange={() => toggle(f.id, o.id)} />
                      {o.label[lang]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <Field key={f.id} label={f.label[lang]} hint={f.hint?.[lang]}>
              {({ id, describedBy }) =>
                f.kind === "multiline" ? (
                  <textarea
                    id={id}
                    aria-describedby={describedBy}
                    className="hf__input"
                    rows={3}
                    maxLength={1500}
                    autoComplete={f.autoComplete ?? "off"}
                    value={String(values[f.id] ?? "")}
                    onChange={(e) => set(f.id, e.target.value)}
                  />
                ) : (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    className="hf__input"
                    type={f.kind === "date" ? "date" : "text"}
                    inputMode={f.kind === "money" ? "decimal" : undefined}
                    maxLength={200}
                    autoComplete={f.autoComplete ?? "off"}
                    value={String(values[f.id] ?? "")}
                    onChange={(e) => set(f.id, e.target.value)}
                  />
                )
              }
            </Field>
          ),
        )}
      </div>

      <div className="hletter__out">
        <div className="hletter__bar">
          <span className="hf__label" id={`${previewId}-label`}>
            {c.letterPreview}
          </span>
          <div className="chips" role="group" aria-label={c.letterLanguage}>
            {(["en", "es"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                className={`chip${letterLang === l ? " chip--on" : ""}`}
                aria-pressed={letterLang === l}
                lang={l}
                onClick={() => setLetterLang(l)}
              >
                {l === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>
        </div>
        <p className="hf__hint">{c.letterLanguageHint}</p>
        <textarea
          id={previewId}
          className="hletter__preview"
          aria-labelledby={`${previewId}-label`}
          lang={letterLang}
          readOnly
          value={text}
          rows={16}
        />
        <div className="hletter__actions">
          <button type="button" className="hbtn hbtn--primary" onClick={() => void copy()}>
            {c.letterCopy}
          </button>
          <button type="button" className="hbtn" onClick={print}>
            {c.letterPrint}
          </button>
          <button type="button" className="hbtn" onClick={download}>
            {c.letterDownload}
          </button>
        </div>
        <p className="hf__hint" role="status">
          {status}
        </p>
        <p className="hf__hint">{c.letterKeepCopy}</p>
      </div>
    </div>
  );
}
