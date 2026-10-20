// Unit tests for the community & immigrant services pack popups (no browser).
import { test, expect } from "@playwright/test";
import { mealsOpen, phone, servicePopup, SERVICE_COLORS, SERVICE_LINK_HOSTS } from "../../frontend/src/services-pack";
import { applyFields } from "../../frontend/src/view-logic";
import { safeUrl, WEBCAM_PAGE_HOSTS } from "../../frontend/src/popup-logic";
import type { ViewSpec } from "../../frontend/src/api/client";

const tidy = (s: string) => s;
const row = (rows: [string, string][], label: string) => rows.find(([k]) => k === label)?.[1] ?? "";

test("legal-help popup: Spanish labels, notario warning, official DOJ link", () => {
  const p = servicePopup("immigration-legal-help", { n: "World Relief", o: "Modesto Extension Office", a: "909 14th Street", c: "Modesto", s: "CA", p: "2094912712" }, "es", "es-US", tidy);
  expect(p.title).toBe("World Relief");
  expect(row(p.rows, "Oficina")).toBe("Modesto Extension Office");
  expect(row(p.rows, "Ciudad")).toBe("Modesto, CA");
  expect(row(p.rows, "Teléfono")).toBe("(209) 491-2712");
  expect(row(p.rows, "Nota")).toContain("notario");
  expect(p.link?.href).toMatch(/^https:\/\/www\.justice\.gov\/eoir\//);
  expect(safeUrl(p.link?.href, WEBCAM_PAGE_HOSTS)).not.toBeNull();
});

test("type codes become words; approximate locations are labeled", () => {
  const ice = servicePopup("detention-centers", { n: "Otay Mesa", t: "CDF", fo: "San Diego", pop: 1234 }, "en", "en-US", tidy);
  expect(row(ice.rows, "Type")).toBe("Contract detention facility");
  expect(row(ice.rows, "People held (daily average)")).toBe("1,234");
  expect(ice.link?.href).toBe("https://locator.ice.gov/odls/");
  const ajc = servicePopup("job-centers", { t: "comp", x: 1 }, "en", "en-US", tidy);
  expect(ajc.title).toBe(""); // MapView falls back to the layer title
  expect(row(ajc.rows, "Location")).toContain("Approximate");
  const mh = servicePopup("mental-health", { n: "Clinic", es: 1, sf: 1, t: "both" }, "es", "es-US", tidy);
  expect(row(mh.rows, "Servicios en español")).toBe("Sí");
  expect(row(mh.rows, "También trata")).toBe("Adicciones");
});

test("college links go to College Navigator only for a real IPEDS id", () => {
  expect(servicePopup("colleges", { n: "MJC", u: "117247" }, "en", "en-US", tidy).link?.href).toBe("https://nces.ed.gov/collegenavigator/?id=117247");
  expect(servicePopup("colleges", { n: "X", u: "javascript:alert(1)" }, "en", "en-US", tidy).link).toBeUndefined();
});

test("every pack link host is https-allowlisted and every layer has a color", () => {
  for (const h of SERVICE_LINK_HOSTS) expect(WEBCAM_PAGE_HOSTS).toContain(h);
  expect(SERVICE_LINK_HOSTS.every((h) => /\.(gov|org)$/.test(h))).toBe(true);
  expect(Object.keys(SERVICE_COLORS).length).toBeGreaterThanOrEqual(14);
});

test("phone formatting", () => {
  expect(phone("209-575-4585")).toBe("(209) 575-4585");
  expect(phone("1 800 662 4357")).toBe("(800) 662-4357");
  expect(phone("(209) 555-0100 ext 12")).toBe("(209) 555-0100 ext 12");
});

test("summer meals: closed or future sites are dropped by the view cleanup", () => {
  const day = 86_400_000;
  const now = Date.UTC(2026, 6, 15, 18);
  expect(mealsOpen({ d0: now - 10 * day, d1: Date.UTC(2026, 6, 15) }, now)).toBe(true); // last day
  expect(mealsOpen({ d0: now - 10 * day, d1: now - 2 * day }, now)).toBe(false);
  expect(mealsOpen({ d0: now + day, d1: now + 9 * day }, now)).toBe(false);
  const spec: ViewSpec = {
    kind: "arcgis", url: "https://x.example/FeatureServer/0", fields: { Site_Name: "n", Start_date: "d0", End_date: "d1" },
    geometry: "point", min_zoom: 10, where: "1=1", max: 2000, simplify: false, refresh_s: 3600, post: "meals",
  };
  const pt = { type: "Point", coordinates: [-95.4, 29.7] };
  const fc = applyFields({ features: [
    { type: "Feature", geometry: pt, properties: { Site_Name: "Open", Start_date: Date.now() - day, End_date: Date.now() + 5 * day } },
    { type: "Feature", geometry: pt, properties: { Site_Name: "Ended", Start_date: Date.now() - 90 * day, End_date: Date.now() - 30 * day } },
  ] }, spec);
  expect(fc.features.map((f) => f.properties?.n)).toEqual(["Open"]);
});

test("hand-kept offices link only to their official source page", () => {
  const court = servicePopup("immigration-offices", { n: "Sacramento Immigration Court", t: "court", pg: "https://www.justice.gov/eoir/sacramento-immigration-court" }, "es", "es-US", tidy);
  expect(row(court.rows, "Tipo")).toBe("Corte de inmigración");
  expect(row(court.rows, "Nota")).toContain("1-800-898-7180");
  expect(safeUrl(court.link?.href, WEBCAM_PAGE_HOSTS)).toBe("https://www.justice.gov/eoir/sacramento-immigration-court");
  expect(servicePopup("immigration-offices", { n: "X", t: "ice", pg: "https://evil.example/" }, "en", "en-US", tidy).link).toBeUndefined();
});
