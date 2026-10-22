// Unit tests for "Heat at work today" (no browser): which Cal/OSHA heat rules
// apply at each temperature (8 CCR §3395 outdoors, §3396 indoors), parsing
// typed temperatures and the Open-Meteo forecast, the heat-wave check, the
// forecast request (city center only), and data integrity of the facts.
import { test, expect } from "@playwright/test";
import { heatRules, HIGH_HEAT_INDUSTRIES, parseDailyForecast, parseTemp, todayInCalifornia, type WorkType } from "../../frontend/src/help/heat";
import { HEAT_FACTS, LAB_226_7_RECHECK } from "../../frontend/src/help/heat-facts";
import { forecastUrl, HEAT_CITIES } from "../../frontend/src/help/heat-forecast";
import { HEAT_COPY } from "../../frontend/src/help/heat-copy";
import { daysBetween } from "../../frontend/src/help/dates";

const ids = (r: ReturnType<typeof heatRules>) => r.rules.map((x) => x.id);

test.describe("outdoor rules (8 CCR §3395)", () => {
  test("at 80°F or below: the everyday rules, shade on request", () => {
    for (const t of [60, 79.9, 80]) {
      const r = heatRules({ tempF: t, setting: "outdoor", work: "construction" });
      expect(r.tiers, String(t)).toEqual(["always"]);
      expect(ids(r)).toContain("water");
      expect(ids(r)).toContain("shade-on-request");
      expect(ids(r)).toContain("cooldown");
      expect(ids(r)).not.toContain("shade-up");
      expect(r.nextAt).toBe(80);
    }
  });

  test("above 80°F (strictly): shade must be up, not just on request", () => {
    for (const t of [80.1, 85, 94.9]) {
      const r = heatRules({ tempF: t, setting: "outdoor", work: "agriculture" });
      expect(r.tiers, String(t)).toEqual(["always", "over80"]);
      expect(ids(r)).toContain("shade-up");
      expect(ids(r)).not.toContain("shade-on-request");
      expect(ids(r)).not.toContain("meeting");
      expect(r.nextAt).toBe(95);
    }
  });

  test("at exactly 95°F a listed industry gets the high-heat procedures", () => {
    const r = heatRules({ tempF: 95, setting: "outdoor", work: "construction" });
    expect(r.tiers).toEqual(["always", "over80", "high95"]);
    expect(ids(r)).toEqual(expect.arrayContaining(["contact", "observe", "remind", "meeting"]));
    expect(ids(r)).not.toContain("ag-rest"); // farm work only
    expect(r.nextAt).toBeNull();
    expect(r.notHighHeatIndustry).toBe(false);
  });

  test("farm work at 95°F+ adds the 10-minute rest every 2 hours", () => {
    expect(ids(heatRules({ tempF: 101, setting: "outdoor", work: "agriculture" }))).toContain("ag-rest");
    expect(ids(heatRules({ tempF: 94, setting: "outdoor", work: "agriculture" }))).not.toContain("ag-rest");
  });

  test("all five §3395(a)(2) industries get the 95°F rules; other outdoor work doesn't", () => {
    expect(HIGH_HEAT_INDUSTRIES).toEqual(["agriculture", "construction", "landscaping", "oil-gas", "heavy-transport"]);
    for (const w of HIGH_HEAT_INDUSTRIES) expect(heatRules({ tempF: 100, setting: "outdoor", work: w }).tiers).toContain("high95");
    const other = heatRules({ tempF: 100, setting: "outdoor", work: "other-outdoor" });
    expect(other.tiers).toEqual(["always", "over80"]);
    expect(other.notHighHeatIndustry).toBe(true);
    expect(other.nextAt).toBeNull(); // no higher tier will come for them
    expect(heatRules({ tempF: 90, setting: "outdoor", work: "other-outdoor" }).notHighHeatIndustry).toBe(false);
  });

  test("every rule has a citation to the outdoor standard", () => {
    const r = heatRules({ tempF: 105, setting: "outdoor", work: "agriculture" });
    for (const x of r.rules) expect(x.cite, x.id).toMatch(/^8 CCR §3395\(/);
  });
});

test.describe("indoor rules (8 CCR §3396)", () => {
  test("below 82°F the indoor rule doesn't apply yet", () => {
    const r = heatRules({ tempF: 81.9, setting: "indoor" });
    expect(r.tiers).toEqual([]);
    expect(r.rules).toEqual([]);
    expect(r.indoorBelow).toBe(true);
    expect(r.nextAt).toBe(82);
  });

  test("82°F to under 87°F: the base indoor rules", () => {
    for (const t of [82, 86.9]) {
      const r = heatRules({ tempF: t, setting: "indoor" });
      expect(r.tiers, String(t)).toEqual(["indoor82"]);
      expect(ids(r)).toEqual(["in-water", "in-cool-area", "in-cooldown", "in-watch", "in-plan"]);
      expect(r.nextAt).toBe(87);
    }
  });

  test("87°F or more: measure, record and cool the workplace", () => {
    const r = heatRules({ tempF: 87, setting: "indoor" });
    expect(r.tiers).toEqual(["indoor82", "indoor87"]);
    expect(ids(r)).toEqual(expect.arrayContaining(["in-measure", "in-controls"]));
    expect(r.nextAt).toBeNull();
  });

  test("heat-trapping clothing or radiant heat starts the full rules at 82°F, not below", () => {
    expect(heatRules({ tempF: 83, setting: "indoor", indoorSpecial: true }).tiers).toEqual(["indoor82", "indoor87"]);
    expect(heatRules({ tempF: 81, setting: "indoor", indoorSpecial: true }).tiers).toEqual([]);
  });

  test("every rule cites §3396", () => {
    for (const x of heatRules({ tempF: 90, setting: "indoor" }).rules) expect(x.cite, x.id).toMatch(/^8 CCR §3396\(/);
  });
});

test.describe("typed temperatures", () => {
  test("accepts plain numbers, decimals with a dot or comma, and a °F suffix", () => {
    expect(parseTemp("96")).toBe(96);
    expect(parseTemp(" 97.5 ")).toBe(97.5);
    expect(parseTemp("97,5")).toBe(97.5);
    expect(parseTemp("101°F")).toBe(101);
    expect(parseTemp("88 F")).toBe(88);
  });

  test("rejects junk and impossible readings", () => {
    for (const s of ["", "hot", "9", "977", "1e2", "95-100", "150"]) expect(parseTemp(s), s).toBeNull();
  });
});

// ---------------------------------------------------------------- forecast

const day = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
function sample(today: string, highs: number[], unit = "°F") {
  return {
    daily_units: { time: "iso8601", temperature_2m_max: unit },
    daily: { time: highs.map((_, i) => day(today, i - 5)), temperature_2m_max: highs },
  };
}

test.describe("Open-Meteo daily forecast", () => {
  test("reads today's and tomorrow's highs by date", () => {
    const f = parseDailyForecast(sample("2026-10-21", [88.5, 90, 88.4, 77.4, 70.8, 70.4, 68.7]), "2026-10-21");
    expect(f).toMatchObject({ today: "2026-10-21", todayHigh: 70.4, tomorrowHigh: 68.7, heatWave: false });
    expect(f!.pastAvg).toBeCloseTo(83.02, 2);
  });

  test("heat wave: at least 80°F AND at least 10°F above the past 5 days' average", () => {
    const past = [80, 82, 84, 86, 88]; // average 84
    expect(parseDailyForecast(sample("2026-07-10", [...past, 94, 95]), "2026-07-10")!.heatWave).toBe(true);
    expect(parseDailyForecast(sample("2026-07-10", [...past, 93.9, 95]), "2026-07-10")!.heatWave).toBe(false);
    const cool = [65, 66, 67, 68, 69]; // average 67: +10 is 77, but under 80
    expect(parseDailyForecast(sample("2026-05-01", [...cool, 79.9, 80]), "2026-05-01")!.heatWave).toBe(false);
    expect(parseDailyForecast(sample("2026-05-01", [...cool, 80, 80]), "2026-05-01")!.heatWave).toBe(true);
  });

  test("without 5 past days the heat-wave flag is unknown, not false", () => {
    const j = { daily: { time: ["2026-10-21", "2026-10-22"], temperature_2m_max: [99, 100] } };
    expect(parseDailyForecast(j, "2026-10-21")).toMatchObject({ todayHigh: 99, tomorrowHigh: 100, heatWave: null, pastAvg: null });
  });

  test("refuses responses it can't trust", () => {
    expect(parseDailyForecast(null, "2026-10-21")).toBeNull();
    expect(parseDailyForecast({ error: true, reason: "x" }, "2026-10-21")).toBeNull();
    expect(parseDailyForecast(sample("2026-10-21", [1, 2, 3, 4, 5, 30, 31], "°C"), "2026-10-21")).toBeNull();
    expect(parseDailyForecast(sample("2026-10-21", [1, 2, 3, 4, 5, 6, 7]), "2026-12-25")).toBeNull();
    expect(parseDailyForecast({ daily: { time: ["2026-10-21"], temperature_2m_max: [] } }, "2026-10-21")).toBeNull();
    const nulls = parseDailyForecast({ daily: { time: ["2026-10-21", "2026-10-22"], temperature_2m_max: [null, 80] } }, "2026-10-21");
    expect(nulls?.todayHigh).toBeNull();
  });

  test("today is the California date, not UTC's", () => {
    // 2026-10-22 03:00 UTC is still the evening of Oct 21 in California.
    expect(todayInCalifornia(new Date("2026-10-22T03:00:00Z"))).toBe("2026-10-21");
    expect(todayInCalifornia(new Date("2026-10-22T08:00:00Z"))).toBe("2026-10-22");
  });

  test("the request carries only a fixed city-center point", () => {
    const u = new URL(forecastUrl(HEAT_CITIES[0]));
    expect(u.origin + u.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      latitude: "37.64",
      longitude: "-121.00",
      daily: "temperature_2m_max",
      temperature_unit: "fahrenheit",
      timezone: "America/Los_Angeles",
      past_days: "5",
      forecast_days: "2",
    });
  });

  test("ten Stanislaus cities, all inside the county's rough bounding box", () => {
    expect(HEAT_CITIES.map((c) => c.name)).toEqual(["Modesto", "Turlock", "Ceres", "Oakdale", "Riverbank", "Patterson", "Newman", "Waterford", "Hughson", "Salida"]);
    for (const c of HEAT_CITIES) {
      expect(c.lat, c.name).toBeGreaterThan(37.1);
      expect(c.lat, c.name).toBeLessThan(38.1);
      expect(c.lon, c.name).toBeGreaterThan(-121.5);
      expect(c.lon, c.name).toBeLessThan(-120.3);
      expect(Math.round(c.lat * 100) / 100).toBe(c.lat);
      expect(Math.round(c.lon * 100) / 100).toBe(c.lon);
    }
    expect(new Set(HEAT_CITIES.map((c) => c.id)).size).toBe(HEAT_CITIES.length);
  });
});

// ------------------------------------------------------------- integrity

test.describe("heat facts and copy", () => {
  const allFacts = [
    ...HEAT_FACTS.outdoorAlways,
    ...HEAT_FACTS.outdoorOver80,
    ...HEAT_FACTS.outdoorHigh95,
    ...HEAT_FACTS.indoor82,
    ...HEAT_FACTS.indoor87,
    ...HEAT_FACTS.indoorTriggers,
    ...HEAT_FACTS.indoorExceptions,
    ...HEAT_FACTS.pay,
    ...HEAT_FACTS.rights,
    ...HEAT_FACTS.complaint,
  ];

  test("every fact has a citation, English and Spanish, and a unique id", () => {
    for (const f of allFacts) {
      expect(f.cite.trim(), f.id).not.toBe("");
      expect(f.en.trim(), f.id).not.toBe("");
      expect(f.es.trim(), f.id).not.toBe("");
      expect(f.es, f.id).not.toBe(f.en);
    }
    expect(new Set(allFacts.map((f) => f.id)).size).toBe(allFacts.length);
  });

  test("symptom lists match in both languages", () => {
    for (const s of [HEAT_FACTS.heatStroke, HEAT_FACTS.heatExhaustion, HEAT_FACTS.heatCramps]) {
      expect(s.signs.es.length).toBe(s.signs.en.length);
      expect(s.todo.es.length).toBe(s.todo.en.length);
    }
    expect(HEAT_FACTS.heatStroke.todo.en[0]).toMatch(/911/);
    expect(HEAT_FACTS.heatStroke.todo.es[0]).toMatch(/911/);
  });

  test("contacts are the verified numbers and https sources", () => {
    expect(HEAT_FACTS.calOshaLine.phone).toBe("833-579-0927");
    expect(HEAT_FACTS.modestoOffice.phone).toBe("(209) 545-7310");
    expect(HEAT_FACTS.modestoOffice.email).toBe("DOSHMod@dir.ca.gov");
    expect(HEAT_FACTS.laborCommissioner.phone).toBe("833-526-4636");
    for (const s of HEAT_FACTS.sources) expect(s.url, s.label).toMatch(/^https:\/\//);
    expect(new Set(HEAT_FACTS.sources.map((s) => s.url)).size).toBe(HEAT_FACTS.sources.length);
  });

  test("facts aren't stale (re-check every year, and Labor Code §226.7 after its 2027 change)", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(daysBetween(HEAT_FACTS.checked, today)!).toBeLessThan(366);
    expect(daysBetween(today, LAB_226_7_RECHECK)!, "re-read Labor Code §226.7 (version operative 2027-01-01), then move LAB_226_7_RECHECK").toBeGreaterThan(0);
  });

  test("Spanish copy covers every English string", () => {
    expect(Object.keys(HEAT_COPY.es).sort()).toEqual(Object.keys(HEAT_COPY.en).sort());
    const works = Object.keys(HEAT_COPY.en.workTypes).sort() as WorkType[];
    expect(Object.keys(HEAT_COPY.es.workTypes).sort()).toEqual(works);
    expect(HEAT_COPY.en.forecastToday(97)).toContain("97°F");
    expect(HEAT_COPY.es.forecastToday(97)).toContain("97°F");
  });
});
