// Unit tests for the clinic finder (no browser): every clinic is complete and in
// Stanislaus County, the filter and "closest" logic, only verified phone
// numbers, cited facts in both languages, and every place the tool registers.
import { test, expect } from "@playwright/test";
import * as CLINICS_MODULE from "../../frontend/src/help/clinics-facts";
import { CLINICS, CLINICS_CHECKED, CLINICS_FACTS, CLINICS_RECHECK, CLINICS_SOURCES, NEEDS, TOWNS, directionsUrl } from "../../frontend/src/help/clinics-facts";
import { NEAREST_COUNT, TOWNS_WITH_CLINICS, distanceKm, pickClinics } from "../../frontend/src/help/clinics";
import { CLINICS_COPY } from "../../frontend/src/help/clinics-copy";
import { MEDICAL_VIEWS, isHelpView } from "../../frontend/src/help/target";
import { PAGES, START_CHOICES, SHORT_LINKS } from "../../frontend/src/help/start";
import { PAGE_IDS, APP_IDS } from "../../relay/src/counter";
import { upkeepItems } from "../../frontend/src/help/upkeep";
import { toolById } from "../../frontend/src/landing/tools";
import { FLYERS } from "../../frontend/src/landing/flyers";

test.describe("the clinic list", () => {
  test("every place is complete, in Stanislaus County, and listed once", () => {
    expect(new Set(CLINICS.map((c) => c.id)).size).toBe(CLINICS.length);
    for (const c of CLINICS) {
      expect(c.phone.replace(/\D/g, ""), c.id).toMatch(/^\d{10}$/);
      if (c.dentalText) expect(c.dentalText.replace(/\D/g, ""), c.id).toMatch(/^\d{10}$/);
      expect(c.address, c.id).toMatch(/, CA 95\d{3}$/);
      expect(c.address, c.id).toContain(TOWNS[c.town].name);
      expect(c.needs.length, c.id).toBeGreaterThan(0);
      for (const n of c.needs) expect(NEEDS, c.id).toContain(n);
      expect(c.hours.en.length, c.id).toBeGreaterThan(5);
      expect(c.hours.es.length, c.id).toBeGreaterThan(5);
      expect(c.url, c.id).toMatch(/^https:\/\//);
      // Stanislaus County, roughly.
      const [lon, lat] = c.center;
      expect(lon > -121.5 && lon < -120.3 && lat > 37.1 && lat < 37.95, c.id).toBe(true);
      // "Show on map" only for sites on the HRSA health-center layer.
      expect(c.onMap, c.id).toBe(c.org === "gvhc" || c.org === "lumira");
    }
  });

  test("sliding-fee health centers in every town with one, and each need covered somewhere", () => {
    expect(TOWNS_WITH_CLINICS.sort()).toEqual(["ceres", "empire", "hughson", "modesto", "newman", "patterson", "riverbank", "turlock", "waterford", "westley"]);
    for (const n of NEEDS) expect(CLINICS.some((c) => c.needs.includes(n)), n).toBe(true);
    expect(CLINICS.filter((c) => c.needs.includes("vaccines")).map((c) => c.id)).toEqual(["county-vaccines"]);
  });

  test("only phone numbers verified on each organization's own page", () => {
    const verified = new Set([
      "2097224842", // GVHC appointments (gvhc.org/payment)
      "2097634879", // GVHC West Modesto pharmacy
      "2095738880", "2095565044", "2095413001", "2096566000", "2098926307", "2098629449", // GVHC dental lines
      "2095766766", // GVHC Tenaya
      "2098503500", // Lumira (call or text)
      "2095792300", // Planned Parenthood Modesto
      "2095587700", // county Immunization Program
      "2095587232", // county Indigent Health Care Program
      "8883766246", // county BHRS 24/7 access and crisis line
      "8776520734", // Stanislaus CSA Medi-Cal (medi-cal-work-facts.ts)
      "8888043536", // Health Consumer Alliance (medi-cal-work-facts.ts)
    ]);
    const text = JSON.stringify(CLINICS_MODULE);
    const found = [...text.matchAll(/\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g)].map((m) => m[1]! + m[2]! + m[3]!);
    expect(found.length).toBeGreaterThan(20);
    for (const n of found) expect(verified, n).toContain(n);
  });

  test("directions are a plain link to a search, with the address encoded", () => {
    expect(directionsUrl("1200 W. Main St., Turlock, CA 95380")).toBe("https://www.openstreetmap.org/search?query=1200%20W.%20Main%20St.%2C%20Turlock%2C%20CA%2095380");
  });
});

test.describe("picking clinics", () => {
  test("all, by need, by town", () => {
    expect(pickClinics({ town: "all", need: "all" })).toEqual({ clinics: [...CLINICS], nearest: false });
    const dental = pickClinics({ town: "all", need: "dental" }).clinics;
    expect(dental.length).toBeGreaterThan(5);
    expect(dental.every((c) => c.needs.includes("dental"))).toBe(true);
    const turlock = pickClinics({ town: "turlock", need: "all" });
    expect(turlock.nearest).toBe(false);
    expect(turlock.clinics.every((c) => c.town === "turlock")).toBe(true);
  });

  test("a town with none for this need: the closest ones, nearest first", () => {
    const oakdale = pickClinics({ town: "oakdale", need: "all" });
    expect(oakdale.nearest).toBe(true);
    expect(oakdale.clinics).toHaveLength(NEAREST_COUNT);
    expect(oakdale.clinics[0]!.id).toBe("gvhc-riverbank");
    const d = oakdale.clinics.map((c) => distanceKm(TOWNS.oakdale.center, c.center));
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    // Newman has a clinic, but not for mental health: the closest that do.
    const newman = pickClinics({ town: "newman", need: "mental" });
    expect(newman.nearest).toBe(true);
    expect(newman.clinics.every((c) => c.needs.includes("mental"))).toBe(true);
    expect(newman.clinics[0]!.id).toBe("gvhc-patterson");
  });

  test("distance: about right", () => {
    // Modesto to Turlock is about 20 km in a straight line.
    const km = distanceKm(TOWNS.modesto.center, TOWNS.turlock.center);
    expect(km).toBeGreaterThan(17);
    expect(km).toBeLessThan(23);
  });
});

test("facts are cited and complete in both languages; copy matches", () => {
  for (const [group, list] of Object.entries(CLINICS_FACTS)) {
    for (const f of list) {
      expect(f.cite.length, `${group}/${f.id}`).toBeGreaterThan(3);
      expect(f.en.length, `${group}/${f.id}`).toBeGreaterThan(40);
      expect(f.es.length, `${group}/${f.id}`).toBeGreaterThan(40);
    }
  }
  // Reused from the other tools, unchanged (so the wording stays in step).
  expect(CLINICS_FACTS.coverage.map((f) => f.id)).toContain("freeze");
  expect(CLINICS_FACTS.rights.map((f) => f.id)).toContain("law-sb81");
  // Immigration-sensitive facts say who they don't cover.
  expect(CLINICS_FACTS.coverage.find((f) => f.id === "ihcp")!.en).toContain("only for U.S. citizens and qualified immigrants");
  expect(CLINICS_FACTS.coverage.find((f) => f.id === "covered-ca")!.en).toContain("DACA");
  const keys = (o: object) => Object.keys(o).sort();
  expect(keys(CLINICS_COPY.es)).toEqual(keys(CLINICS_COPY.en));
  expect(keys(CLINICS_COPY.es.needs)).toEqual([...NEEDS].sort());
  for (const s of CLINICS_SOURCES) expect(s.url).toMatch(/^https:\/\//);
  expect(CLINICS_CHECKED < CLINICS_RECHECK).toBe(true);
});

test("registered everywhere a tool must be", () => {
  expect(MEDICAL_VIEWS).toEqual(["bills", "clinics"]);
  expect(isHelpView("medical", "clinics")).toBe(true);
  expect(PAGES.clinics).toEqual({ target: { tab: "medical", view: "clinics" }, slug: { en: "free-clinics", es: "clinicas-gratis" } });
  expect(toolById("clinics").slug).toEqual(PAGES.clinics.slug);
  expect(START_CHOICES.some((c) => c.page === "clinics")).toBe(true);
  expect(SHORT_LINKS.filter((l) => l.page === "clinics").map((l) => l.slug)).toEqual(["clinics", "clinicas"]);
  expect(PAGE_IDS).toContain("clinics");
  expect(APP_IDS).toContain("medical/bills");
  expect(APP_IDS).toContain("medical/clinics");
  expect(FLYERS.map((f) => f.id)).toContain("clinics");
  const ids = upkeepItems().map((i) => i.id);
  expect(ids).toContain("clinics-sites");
  expect(ids).toContain("yearly-clinics");
});
