// Unit tests for the free school meals popups (no browser).
import { test, expect } from "@playwright/test";
import { CEP_PAGE, isSchoolMealsLayer, SCHOOL_MEAL_COLORS, SCHOOL_MEAL_LINK_HOSTS, SCHOOL_MEALS_STATES, schoolMealsPopup, schoolYear, STATE_MEAL_PAGES } from "../../frontend/src/school-meals";
import { OVERLAY_COLOR } from "../../frontend/src/colors";
import { safeUrl, WEBCAM_PAGE_HOSTS } from "../../frontend/src/popup-logic";

const tidy = (s: string) => s;
const row = (rows: [string, string][], label: string) => rows.find(([k]) => k === label)?.[1] ?? "";

test("CEP school: reason, school year, USDA link (English)", () => {
  const p = schoolMealsPopup("tx-free-school-meals", { n: "Lamar Elementary", d: "Houston ISD", r: "c", y: 2024 }, "en", tidy);
  expect(p.title).toBe("Lamar Elementary");
  expect(row(p.rows, "District")).toBe("Houston ISD");
  expect(row(p.rows, "Why it’s free")).toContain("Community Eligibility Provision");
  expect(row(p.rows, "School year")).toBe("2024-25");
  expect(row(p.rows, "Note")).toContain("confirm with the school");
  expect(p.link?.href).toBe(CEP_PAGE);
  expect(safeUrl(p.link?.href, WEBCAM_PAGE_HOSTS)).not.toBeNull();
});

test("state law school links to that state's page (Spanish)", () => {
  const p = schoolMealsPopup("ca-free-school-meals", { n: "Fremont Elementary", d: "Modesto City Elementary", r: "l", y: 2026 }, "es", tidy);
  expect(row(p.rows, "Por qué es gratis")).toContain("Ley estatal");
  expect(row(p.rows, "Ciclo escolar")).toBe("2026-27");
  expect(row(p.rows, "Nota")).toContain("No hay que llenar solicitud");
  expect(p.link).toEqual({ href: STATE_MEAL_PAGES.CA, label: "Página estatal de comidas escolares" });
  const co = schoolMealsPopup("co-free-school-meals", { n: "X", r: "o", y: 2026 }, "en", tidy);
  expect(row(co.rows, "Why it’s free")).toContain("district takes part");
  expect(co.link?.href).toBe(STATE_MEAL_PAGES.CO);
  expect(row(co.rows, "District")).toBe(""); // charter: its own district
});

test("unknown reasons and odd years show nothing rather than a guess", () => {
  const p = schoolMealsPopup("tx-free-school-meals", { n: "X", r: "zz", y: "2024" }, "en", tidy);
  expect(row(p.rows, "Why it’s free")).toBe("");
  expect(row(p.rows, "School year")).toBe("");
  expect(row(p.rows, "Note")).toBe("");
  expect(p.link).toBeUndefined();
  expect(schoolYear(2099)).toBe("2099-00");
  expect(schoolYear(1999)).toBe("");
});

test("every state layer has a color and every link host is allowlisted", () => {
  for (const st of SCHOOL_MEALS_STATES) {
    const name = `${st.toLowerCase()}-free-school-meals`;
    expect(isSchoolMealsLayer(name)).toBe(true);
    expect(OVERLAY_COLOR[name]).toBe(SCHOOL_MEAL_COLORS[name]);
  }
  expect(isSchoolMealsLayer("summer-meals")).toBe(false);
  for (const h of SCHOOL_MEAL_LINK_HOSTS) expect(WEBCAM_PAGE_HOSTS).toContain(h);
  for (const u of [...Object.values(STATE_MEAL_PAGES), CEP_PAGE]) expect(u.startsWith("https://")).toBe(true);
});
