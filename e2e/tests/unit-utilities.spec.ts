// Unit tests for the gas and electric bill tool (no browser): it gives the same
// answers as the Benefits screener (one set of rules), the income limits hold at
// the exact edges by household size and monthly or yearly, every fact is cited
// in both languages, and only verified phone numbers appear.
import { test, expect } from "@playwright/test";
import { cents, screen, screenUtilities, type Answers, type ProgramResult } from "../../frontend/src/help/benefits";
import { UTIL_CHECKED, UTIL_CONTACTS, UTIL_FACTS, UTIL_RECHECK, UTIL_SOURCES } from "../../frontend/src/help/utilities-facts";
import * as UTIL from "../../frontend/src/help/utilities-facts";
import { UTILITIES_COPY } from "../../frontend/src/help/utilities-copy";
import { BENEFITS_VIEWS } from "../../frontend/src/help/target";
import { COPY } from "../../frontend/src/help/copy";
import { upkeepItems } from "../../frontend/src/help/upkeep";
import { toolById } from "../../frontend/src/landing/tools";
import { APP_IDS, PAGE_IDS } from "../../relay/src/counter";

const TODAY = "2026-10-23";

const base = (over: Partial<Answers> = {}): Answers => ({ size: 1, income: 0, per: "month", gets: [], electric: "pge", ...over });
const run = (over: Partial<Answers>) => screenUtilities(base(over), TODAY);
const verdictOf = (rs: ProgramResult[], id: ProgramResult["id"]) => rs.find((r) => r.id === id)?.verdict;

test("same answers as the Benefits screener for every energy program it shows", () => {
  const energy = new Set(["pge-care", "pge-fera", "mid-cares", "tid-cares", "liheap"]);
  for (const electric of ["pge", "mid", "tid", "unsure"] as const) {
    for (const pgeGas of [undefined, "yes", "no", "unsure"] as const) {
      for (const income of [0, 2000, 3607, 4553.34, 6000]) {
        for (const size of [1, 2, 3, 5, 9]) {
          const a: Answers = { size, income: cents(income), per: "month", gets: [], electric, pgeGas, children: 0, pregnant: "no", olderOrDisabled: "no", taxId: "ssn" };
          const full = screen(a, TODAY).results.filter((r) => energy.has(r.id));
          const mine = screenUtilities(a, TODAY);
          if (pgeGas == null && (electric === "mid" || electric === "tid")) {
            // The screener waits for the gas answer; this tool already shows the district's own discount.
            expect(mine.map((r) => r.id)).toEqual([`${electric}-cares`, "liheap"]);
            expect(mine.filter((r) => r.id === "liheap")).toEqual(full);
          } else {
            expect(mine, JSON.stringify(a)).toEqual(full);
          }
        }
      }
    }
  }
});

test("CARE and FERA (PG&E) at the exact limits, by household size, yearly and monthly", () => {
  // CPUC, Jun 1, 2026 – May 31, 2027: CARE 1–2 people $43,280; FERA up to $54,100.
  expect(verdictOf(run({ size: 2, income: cents(43280), per: "year" }), "pge-care")).toBe("likely");
  const over = run({ size: 2, income: cents(43280.01), per: "year" });
  expect(verdictOf(over, "pge-care")).toBe("unlikely");
  expect(verdictOf(over, "pge-fera")).toBe("likely");
  expect(verdictOf(run({ size: 2, income: cents(54100), per: "year" }), "pge-fera")).toBe("likely");
  expect(verdictOf(run({ size: 2, income: cents(54100.01), per: "year" }), "pge-fera")).toBe("unlikely");
  // 4 people: $66,000 a year is $5,500 a month exactly (scaled up, never divided).
  expect(verdictOf(run({ size: 4, income: cents(5500), per: "month" }), "pge-care")).toBe("likely");
  expect(verdictOf(run({ size: 4, income: cents(5500.01), per: "month" }), "pge-care")).toBe("unlikely");
  // Past the printed sizes: 9 people = $111,440 + $11,360.
  expect(verdictOf(run({ size: 9, income: cents(122800), per: "year" }), "pge-care")).toBe("likely");
  expect(verdictOf(run({ size: 9, income: cents(122800.01), per: "year" }), "pge-care")).toBe("unlikely");
  // A program someone already gets opens CARE whatever the income.
  expect(verdictOf(run({ size: 1, income: cents(9000), gets: ["calfresh"] }), "pge-care")).toBe("likely");
});

test("MID and TID: their own discounts, and CARE only once the PG&E gas question is answered", () => {
  // MID prints monthly limits: 1 person $3,607 (Mar 1, 2026).
  const mid = run({ electric: "mid", income: cents(3607) });
  expect(verdictOf(mid, "mid-cares")).toBe("likely");
  expect(mid.some((r) => r.id === "pge-care")).toBe(false); // gas question not answered yet
  expect(verdictOf(run({ electric: "mid", income: cents(3607.01) }), "mid-cares")).toBe("unlikely");
  expect(run({ electric: "mid", pgeGas: "yes", income: cents(1000) }).some((r) => r.id === "pge-care")).toBe(true);
  expect(run({ electric: "mid", pgeGas: "no", income: cents(1000) }).some((r) => r.id === "pge-care")).toBe(false);
  expect(run({ electric: "mid", income: cents(1000) }).some((r) => r.id === "pge-fera")).toBe(false); // FERA is PG&E electric only
  // TID lists sizes 1–4: 5 people = $66,000 + $11,360.
  expect(verdictOf(run({ electric: "tid", size: 5, income: cents(77360), per: "year" }), "tid-cares")).toBe("likely");
  expect(verdictOf(run({ electric: "tid", size: 5, income: cents(77360.01), per: "year" }), "tid-cares")).toBe("unlikely");
  // Not sure who sends the bill: every utility shows, none above "maybe".
  const unsure = run({ electric: "unsure", income: cents(1000) });
  for (const id of ["pge-care", "mid-cares", "tid-cares"] as const) expect(verdictOf(unsure, id), id).toBe("maybe");
  // LIHEAP is always checked, and CalFresh opens it.
  expect(verdictOf(run({ income: cents(9999), gets: ["calfresh"] }), "liheap")).not.toBe("unlikely");
});

test("the facts say what the rules say, cited, in both languages", () => {
  const all = Object.values(UTIL_FACTS).flat();
  for (const f of all) {
    expect(f.cite.length, f.id).toBeGreaterThan(2);
    expect(f.en.length, f.id).toBeGreaterThan(40);
    expect(f.es.length, f.id).toBeGreaterThan(40);
  }
  expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
  const fact = (id: string) => all.find((f) => f.id === id)!;
  expect(fact("plan-24").en).toContain("24 months");
  expect(fact("plan-24").es).toContain("24 meses");
  expect(fact("cold").en).toContain("32°F");
  expect(fact("cold").en).toContain("90°F");
  expect(fact("cold").en).toContain("still owed");
  expect(fact("amp").en).toMatch(/\$8,000.*\$500.*\$250.*90 days.*1\/12.*12 months/s);
  expect(fact("mid-medical").en).toContain("$8,717");
  // MID and TID aren't under the CPUC: the page says so instead of applying PG&E's rules to them.
  expect(fact("which-rules").en).toContain("does not take complaints about them");
  expect(UTIL_SOURCES.every((s) => /^https:\/\//.test(s.url))).toBe(true);
  const keys = (o: object) => Object.keys(o).sort();
  expect(keys(UTILITIES_COPY.es)).toEqual(keys(UTILITIES_COPY.en));
});

test("only phone numbers verified on each organization's own page", () => {
  const verified = new Set([
    "18007435000", // PG&E customer service (pge.com scams page)
    "18776606789", // PG&E CARE/FERA/AMP
    "18335007226", // PG&E scam line, 1-833-500-SCAM
    "2095267337", // MID customer service
    "2098838222", // TID customer service
    "2095379217", // CVOC (CSD provider list)
    "2095237577", // Salvation Army Modesto (Stanislaus County page)
    "18006497570", // CPUC Consumer Affairs
  ]);
  const text = JSON.stringify(UTIL);
  const found = [...text.matchAll(/(?:\b1[\s.-])?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g)].map((m) => m[0].replace(/\D/g, "").replace(/^(\d{10})$/, "$1"));
  expect(found.length).toBeGreaterThan(5);
  for (const n of found) expect(verified.has(n) || verified.has(`1${n}`), n).toBe(true);
  for (const c of Object.values(UTIL_CONTACTS)) expect(c.url).toMatch(/^https:\/\//);
});

test("registered everywhere a tool must be", () => {
  expect(BENEFITS_VIEWS).toContain("utilities");
  expect(COPY.en.benefitsViewUtilities).toBe("Gas and electric bills");
  expect(COPY.es.benefitsViewUtilities).toBe("Facturas de luz y gas");
  const page = toolById("utilities");
  expect(page.slug).toEqual({ en: "utility-bills", es: "facturas-de-luz-y-gas" });
  expect(page.target).toEqual({ tab: "benefits", view: "utilities" });
  expect(PAGE_IDS).toContain("utilities");
  expect(APP_IDS).toContain("benefits/utilities");
  const ids = upkeepItems().map((i) => i.id);
  expect(ids).toContain("utilities-winter");
  expect(ids).toContain("yearly-utilities");
  expect(UTIL_RECHECK > UTIL_CHECKED).toBe(true);
});
