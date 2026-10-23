// Picking clinics for the clinic finder (no React, so unit tests can use it).
// Nothing here is stored or sent: the choices live only in the tool's state.
import { CLINICS, TOWNS, type Clinic, type Need, type Town } from "./clinics-facts";

export interface ClinicChoice {
  town: Town | "all";
  need: Need | "all";
}

export interface ClinicPick {
  clinics: Clinic[];
  /** True when the town has none for this need, so these are the closest ones. */
  nearest: boolean;
  /** True when the town's only places for this need are limited (school campus or
   *  part-time), so the closest full-time clinic was added after them. */
  limitedOnly: boolean;
}

/** How many to show when a town has none of its own. */
export const NEAREST_COUNT = 3;

/** Straight-line distance in km (good enough to rank places in one county). */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Full-time sites first, keeping the given order within each group. */
const fullTimeFirst = (list: Clinic[]) => [...list.filter((c) => !c.limited), ...list.filter((c) => c.limited)];

export function pickClinics({ town, need }: ClinicChoice, all: readonly Clinic[] = CLINICS): ClinicPick {
  const forNeed = all.filter((c) => need === "all" || c.needs.includes(need));
  if (town === "all") return { clinics: forNeed, nearest: false, limitedOnly: false };
  const from = TOWNS[town].center;
  const byDistance = [...forNeed].sort((a, b) => distanceKm(from, a.center) - distanceKm(from, b.center));
  const closestFullTime = byDistance.find((c) => !c.limited);
  const inTown = forNeed.filter((c) => c.town === town);
  if (inTown.length > 0) {
    // A town with only school-campus or part-time sites also gets the closest full-time one.
    if (inTown.every((c) => c.limited) && closestFullTime) return { clinics: [...inTown, closestFullTime], nearest: false, limitedOnly: true };
    return { clinics: fullTimeFirst(inTown), nearest: false, limitedOnly: false };
  }
  const nearest = byDistance.slice(0, NEAREST_COUNT);
  if (closestFullTime && !nearest.some((c) => !c.limited)) nearest.push(closestFullTime);
  return { clinics: fullTimeFirst(nearest), nearest: true, limitedOnly: false };
}

/** Towns that have at least one place listed (the rest are "near" choices). */
export const TOWNS_WITH_CLINICS: Town[] = (Object.keys(TOWNS) as Town[]).filter((t) => CLINICS.some((c) => c.town === t));
