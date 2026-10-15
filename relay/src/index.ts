// Flights relay: GET /flights -> privacy-filtered GeoJSON of aircraft within
// ~80 nm of Modesto, so the static map can show planes moving in real time.
//
// Upstream protection (adsb.fi asks for <= 1 request/second):
//  - Each Worker instance keeps the last result in memory for FRESH_MS and
//    shares one in-flight upstream request among simultaneous callers. (The
//    Cache API is a no-op on *.workers.dev, so it can't be relied on.)
//  - Failures back off (Retry-After honored) and serve the last good data.
//  - A per-client rate limit stops anyone using the relay as an amplifier.
// Everything except GET /flights is 404.
import { adsbFlights } from "./flights";

interface Env {
  FLIGHTS_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

// Open, readsb-based ADS-B feeds, tried in order. (adsb.fi answers 403 to
// Cloudflare's network, so it's effectively a local-dev source here.)
const UPSTREAMS = [
  "https://opendata.adsb.fi/api/v2/lat/37.64/lon/-120.99/dist/80",
  "https://api.adsb.lol/v2/lat/37.64/lon/-120.99/dist/80",
  "https://api.airplanes.live/v2/point/37.64/-120.99/80",
];
const FRESH_MS = 10_000; // reuse a result this long before asking upstream again
const STALE_OK_MS = 5 * 60_000; // during upstream trouble, serve data up to this old
const FAIL_BACKOFF_MS = 30_000; // after a failure, don't retry upstream sooner than this
const MAX_UPSTREAM_BYTES = 4 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  "https://enriquecorado.github.io",
  "http://localhost:5173", // vite dev
  "http://localhost:4173", // vite preview (static build)
]);

let last: { body: string; at: number } | null = null;
let inflight: Promise<string> | null = null;
let backoffUntil = 0;

async function fetchOne(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": "stanislaus-cam-map relay (+https://enriquecorado.github.io/stanislaus-cam-map/)" },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) {
    console.warn(`upstream ${new URL(url).host} HTTP ${r.status}`); // visible via `wrangler tail`
    const retry = Number(r.headers.get("Retry-After"));
    if (r.status === 429 && Number.isFinite(retry) && retry > 0) backoffUntil = Date.now() + Math.min(retry, 300) * 1000;
    throw new Error(`upstream ${r.status}`);
  }
  const declared = Number(r.headers.get("Content-Length"));
  if (declared > MAX_UPSTREAM_BYTES) throw new Error("upstream too large");
  const text = await r.text();
  if (text.length > MAX_UPSTREAM_BYTES) throw new Error("upstream too large");
  return JSON.stringify(adsbFlights(JSON.parse(text)));
}

/** First provider that answers wins; all failing -> back off. */
async function fetchUpstream(): Promise<string> {
  let lastErr: unknown;
  for (const url of UPSTREAMS) {
    try {
      return await fetchOne(url);
    } catch (err) {
      lastErr = err;
    }
  }
  backoffUntil = Math.max(backoffUntil, Date.now() + FAIL_BACKOFF_MS);
  throw lastErr instanceof Error ? lastErr : new Error("all upstreams failed");
}

/** Fresh-enough data: memo -> shared in-flight request -> stale fallback. */
async function flights(): Promise<string | null> {
  const now = Date.now();
  if (last && now - last.at < FRESH_MS) return last.body;
  if (now < backoffUntil) return last && now - last.at < STALE_OK_MS ? last.body : null;
  inflight ??= fetchUpstream()
    .then((body) => {
      last = { body, at: Date.now() };
      return body;
    })
    .finally(() => {
      inflight = null;
    });
  try {
    return await inflight;
  } catch (err) {
    console.warn(`upstream failed: ${err instanceof Error ? err.message : String(err)}`);
    backoffUntil = Math.max(backoffUntil, Date.now() + FAIL_BACKOFF_MS);
    return last && Date.now() - last.at < STALE_OK_MS ? last.body : null;
  }
}

function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : { Vary: "Origin" };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (url.pathname !== "/flights" || (request.method !== "GET" && request.method !== "OPTIONS")) {
      return new Response("Not found", { status: 404 });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...cors(origin), "Access-Control-Allow-Methods": "GET" } });
    }
    if (env.FLIGHTS_LIMITER) {
      const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (!(await env.FLIGHTS_LIMITER.limit({ key })).success) {
        return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60", ...cors(origin) } });
      }
    }
    const body = await flights();
    if (body === null) {
      return new Response(JSON.stringify({ error: "upstream unavailable" }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(origin) },
      });
    }
    return new Response(body, {
      headers: {
        "Content-Type": "application/geo+json",
        "Cache-Control": "public, max-age=10",
        "X-Content-Type-Options": "nosniff",
        ...cors(origin),
      },
    });
  },
} satisfies ExportedHandler<Env>;
