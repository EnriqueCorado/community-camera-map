// Build-time entry for the public "Free help" pages (run by
// scripts/prerender.mjs after the app build). Returns every page as a path
// under the site base and its complete HTML.
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import css from "./landing.css?raw";
import { nearestModestoFirst, parseOffices } from "../help/legal-dir";
import { TOOLS } from "./tools";
import { FLYERS } from "./flyers";
import { FlyerIndex, FlyerPage, FLYERS_PATH, flyerPath, HomePage, homePath, ToolPageView, toolPath, type Site } from "./Pages";
import { LANG_PAGES, langFlyerPath, langPath } from "./languages";
import { LangFlyerPage, LangHomePage } from "./LangPages";

export interface BuiltPage {
  path: string;
  html: string;
}

export interface RenderOptions {
  origin: string;
  base: string;
  publicBase: string;
  repo: string;
  /** The legal-help map layer (public/data/layers/legal-help.geojson). */
  legalHelp: GeoJSON.FeatureCollection;
}

const page = (path: string, el: ReactElement): BuiltPage => ({ path, html: `<!doctype html>${renderToStaticMarkup(el)}` });

export function renderSite({ origin, base, publicBase, repo, legalHelp }: RenderOptions): BuiltPage[] {
  const site: Site = { origin, base, publicBase, repo, css };
  const offices = parseOffices(legalHelp).sort(nearestModestoFirst);
  const pages: BuiltPage[] = [];
  for (const lang of ["en", "es"] as const) {
    pages.push(page(homePath(lang), <HomePage site={site} lang={lang} />));
    for (const tool of TOOLS) {
      pages.push(page(toolPath(lang, tool), <ToolPageView site={site} lang={lang} tool={tool} offices={offices} />));
    }
  }
  pages.push(page(FLYERS_PATH, <FlyerIndex site={site} flyers={FLYERS} />));
  for (const f of FLYERS) pages.push(page(flyerPath(f), <FlyerPage site={site} f={f} />));
  for (const p of LANG_PAGES) {
    pages.push(page(langPath(p), <LangHomePage site={site} page={p} />));
    pages.push(page(langFlyerPath(p), <LangFlyerPage site={site} page={p} />));
  }
  return pages;
}
