// Unit tests for pure popup logic (no browser). Imports the frontend module directly.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { floodRiskKey, isMissing, tidy } from "../../frontend/src/popup-logic";

test.describe("floodRiskKey", () => {
  const cases: [string, string, string][] = [
    ["A", "", "floodHigh"],
    ["AE", "", "floodHigh"],
    ["AE", "FLOODWAY", "floodHigh"],
    ["AH", "", "floodHigh"],
    ["AO", "", "floodHigh"],
    ["VE", "", "floodHigh"],
    ["X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", "floodModerate"],
    ["X", "AREA WITH REDUCED FLOOD RISK DUE TO LEVEE", "floodModerate"], // the levee bug
    ["X", "1 PCT DEPTH LESS THAN 1 FOOT", "floodModerate"],
    ["X", "AREA OF MINIMAL FLOOD HAZARD", "floodMinimal"],
    ["D", "", "floodUndetermined"],
    ["AREA NOT INCLUDED", "", "floodUndetermined"], // must not match /^A/ as "high"
  ];
  for (const [zone, sub, want] of cases) {
    test(`${zone} / ${sub || "—"} -> ${want}`, () => {
      expect(floodRiskKey(zone, sub)).toBe(want);
    });
  }

  test("no levee-protected or shallow-flooding area in the shipped data is called minimal", () => {
    const fc = JSON.parse(
      readFileSync(join(__dirname, "../../frontend/public/data/layers/flood.geojson"), "utf8"),
    );
    const wrong = fc.features.filter((f: any) => {
      const p = f.properties ?? {};
      return /LEVEE|1 PCT/i.test(String(p.ZONE_SUBTY ?? "")) &&
        floodRiskKey(String(p.FLD_ZONE ?? ""), String(p.ZONE_SUBTY ?? "")) === "floodMinimal";
    });
    expect(wrong.length).toBe(0);
  });
});

test.describe("isMissing", () => {
  for (const v of [null, undefined, "", "  ", "NOT AVAILABLE", "n/a", "N/A", "No Data", "-999", "-9999", "-9999.0"]) {
    test(`hides ${JSON.stringify(v)}`, () => expect(isMissing(v)).toBe(true));
  }
  for (const v of ["999", "0", "Modesto", "(209) 572-9500", 2118]) {
    test(`keeps ${JSON.stringify(v)}`, () => expect(isMissing(v)).toBe(false));
  }
});

test.describe("tidy", () => {
  const cases: [string, string][] = [
    ["MEMORIAL HOSPITAL MEDICAL CENTER - MODESTO", "Memorial Hospital Medical Center - Modesto"],
    ["GENERAL ACUTE CARE", "General Acute Care"],
    ["600 10TH STREET", "600 10th Street"],
    ["I-205", "I-205"],
    ["AREA OF MINIMAL FLOOD HAZARD", "Area of Minimal Flood Hazard"],
    ["CA STATE ROUTE", "CA State Route"],
    ["FRENCH CAMP RD", "French Camp Rd"],
    ["STANISLAUS R A RIPON CA", "Stanislaus R A Ripon CA"],
    ["SHERIFF'S OFFICE", "Sheriff's Office"],
    ["ÁREA DE PRUEBA", "Área de Prueba"],
    ["Already Mixed Case", "Already Mixed Case"],
    ["AE", "AE"],
  ];
  for (const [input, want] of cases) {
    test(`${input} -> ${want}`, () => expect(tidy(input)).toBe(want));
  }
});
