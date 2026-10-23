// End-to-end: the family emergency plan (Immigration tab) in a real browser —
// typing, adding and removing people, printing only the plan (filled, blank,
// Spanish), erasing, keeping answers only while the tab is open, nothing sent,
// and accessibility (light and dark, a 320px phone).
import { test, expect, type Page, type Request } from "@playwright/test";
import { unexpected } from "./requests";
import AxeBuilder from "@axe-core/playwright";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(page: Page, lang: "en" | "es" = "en", view = "plan") {
  await page.goto("about:blank"); // a hash-only change wouldn't reload the app
  await page.goto(`./#${lang === "es" ? "lang=es&" : ""}help=immigration&hv=${view}`);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Free help|Ayuda gratis/ });
  await expect(dialog.locator("h3").first()).toBeVisible();
  return dialog;
}

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(".help__card").analyze();
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

/** Replace window.print so a test can look at the page "while printing". */
async function stubPrint(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
}

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("fill in a plan, print only the plan, then the page goes back to normal", async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog.getByRole("heading", { name: "Make a family emergency plan" })).toBeVisible();
  const contacts = section(page, "Emergency contacts");
  await contacts.getByRole("group", { name: "Contact 1" }).getByLabel("Name", { exact: true }).fill("Rosa Pérez");
  await contacts.getByRole("group", { name: "Contact 1" }).getByLabel("Phone").fill("(209) 555-0100");
  const caregiver = section(page, "Back-up caregiver for the children");
  await caregiver.getByLabel("Name", { exact: true }).fill("Tía Marta");
  await caregiver.getByRole("checkbox", { name: /filled out a Caregiver’s Authorization Affidavit/ }).check();
  await section(page, "The children").getByLabel("Name", { exact: true }).fill("Ana");

  await stubPrint(page);
  await dialog.getByRole("button", { name: "Print or save as PDF" }).click();
  const paper = page.locator(".plan-print");
  await expect(paper).toHaveAttribute("lang", "en");
  await expect(paper.locator("h1")).toHaveText("Family emergency plan");
  await expect(paper).toContainText("Rosa Pérez");
  await expect(paper).toContainText("(209) 555-0100");
  await expect(paper).toContainText("☑ The caregiver filled out a Caregiver’s Authorization Affidavit");
  await expect(paper).toContainText("Keep this somewhere safe");
  // Empty sections are left off the paper.
  await expect(paper.getByRole("heading", { name: "Pets and the car" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  // While printing, only the plan shows.
  await page.emulateMedia({ media: "print" });
  await expect(paper).toBeVisible();
  await expect(dialog).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await expect(paper).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/printing-plan/);
});

test("print in Spanish, and print a blank plan to fill in by hand", async ({ page }) => {
  const dialog = await open(page);
  await section(page, "Money, rent and bills").getByLabel("Who can pay the rent and bills").fill("Mi hermano");
  await stubPrint(page);
  await dialog.getByRole("group", { name: "Language of the printed plan" }).getByRole("button", { name: "Español" }).click();
  await dialog.getByRole("button", { name: "Print or save as PDF" }).click();
  const paper = page.locator(".plan-print");
  await expect(paper).toHaveAttribute("lang", "es");
  await expect(paper.locator("h1")).toHaveText("Plan familiar de emergencia");
  await expect(paper).toContainText("Quién puede pagar la renta y las cuentas");
  await expect(paper).toContainText("Mi hermano");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  await dialog.getByRole("group", { name: "Language of the printed plan" }).getByRole("button", { name: "English" }).click();
  await dialog.getByRole("button", { name: "Print a blank plan to fill in by hand" }).click();
  await expect(paper.locator("h2")).toHaveCount(8);
  await expect(paper).toContainText("Fill this in by hand");
  await expect(paper).not.toContainText("Mi hermano");
  await expect(paper.locator(".plan-print__todo li").first()).toContainText("☐");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("add and remove people: focus follows, limits hold, and it's announced", async ({ page }) => {
  const dialog = await open(page);
  const contacts = section(page, "Emergency contacts");
  await expect(contacts.getByRole("group", { name: /^Contact \d$/ })).toHaveCount(2);
  await contacts.getByRole("button", { name: "Add another (contact)" }).click();
  await expect(contacts.getByRole("group", { name: "Contact 3" }).getByLabel("Name", { exact: true })).toBeFocused();
  await expect(dialog.getByRole("status").filter({ hasText: "Contact 3 added." })).toHaveCount(1);
  await contacts.getByRole("group", { name: "Contact 3" }).getByLabel("Name", { exact: true }).fill("Third");
  await contacts.getByRole("button", { name: "Remove contact 2" }).click();
  await expect(contacts.getByRole("group", { name: /^Contact \d$/ })).toHaveCount(2);
  await expect(contacts.getByRole("group", { name: "Contact 2" }).getByLabel("Name", { exact: true })).toHaveValue("Third");
  await expect(contacts.getByRole("button", { name: "Add another (contact)" })).toBeFocused();
  for (let i = 0; i < 3; i++) await contacts.getByRole("button", { name: "Add another (contact)" }).click();
  await expect(contacts.getByRole("group", { name: /^Contact \d$/ })).toHaveCount(5);
  await expect(contacts.getByRole("button", { name: "Add another (contact)" })).toHaveCount(0);
});

test("erase everything asks first; answers survive switching views and tabs, but not closing Free Help", async ({ page }) => {
  const dialog = await open(page);
  const caregiver = section(page, "Back-up caregiver for the children");
  await caregiver.getByLabel("Name", { exact: true }).fill("Tía Marta");

  await dialog.getByRole("button", { name: "Erase everything" }).click();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByRole("button", { name: "Erase everything" })).toBeFocused();
  await expect(caregiver.getByLabel("Name", { exact: true })).toHaveValue("Tía Marta");

  // Switch to Know your rights and back: still there (kept in memory by the tab).
  await dialog.getByRole("button", { name: "Know your rights" }).first().click();
  await expect(dialog.getByRole("heading", { name: "Know your rights with immigration agents" })).toBeVisible();
  await dialog.getByRole("button", { name: /Make your family plan now/ }).click();
  await expect(dialog.getByRole("heading", { name: "Make a family emergency plan" })).toBeFocused();
  await expect(caregiver.getByLabel("Name", { exact: true })).toHaveValue("Tía Marta");

  await dialog.getByRole("button", { name: "Erase everything" }).click();
  await dialog.getByRole("button", { name: "Yes, erase it" }).click();
  await expect(caregiver.getByLabel("Name", { exact: true })).toHaveValue("");
  await expect(dialog.getByRole("heading", { name: "Make a family emergency plan" })).toBeFocused();
  await expect(dialog.getByRole("status").filter({ hasText: "Everything you typed was erased." })).toHaveCount(1);

  // A look at another tab (or another tool from "Not sure where to start?") keeps it.
  await caregiver.getByLabel("Name", { exact: true }).fill("Tía Marta");
  await dialog.getByRole("tab", { name: "Renters" }).click();
  await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toHaveCount(0); // hidden while away
  await dialog.getByRole("tab", { name: "Immigration" }).click();
  await dialog.getByRole("button", { name: "Family emergency plan" }).click();
  await expect(section(page, "Back-up caregiver for the children").getByLabel("Name", { exact: true })).toHaveValue("Tía Marta");

  // Closing Free Help erases it.
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /^Free help/ }).click();
  await dialog.getByRole("tab", { name: "Immigration" }).click();
  await dialog.getByRole("button", { name: "Family emergency plan" }).click();
  await expect(section(page, "Back-up caregiver for the children").getByLabel("Name", { exact: true })).toHaveValue("");
});

test("nothing typed is sent or saved, and the browser is asked not to remember it", async ({ page, context }) => {
  const dialog = await open(page);
  const sent: Request[] = [];
  page.on("request", (r) => sent.push(r));
  const caregiver = section(page, "Back-up caregiver for the children");
  await caregiver.getByLabel("Name", { exact: true }).fill("SECRET-NAME-123");
  await section(page, "Important documents").getByRole("textbox", { name: /A-Number/ }).fill("SECRET-A-NUMBER");
  await dialog.getByRole("button", { name: "Erase everything" }).click(); // UI only; not confirmed
  expect(unexpected(sent)).toEqual([]);
  for (const r of sent) expect(r.url() + (r.postData() ?? "")).not.toContain("SECRET");
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(stored).not.toContain("SECRET");
  expect((await context.cookies()).map((c) => c.value).join()).not.toContain("SECRET");
  const fields = dialog.locator(".hplan input:not([type=checkbox]), .hplan textarea");
  expect(await fields.count()).toBeGreaterThan(20);
  for (const a of await fields.evaluateAll((els) => els.map((e) => e.getAttribute("autocomplete")))) expect(a).toBe("off");
  // No spell check or writing assistant either: some send what's typed to their servers.
  for (const a of await fields.evaluateAll((els) => els.map((e) => [e.getAttribute("spellcheck"), e.getAttribute("data-gramm")].join()))) expect(a).toBe("false,false");
});

test("closing the page with a plan typed asks first", async ({ page }) => {
  await open(page);
  await section(page, "Back-up caregiver for the children").getByLabel("Name", { exact: true }).fill("Tía Marta");
  const asked = page.waitForEvent("dialog");
  void page.close({ runBeforeUnload: true });
  const d = await asked;
  expect(d.type()).toBe("beforeunload");
  await d.dismiss();
});

test("Spanish, WCAG 2.2 AA (light and dark) with everything open, and a 320px phone", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const dialog = await open(page);
    for (const d of await dialog.locator(".hplan details").all()) await d.locator("summary").click();
    await section(page, "Emergency contacts").getByRole("button", { name: "Add another (contact)" }).click();
    await dialog.getByRole("button", { name: "Erase everything" }).click();
    await expectNoA11yViolations(page);
  }
  await page.emulateMedia({ colorScheme: "light" });
  const es = await open(page, "es");
  await expect(es.getByRole("heading", { name: "Haga un plan familiar de emergencia" })).toBeVisible();
  await expect(es.getByRole("region", { name: "Cuidador de emergencia para los niños" })).toBeVisible();
  await expect(es.getByRole("link", { name: /Declaración jurada de autorización para el cuidador/ })).toHaveAttribute("href", /selfhelp\.courts\.ca\.gov/);
  await expectNoA11yViolations(page);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const lang of ["en", "es"] as const) {
    await open(page, lang);
    const overflow = await page.locator(".help__body").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, lang).toBeLessThanOrEqual(0);
  }
});

test("the chip and the public page lead to the plan", async ({ page }) => {
  const dialog = await open(page, "en", "rights");
  await dialog.getByRole("button", { name: "Family emergency plan" }).click();
  await expect(page).toHaveURL(/help=immigration&hv=plan/);
  const res = await page.request.get("help/");
  test.skip(!(await res.text()).includes('class="hero"'), "public pages exist only in a build");
  await page.goto("help/family-plan/");
  await expect(page.locator("h1")).toHaveText("Make a family emergency plan");
  await expect(page.getByText(/What the plan asks you to write down/)).toBeVisible();
  await page.goto("ayuda/plan-familiar/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("h1")).toHaveText("Haga un plan familiar de emergencia");
});
