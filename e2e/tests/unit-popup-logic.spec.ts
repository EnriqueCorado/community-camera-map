// Unit tests for pure popup logic (no browser). Imports the frontend module directly.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  specRows,
  floodRiskKey,
  freshImage,
  isMissing,
  safeUrl,
  tidy,
  WEBCAM_IMAGE_HOSTS,
  WEBCAM_PAGE_HOSTS,
} from "../../frontend/src/popup-logic";

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

test.describe("safeUrl", () => {
  const ok = "https://cameras.alertcalifornia.org/public-camera-data/Axis-Oso/latest-frame.jpg";
  test("accepts https on an allowlisted host", () => {
    expect(safeUrl(ok, WEBCAM_IMAGE_HOSTS)).toBe(ok);
    expect(safeUrl("  https://apps.usgs.gov/hivis/camera/CA_X  ", WEBCAM_PAGE_HOSTS)).toBe(
      "https://apps.usgs.gov/hivis/camera/CA_X",
    );
  });
  for (const bad of [
    "http://cameras.alertcalifornia.org/x.jpg", // not https
    "javascript:alert(1)",
    "https://cameras.alertcalifornia.org.evil.example/x.jpg", // look-alike host
    "https://evil.example/?u=https://cameras.alertcalifornia.org/",
    "//cameras.alertcalifornia.org/x.jpg",
    "https://u:p@cameras.alertcalifornia.org/x.jpg", // credentials in the URL
    "not a url",
    "",
  ]) {
    test(`rejects ${JSON.stringify(bad)}`, () => {
      expect(safeUrl(bad, WEBCAM_IMAGE_HOSTS)).toBeNull();
    });
  }
  test("rejects non-strings", () => {
    expect(safeUrl(42, WEBCAM_IMAGE_HOSTS)).toBeNull();
    expect(safeUrl(null, WEBCAM_IMAGE_HOSTS)).toBeNull();
  });
});

test("freshImage adds a per-minute cache-buster without dropping the path", () => {
  const u = freshImage("https://usgs-nims-images.s3.amazonaws.com/720/CA_X/CA_X_newest.jpg", 120_000);
  expect(u).toBe("https://usgs-nims-images.s3.amazonaws.com/720/CA_X/CA_X_newest.jpg?t=2");
});

test("every shipped webcam URL passes the frontend allowlist (backend/frontend lists in sync)", () => {
  for (const name of ["fire-cameras", "river-cameras"]) {
    const fc = JSON.parse(
      readFileSync(join(__dirname, `../../frontend/public/data/layers/${name}.geojson`), "utf8"),
    );
    expect(fc.features.length).toBeGreaterThan(0);
    for (const { properties: p } of fc.features) {
      if (p.image) expect(safeUrl(p.image, WEBCAM_IMAGE_HOSTS), p.image).toBe(p.image);
      if (p.page) expect(safeUrl(p.page, WEBCAM_PAGE_HOSTS), p.page).not.toBeNull();
    }
  }
});

test.describe("specRows (state layer popups)", () => {
  const shown = new Set(["name", "address"]);
  test("labels the remaining fields, Spanish where known, skips links, ids and blanks", () => {
    const p = { name: "Library", address: "1 Main St", kind: "Library", hours: "9-5", page: "https://x.gov/a", OBJECTID: 3, notes: "N/A", customers_out: 1234 };
    expect(specRows(p, shown, "en", "en-US")).toEqual([["Kind", "Library"], ["Hours", "9-5"], ["Customers out", "1,234"]]);
    expect(specRows(p, shown, "es", "es-US").map(([k]) => k)).toEqual(["Tipo", "Horario", "Clientes sin luz"]);
  });
  test("epoch dates become dates, years stay bare, long text is cut, max respected", () => {
    const rows = specRows({ updated: Date.UTC(2026, 5, 1), year_built: 1998, description: "x".repeat(300) }, shown, "en", "en-US");
    expect(rows[0]).toEqual(["Updated", "Jun 1, 2026"]);
    expect(rows[1]).toEqual(["Year built", "1998"]);
    expect(rows[2]![1].length).toBe(198);
    expect(specRows({ a: 1, b: 2, c: 3 }, shown, "en", "en-US", 2)).toHaveLength(2);
  });
});
