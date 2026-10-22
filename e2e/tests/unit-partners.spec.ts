// Unit tests (no browser) for the partners page text and the "See something
// wrong? Tell us" email link: every tool gets ready-to-share text in both
// languages, and the mailto: link survives accents, quotes and line breaks.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { REPORT_COPY, REPORT_EMAIL, mailto, reportHref } from "../../frontend/src/help/report";
import { PARTNERS_COPY } from "../../frontend/src/landing/partners-copy";
import { generalBlurb, partnersPath, toolBlurb } from "../../frontend/src/landing/partners";
import { TOOLS } from "../../frontend/src/landing/tools";

const keys = (o: object) => Object.keys(o).sort();

/** The parts of a mailto: link, decoded the way a mail app does. */
function parse(href: string) {
  const m = /^mailto:([^?]+)\?subject=([^&]*)&body=([^&]*)$/.exec(href);
  expect(m, href).not.toBeNull();
  return { to: m![1], subject: decodeURIComponent(m![2]!), body: decodeURIComponent(m![3]!) };
}

test("correction link: subject and body arrive intact in both languages", () => {
  const en = parse(reportHref("en", "Rent & deposits? Don't “guess”", "October 22, 2026", "https://example.org/help/rent/"));
  expect(en.to).toBe(REPORT_EMAIL);
  expect(en.subject).toBe("Correction: Rent & deposits? Don't “guess” (checked October 22, 2026)");
  expect(en.body).toContain("Page: Rent & deposits? Don't “guess”\r\nhttps://example.org/help/rent/\r\nLast checked: October 22, 2026");
  expect(en.body).toContain("Please don't include private details");

  const es = parse(reportHref("es", "Conozca sus derechos", "22 de octubre de 2026"));
  expect(es.subject).toBe("Corrección: Conozca sus derechos (revisado el 22 de octubre de 2026)");
  expect(es.body.startsWith("Página: Conozca sus derechos\r\nRevisado por última vez: 22 de octubre de 2026")).toBe(true);
  expect(es.body).toContain("Por favor no incluya datos privados");

  // No date: no "(checked …)", no empty line for it.
  expect(parse(reportHref("en", "Free help")).subject).toBe("Correction: Free help");
});

test("mailto links use only URL-safe characters (no raw spaces, quotes, accents or parentheses)", () => {
  const hrefs = [
    reportHref("en", "Don't (really) guess!", "October 22, 2026", "https://e.org/a/"),
    reportHref("es", "¿Qué beneficios puedo recibir?", "1 de enero de 2027"),
    ...(["en", "es"] as const).map((l) => mailto(PARTNERS_COPY[l].requestSubject, PARTNERS_COPY[l].requestBody)),
  ];
  for (const h of hrefs) {
    expect(h, h).toMatch(/^mailto:[a-z0-9.@-]+\?subject=[A-Za-z0-9%._~-]*&body=[A-Za-z0-9%._~-]*$/);
    // Same rule the prerender uses to refuse unsafe links.
    expect(h).toMatch(/^mailto:[^\s@<>"]+@[^\s@<>"]+$/);
  }
});

test("the address lives in one place only", () => {
  const src = join(__dirname, "../../frontend/src");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|css)$/.test(name) && readFileSync(p, "utf8").includes(REPORT_EMAIL)) hits.push(p.slice(src.length + 1));
    }
  };
  walk(src);
  expect(hits).toEqual(["help/report.ts"]);
});

test("every tool gets a ready-to-share paragraph in both languages, ending with its link", () => {
  for (const lang of ["en", "es"] as const) {
    const tagline = PARTNERS_COPY[lang].tagline;
    for (const t of TOOLS) {
      const url = `https://example.org/${t.slug[lang]}/`;
      const text = toolBlurb(lang, t, url);
      expect(text, t.id).toBe(`${t.name[lang]}: ${t.summary[lang]} ${tagline} ${url}`);
      // Summaries are full sentences, so the paragraph reads cleanly.
      expect(t.summary[lang], `${lang}/${t.id}`).toMatch(/[.?!]$/);
      // Short enough for a WhatsApp message or a social post.
      expect(text.length, `${lang}/${t.id}`).toBeLessThan(480);
    }
    expect(generalBlurb(lang, "https://example.org/")).toMatch(/^.+\. .+ https:\/\/example\.org\/$/);
  }
  expect(partnersPath("en")).toBe("help/partners/");
  expect(partnersPath("es")).toBe("ayuda/socios/");
});

test("partners and report wording is complete in both languages", () => {
  expect(keys(PARTNERS_COPY.es)).toEqual(keys(PARTNERS_COPY.en));
  expect(keys(REPORT_COPY.es)).toEqual(keys(REPORT_COPY.en));
  expect(PARTNERS_COPY.es.never.length).toBe(PARTNERS_COPY.en.never.length);
  expect(PARTNERS_COPY.es.printTips.length).toBe(PARTNERS_COPY.en.printTips.length);
  // The copy confirmation names the paragraph (filled in by the page script).
  for (const l of ["en", "es"] as const) expect(PARTNERS_COPY[l].copied("{name}")).toContain("{name}");
  // Label in name (WCAG 2.5.3): the Copy button's accessible name starts with its visible word.
  for (const l of ["en", "es"] as const) expect(PARTNERS_COPY[l].copyLabel("X", "Y").startsWith(PARTNERS_COPY[l].copy)).toBe(true);
});
