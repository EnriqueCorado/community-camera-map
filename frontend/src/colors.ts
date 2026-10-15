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
  "fire-hotspots": "#b45309",
  iss: "#f59e0b",
  satellites: "#6366f1",
  trains: "#be123c",
  wildlife: "#65a30d",
  wikipedia: "#334155",
  "weather-now": "#0ea5e9",
  aed: "#dc2626",
  "drinking-water": "#0284c7",
  restrooms: "#8b5cf6",
  "ev-chargers": "#059669",
  "road-weather": "#0ea5e9",
  "chain-controls": "#64748b",
  "wildfire-perimeters": "#dc2626",
  faults: "#9f1239",
  superfund: "#a16207",
  "power-plants": "#ca8a04",
  substations: "#57534e",
  "air-now": "#16a34a",
  libraries: "#7c3aed",
  playgrounds: "#db2777",
  pharmacies: "#0d9488",
  "fire-stations": "#b91c1c",
  "free-wifi": "#2563eb",
  "cooling-centers": "#0891b2",
  sandbags: "#92400e",
  shelters: "#be185d",
  "fire-districts": "#ef4444",
  bridges: "#475569",
  rivers: "#0284c7",
  railroads: "#44403c",
  "elementary-districts": "#8b5cf6",
  "high-school-districts": "#6d28d9",
  "county-islands": "#f97316",
  "mosquito-districts": "#65a30d",
  "historic-places": "#a16207",
  "food-banks": "#ea580c",
  clinics: "#e11d48",
  "community-centers": "#0f766e",
  "farmers-markets": "#4d7c0f",
  "historical-markers": "#854d0e",
  "mobile-home-parks": "#c2410c",
  "census-spanish": "#756bb1",
  "census-poverty": "#756bb1",
  "census-renters": "#756bb1",
  "census-foreign-born": "#756bb1",
};

// CalEnviroScreen overall percentile ramp (green = low burden, red = high).
export const ENVIRO_STOPS: [number, string][] = [
  [0, "#1a9850"],
  [25, "#a6d96a"],
  [50, "#fee08b"],
  [75, "#fdae61"],
  [100, "#d73027"],
];

/** Share-of-residents choropleth (percent), light -> dark purple. */
export const PCT_STOPS: [number, string][] = [
  [0, "#f2f0f7"],
  [15, "#cbc9e2"],
  [30, "#9e9ac8"],
  [50, "#756bb1"],
  [70, "#54278f"],
];

/** Which census property each census layer colors by. */
export const CENSUS_FIELD: Record<string, string> = {
  census: "median_income",
  "census-spanish": "pct_spanish",
  "census-poverty": "pct_poverty",
  "census-renters": "pct_renters",
  "census-foreign-born": "pct_foreign_born",
};

export const CENSUS_STOPS: [number, string][] = [
  [0, "#eef3f7"],
  [50000, "#b6d2e3"],
  [80000, "#74a9cf"],
  [110000, "#2b8cbe"],
  [150000, "#045a8d"],
];
