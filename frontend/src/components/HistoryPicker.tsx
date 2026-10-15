import { useEffect, useRef, useState } from "react";
import { api, type LayerInfo } from "../api/client";
import { HISTORY_LAYERS } from "../history";
import { layerTitle, useI18n } from "../i18n";

/** Scrub back through saved days for the history layers. The last slider
 *  step is "Live" (today's data). */
export function HistoryPicker({
  value,
  onChange,
  overlayInfos,
}: {
  value: string | null;
  onChange: (day: string | null) => void;
  overlayInfos: LayerInfo[];
}) {
  const { t, lang, locale } = useI18n();
  const [days, setDays] = useState<string[] | null>(null);
  const [shown, setShown] = useState<string | null>(value); // follows the slider instantly
  const debounce = useRef<number | undefined>(undefined);
  useEffect(() => setShown(value), [value]);
  useEffect(() => {
    let alive = true;
    void api.historyIndex().then((ix) => alive && setDays(Object.keys(ix.days ?? {}).sort()));
    return () => {
      alive = false;
    };
  }, []);
  if (!days) return null;
  if (!days.length) return <p className="panel__note">{t("historyNone")}</p>;

  const pos = shown ? Math.max(0, days.indexOf(shown)) : days.length; // last step = live
  const label = (d: string | null) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : t("historyLive");
  // Dragging moves the label at once; the map loads the day it settles on.
  const go = (i: number) => {
    const day = i >= days.length ? null : days[Math.max(0, i)]!;
    setShown(day);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => onChange(day), 200);
  };
  const covered = overlayInfos.filter((l) => HISTORY_LAYERS.has(l.name)).map((l) => layerTitle(lang, l.name, l.title));

  return (
    <div className="history">
      <div className="history__row">
        <button type="button" className="chip" onClick={() => go(pos - 1)} disabled={pos === 0} aria-label={t("historyEarlier")}>
          ◀
        </button>
        <input
          type="range"
          min={0}
          max={days.length}
          step={1}
          value={pos}
          onChange={(e) => go(Number(e.target.value))}
          aria-label={t("historyPick")}
          aria-valuetext={label(shown)}
        />
        <button type="button" className="chip" onClick={() => go(pos + 1)} disabled={pos >= days.length} aria-label={t("historyLater")}>
          ▶
        </button>
      </div>
      <p className="history__label">{label(shown)}</p>
      <p className="panel__note">{t("historyCovers", { layers: covered.join(", ") })}</p>
    </div>
  );
}
