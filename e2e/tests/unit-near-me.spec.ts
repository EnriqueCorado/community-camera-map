// Unit tests for "What's near an address?" helpers (no browser).
import { test, expect } from "@playwright/test";
import { distanceM, featureAt, floodRisk, formatDistance, inPolygon, JOB_TIMEOUT_MS, nearest, withTimeout } from "../../frontend/src/near-me-logic";

const square = { type: "Polygon" as const, coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };

test("distance: Modesto City Hall to the Veterans Center is ~7.6 km", () => {
  const d = distanceM([-121.0003, 37.6411], [-121.0544, 37.7036]);
  expect(d).toBeGreaterThan(8000);
  expect(d).toBeLessThan(8600);
  expect(distanceM([0, 0], [0, 0])).toBe(0);
});

test("inPolygon respects holes; MultiPolygon; featureAt", () => {
  expect(inPolygon([1, 1], square)).toBe(true);
  expect(inPolygon([5, 5], square)).toBe(false); // in the hole
  expect(inPolygon([11, 5], square)).toBe(false);
  expect(inPolygon([21, 21], { type: "MultiPolygon", coordinates: [square.coordinates, [[[20, 20], [22, 20], [22, 22], [20, 20]]]] })).toBe(true);
  const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [{ type: "Feature", geometry: square, properties: { district: "D1" } }] };
  expect(featureAt(fc, [1, 1])).toEqual({ district: "D1" });
  expect(featureAt(fc, [50, 50])).toBeNull();
});

test("nearest picks the closest kept point", () => {
  const pt = (x: number, kind: string) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [x, 0] }, properties: { kind } });
  const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [pt(3, "a"), pt(1, "b"), pt(2, "a")] };
  expect(nearest(fc, [0, 0])!.props.kind).toBe("b");
  expect(nearest(fc, [0, 0], (p) => p.kind === "a")!.props).toEqual({ kind: "a" });
  expect(nearest(null, [0, 0])).toBeNull();
});

test("flood risk from FEMA zones", () => {
  expect(floodRisk("AE", "", "T")).toBe("high");
  expect(floodRisk("VE", "", "")).toBe("high");
  expect(floodRisk("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", "F")).toBe("moderate");
  expect(floodRisk("X", "AREA OF MINIMAL FLOOD HAZARD", "F")).toBe("minimal");
  expect(floodRisk("D", "", "F")).toBe("unknown");
  expect(floodRisk("AREA NOT INCLUDED", "", "F")).toBeNull(); // starts with "A" but isn't a flood zone
  expect(floodRisk("OPEN WATER", "", "F")).toBeNull();
  for (const z of ["AO", "AH", "A99", "AR", "A1", "V30"]) expect(floodRisk(z, "", "F"), z).toBe("high");
  expect(floodRisk("X", "AREA WITH REDUCED FLOOD RISK DUE TO LEVEE", "F")).toBe("moderate");
  expect(floodRisk("X", "1 PCT DEPTH LESS THAN 1 FOOT", "F")).toBe("moderate");
});

test("distances read naturally in each locale", () => {
  expect(formatDistance(100, "en-US")).toBe("330 ft");
  expect(formatDistance(3218.7, "en-US")).toBe("2 mi");
  expect(formatDistance(2500, "es-ES")).toBe("2,5 km");
  expect(formatDistance(2500, "es-US")).toBe("1.6 mi"); // the app's Spanish locale: US units
});

test("report questions time out instead of holding the whole report", async () => {
  expect(JOB_TIMEOUT_MS).toBeGreaterThan(5_000);
  expect(await withTimeout(Promise.resolve("fast"), 50)).toBe("fast");
  expect(await withTimeout(new Promise((r) => setTimeout(() => r("slow"), 200)), 20)).toBeNull();
  await expect(withTimeout(Promise.reject(new Error("x")), 50)).rejects.toThrow("x"); // failures still fail
});
