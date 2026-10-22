// The ready-to-share paragraph for each tool on the partners page, built from
// the tool's own name and summary so it always matches the tool page.
import type { Lang } from "../i18n";
import { SITE_COPY } from "./site-copy";
import { PARTNERS_COPY } from "./partners-copy";
import type { ToolPage } from "./tools";

/** Path of the partners page (under the site base) in `lang`. */
export const partnersPath = (lang: Lang) => `${SITE_COPY[lang].dir}/${PARTNERS_COPY[lang].slug}/`;

/** "<Tool>: <summary> <tagline> <url>": one paragraph to paste anywhere. */
export function toolBlurb(lang: Lang, tool: ToolPage, url: string): string {
  return `${tool.name[lang]}: ${tool.summary[lang]} ${PARTNERS_COPY[lang].tagline} ${url}`;
}

/** The same for the home page (all the tools). */
export function generalBlurb(lang: Lang, url: string): string {
  const s = SITE_COPY[lang];
  return `${s.heroTitle}. ${s.heroLead} ${PARTNERS_COPY[lang].tagline} ${url}`;
}
