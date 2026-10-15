import { test, expect } from "@playwright/test";

// Uses the local history copy (frontend/public/data/history), when present.
test("history: scrub to a past day and back to live", async ({ page }) => {
  const ix = await page.request.get("/data/history/index.json");
  test.skip(!ix.ok(), "no local history snapshots");
  const days = Object.keys(((await ix.json()) as { days: Record<string, string[]> }).days).sort();
  test.skip(days.length < 1, "no days");
  await page.goto("/#ov=quakes&v=-120,37,4");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const count = () => page.evaluate(async () => { const s = (window as any).__map.getSource("ov-quakes"); const d = s ? await s.getData() : null; return d?.features?.length ?? -1; });
  const slider = page.getByRole("slider", { name: "Day to show" });
  await expect(slider).toBeVisible();
  await expect(page.locator(".history__label")).toHaveText("Live (today)");
  await slider.fill("0"); // the oldest saved day
  await expect(page.locator(".historybanner")).toContainText("Showing");
  const want = (await (await page.request.get(`/data/history/${days[0]}/quakes.geojson`)).json()).features.length;
  await expect.poll(count, { timeout: 10_000 }).toBe(want);
  await expect(page.locator(".layerrow", { hasText: "Earthquakes" })).toContainText("from");
  await page.locator(".historybanner button").click();
  await expect(page.locator(".historybanner")).toHaveCount(0);
  await expect.poll(count, { timeout: 15_000 }).not.toBe(want);
});
