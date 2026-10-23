// The public "Free help" pages, rendered to static HTML at build time
// (scripts/prerender.mjs) so they load fast, work without JavaScript and can
// be found by search engines. Every link is a plain link; the only scripts are
// the saved theme/text size (read, never written, inline), the flyer Print
// button (inline) and the page script (client.js, one shared file: copy, share,
// offline, read aloud, the optional usage counter). The stylesheet is one shared
// file too, so a page costs only its own HTML once the first has loaded.
import type { ReactNode } from "react";
import { translate, type Lang } from "../i18n";
import { COPY } from "../help/copy";
import { LEGAL_FACTS } from "../help/facts";
import { longDate } from "../help/dates";
import { LEGAL_COST_KEYS, LEGAL_KIND_KEYS } from "../help/legal-kinds";
import type { LegalOffice } from "../help/legal-dir";
import type { HelpTarget } from "../help/target";
import { LEGAL_SITE_HOSTS, safeUrl } from "../popup-logic";
import { SITE_COPY, type SiteCopy } from "./site-copy";
import { GROUPS, TOOLS, type PlaceInfo, type ToolPage } from "./tools";
import { FLYER_COPY, FLYERS, flyerTarget, type Flyer } from "./flyers";
import { PARTNERS_COPY } from "./partners-copy";
import { generalBlurb, partnersPath, toolBlurb } from "./partners";
import { REPORT_COPY, mailto, reportHref } from "../help/report";
import { qr } from "./qr";
import { START_COPY } from "../help/start-copy";
import { START_CHOICES, SHORT_DIR, pagePath, shortFor, whatsappHref } from "../help/start";
import { LANG_PAGES, langFlyerPath, langPath } from "./languages";

export interface Site {
  /** "https://example.github.io" (no trailing slash). */
  origin: string;
  /** Base path of this build, with slashes, for links between pages: "/community-camera-map/". */
  base: string;
  /** Base path of the public site, for canonical links and QR codes (always the live site). */
  publicBase: string;
  /** The shared stylesheet and page script, written once per build by
   *  prerender.mjs (content-hashed names, checked with Subresource Integrity). */
  assets: SiteAssets;
  repo: string;
  /** The anonymous usage counter's URL (relay/api/count.ts), or "" for none. */
  counter: string;
}

export interface SiteAssets {
  css: { href: string; integrity: string };
  js: { href: string; integrity: string };
}

const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-US" };
const other = (lang: Lang): Lang => (lang === "en" ? "es" : "en");
export const absolute = (site: Site, path: string) => `${site.origin}${site.publicBase}${path}`;

/** A US phone number as a tel: link, or null for short codes like 211 (shown as text). */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `tel:+1${digits}` : null;
}

function PhoneLink({ phone, s }: { phone: string; s: SiteCopy }) {
  const href = telHref(phone);
  return href ? (
    <a href={href} aria-label={s.call(phone)}>
      {phone}
    </a>
  ) : (
    <span>{phone}</span>
  );
}

/** Link into the map app with the Help panel open on `target`, in `lang`. */
export function appLink(site: Site, lang: Lang, t: HelpTarget): string {
  const p = new URLSearchParams({ lang, help: t.tab });
  if (t.view) p.set("hv", t.view);
  return `${site.base}#${p.toString()}`;
}

export const toolPath = (lang: Lang, t: ToolPage) => `${SITE_COPY[lang].dir}/${t.slug[lang]}/`;
export const homePath = (lang: Lang) => `${SITE_COPY[lang].dir}/`;
export const FLYERS_PATH = "help/flyers/";
export const flyerPath = (f: Flyer) => `${FLYERS_PATH}${f.id}/`;

// Applies the theme and text size chosen in the map app (same keys as
// display.ts). Runs before paint so a dark-mode reader never sees a flash.
export const DISPLAY_SCRIPT =
  'try{var d=document.documentElement,t=localStorage.getItem("scm-theme"),s=localStorage.getItem("scm-text");' +
  'if(t==="light"||t==="dark")d.dataset.theme=t;if(s==="large")d.dataset.text="large"}catch(e){}';
export const FLYER_PAGE_CSS = "@page{size:letter;margin:0}";
export const PRINT_SCRIPT = 'document.querySelector("[data-print]").addEventListener("click",function(){window.print()})';

interface DocProps {
  site: Site;
  lang: Lang;
  title: string;
  description: string;
  path: string;
  /** The same page in the other language (omitted for bilingual pages). */
  alternate?: string;
  /** Flyers are always light (they're made for paper). */
  print?: boolean;
  /** What the usage counter calls this page ("home" or a tool id); omitted = not counted. */
  countId?: string;
  children: ReactNode;
}

/** In <head>: the theme script (before paint, so dark mode never flashes), the
 *  shared stylesheet, and on flyers their letter-size page rule. */
export function HeadAssets({ site, print }: { site: Site; print?: boolean }) {
  return (
    <>
      {!print && <script dangerouslySetInnerHTML={{ __html: DISPLAY_SCRIPT }} />}
      <link rel="stylesheet" href={site.assets.css.href} integrity={site.assets.css.integrity} />
      {print && <style dangerouslySetInnerHTML={{ __html: FLYER_PAGE_CSS }} />}
    </>
  );
}

/** At the end of <body>: the shared page script (not on flyers). */
export function PageScript({ site }: { site: Site }) {
  return <script src={site.assets.js.href} integrity={site.assets.js.integrity} />;
}

/** The folder a page's service worker covers: help/ or ayuda/ (flyers included). */
const swFolder = (path: string) => (path.startsWith("ayuda/") ? "ayuda/" : path.startsWith("help/") ? "help/" : null);

function Doc({ site, lang, title, description, path, alternate, print, countId, children }: DocProps) {
  const folder = swFolder(path);
  const count = site.counter && countId && !print ? { "data-counter": site.counter, "data-count": `page:${countId}:${lang}` } : {};
  const alt = other(lang);
  return (
    <html lang={lang} {...(print ? { "data-theme": "light" } : {})}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Sites we link to aren't told which page sent the visitor. */}
        <meta name="referrer" content="no-referrer" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={absolute(site, path)} />
        {alternate && (
          <>
            <link rel="alternate" hrefLang={lang} href={absolute(site, path)} />
            <link rel="alternate" hrefLang={alt} href={absolute(site, alternate)} />
            <link rel="alternate" hrefLang="x-default" href={absolute(site, lang === "en" ? path : alternate)} />
          </>
        )}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={absolute(site, path)} />
        <meta property="og:locale" content={LOCALE[lang].replace("-", "_")} />
        <meta name="color-scheme" content={print ? "light" : "light dark"} />
        <HeadAssets site={site} print={print} />
      </head>
      <body
        className={print ? "is-flyer" : undefined}
        {...(folder && !print ? { "data-sw": `${site.base}${folder}sw.js`, "data-scope": `${site.base}${folder}` } : {})}
        {...count}
      >
        {children}
        {!print && <PageScript site={site} />}
      </body>
    </html>
  );
}

/** What the footer's correction email is about: this page, and when its facts were checked. */
interface ReportInfo {
  title: string;
  path: string;
  /** ISO date the page's facts were last checked. */
  checked?: string;
}

function Chrome({
  site,
  lang,
  alternate,
  report,
  children,
}: {
  site: Site;
  lang: Lang;
  alternate?: string;
  report?: ReportInfo;
  children: ReactNode;
}) {
  const s = SITE_COPY[lang];
  const r = REPORT_COPY[lang];
  const alt = other(lang);
  const reportLink = reportHref(
    lang,
    report?.title ?? s.siteName,
    report?.checked ? longDate(report.checked, LOCALE[lang]) : undefined,
    report ? absolute(site, report.path) : undefined,
  );
  return (
    <>
      <a className="skip" href="#main">
        {s.skip}
      </a>
      <header className="top">
        <div className="wrap top__in">
          <a className="brand" href={`${site.base}${homePath(lang)}`}>
            {s.siteName}
          </a>
          {alternate && (
            <a className="langlink" href={`${site.base}${alternate}`} hrefLang={alt} lang={alt} aria-label={SITE_COPY[lang].otherLangLabel}>
              {s.otherLang}
            </a>
          )}
        </div>
      </header>
      <main id="main" className="wrap" tabIndex={-1}>
        {children}
      </main>
      <footer className="foot">
        <div className="wrap">
          <p>{s.disclaimer}</p>
          <p className="foot__links">
            <a href={reportLink} data-report>
              {r.link}
              <span className="vh"> ({r.opensEmail})</span>
            </a>
            <a href={`${site.base}${partnersPath(lang)}`}>{PARTNERS_COPY[lang].footerLink}</a>
          </p>
          <p>
            <a href={site.base}>{s.footerMap}</a> {s.footerVolunteer}{" "}
            <a href={site.repo}>{s.footerSource}</a>
          </p>
          {site.counter && <p>{s.footerCount}</p>}
        </div>
      </footer>
    </>
  );
}

/** "Listen to this page": hidden until the page script finds an on-device voice. */
function Listen({ s }: { s: SiteCopy }) {
  return (
    <p className="listen" data-listen hidden>
      <button type="button" className="btn btn--quiet" data-start={s.listen} data-stop={s.listenStop}>
        <span aria-hidden="true">🔊 </span>
        <span data-label>{s.listen}</span>
      </button>
    </p>
  );
}

function OpenTool({ site, lang, tool }: { site: Site; lang: Lang; tool: ToolPage }) {
  const s = SITE_COPY[lang];
  return (
    <p className="open">
      <a className="btn" href={appLink(site, lang, tool.target)}>
        {s.open}
        <span className="vh">: {tool.name[lang]}</span>
      </a>
      <span className="open__hint">{s.openHint}</span>
    </p>
  );
}

function Place({ p, lang, s }: { p: PlaceInfo; lang: Lang; s: SiteCopy }) {
  return (
    <li className="place">
      <strong className="place__name">{p.name[lang]}</strong>
      {p.address && <span>{p.address}</span>}
      {p.hours && <span>{p.hours[lang]}</span>}
      {p.note && <span>{p.note[lang]}</span>}
      <span className="place__links">
        {p.phone && <PhoneLink phone={p.phone} s={s} />}
        {p.email && (
          <a href={`mailto:${p.email}`} data-nosay>
            {p.email}
          </a>
        )}
        {p.url && (
          <a href={p.url} data-nosay>
            {s.website}
          </a>
        )}
      </span>
    </li>
  );
}

function Office({ o, lang, s }: { o: LegalOffice; lang: Lang; s: SiteCopy }) {
  const kinds = o.kinds.map((k) => translate(lang, LEGAL_KIND_KEYS[k])).join(" · ");
  // Same allow-list as the map popup and the Help panel's list.
  const website = safeUrl(o.website, LEGAL_SITE_HOSTS);
  return (
    <li className="place">
      <strong className="place__name">{o.name}</strong>
      <span className="place__tags">
        {translate(lang, LEGAL_COST_KEYS[o.cost])} · {kinds}
      </span>
      <span>
        {o.address}, {o.city} {o.zip}
      </span>
      {o.languages.length > 0 && <span>{s.officeLanguages(o.languages.join(", "))}</span>}
      {o.eoir && <span>{s.eoir}</span>}
      {o.note[lang] && <span>{o.note[lang]}</span>}
      <span className="place__links">
        {o.phone && <PhoneLink phone={o.phone} s={s} />}
        {website && (
          <a href={website} data-nosay>
            {s.website}
          </a>
        )}
      </span>
    </li>
  );
}

/** "What do you need help with?": everyday problems, each a plain link to its page. */
function StartList({ site, lang }: { site: Site; lang: Lang }) {
  const t = START_COPY[lang];
  return (
    <section className="group start" aria-labelledby="start">
      <h2 id="start">{t.startQuestion}</h2>
      <ul className="choices">
        {START_CHOICES.map((choice) => (
          <li key={choice.page}>
            <a className="choice" href={`${site.base}${pagePath(lang, choice.page)}`}>
              <span>{choice.label[lang]}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Share this": WhatsApp is a plain link; Copy and Share are added by the page
 *  script only where the browser supports them. Not read aloud (data-quiet). */
function ShareBox({ site, lang, path, title, page }: { site: Site; lang: Lang; path: string; title: string; page: string }) {
  const t = START_COPY[lang];
  const url = absolute(site, path);
  const text = t.message(page === "home" ? undefined : title);
  const short = shortFor(lang, page);
  return (
    <section
      className="group sharebox"
      aria-labelledby="share-this"
      data-quiet
      data-share
      data-url={url}
      data-title={title}
      data-text={text}
      data-copied={t.copied}
      data-failed={t.copyFailedPage}
    >
      <h2 id="share-this">{t.shareTitle}</h2>
      <p>{t.sharePageLead}</p>
      <p className="sharebox__acts">
        <a className="btn btn--quiet" href={whatsappHref(text, url)}>
          {t.whatsapp}
        </a>
        <button type="button" className="btn btn--quiet" data-share-copy hidden>
          {t.copy}
        </button>
        <button type="button" className="btn btn--quiet" data-native hidden>
          {t.native}
        </button>
      </p>
      {short && (
        <p>
          {t.shortLink}{" "}
          <a href={`${site.base}${short}`} className="sharebox__short" data-nosay>
            {shortUrl(absolute(site, short))}
          </a>
        </p>
      )}
      <p className="muted" role="status"></p>
    </section>
  );
}

export function HomePage({ site, lang }: { site: Site; lang: Lang }) {
  const s = SITE_COPY[lang];
  const alternate = homePath(other(lang));
  return (
    <Doc site={site} lang={lang} title={s.homeTitle} description={s.homeDescription} path={homePath(lang)} alternate={alternate} countId="home">
      <Chrome site={site} lang={lang} alternate={alternate} report={{ title: s.homeTitle, path: homePath(lang) }}>
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">{s.heroTitle}</h1>
          <Listen s={s} />
          <p className="lead">{s.heroLead}</p>
          <ul className="promise" aria-label={s.promiseLabel}>
            {s.promise.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
        <StartList site={site} lang={lang} />
        {GROUPS.map((g) => (
          <section key={g.id} id={g.anchor[lang]} className="group" aria-labelledby={`g-${g.id}`}>
            <h2 id={`g-${g.id}`}>{g.name[lang]}</h2>
            <ul className="cards">
              {TOOLS.filter((t) => t.group === g.id).map((t) => (
                <li key={t.id}>
                  <a className="card" href={`${site.base}${toolPath(lang, t)}`}>
                    <span className="card__title">{t.name[lang]}</span>
                    <span className="card__text">{t.summary[lang]}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {/* Shown by the page script when the browser can save pages. */}
        <section
          className="group offline"
          aria-labelledby="offline"
          data-offline
          data-saving={s.offlineSaving}
          data-saved={s.offlineSaved}
          data-saved-on={s.offlineSavedOn}
          data-failed={s.offlineFailed}
          data-no-space={s.offlineNoSpace}
          data-cleared={s.offlineRemoved}
          hidden
        >
          <h2 id="offline">{s.offlineTitle}</h2>
          <p>{s.offlineText}</p>
          <p className="muted">{s.offlineIphone}</p>
          <p className="muted" data-state></p>
          <p className="offline__buttons">
            <button type="button" className="btn btn--quiet" data-save>
              {s.offlineSave}
            </button>
            <button type="button" className="btn btn--quiet" data-clear hidden>
              {s.offlineRemove}
            </button>
          </p>
          <p role="status" className="muted"></p>
        </section>
        <section className="group share" aria-labelledby="share">
          <h2 id="share">{s.flyersTitle}</h2>
          <p>{s.flyersLead}</p>
          <p className="offline__buttons">
            <a className="btn btn--quiet" href={`${site.base}${FLYERS_PATH}`}>
              {s.flyersLink}
            </a>
            <a className="btn btn--quiet" href={`${site.base}${partnersPath(lang)}`}>
              {PARTNERS_COPY[lang].homeLink}
            </a>
          </p>
        </section>
        <ShareBox site={site} lang={lang} path={homePath(lang)} title={s.homeTitle} page="home" />
        <OtherLanguages site={site} title={s.otherLanguages} />
      </Chrome>
    </Doc>
  );
}

/** Links to the pages in other languages, each labeled in its own language. */
function OtherLanguages({ site, title }: { site: Site; title: string }) {
  return (
    <section className="group" aria-labelledby="other-langs">
      <h2 id="other-langs">{title}</h2>
      <ul className="langlist">
        {LANG_PAGES.map((p) => (
          <li key={p.id}>
            <a href={`${site.base}${langPath(p)}`} hrefLang={p.htmlLang}>
              <span lang={p.htmlLang} dir={p.dir}>
                {p.nativeName}
              </span>{" "}
              ({p.englishName})
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ToolPageView({ site, lang, tool, offices }: { site: Site; lang: Lang; tool: ToolPage; offices: LegalOffice[] }) {
  const s = SITE_COPY[lang];
  const c = COPY[lang];
  const alternate = toolPath(other(lang), tool);
  const related = TOOLS.filter((t) => t.id !== tool.id && (t.group === tool.group || t.id === "legal"));
  return (
    <Doc
      site={site}
      lang={lang}
      title={`${tool.name[lang]} | ${s.siteName}`}
      description={tool.summary[lang]}
      path={toolPath(lang, tool)}
      alternate={alternate}
      countId={tool.id}
    >
      <Chrome site={site} lang={lang} alternate={alternate} report={{ title: tool.name[lang], path: toolPath(lang, tool), checked: tool.checked }}>
        <nav aria-label={s.breadcrumb} className="crumbs">
          <a href={`${site.base}${homePath(lang)}`}>{s.home}</a>
          <span aria-hidden="true"> › </span>
          <span aria-current="page">{tool.name[lang]}</span>
        </nav>
        <h1>{tool.name[lang]}</h1>
        <Listen s={s} />
        <p className="lead">{tool.intro[lang]}</p>
        <OpenTool site={site} lang={lang} tool={tool} />

        {tool.id === "legal" && (
          <>
            <section className="notario" aria-labelledby="notario">
              <h2 id="notario">{c.notarioTitle}</h2>
              <p>{c.notarioText}</p>
              <ul>
                {LEGAL_FACTS.verify.map((v) => (
                  <li key={v.url}>
                    <a href={v.url}>{v.label[lang]}</a>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="offices">
              <h2 id="offices">{s.officesTitle}</h2>
              <ul className="places">
                {offices.map((o) => (
                  <Office key={o.id} o={o} lang={lang} s={s} />
                ))}
              </ul>
            </section>
          </>
        )}

        {tool.groups.map((g, i) => (
          <section key={g.title.en} aria-labelledby={`law-${i}`}>
            <h2 id={`law-${i}`}>{g.title[lang]}</h2>
            <ul className="facts">
              {g.facts.map((f) => (
                <li key={f.id}>
                  {f[lang]} <span className="cite">({f.cite})</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {tool.sections?.map((sec, i) => (
          <section key={sec.title.en} aria-labelledby={`sec-${i}`}>
            <h2 id={`sec-${i}`}>{sec.title[lang]}</h2>
            <ul className="facts">
              {sec.items.map((item) => (
                <li key={item.en}>
                  {/* English the reader must hear in English (read aloud skips it on the Spanish page). */}
                  {lang === "es" && item.esEn && (
                    <>
                      <span lang="en" data-nosay>
                        {item.esEn}
                      </span>{" "}
                    </>
                  )}
                  {item[lang]}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {tool.places.length > 0 && (
          <section aria-labelledby="places">
            <h2 id="places">{s.placesTitle}</h2>
            <ul className="places">
              {tool.places.map((p) => (
                <Place key={p.name.en} p={p} lang={lang} s={s} />
              ))}
            </ul>
          </section>
        )}

        <OpenTool site={site} lang={lang} tool={tool} />

        <ShareBox site={site} lang={lang} path={toolPath(lang, tool)} title={tool.name[lang]} page={tool.id} />

        <section aria-labelledby="sources" data-quiet>
          <h2 id="sources">{s.sourcesTitle}</h2>
          <ul className="sources">
            {tool.sources.map((src) => (
              <li key={src.url}>
                <a href={src.url}>{src.label}</a>
              </li>
            ))}
          </ul>
          <p className="muted">{s.checked(longDate(tool.checked, LOCALE[lang]))}</p>
        </section>

        <nav aria-labelledby="more" className="more">
          <h2 id="more">{s.otherTools}</h2>
          <ul>
            {related.map((t) => (
              <li key={t.id}>
                <a href={`${site.base}${toolPath(lang, t)}`}>{t.name[lang]}</a>
              </li>
            ))}
            <li>
              <a href={`${site.base}${homePath(lang)}`}>{s.home}</a>
            </li>
          </ul>
        </nav>
      </Chrome>
    </Doc>
  );
}

export function QrCode({ url, label }: { url: string; label: string }) {
  const code = qr(url);
  return (
    <svg className="qr" viewBox={`0 0 ${code.size} ${code.size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={code.size} height={code.size} fill="#fff" />
      <path d={code.path} fill="#000" />
    </svg>
  );
}

/** The printed address under a QR code, without "https://". */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

function FlyerSideView({ site, f, lang, small }: { site: Site; f: Flyer; lang: Lang; small?: boolean }) {
  const side = f.side[lang];
  const fc = FLYER_COPY[lang];
  const url = absolute(site, flyerTarget(f, lang, SITE_COPY[lang].dir));
  return (
    <div className="fside" lang={lang}>
      {small ? <p className="fside__head">{side.headline}</p> : <h2 className="fside__head">{side.headline}</h2>}
      <ul className="fside__list">
        {side.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <div className="fside__qr">
        <QrCode url={url} label={`QR: ${url}`} />
        <p className="fside__scan">{fc.scan}</p>
        <p className="fside__url">{shortUrl(url)}</p>
      </div>
    </div>
  );
}

export function FlyerPage({ site, f }: { site: Site; f: Flyer }) {
  const title = `${f.side.en.headline} / ${f.side.es.headline}`;
  return (
    <Doc site={site} lang="en" title={title} description={`${FLYER_COPY.en.indexTitle} / ${FLYER_COPY.es.indexTitle}`} path={flyerPath(f)} print>
      <div className="toolbar noprint">
        <a href={`${site.base}${FLYERS_PATH}`}>
          {FLYER_COPY.en.back} / <span lang="es">{FLYER_COPY.es.back}</span>
        </a>
        <button type="button" className="btn" data-print>
          {FLYER_COPY.en.print} / <span lang="es">{FLYER_COPY.es.print}</span>
        </button>
      </div>
      <main className={`sheet sheet--${f.layout}`} aria-labelledby="flyer-title">
        <h1 id="flyer-title" className="vh">
          {f.side.en.headline} / <span lang="es">{f.side.es.headline}</span>
        </h1>
        {f.layout === "cards" ? (
          [0, 1, 2, 3].map((i) => (
            <div className="fcard" key={i} aria-hidden={i > 0 ? true : undefined}>
              <FlyerSideView site={site} f={f} lang="en" small />
              <FlyerSideView site={site} f={f} lang="es" small />
            </div>
          ))
        ) : (
          <>
            <div className="sheet__cols">
              <FlyerSideView site={site} f={f} lang="en" />
              <FlyerSideView site={site} f={f} lang="es" />
            </div>
            <div className="sheet__foot">
              <p>
                {FLYER_COPY.en.promise} <span lang="es">{FLYER_COPY.es.promise}</span>
              </p>
              <p className="sheet__note">
                {FLYER_COPY.en.note} <span lang="es">{FLYER_COPY.es.note}</span>
              </p>
            </div>
          </>
        )}
      </main>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />
    </Doc>
  );
}

export function FlyerIndex({ site, flyers }: { site: Site; flyers: readonly Flyer[] }) {
  const en = FLYER_COPY.en;
  const es = FLYER_COPY.es;
  return (
    <Doc site={site} lang="en" title={`${en.indexTitle} / ${es.indexTitle}`} description={en.indexLead} path={FLYERS_PATH}>
      <Chrome site={site} lang="en" report={{ title: en.indexTitle, path: FLYERS_PATH }}>
        <h1>
          {en.indexTitle} / <span lang="es">{es.indexTitle}</span>
        </h1>
        <p className="lead">{en.indexLead}</p>
        <p className="lead" lang="es">
          {es.indexLead}
        </p>
        <ul className="cards">
          {flyers.map((f) => (
            <li key={f.id}>
              <a className="card" href={`${site.base}${flyerPath(f)}`}>
                <span className="card__title">{f.side.en.headline}</span>
                <span className="card__text" lang="es">
                  {f.side.es.headline}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <h2>
          {SITE_COPY.en.otherLanguages} / <span lang="es">{SITE_COPY.es.otherLanguages}</span>
        </h2>
        <ul className="cards">
          {LANG_PAGES.map((p) => (
            <li key={p.id}>
              <a className="card" href={`${site.base}${langFlyerPath(p)}`} hrefLang={p.htmlLang}>
                <span className="card__title" lang={p.htmlLang} dir={p.dir}>
                  {p.flyer.headline}
                </span>
                <span className="card__text">{p.englishName}</span>
              </a>
            </li>
          ))}
        </ul>
        <p>
          <a href={`${site.base}${homePath("en")}`}>{SITE_COPY.en.home}</a> ·{" "}
          <a href={`${site.base}${homePath("es")}`} lang="es" hrefLang="es">
            {SITE_COPY.es.home}
          </a>
        </p>
      </Chrome>
    </Doc>
  );
}

/** One ready-to-share paragraph with its Copy button (shown by the page
 *  script when the browser can copy; the text itself is always selectable). */
function Blurb({ id, text, textLang, name, lang }: { id: string; text: string; textLang: Lang; name: string; lang: Lang }) {
  const p = PARTNERS_COPY[lang];
  return (
    <div className="blurb__item">
      <p className="blurb__lang">{p.langName[textLang]}</p>
      <p className="blurb__text" id={id} lang={textLang === lang ? undefined : textLang}>
        {text}
      </p>
      <p className="blurb__bar">
        <button type="button" className="btn btn--quiet" data-copy={id} data-name={name} aria-label={p.copyLabel(name, p.langName[textLang])} hidden>
          {p.copy}
        </button>
        <span className="blurb__done" role="status" data-copy-status></span>
      </p>
    </div>
  );
}

/** Both languages' paragraphs for one tool (or the home page), page language first. */
function ShareBlock({
  id,
  name,
  lang,
  text,
  links,
  level = 4,
}: {
  id: string;
  name: string;
  lang: Lang;
  text: (l: Lang) => string;
  links: Record<Lang, string>;
  level?: 3 | 4;
}) {
  const p = PARTNERS_COPY[lang];
  const order: Lang[] = [lang, other(lang)];
  const Heading = level === 3 ? "h3" : "h4";
  return (
    <article className="blurb" aria-labelledby={`t-${id}`}>
      <Heading id={`t-${id}`}>{name}</Heading>
      {order.map((l) => (
        <Blurb key={l} id={`b-${id}-${l}`} text={text(l)} textLang={l} name={name} lang={lang} />
      ))}
      <p className="blurb__links">
        <span className="vh">{p.linksLabel(name)} </span>
        {order.map((l) => (
          <a key={l} href={links[l]} hrefLang={l}>
            {p.pageIn[l]}
          </a>
        ))}
      </p>
    </article>
  );
}

export function PartnersPage({ site, lang }: { site: Site; lang: Lang }) {
  const s = SITE_COPY[lang];
  const p = PARTNERS_COPY[lang];
  const path = partnersPath(lang);
  const alternate = partnersPath(other(lang));
  const both = (f: (l: Lang) => string): Record<Lang, string> => ({ en: f("en"), es: f("es") });
  const homeUrls = both((l) => absolute(site, homePath(l)));
  return (
    <Doc site={site} lang={lang} title={`${p.title} | ${s.siteName}`} description={p.description} path={path} alternate={alternate}>
      <Chrome site={site} lang={lang} alternate={alternate} report={{ title: p.title, path }}>
        <nav aria-label={s.breadcrumb} className="crumbs">
          <a href={`${site.base}${homePath(lang)}`}>{s.home}</a>
          <span aria-hidden="true"> › </span>
          <span aria-current="page">{p.title}</span>
        </nav>
        <h1>{p.title}</h1>
        <p className="lead">{p.lead}</p>

        <section aria-labelledby="never">
          <h2 id="never">{p.neverTitle}</h2>
          <ul className="never">
            {p.never.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="flyers">
          <h2 id="flyers">{p.flyersTitle}</h2>
          <p>{p.flyersLead}</p>
          <ul className="cards">
            {FLYERS.map((f) => (
              <li key={f.id}>
                <a className="card" href={`${site.base}${flyerPath(f)}`}>
                  <span className="card__title">{f.side[lang].headline}</span>
                  <span className="card__text" lang={other(lang)}>
                    {f.side[other(lang)].headline}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <h3>{p.printTitle}</h3>
          <ul>
            {p.printTips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>
            <a href={`${site.base}${FLYERS_PATH}`}>{p.flyersAll}</a>
          </p>
        </section>

        <section aria-labelledby="text" data-copied={p.copied("{name}")} data-failed={p.copyFailed}>
          <h2 id="text">{p.textTitle}</h2>
          <p>{p.textLead}</p>
          <ShareBlock
            id="home"
            level={3}
            name={p.generalName}
            lang={lang}
            text={(l) => generalBlurb(l, homeUrls[l])}
            links={both((l) => `${site.base}${homePath(l)}`)}
          />
          {GROUPS.map((g) => {
            const tools = TOOLS.filter((t) => t.group === g.id);
            return tools.length === 0 ? null : (
              <section key={g.id} aria-labelledby={`pg-${g.id}`} className="blurbs">
                <h3 id={`pg-${g.id}`} className="blurbs__group">
                  {g.name[lang]}
                </h3>
                {tools.map((t) => (
                  <ShareBlock
                    key={t.id}
                    id={t.id}
                    name={t.name[lang]}
                    lang={lang}
                    text={(l) => toolBlurb(l, t, absolute(site, toolPath(l, t)))}
                    links={both((l) => `${site.base}${toolPath(l, t)}`)}
                  />
                ))}
              </section>
            );
          })}
        </section>

        <section aria-labelledby="request">
          <h2 id="request">{p.requestTitle}</h2>
          <p>{p.requestText}</p>
          <p>
            <a className="btn btn--quiet" href={mailto(p.requestSubject, p.requestBody)}>
              {p.requestLink}
              <span className="vh"> ({REPORT_COPY[lang].opensEmail})</span>
            </a>
          </p>
        </section>
      </Chrome>
    </Doc>
  );
}
/** A short link (/h/renta/): a tiny page that sends the browser on to the real
 *  one, with a plain link for the rare browser that doesn't follow it. */
export function ShortLinkPage({ site, lang, to, title }: { site: Site; lang: Lang; to: string; title: string }) {
  const href = `${site.base}${to}`;
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="referrer" content="no-referrer" />
        <meta name="robots" content="noindex" />
        <meta httpEquiv="refresh" content={`0; url=${href}`} />
        <title>{title}</title>
        <link rel="canonical" href={absolute(site, to)} />
        <meta name="color-scheme" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: "body{font:1.125rem/1.5 system-ui,sans-serif;margin:2rem auto;max-width:40rem;padding:0 16px}" }} />
      </head>
      <body>
        <p>
          <a href={href}>{title}</a>
        </p>
      </body>
    </html>
  );
}

export const shortPath = (slug: string) => `${SHORT_DIR}/${slug}/`;
