// "Share this": a WhatsApp link (a plain link, no script from WhatsApp), Copy
// link, and the phone's own Share sheet where the browser has one. Only the
// page's address is shared, never anything typed into a tool.
import { useId, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { START_COPY } from "../../help/start-copy";
import { whatsappHref } from "../../help/start";

export function ShareLinks({ url, title, newTab }: { url: string; title: string; newTab: string }) {
  const { lang } = useI18n();
  const s = START_COPY[lang];
  const id = useId();
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const text = s.message();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setManual(false);
      setStatus(s.copied);
    } catch {
      // No clipboard access (old browser, or blocked): show the link to copy by hand.
      setManual(true);
      setStatus(s.copyFailed);
      requestAnimationFrame(() => field.current?.select());
    }
  };
  const share = () => {
    // Cancelling the share sheet rejects; nothing to report.
    navigator.share({ title, text, url }).catch(() => {});
  };

  return (
    <section className="hshare" aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`}>{s.shareTitle}</h3>
      <p className="hf__hint">{s.shareLead}</p>
      <div className="hshare__acts">
        <a className="hbtn" href={whatsappHref(text, url)} target="_blank" rel="noopener noreferrer">
          {s.whatsapp}
          <span aria-hidden="true"> ↗</span>
          <span className="sr-only"> ({newTab})</span>
        </a>
        <button type="button" className="hbtn" onClick={copy}>
          {s.copy}
        </button>
        {canShare && (
          <button type="button" className="hbtn" onClick={share}>
            {s.native}
          </button>
        )}
      </div>
      {manual && (
        <input
          ref={field}
          className="hf__input hshare__url"
          readOnly
          value={url}
          aria-label={s.linkLabel}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <p className="hf__hint" role="status">
        {status}
      </p>
    </section>
  );
}
