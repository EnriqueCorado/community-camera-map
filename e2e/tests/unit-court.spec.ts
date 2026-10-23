// Unit tests for the immigration court guide (no browser): the A-Number helper,
// every fact cited in both languages, only verified phone numbers, the
// San Francisco closure, careful wording about arrests, and the upkeep item.
import { test, expect } from "@playwright/test";
import { parseANumber } from "../../frontend/src/help/court";
import * as COURT from "../../frontend/src/help/court-facts";
import { COURT_COPY } from "../../frontend/src/help/court-copy";
import { upkeepItems } from "../../frontend/src/help/upkeep";
import { RIGHTS_FACTS } from "../../frontend/src/help/rights-facts";
import { factsById } from "../../frontend/src/help/facts-by-id";

test("the A-Number helper: 8 or 9 digits, any spacing, padded to 9", () => {
  expect(parseANumber("A123456789")).toEqual({ digits: "123456789", padded: false, display: "A-123-456-789" });
  expect(parseANumber(" a-123-456-789 ")).toMatchObject({ digits: "123456789" });
  expect(parseANumber("A# 123 456 789")).toMatchObject({ digits: "123456789" });
  expect(parseANumber("12345678")).toEqual({ digits: "012345678", padded: true, display: "A-012-345-678" });
  // Pasted numbers often carry Unicode hyphens or dashes (U+2010-2015).
  for (const dashed of ["A\u2010123\u2010456\u2010789", "123\u2013456\u2013789", "A\u2014 123\u2011456\u2012789"]) {
    expect(parseANumber(dashed), JSON.stringify(dashed)).toMatchObject({ digits: "123456789" });
  }
  for (const bad of ["", "A", "1234567", "1234567890", "A12345678X", "000000000", "12a456789", "A-123-456-789-0"]) {
    expect(parseANumber(bad), bad).toBeNull();
  }
});

test("every fact is cited and complete in both languages; copy keys match", () => {
  for (const [name, list] of Object.entries(COURT.COURT_FACTS)) {
    for (const f of list) {
      expect(f.cite.length, `${name}/${f.id}`).toBeGreaterThan(5);
      expect(f.en.length, `${name}/${f.id}`).toBeGreaterThan(30);
      expect(f.es.length, `${name}/${f.id}`).toBeGreaterThan(30);
    }
  }
  const keys = (o: object) => Object.keys(o).sort();
  expect(keys(COURT_COPY.es)).toEqual(keys(COURT_COPY.en));
  expect(COURT_COPY.es.bring).toHaveLength(COURT_COPY.en.bring.length);
  for (const s of COURT.COURT_SOURCES) expect(s.url).toMatch(/^https:\/\//);
});

test("only phone numbers verified in the research", () => {
  // ~/dev/outreach-help-2026-10/research/court.md and know-your-rights.md (EOIR roster).
  const verified = new Set([
    "8008987180", // EOIR case information line
    "9164479301", // Sacramento Immigration Court
    "9256809015", // Concord Immigration Court
    "2094912712", // World Relief Modesto
    "2096672378", // IRC Turlock
    "5104528222", // IRC immigration consultations (IRC's Turlock page, checked 2026-10-23)
    "2094445910", // Catholic Charities Modesto, immigration
  ]);
  // COURT includes EOIR_PHONE, the number the "Check your case" helper shows.
  expect(COURT.EOIR_PHONE).toBe("1-800-898-7180");
  const text = JSON.stringify(COURT) + JSON.stringify(COURT_COPY);
  const found = [...text.matchAll(/(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g)].map((m) => m[1]! + m[2]! + m[3]!);
  expect(found.length).toBeGreaterThan(5);
  for (const n of found) expect(verified, n).toContain(n);
});

test("the San Francisco court's closure and the nearest courts are stated", () => {
  const sf = COURT.COURT_FACTS.courts.find((f) => f.id === "sf-closed")!;
  expect(sf.en).toContain("September 4, 2026");
  expect(sf.es).toContain("4 de septiembre de 2026");
  expect(COURT.COURTS.map((c) => c.name.en)).toEqual(["Sacramento Immigration Court", "Concord Immigration Court"]);
});

test("careful wording: never tells people to skip court, rulings are dated and can change", () => {
  // The reused rights facts are shown on this page too, so they're checked as well.
  const reused = [
    ...factsById(RIGHTS_FACTS.detained, "find-eoir-phone", "find-eoir-acis"),
    ...factsById(RIGHTS_FACTS.stopped, "right-no-sign"),
    ...factsById(RIGHTS_FACTS.scams, "scam-notario", "scam-report"),
  ];
  const all = JSON.stringify(COURT.COURT_FACTS) + JSON.stringify(COURT_COPY) + JSON.stringify(reused);
  for (const risky of [/don.t go to (court|your hearing)/i, /no vaya a (la corte|su audiencia)/i, /\bsafe to (go|attend)\b/i, /free interpreter/i, /intérprete gratis/i]) {
    expect(all, String(risky)).not.toMatch(risky);
  }
  const arrests = COURT.COURT_FACTS.changes.find((f) => f.id === "court-arrests")!;
  expect(arrests.en).toMatch(/rulings can change/);
  expect(arrests.es).toMatch(/los fallos pueden cambiar/);
  expect(arrests.cite).toMatch(/2026/);
  expect(COURT_COPY.en.goTitle).toMatch(/Go to every hearing/);
});

test("change of address points to the current EOIR-33/IC (Feb. 2026), in both languages", () => {
  expect(COURT.COURT_LINKS.eoir33).toBe("https://www.justice.gov/eoir/media/1341856/dl?inline");
  expect(COURT.COURT_LINKS.eoir33Es).toBe("https://www.justice.gov/eoir/media/1341886/dl?inline");
  const urls = COURT.COURT_SOURCES.map((s) => s.url);
  expect(urls).toContain(COURT.COURT_LINKS.eoir33);
  expect(urls).toContain(COURT.COURT_LINKS.eoir33Es);
  const moved = COURT.COURT_FACTS.move.find((f) => f.id === "eoir33")!;
  expect(moved.en).toContain("current edition: Feb. 2026");
  expect(moved.es).toContain("edición actual: febrero de 2026");
});

test("upkeep: a monthly re-check and a yearly one", () => {
  const ids = upkeepItems().map((i) => i.id);
  expect(ids).toContain("court-monthly");
  expect(ids).toContain("yearly-court");
});
