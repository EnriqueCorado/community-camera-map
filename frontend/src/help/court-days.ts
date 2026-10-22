// California court-day counting for 2026–2027. Pure (no React, no network).
//
// Rules (research checked 2026-10-21):
//  - CCP §12: the day of service does NOT count; the last day does.
//  - Court days skip Saturdays, Sundays and judicial holidays (CCP §135);
//    Day 1 is the first court day after the start date.
//  - Calendar-day periods count every day; if the last day is not a court
//    day it moves to the next court day (CCP §12a).
//
// Holidays: the Judicial Council list (courts.ca.gov/about/court-holidays),
// matched against the Stanislaus Superior Court holiday page, using the
// observed dates (CRC rule 1.11: Sunday -> Monday, Saturday -> Friday).
//
// SAFETY: a wrong count can cost someone their home. Outside the years we
// have a checked holiday list for, every function returns null so the screen
// says "call now" instead of guessing. A holiday whose date is disputed is
// treated as an ordinary court day: skipping it would make the deadline later.
//
// UPDATE EACH YEAR: add the next year's Judicial Council holidays and move
// COVERED_TO. Unit tests (e2e/tests/unit-eviction.spec.ts) pin every date.
import { addDays, dayNumber } from "./dates";

export interface CourtHoliday {
  date: string;
  en: string;
  es: string;
}

export const COURT_HOLIDAYS_SOURCE = {
  checked: "2026-10-21",
  url: "https://courts.ca.gov/about/court-holidays",
  local: "https://www.stanislaus.courts.ca.gov/general-information/court-hours-holidays",
};

/** First and last dates we can count on (inclusive). */
export const COVERED_FROM = "2026-01-01";
export const COVERED_TO = "2027-12-31";

export const COURT_HOLIDAYS: readonly CourtHoliday[] = [
  { date: "2026-01-01", en: "New Year's Day", es: "Año Nuevo" },
  { date: "2026-01-19", en: "Martin Luther King Jr. Day", es: "Día de Martin Luther King Jr." },
  { date: "2026-02-12", en: "Lincoln's Birthday", es: "Natalicio de Lincoln" },
  { date: "2026-02-16", en: "Presidents' Day", es: "Día de los Presidentes" },
  { date: "2026-03-31", en: "Farmworkers Day", es: "Día de los Trabajadores del Campo" },
  { date: "2026-05-25", en: "Memorial Day", es: "Día de los Caídos (Memorial Day)" },
  { date: "2026-06-19", en: "Juneteenth", es: "Juneteenth" },
  { date: "2026-07-03", en: "Independence Day (observed)", es: "Día de la Independencia (observado)" },
  { date: "2026-09-07", en: "Labor Day", es: "Día del Trabajo" },
  { date: "2026-09-25", en: "Native American Day", es: "Día de los Nativos Americanos" },
  { date: "2026-11-11", en: "Veterans Day", es: "Día de los Veteranos" },
  { date: "2026-11-26", en: "Thanksgiving Day", es: "Día de Acción de Gracias" },
  { date: "2026-11-27", en: "Day after Thanksgiving", es: "Día después de Acción de Gracias" },
  { date: "2026-12-25", en: "Christmas Day", es: "Navidad" },
  { date: "2027-01-01", en: "New Year's Day", es: "Año Nuevo" },
  { date: "2027-01-18", en: "Martin Luther King Jr. Day", es: "Día de Martin Luther King Jr." },
  { date: "2027-02-12", en: "Lincoln's Birthday", es: "Natalicio de Lincoln" },
  { date: "2027-02-15", en: "Presidents' Day", es: "Día de los Presidentes" },
  // Farmworkers Day 2027 is disputed (see DISPUTED_DAYS) and NOT listed here.
  { date: "2027-05-31", en: "Memorial Day", es: "Día de los Caídos (Memorial Day)" },
  { date: "2027-06-18", en: "Juneteenth (observed)", es: "Juneteenth (observado)" },
  { date: "2027-07-05", en: "Independence Day (observed)", es: "Día de la Independencia (observado)" },
  { date: "2027-09-06", en: "Labor Day", es: "Día del Trabajo" },
  { date: "2027-09-24", en: "Native American Day", es: "Día de los Nativos Americanos" },
  { date: "2027-11-11", en: "Veterans Day", es: "Día de los Veteranos" },
  { date: "2027-11-25", en: "Thanksgiving Day", es: "Día de Acción de Gracias" },
  { date: "2027-11-26", en: "Day after Thanksgiving", es: "Día después de Acción de Gracias" },
  { date: "2027-12-24", en: "Christmas Day (observed)", es: "Navidad (observado)" },
  // Jan 1, 2028 is a Saturday, so CRC rule 1.11 moves it to Friday; the
  // Stanislaus court lists it.
  { date: "2027-12-31", en: "New Year's Day 2028 (observed)", es: "Año Nuevo 2028 (observado)" },
];

/** Days some sources call a court holiday and others don't. We count them as
 *  court days (the earlier, safer deadline) and tell the person. */
export const DISPUTED_DAYS: readonly CourtHoliday[] = [
  {
    date: "2027-03-31",
    en: "Farmworkers Day 2027 (the date in state law, Gov. Code §6700)",
    es: "Día de los Trabajadores del Campo 2027 (la fecha de la ley estatal, Gov. Code §6700)",
  },
  {
    date: "2027-04-09",
    en: "Farmworkers Day 2027 (the date on the Judicial Council and Stanislaus court lists)",
    es: "Día de los Trabajadores del Campo 2027 (la fecha en las listas del Consejo Judicial y la corte de Stanislaus)",
  },
];

const HOLIDAY = new Map(COURT_HOLIDAYS.map((h) => [h.date, h]));
const FROM = dayNumber(COVERED_FROM)!;
const TO = dayNumber(COVERED_TO)!;

/** Inside the years we have a checked holiday list for. */
export function inCoveredRange(iso: string): boolean {
  const d = dayNumber(iso);
  return d != null && d >= FROM && d <= TO;
}

/** 0 = Sunday … 6 = Saturday (UTC day, so DST never matters). */
function weekday(day: number): number {
  return (((day + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

/** The court holiday on this date, if any. */
export function holidayOn(iso: string): CourtHoliday | null {
  return HOLIDAY.get(iso) ?? null;
}

export function isWeekend(iso: string): boolean | null {
  const d = dayNumber(iso);
  if (d == null) return null;
  const w = weekday(d);
  return w === 0 || w === 6;
}

/** True on a weekday that is not a judicial holiday; null outside 2026–2027. */
export function isCourtDay(iso: string): boolean | null {
  if (!inCoveredRange(iso)) return null;
  return !isWeekend(iso) && !HOLIDAY.has(iso);
}

export interface Count {
  /** The deadline (last day). */
  end: string;
  /** Each court day counted, in order (court-day counts only). */
  counted: string[];
  /** Court holidays passed over (skipped, or rolled past). */
  holidays: CourtHoliday[];
  /** Weekend days passed over. */
  weekendDays: number;
  /** Disputed days inside the window that we counted as court days. */
  disputed: CourtHoliday[];
  /** Calendar counts: the raw last day before it moved to a court day. */
  rolledFrom?: string;
}

function disputedBetween(fromIso: string, toIso: string): CourtHoliday[] {
  const a = dayNumber(fromIso)!;
  const b = dayNumber(toIso)!;
  return DISPUTED_DAYS.filter((h) => {
    const d = dayNumber(h.date)!;
    return d > a && d <= b;
  });
}

/** Count `n` court days after `startIso` (the start day itself never counts).
 *  Null for a bad date, n < 1, or if the count would leave 2026–2027. */
export function countCourtDays(startIso: string, n: number): Count | null {
  if (!inCoveredRange(startIso) || !Number.isInteger(n) || n < 1) return null;
  const counted: string[] = [];
  const holidays: CourtHoliday[] = [];
  let weekendDays = 0;
  let day = startIso;
  while (counted.length < n) {
    const next = addDays(day, 1);
    if (next == null || !inCoveredRange(next)) return null;
    day = next;
    const h = holidayOn(day);
    if (isWeekend(day)) weekendDays++;
    else if (h) holidays.push(h);
    else counted.push(day);
  }
  return { end: day, counted, holidays, weekendDays, disputed: disputedBetween(startIso, day) };
}

/** `iso` plus `n` court days, or null (see countCourtDays). */
export function addCourtDays(startIso: string, n: number): string | null {
  return countCourtDays(startIso, n)?.end ?? null;
}

/** This day if the court is open, else the next court day; null past 2027. */
export function nextCourtDay(iso: string): { day: string; holidays: CourtHoliday[]; weekendDays: number } | null {
  const holidays: CourtHoliday[] = [];
  let weekendDays = 0;
  let day: string | null = iso;
  while (day != null && isCourtDay(day) === false) {
    const h = holidayOn(day);
    if (h) holidays.push(h);
    else weekendDays++;
    day = addDays(day, 1);
  }
  if (day == null || isCourtDay(day) !== true) return null;
  return { day, holidays, weekendDays };
}

/** Count `n` calendar days after `startIso`; if the last one is a weekend or
 *  court holiday, move to the next court day (CCP §12a). */
export function countCalendarDays(startIso: string, n: number): Count | null {
  if (!inCoveredRange(startIso) || !Number.isInteger(n) || n < 1) return null;
  const raw = addDays(startIso, n);
  if (raw == null) return null;
  const rolled = nextCourtDay(raw);
  if (!rolled) return null;
  return {
    end: rolled.day,
    counted: [],
    holidays: rolled.holidays,
    weekendDays: rolled.weekendDays,
    // Only the last day matters in a calendar count.
    disputed: DISPUTED_DAYS.filter((h) => h.date === rolled.day),
    rolledFrom: rolled.day !== raw ? raw : undefined,
  };
}
