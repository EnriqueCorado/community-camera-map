// Unit tests for the Help tools' pure logic (no browser): poverty-line math,
// hospital eligibility, the rent cap and notice rules, coverage screening,
// address lookup, letters, and data integrity of the curated facts.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { careResult, percentOfPoverty, povertyLine, STATE_FLOOR, yearly } from "../../frontend/src/help/fpl";
import { capPeriodFor, checkIncrease, coverage, type CoverageAnswers } from "../../frontend/src/help/rent-cap";
import { addDays, dayNumber, daysBetween } from "../../frontend/src/help/dates";
import { formatMoney, parseMoney } from "../../frontend/src/help/money";
import { builtAge, matchParcel, parseAddress, shardKey } from "../../frontend/src/help/parcels";
import { depositLetter, medicalLetter, repairLetter } from "../../frontend/src/help/letters";
import { HOSPITALS, inCalifornia } from "../../frontend/src/help/hospitals";
import { helpFor } from "../../frontend/src/help/popup-help";
import { LEGAL_FACTS, MEDICAL_FACTS, MOBILE_FACTS, RENT_FACTS, RENT_SOURCES, REPAIR_FACTS, DEPOSIT_FACTS } from "../../frontend/src/help/facts";
import { COPY } from "../../frontend/src/help/copy";
import { decodeState, encodeState } from "../../frontend/src/urlstate";

const DATA = join(__dirname, "../../frontend/public/data");
const G = MEDICAL_FACTS.fpl;

// ------------------------------------------------------------ poverty line

test.describe("poverty line", () => {
  test("2026 HHS guidelines: $15,960 + $5,680 per person", () => {
    expect(povertyLine(G, 1)).toBe(15_960);
    expect(povertyLine(G, 4)).toBe(33_000);
    expect(povertyLine(G, 8)).toBe(55_720);
    expect(povertyLine(G, 0)).toBe(15_960); // clamped
  });

  test("percent is unrounded so 200.4% is over a 200% cutoff", () => {
    expect(percentOfPoverty(66_000, 4, G)).toBe(200);
    expect(percentOfPoverty(66_132, 4, G)).toBeCloseTo(200.4, 1);
    expect(percentOfPoverty(0, 4, G)).toBe(0);
    expect(percentOfPoverty(Number.NaN, 4, G)).toBe(0);
    expect(yearly(2_750, "month")).toBe(33_000);
  });
});

// ------------------------------------------------------- hospital eligibility

test.describe("hospital eligibility", () => {
  const H = (id: string) => HOSPITALS.find((h) => h.id === id)!.policy;
  const uninsured = { insured: false, highCosts: "no" as const };
  const insured = { insured: true, highCosts: "no" as const };
  const insuredHigh = { insured: true, highCosts: "yes" as const };
  const insuredUnsure = { insured: true, highCosts: "unsure" as const };

  test("state floor: discount at or below 400% for uninsured or high costs; no free tier", () => {
    expect(careResult(150, STATE_FLOOR, uninsured).tier).toBe("discount");
    expect(careResult(400, STATE_FLOOR, uninsured).tier).toBe("discount");
    expect(careResult(400.5, STATE_FLOOR, uninsured).tier).toBe("over");
    expect(careResult(150, STATE_FLOOR, insured).tier).toBe("over");
    expect(careResult(150, STATE_FLOOR, insuredHigh).tier).toBe("discount");
    expect(careResult(150, STATE_FLOOR, insuredUnsure)).toMatchObject({ tier: "discount", ifHighCosts: true });
  });

  test("Tenet (Doctors, Emanuel): free only for uninsured below 200%", () => {
    expect(careResult(150, H("doctors-modesto"), uninsured).tier).toBe("free");
    expect(careResult(200, H("doctors-modesto"), uninsured).tier).toBe("discount"); // "below 200%"
    expect(careResult(150, H("emanuel-turlock"), insuredHigh).tier).toBe("discount");
    expect(careResult(150, H("emanuel-turlock"), insured).tier).toBe("over");
  });

  test("Memorial (Sutter): free up to 400% incl. insured with high costs", () => {
    expect(careResult(399, H("memorial-modesto"), uninsured).tier).toBe("free");
    expect(careResult(399, H("memorial-modesto"), insuredHigh).tier).toBe("free");
    expect(careResult(399, H("memorial-modesto"), insured).tier).toBe("over");
  });

  test("Kaiser: free to 200% and 50% off to 400% for anyone", () => {
    expect(careResult(180, H("kaiser-modesto"), insured).tier).toBe("free");
    expect(careResult(350, H("kaiser-modesto"), insured).tier).toBe("discount");
  });

  test("Central Valley Specialty: discount reaches 600%", () => {
    expect(careResult(550, H("central-valley-specialty"), uninsured)).toMatchObject({ tier: "discount", maxFpl: 600 });
  });

  test("near-cutoff flag", () => {
    expect(careResult(205, H("oak-valley-oakdale"), uninsured).nearCutoff).toBe(true);
    expect(careResult(300, H("oak-valley-oakdale"), uninsured).nearCutoff).toBe(false);
  });
});

// ---------------------------------------------------------------- rent cap

test.describe("rent cap", () => {
  test("every period's cap is min(5 + CPI, 10)", () => {
    for (const p of RENT_FACTS.periods) expect(p.maxPct).toBeCloseTo(Math.min(5 + p.cpiPct, 10), 5);
  });

  test("periods are contiguous Aug 1 – Jul 31 years", () => {
    const ps = RENT_FACTS.periods;
    for (let i = 0; i < ps.length; i++) {
      expect(ps[i]!.from.slice(5)).toBe("08-01");
      expect(ps[i]!.to.slice(5)).toBe("07-31");
      if (i) expect(addDays(ps[i - 1]!.to, 1)).toBe(ps[i]!.from);
    }
  });

  test("period lookup by effective date, including the edges", () => {
    expect(capPeriodFor("2026-07-31", RENT_FACTS.periods)?.maxPct).toBe(7.7);
    expect(capPeriodFor("2026-08-01", RENT_FACTS.periods)?.maxPct).toBe(8.6);
    expect(capPeriodFor("2027-08-01", RENT_FACTS.periods)).toBeNull();
    expect(capPeriodFor("garbage", RENT_FACTS.periods)).toBeNull();
  });

  test("$1,500 → $1,650 on 2026-09-01 is $21 over the 8.6% cap; notice 17 days is short", () => {
    const r = checkIncrease({ lowestRent: 1500, newRent: 1650, effective: "2026-09-01", noticed: "2026-08-15" }, RENT_FACTS.periods);
    expect(r.pct).toBe(10);
    expect(r.maxRent).toBe(1629);
    expect(r.overBy).toBe(21);
    expect(r.noticeRequired).toBe(30);
    expect(r.noticeGiven).toBe(17);
  });

  test("never rounds the allowed rent up", () => {
    const r = checkIncrease({ lowestRent: 1234.56, newRent: 1300, effective: "2026-09-01" }, RENT_FACTS.periods);
    // 1234.56 * 1.086 = 1340.73216 -> 1340.73
    expect(r.maxRent).toBe(1340.73);
    expect(r.overBy).toBe(0);
  });

  test("over 10% needs 90 days; mail adds 5", () => {
    const r = checkIncrease({ lowestRent: 1000, newRent: 1150, effective: "2026-09-01", byMail: true }, RENT_FACTS.periods);
    expect(r.noticeRequired).toBe(95);
  });
});

test.describe("coverage screening", () => {
  const base: CoverageAnswers = { type: "apartment", newBuilt: "no", affordable: "no", exemptNotice: null, corporateOwner: null, ownerInDuplex: null };
  test("old apartment: covered", () => expect(coverage(base)).toEqual({ status: "covered", reasons: [] }));
  test("new building: exempt", () => expect(coverage({ ...base, newBuilt: "yes" }).status).toBe("exempt"));
  test("unsure about age: maybe", () => expect(coverage({ ...base, newBuilt: "unsure" })).toEqual({ status: "maybe", reasons: ["new"] }));
  test("house needs BOTH the notice and a non-corporate owner", () => {
    const house = { ...base, type: "house" as const };
    expect(coverage({ ...house, exemptNotice: "yes", corporateOwner: "no" }).status).toBe("exempt");
    expect(coverage({ ...house, exemptNotice: "no", corporateOwner: "no" }).status).toBe("covered");
    expect(coverage({ ...house, exemptNotice: "yes", corporateOwner: "yes" }).status).toBe("covered");
    expect(coverage({ ...house, exemptNotice: "unsure", corporateOwner: "no" }).status).toBe("maybe");
  });
  test("rented mobile home: the 15-year exemption never applies", () => {
    expect(coverage({ ...base, type: "mobile-rented", newBuilt: "yes", exemptNotice: "no", corporateOwner: "no" }).status).toBe("covered");
  });
  test("owner-occupied duplex", () => {
    expect(coverage({ ...base, type: "duplex", ownerInDuplex: "yes" })).toEqual({ status: "exempt", reasons: ["duplex"] });
  });
});

// --------------------------------------------------------- address lookup

test.describe("parcel lookup", () => {
  const shard = (street: string) => JSON.parse(readFileSync(join(DATA, "parcels", `${shardKey(street)}.json`), "utf8"));

  test("parses addresses the way people type them", () => {
    expect(parseAddress("1119 E. Linwood Ave, Turlock CA 95380")).toEqual({ number: "1119", dir: "E", street: "LINWOOD", suffix: "AVE", city: "TURLOCK" });
    expect(parseAddress("1313 celeste dr apt 12 modesto")).toEqual({ number: "1313", dir: "", street: "CELESTE", suffix: "DR", city: "MODESTO" });
    expect(parseAddress("901 Parklawn Avenue")?.suffix).toBe("AVE");
    expect(parseAddress("Main St")).toBeNull();
    expect(parseAddress("")).toBeNull();
  });

  test("finds real county parcels", () => {
    const a = parseAddress("1313 Celeste Dr, Modesto")!;
    const [m] = matchParcel(shard(a.street), a);
    expect(m).toMatchObject({ city: "MODESTO", minYear: 1971, maxYear: 1979 });
    expect(builtAge(m!, 2026)).toBe("old");
    const b = parseAddress("901 Parklawn Ave")!;
    expect(builtAge(matchParcel(shard(b.street), b)[0]!, 2026)).toBe("new");
  });

  test("a different city is not a match", () => {
    const a = parseAddress("1313 Celeste Dr, Turlock")!;
    expect(matchParcel(shard(a.street), a)).toEqual([]);
  });

  test("15-year line", () => {
    expect(builtAge({ minYear: 2012, maxYear: 2012 }, 2026)).toBe("new");
    expect(builtAge({ minYear: 2011, maxYear: 2011 }, 2026)).toBe("borderline");
    expect(builtAge({ minYear: 2010, maxYear: 2010 }, 2026)).toBe("old");
    expect(builtAge({ minYear: 1948, maxYear: 2026 }, 2026)).toBe("mixed");
  });
});

// ----------------------------------------------------------------- letters

test.describe("letters", () => {
  const today = "2026-10-19";
  test("repair letter: filled values, cites the law, no placeholders", () => {
    const text = repairLetter.render(
      {
        you: "Ana López",
        rental: "123 Main St Apt 4, Modesto",
        landlord: "Valley Rentals",
        landlordAddr: "PO Box 1, Modesto CA",
        problems: ["heat", "pests"],
        since: "2026-10-01",
        contact: "209-555-0100",
      },
      "en",
      today,
    );
    expect(text).toContain("October 19, 2026");
    expect(text).toContain("- No heat or broken heater");
    expect(text).toContain("1942.5");
    expect(text).toContain("October 1, 2026");
    expect(text).not.toMatch(/\[[^\]]+\]/);
    expect(text).not.toMatch(/withhold/i);
  });

  test("blank fields become [label] placeholders, in the letter's language", () => {
    const text = repairLetter.render({}, "es", today);
    expect(text).toContain("[Su nombre completo]");
    expect(text).toContain("19 de octubre de 2026");
  });

  test("deposit letter computes the amount owed and the days since move-out", () => {
    const text = depositLetter.render({ deposit: "$1,500", returned: "200", moveOut: "2026-09-01", situation: ["nothing"] }, "en", today);
    expect(text).toContain("$1,300");
    expect(text).toContain("It has been 48 days");
    expect(text).toContain("1950.5(m)");
  });

  test("medical letter asks only for what was ticked", () => {
    const text = medicalLetter.render({ hospital: "Memorial Medical Center", asks: ["itemized"] }, "en", today);
    expect(text).toContain("an itemized bill");
    expect(text).not.toContain("payment plan");
    expect(text).not.toContain("hold all collection");
  });
});

// --------------------------------------------------------- popups / pins

test.describe("which pins get a help button", () => {
  test("known hospital -> its policy; closed hospital -> nothing; other CA acute -> generic", () => {
    expect(helpFor("hospitals", {}, [-120.99702, 37.66515])).toEqual({ tab: "medical", hospitalId: "doctors-modesto" });
    expect(helpFor("hospitals", { TYPE: "GENERAL ACUTE CARE" }, [-120.9585, 37.6648])).toBeNull();
    expect(helpFor("hospitals", { TYPE: "GENERAL ACUTE CARE", STATE: "CA" }, [-118.2, 34.05])).toEqual({ tab: "medical" });
    expect(helpFor("hospitals", { TYPE: "GENERAL ACUTE CARE", STATE: "NV" }, [-119.8, 39.5])).toBeNull();
    expect(helpFor("hospitals", { TYPE: "LONG TERM CARE", STATE: "CA" }, [-118.2, 34.05])).toBeNull();
    expect(helpFor("mobile-home-parks", {}, [-121, 37.6])).toEqual({ tab: "rent", mobileHome: true });
    expect(helpFor("parks", {}, [-121, 37.6])).toBeNull();
  });

  test("California outline without a STATE field", () => {
    expect(inCalifornia([-118.2, 34.05], {})).toBe(true); // Los Angeles
    expect(inCalifornia([-115.14, 36.17], {})).toBe(false); // Las Vegas
    expect(inCalifornia([-119.81, 39.53], {})).toBe(false); // Reno
    expect(inCalifornia([-120.0, 38.9], {})).toBe(true); // South Lake Tahoe
  });

  test("every pin on the shipped hospital map gets the right policy (or none)", () => {
    const fc = JSON.parse(readFileSync(join(DATA, "layers/hospitals.geojson"), "utf8"));
    const got = Object.fromEntries(
      fc.features.map((f: any) => [f.properties.NAME, helpFor("hospitals", f.properties, f.geometry.coordinates)?.hospitalId ?? null]),
    );
    expect(got).toEqual({
      "DOCTORS MEDICAL CENTER": "doctors-modesto",
      "STANISLAUS SURGICAL HOSPITAL": null, // closed Sept 2024
      "HEALTHSOUTH REHABILITATION HOSPITAL OF MODESTO": "encompass-modesto",
      "OAKDALE NURSING AND REHABILITATION CENTER": null, // nursing home
      "OAK VALLEY DISTRICT HOSPITAL (2-RH)": "oak-valley-oakdale",
      "CENTRAL VALLEY SPECIALTY HOSPITAL": "central-valley-specialty",
      "DOCTORS MEDICAL CENTER-BEHAVIORAL HEALTH DEPARTMENT": "doctors-behavioral",
      "TELECARE STANISLAUS COUNTY PHF": null, // psychiatric health facility, not a covered hospital
      "BRANDEL MANOR - D/P SNF OF EMANUEL MEDICAL CTR": null, // skilled nursing
      "EMANUEL MEDICAL CENTER INC": "emanuel-turlock",
      "KAISER FND HOSP-MODESTO": "kaiser-modesto",
      "MEMORIAL HOSPITAL MEDICAL CENTER - MODESTO": "memorial-modesto",
    });
  });
});

// ------------------------------------------------------ data & freshness

test.describe("curated facts", () => {
  const urls = [
    ...HOSPITALS.flatMap((h) => [h.pageUrl, h.policyUrl, h.policyUrlEs, h.applicationUrl, h.applicationUrlEs]),
    ...RENT_SOURCES.map((s) => s.url),
    ...MEDICAL_FACTS.sources.map((s) => s.url),
    ...LEGAL_FACTS.sources.map((s) => s.url),
    ...LEGAL_FACTS.verify.map((s) => s.url),
    ...REPAIR_FACTS.codeEnforcement.map((c) => c.url),
    ...MOBILE_FACTS.contacts.map((c) => c.url),
    DEPOSIT_FACTS.smallClaims.url,
    MEDICAL_FACTS.complaint.url,
    MEDICAL_FACTS.freeHelp.url,
  ].filter((u): u is string => !!u);

  test("every link is https", () => {
    for (const u of urls) expect(u, u).toMatch(/^https:\/\/[^\s]+$/);
  });

  test("every fact is cited and bilingual", () => {
    const facts = [
      ...RENT_FACTS.capRules, ...RENT_FACTS.notice, ...RENT_FACTS.exemptions,
      ...REPAIR_FACTS.rights, ...DEPOSIT_FACTS.rights, ...MOBILE_FACTS.rights, ...MEDICAL_FACTS.rights,
    ];
    for (const f of facts) {
      expect(f.cite, f.id).toBeTruthy();
      expect(f.en.length, f.id).toBeGreaterThan(20);
      expect(f.es.length, f.id).toBeGreaterThan(20);
    }
  });

  test("hospitals are in the county with real phone numbers", () => {
    for (const h of HOSPITALS) {
      expect(h.lat, h.id).toBeGreaterThan(37.1);
      expect(h.lat, h.id).toBeLessThan(38.1);
      expect(h.lon, h.id).toBeGreaterThan(-121.6);
      expect(h.lon, h.id).toBeLessThan(-120.3);
      expect(h.phone, h.id).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
      expect(dayNumber(h.policyDate), h.id).not.toBeNull();
    }
  });

  // These fail on purpose when the yearly figures need updating (see facts.ts).
  test("the rent cap covers increases starting today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(capPeriodFor(today, RENT_FACTS.periods), "add the next Aug–Jul cap from DIR's April CPI").not.toBeNull();
  });

  test("poverty guidelines are this year's (after March)", () => {
    const now = new Date();
    if (now.getMonth() >= 2) expect(G.year, "update MEDICAL_FACTS.fpl from HHS").toBeGreaterThanOrEqual(now.getFullYear());
  });

  test("copy has the same keys in both languages", () => {
    expect(Object.keys(COPY.es).sort()).toEqual(Object.keys(COPY.en).sort());
  });
});

test.describe("misc helpers", () => {
  test("money", () => {
    expect(parseMoney("$1,250.50")).toBe(1250.5);
    expect(parseMoney("1250")).toBe(1250);
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(formatMoney(1300, "en-US")).toBe("$1,300");
    expect(formatMoney(1340.73, "en-US")).toBe("$1,340.73");
  });

  test("dates reject impossible days and count across DST", () => {
    expect(dayNumber("2026-02-30")).toBeNull();
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  test("the URL carries the open Help tab and nothing typed into it", () => {
    const layers = { cameras: true, alpr: false, alprVendors: {}, overlays: {} };
    const hash = encodeState({ layers, query: "", view: null, help: "rent" });
    expect(hash).toBe("help=rent");
    expect(decodeState(`#${hash}`, layers).help).toBe("rent");
    expect(decodeState("#help=evil", layers).help).toBeUndefined();
  });
});
