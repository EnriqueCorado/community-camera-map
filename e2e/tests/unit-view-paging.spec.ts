// Paged ArcGIS view loading: page 1 shows at once, the rest load in parallel,
// a failed later page keeps what arrived, and results stop at the cap.
import { test, expect } from "@playwright/test";
import { loadPages } from "../../frontend/src/view-logic";
import type { ViewSpec } from "../../frontend/src/api/client";

const URL0 = "https://services.arcgis.com/x/arcgis/rest/services/T/FeatureServer/2";
const spec = (max: number): ViewSpec =>
  ({ kind: "arcgis", url: URL0, fields: { ID: "id" }, geometry: "point", min_zoom: 9, where: "1=1", max, simplify: false, refresh_s: 1800 });
const page = (start: number, n: number, more: boolean) => ({
  type: "FeatureCollection",
  features: Array.from({ length: n }, (_, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { ID: start + i } })),
  ...(more ? { properties: { exceededTransferLimit: true } } : {}),
});

test("pages: partial first, parallel rest, failures tolerated, capped", async () => {
  const offsets: number[] = [];
  const fetchJson = async (url: string) => {
    const off = Number(new URL(url).searchParams.get("resultOffset") ?? 0);
    offsets.push(off);
    if (off === 2000) throw new Error("500"); // one later page fails
    return page(off, 1000, true);
  };
  const signal = new AbortController().signal;
  const partials: number[] = [];
  const fc = await loadPages(spec(3500), [-96, 29, -95, 30], 10, { signal, fetchJson, partial: (d) => partials.push(d.features.length) });
  expect(partials).toEqual([1000]); // page 1 drawn before the rest
  expect(offsets.sort((a, b) => a - b)).toEqual([0, 1000, 2000, 3000]); // ceil(2500/1000) = 3 more, in parallel
  expect(fc.features.length).toBe(3000); // the 2000 page failed; 0, 1000, 3000 kept
  const capped = await loadPages(spec(1500), [-96, 29, -95, 30], 10, { signal, fetchJson });
  expect(capped.features.length).toBe(1500); // trimmed to the cap
  // a single page (no exceededTransferLimit): no partial, no more requests
  const one: number[] = [];
  const single = await loadPages(spec(3500), [-96, 29, -95, 30], 10, {
    signal, fetchJson: async () => page(0, 10, false), partial: (d) => one.push(d.features.length),
  });
  expect(single.features.length).toBe(10);
  expect(one).toEqual([]);
});
