// Layout: the map is fixed; only the sidebar (and lists inside it) scroll.
import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".sidebar")).toBeAttached(); // may be minimized
}

const pageScroll = (page: Page) =>
  page.evaluate(() => ({ y: window.scrollY, docY: document.scrollingElement?.scrollTop ?? 0 }));
const mapTop = (page: Page) =>
  page.locator("canvas.maplibregl-canvas").evaluate((c) => c.getBoundingClientRect().top);
const sidebarScroll = (page: Page) => page.locator(".sidebar").evaluate((el) => el.scrollTop);

test("scrolling the sidebar scrolls only the sidebar; the map and header stay put", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const top0 = await mapTop(page);

  await page.locator(".sidebar").hover();
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 400);
  await expect.poll(() => sidebarScroll(page)).toBeGreaterThan(300);

  expect(await pageScroll(page)).toEqual({ y: 0, docY: 0 });
  expect(await mapTop(page)).toBe(top0);
  // The sticky header (title + language + About) is still on screen.
  await expect(page.getByRole("button", { name: "About & sources" })).toBeInViewport();

  // Overscrolling past the end doesn't chain to the page either.
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 800);
  expect(await pageScroll(page)).toEqual({ y: 0, docY: 0 });
  expect(await mapTop(page)).toBe(top0);
});

test("the map can't be dragged off screen by scrolling over it", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const top0 = await mapTop(page);
  await page.locator("canvas.maplibregl-canvas").hover();
  await page.mouse.wheel(0, 600); // zooms the map; must not scroll the page
  expect(await pageScroll(page)).toEqual({ y: 0, docY: 0 });
  expect(await mapTop(page)).toBe(top0);
});

test("the camera list gets a usable height of its own", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByPlaceholder(/Filter cameras/i).fill("SR-99");
  const list = page.locator(".camlist");
  const box = await list.boundingBox();
  expect(box!.height).toBeGreaterThan(200);
  // It scrolls internally (many results) rather than stretching the sidebar.
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test("sections collapse with a keyboard-accessible toggle and stay collapsed", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const toggle = page.getByRole("button", { name: "Layers" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const layerToggle = page.getByText("Traffic cameras", { exact: true });
  await expect(layerToggle).toBeVisible();

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(layerToggle).toBeHidden();

  await page.reload();
  await ready(page);
  await expect(page.getByRole("button", { name: "Layers" })).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.getByText("Traffic cameras", { exact: true })).toBeVisible();
  // Collapsing only hid the controls; the layer itself was never switched off.
  await expect(
    page.getByText("Traffic cameras", { exact: true }).locator("xpath=preceding-sibling::input[1]"),
  ).toBeChecked();
});

test("collapsing 'What can see me?' also ends that mode", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const start = page.getByRole("button", { name: "Find plate readers near a point" });
  await start.click();
  await expect(page.getByRole("button", { name: "Click the map to drop a pin" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "What can see me?" }).click();
  await page.getByRole("button", { name: "What can see me?" }).click(); // reopen
  await expect(start).toHaveAttribute("aria-pressed", "false");
});

test.describe("short window", () => {
  test.use({ viewport: { width: 900, height: 380 } });

  test("the camera viewer fits the stage and scrolls instead of being clipped", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByPlaceholder(/Filter cameras/i).fill("Briggsmore");
    await page.locator(".camlist__item").first().click();
    const detail = page.locator(".detail");
    await expect(detail).toBeVisible();
    const bottom = await detail.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThanOrEqual(380);
    // Its last line is reachable by scrolling the drawer.
    await detail.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(detail.locator("> *").last()).toBeInViewport();
  });
});

test("still works when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.getByRole("button", { name: "Layers" })).toHaveAttribute("aria-expanded", "false");
  expect(errors).toEqual([]);
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("map stays on top and fixed; the sidebar half scrolls", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const top0 = await mapTop(page);
    await page.locator(".sidebar").hover();
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 400);
    await expect.poll(() => sidebarScroll(page)).toBeGreaterThan(300);
    expect(await pageScroll(page)).toEqual({ y: 0, docY: 0 });
    expect(await mapTop(page)).toBe(top0);
    // No horizontal page scroll at phone width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test("Shift+Tab never leaves the focused control under the sticky header", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const input = (label: string) =>
    page.getByText(label, { exact: true }).locator("xpath=preceding-sibling::input[1]");
  // Scroll so "License plate readers" sits just below the header, which puts
  // "Traffic cameras" (the control before it) underneath the header.
  await input("License plate readers").evaluate((el) => {
    const sb = document.querySelector(".sidebar") as HTMLElement;
    const head = document.querySelector(".sidebar__head") as HTMLElement;
    sb.scrollTop += el.getBoundingClientRect().top - head.getBoundingClientRect().bottom - 4;
    (el as HTMLElement).focus({ preventScroll: true });
  });
  await page.keyboard.press("Shift+Tab");
  await expect(input("Traffic cameras")).toBeFocused();
  const [focusTop, headBottom] = await Promise.all([
    input("Traffic cameras").evaluate((el) => el.getBoundingClientRect().top),
    page.locator(".sidebar__head").evaluate((el) => el.getBoundingClientRect().bottom),
  ]);
  expect(focusTop).toBeGreaterThanOrEqual(headBottom);
});

test("the left panel can be minimized and brought back, and remembers", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const mapWidth = () => page.locator("canvas.maplibregl-canvas").evaluate((c) => c.getBoundingClientRect().width);
  const narrow = await mapWidth();

  await page.getByRole("button", { name: "Hide panel" }).click();
  await expect(page.locator("#sidebar")).toBeHidden();
  const show = page.getByRole("button", { name: "Layers & search" });
  await expect(show).toBeFocused(); // keyboard users land on the way back
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await expect.poll(mapWidth).toBeGreaterThan(narrow + 200); // map takes the space

  await page.reload();
  await ready(page);
  await expect(page.locator("#sidebar")).toBeHidden();

  await page.getByRole("button", { name: "Layers & search" }).click();
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide panel" })).toBeFocused();
  await expect.poll(mapWidth).toBeLessThan(narrow + 5);
});

test("the skip link reopens a minimized panel and lands in search", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Hide panel" }).click();
  await page.locator(".skip-link").focus(); // first element in tab order
  await page.keyboard.press("Enter");
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.locator("#camera-search")).toBeFocused();
});

test.describe("phone, panel minimized", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the map fills the whole screen", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "Hide panel" }).click();
    await expect
      .poll(() => page.locator("canvas.maplibregl-canvas").evaluate((c) => c.getBoundingClientRect().height))
      .toBeGreaterThan(800);
  });
});
