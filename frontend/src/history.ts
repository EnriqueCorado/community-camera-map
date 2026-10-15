// Layers with daily snapshots (backend/scripts/snapshot_history.py writes
// them to the `history` branch; each build copies them to data/history/).
export const HISTORY_LAYERS = new Set([
  "quakes",
  "wildfire",
  "wildfire-perimeters",
  "fire-hotspots",
  "smoke-haze",
  "power-outages",
  "weather-alerts",
]);
