// Unit tests for nationwide OpenStreetMap place layers (no browser).
import { test, expect } from "@playwright/test";
import { osmPoints, overpassQuery, selectorMatcher } from "../../frontend/src/osm-logic";

test("selector twins match the same tags Overpass does", () => {
  const clinic = selectorMatcher('["amenity"="clinic"]')!;
  expect(clinic({ amenity: "clinic" })).toBe(true);
  expect(clinic({ amenity: "hospital" })).toBe(false);
  const wifi = selectorMatcher('["internet_access"~"^(wlan|yes)$"]["internet_access:fee"="no"]')!;
  expect(wifi({ internet_access: "wlan", "internet_access:fee": "no" })).toBe(true);
  expect(wifi({ internet_access: "wlan", "internet_access:fee": "yes" })).toBe(false);
  expect(wifi({ internet_access: "wired", "internet_access:fee": "no" })).toBe(false);
  expect(selectorMatcher('["amenity"="clinic"](around:5,1,2)')).toBeNull(); // not a plain filter list
  expect(selectorMatcher("")).toBeNull();
});

test("one union query; points kept inside the view and capped", () => {
  const q = overpassQuery(['["amenity"="clinic"]', '["amenity"="library"]'], [-88, 41.8, -87.6, 42]);
  expect(q).toContain('nwr["amenity"="clinic"](41.8,-88,42,-87.6);nwr["amenity"="library"](41.8,-88,42,-87.6);');
  expect(q).toMatch(/^\[out:json\]\[timeout:25\];\(.*\);out center tags 3000;$/);
  const els = [
    { type: "node", id: 1, lat: 41.9, lon: -87.7, tags: { amenity: "clinic", name: "A", "socket:type2": "2" } },
    { type: "way", id: 2, center: { lat: 41.9, lon: -87.7 }, tags: { amenity: "clinic" } },
    { type: "node", id: 3, lat: 45, lon: -87.7, tags: { amenity: "clinic" } }, // outside the view
    { type: "node", id: 4, lat: 41.9, lon: -87.7, tags: { amenity: "library" } }, // other layer
  ];
  const fc = osmPoints(els, (t) => t.amenity === "clinic", [-88, 41.8, -87.6, 42]);
  expect(fc.features.map((f) => f.properties!.page)).toEqual(["https://www.openstreetmap.org/node/1", "https://www.openstreetmap.org/way/2"]);
  expect(fc.features[0]!.properties).toMatchObject({ name: "A", sockets: "type2" });
  expect(osmPoints(els, () => true, [-88, 41.8, -87.6, 42], 1).features).toHaveLength(1);
  expect(osmPoints("junk", () => true, [-88, 41.8, -87.6, 42]).features).toEqual([]);
});
