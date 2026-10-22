// Upkeep calendar for the Help tools' facts (frontend/src/help/upkeep.ts).
// Normally: fails when anything is overdue. With UPKEEP_WINDOW=<days> (the
// weekly help-links workflow uses 45), also fails when anything comes due in
// that many days, and prints one "UPKEEP" line per item for the issue.
import { test, expect } from "@playwright/test";
import { dueSoon, upkeepItems } from "../../frontend/src/help/upkeep";
import { dayNumber, todayIso } from "../../frontend/src/help/dates";
import { LAB_226_7_RECHECK as WAGES_226_7 } from "../../frontend/src/help/wages-facts";
import { LAB_226_7_RECHECK as HEAT_226_7 } from "../../frontend/src/help/heat-facts";

const items = upkeepItems();
const today = todayIso();

test("every upkeep item has a real date, a task, and a unique id", () => {
  expect(items.length).toBeGreaterThan(15);
  for (const i of items) {
    expect(dayNumber(i.due), i.id).not.toBeNull();
    expect(i.task.length, i.id).toBeGreaterThan(20);
    if (i.source) expect(i.source, i.id).toMatch(/^https:\/\//);
  }
  expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  // The yearly rules each tool depends on are all tracked.
  for (const id of ["rent-cap", "poverty-guidelines", "minimum-wage", "court-holidays", "tax-credits", "yearly-heat"]) {
    expect(items.some((i) => i.id === id), id).toBe(true);
  }
});

test("the §226.7 re-check date is the same in the wages and heat facts", () => {
  expect(HEAT_226_7).toBe(WAGES_226_7);
});

test("dueSoon picks items up to and including the horizon", () => {
  const list = [
    { id: "a", due: "2026-11-01", task: "x" },
    { id: "b", due: "2026-12-06", task: "x" },
    { id: "c", due: "2026-12-07", task: "x" },
  ];
  expect(dueSoon(list, "2026-10-22", 45).map((i) => i.id)).toEqual(["a", "b"]);
  expect(dueSoon(list, "2026-10-22", 46).map((i) => i.id)).toEqual(["a", "b", "c"]);
});

test("nothing is overdue", () => {
  // `due` is the first out-of-date day, so an item due today is overdue.
  const overdue = dueSoon(items, today, 0);
  expect(overdue.map((i) => `${i.due} ${i.id}: ${i.task}`), "update these facts (see frontend/src/help/upkeep.ts)").toEqual([]);
});

const window = Number(process.env.UPKEEP_WINDOW ?? "");
test("nothing comes due soon (weekly check only)", () => {
  test.skip(!Number.isInteger(window) || window <= 0, "set UPKEEP_WINDOW=<days> to run");
  const soon = dueSoon(items, today, window);
  // One plain line per item: the workflow copies only these into the issue.
  for (const i of soon) console.log(`UPKEEP ${i.due} ${i.id}: ${i.task}${i.source ? ` Source: ${i.source}` : ""}`);
  expect(soon.length, `${soon.length} upkeep item(s) due within ${window} days`).toBe(0);
});
