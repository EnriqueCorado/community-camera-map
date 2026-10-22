// Unit tests for the anonymous usage counter (no browser): the server accepts
// only its fixed list of events and stores nothing but monthly totals; the
// browser side skips Do Not Track / Global Privacy Control and sends nothing
// but the event name.
import { test, expect } from "@playwright/test";
import { APP_IDS, EVENTS, PAGE_IDS, createCounter, memoryStore, monthOf, parseEvent, recentMonths, upstashStore, storeFromEnv } from "../../relay/src/counter";
import { SITE_ORIGIN } from "../../relay/src/relay";
import { appCountId, countEvent, mayCount, sendCount } from "../../frontend/src/help/count";
import { HELP_TABS, isHelpView, BENEFITS_VIEWS, IMMIGRATION_VIEWS, RENT_VIEWS, WORK_VIEWS, type HelpTab } from "../../frontend/src/help/target";
import { TOOLS } from "../../frontend/src/landing/tools";

const URL_BASE = "https://stanislaus-flights.vercel.app/api/count";
const NOV = Date.UTC(2026, 10, 14, 23, 59, 59); // 2026-11-14, late evening UTC
const VIEWS: Partial<Record<HelpTab, readonly string[]>> = { rent: RENT_VIEWS, work: WORK_VIEWS, benefits: BENEFITS_VIEWS, immigration: IMMIGRATION_VIEWS };

const post = (e: string | null, headers: Record<string, string> = {}, search?: string) =>
  new Request(`${URL_BASE}${search ?? (e === null ? "" : `?e=${encodeURIComponent(e)}`)}`, {
    method: "POST",
    headers: { Origin: SITE_ORIGIN, ...headers },
  });

/** Every event the site can send today. */
function siteEvents(): string[] {
  const out: string[] = [];
  for (const lang of ["en", "es"] as const) {
    out.push(countEvent("page", "home", lang));
    for (const t of TOOLS) out.push(countEvent("page", t.id, lang));
    for (const tab of HELP_TABS) {
      const views = VIEWS[tab];
      if (!views) out.push(countEvent("app", appCountId({ tab }), lang));
      else for (const view of views) out.push(countEvent("app", appCountId({ tab, view: view as never }), lang));
    }
  }
  return out;
}

test.describe("the fixed list of events", () => {
  test("covers every page and every Help panel tool, in both languages, and nothing more", () => {
    // A new tool or view must be added to relay/src/counter.ts (and the relay redeployed).
    const site = siteEvents();
    for (const e of site) expect(EVENTS, e).toContain(e);
    expect(new Set(site)).toEqual(EVENTS);
    expect(EVENTS.size).toBe(2 * (PAGE_IDS.length + APP_IDS.length));
  });

  test("anything else is refused", () => {
    const u = (search: string, path = "/api/count") => new URL(`https://x.example${path}${search}`);
    expect(parseEvent(u("?e=page:rent:es"))).toBe("page:rent:es");
    expect(parseEvent(u("?e=page%3Arent%3Aes"))).toBe("page:rent:es");
    expect(parseEvent(u("?e=app:rent%2Feviction:en"))).toBe("app:rent/eviction:en");
    for (const bad of [
      "",
      "?e=",
      "?e=page:rent",
      "?e=page:rent:fr",
      "?e=page:Rent:es",
      "?e=page:rent:es:95354", // a ZIP code riding along
      "?e=page:rent:es&zip=95354",
      "?zip=95354&e=page:rent:es",
      "?e=page:rent:es&e=page:rent:es",
      "?e=page:rent-increase:es", // the slug, not the tool id
      "?e=app:rent:en", // Renters always has a view
      "?e=page:" + "a".repeat(200) + ":es",
      "?e=%E0%A4%A", // broken escape
      "?e=page:home:es%00",
    ]) {
      expect(parseEvent(u(bad)), bad).toBeNull();
    }
    expect(parseEvent(u("?e=page:rent:es", "/api/count/"))).toBeNull();
    expect(parseEvent(u("?e=page:rent:es", "/api/flights"))).toBeNull();
  });
});

test.describe("counting", () => {
  test("stores one number per event per UTC month, nothing else", async () => {
    const store = memoryStore();
    const { count } = createCounter(store, () => NOV);
    for (const e of ["page:rent:es", "page:rent:es", "app:immigration/citizenship:en"]) {
      expect((await count(post(e))).status).toBe(204);
    }
    expect(store.dump()).toEqual({ "2026-11": { "page:rent:es": 2, "app:immigration/citizenship:en": 1 } });
    expect(monthOf(Date.UTC(2026, 11, 31, 23, 59))).toBe("2026-12");
    expect(monthOf(Date.UTC(2027, 0, 1, 0, 0))).toBe("2027-01");
  });

  test("Do Not Track and Global Privacy Control: answered, not counted", async () => {
    const store = memoryStore();
    const { count } = createCounter(store, () => NOV);
    expect((await count(post("page:home:en", { DNT: "1" }))).status).toBe(204);
    expect((await count(post("page:home:en", { "Sec-GPC": "1" }))).status).toBe(204);
    expect(store.dump()).toEqual({});
    // The browser side never even sends.
    expect(mayCount({ doNotTrack: "1" })).toBe(false);
    expect(mayCount({ globalPrivacyControl: true })).toBe(false);
    expect(mayCount({ doNotTrack: null, globalPrivacyControl: false })).toBe(true);
    expect(mayCount({})).toBe(true);
  });

  test("crawlers and automated test browsers aren't counted", async () => {
    const store = memoryStore();
    const { count } = createCounter(store, () => NOV);
    for (const ua of [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "curl/8.7.1",
    ]) {
      expect((await count(post("page:home:en", { "User-Agent": ua }))).status).toBe(204);
    }
    expect(store.dump()).toEqual({});
    await count(post("page:home:en", { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1" }));
    expect(store.dump()).toEqual({ "2026-11": { "page:home:en": 1 } });
  });

  test("nothing from the request reaches storage or the logs", async () => {
    const secrets = { "X-Forwarded-For": "203.0.113.77", "X-Real-IP": "203.0.113.78", "User-Agent": "UA-SECRET-1", Referer: "https://ref.example/SECRET-2", Cookie: "id=SECRET-3", "X-Vercel-IP-City": "Modesto-SECRET-4" };
    const calls: string[] = [];
    const store = {
      async add(month: string, field: string) {
        calls.push(JSON.stringify([month, field]));
      },
      async read() {
        return {};
      },
    };
    const logged: string[] = [];
    const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
    for (const k of Object.keys(orig) as (keyof typeof orig)[]) console[k] = (...a: unknown[]) => logged.push(a.map(String).join(" "));
    try {
      const { count } = createCounter(store, () => NOV);
      await count(post("page:eviction:es", secrets));
      const failing = createCounter({ add: async () => Promise.reject(new Error("down")), read: async () => ({}) }, () => NOV);
      await failing.count(post("page:eviction:es", secrets));
    } finally {
      Object.assign(console, orig);
    }
    expect(calls).toEqual([JSON.stringify(["2026-11", "page:eviction:es"])]);
    const everything = calls.join() + logged.join();
    for (const v of Object.values(secrets)) expect(everything).not.toContain(v);
    expect(everything).not.toContain("203.0.113");
    expect(logged).toEqual(["count not stored: down"]);
  });

  test("refuses other sites, bad events and other paths; caps each instance", async () => {
    const store = memoryStore();
    let t = NOV;
    const { count, totals } = createCounter(store, () => t);
    expect((await count(post("page:home:en", { Origin: "https://evil.example" }))).status).toBe(403);
    const noOrigin = new Request(`${URL_BASE}?e=page:home:en`, { method: "POST" });
    expect((await count(noOrigin)).status).toBe(403);
    expect((await count(post("page:nope:en"))).status).toBe(400);
    expect((await count(post(null))).status).toBe(400);
    expect(store.dump()).toEqual({});
    // At most 120 a minute per instance; the rest are dropped (still a 204).
    for (let i = 0; i < 130; i++) await count(post("page:home:en"));
    expect(store.dump()["2026-11"]!["page:home:en"]).toBe(120);
    t += 60_000;
    await count(post("page:home:en"));
    expect(store.dump()["2026-11"]!["page:home:en"]).toBe(121);
    expect((await totals(new Request(`${URL_BASE}?x=1`))).status).toBe(404);
  });

  test("with no storage set up: counts are dropped and totals say so", async () => {
    const { count, totals } = createCounter(null, () => NOV);
    expect((await count(post("page:home:en"))).status).toBe(204);
    const r = await totals(new Request(URL_BASE));
    expect(r.status).toBe(503);
    expect(storeFromEnv({})).toBeNull();
    expect(storeFromEnv({ KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t" })).not.toBeNull();
  });

  test("the public totals: aggregate only, cached, last 24 months", async () => {
    const store = memoryStore();
    await store.add("2026-10", "page:rent:es");
    await store.add("2026-11", "page:rent:es");
    await store.add("2026-11", "app:legal:en");
    await store.add("2024-01", "page:rent:es"); // older than 24 months: not shown
    const r = await createCounter(store, () => NOV).totals(new Request(URL_BASE));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toContain("s-maxage=3600");
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(SITE_ORIGIN);
    const body = (await r.json()) as { total: number; months: Record<string, Record<string, number>> };
    expect(body.total).toBe(3);
    expect(body.months).toEqual({ "2026-11": { "page:rent:es": 1, "app:legal:en": 1 }, "2026-10": { "page:rent:es": 1 } });
    expect(recentMonths(NOV, 3)).toEqual(["2026-11", "2026-10", "2026-09"]);
    expect(recentMonths(Date.UTC(2027, 0, 5), 2)).toEqual(["2027-01", "2026-12"]);
  });
});

test("Upstash: HINCRBY to count, one pipelined HGETALL to read, only the token as a header", async () => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    const body = url.endsWith("/pipeline") ? [{ result: ["page:rent:es", "7"] }, { result: [] }] : { result: 1 };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  const store = upstashStore("https://us1-x.upstash.io/", "TOKEN", fake);
  await store.add("2026-11", "page:rent:es");
  expect(await store.read(["2026-11", "2026-10"])).toEqual({ "2026-11": { "page:rent:es": 7 } });
  expect(sent[0]!.url).toBe("https://us1-x.upstash.io");
  expect(JSON.parse(String(sent[0]!.init.body))).toEqual(["HINCRBY", "count:2026-11", "page:rent:es", 1]);
  expect(sent[0]!.init.headers).toEqual({ Authorization: "Bearer TOKEN", "Content-Type": "application/json" });
  expect(sent[1]!.url).toBe("https://us1-x.upstash.io/pipeline");
  expect(JSON.parse(String(sent[1]!.init.body))).toEqual([
    ["HGETALL", "count:2026-11"],
    ["HGETALL", "count:2026-10"],
  ]);
});

test.describe("browser side", () => {
  test("names Help panel tools the way the server lists them", () => {
    expect(appCountId({ tab: "medical", hospitalId: "dmc" })).toBe("medical");
    expect(appCountId({ tab: "rent" })).toBe("rent/rent");
    expect(appCountId({ tab: "rent", view: "eviction" })).toBe("rent/eviction");
    // A view from another tab falls back to the tab's first tool, like the panel does.
    expect(appCountId({ tab: "work", view: "medi-cal" })).toBe("work/wages");
    expect(isHelpView("work", "medi-cal")).toBe(false);
  });

  test("sends only the event: a bodiless POST, no cookies, no referrer, no retries", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      throw new Error("offline");
    }) as unknown as typeof fetch;
    sendCount(URL_BASE, "app:rent/eviction:es", fake);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${URL_BASE}?e=app%3Arent%2Feviction%3Aes`);
    expect(calls[0]!.init).toEqual({ method: "POST", mode: "no-cors", credentials: "omit", referrerPolicy: "no-referrer", keepalive: true, cache: "no-store" });
    expect(parseEvent(new URL(calls[0]!.url))).toBe("app:rent/eviction:es");
  });
});
