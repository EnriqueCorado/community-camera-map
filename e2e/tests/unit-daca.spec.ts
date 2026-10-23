// Unit tests for the DACA renewal timing tool (no browser): the 120–150 day
// window and the one-year rule at their exact edges, leap years, daylight
// saving, bad input, and that the facts stay cited, current and bilingual.
import { test, expect } from "@playwright/test";
import { DACA_WINDOW, dacaPlan, oneYearAfter, type DacaStatus } from "../../frontend/src/help/daca";
import { DACA_CHECKED, DACA_FACTS, DACA_FEES, DACA_HELP, DACA_RECHECK } from "../../frontend/src/help/daca-facts";
import { DACA_COPY } from "../../frontend/src/help/daca-copy";
import { addDays, daysBetween } from "../../frontend/src/help/dates";
import { upkeepItems } from "../../frontend/src/help/upkeep";
import { factsById } from "../../frontend/src/help/facts-by-id";

const TODAY = "2026-10-22";
const inDays = (n: number) => addDays(TODAY, n)!;
const status = (expires: string, today = TODAY) => dacaPlan(expires, today)?.status;

test.describe("the renewal window (USCIS: 120 to 150 days before it expires)", () => {
  const cases: [number, DacaStatus][] = [
    [151, "too-early"],
    [150, "file-now"],
    [135, "file-now"],
    [120, "file-now"],
    [119, "urgent"],
    [1, "urgent"],
    [0, "urgent"],
    [-1, "expired-renew"],
  ];
  for (const [days, want] of cases) {
    test(`${days} days left: ${want}`, () => {
      const plan = dacaPlan(inDays(days), TODAY)!;
      expect(plan.status).toBe(want);
      expect(plan.daysLeft).toBe(days);
    });
  }

  test("the window's dates are exactly 150 and 120 days before", () => {
    const plan = dacaPlan("2027-03-20", TODAY)!;
    expect(daysBetween(plan.opens, "2027-03-20")).toBe(DACA_WINDOW.opens);
    expect(daysBetween(plan.ideal, "2027-03-20")).toBe(DACA_WINDOW.ideal);
    // Across the November and March clock changes: still whole days.
    expect(plan.opens).toBe("2026-10-21");
    expect(plan.ideal).toBe("2026-11-20");
  });

  test("leap day: Feb 29 expirations count back through February correctly", () => {
    const plan = dacaPlan("2028-02-29", TODAY)!;
    expect(plan.opens).toBe("2027-10-02");
    expect(plan.ideal).toBe("2027-11-01");
    expect(plan.yearAfter).toBe("2029-02-28");
  });
});

test.describe("after it expires (USCIS: renew within one year, then only an initial request)", () => {
  test("the day before the one-year mark is still a renewal; the mark itself is not", () => {
    expect(status("2025-10-23")).toBe("expired-renew");
    expect(status("2025-10-22")).toBe("expired-initial");
    expect(status("2020-01-01")).toBe("expired-initial");
  });

  test("oneYearAfter keeps the calendar day, and Feb 29 falls back to Feb 28", () => {
    expect(oneYearAfter("2026-10-22")).toBe("2027-10-22");
    expect(oneYearAfter("2024-02-29")).toBe("2025-02-28");
    expect(oneYearAfter("2027-02-28")).toBe("2028-02-28");
    expect(oneYearAfter("2026-02-30")).toBeNull();
  });
});

test("impossible or out-of-range dates give no answer", () => {
  for (const bad of ["", "abc", "2026-02-30", "2026-13-01", "26-10-22", "2012-08-14"]) expect(dacaPlan(bad, TODAY), bad).toBeNull();
  expect(dacaPlan("2012-08-15", TODAY)?.status).toBe("expired-initial");
});

test("a date more than three years away is flagged as a likely typo", () => {
  expect(dacaPlan(inDays(DACA_WINDOW.farDays), TODAY)!.far).toBe(false);
  expect(dacaPlan(inDays(DACA_WINDOW.farDays + 1), TODAY)!.far).toBe(true);
});

test("fees match USCIS G-1055 (edition 10/16/26) and the fact text", () => {
  expect(DACA_FEES).toEqual({ i821d: 85, i765Online: 470, i765Paper: 520 });
  const fee = DACA_FACTS.fees.find((f) => f.id === "fee")!;
  for (const lang of ["en", "es"] as const) {
    expect(fee[lang]).toContain("$555");
    expect(fee[lang]).toContain("$605");
  }
});

test("facts are cited and written in both languages; copy matches", () => {
  for (const [group, list] of Object.entries(DACA_FACTS)) {
    for (const f of list) {
      expect(f.cite.length, `${group}/${f.id}`).toBeGreaterThan(5);
      expect(f.en.length, `${group}/${f.id}`).toBeGreaterThan(20);
      expect(f.es.length, `${group}/${f.id}`).toBeGreaterThan(20);
    }
  }
  const keys = (o: object) => Object.keys(o).sort();
  expect(keys(DACA_COPY.es)).toEqual(keys(DACA_COPY.en));
  expect(keys(DACA_COPY.es.statusTitle)).toEqual(keys(DACA_COPY.en.statusTitle));
  const dates = { opens: "a", ideal: "b", expires: "c", yearAfter: "d" };
  for (const lang of ["en", "es"] as const) {
    for (const s of Object.keys(DACA_COPY.en.statusText) as DacaStatus[]) expect(DACA_COPY[lang].statusText[s](dates).length).toBeGreaterThan(30);
  }
});

test("local help lists only phone numbers verified on each office's own page", () => {
  // ccstockton.org/immigration-services ("DACA Renewals") and rescue.org/united-states/turlock-ca ("DACA renewals").
  expect(DACA_HELP.map((h) => h.phone.replace(/\D/g, ""))).toEqual(["2094445910", "2096672378"]);
});

test("upkeep re-checks DACA every month, because it is in court", () => {
  expect(daysBetween(DACA_CHECKED, DACA_RECHECK)).toBeLessThanOrEqual(31);
  const item = upkeepItems().find((i) => i.id === "daca-monthly");
  expect(item?.due).toBe(DACA_RECHECK);
  expect(upkeepItems().map((i) => i.id)).toContain("yearly-daca");
});

test("picking facts by id: in order, and a missing id fails loudly", () => {
  const facts = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(factsById(facts, "c", "a").map((f) => f.id)).toEqual(["c", "a"]);
  expect(() => factsById(facts, "a", "nope")).toThrow(/no fact "nope"/);
});
