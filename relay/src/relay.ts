// Flights relay core: GET /api/flights -> privacy-filtered GeoJSON of aircraft
// within ~80 nm of Modesto, so the static map can show planes moving in real
// time (GitHub Pages can't call the ADS-B feeds directly: no CORS).
//
// Upstream protection (adsb.fi asks for <= 1 request/second):
//  - Vercel's CDN caches each good response for 10 s (s-maxage), so nearly
//    every visitor request is served without running this code.
//  - Behind that, each instance reuses its last result for FRESH_MS and shares
//    one in-flight upstream request among simultaneous callers.
//  - A provider that answers 429 is skipped until its Retry-After passes; when
//    every provider fails, the relay backs off and serves the last good data.
//  - Any query string is refused, so it can't be used to bypass the CDN cache.
import { adsbFlights } from "./flights.js";

// Open readsb-based ADS-B feeds, tried in order.
export const UPSTREAMS = [
  "https://opendata.adsb.fi/api/v2/lat/37.64/lon/-120.99/dist/80",
  "https://api.adsb.lol/v2/lat/37.64/lon/-120.99/dist/80",
];
const FRESH_MS = 10_000; // reuse a result this long before asking upstream again
const STALE_OK_MS = 5 * 60_000; // during upstream trouble, serve data up to this old
const FAIL_BACKOFF_MS = 30_000; // after a failure, don't retry upstream sooner than this
const MAX_UPSTREAM_BYTES = 4 * 1024 * 1024;
// The data is public; CORS only keeps other sites from hotlinking our quota.
export const SITE_ORIGIN = "https://enriquecorado.github.io";
const UA = "stanislaus-cam-map relay (+https://enriquecorado.github.io/stanislaus-cam-map/)";

type Fetch = typeof fetch;

/** Response body as text, aborting once it exceeds MAX_UPSTREAM_BYTES. */
async function readCapped(r: Response): Promise<string> {
  if (!r.body) return "";
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPSTREAM_BYTES) {
      await reader.cancel();
      throw new Error("upstream too large");
    }
    chunks.push(value);
  }
  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c, { stream: true })).join("") + decoder.decode();
}

export function createRelay(fetchImpl: Fetch = fetch, now: () => number = Date.now) {
  let last: { body: string; at: number } | null = null;
  let inflight: Promise<string> | null = null;
  let backoffUntil = 0; // all providers failed: don't retry before this
  const blockedUntil = new Map<string, number>(); // per-provider 429 Retry-After

  async function fetchOne(url: string): Promise<string> {
    const r = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) {
      console.warn(`upstream ${new URL(url).host} HTTP ${r.status}`);
      const retry = Number(r.headers.get("Retry-After"));
      if (r.status === 429) blockedUntil.set(url, now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 300) * 1000 : FAIL_BACKOFF_MS));
      throw new Error(`upstream ${r.status}`);
    }
    if (Number(r.headers.get("Content-Length")) > MAX_UPSTREAM_BYTES) throw new Error("upstream too large");
    return JSON.stringify(adsbFlights(JSON.parse(await readCapped(r))));
  }

  /** First provider that answers wins; providers in a 429 cool-down are skipped. */
  async function fetchUpstream(): Promise<string> {
    let lastErr: unknown = new Error("all upstreams rate-limited");
    for (const url of UPSTREAMS) {
      if (now() < (blockedUntil.get(url) ?? 0)) continue;
      try {
        return await fetchOne(url);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("all upstreams failed");
  }

  /** Fresh-enough data: memo -> shared in-flight request -> stale fallback. */
  async function flights(): Promise<string | null> {
    const t = now();
    const stale = () => (last && t - last.at < STALE_OK_MS ? last.body : null);
    if (last && t - last.at < FRESH_MS) return last.body;
    if (t < backoffUntil && !inflight) return stale();
    inflight ??= fetchUpstream()
      .then((body) => {
        last = { body, at: now() };
        return body;
      })
      .finally(() => {
        inflight = null;
      });
    try {
      return await inflight;
    } catch (err) {
      console.warn(`upstream failed: ${err instanceof Error ? err.message : String(err)}`);
      // Wait at least FAIL_BACKOFF_MS, or until the first 429'd provider reopens.
      const reopen = Math.min(...UPSTREAMS.map((u) => blockedUntil.get(u) ?? 0));
      backoffUntil = Math.max(now() + FAIL_BACKOFF_MS, reopen);
      return stale();
    }
  }

  const cors = { "Access-Control-Allow-Origin": SITE_ORIGIN }; // constant: no Vary needed

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // (Vercel itself answers 405 to non-GET, since api/flights.ts exports only GET.)
    // One exact URL, so the CDN cache can't be split or bypassed.
    if (request.method !== "GET" || url.pathname !== "/api/flights" || url.search !== "") {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const body = await flights();
    if (body === null) {
      return new Response(JSON.stringify({ error: "upstream unavailable" }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
      });
    }
    return new Response(body, {
      headers: {
        "Content-Type": "application/geo+json",
        // Browsers: 5 s. Vercel CDN: 10 s, then serve stale while refreshing.
        "Cache-Control": "public, max-age=5, s-maxage=10, stale-while-revalidate=20",
        "X-Content-Type-Options": "nosniff",
        ...cors,
      },
    });
  };
}
