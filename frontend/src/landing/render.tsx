// Build-time entry for the public "Free help" pages (run by
// scripts/prerender.mjs after the app build). Returns every page as a path
// under the site base and its complete HTML.
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import css from "./landing.css?raw";
import { nearestModestoFirst, parseOffices } from "../help/legal-dir";
import { TOOLS } from "./tools";
import { FLYERS } from "./flyers";
import { FlyerIndex, FlyerPage, FLYERS_PATH, flyerPath, HomePage, homePath, PartnersPage, ShortLinkPage, shortPath, ToolPageView, toolPath, type Site } from "./Pages";
import { partnersPath } from "./partners";
import { SITE_COPY } from "./site-copy";
import { SHORT_LINKS, shortTarget } from "../help/start";
import { LANG_PAGES, langFlyerPath, langPath } from "./languages";
import { LangFlyerPage, LangHomePage } from "./LangPages";

export interface BuiltPage {
  path: string;
  html: string;
  /** false: left out of "Save all pages" (it's for organizations, not for use offline). */
  offline?: false;
}

export interface RenderOptions {
  origin: string;
  base: string;
  publicBase: string;
  repo: string;
  /** The legal-help map layer (public/data/layers/legal-help.geojson). */
  legalHelp: GeoJSON.FeatureCollection;
  /** The anonymous usage counter's URL, or "" for none. */
  counter?: string;
}

const page = (path: string, el: ReactElement): BuiltPage => ({ path, html: `<!doctype html>${renderToStaticMarkup(el)}` });

export function renderSite({ origin, base, publicBase, repo, legalHelp, counter = "" }: RenderOptions): BuiltPage[] {
  const site: Site = { origin, base, publicBase, repo, css, counter };
  const offices = parseOffices(legalHelp).sort(nearestModestoFirst);
  const pages: BuiltPage[] = [];
  for (const lang of ["en", "es"] as const) {
    pages.push(page(homePath(lang), <HomePage site={site} lang={lang} />));
    for (const tool of TOOLS) {
      pages.push(page(toolPath(lang, tool), <ToolPageView site={site} lang={lang} tool={tool} offices={offices} />));
    }
  }
  for (const lang of ["en", "es"] as const) {
    pages.push({ ...page(partnersPath(lang), <PartnersPage site={site} lang={lang} />), offline: false });
  }
  pages.push(page(FLYERS_PATH, <FlyerIndex site={site} flyers={FLYERS} />));
  for (const f of FLYERS) pages.push(page(flyerPath(f), <FlyerPage site={site} f={f} />));
  for (const sl of SHORT_LINKS) {
    const tool = TOOLS.find((t) => t.id === sl.page);
    if (sl.page !== "home" && !tool) throw new Error(`landing: short link "${sl.slug}" points at no page`);
    const title = tool ? tool.name[sl.lang] : SITE_COPY[sl.lang].home;
    pages.push(page(shortPath(sl.slug), <ShortLinkPage site={site} lang={sl.lang} to={shortTarget(sl)} title={title} />));
  }
  for (const p of LANG_PAGES) {
    pages.push(page(langPath(p), <LangHomePage site={site} page={p} />));
    pages.push(page(langFlyerPath(p), <LangFlyerPage site={site} page={p} />));
  }
  return pages;
}
