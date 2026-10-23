// Unit tests for the family emergency plan (no browser): the form's shape, the
// pure state helpers, what goes on paper, and that every fact is cited.
import { test, expect } from "@playwright/test";
import {
  addEntry,
  emptyPlan,
  hasContent,
  MULTILINE_MAX,
  PLAN_SECTIONS,
  printSections,
  removeEntry,
  setField,
  TEXT_MAX,
  toggleTodo,
} from "../../frontend/src/help/family-plan";
import { PLAN_FACTS, PLAN_LINKS, PLAN_SOURCES } from "../../frontend/src/help/family-plan-facts";
import { FAMILY_PLAN_COPY } from "../../frontend/src/help/family-plan-copy";
import { IMMIGRATION_VIEWS } from "../../frontend/src/help/target";
import { toolById } from "../../frontend/src/landing/tools";
import { upkeepItems } from "../../frontend/src/help/upkeep";

test("the plan covers what ILRC's plan asks for, in both languages", () => {
  expect(PLAN_SECTIONS.map((s) => s.id)).toEqual(["contacts", "caregiver", "children", "health", "documents", "legal", "money", "pets"]);
  for (const s of PLAN_SECTIONS) {
    expect(s.title.en.length, s.id).toBeGreaterThan(3);
    expect(s.title.es.length, s.id).toBeGreaterThan(3);
    expect(new Set(s.fields.map((f) => f.id)).size, `${s.id}: field ids unique`).toBe(s.fields.length);
    for (const f of s.fields) {
      expect(f.label.en, `${s.id}/${f.id}`).toBeTruthy();
      expect(f.label.es, `${s.id}/${f.id}`).toBeTruthy();
      expect(f.label.es, `${s.id}/${f.id} translated`).not.toBe(f.label.en);
    }
  }
  const todoIds = PLAN_SECTIONS.flatMap((s) => (s.todo ?? []).map((t) => t.id));
  expect(new Set(todoIds).size, "to-do ids unique across sections").toBe(todoIds.length);
  // Never asks for the numbers themselves: where things are, and who has a copy.
  const labels = PLAN_SECTIONS.flatMap((s) => s.fields.map((f) => f.label.en)).join(" ");
  expect(labels).not.toMatch(/password|card number|social security number/i);
});

test("state helpers: fields, entries within min/max, ticks, and limits", () => {
  let plan = emptyPlan();
  expect(plan.entries.contacts).toHaveLength(2);
  expect(plan.entries.children).toHaveLength(1);
  expect(plan.entries.caregiver).toHaveLength(1);
  expect(hasContent(plan)).toBe(false);

  plan = setField(plan, "contacts", 1, "name", "Rosa");
  expect(plan.entries.contacts[1]!.name).toBe("Rosa");
  expect(hasContent(plan)).toBe(true);
  // Unknown fields or entries change nothing.
  expect(setField(plan, "contacts", 9, "name", "x")).toBe(plan);
  expect(setField(plan, "contacts", 0, "nope", "x")).toBe(plan);
  expect(hasContent(setField(emptyPlan(), "money", 0, "who", "   "))).toBe(false);

  expect(setField(plan, "caregiver", 0, "name", "x".repeat(500)).entries.caregiver[0]!.name).toHaveLength(TEXT_MAX);
  expect(setField(plan, "caregiver", 0, "agreed", "x".repeat(5000)).entries.caregiver[0]!.agreed).toHaveLength(MULTILINE_MAX);

  for (let i = 0; i < 10; i++) plan = addEntry(plan, "contacts");
  expect(plan.entries.contacts).toHaveLength(5);
  for (let i = 0; i < 10; i++) plan = removeEntry(plan, "contacts", 0);
  expect(plan.entries.contacts).toHaveLength(2);
  expect(addEntry(plan, "caregiver")).toBe(plan); // not a list

  const ticked = toggleTodo(emptyPlan(), "schoolCard");
  expect(ticked.done.schoolCard).toBe(true);
  expect(hasContent(ticked)).toBe(true);
  expect(toggleTodo(ticked, "schoolCard").done.schoolCard).toBe(false);
});

test("removing an entry keeps the others in order", () => {
  let plan = addEntry(emptyPlan(), "children");
  plan = addEntry(plan, "children");
  plan = setField(plan, "children", 0, "name", "Ana");
  plan = setField(plan, "children", 1, "name", "Luis");
  plan = setField(plan, "children", 2, "name", "Sofía");
  const [ana, , sofia] = plan.keys.children;
  plan = removeEntry(plan, "children", 1);
  expect(plan.entries.children.map((c) => c.name)).toEqual(["Ana", "Sofía"]);
  // Each person keeps their key, so the form keeps focus and typing on the right one.
  expect(plan.keys.children).toEqual([ana, sofia]);
});

test("entry keys are unique, line up with the entries, and are never printed", () => {
  let plan = emptyPlan();
  for (let i = 0; i < 3; i++) plan = addEntry(plan, "contacts");
  plan = removeEntry(plan, "contacts", 0);
  plan = addEntry(plan, "contacts");
  const all = Object.values(plan.keys).flat();
  expect(new Set(all).size).toBe(all.length);
  for (const id of Object.keys(plan.entries) as (keyof typeof plan.entries)[]) expect(plan.keys[id]).toHaveLength(plan.entries[id].length);
  // A blocked add or remove changes nothing.
  expect(addEntry(plan, "caregiver")).toBe(plan);
  plan = setField(plan, "contacts", 0, "name", "Rosa");
  // Paper holds only field labels and what was typed: keys never reach it.
  const labels = new Set(PLAN_SECTIONS.flatMap((x) => x.fields.map((f) => f.label.en)));
  const lines = printSections(plan, "en", "filled").flatMap((x) => x.entries.flatMap((e) => e.lines));
  expect(lines).toEqual([{ label: "Name", value: "Rosa" }]);
  for (const l of lines) expect(labels.has(l.label)).toBe(true);
  expect(hasContent(emptyPlan())).toBe(false);
});

test("paper: only what was written, renumbered, in the chosen language", () => {
  let plan = emptyPlan();
  plan = setField(plan, "contacts", 1, "name", "Rosa");
  plan = setField(plan, "contacts", 1, "phone", "209-555-0100");
  plan = setField(plan, "children", 0, "name", "Ana");
  plan = toggleTodo(plan, "schoolCard");
  plan = toggleTodo(plan, "doc-passports");

  const en = printSections(plan, "en", "filled");
  expect(en.map((s) => s.id)).toEqual(["contacts", "children", "documents"]);
  // The empty first contact is dropped, so Rosa is "Contact 1".
  expect(en[0]!.entries).toEqual([
    {
      heading: "Contact 1",
      lines: [
        { label: "Name", value: "Rosa" },
        { label: "Phone", value: "209-555-0100" },
      ],
    },
  ]);
  expect(en[1]!.todo).toEqual([{ label: "We updated the emergency contacts at school and child care.", done: true }]);
  expect(en[2]!.entries).toEqual([]);

  const es = printSections(plan, "es", "filled");
  expect(es[0]!.title).toBe("Contactos de emergencia");
  expect(es[0]!.entries[0]!.heading).toBe("Contacto 1");
  expect(es[0]!.entries[0]!.lines[0]).toEqual({ label: "Nombre", value: "Rosa" });
});

test("paper: the blank plan has every section, room to write, and empty boxes", () => {
  const plan = setField(toggleTodo(emptyPlan(), "talked"), "caregiver", 0, "name", "should not print");
  const blank = printSections(plan, "en", "blank");
  expect(blank.map((s) => s.id)).toEqual(PLAN_SECTIONS.map((s) => s.id));
  expect(blank.find((s) => s.id === "contacts")!.entries).toHaveLength(2);
  expect(blank.find((s) => s.id === "children")!.entries).toHaveLength(2);
  const all = blank.flatMap((s) => s.entries.flatMap((e) => e.lines));
  expect(all.every((l) => l.value === "")).toBe(true);
  expect(blank.flatMap((s) => s.todo).every((t) => !t.done)).toBe(true);
});

test("facts are cited in both languages, and the affidavit's expiry is stated carefully", () => {
  const facts = Object.values(PLAN_FACTS).flat();
  expect(facts.length).toBeGreaterThan(10);
  expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
  for (const f of facts) {
    expect(f.cite.length, f.id).toBeGreaterThan(2);
    expect(f.en.length, f.id).toBeGreaterThan(40);
    expect(f.es.length, f.id).toBeGreaterThan(40);
  }
  const expire = facts.find((f) => f.id === "caa-expire")!;
  // The Jan 2026 form says it doesn't expire; the courts' web page says yearly. Say both.
  expect(expire.en).toMatch(/does not expire/);
  expect(expire.en).toMatch(/each year/);
  // Not custody, and it says so.
  expect(facts.find((f) => f.id === "caa-what")!.en).toMatch(/does not give the caregiver legal custody/);
});

test("links are official https sources, and the copy matches in both languages", () => {
  const urls = [PLAN_LINKS.ilrc, PLAN_LINKS.gc211, ...Object.values(PLAN_LINKS.ilrcPdf), ...Object.values(PLAN_LINKS.caaForm), ...Object.values(PLAN_LINKS.caaPage), ...PLAN_SOURCES.map((s) => s.url)];
  for (const u of urls) expect(u).toMatch(/^https:\/\/(www\.ilrc\.org|selfhelp\.courts\.ca\.gov|oag\.ca\.gov|www\.ready\.gov)\//);
  const keys = (o: object) => Object.keys(o).sort();
  expect(keys(FAMILY_PLAN_COPY.es)).toEqual(keys(FAMILY_PLAN_COPY.en));
});

test("wired in: a view of the Immigration tab, a public page, and a yearly re-check", () => {
  expect(IMMIGRATION_VIEWS).toContain("plan");
  const page = toolById("family-plan");
  expect(page.slug).toEqual({ en: "family-plan", es: "plan-familiar" });
  expect(page.target).toEqual({ tab: "immigration", view: "plan" });
  expect(page.groups.length).toBeGreaterThan(4);
  expect(upkeepItems().map((i) => i.id)).toContain("yearly-family-plan");
});
