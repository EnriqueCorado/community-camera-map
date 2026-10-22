// End-to-end: the anonymous usage counter in a build that has one. Build and
// preview with a counter URL that can't resolve (the tests answer for it):
//   (frontend) VITE_STATIC=1 VITE_BASE=/community-camera-map/ VITE_COUNTER_URL=https://counter.invalid/api/count npm run build
//   BASE_URL=http://localhost:4173/community-camera-map/ npx playwright test help-counter
// Without a counter (the normal build) these tests skip; help-pages.spec.ts
// then checks the pages make no requests at all.
import { test, expect, type Page, type Request } from "@playwright/test";

const COUNTER = "https://counter.invalid/api/count";

/** Answer for the counter and record what the browser sent it. */
async function record(page: Page): Promise<Request[]> {
  const sent: Request[] = [];
  await page.route(`${COUNTER}**`, (route) => {
    sent.push(route.request());
    return route.fulfill({ status: 204 });
  });
  return sent;
}

test.beforeEach(async ({ page }) => {
  const html = await (await page.request.get("help/")).text();
  test.skip(!html.includes(`data-counter="${COUNTER}"`), `needs a build with VITE_COUNTER_URL=${COUNTER}`);
});

test("a public page sends one count: the event in the body, from the real origin, no cookies or referrer", async ({ page, context }) => {
  // A cookie for the counter's host must never be sent (credentials: omit).
  await context.addCookies([{ name: "id", value: "SECRET", domain: "counter.invalid", path: "/", secure: true }]);
  const sent = await record(page);
  await page.goto("ayuda/aviso-de-desalojo/");
  await expect.poll(() => sent.length).toBe(1);
  const r = sent[0]!;
  expect(r.method()).toBe("POST");
  // The URL is the same for every page (logs keep URLs); the event is the body.
  expect(r.url()).toBe(COUNTER);
  expect(r.postData()).toBe("page:eviction:es");
  const headers = await r.allHeaders();
  expect(headers.origin).toBe(new URL(page.url()).origin);
  expect(headers.cookie).toBeUndefined();
  expect(headers.referer).toBeUndefined();
  // The page's CSP lets it reach the counter's origin and nothing else.
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("connect-src https://counter.invalid;");
  expect(csp).toContain("default-src 'none'");
  await expect(page.locator(".foot")).toContainText("Contamos cuántas veces se abre cada página");
  await page.goto("help/");
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]!.url()).toBe(COUNTER);
  expect(sent[1]!.postData()).toBe("page:home:en");
});

test("flyers aren't counted (they're made for paper)", async ({ page }) => {
  const sent = await record(page);
  await page.goto("help/flyers/general/");
  await page.waitForLoadState("networkidle");
  expect(sent).toEqual([]);
});

test("Global Privacy Control and Do Not Track: nothing is sent", async ({ page }) => {
  const sent = await record(page);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true }));
  await page.goto("help/rent-increase/");
  await page.goto("./#help=rent&hv=eviction");
  await expect(page.getByRole("dialog", { name: "Free help" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(sent).toEqual([]);
});

test("Do Not Track: nothing is sent", async ({ page }) => {
  const sent = await record(page);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1" }));
  await page.goto("help/");
  await page.goto("./#help=medical");
  await expect(page.getByRole("dialog", { name: "Free help" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(sent).toEqual([]);
});

test("the map app counts each Help tool once per page load, and never what's typed", async ({ page }) => {
  const sent = await record(page);
  await page.goto("./#help=rent&hv=eviction");
  const dialog = page.getByRole("dialog", { name: "Free help" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => sent.map((r) => [r.url(), r.postData()])).toEqual([[COUNTER, "app:rent/eviction:en"]]);
  await expect(dialog).toContainText("We count how many times each tool is opened");
  await dialog.getByRole("button", { name: /rent increase legal/i }).click();
  await dialog.getByRole("button", { name: /eviction notice/i }).click();
  await dialog.getByRole("tab", { name: "Work" }).click();
  await expect
    .poll(() => sent.map((r) => r.postData()))
    .toEqual(["app:rent/eviction:en", "app:rent/rent:en", "app:work/wages:en"]);
  const typed = "95354";
  await dialog.getByRole("tab", { name: "Renters" }).click();
  await dialog.getByRole("button", { name: /rent increase legal/i }).click();
  const box = dialog.getByRole("textbox").first();
  if (await box.count()) await box.fill(typed);
  await page.waitForTimeout(300);
  expect(sent).toHaveLength(3); // already counted: nothing new
  for (const r of sent) {
    expect(r.url()).toBe(COUNTER);
    expect(r.postData() ?? "").not.toContain(typed);
    expect((await r.allHeaders()).referer).toBeUndefined();
  }
});
