// Unit tests for the Cloudflare flights relay's transform (no browser).
// Mirrors backend/tests/test_live_layers.py flight tests: the two must agree.
import { test, expect } from "@playwright/test";
import { adsbFlights } from "../../relay/src/flights";

test("keeps flight data, drops owner/registration, excludes opted-out aircraft", () => {
  const base = { lat: 37.6, lon: -121.0, alt_baro: 3000 };
  const fc = adsbFlights({
    now: 1792070818.002,
    aircraft: [
      { ...base, flight: "N669TW  ", r: "N669TW", ownOp: "SOME OWNER LLC", desc: "CESSNA 172", gs: 120.3, track: 248.55 },
      { ...base, flight: "N304KC", dbFlags: 8 }, // LADD
      { ...base, flight: "PRIV1", dbFlags: 4 }, // PIA
      { ...base, flight: "RCH123", dbFlags: 1 }, // military: broadcast publicly, kept
      { flight: "SWA123", alt_baro: "ground", gs: 5, lat: 37.62, lon: -120.95 },
      { flight: "NOPOS", alt_baro: 1000 },
      "junk",
    ],
  });
  expect(fc.generated_at).toBe(1792070818.002);
  expect(fc.features.map((f) => f.properties.callsign)).toEqual(["N669TW", "RCH123", "SWA123"]);
  expect(fc.features[0]!.properties).toEqual({
    callsign: "N669TW", type: "CESSNA 172", alt_ft: 3000, on_ground: false, speed_kt: 120, track: 249,
  });
  expect(JSON.stringify(fc)).not.toMatch(/OWNER|ownOp|"r"/);
  expect(fc.features[2]!.properties).toMatchObject({ on_ground: true, alt_ft: 0 });
});

test("missing values stay missing; garbage input is safe", () => {
  const p = adsbFlights({ aircraft: [{ lat: 37.6, lon: -121 }] }).features[0]!.properties;
  expect(p).toMatchObject({ alt_ft: null, speed_kt: null, track: null });
  expect(adsbFlights(null)).toEqual({ type: "FeatureCollection", features: [] });
  expect(adsbFlights({ aircraft: [{ lat: 999, lon: 0 }] }).features).toEqual([]);
});

test("handles the `ac` + millisecond format of adsb.lol / airplanes.live", () => {
  const fc = adsbFlights({ now: 1792070818002, ac: [
    { flight: "UAL366", lat: 37.6, lon: -121, alt_baro: 30000, gs: 450, track: 90 },
    { flight: "N304KC", lat: 37.6, lon: -121, dbFlags: 8 },
  ] });
  expect(fc.generated_at).toBeCloseTo(1792070818.002, 3);
  expect(fc.features.map((f) => f.properties.callsign)).toEqual(["UAL366"]);
});
