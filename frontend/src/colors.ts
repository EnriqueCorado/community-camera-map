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
  voting: "#1d4ed8",
  buses: "#0f766e",
  wastewater: "#7c3aed",
  groundwater: "#0369a1",
  "river-gauges": "#0284c7",
  "storm-reports": "#9333ea",
  "fire-weather": "#ea580c",
  "smoke-forecast": "#78716c",
  volcanoes: "#b91c1c",
  "national-parks": "#15803d",
  "power-outages": "#dc2626",
  "outage-areas": "#f97316",
  "health-asthma": "#0e7490",
  "health-diabetes": "#be185d",
  "health-uninsured": "#7c3aed",
  "food-insecurity": "#c2410c",
  "snap-stores": "#15803d",
  "fatal-crashes": "#7f1d1d",
  reservoirs: "#0284c7",
  drought: "#ca8a04",
  "heat-risk": "#e11d48",
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

/** CDC PLACES prevalence (% of adults) per layer, light -> dark. Breaks
 *  roughly span the national tract range for each measure. */
export const HEALTH_STOPS: Record<string, [number, string][]> = {
  "health-asthma": [[7, "#ecfeff"], [9, "#a5f3fc"], [11, "#22d3ee"], [13, "#0891b2"], [15, "#155e75"]],
  "health-diabetes": [[5, "#fdf2f8"], [9, "#fbcfe8"], [13, "#f472b6"], [17, "#db2777"], [22, "#831843"]],
  "health-uninsured": [[3, "#f5f3ff"], [8, "#ddd6fe"], [15, "#a78bfa"], [25, "#7c3aed"], [35, "#4c1d95"]],
  "food-insecurity": [[5, "#fff7ed"], [12, "#fed7aa"], [20, "#fb923c"], [30, "#ea580c"], [40, "#7c2d12"]],
};

/** U.S. Drought Monitor categories D0-D4 (the USDM's own palette). */
export const DROUGHT_COLORS: [number, string][] = [
  [0, "#ffff00"],
  [1, "#fcd37f"],
  [2, "#ffaa00"],
  [3, "#e60000"],
  [4, "#730000"],
];

/** NWS HeatRisk levels 0-4 (the NWS palette, as drawn by its image service). */
export const HEAT_COLORS: [number, string][] = [
  [0, "#c7e9c0"],
  [1, "#f4ec4c"],
  [2, "#f19637"],
  [3, "#d7191c"],
  [4, "#b01aa0"],
];

/** Reservoir % full -> dot color (red = low, blue = full). */
export const RESERVOIR_STOPS: [number, string][] = [
  [20, "#dc2626"],
  [50, "#eab308"],
  [80, "#0284c7"],
];

/** CDC wastewater viral activity level -> dot color (green low ... red very high). */
export const WVAL_COLORS: [string, string][] = [
  ["Very Low", "#16a34a"],
  ["Low", "#84cc16"],
  ["Moderate", "#eab308"],
  ["High", "#f97316"],
  ["Very High", "#dc2626"],
];

/** Wastewater levels -> label keys (en/es in i18n.tsx). */
export const WVAL_KEYS: Record<string, "wvalVeryLow" | "wvalLow" | "wvalModerate" | "wvalHigh" | "wvalVeryHigh"> = {
  "Very Low": "wvalVeryLow",
  Low: "wvalLow",
  Moderate: "wvalModerate",
  High: "wvalHigh",
  "Very High": "wvalVeryHigh",
};

/** Depth to groundwater (ft below ground) -> dot color: blue near the
 *  surface, brown when deep. */
export const GROUNDWATER_STOPS: [number, string][] = [
  [10, "#1d4ed8"],
  [50, "#38bdf8"],
  [100, "#facc15"],
  [200, "#b45309"],
  [400, "#78350f"],
];

/** NOAA river gauge flood status -> dot color. */
export const GAUGE_COLORS: [string, string][] = [
  ["no_flooding", "#16a34a"],
  ["action", "#eab308"],
  ["minor", "#f97316"],
  ["moderate", "#dc2626"],
  ["major", "#9333ea"],
];

/** River gauge status -> label keys (en/es in i18n.tsx). */
export const GAUGE_KEYS: Record<
  string,
  "gaugeNone" | "gaugeAction" | "gaugeMinor" | "gaugeModerate" | "gaugeMajor" | "gaugeNotDefined" | "gaugeStale" | "gaugeOut" | "gaugeLow"
> = {
  no_flooding: "gaugeNone",
  action: "gaugeAction",
  minor: "gaugeMinor",
  moderate: "gaugeModerate",
  major: "gaugeMajor",
  not_defined: "gaugeNotDefined",
  low_threshold: "gaugeLow",
  obs_not_current: "gaugeStale",
  out_of_service: "gaugeOut",
};
/** Gray: no flood stages, not current, or out of service. */
export const GAUGE_OTHER = "#94a3b8";

/** SPC fire weather outlook levels (dn) -> label keys. */
export const FIREWX_KEYS: Record<number, "firewxElevated" | "firewxCritical" | "firewxExtreme"> = {
  5: "firewxElevated",
  8: "firewxCritical",
  10: "firewxExtreme",
};

/** NWS storm report kinds (keyword in the report type) -> dot color + label key. */
export const STORM_KINDS: [string, string, "stormTornado" | "stormHail" | "stormFlood" | "stormWind"][] = [
  ["Tornado", "#7f1d1d", "stormTornado"],
  ["Hail", "#0891b2", "stormHail"],
  ["Flood", "#1d4ed8", "stormFlood"],
  ["Wind", "#9333ea", "stormWind"],
  ["Wnd", "#9333ea", "stormWind"],
];

/** USGS aviation color codes -> label keys. */
export const VOLCANO_KEYS: Record<string, "volcanoGreen" | "volcanoYellow" | "volcanoOrange" | "volcanoRed"> = {
  GREEN: "volcanoGreen",
  YELLOW: "volcanoYellow",
  ORANGE: "volcanoOrange",
  RED: "volcanoRed",
};

/** USGS volcano alert levels -> label keys. */
export const VOLCANO_ALERT_KEYS: Record<string, "volcAlertNormal" | "volcAlertAdvisory" | "volcAlertWatch" | "volcAlertWarning"> = {
  NORMAL: "volcAlertNormal",
  ADVISORY: "volcAlertAdvisory",
  WATCH: "volcAlertWatch",
  WARNING: "volcAlertWarning",
};

/** USGS aviation color codes -> dot color. */
export const VOLCANO_COLORS: [string, string][] = [
  ["GREEN", "#16a34a"],
  ["YELLOW", "#eab308"],
  ["ORANGE", "#f97316"],
  ["RED", "#dc2626"],
];

/** SPC fire weather outlook levels (dn) -> fill color (SPC's palette). */
export const FIREWX_COLORS: [number, string][] = [
  [5, "#ffbb66"],
  [8, "#ff4444"],
  [10, "#ff00ff"],
];

/** Outage type (normalized by the backend) -> dot color. */
export const OUTAGE_COLORS: [string, string][] = [
  ["unplanned", "#dc2626"],
  ["planned", "#f59e0b"],
];

/** Voting location kinds -> label keys (en/es in i18n.tsx). */
export const VOTING_KEYS: Record<string, "votingCenter" | "votingDropBox" | "votingOutdoorBox" | "votingCurbside"> = {
  "vote-center": "votingCenter",
  "drop-box": "votingDropBox",
  "outdoor-drop-box": "votingOutdoorBox",
  curbside: "votingCurbside",
};

/** Voting location kinds -> dot color. */
export const VOTING_COLORS: [string, string][] = [
  ["vote-center", "#1d4ed8"],
  ["drop-box", "#0f766e"],
  ["outdoor-drop-box", "#0891b2"],
  ["curbside", "#7c3aed"],
];
