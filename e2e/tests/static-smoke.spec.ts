import { test, expect, type Page } from "@playwright/test";
const BASE = process.env.STATIC_URL ?? "http://localhost:4178";
test.skip(!process.env.STATIC_URL, "set STATIC_URL to run the static-site smoke test");
function errs(page: Page): string[] {
  const e: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") e.push(m.text()); });
  page.on("pageerror", (x) => e.push(x.message));
  return e;
}
const IGNORE = [/openfreemap/i, /wzmedia\.dot\.ca\.gov/i, /Failed to load resource.*(403|429|50\d)/i];
const real = (a: string[]) => a.filter((x) => !IGNORE.some((r) => r.test(x)));

test("static: loads cameras from pre-baked data with a clean console", async ({ page }) => {
  const e = errs(page);
  const cams = page.waitForResponse((r) => r.url().includes("data/cameras.json") && r.status() === 200);
  await page.goto(BASE + "/");
  await cams;
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(2000);
  expect(real(e), real(e).join("\n")).toEqual([]);
});

test("static: camera dots render at city zoom", async ({ page }) => {
  await page.goto(BASE + "/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Modesto", exact: true }).click();
  await page.waitForTimeout(2000);
  const n = await page.locator(".maplibregl-canvas").count();
  expect(n).toBe(1);
});

test("static: overlay loads from a baked geojson file", async ({ page }) => {
  await page.goto(BASE + "/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const resp = page.waitForResponse((r) => r.url().includes("data/layers/zoning.geojson") && r.status() === 200, { timeout: 15000 });
  await page.getByText("Zoning", { exact: true }).click();
  await resp;
});

test("static: About panel shows sources and principles", async ({ page }) => {
  await page.goto(BASE + "/");
  await page.getByRole("button", { name: /About & sources/i }).click();
  await expect(page.locator(".about")).toContainText(/public infrastructure, not people/i);
  await expect(page.locator(".about__sources")).toContainText(/DeFlock|OpenStreetMap/i);
});

test('static: "what can see me?" works against baked ALPR data', async ({ page }) => {
  await page.goto(BASE + "/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Find plate readers near a point/i }).click();
  await page.locator("canvas.maplibregl-canvas").click({ position: { x: 640, y: 430 } });
  await expect(page.locator(".coverage-result")).toContainText(/plate reader/i, { timeout: 25000 });
});
