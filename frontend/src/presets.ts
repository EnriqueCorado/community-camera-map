// One-tap "quick views": a ready-made set of layers for a situation.
// Choosing one replaces the overlays that are on (cameras/ALPR unchanged).

export interface Preset {
  id: string;
  /** i18n key for the chip label */
  label: "presetWildfire" | "presetFlood" | "presetHeat" | "presetHealth" | "presetCommute" | "presetVoting" | "presetGrowth";
  overlays: string[];
}

export const PRESETS: Preset[] = [
  { id: "wildfire", label: "presetWildfire", overlays: ["wildfire", "wildfire-perimeters", "fire-hotspots-usa", "smoke-forecast", "fire-weather", "fire-cameras", "air-quality"] },
  { id: "flood", label: "presetFlood", overlays: ["flood", "river-gauges", "rain-radar", "weather-alerts", "sandbags", "shelters"] },
  { id: "heat", label: "presetHeat", overlays: ["heat-risk", "cooling-centers", "weather-now", "air-quality"] },
  { id: "health", label: "presetHealth", overlays: ["health-uninsured", "clinics", "hospitals", "pharmacies", "snap-stores", "food-banks", "wastewater"] },
  { id: "commute", label: "presetCommute", overlays: ["lane-closures", "message-signs", "road-weather", "buses", "fatal-crashes"] },
  { id: "voting", label: "presetVoting", overlays: ["voting"] },
  { id: "growth", label: "presetGrowth", overlays: ["housing-proposals", "new-homes", "ceqa-projects"] },
];

/** Overlay state for a preset: exactly its layers on (only ones that exist). */
export function applyPreset(preset: Preset, known: Iterable<string>): Record<string, boolean> {
  const exists = new Set(known);
  return Object.fromEntries(preset.overlays.filter((n) => exists.has(n)).map((n) => [n, true]));
}

/** The preset whose layers are exactly the ones on, if any. */
export function activePreset(overlays: Record<string, boolean>, known: Iterable<string>): string | null {
  const on = Object.keys(overlays).filter((k) => overlays[k]).sort().join(",");
  if (!on) return null;
  for (const p of PRESETS) if (Object.keys(applyPreset(p, known)).sort().join(",") === on) return p.id;
  return null;
}
