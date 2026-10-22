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

test("static: loads the camera index (only) from pre-baked data with a clean console", async ({ page }) => {
  const e = errs(page);
  const camFiles: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("data/cameras")) camFiles.push(new URL(r.url()).pathname.replace(/.*data\//, ""));
  });
  const cams = page.waitForResponse((r) => r.url().includes("data/cameras/index.json") && r.status() === 200);
  await page.goto(BASE + "/");
  await cams;
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".sidebar__sub")).toContainText(/public cameras from \d+ agencies/i);
  await page.waitForTimeout(2000);
  expect(real(e), real(e).join("\n")).toEqual([]);
  // The default (Stanislaus) view needs no search rows or camera records yet.
  expect(camFiles).toEqual(["cameras/index.json"]);
});

test("static: search finds an out-of-state camera and opens it", async ({ page }) => {
  await page.goto(BASE + "/");
  await expect(page.locator(".sidebar__sub")).toContainText(/public cameras/i);
  const search = page.waitForResponse((r) => r.url().includes("data/cameras/search.json") && r.status() === 200);
  await page.getByPlaceholder(/Filter cameras/i).fill("illinois");
  await search;
  const first = page.locator(".camlist__item").first();
  await expect(first).toBeVisible();
  const cell = page.waitForResponse((r) => r.url().includes("data/cameras/cells/") && r.status() === 200);
  await first.click();
  await cell;
  await expect(page.locator(".detail")).toBeVisible();
  await expect(page.locator(".detail .detail__note")).toContainText("Illinois DOT");
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

test("static: the layer catalog loads per state (national part first, a state when it's on screen)", async ({ page }) => {
  const files: string[] = [];
  page.on("request", (r) => {
    const m = /data\/(catalog\/[A-Za-z]+\.json|layers\.json)/.exec(r.url());
    if (m) files.push(m[1]!);
  });
  await page.goto(BASE + "/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  // Home view (California): the national part and California only.
  await expect.poll(() => files.slice().sort()).toEqual(["catalog/CA.json", "catalog/base.json"]);
  // A jump made before the map has finished loading is dropped: retry it.
  await expect(async () => {
    await page.getByLabel("Or go to a state").selectOption("TX");
    await expect.poll(() => files, { timeout: 8000 }).toContain("catalog/TX.json");
  }).toPass({ timeout: 30000 });
  await expect(page.getByText(/^This state: .*Texas/)).toBeVisible();
  expect(files).not.toContain("layers.json");
});

test("static: layer search finds a layer in another state; choosing it turns it on and jumps there", async ({ page }) => {
  const files: string[] = [];
  page.on("request", (r) => {
    const m = /data\/(catalog\/[A-Za-z]+\.json)/.exec(r.url());
    if (m) files.push(m[1]!);
  });
  await page.goto(BASE + "/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect.poll(() => files).toContain("catalog/CA.json");
  // The index of every state layer loads only once someone searches.
  expect(files).not.toContain("catalog/index.json");
  const index = page.waitForResponse((r) => r.url().includes("data/catalog/index.json") && r.status() === 200);
  await page.getByLabel("Filter layers by name").fill("burn bans");
  await index;
  const elsewhere = page.getByRole("group", { name: "In other states" });
  const pick = elsewhere.getByRole("button", { name: "County burn bans (Texas), Texas: turn on and go there" });
  await expect(pick).toBeVisible();
  expect(files).not.toContain("catalog/TX.json");
  const box = page.getByRole("checkbox", { name: /County burn bans \(Texas\)/ });
  // A jump made before the map has finished loading is dropped: switch the
  // layer back off (it returns to "In other states") and choose it again.
  await expect(async () => {
    if ((await box.count()) && (await box.isChecked())) await box.uncheck();
    await pick.click();
    await expect(page.getByText(/^This state: .*Texas/)).toBeVisible({ timeout: 8000 });
  }).toPass({ timeout: 30000 });
  expect(files).toContain("catalog/TX.json");
  await expect(box).toBeChecked();
  await expect(box).toBeFocused(); // keyboard focus follows the chosen layer
  await expect(pick).toHaveCount(0); // now listed under "This state"

  // Spanish: the index's Spanish titles, under the Spanish heading.
  await page.getByRole("button", { name: "Ver en español" }).click();
  await page.getByLabel("Filtrar capas por nombre").fill("quemas");
  await expect(
    page
      .getByRole("group", { name: "En otros estados" })
      .getByRole("button", { name: "Prohibiciones de quemas por condado (Arkansas), Arkansas: activar e ir allí" }),
  ).toBeVisible();
});
