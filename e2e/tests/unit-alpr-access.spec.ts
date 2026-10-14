// Unit tests for "who can search this plate reader?" logic + shipped data (no browser).
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attribute, describe as describeAccess, formatRecordDate, type AlprAccess } from "../../frontend/src/alpr-access";

const ACCESS: AlprAccess = JSON.parse(
  readFileSync(join(__dirname, "../../backend/app/cameras/data/alpr_access.json"), "utf8"),
);

test.describe("attribute", () => {
  test("uses the baked agency + basis when the profile exists", () => {
    expect(attribute({ agency: "modesto-pd", agency_basis: "inferred" }, ACCESS)).toEqual({
      profileId: "modesto-pd",
      basis: "inferred",
      operator: "",
    });
    expect(attribute({ agency: "retail-lowes", agency_basis: "tagged", operator: " Lowe's " }, ACCESS)).toEqual({
      profileId: "retail-lowes",
      basis: "tagged",
      operator: "Lowe's",
    });
  });

  test("trusts the baked id while profiles are still loading", () => {
    expect(attribute({ agency: "turlock-pd", agency_basis: "inferred" }, null).profileId).toBe("turlock-pd");
  });

  test("an unknown profile id or basis degrades to unknown, never a guess", () => {
    expect(attribute({ agency: "no-such-agency", agency_basis: "tagged" }, ACCESS)).toEqual({
      profileId: null,
      basis: "unknown",
      operator: "",
    });
    expect(attribute({ agency: "modesto-pd", agency_basis: "rumor" }, ACCESS).profileId).toBeNull();
  });

  test("an operator we have no records for is 'untracked'", () => {
    expect(attribute({ operator: "Bay Area Toll Authority" }, ACCESS)).toEqual({
      profileId: null,
      basis: "untracked",
      operator: "Bay Area Toll Authority",
    });
  });

  test("ignores non-string properties (MapLibre can hand back numbers)", () => {
    expect(attribute({ operator: 42, agency: 7 }, ACCESS).basis).toBe("unknown");
  });
});

test.describe("describe (popup/panel text)", () => {
  const NO_RECORDS = "no records";

  test("a profile supplies name, summary and facts in the requested language", () => {
    const d = describeAccess({ profileId: "modesto-pd", basis: "inferred", operator: "" }, ACCESS, "es", NO_RECORDS);
    expect(d.name).toBe("Departamento de Policía de Modesto");
    expect(d.summary).toBe(ACCESS.profiles["modesto-pd"]!.summary.es);
    expect(d.facts.length).toBeGreaterThan(0);
  });

  test("untracked shows the operator and the no-records sentence, not the default", () => {
    const d = describeAccess({ profileId: null, basis: "untracked", operator: "Some HOA" }, ACCESS, "en", NO_RECORDS);
    expect(d).toMatchObject({ name: "Some HOA", summary: NO_RECORDS });
    expect(d.profile).toBeUndefined();
  });

  test("unknown has no name and falls back to the sourced default", () => {
    const d = describeAccess({ profileId: null, basis: "unknown", operator: "" }, ACCESS, "en", NO_RECORDS);
    expect(d.name).toBeUndefined();
    expect(d.summary).toBe(ACCESS.default.summary.en);
  });

  test("before the profiles load, nothing is invented", () => {
    const d = describeAccess({ profileId: "modesto-pd", basis: "inferred", operator: "" }, null, "en", NO_RECORDS);
    expect(d).toEqual({ name: undefined, summary: undefined, facts: [] });
  });
});

test.describe("formatRecordDate", () => {
  const cases: [string, string, string][] = [
    ["2019", "en-US", "2019"],
    ["2026-08", "en-US", "August 2026"],
    ["2026-08", "es-US", "agosto de 2026"],
    ["2026-09-24", "en-US", "Sep 24, 2026"],
    ["2026-01-01", "en-US", "Jan 1, 2026"], // must not slip to Dec 31 in any timezone
    ["not a date", "en-US", "not a date"],
  ];
  for (const [input, locale, want] of cases) {
    test(`${input} (${locale}) -> ${want}`, () => {
      expect(formatRecordDate(input, locale)).toBe(want);
    });
  }
});

test.describe("shipped access data", () => {
  test("every record date parses and every fact cites a known https source", () => {
    const profiles = [...Object.values(ACCESS.profiles), ACCESS.default];
    for (const p of profiles) {
      for (const f of p.facts) {
        expect(f.date).toMatch(/^\d{4}(-\d{2}){0,2}$/);
        expect(ACCESS.sources[f.source]?.url).toMatch(/^https:\/\//);
      }
    }
  });

  test("the static site ships the same profiles the API serves", () => {
    const baked = JSON.parse(
      readFileSync(join(__dirname, "../../frontend/public/data/alpr_access.json"), "utf8"),
    );
    expect(baked).toEqual(ACCESS);
  });
});
