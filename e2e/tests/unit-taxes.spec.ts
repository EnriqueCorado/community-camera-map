// Unit tests for the free tax help guide (no browser): the figures match the
// IRS and FTB publications they cite, every fact is cited in both languages,
// only verified phone numbers appear, and the guide never points people to a
// tool that no longer exists.
import { test, expect } from "@playwright/test";
import * as TAXES from "../../frontend/src/help/taxes-facts";
import { CA_CREDITS, FED_CREDITS, TAX_PLACES, TAX_SEASON, TAXES_CHECKED, TAXES_FACTS, TAXES_RECHECK } from "../../frontend/src/help/taxes-facts";
import { TAXES_COPY } from "../../frontend/src/help/taxes-copy";
import { BENEFITS_VIEWS } from "../../frontend/src/help/target";
import { COPY } from "../../frontend/src/help/copy";
import { upkeepItems } from "../../frontend/src/help/upkeep";
import { toolById } from "../../frontend/src/landing/tools";

test("tax year 2026 figures match Rev. Proc. 2025-32 and the FTB's 2026 indexing memo", () => {
  expect(TAX_SEASON).toEqual({ taxYear: 2026, due: "2027-04-15" });
  // Rev. Proc. 2025-32 §4.06 (EITC) and §4.05 (Child Tax Credit).
  expect(FED_CREDITS.eitcMax).toEqual([664, 4427, 7316, 8231]);
  expect(FED_CREDITS.eitcLimitSingle).toEqual([19540, 51593, 58629, 62974]);
  expect(FED_CREDITS.eitcLimitJoint).toEqual([26820, 58863, 65899, 70244]);
  expect(FED_CREDITS.eitcInvestmentLimit).toBe(12200);
  expect([FED_CREDITS.ctcMax, FED_CREDITS.ctcRefundable]).toEqual([2200, 1700]);
  // FTB memo, Sept 3, 2026.
  expect(CA_CREDITS).toMatchObject({ incomeUnder: 34051, investmentLimit: 4978, yctcMax: 1229, fytcMax: 1229, yctcNoEarningsCap: 36852 });
  // The per-child CalEITC table is the latest published (2025) and labeled so.
  expect(CA_CREDITS.caleitcMax).toEqual({ year: 2025, byChildren: [302, 2016, 3339, 3756] });
  // Limits rise with children, and joint limits are higher.
  for (let i = 0; i < 4; i++) {
    expect(FED_CREDITS.eitcLimitJoint[i]!).toBeGreaterThan(FED_CREDITS.eitcLimitSingle[i]!);
    if (i > 0) expect(FED_CREDITS.eitcMax[i]!).toBeGreaterThan(FED_CREDITS.eitcMax[i - 1]!);
  }
});

test("the facts say the same numbers the tables hold", () => {
  const text = (id: string) => Object.values(TAXES_FACTS).flat().find((f) => f.id === id)!;
  expect(text("caleitc-2026").en).toContain("$34,051");
  expect(text("caleitc-2026").en).toContain("$4,978");
  expect(text("yctc").en).toContain("$1,229");
  expect(text("yctc").en).toContain("$36,852");
  for (const n of [...FED_CREDITS.eitcMax, ...FED_CREDITS.eitcLimitSingle, ...FED_CREDITS.eitcLimitJoint, FED_CREDITS.eitcInvestmentLimit]) {
    const s = `$${n.toLocaleString("en-US")}`;
    expect(text("eitc-2026").en, s).toContain(s);
    expect(text("eitc-2026").es, s).toContain(s);
  }
  for (const n of CA_CREDITS.caleitcMax.byChildren) expect(text("caleitc-amount").es).toContain(`$${n.toLocaleString("en-US")}`);
});

test("who needs a Social Security number is stated the way the law says", () => {
  const f = (id: string) => Object.values(TAXES_FACTS).flat().find((x) => x.id === id)!;
  // CalEITC/YCTC/FYTC: SSN or ITIN. Federal EITC: SSN for everyone; ITIN filers can't.
  expect(f("itin-ok").en).toMatch(/Social Security number OR an ITIN/);
  expect(f("eitc-ssn").en).toMatch(/ITIN can’t get it/);
  // CTC (IRC §24(h)(7)): the child, and the filer or at least one spouse on a joint return.
  expect(f("ctc-ssn").en).toMatch(/one of the two spouses/);
  expect(f("ctc-ssn").cite).toContain("§70104");
  // Direct File ended: never presented as an option, never linked.
  expect(f("direct-file").en).toMatch(/is gone/);
  expect(JSON.stringify(TAXES)).not.toMatch(/directfile\.irs\.gov/);
  // The IRS-ICE sharing case is described as still open, never as settled.
  expect(f("ice").en).toMatch(/isn’t over/);
  expect(f("ice").es).toMatch(/no ha terminado/);
});

test("only phone numbers verified in the research", () => {
  // ~/dev/outreach-help-2026-10/research/taxes.md
  const verified = new Set([
    "2095234562", // United Way of Stanislaus County VITA
    "8882277669", // AARP Foundation Tax-Aide
    "8772117826", // Stanislaus 211
    "8009069887", // IRS VITA/TCE locator line
    "8445455640", // IRS Taxpayer Assistance Center appointments (Modesto)
    "2093841329", // United Way of Merced County (VITA with ITIN services)
    "8008291954", // IRS refund hotline
  ]);
  const found = [...JSON.stringify(TAXES).matchAll(/(?:\b1-)?\(?\b(\d{3})\)?[\s.-]?(\d{3})-(\d{4})\b/g)].map((m) => m[1]! + m[2]! + m[3]!);
  expect(found.length).toBeGreaterThan(5);
  for (const n of found) expect(verified, n).toContain(n);
});

test("every fact is cited and complete in both languages, and the copy matches", () => {
  for (const [group, list] of Object.entries(TAXES_FACTS)) {
    const ids = list.map((f) => f.id);
    expect(new Set(ids).size, group).toBe(ids.length);
    for (const f of list) {
      expect(f.cite.length, `${group}/${f.id}`).toBeGreaterThan(3);
      expect(f.en.length, `${group}/${f.id}`).toBeGreaterThan(30);
      expect(f.es.length, `${group}/${f.id}`).toBeGreaterThan(30);
    }
  }
  for (const p of Object.values(TAX_PLACES)) {
    expect(p.url).toMatch(/^https:\/\//);
    expect(p.name.es.length).toBeGreaterThan(5);
  }
  const keys = (o: object) => Object.keys(o).sort();
  expect(keys(TAXES_COPY.es)).toEqual(keys(TAXES_COPY.en));
  expect(TAXES_COPY.es.children).toHaveLength(4);
  expect(COPY.es.benefitsViewTaxes).toBeTruthy();
});

test("wired into the Benefits tab, the public pages and the upkeep calendar", () => {
  expect(BENEFITS_VIEWS).toContain("taxes");
  const page = toolById("taxes");
  expect(page.slug).toEqual({ en: "free-tax-help", es: "impuestos-gratis" });
  expect(page.target).toEqual({ tab: "benefits", view: "taxes" });
  expect(page.intro.en).toContain("April 15, 2027");
  expect(page.intro.es).toContain("15 de abril de 2027");
  const items = upkeepItems();
  expect(items.find((i) => i.id === "taxes-season")?.due).toBe(TAXES_RECHECK);
  expect(items.map((i) => i.id)).toContain("yearly-taxes");
  // Re-checked before the IRS opens the season (late January).
  expect(TAXES_RECHECK > TAXES_CHECKED && TAXES_RECHECK < "2027-02-01").toBe(true);
});
