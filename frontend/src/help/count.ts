// The anonymous usage counter (relay/src/counter.ts), browser side. One
// "this tool was opened" per tool per page load: no cookies, no referrer,
// nothing about the visitor or what they type. Skipped when the browser sends
// Do Not Track or Global Privacy Control. The public pages do the same in
// landing/client.js. Kept free of React so unit tests can import it.
import type { Lang } from "../i18n";
import { BENEFITS_VIEWS, IMMIGRATION_VIEWS, RENT_VIEWS, WORK_VIEWS, isHelpView, type HelpTab, type HelpTarget } from "./target";

/** "page:<tool id>:<lang>" (public pages) or "app:<tab>[/<view>]:<lang>" (Help panel). */
export const countEvent = (kind: "page" | "app", id: string, lang: Lang) => `${kind}:${id}:${lang}`;

// Each tab's first tool (what the panel shows when no view is given).
const FIRST_VIEW: Partial<Record<HelpTab, string>> = {
  rent: RENT_VIEWS[0],
  work: WORK_VIEWS[0],
  benefits: BENEFITS_VIEWS[0],
  immigration: IMMIGRATION_VIEWS[0],
};

/** The tool a Help panel target shows, as the counter names it: "rent/eviction", "medical". */
export function appCountId(t: HelpTarget): string {
  const first = FIRST_VIEW[t.tab];
  if (!first) return t.tab;
  return `${t.tab}/${isHelpView(t.tab, t.view) ? t.view : first}`;
}

/** False when the browser asks not to be tracked (Do Not Track or Global Privacy Control). */
export function mayCount(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean }): boolean {
  return nav.doNotTrack !== "1" && nav.globalPrivacyControl !== true;
}

/** Send one count, once, and forget it (no retries, errors ignored). */
// The event goes in the body (logs keep URLs, not bodies). A text body with no
// custom headers is a CORS "simple" request: no preflight, and the browser
// always sends the real Origin, which the counter checks.
export function sendCount(url: string, event: string, fetchImpl: typeof fetch = fetch): void {
  fetchImpl(url, {
    method: "POST",
    mode: "cors",
    body: event,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
    cache: "no-store",
  }).catch(() => {});
}
