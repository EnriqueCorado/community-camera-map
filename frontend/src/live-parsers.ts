// Pure parsers: public API JSON -> GeoJSON for the browser-live layers.
// No fetching or DOM here (see live-sources.ts), so each is unit-tested.
// Every string is plain text; URLs are re-validated by safeUrl when rendered.

type FC = GeoJSON.FeatureCollection<GeoJSON.Point>;
type Props = Record<string, unknown>;

const fc = (features: FC["features"]): FC => ({ type: "FeatureCollection", features });
const pt = (lon: number, lat: number, properties: Props): FC["features"][number] => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties,
});
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const ok = (lat: number | null, lon: number | null): lat is number =>
  lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** NOAA SWPC planetary K-index feed -> latest Kp (0–9), or null. */
export function latestKp(json: unknown): number | null {
  if (!Array.isArray(json) || !json.length) return null;
  const last = json[json.length - 1] as { kp_index?: unknown; estimated_kp?: unknown };
  return num(last.estimated_kp) ?? num(last.kp_index);
}

/** Rough aurora chance at Modesto's latitude (~37.6°N) for a given Kp. Aurora
 *  is only seen this far south in severe geomagnetic storms (Kp 8–9). */
export function auroraChance(kp: number | null): "none" | "unlikely" | "possible" | null {
  if (kp == null) return null;
  return kp >= 8 ? "possible" : kp >= 6 ? "unlikely" : "none";
}

/** wheretheiss.at satellite JSON -> one point. */
export function parseIss(json: unknown, kp: number | null): FC {
  const j = (json ?? {}) as Props;
  const lat = num(j.latitude), lon = num(j.longitude);
  if (!ok(lat, lon)) return fc([]);
  return fc([
    pt(lon!, lat, {
      name: "ISS",
      kind: "station",
      alt_km: num(j.altitude) != null ? Math.round(num(j.altitude)!) : null,
      speed_kmh: num(j.velocity) != null ? Math.round(num(j.velocity)!) : null,
      sunlit: str(j.visibility) === "daylight",
      kp,
    }),
  ]);
}

const COMPASS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

/** Amtraker v3 `/trains` ({route: Train[]}) -> points. */
export function parseAmtrak(json: unknown): FC {
  if (!json || typeof json !== "object") return fc([]);
  const feats: FC["features"] = [];
  for (const list of Object.values(json as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const t of list as Props[]) {
      const lat = num(t.lat), lon = num(t.lon);
      if (!ok(lat, lon)) continue;
      feats.push(
        pt(lon!, lat, {
          route: str(t.routeName),
          number: str(String(t.trainNum ?? "")),
          from: str(t.origName),
          to: str(t.destName),
          next: str(t.eventName),
          speed_mph: num(t.velocity) != null ? Math.round(num(t.velocity)!) : null,
          heading: COMPASS[str(t.heading)] ?? null,
          status: str(t.trainTimely),
          label: str(String(t.trainNum ?? "")),
        }),
      );
    }
  }
  return fc(feats);
}

/** iNaturalist /v1/observations -> points. Photos only when openly licensed,
 *  with the license-required attribution; observer handles aren't shown
 *  separately. */
export function parseINat(json: unknown): FC {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return fc([]);
  const feats: FC["features"] = [];
  for (const r of results as Props[]) {
    const [lat, lon] = str(r.location).split(",").map((x) => num(x));
    if (!ok(lat ?? null, lon ?? null)) continue;
    const taxon = (r.taxon ?? {}) as Props;
    const photo = (Array.isArray(r.photos) ? r.photos[0] : null) as Props | null;
    const licensed = photo && str(photo.license_code) !== "";
    feats.push(
      pt(lon!, lat!, {
        name: str(taxon.preferred_common_name) || str(taxon.name) || str(r.species_guess),
        scientific: str(taxon.name),
        group: str(taxon.iconic_taxon_name),
        observed: str(r.observed_on),
        photo: licensed ? str(photo!.url).replace("/square.", "/medium.") : "",
        photo_credit: licensed ? str(photo!.attribution) : "",
        page: str(r.uri),
      }),
    );
  }
  return fc(feats);
}

/** MediaWiki geosearch (list=geosearch) -> points linking to the article. */
export function parseWiki(json: unknown, lang: "en" | "es"): FC {
  const list = (json as { query?: { geosearch?: unknown } } | null)?.query?.geosearch;
  if (!Array.isArray(list)) return fc([]);
  const host = lang === "es" ? "es.wikipedia.org" : "en.wikipedia.org";
  return fc(
    (list as Props[])
      .filter((g) => ok(num(g.lat), num(g.lon)) && str(g.title))
      .map((g) =>
        pt(num(g.lon)!, num(g.lat)!, {
          name: str(g.title),
          dist_m: num(g.dist),
          page: `https://${host}/wiki/${encodeURIComponent(str(g.title).replace(/ /g, "_"))}`,
        }),
      ),
  );
}

/** Open-Meteo multi-location `current` response (array, or one object) -> points. */
export function parseOpenMeteo(json: unknown): FC {
  const rows = Array.isArray(json) ? json : json ? [json] : [];
  const feats: FC["features"] = [];
  for (const r of rows as Props[]) {
    const lat = num(r.latitude), lon = num(r.longitude);
    const c = (r.current ?? {}) as Props;
    const temp = num(c.temperature_2m);
    if (!ok(lat, lon) || temp == null) continue;
    feats.push(
      pt(lon!, lat, {
        temp_f: Math.round(temp),
        wind_mph: num(c.wind_speed_10m) != null ? Math.round(num(c.wind_speed_10m)!) : null,
        wind_from: num(c.wind_direction_10m),
        humidity: num(c.relative_humidity_2m),
        label: `${Math.round(temp)}°`,
      }),
    );
  }
  return fc(feats);
}

/** A grid of points covering a bbox [w, s, e, n] (for Open-Meteo). */
export function gridPoints(bbox: [number, number, number, number], n = 5): [number, number][] {
  const [w, s, e, nn] = bbox;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const lon = w + ((e - w) * (j + 0.5)) / n;
      const lat = s + ((nn - s) * (i + 0.5)) / n;
      out.push([Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4]);
    }
  }
  return out;
}

/** Airline-style callsign (ICAO airline code + flight number), e.g. "UAL366".
 *  Tail numbers (N123AB) and other private callsigns don't match, so we
 *  never look up routes for private planes. */
export function isAirlineCallsign(cs: string): boolean {
  const c = cs.trim();
  return /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/.test(c) && !PRIVATE_JET_OPERATORS.has(c.slice(0, 3));
}

/** ICAO codes of fractional/charter private-jet operators, whose passengers
 *  are private individuals: no route lookups for them either. Partial list. */
const PRIVATE_JET_OPERATORS = new Set(["EJA", "LXJ", "EJM", "XOJ", "VJT", "JTL", "TMC"]);

export interface FlightRoute {
  airline: string;
  from: string;
  to: string;
}

/** adsbdb.com /v0/callsign response -> "City (IATA)" origin/destination. */
export function parseRoute(json: unknown): FlightRoute | null {
  const r = (json as { response?: { flightroute?: Props } } | null)?.response?.flightroute;
  if (!r || typeof r !== "object") return null;
  const place = (a: unknown) => {
    const p = (a ?? {}) as Props;
    const city = str(p.municipality) || str(p.name);
    const code = str(p.iata_code) || str(p.icao_code);
    return city ? (code ? `${city} (${code})` : city) : code;
  };
  const from = place(r.origin), to = place(r.destination);
  if (!from || !to) return null;
  return { airline: str(((r.airline ?? {}) as Props).name), from, to };
}

/** EPA AQI category for a US AQI value. */
export function aqiCategory(aqi: number | null): "good" | "moderate" | "usg" | "unhealthy" | "very" | "hazardous" | null {
  if (aqi == null) return null;
  return aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "usg" : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very" : "hazardous";
}

/** Open-Meteo air-quality multi-location `current` response -> points. */
export function parseAirQuality(json: unknown): FC {
  const rows = Array.isArray(json) ? json : json ? [json] : [];
  const feats: FC["features"] = [];
  for (const r of rows as Props[]) {
    const lat = num(r.latitude), lon = num(r.longitude);
    const c = (r.current ?? {}) as Props;
    const aqi = num(c.us_aqi);
    if (!ok(lat, lon) || aqi == null) continue;
    feats.push(
      pt(lon!, lat, {
        aqi: Math.round(aqi),
        category: aqiCategory(aqi),
        pm2_5: num(c.pm2_5) != null ? Math.round(num(c.pm2_5)! * 10) / 10 : null,
        ozone: num(c.ozone) != null ? Math.round(num(c.ozone)!) : null,
        label: String(Math.round(aqi)),
      }),
    );
  }
  return fc(feats);
}
