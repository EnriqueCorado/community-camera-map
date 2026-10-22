// Unit tests (no browser) for the "What do you need help with?" chooser, the
// Share links and the short links: one list each, kept in step with the
// public pages in landing/tools.ts.
import { test, expect } from "@playwright/test";
import { PAGES, START_CHOICES, SHORT_LINKS, pageFor, pagePath, shortFor, shortTarget, whatsappHref, type PageId } from "../../frontend/src/help/start";
import { START_COPY } from "../../frontend/src/help/start-copy";
import { TOOLS } from "../../frontend/src/landing/tools";
import { SITE_COPY } from "../../frontend/src/landing/site-copy";
import { HELP_TABS, isHelpView } from "../../frontend/src/help/target";

const ids = Object.keys(PAGES) as PageId[];

test("PAGES matches every public tool page: same ids, slugs and Help panel targets", () => {
  expect([...ids].sort()).toEqual(TOOLS.map((t) => t.id).sort());
  for (const tool of TOOLS) {
    const p = PAGES[tool.id as PageId];
    expect(p.slug, tool.id).toEqual(tool.slug);
    expect(p.target, tool.id).toEqual(tool.target);
    for (const lang of ["en", "es"] as const) expect(pagePath(lang, tool.id as PageId)).toBe(`${SITE_COPY[lang].dir}/${tool.slug[lang]}/`);
  }
});

test("every target is a real tab and view", () => {
  for (const id of ids) {
    const t: { tab: string; view?: string } = PAGES[id].target;
    expect(HELP_TABS, id).toContain(t.tab);
    if (t.view) expect(isHelpView(t.tab as (typeof HELP_TABS)[number], t.view), id).toBe(true);
  }
});

test("the chooser offers every tool once, in both languages", () => {
  expect(START_CHOICES.map((c) => c.page).sort()).toEqual([...ids].sort());
  for (const c of START_CHOICES) {
    expect(c.label.en.length, c.page).toBeGreaterThan(8);
    expect(c.label.es.length, c.page).toBeGreaterThan(8);
    expect(c.label.es, c.page).not.toBe(c.label.en);
  }
});

test("pageFor finds the page for the tool open in the panel (or its tab's first one)", () => {
  for (const id of ids) expect(pageFor(PAGES[id].target), id).toBe(id);
  expect(pageFor({ tab: "rent" })).toBe("rent");
  expect(pageFor({ tab: "benefits", view: "screener" })).toBe("benefits");
  expect(pageFor({ tab: "benefits", view: "medi-cal" })).toBe("medi-cal-work");
  expect(pageFor({ tab: "medical", hospitalId: "x" })).toBe("medical");
});

test("short links: lowercase ASCII, unique, and each page has one in each language", () => {
  const slugs = SHORT_LINKS.map((s) => s.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  for (const id of [...ids, "home"]) {
    for (const lang of ["en", "es"] as const) expect(shortFor(lang, id), `${id} ${lang}`).toMatch(/^h\/[a-z0-9-]+\/$/);
  }
  expect(shortTarget({ slug: "renta", page: "rent", lang: "es" })).toBe("ayuda/aumento-de-renta/");
  expect(shortTarget({ slug: "help", page: "home", lang: "en" })).toBe("help/");
});

test("the WhatsApp link carries only the message and the address", () => {
  const href = whatsappHref("Ayuda gratis: renta", "https://example.org/ayuda/aumento-de-renta/");
  expect(href).toBe("https://wa.me/?text=Ayuda%20gratis%3A%20renta%20https%3A%2F%2Fexample.org%2Fayuda%2Faumento-de-renta%2F");
  expect(new URL(href).searchParams.get("text")).toBe("Ayuda gratis: renta https://example.org/ayuda/aumento-de-renta/");
});

test("start and share wording exists in both languages", () => {
  const keys = (o: object) => Object.keys(o).sort();
  expect(keys(START_COPY.es)).toEqual(keys(START_COPY.en));
  for (const lang of ["en", "es"] as const) {
    expect(START_COPY[lang].message().length).toBeGreaterThan(20);
    expect(START_COPY[lang].message("X")).toMatch(/^X — /);
  }
});
