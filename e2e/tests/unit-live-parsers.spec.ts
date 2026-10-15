// Unit tests for the browser-live parsers and satellite propagation (no browser).
import { test, expect } from "@playwright/test";
import {
  aqiCategory,
  auroraChance,
  parseAirQuality,
  gridPoints,
  isAirlineCallsign,
  latestKp,
  parseAmtrak,
  parseINat,
  parseIss,
  parseOpenMeteo,
  parseRoute,
  parseWiki,
} from "../../frontend/src/live-parsers";
import { parseCelestrak, satellitePositions } from "../../frontend/src/satellites";

const props = (fc: GeoJSON.FeatureCollection, i = 0) => fc.features[i]!.properties as Record<string, unknown>;

test("space weather: latest Kp and aurora chance at Modesto's latitude", () => {
  expect(latestKp([{ kp_index: 2 }, { kp_index: 3, estimated_kp: 3.33 }])).toBe(3.33);
  expect(latestKp([])).toBeNull();
  expect(latestKp("nope")).toBeNull();
  expect(auroraChance(3)).toBe("none");
  expect(auroraChance(6.3)).toBe("unlikely");
  expect(auroraChance(8.7)).toBe("possible");
  expect(auroraChance(null)).toBeNull();
});

test("ISS position", () => {
  const fc = parseIss({ latitude: 12.5, longitude: -80.25, altitude: 418.3, velocity: 27600, visibility: "eclipsed" }, 2.7);
  expect(fc.features[0]!.geometry.coordinates).toEqual([-80.25, 12.5]);
  expect(props(fc)).toMatchObject({ name: "ISS", alt_km: 418, sunlit: false, kp: 2.7 });
  expect(parseIss({ latitude: 999, longitude: 0 }, null).features).toEqual([]);
  expect(parseIss(null, null).features).toEqual([]);
});

test("Amtrak trains", () => {
  const fc = parseAmtrak({
    "San Joaquins": [
      { routeName: "San Joaquins", trainNum: 715, lat: 37.64, lon: -120.99, velocity: 49.6, heading: "NW",
        origName: "Bakersfield", destName: "Oakland", eventName: "Modesto", trainTimely: "On Time" },
      { routeName: "Broken", lat: null, lon: 1 },
    ],
    junk: "x",
  });
  expect(fc.features).toHaveLength(1);
  expect(props(fc)).toMatchObject({ route: "San Joaquins", number: "715", speed_mph: 50, heading: 315, next: "Modesto", label: "715" });
  expect(parseAmtrak(null).features).toEqual([]);
});

test("iNaturalist: photos only when openly licensed, with the license credit", () => {
  const base = { location: "37.6,-121.0", observed_on: "2026-10-01", uri: "https://www.inaturalist.org/observations/1",
    taxon: { preferred_common_name: "Western Fence Lizard", name: "Sceloporus occidentalis" } };
  const fc = parseINat({ results: [
    { ...base, photos: [{ url: "https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg", license_code: "cc-by-nc", attribution: "(c) someone, some rights reserved (CC BY-NC)" }] },
    { ...base, photos: [{ url: "https://static.inaturalist.org/photos/2/square.jpg", license_code: null, attribution: "(c) someone, all rights reserved" }] },
    { ...base, location: "" },
  ] });
  expect(fc.features).toHaveLength(2);
  expect(props(fc, 0)).toMatchObject({ name: "Western Fence Lizard", photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg",
    photo_credit: "(c) someone, some rights reserved (CC BY-NC)" });
  expect(props(fc, 1)).toMatchObject({ photo: "", photo_credit: "" }); // all rights reserved: no photo
});

test("Wikipedia geosearch builds article links in the right language", () => {
  const json = { query: { geosearch: [{ title: "Gallo Center for the Arts", lat: 37.64, lon: -120.99, dist: 120.5 }, { title: "", lat: 1, lon: 1 }] } };
  expect(props(parseWiki(json, "en"))).toMatchObject({ name: "Gallo Center for the Arts", page: "https://en.wikipedia.org/wiki/Gallo_Center_for_the_Arts" });
  expect(props(parseWiki(json, "es")).page).toBe("https://es.wikipedia.org/wiki/Gallo_Center_for_the_Arts");
  expect(parseWiki(json, "en").features).toHaveLength(1);
});

test("Open-Meteo grid + parsing", () => {
  const pts = gridPoints([-121, 37, -120, 38], 2);
  expect(pts).toEqual([[37.25, -120.75], [37.25, -120.25], [37.75, -120.75], [37.75, -120.25]]);
  const one = { latitude: 37.6, longitude: -121, current: { temperature_2m: 78.4, wind_speed_10m: 3.2, wind_direction_10m: 315, relative_humidity_2m: 22 } };
  expect(props(parseOpenMeteo([one]))).toMatchObject({ temp_f: 78, wind_mph: 3, label: "78°", humidity: 22 });
  expect(parseOpenMeteo(one).features).toHaveLength(1); // single-location responses are an object
  expect(parseOpenMeteo([{ latitude: 1, longitude: 1, current: {} }]).features).toEqual([]);
});

test("routes are only looked up for airline callsigns, never tail numbers", () => {
  for (const cs of ["UAL366", "SWA1234", "AAL1A", " DAL45 "]) expect(isAirlineCallsign(cs), cs).toBe(true);
  for (const cs of ["N669TW", "N12345", "CGABC", "", "UAL", "ABCD123"]) expect(isAirlineCallsign(cs), cs).toBe(false);
  // Fractional/charter private-jet operators carry private passengers: excluded too.
  for (const cs of ["EJA123", "LXJ456", "VJT12"]) expect(isAirlineCallsign(cs), cs).toBe(false);
});

test("adsbdb route parsing", () => {
  const json = { response: { flightroute: { airline: { name: "United Airlines" },
    origin: { municipality: "Denver", iata_code: "DEN" }, destination: { municipality: "Austin", iata_code: "AUS" } } } };
  expect(parseRoute(json)).toEqual({ airline: "United Airlines", from: "Denver (DEN)", to: "Austin (AUS)" });
  expect(parseRoute({ response: "unknown callsign" })).toBeNull();
  expect(parseRoute(null)).toBeNull();
});

test("satellites: SGP4 puts the ISS at a sane altitude and speed", () => {
  const sats = parseCelestrak([{"OBJECT_NAME": "ISS (ZARYA)", "OBJECT_ID": "1998-067A", "EPOCH": "2026-10-13T19:43:22.113408", "MEAN_MOTION": 15.48855783, "ECCENTRICITY": 0.00067109, "INCLINATION": 51.6325, "RA_OF_ASC_NODE": 73.0089, "ARG_OF_PERICENTER": 259.3258, "MEAN_ANOMALY": 100.6975, "EPHEMERIS_TYPE": 0, "CLASSIFICATION_TYPE": "U", "NORAD_CAT_ID": 25544, "ELEMENT_SET_NO": 999, "REV_AT_EPOCH": 59014, "BSTAR": 0.00012830727, "MEAN_MOTION_DOT": 6.592e-05, "MEAN_MOTION_DDOT": 0}, { OBJECT_NAME: "BROKEN" }]);
  expect(sats.map((s) => s.name)).toEqual(["ISS (ZARYA)"]);
  const fc = satellitePositions(sats, new Date("2026-10-14T00:00:00Z"));
  const p = props(fc);
  expect(p.alt_km as number).toBeGreaterThan(380);
  expect(p.alt_km as number).toBeLessThan(450);
  expect(p.speed_kmh as number).toBeGreaterThan(27000);
  expect(p.speed_kmh as number).toBeLessThan(28500);
  const [lon, lat] = fc.features[0]!.geometry.coordinates as number[];
  expect(Math.abs(lat!)).toBeLessThanOrEqual(52); // ISS inclination is 51.6°
  expect(Math.abs(lon!)).toBeLessThanOrEqual(180);
});

test("air quality: EPA categories at their boundaries, and grid parsing", () => {
  expect([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(aqiCategory)).toEqual([
    "good", "good", "moderate", "moderate", "usg", "usg", "unhealthy", "unhealthy", "very", "very", "hazardous",
  ]);
  expect(aqiCategory(null)).toBeNull();
  const fc = parseAirQuality([{ latitude: 37.6, longitude: -121, current: { us_aqi: 57.4, pm2_5: 12.34, ozone: 61.7 } },
    { latitude: 37.7, longitude: -121, current: {} }]);
  expect(fc.features).toHaveLength(1);
  expect(fc.features[0]!.properties).toMatchObject({ aqi: 57, category: "moderate", pm2_5: 12.3, ozone: 62, label: "57" });
});

import { parseAvailtecVehicles } from "../../frontend/src/live-parsers";
test("StanRTA vehicles: route, heading, mph; junk skipped", () => {
  const fc = parseAvailtecVehicles({ Entities: [
    { Id: "944", Vehicle: { Trip: { RouteId: "47" }, Vehicle: { Id: "944", Label: "20944" }, Position: { Latitude: 37.60921, Longitude: -120.967026, Bearing: 90, Speed: 10 }, Timestamp: 1792103573 } },
    { Id: "x", Vehicle: { Position: { Latitude: 0, Longitude: 0 } } },
    { Id: "y", Vehicle: null, TripUpdate: {} },
    "junk",
  ] });
  expect(fc.features).toHaveLength(1);
  expect(fc.features[0]!.properties).toMatchObject({ route: "47", vehicle: "20944", track: 90, speed_mph: 22, updated: 1792103573000 });
  expect(() => parseAvailtecVehicles(null)).toThrow(); // format change: loud, not empty
  expect(parseAvailtecVehicles({ Entities: [] }).features).toEqual([]); // night: no buses
});
