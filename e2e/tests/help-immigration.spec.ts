// End-to-end: the Immigration tab (Know your rights; citizenship test practice)
// in a real browser — content, links, the practice test's stop rule, Spanish,
// accessibility (light and dark), a 320px phone, and nothing sent while practicing.
import { test, expect, type Locator, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(page: Page, view: "rights" | "citizenship", lang: "en" | "es" = "en") {
  await page.goto("about:blank"); // a hash-only change wouldn't reload the app
  await page.goto(`./#${lang === "es" ? "lang=es&" : ""}help=immigration&hv=${view}`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  // The tab loads on demand: wait for its heading before testing it.
  await expect(dialog.locator("h3").first()).toBeVisible();
  return dialog;
}

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(".help__card").analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

/** Answer practice questions: reveal, then mark right/wrong, `n` times. */
async function answer(dialog: Locator, n: number, right: boolean) {
  for (let i = 0; i < n; i++) {
    await dialog.getByRole("button", { name: "Show the answer" }).click();
    await dialog.getByRole("button", { name: right ? "I got it right" : "I missed it" }).click();
  }
}

test("know your rights: emergency line, red cards, the warrant caveat, and a way to legal help", async ({ page }) => {
  const dialog = await open(page, "rights");
  await expect(dialog.getByRole("tab", { name: "Immigration" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("button", { name: "Know your rights" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("link", { name: "(559) 206-0151" })).toHaveAttribute("href", "tel:5592060151");
  await expect(dialog.getByRole("link", { name: /Get red cards free/ })).toHaveAttribute("href", "https://www.ilrc.org/red-cards");
  // Never promises ICE can't enter without a judge's warrant.
  await expect(dialog.getByText(/no one can promise that ICE will never enter without one/)).toBeVisible();
  await expect(dialog.getByText(/No 'safe zones' under federal policy/)).toBeVisible();
  await dialog.getByRole("button", { name: "See free legal help near you" }).click();
  await expect(dialog.getByRole("tab", { name: "Legal help" })).toHaveAttribute("aria-selected", "true");
});

test("know your rights in Spanish uses the sources' Spanish", async ({ page }) => {
  const dialog = await open(page, "rights", "es");
  await expect(dialog.getByRole("heading", { name: "Conozca sus derechos ante los agentes de inmigración" })).toBeVisible();
  await expect(dialog.getByText(/NO ABRA LA PUERTA/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Tarjeta en español/ })).toBeVisible();
});

test("citizenship study cards: all 128, the 65/20 list, topics, and Spanish study help", async ({ page }) => {
  const dialog = await open(page, "citizenship");
  await expect(dialog.locator(".hstat")).toHaveText("128 questions");
  await dialog.getByRole("checkbox", { name: /Only the 20 questions/ }).check();
  await expect(dialog.locator(".hstat")).toHaveText("20 questions");
  await dialog.getByRole("checkbox", { name: /Only the 20 questions/ }).uncheck();
  await dialog.getByRole("combobox", { name: "Topic", exact: true }).selectOption({ label: "Symbols" });
  await expect(dialog.locator(".hcivics__list details")).toHaveCount(6);
  await dialog.getByRole("combobox", { name: "Topic", exact: true }).selectOption({ label: "All topics" });
  const first = dialog.locator(".hcivics__list details").first();
  await first.locator("summary").click();
  await expect(first.getByText("Constitution-based federal republic")).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Show Spanish to help me study" }).check();
  await expect(first.getByText(/Unofficial Spanish, to help you study/)).toBeVisible();
  // A question whose answer changes shows today's answer and why.
  const governor = dialog.locator("details", { hasText: "Who is the governor of your state now?" });
  await governor.locator("summary").click();
  await expect(governor).toContainText("Gavin Newsom");
  await expect(governor).toContainText("January 4, 2027");
});

test("practice test passes at 12 right, like the real one", async ({ page }) => {
  const dialog = await open(page, "citizenship");
  await dialog.getByRole("button", { name: "Practice test" }).click();
  await dialog.getByRole("button", { name: /Start a practice test \(up to 20 questions; 12 right to pass\)/ }).click();
  await expect(dialog.getByText("Question 1 of up to 20 · 0 right, 0 wrong")).toBeVisible();
  await answer(dialog, 3, false);
  await answer(dialog, 12, true);
  await expect(dialog.locator(".hcivics__result")).toContainText("You passed this practice test, with 12 right");
  await expect(dialog.getByRole("button", { name: "Show the answer" })).toHaveCount(0); // the officer stops
  await expect(dialog.getByRole("heading", { name: "Questions to review" })).toBeVisible();
  await expect(dialog.locator(".hcivics__list .hcivics__card")).toHaveCount(3);
});

test("practice test stops at 9 wrong; 65/20 uses 10 questions and 6 to pass", async ({ page }) => {
  const dialog = await open(page, "citizenship");
  await dialog.getByRole("button", { name: "Practice test" }).click();
  await dialog.getByRole("button", { name: /Start a practice test/ }).click();
  await answer(dialog, 9, false);
  await expect(dialog.locator(".hcivics__result")).toContainText("Not this time: 9 wrong");

  await dialog.getByRole("checkbox", { name: /Only the 20 questions/ }).check();
  await dialog.getByRole("button", { name: /Start a practice test \(up to 10 questions; 6 right to pass\)/ }).click();
  await answer(dialog, 6, true);
  await expect(dialog.locator(".hcivics__result")).toContainText("You passed this practice test, with 6 right");
});

test("links: the chips update the URL, and nothing typed or marked is sent", async ({ page }) => {
  const dialog = await open(page, "rights");
  await dialog.getByRole("button", { name: "Citizenship test practice" }).click();
  await expect(page).toHaveURL(/help=immigration&hv=citizenship/);
  const sent: Request[] = [];
  page.on("request", (r) => sent.push(r));
  await dialog.getByRole("button", { name: "Practice test" }).click();
  await dialog.getByRole("button", { name: /Start a practice test/ }).click();
  await answer(dialog, 2, true);
  expect(sent.filter((r) => !/\.(js|css|woff2?|png|svg|json|pbf)(\?|$)/.test(r.url()) && !r.url().includes("tiles"))).toEqual([]);
});

test("WCAG 2.2 AA (light and dark) and a 320px phone, for both tools", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    let dialog = await open(page, "rights");
    await expectNoA11yViolations(page);
    dialog = await open(page, "citizenship");
    await dialog.locator("details").first().locator("summary").click();
    await expectNoA11yViolations(page);
    await dialog.getByRole("button", { name: "Practice test" }).click();
    await dialog.getByRole("button", { name: /Start a practice test/ }).click();
    await dialog.getByRole("button", { name: "Show the answer" }).click();
    await expectNoA11yViolations(page);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  for (const view of ["rights", "citizenship"] as const) {
    await open(page, view, "es");
    const overflow = await page.locator(".help__body").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, view).toBeLessThanOrEqual(0);
  }
});

test("practice test: focus follows the test, the verdict is announced, and 65/20 mid-test starts over", async ({ page }) => {
  const dialog = await open(page, "citizenship");
  await dialog.getByRole("button", { name: "Practice test" }).click();
  await dialog.getByRole("button", { name: /Start a practice test/ }).click();
  const focused = () => page.evaluate(() => document.activeElement?.className ?? "");
  await expect.poll(focused).toContain("hcivics__q"); // the question
  await dialog.getByRole("button", { name: "Show the answer" }).click();
  await expect(dialog.getByRole("button", { name: "I got it right" })).toBeFocused();
  await dialog.getByRole("button", { name: "I got it right" }).click();
  await expect.poll(focused).toContain("hcivics__q"); // the next question
  const live = dialog.locator("[aria-live=polite].sr-only");
  await expect(live).toHaveText(/Question 2 of up to 20\. 1 right, 0 wrong/);

  // Switching to the 65/20 list mid-test ends that test: no stale result appears.
  await dialog.getByRole("checkbox", { name: /Only the 20 questions/ }).check();
  await expect(dialog.getByRole("button", { name: /Start a practice test \(up to 10 questions/ })).toBeVisible();
  await expect(dialog.locator(".hcivics__result")).toHaveCount(0);
  await dialog.getByRole("button", { name: /Start a practice test/ }).click();
  await answer(dialog, 6, true);
  await expect(live).toHaveText(/You passed this practice test, with 6 right/);
  await expect(dialog.locator(".hcivics__result")).toBeFocused();
});

test("an open study card shows its question once", async ({ page }) => {
  const dialog = await open(page, "citizenship");
  const card = dialog.locator(".hcivics__list details").first();
  await card.locator("summary").click();
  await expect(card.getByText("What is the form of government of the United States?")).toHaveCount(1);
});
