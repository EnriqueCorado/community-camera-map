// Pure logic for "Heat at work today": which Cal/OSHA heat rules apply at a
// given temperature (8 CCR §3395 outdoors, §3396 indoors), plus parsing the
// Open-Meteo daily forecast. No React/DOM: unit-tested in
// e2e/tests/unit-heat.spec.ts. The rules and their citations live in
// heat-facts.ts.
import { HEAT_FACTS, type HeatRule } from "./heat-facts";

export type Setting = "outdoor" | "indoor";

/** Outdoor work. The first five are §3395(a)(2)'s "high-heat" industries,
 *  the only ones that must follow the 95°F procedures in §3395(e). */
export type WorkType = "agriculture" | "construction" | "landscaping" | "oil-gas" | "heavy-transport" | "other-outdoor";
export const HIGH_HEAT_INDUSTRIES: readonly WorkType[] = ["agriculture", "construction", "landscaping", "oil-gas", "heavy-transport"];

/** Which group a rule belongs to; the tiers add up as it gets hotter. */
export type Tier = "always" | "over80" | "high95" | "indoor82" | "indoor87";

export interface HeatInput {
  /** Temperature in °F (at the worksite, or the forecast as a heads-up). */
  tempF: number;
  setting: Setting;
  /** Outdoors only. */
  work?: WorkType;
  /** Indoors: heat-trapping clothing or a high radiant heat area. Either one
   *  starts §3396's full rules at 82°F instead of 87°F (§3396(a)(2)(C)-(D)). */
  indoorSpecial?: boolean;
}

export interface HeatResult {
  tiers: Tier[];
  /** Every rule that applies, in tier order. */
  rules: HeatRule[];
  /** Outdoors at 95°F+ but not in a listed industry: the 95°F procedures
   *  don't apply (say so, so nobody assumes they were forgotten). */
  notHighHeatIndustry: boolean;
  /** Indoors below 82°F: §3396 doesn't apply yet. */
  indoorBelow: boolean;
  /** The next temperature where more rules start, or null at the top tier. */
  nextAt: number | null;
}

const T = HEAT_FACTS.thresholds;

/** The rules an employer must follow at `tempF`. Thresholds follow the
 *  regulation's own words: shade "exceeds 80" (strictly above), high heat
 *  "equals or exceeds 95", indoors "82 degrees or above" / "87 degrees or above". */
export function heatRules(input: HeatInput): HeatResult {
  const t = input.tempF;
  if (input.setting === "indoor") {
    const covered = t >= T.indoorAt;
    const full = t >= T.indoorFullAt || (covered && !!input.indoorSpecial);
    const tiers: Tier[] = [];
    if (covered) tiers.push("indoor82");
    if (full) tiers.push("indoor87");
    return {
      tiers,
      rules: [...(covered ? HEAT_FACTS.indoor82 : []), ...(full ? HEAT_FACTS.indoor87 : [])],
      notHighHeatIndustry: false,
      indoorBelow: !covered,
      nextAt: !covered ? T.indoorAt : !full ? T.indoorFullAt : null,
    };
  }
  const over80 = t > T.shadeOver;
  const at95 = t >= T.highHeatAt;
  const listed = input.work != null && HIGH_HEAT_INDUSTRIES.includes(input.work);
  const tiers: Tier[] = ["always"];
  if (over80) tiers.push("over80");
  if (at95 && listed) tiers.push("high95");
  // Shade "on request" is only the rule at 80°F or below; above it, shade must be up.
  const always = HEAT_FACTS.outdoorAlways.filter((r) => !(over80 && r.maxF != null && t > r.maxF));
  const high = at95 && listed ? HEAT_FACTS.outdoorHigh95.filter((r) => !r.only || r.only === input.work) : [];
  return {
    tiers,
    rules: [...always, ...(over80 ? HEAT_FACTS.outdoorOver80 : []), ...high],
    notHighHeatIndustry: at95 && !listed,
    indoorBelow: false,
    nextAt: !over80 ? T.shadeOver : !at95 && listed ? T.highHeatAt : null,
  };
}

/** A typed temperature: "97", "97.5" or "97,5". Null if it isn't a plausible
 *  air temperature in °F (rules out typos like 9 or 977). */
export function parseTemp(s: string): number | null {
  const v = s.trim().replace(/\s*°?\s*f?$/i, "").replace(",", ".");
  if (!/^-?\d{1,3}(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return n >= 20 && n <= 140 ? n : null;
}

// ------------------------------------------------------------- forecast

export interface DailyForecast {
  /** The day the highs are for (ISO, America/Los_Angeles). */
  today: string;
  todayHigh: number | null;
  tomorrowHigh: number | null;
  /** §3395(g)(1) heat wave from the forecast: today's predicted high is at
   *  least 80°F and at least 10°F above the past 5 days' average high.
   *  Null when the past 5 days weren't in the response. */
  heatWave: boolean | null;
  /** Average high of the 5 days before today (for the explanation). */
  pastAvg: number | null;
}

/** Today's date in Stanislaus County, as ISO. */
export function todayInCalifornia(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Read Open-Meteo's `daily.time` / `daily.temperature_2m_max` arrays
 *  (requested with past_days=5, forecast_days=2, °F). Returns null for a
 *  response we can't trust: wrong units, missing arrays, or no today. */
export function parseDailyForecast(json: unknown, today: string): DailyForecast | null {
  if (!json || typeof json !== "object") return null;
  const j = json as { daily?: { time?: unknown; temperature_2m_max?: unknown }; daily_units?: { temperature_2m_max?: unknown } };
  const unit = j.daily_units?.temperature_2m_max;
  if (unit != null && unit !== "°F") return null;
  const time = j.daily?.time;
  const max = j.daily?.temperature_2m_max;
  if (!Array.isArray(time) || !Array.isArray(max) || time.length !== max.length) return null;
  const i = time.indexOf(today);
  if (i < 0) return null;
  const todayHigh = num(max[i]);
  const tomorrowHigh = i + 1 < max.length ? num(max[i + 1]) : null;
  const past = i >= 5 ? max.slice(i - 5, i).map(num) : [];
  const pastOk = past.length === 5 && past.every((v) => v != null);
  const pastAvg = pastOk ? (past as number[]).reduce((a, b) => a + b, 0) / 5 : null;
  const heatWave =
    todayHigh == null || pastAvg == null ? null : todayHigh >= T.heatWaveMin && todayHigh >= pastAvg + T.heatWaveAbove;
  return { today, todayHigh, tomorrowHigh, heatWave, pastAvg };
}
