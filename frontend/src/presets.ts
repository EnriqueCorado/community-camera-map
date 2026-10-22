// One-tap "quick views": a ready-made set of layers for a situation.
// Choosing one replaces the overlays that are on (cameras/ALPR unchanged).
import { stateOfLayer } from "./view-logic";

export interface Preset {
  id: string;
  /** i18n key for the chip label */
  label: "presetWildfire" | "presetFlood" | "presetHeat" | "presetHealth" | "presetCommute" | "presetVoting" | "presetGrowth";
  overlays: string[];
  /** State-pack layers to add for the state(s) on screen, matched by name. */
  stateLayers?: RegExp;
}

/** State-pack layers that list places to vote (sites, not precincts). */
export const VOTING_SITE = /(polling|poll-sites|vote-centers|voting-locations|early-voting|early-vote|ballot-drop|drop-boxes|ballot-sites|election-day)/;

export const PRESETS: Preset[] = [
  { id: "wildfire", label: "presetWildfire", overlays: ["wildfire", "wildfire-perimeters", "fire-hotspots-usa", "smoke-forecast", "fire-weather", "fire-cameras", "air-quality"] },
  { id: "flood", label: "presetFlood", overlays: ["flood", "river-gauges", "rain-radar", "weather-alerts", "sandbags", "shelters"] },
  { id: "heat", label: "presetHeat", overlays: ["heat-risk", "cooling-centers", "weather-now", "air-quality"], stateLayers: /(cooling|warming)/ },
  { id: "health", label: "presetHealth", overlays: ["health-uninsured", "clinics", "hospitals", "pharmacies", "snap-stores", "food-banks", "wastewater"] },
  { id: "commute", label: "presetCommute", overlays: ["lane-closures", "message-signs", "road-weather", "buses", "fatal-crashes"] },
  { id: "voting", label: "presetVoting", overlays: ["voting"], stateLayers: VOTING_SITE },
  { id: "growth", label: "presetGrowth", overlays: ["housing-proposals", "new-homes", "ceqa-projects"] },
];

/** Overlay state for a preset: exactly its layers on (only ones that exist),
 *  plus its matching state-pack layers for the states in `here`. */
export function applyPreset(preset: Preset, known: Iterable<string>, here: string[] = []): Record<string, boolean> {
  const names = [...known];
  const exists = new Set(names);
  const local = preset.stateLayers
    ? names.filter((n) => preset.stateLayers!.test(n) && here.includes(stateOfLayer(n) ?? ""))
    : [];
  return Object.fromEntries([...preset.overlays.filter((n) => exists.has(n)), ...local].map((n) => [n, true]));
}

/** The preset whose layers are exactly the ones on, if any. */
export function activePreset(overlays: Record<string, boolean>, known: Iterable<string>, here: string[] = []): string | null {
  const on = Object.keys(overlays).filter((k) => overlays[k]).sort().join(",");
  if (!on) return null;
  const names = [...known];
  for (const p of PRESETS) if (Object.keys(applyPreset(p, names, here)).sort().join(",") === on) return p.id;
  return null;
}
