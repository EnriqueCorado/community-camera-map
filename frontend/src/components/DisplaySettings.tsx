import { useState } from "react";
import { useI18n, type Key } from "../i18n";
import { applyDisplay, readTextSize, readTheme, saveTextSize, saveTheme, type TextSize, type Theme } from "../display";

const THEMES: [Theme, Key][] = [
  ["auto", "themeAuto"],
  ["light", "themeLight"],
  ["dark", "themeDark"],
];
const SIZES: [TextSize, Key][] = [
  ["normal", "textNormal"],
  ["large", "textLarge"],
];

/** Theme (auto / light / dark) and text size, as two small toggle groups. */
export function DisplaySettings() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [text, setText] = useState<TextSize>(readTextSize);

  const pickTheme = (v: Theme) => {
    setTheme(v);
    saveTheme(v);
    applyDisplay(v, text);
  };
  const pickText = (v: TextSize) => {
    setText(v);
    saveTextSize(v);
    applyDisplay(theme, v);
  };

  return (
    <div className="display">
      <div className="display__group" role="group" aria-labelledby="display-theme">
        <span className="display__label" id="display-theme">
          {t("displayTheme")}
        </span>
        {THEMES.map(([v, key]) => (
          <button key={v} type="button" className={`chip${theme === v ? " chip--on" : ""}`} aria-pressed={theme === v} onClick={() => pickTheme(v)}>
            {t(key)}
          </button>
        ))}
      </div>
      <div className="display__group" role="group" aria-labelledby="display-text">
        <span className="display__label" id="display-text">
          {t("displayText")}
        </span>
        {SIZES.map(([v, key]) => (
          <button key={v} type="button" className={`chip${text === v ? " chip--on" : ""}`} aria-pressed={text === v} onClick={() => pickText(v)}>
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );
}
