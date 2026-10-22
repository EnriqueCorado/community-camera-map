// Flights relay core: privacy-filtered GeoJSON of aircraft, so the static map
// can show planes moving in real time (GitHub Pages can't call the ADS-B feeds
// directly: no CORS).
//   GET /api/flights                 within ~80 nm of Modesto (the home view)
//   GET /api/flights?cell=36_-123    one 3-degree grid cell anywhere in the US
//                                    (south-west corner; the map asks for the
//                                    cells in view)
//
// Upstream protection (adsb.fi asks for <= 1 request/second):
//  - Vercel's CDN caches each good response for 10 s (s-maxage), so nearly
//    every visitor request is served without running this code.
//  - Behind that, each instance reuses its last result for FRESH_MS and shares
//    one in-flight upstream request among simultaneous callers.
//  - A provider that answers 429 is skipped until its Retry-After passes; when
//    every provider fails, the relay backs off and serves the last good data.
//  - Calls to each provider are spaced PACE_MS apart (per instance), so many
//    cells at once still stay under the provider's request rate.
//  - Anything but those exact URLs is refused, so the CDN cache can't be
//    bypassed or split.
import { adsbFlights } from "./flights.js";

// Open readsb-based ADS-B feeds, tried in order: (lat, lon, radius nm) -> URL.
export const UPSTREAMS: ((lat: number, lon: number, nm: number) => string)[] = [
  (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
  (lat, lon, nm) => `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
];
export const CELL_DEG = 3;
const CELL_NM = 150; // covers a 3-degree cell from its center (corner is ~115 nm)
const HOME = { lat: 37.64, lon: -120.99, nm: 80 };
const PACE_MS = 1100; // adsb.fi asks for <= 1 request/second
// Grid cells queue no longer than this (then: stale data or a 503). The home
// view never gets refused, so it waits at most about this long too.
const MAX_WAIT_MS = 2000;
const TIMEOUT_MS = 4000; // per provider; worst case stays under maxDuration
const FRESH_MS = 10_000; // reuse a result this long before asking upstream again
const STALE_OK_MS = 5 * 60_000; // during upstream trouble, serve data up to this old
const FAIL_BACKOFF_MS = 30_000; // after a failure, don't retry upstream sooner than this
const MAX_UPSTREAM_BYTES = 4 * 1024 * 1024;
// The data is public; CORS only keeps other sites from hotlinking our quota.
export const SITE_ORIGIN = "https://enriquecorado.github.io";
const UA = "community-camera-map relay (+https://enriquecorado.github.io/community-camera-map/)";

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

const BUSY = Symbol("busy");

/** The pacing queue is full: a local, momentary condition, not an upstream failure. */
class Busy extends Error {
  constructor() {
    super("busy");
  }
}

interface Area {
  key: string;
  lat: number;
  lon: number;
  nm: number;
}

/** The area a request asks for, or null if the URL isn't one we serve. Only
 *  the US grid (roughly 15-72 N, 180-63 W) on exact 3-degree corners. */
export function parseArea(url: URL): Area | null {
  if (url.pathname !== "/api/flights") return null;
  if (url.search === "") return { key: "home", ...HOME };
  const m = /^\?cell=(-?\d{1,3})_(-?\d{1,3})$/.exec(url.search);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (lat % CELL_DEG || lon % CELL_DEG || lat < 15 || lat > 69 || lon < -180 || lon > -66) return null;
  if (url.search !== `?cell=${lat}_${lon}`) return null; // one spelling per cell (no "036")
  return { key: `${lat}_${lon}`, lat: lat + CELL_DEG / 2, lon: lon + CELL_DEG / 2, nm: CELL_NM };
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createRelay(
  fetchImpl: Fetch = fetch,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = realSleep,
) {
  interface State {
    last: { body: string; at: number } | null;
    inflight: Promise<string> | null;
    backoffUntil: number; // all providers failed for this area: don't retry before this
  }
  const areas = new Map<string, State>(); // bounded: the grid has < 800 cells
  const blockedUntil = new Map<number, number>(); // per-provider 429 Retry-After
  const nextSlot = new Map<number, number>(); // per-provider pacing

  /** Wait for this provider's next request slot. Grid cells give up when the
   *  queue is long (the home view always gets a slot). */
  async function pace(i: number, home: boolean): Promise<void> {
    const t = now();
    const at = Math.max(t, nextSlot.get(i) ?? 0);
    if (!home && at - t > MAX_WAIT_MS) throw new Busy();
    nextSlot.set(i, at + PACE_MS);
    if (at > t) await sleep(at - t);
  }

  async function fetchOne(i: number, url: string, home: boolean): Promise<string> {
    await pace(i, home);
    const r = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) {
      console.warn(`upstream ${new URL(url).host} HTTP ${r.status}`);
      const retry = Number(r.headers.get("Retry-After"));
      if (r.status === 429) blockedUntil.set(i, now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 300) * 1000 : FAIL_BACKOFF_MS));
      throw new Error(`upstream ${r.status}`);
    }
    if (Number(r.headers.get("Content-Length")) > MAX_UPSTREAM_BYTES) throw new Error("upstream too large");
    return JSON.stringify(adsbFlights(JSON.parse(await readCapped(r))));
  }

  /** First provider that answers wins; providers in a 429 cool-down are
   *  skipped. The home view asks adsb.fi first; grid cells ask adsb.lol first,
   *  so exploring the map doesn't eat adsb.fi's 1 request/second. */
  async function fetchUpstream(a: Area): Promise<string> {
    const home = a.key === "home";
    const order = home ? [0, 1] : [1, 0];
    let lastErr: unknown = new Error("all upstreams rate-limited");
    let allBusy = true;
    for (const i of order) {
      if (now() < (blockedUntil.get(i) ?? 0)) continue;
      try {
        return await fetchOne(i, UPSTREAMS[i]!(a.lat, a.lon, a.nm), home);
      } catch (err) {
        if (!(err instanceof Busy)) allBusy = false;
        lastErr = err;
      }
    }
    if (allBusy && lastErr instanceof Busy) throw lastErr;
    throw lastErr instanceof Error ? lastErr : new Error("all upstreams failed");
  }

  /** Fresh-enough data: memo -> shared in-flight request -> stale fallback. */
  async function flights(a: Area): Promise<string | null | typeof BUSY> {
    let st = areas.get(a.key);
    if (!st) areas.set(a.key, (st = { last: null, inflight: null, backoffUntil: 0 }));
    const s = st;
    const t = now();
    const stale = () => (s.last && t - s.last.at < STALE_OK_MS ? s.last.body : null);
    if (s.last && t - s.last.at < FRESH_MS) return s.last.body;
    if (t < s.backoffUntil && !s.inflight) return stale();
    s.inflight ??= fetchUpstream(a)
      .then((body) => {
        s.last = { body, at: now() };
        return body;
      })
      .finally(() => {
        s.inflight = null;
      });
    try {
      return await s.inflight;
    } catch (err) {
      if (err instanceof Busy) return stale() ?? BUSY; // no upstream was asked: no backoff
      console.warn(`upstream failed (${a.key}): ${err instanceof Error ? err.message : String(err)}`);
      // Wait at least FAIL_BACKOFF_MS, or until the first 429'd provider reopens.
      const reopen = Math.min(...UPSTREAMS.map((_, i) => blockedUntil.get(i) ?? 0));
      s.backoffUntil = Math.max(now() + FAIL_BACKOFF_MS, reopen);
      return stale();
    }
  }

  const cors = { "Access-Control-Allow-Origin": SITE_ORIGIN }; // constant: no Vary needed

  return async function handle(request: Request): Promise<Response> {
    // (Vercel itself answers 405 to non-GET, since api/flights.ts exports only GET.)
    const area = request.method === "GET" ? parseArea(new URL(request.url)) : null;
    if (!area) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const body = await flights(area);
    if (body === BUSY) {
      return new Response(JSON.stringify({ error: "busy, retry shortly" }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "2", ...cors },
      });
    }
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
