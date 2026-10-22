// The Punjabi and Dari pages and their flyers (data in languages.ts). Same
// shell as the English/Spanish pages (Pages.tsx): static HTML, the same CSP,
// no requests, plain links. Each page sets its own lang and dir, so screen
// readers switch voice and Dari reads right to left.
import type { ReactNode } from "react";
import { longDate } from "../help/dates";
import { REPORT_EMAIL } from "../help/report";
import { LANGUAGES_CHECKED, LINES, languageSources, type LineId } from "../help/languages-facts";
import { SITE_COPY } from "./site-copy";
import { GROUPS, TOOLS } from "./tools";
import { AI_NOTE_EN, LANG_PAGES, langFlyerPath, langPath, type LangPage } from "./languages";
import {
  absolute,
  DISPLAY_SCRIPT,
  FLYER_PAGE_CSS,
  homePath,
  PRINT_SCRIPT,
  QrCode,
  shortUrl,
  telHref,
  toolPath,
  type Site,
} from "./Pages";
import CLIENT_SCRIPT from "./client.js?raw";

const OG_LOCALE: Record<LangPage["id"], string> = { pa: "pa_IN", prs: "fa_AF" };

/** A plain mailto link: the subject names the page, nothing else is sent. */
const correctionsHref = (p: LangPage) =>
  `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`Correction: ${p.englishName} page`)}`;

function LangDoc({ site, page, title, description, path, print, children }: {
  site: Site;
  page: LangPage;
  title: string;
  description: string;
  path: string;
  print?: boolean;
  children: ReactNode;
}) {
  return (
    <html lang={page.htmlLang} dir={page.dir} {...(print ? { "data-theme": "light" } : {})}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="referrer" content="no-referrer" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={absolute(site, path)} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={absolute(site, path)} />
        <meta property="og:locale" content={OG_LOCALE[page.id]} />
        <meta name="color-scheme" content={print ? "light" : "light dark"} />
        {!print && <script dangerouslySetInnerHTML={{ __html: DISPLAY_SCRIPT }} />}
        <style dangerouslySetInnerHTML={{ __html: print ? `${site.css}${FLYER_PAGE_CSS}` : site.css }} />
      </head>
      <body
        className={print ? "is-flyer" : undefined}
        {...(!print ? { "data-sw": `${site.base}help/sw.js`, "data-scope": `${site.base}help/` } : {})}
      >
        {children}
        {!print && <script dangerouslySetInnerHTML={{ __html: CLIENT_SCRIPT }} />}
      </body>
    </html>
  );
}

/** A phone number, kept left to right inside Dari text. */
function Tel({ phone, label }: { phone: string; label: string }) {
  const href = telHref(phone);
  return href ? (
    <a href={href} aria-label={label} dir="ltr" className="ltel">
      {phone}
    </a>
  ) : (
    <span dir="ltr">{phone}</span>
  );
}

function LinePlace({ item, call }: { item: { id: LineId; name: string; what: string }; call: (n: string) => string }) {
  const line = LINES[item.id];
  return (
    <li className="place">
      <strong className="place__name">{item.name}</strong>
      <span>{item.what}</span>
      {line.address && (
        // <bdi> keeps the English address in order without pulling it to the left in Dari.
        <span data-nosay>
          <bdi lang="en">{line.address}</bdi>
        </span>
      )}
      <span className="place__links">
        <Tel phone={line.phone} label={call(line.phone)} />
      </span>
    </li>
  );
}

export function LangHomePage({ site, page }: { site: Site; page: LangPage }) {
  const c = page.copy;
  const path = langPath(page);
  const others = LANG_PAGES.filter((p) => p.id !== page.id);
  return (
    <LangDoc site={site} page={page} title={c.title} description={c.description} path={path}>
      <a className="skip" href="#main">
        {c.skip}
      </a>
      <header className="top">
        <div className="wrap top__in">
          <a className="brand" href={`${site.base}${path}`}>
            {c.siteName}
          </a>
          <span className="top__langs">
            <a className="langlink" href={`${site.base}${homePath("en")}`} hrefLang="en" lang="en" dir="ltr">
              English
            </a>
            <a className="langlink" href={`${site.base}${homePath("es")}`} hrefLang="es" lang="es" dir="ltr">
              Español
            </a>
          </span>
        </div>
      </header>
      <main id="main" className="wrap" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">{c.heading}</h1>
          <p className="listen" data-listen hidden>
            <button type="button" className="btn btn--quiet" data-start={c.listen} data-stop={c.listenStop}>
              <span aria-hidden="true">🔊 </span>
              <span data-label>{c.listen}</span>
            </button>
          </p>
          <p className="lead">{c.lead}</p>
          <ul className="promise" aria-label={c.promiseLabel}>
            {c.promise.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <section className="langnote" aria-labelledby="ai-note">
          <h2 id="ai-note">{c.aiTitle}</h2>
          <p>
            {c.aiText}{" "}
            <a href={correctionsHref(page)} dir="ltr" data-nosay>
              {REPORT_EMAIL}
            </a>
          </p>
          <p className="muted" data-nosay>
            <bdi lang="en">
              {AI_NOTE_EN(page.englishName)} {REPORT_EMAIL}
            </bdi>
          </p>
        </section>

        <section aria-labelledby="how">
          <h2 id="how">{c.howTitle}</h2>
          <ol className="steps">
            {c.how.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
          <div className="say">
            <p>{c.sayTitle}</p>
            <p className="say__en" lang="en" dir="ltr" data-nosay>
              {c.sayEn}
            </p>
            <p className="muted">{c.sayHint}</p>
          </div>
        </section>

        <section aria-labelledby="tools">
          <h2 id="tools">{c.toolsTitle}</h2>
          {GROUPS.map((g) => {
            const tools = TOOLS.filter((t) => t.group === g.id);
            if (tools.length === 0) return null;
            const groupName = page.groups[g.id];
            return (
              <section key={g.id} aria-labelledby={`g-${g.id}`}>
                <h3 id={`g-${g.id}`} {...(groupName ? {} : { lang: "en", dir: "ltr" })}>
                  {groupName ?? g.name.en}
                </h3>
                <ul className="ltools">
                  {tools.map((t) => {
                    const tr = page.tools[t.id];
                    const name = tr?.name ?? t.name.en;
                    return (
                      <li key={t.id} className="ltool">
                        <strong className="ltool__name" {...(tr ? {} : { lang: "en", dir: "ltr" })}>
                          {name}
                        </strong>
                        {tr ? <span className="ltool__text">{tr.summary}</span> : <span className="muted">{c.untranslated}</span>}
                        <span className="ltool__links">
                          <a href={`${site.base}${toolPath("en", t)}`} hrefLang="en" aria-label={c.openIn(name, c.inEnglish)}>
                            <span lang="en">{c.inEnglish}</span>
                          </a>
                          <a href={`${site.base}${toolPath("es", t)}`} hrefLang="es" aria-label={c.openIn(name, c.inSpanish)}>
                            <span lang="es">{c.inSpanish}</span>
                          </a>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </section>

        <section aria-labelledby="lines">
          <h2 id="lines">{c.linesTitle}</h2>
          <p>{c.linesLead}</p>
          <ul className="places">
            {page.lines.map((l) => (
              <LinePlace key={l.id} item={l} call={c.call} />
            ))}
          </ul>
          <p>
            <strong>{c.emergency}</strong>
          </p>
        </section>

        {page.newcomers && (
          <section aria-labelledby="newcomers">
            <h2 id="newcomers">{page.newcomers.title}</h2>
            <p>{page.newcomers.lead}</p>
            <ul className="places">
              {page.newcomers.items.map((l) => (
                <LinePlace key={l.id} item={l} call={c.call} />
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="red">
          <h2 id="red">{c.redTitle}</h2>
          <p>{c.redText}</p>
          <ul>
            {page.redCards.map((r) => (
              <li key={r.href}>
                <a href={r.href} hrefLang={r.lang} lang={r.lang} {...(r.dir ? { dir: r.dir } : {})}>
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="flyer">
          <h2 id="flyer">{c.flyerTitle}</h2>
          <p>{c.flyerText}</p>
          <p>
            <a className="btn btn--quiet" href={`${site.base}${langFlyerPath(page)}`}>
              {c.flyerLink}
            </a>
          </p>
        </section>

        <nav aria-labelledby="langs" className="more">
          <h2 id="langs">{c.otherLangsTitle}</h2>
          <ul>
            {others.map((p) => (
              <li key={p.id}>
                <a href={`${site.base}${langPath(p)}`} hrefLang={p.htmlLang} lang={p.htmlLang} dir={p.dir}>
                  {p.nativeName}
                </a>{" "}
                <span lang="en" dir="ltr">
                  ({p.englishName})
                </span>
              </li>
            ))}
            <li>
              <a href={`${site.base}${homePath("en")}`} hrefLang="en" lang="en" dir="ltr">
                {SITE_COPY.en.home}
              </a>
            </li>
            <li>
              <a href={`${site.base}${homePath("es")}`} hrefLang="es" lang="es" dir="ltr">
                {SITE_COPY.es.home}
              </a>
            </li>
          </ul>
        </nav>

        <section aria-labelledby="sources" data-quiet>
          <h2 id="sources">{c.sourcesTitle}</h2>
          <ul className="sources" lang="en" dir="ltr">
            {languageSources([...page.lines, ...(page.newcomers?.items ?? [])].map((l) => l.id)).map((src) => (
              <li key={src.url}>
                <a href={src.url}>{src.label}</a>
              </li>
            ))}
          </ul>
          <p className="muted">{c.checked(longDate(LANGUAGES_CHECKED, page.locale))}</p>
        </section>
      </main>
      <footer className="foot">
        <div className="wrap">
          <p>{c.disclaimer}</p>
          <p>
            <a href={site.base} lang="en" dir="ltr">
              Community Camera Map
            </a>{" "}
            {c.footerVolunteer}{" "}
            <a href={site.repo} lang="en" dir="ltr">
              {SITE_COPY.en.footerSource}
            </a>
          </p>
        </div>
      </footer>
    </LangDoc>
  );
}

export function LangFlyerPage({ site, page }: { site: Site; page: LangPage }) {
  const c = page.copy;
  const f = page.flyer;
  const url = absolute(site, langPath(page));
  return (
    <LangDoc site={site} page={page} title={`${f.headline} | ${f.english}`} description={f.english} path={langFlyerPath(page)} print>
      <div className="toolbar noprint">
        <a href={`${site.base}${langPath(page)}`}>{c.back}</a>
        <button type="button" className="btn" data-print>
          {c.print} / <span lang="en">Print</span>
        </button>
      </div>
      <main className="sheet sheet--single" aria-labelledby="flyer-title">
        <div className="fside">
          <h1 id="flyer-title" className="fside__head">
            {f.headline}
          </h1>
          <p className="lflyer__en">
            <bdi lang="en">{f.english}</bdi>
          </p>
          <ul className="fside__list">
            {f.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="fside__qr">
            <QrCode url={url} label={`QR: ${url}`} />
            <p className="fside__scan">{c.scan}</p>
            <p className="fside__url" dir="ltr">
              {shortUrl(url)}
            </p>
          </div>
        </div>
        <div className="sheet__foot">
          <p>{f.promise}</p>
          <p className="sheet__note">{f.note}</p>
        </div>
      </main>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />
    </LangDoc>
  );
}
