// Forecast highs for "Heat at work today", from Open-Meteo (free, no key,
// CORS open; CC BY 4.0, so the UI shows "Weather data by Open-Meteo.com").
// PRIVACY: the only thing sent is the fixed city-center point of a city the
// visitor picks from this list, never their own location or anything typed.
import { parseDailyForecast, todayInCalifornia, type DailyForecast } from "./heat";

export interface HeatCity {
  id: string;
  name: string;
  /** City center, rounded to 2 decimals (about 1 km). */
  lat: number;
  lon: number;
}

export const HEAT_CITIES: readonly HeatCity[] = [
  { id: "modesto", name: "Modesto", lat: 37.64, lon: -121.0 },
  { id: "turlock", name: "Turlock", lat: 37.49, lon: -120.85 },
  { id: "ceres", name: "Ceres", lat: 37.59, lon: -120.96 },
  { id: "oakdale", name: "Oakdale", lat: 37.77, lon: -120.85 },
  { id: "riverbank", name: "Riverbank", lat: 37.74, lon: -120.94 },
  { id: "patterson", name: "Patterson", lat: 37.47, lon: -121.13 },
  { id: "newman", name: "Newman", lat: 37.31, lon: -121.02 },
  { id: "waterford", name: "Waterford", lat: 37.64, lon: -120.76 },
  { id: "hughson", name: "Hughson", lat: 37.6, lon: -120.87 },
  { id: "salida", name: "Salida", lat: 37.71, lon: -121.08 },
];

export const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

/** Daily highs in °F for the past 5 days (for the heat-wave check), today and tomorrow. */
export function forecastUrl(city: HeatCity): string {
  const p = new URLSearchParams({
    latitude: city.lat.toFixed(2),
    longitude: city.lon.toFixed(2),
    daily: "temperature_2m_max",
    temperature_unit: "fahrenheit",
    timezone: "America/Los_Angeles",
    past_days: "5",
    forecast_days: "2",
  });
  return `${OPEN_METEO}?${p}`;
}

// One request per city for the life of the page (the free tier asks for
// light use, and the high doesn't change much within a visit).
const cache = new Map<string, Promise<DailyForecast>>();

/** Forecast for one of HEAT_CITIES. Rejects on network/HTTP/parse errors;
 *  a failed request is dropped from the cache so the visitor can retry. */
export function getForecast(cityId: string): Promise<DailyForecast> {
  const city = HEAT_CITIES.find((c) => c.id === cityId);
  if (!city) return Promise.reject(new Error("unknown city"));
  const hit = cache.get(city.id);
  if (hit) return hit;
  const p = fetch(forecastUrl(city), { credentials: "omit", referrerPolicy: "no-referrer" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then((json) => {
      const f = parseDailyForecast(json, todayInCalifornia());
      if (!f || f.todayHigh == null) throw new Error("bad forecast");
      return f;
    });
  cache.set(city.id, p);
  p.catch(() => cache.delete(city.id));
  return p;
}
