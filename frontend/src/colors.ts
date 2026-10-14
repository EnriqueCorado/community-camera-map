// Single source of truth for layer colors, shared by the map and the sidebar
// legend so the dots on the map always match their legend swatch.

export const CAM = "#35c08b";
export const ALPR_CLUSTER = "#b23"; // deep red family for ALPR clusters

// Short keys so the MapLibre "match" expression stays strongly typed under
// noUncheckedIndexedAccess.
export const VENDOR_COLORS = {
  flock: "#d1431f",
  motorola: "#2463b5",
  other: "#7a6e9c",
} as const;

// Keyed by the vendor string as it appears in the data + sidebar labels.
export const VENDOR_SWATCH: Record<string, string> = {
  "Flock Safety": VENDOR_COLORS.flock,
  "Motorola / Vigilant": VENDOR_COLORS.motorola,
  "Other / unknown": VENDOR_COLORS.other,
};

export const OVERLAY_COLOR: Record<string, string> = {
  "city-limits": "#3b82f6",
  annexations: "#f59e0b",
  "general-plan": "#14b8a6",
  zoning: "#a855f7",
  parks: "#22c55e",
  schools: "#eab308",
  wildfire: "#ef4444",
  "weather-alerts": "#f97316",
  quakes: "#e11d48",
  census: "#2b8cbe",
  hospitals: "#ec4899",
  "law-enforcement": "#0ea5e9",
  flood: "#06b6d4",
  "fire-hazard": "#c2410c",
  enviroscreen: "#7c3aed",
  streamflow: "#0891b2",
  "lane-closures": "#f43f5e",
  "message-signs": "#64748b",
  "air-quality": "#16a34a",
  "transit-routes": "#9333ea",
  "transit-stops": "#a855f7",
  "supervisor-districts": "#0d9488",
  "zip-codes": "#78716c",
  "congressional-districts": "#4f46e5",
  airports: "#475569",
  amtrak: "#1d4ed8",
  dams: "#0e7490",
  "fire-cameras": "#ea580c",
  "river-cameras": "#0284c7",
  "windy-webcams": "#db2777",
  "smoke-haze": "#78716c",
  flights: "#3b82f6",
  "rain-radar": "#22c55e",
  satellite: "#0f766e",
};

// CalEnviroScreen overall percentile ramp (green = low burden, red = high).
export const ENVIRO_STOPS: [number, string][] = [
  [0, "#1a9850"],
  [25, "#a6d96a"],
  [50, "#fee08b"],
  [75, "#fdae61"],
  [100, "#d73027"],
];

export const CENSUS_STOPS: [number, string][] = [
  [0, "#eef3f7"],
  [50000, "#b6d2e3"],
  [80000, "#74a9cf"],
  [110000, "#2b8cbe"],
  [150000, "#045a8d"],
];
