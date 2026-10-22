// Usage counter: how many times each free-help page or tool was opened, one
// number per page per month, so partners and grant makers can see the tools
// are used. It counts uses, not people.
//   POST /api/count  body "page:rent:es"         count one page view (204)
//   POST /api/count  body "app:rent/eviction:en"  count one tool opened in the map app
// The event rides in the body, not the URL, so request logs (which keep the
// URL next to the IP) never say which tool someone opened.
//   GET  /api/count                      the totals, as JSON
//
// Privacy (the site's rule: no visitor data, ever):
//  - storage holds only counters: field "<kind>:<id>:<lang>" in the hash
//    "count:<YYYY-MM>" (UTC month). Nothing from the request (IP address,
//    user agent, referrer, cookies, the exact time) is stored or logged by this
//    code. It reads only the event (the body) and the Origin, DNT, Sec-GPC and
//    User-Agent headers (the last only to drop bots and test browsers);
//  - the event must be one of EVENTS, a fixed list, so nothing else can be smuggled in;
//  - "DNT: 1" or "Sec-GPC: 1" means the visit isn't counted (the page script
//    already skips those browsers);
//  - counts are rough (no visitor ID means no way to tell repeat visits apart).
// Abuse: requests must come from the site's origin, each instance accepts at
// most MAX_PER_MINUTE counts (the rest are dropped), and the Vercel Firewall
// rate-limits per visitor before this code runs (README: "Usage counter").
import { SITE_ORIGIN } from "./relay.js";

/** Public pages (landing/tools.ts ToolId, plus the two home pages). */
export const PAGE_IDS = [
  "home",
  "medical",
  "rent",
  "eviction",
  "repairs",
  "deposit",
  "mobile",
  "wages",
  "heat",
  "benefits",
  "medi-cal-work",
  "know-your-rights",
  "citizenship",
  "legal",
  "family-plan",
  "daca",
  "taxes",
] as const;

/** Help panel tools in the map app: "<tab>" or "<tab>/<view>" (help/target.ts). */
export const APP_IDS = [
  "medical",
  "rent/rent",
  "rent/eviction",
  "rent/repairs",
  "rent/deposit",
  "rent/mobile",
  "work/wages",
  "work/heat",
  "benefits/screener",
  "benefits/medi-cal",
  "benefits/taxes",
  "immigration/rights",
  "immigration/citizenship",
  "immigration/plan",
  "immigration/daca",
  "legal",
] as const;

export const LANGS = ["en", "es"] as const;

/** Every event the counter accepts. */
export const EVENTS: ReadonlySet<string> = new Set(
  LANGS.flatMap((lang) => [...PAGE_IDS.map((id) => `page:${id}:${lang}`), ...APP_IDS.map((id) => `app:${id}:${lang}`)]),
);

const NOT_A_VISITOR = /HeadlessChrome|bot\b|crawl|spider|slurp|Playwright|curl\/|python-|Go-http/i;
const MAX_PER_MINUTE = 600; // per instance, only a backstop: the firewall limits each visitor
const MONTHS_SHOWN = 24;

/** Where the counters live (Upstash Redis in production, memory in tests). */
export interface CountStore {
  /** Add 1 to `field` for `month` ("2026-11"). */
  add(month: string, field: string): Promise<void>;
  /** The counts for each of `months` (months with none are left out). */
  read(months: string[]): Promise<Record<string, Record<string, number>>>;
}

export function memoryStore(): CountStore & { dump(): Record<string, Record<string, number>> } {
  const data: Record<string, Record<string, number>> = {};
  return {
    async add(month, field) {
      const m = (data[month] ??= {});
      m[field] = (m[field] ?? 0) + 1;
    },
    async read(months) {
      return Object.fromEntries(months.filter((m) => data[m]).map((m) => [m, { ...data[m] }]));
    },
    dump: () => structuredClone(data),
  };
}

type Fetch = typeof fetch;

/** Upstash Redis over its REST API (no SDK): HINCRBY to count, HGETALL to read. */
export function upstashStore(url: string, token: string, fetchImpl: Fetch = fetch): CountStore {
  const call = async (path: string, body: unknown): Promise<unknown> => {
    const r = await fetchImpl(`${url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw new Error(`storage HTTP ${r.status}`);
    return r.json();
  };
  return {
    async add(month, field) {
      await call("", ["HINCRBY", `count:${month}`, field, 1]);
    },
    async read(months) {
      const rows = (await call("/pipeline", months.map((m) => ["HGETALL", `count:${m}`]))) as { result?: unknown }[];
      const out: Record<string, Record<string, number>> = {};
      months.forEach((m, i) => {
        const flat = rows[i]?.result;
        if (!Array.isArray(flat) || flat.length === 0) return;
        const counts: Record<string, number> = {};
        for (let j = 0; j + 1 < flat.length; j += 2) counts[String(flat[j])] = Number(flat[j + 1]);
        out[m] = counts;
      });
      return out;
    },
  };
}

/** The store set up in the environment (Vercel's Upstash integration), or null. */
export function storeFromEnv(env: Record<string, string | undefined>): CountStore | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return url && token ? upstashStore(url, token) : null;
}

/** "2026-11" for a time (UTC). */
export const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);

/** The `months` months up to and including the one at `t`, newest first. */
export function recentMonths(t: number, months = MONTHS_SHOWN): string[] {
  const d = new Date(t);
  const out: string[] = [];
  for (let i = 0; i < months; i++) out.push(monthOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)));
  return out;
}

/** The event a POST asks to count: the body must be exactly one of EVENTS, sent to
 *  /api/count with no query string. Anything else is null. */
export function parseEvent(url: URL, body: string): string | null {
  if (url.pathname !== "/api/count" || url.search !== "") return null;
  return body.length <= 80 && EVENTS.has(body) ? body : null;
}

/** The request body, if it's small (an event name); "" otherwise. */
async function smallBody(request: Request): Promise<string> {
  // Refuse big bodies before reading them (when the size is declared).
  if (Number(request.headers.get("Content-Length") ?? "0") > 80) return "";
  try {
    return (await request.text()).slice(0, 81);
  } catch {
    return "";
  }
}

export function createCounter(store: CountStore | null, now: () => number = Date.now) {
  let windowStart = 0;
  let inWindow = 0;
  const cors = { "Access-Control-Allow-Origin": SITE_ORIGIN };
  const empty = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...cors } });

  async function count(request: Request): Promise<Response> {
    const event = parseEvent(new URL(request.url), await smallBody(request));
    if (!event) return empty(400);
    if (request.headers.get("Origin") !== SITE_ORIGIN) return empty(403);
    if (request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1") return empty(204);
    // Crawlers and automated test browsers (our own e2e runs) aren't visitors.
    if (NOT_A_VISITOR.test(request.headers.get("User-Agent") ?? "")) return empty(204);
    const t = now();
    if (t - windowStart >= 60_000) {
      windowStart = t;
      inWindow = 0;
    }
    if (!store || ++inWindow > MAX_PER_MINUTE) return empty(204);
    try {
      await store.add(monthOf(t), event);
    } catch (err) {
      // Only the error itself: never anything from the request.
      console.warn(`count not stored: ${err instanceof Error ? err.message : "error"}`);
    }
    return empty(204);
  }

  async function totals(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api/count" || url.search !== "") return empty(404);
    if (!store) return Response.json({ error: "counter not set up" }, { status: 503, headers: { "Cache-Control": "no-store", ...cors } });
    try {
      const months = await store.read(recentMonths(now()));
      const total = Object.values(months).reduce((n, m) => n + Object.values(m).reduce((a, b) => a + b, 0), 0);
      return Response.json(
        { about: "Times each free-help page or tool was opened, per month (UTC). Uses, not people; no visitor data is kept.", total, months },
        // Browsers: 5 min. Vercel CDN: 1 hour, so reading costs almost nothing.
        { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600", "X-Content-Type-Options": "nosniff", ...cors } },
      );
    } catch (err) {
      console.warn(`totals unavailable: ${err instanceof Error ? err.message : "error"}`);
      return Response.json({ error: "totals unavailable" }, { status: 502, headers: { "Cache-Control": "no-store", ...cors } });
    }
  }

  return { count, totals };
}
