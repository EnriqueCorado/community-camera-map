import { test, expect } from "@playwright/test";

// Browsers without WebGL 2 (old devices, GPU blocklists, hardened profiles) used
// to get a blank page: the MapLibre constructor threw and took the app down.
// Now the map area explains the problem and the sidebar keeps working.
test("no WebGL 2: shows a fallback message and the sidebar still works", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error narrowing the overloads is not useful in a stub
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type === "webgl2" || type === "webgl") return null;
      // @ts-expect-error forward to the real overloads
      return orig.call(this, type, ...rest);
    };
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "can't draw the map" })).toBeVisible();
  await expect(page.getByPlaceholder(/Filter cameras/)).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("no WebGL 2: fallback message is translated", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto("/#lang=es");
  await expect(page.getByRole("alert").filter({ hasText: "no puede mostrar el mapa" })).toBeVisible();
});
