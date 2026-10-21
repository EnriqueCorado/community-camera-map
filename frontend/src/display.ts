// Display preferences: color theme and text size. Remembered per browser
// (a convenience, like the language); never anything personal.

export type Theme = "auto" | "light" | "dark";
export type TextSize = "normal" | "large";

const THEME_KEY = "scm-theme";
const TEXT_KEY = "scm-text";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string, fallback: string) {
  try {
    if (value === fallback) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
}

export const readTheme = () => read<Theme>(THEME_KEY, ["auto", "light", "dark"], "auto");
export const readTextSize = () => read<TextSize>(TEXT_KEY, ["normal", "large"], "normal");

/** Reflect the choices on <html> (CSS keys off data-theme / data-text). */
export function applyDisplay(theme: Theme, text: TextSize, root: HTMLElement = document.documentElement) {
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (text === "large") root.dataset.text = "large";
  else delete root.dataset.text;
}

export function saveTheme(theme: Theme) {
  write(THEME_KEY, theme, "auto");
}

export function saveTextSize(text: TextSize) {
  write(TEXT_KEY, text, "normal");
}
