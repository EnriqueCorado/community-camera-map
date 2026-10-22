"""Nationwide road operations, baked in CI (most of these feeds send no CORS
headers, so the browser can't read them directly):

  work-zones          every keyless public feed in the USDOT WZDx Feed Registry,
                      plus roadwork from Alabama ALGO, the keyed Iteris 511
                      states (GA, WI, NV, NC, AK; UT, LA, ID, AZ once their keys
                      are approved; skipped where a statewide WZDx feed
                      delivered) and Ohio OHGO construction
  road-incidents      crashes, closures, special events and other incidents:
                      Maryland CHART, Alabama ALGO, Iteris 511, OHGO
  message-signs-usa   current sign text: Maryland CHART, Alabama ALGO,
                      Iteris 511, OHGO
  road-weather-usa    roadside weather stations: Maryland CHART, OHGO

California keeps its own Caltrans layers (lane-closures, message-signs,
road-weather), so it is not repeated here.

Keyed sources (Iteris 511, OHGO) are used only when their keys are configured.
In CI that is the isolated `cameras` job of pages.yml, which runs
`refresh_live.py --keyed` and hands back just these GeoJSON files; the build
job never sees a key (and never re-bakes these layers itself).

Every source is fetched on its own: one failing feed is logged (exception type
only, never its text: keyed URLs carry the key) and skipped. A layer fails only
when every one of its sources does, so the bake keeps the last good file.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import time
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

import httpx

from ...cameras.national import ITERIS
from ...core.config import Settings
from ...core.http import fetch_capped
from ..service import Layer
from . import _roads_parse as rp

logger = logging.getLogger(__name__)
# httpx logs request URLs at INFO, and the Iteris keys ride in the query string.
for _noisy in ("httpx", "httpcore"):
    _lg = logging.getLogger(_noisy)
    _lg.setLevel(max(_lg.level, logging.WARNING))

REGISTRY = "https://data.transportation.gov/resource/69qe-yiui.json?$limit=500"
CHART = "https://chartexp1.sha.maryland.gov/CHARTExportClientService"
ALGO = "https://api.algotraffic.com/v4.0"
OHGO = "https://publicapi.ohgo.com/api/v1"
MB = 1024 * 1024
MAX_BYTES = 40 * MB
WZDX_PARALLEL = 6
MEMO_S = 300  # work-zones and road-incidents share one fetch per source per run

# Known WZDx registry feeds: feedname -> (state, credit, traveler-info page,
# byte cap). A keyless feed that isn't listed is still used when the registry
# names a US state (credited to that state, no page link). Only STATEWIDE feeds
# stand in for a state's 511 roadwork (a county or device-only feed does not).
WZDX_FEEDS: dict[str, tuple[str, str, str, int]] = {
    "odot": ("OK", "Oklahoma DOT", "https://oktraffic.org/", MAX_BYTES),
    "udot": ("UT", "Utah DOT", "https://udottraffic.utah.gov/", MAX_BYTES),
    "idot": ("IA", "Iowa DOT", "https://511ia.org/", MAX_BYTES),
    # ~25k detour rows: ~110 MB once decompressed
    "fldot": ("FL", "Florida DOT (one.network)", "https://fl511.com/", 160 * MB),
    "mndot": ("MN", "Minnesota DOT", "https://511mn.org/", MAX_BYTES),
    "mdot": ("MD", "Maryland DOT SHA", "https://chart.maryland.gov/", MAX_BYTES),
    "mcdot": ("AZ", "Maricopa County DOT / AZTech", "https://az511.com/", MAX_BYTES),
    "modot": ("MO", "Missouri DOT", "https://traveler.modot.org/", MAX_BYTES),
    "stcharlesco_v4": ("MO", "St. Charles County, MO", "", MAX_BYTES),
    "wisdot": ("WI", "Wisconsin DOT", "https://511wi.gov/", MAX_BYTES),
    "nmdot": ("NM", "New Mexico DOT", "https://nmroads.com/", MAX_BYTES),
    "hidot": ("HI", "Hawaii DOT", "https://hidot.hawaii.gov/", MAX_BYTES),
    "nysdot": ("NY", "New York State DOT", "https://511ny.org/", MAX_BYTES),
    "wsdot": ("WA", "Washington State DOT", "https://wsdot.com/travel/real-time/map/", MAX_BYTES),
    "njdot": ("NJ", "New Jersey DOT (TRANSCOM)", "https://511nj.org/", MAX_BYTES),
    "kytc": ("KY", "Kentucky Transportation Cabinet", "https://goky.ky.gov/", MAX_BYTES),
    "kansas": ("KS", "Kansas DOT", "https://www.kandrive.gov/", MAX_BYTES),
    "austin": ("TX", "City of Austin", "", MAX_BYTES),
    "dedot": ("DE", "Delaware DOT", "https://deldot.gov/map/", MAX_BYTES),
    "ladotd": ("LA", "Louisiana DOTD", "https://511la.org/", MAX_BYTES),
    "iddot": ("ID", "Idaho Transportation Department", "https://511.idaho.gov/", MAX_BYTES),
    "indot": ("IN", "Indiana DOT", "https://511in.org/", MAX_BYTES),
    "necdot": ("NH, VT, ME", "New England DOTs", "https://newengland511.org/", MAX_BYTES),
    "ncdot": ("NC", "North Carolina DOT", "https://www.drivenc.gov/", MAX_BYTES),
    "msdot": ("MS", "Mississippi DOT", "https://www.mdottraffic.com/", MAX_BYTES),
    "nddot": ("ND", "North Dakota DOT", "https://travel.dot.nd.gov/", MAX_BYTES),
}
STATEWIDE = {"wisdot", "iddot", "udot", "idot", "mndot", "modot", "indot", "kansas", "kytc",
             "njdot", "wsdot", "fldot", "odot", "msdot", "nddot", "necdot", "ncdot", "nysdot",
             "nmdot", "mdot", "hidot"}  # fmt: skip
# Registry rows that are vendor demos / test feeds, not a public agency.
WZDX_SKIP = {"CivicLink_CrewCast", "pbs", "quebec"}
US_STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "district of columbia": "DC",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI",
    "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT",
    "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN",
    "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY", "puerto rico": "PR",
}  # fmt: skip

CHART_CREDIT = "Maryland CHART (MDOT SHA)"
CHART_PAGE = "https://chart.maryland.gov/"
ALGO_CREDIT = "ALGO Traffic (ALDOT)"
ALGO_PAGE = "https://www.algotraffic.com/"
OHGO_CREDIT = "OHGO (Ohio DOT)"
OHGO_PAGE = "https://www.ohgo.com/"
# Every page link the layers can carry (the popup re-checks hosts against
# frontend/src/popup-logic.ts ROAD_PAGE_HOSTS; tests keep the two in sync).
PAGE_HOSTS = sorted(
    {urlparse(u).hostname or "" for _, _, u, _ in WZDX_FEEDS.values() if u}
    | {"chart.maryland.gov", "www.algotraffic.com", "www.ohgo.com"}
    | {host for host, _ in ITERIS.values()}
)


def _iteris_credit(st: str) -> str:
    return ITERIS[st][1]


def _iteris_page(st: str) -> str:
    return f"https://{ITERIS[st][0]}/"


# ---------- fetching ----------


class SourceError(Exception):
    """A source failed; the message never carries a URL (keys ride in URLs)."""


_memo: dict[str, tuple[float, asyncio.Future]] = {}


async def _shared(key: str, make: Callable[[], Awaitable[object]]) -> object:
    """One fetch per source per few minutes, shared by every layer that needs
    it (Iteris allows 10 calls / 60 s per key). Failures are shared too."""
    hit = _memo.get(key)
    if hit and time.monotonic() - hit[0] < MEMO_S:
        return await asyncio.shield(hit[1])
    fut: asyncio.Future = asyncio.ensure_future(make())
    _memo[key] = (time.monotonic(), fut)
    return await asyncio.shield(fut)


async def _get_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict | None = None,
    headers: dict | None = None,
    max_bytes: int = MAX_BYTES,
    keyed: bool = False,
    parse: Callable[[bytes], object] = json.loads,
) -> object:
    try:
        body, _ = await fetch_capped(
            client,
            url,
            params=params,
            headers=headers,
            max_bytes=max_bytes,
            # a redirect would forward a key or token riding in the URL
            follow_redirects=not keyed,
        )
    except httpx.HTTPStatusError as exc:
        raise SourceError(f"HTTP {exc.response.status_code}") from None
    except (httpx.HTTPError, httpx.InvalidURL) as exc:  # their text can carry the URL
        raise SourceError(type(exc).__name__) from None
    try:
        return parse(body)
    except ValueError:
        raise SourceError("bad JSON") from None


async def _gather(named: dict[str, Awaitable[list[dict]]], layer: str) -> dict:
    """Run every source; log and skip failures; fail only if all fail."""
    names = list(named)
    results = await asyncio.gather(*named.values(), return_exceptions=True)
    feats: list[dict] = []
    ok = 0
    for name, res in zip(names, results, strict=True):
        if isinstance(res, BaseException):
            # Type only: exception text can echo a keyed URL.
            msg = str(res) if isinstance(res, SourceError) else type(res).__name__
            logger.warning("%s: source %s failed (%s)", layer, name, msg)
            continue
        ok += 1
        feats.extend(res)
    if names and not ok:
        raise SourceError(f"{layer}: every source failed")
    return rp.fc(feats)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


# --- WZDx registry ---


def keyless_feeds(registry: object) -> list[dict]:
    """Registry rows -> [{name, url, state, credit, page, max_bytes}] for the
    active, keyless, https, v3/v4 feeds of US agencies. Tokens that a few
    agencies publish in the registry URL stay in memory only."""
    out = []
    for row in registry if isinstance(registry, list) else []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("feedname") or "")
        url = row.get("url")
        url = url.get("url") if isinstance(url, dict) else url
        if (
            not name
            or name in WZDX_SKIP
            or str(row.get("needapikey")).lower() != "false"
            or str(row.get("active")).lower() != "true"
            or not isinstance(url, str)
            or not url.startswith("https://")
            or not str(row.get("version") or "").startswith(("3", "4"))
        ):
            continue
        if name in WZDX_FEEDS:
            state, credit, page, cap = WZDX_FEEDS[name]
        else:
            state = US_STATES.get(str(row.get("state") or "").strip().lower(), "")
            if not state:
                continue
            credit, page, cap = f"{state} WZDx feed ({rp.text(name, 40)})", "", MAX_BYTES
        out.append(
            {
                "name": name,
                "url": url,
                "state": state,
                "credit": credit,
                "page": page,
                "cap": cap,
                "statewide": name in STATEWIDE,
                "known": name in WZDX_FEEDS,
            }
        )
    return out


async def _wzdx_feed(client: httpx.AsyncClient, feed: dict) -> list[dict]:
    # A published token rides in the URL, and an unlisted feed is unvetted:
    # neither may follow a redirect.
    keyed = bool(urlparse(feed["url"]).query) or not feed["known"]
    payload = await _get_json(
        client, feed["url"], max_bytes=feed["cap"], keyed=keyed, parse=rp.wzdx_payload
    )
    return rp.wzdx_events(
        payload, _now(), state=feed["state"], source=feed["credit"], link=feed["page"]
    )


async def _wzdx_all(client: httpx.AsyncClient) -> tuple[list[dict], set[str]]:
    """All keyless WZDx work zones, and the states that delivered some."""
    registry = await _get_json(client, REGISTRY, max_bytes=4 * MB)
    feeds = keyless_feeds(registry)
    gate = asyncio.Semaphore(WZDX_PARALLEL)  # bounded memory: some feeds are ~100 MB

    async def one(feed: dict) -> list[dict]:
        async with gate:
            return await _wzdx_feed(client, feed)

    results = await asyncio.gather(*(one(f) for f in feeds), return_exceptions=True)
    feats: list[dict] = []
    states: set[str] = set()
    for feed, res in zip(feeds, results, strict=True):
        if isinstance(res, BaseException):
            msg = str(res) if isinstance(res, SourceError) else type(res).__name__
            logger.warning("work-zones: WZDx feed %s failed (%s)", feed["name"], msg)
            continue
        feats.extend(res)
        if res and feed["statewide"]:
            states.update(s.strip() for s in feed["state"].split(","))
    if feeds and not feats and all(isinstance(r, BaseException) for r in results):
        raise SourceError("every WZDx feed failed")
    return feats, states


# --- keyed: Iteris 511, OHGO ---


async def _iteris(client: httpx.AsyncClient, st: str, key: str, kind: str) -> object:
    host, _ = ITERIS[st]

    async def go() -> object:
        try:
            return await _get_json(
                client,
                f"https://{host}/api/v2/get/{kind}",
                params={"key": key, "format": "json"},
                keyed=True,
            )
        except SourceError as exc:
            if str(exc) in ("HTTP 400", "HTTP 401", "HTTP 403"):  # key pending / revoked
                logger.warning("Iteris %s %s: invalid key; skipped", st.upper(), kind)
                return []
            raise

    return await _shared(f"iteris:{st}:{kind}", go)


async def _ohgo(client: httpx.AsyncClient, key: str, kind: str) -> object:
    async def go() -> object:
        try:
            return await _get_json(
                client,
                f"{OHGO}/{kind}",
                params={"page-all": "true"},
                headers={"Authorization": f"APIKEY {key}"},
                keyed=True,
            )
        except SourceError as exc:
            if str(exc) in ("HTTP 400", "HTTP 401", "HTTP 403"):
                logger.warning("OHGO %s: invalid key; skipped", kind)
                return {}
            raise

    return await _shared(f"ohgo:{kind}", go)


def _bucket(feats: list[dict], bucket: str) -> list[dict]:
    """Work zones go to work-zones; every other event kind to road-incidents."""
    want = bucket == "work"
    return [f for f in feats if (f["properties"].get("type") == "work-zone") == want]


def _no_key(feats: list[dict], keys: list[str]) -> list[dict]:
    """Belt and braces: never publish a feature whose text carries a key."""
    keys = [k for k in keys if k]
    return [f for f in feats if not any(k in json.dumps(f) for k in keys)]


async def _iteris_events(client: httpx.AsyncClient, st: str, key: str, bucket: str) -> list[dict]:
    rows = await _iteris(client, st, key, "event")
    feats = rp.iteris_events(
        rows, _now(), state=st.upper(), source=_iteris_credit(st), link=_iteris_page(st)
    )
    return _no_key(_bucket(feats, bucket), [key])


# --- keyless: CHART, ALGO ---


async def _chart(client: httpx.AsyncClient, kind: str) -> object:
    return await _shared(f"chart:{kind}", lambda: _get_json(client, f"{CHART}/{kind}.do"))


async def _algo(client: httpx.AsyncClient, kind: str) -> object:
    return await _shared(f"algo:{kind}", lambda: _get_json(client, f"{ALGO}/{kind}"))


async def _algo_events(client: httpx.AsyncClient, bucket: str) -> list[dict]:
    feats = rp.algo_events(
        await _algo(client, "TrafficEvents"), _now(), source=ALGO_CREDIT, link=ALGO_PAGE
    )
    return _bucket(feats, bucket)


async def _ohgo_incidents(client: httpx.AsyncClient, key: str) -> list[dict]:
    feats = rp.ohgo_incidents(
        await _ohgo(client, key, "incidents"), source=OHGO_CREDIT, link=OHGO_PAGE
    )
    return _no_key(feats, [key])


# ---------- loaders ----------


async def load_work_zones(client: httpx.AsyncClient, s: Settings) -> dict:
    wzdx_task = asyncio.ensure_future(_wzdx_all(client))

    async def wzdx() -> list[dict]:
        return (await wzdx_task)[0]

    async def iteris_work(st: str, key: str) -> list[dict]:
        await asyncio.gather(wzdx_task, return_exceptions=True)
        if wzdx_task.exception() is None and st.upper() in wzdx_task.result()[1]:
            return []  # this state's own WZDx feed delivered (WI, ID): no duplicates
        return await _iteris_events(client, st, key, "work")

    sources: dict[str, Awaitable[list[dict]]] = {
        "wzdx": wzdx(),
        "algo": _algo_events(client, "work"),
    }
    for st, key in s.iteris_keys.items():
        if st in ITERIS:
            sources[f"iteris-{st}"] = iteris_work(st, key)
    if s.ohgo_api_key:
        key = s.ohgo_api_key

        async def ohgo_work() -> list[dict]:
            payload = await _ohgo(client, key, "construction")
            feats = rp.ohgo_construction(payload, _now(), source=OHGO_CREDIT, link=OHGO_PAGE)
            try:
                incidents = await _ohgo_incidents(client, key)
            except SourceError:
                incidents = []  # construction alone is still worth publishing
            return _no_key(feats, [key]) + [
                f for f in incidents if f["properties"].get("type") == "work-zone"
            ]

        sources["ohgo"] = ohgo_work()
    out = await _gather(sources, "work-zones")
    for f in out["features"]:  # implied by the layer (~200 KB over 10k features)
        if f["properties"].get("type") == "work-zone":
            del f["properties"]["type"]
    return out


async def load_road_incidents(client: httpx.AsyncClient, s: Settings) -> dict:
    async def chart() -> list[dict]:
        payload = await _chart(client, "getEventMapDataJSON")
        return rp.chart_events(payload, source=CHART_CREDIT, link=CHART_PAGE)

    sources: dict[str, Awaitable[list[dict]]] = {
        "chart": chart(),
        "algo": _algo_events(client, "incident"),
    }
    for st, key in s.iteris_keys.items():
        if st in ITERIS:
            sources[f"iteris-{st}"] = _iteris_events(client, st, key, "incident")
    if s.ohgo_api_key:
        key = s.ohgo_api_key

        async def ohgo() -> list[dict]:
            feats = await _ohgo_incidents(client, key)
            return [f for f in feats if f["properties"].get("type") != "work-zone"]

        sources["ohgo"] = ohgo()
    return await _gather(sources, "road-incidents")


async def load_message_signs(client: httpx.AsyncClient, s: Settings) -> dict:
    async def chart() -> list[dict]:
        return rp.chart_signs(await _chart(client, "getDMSMapDataJSON"), source=CHART_CREDIT)

    async def algo() -> list[dict]:
        return rp.algo_signs(await _algo(client, "MessageSigns"), source=ALGO_CREDIT)

    sources: dict[str, Awaitable[list[dict]]] = {"chart": chart(), "algo": algo()}
    for st, key in s.iteris_keys.items():
        if st in ITERIS:

            async def iteris(st: str = st, key: str = key) -> list[dict]:
                rows = await _iteris(client, st, key, "messagesigns")
                feats = rp.iteris_signs(rows, state=st.upper(), source=_iteris_credit(st))
                return _no_key(feats, [key])

            sources[f"iteris-{st}"] = iteris()
    if s.ohgo_api_key:
        key = s.ohgo_api_key

        async def ohgo() -> list[dict]:
            payload = await _ohgo(client, key, "digital-signs")
            return _no_key(rp.ohgo_signs(payload, source=OHGO_CREDIT), [key])

        sources["ohgo"] = ohgo()
    return await _gather(sources, "message-signs-usa")


async def load_road_weather(client: httpx.AsyncClient, s: Settings) -> dict:
    async def chart() -> list[dict]:
        return rp.chart_weather(await _chart(client, "getRWISMapDataJSON"), source=CHART_CREDIT)

    sources: dict[str, Awaitable[list[dict]]] = {"chart": chart()}
    if s.ohgo_api_key:
        key = s.ohgo_api_key

        async def ohgo() -> list[dict]:
            payload = await _ohgo(client, key, "weather-sensor-sites")
            return _no_key(rp.ohgo_weather(payload, source=OHGO_CREDIT), [key])

        sources["ohgo"] = ohgo()
    return await _gather(sources, "road-weather-usa")


# ---------- layers ----------

HOUR = 3600

LAYERS: dict[str, Layer] = {
    "work-zones": Layer(
        name="work-zones",
        title="Work zones (US)",
        title_es="Zonas de obras (EE. UU.)",
        description=(
            "Highway work zones in effect now or starting within 24 hours, from every "
            "keyless state and city feed in the USDOT Work Zone Data Exchange registry plus "
            "state 511 systems (refreshed hourly). California: see Lane closures."
        ),
        category="roadops",
        group="roads",
        coverage="usa",
        loader=load_work_zones,
        ttl=HOUR,
    ),
    "road-incidents": Layer(
        name="road-incidents",
        title="Road incidents & closures (US)",
        title_es="Incidentes y cierres viales (EE. UU.)",
        description=(
            "Crashes, closures, special events and other incidents reported by state "
            "traffic centers (Maryland CHART, Alabama ALGO, Ohio OHGO, and 511 in GA, WI, "
            "NV, NC and AK, more as keys are approved). Refreshed hourly."
        ),
        category="roadops",
        group="roads",
        coverage="usa",
        loader=load_road_incidents,
        ttl=HOUR,
    ),
    "message-signs-usa": Layer(
        name="message-signs-usa",
        title="Highway message signs (more states)",
        title_es="Letreros de autopista (más estados)",
        description=(
            "Electronic highway signs and their current text in Maryland, Alabama, Ohio, "
            "Georgia, Wisconsin, Nevada, North Carolina and Alaska, more as 511 keys are "
            "approved (refreshed hourly)."
        ),
        category="info",
        group="roads",
        coverage="usa",
        loader=load_message_signs,
        ttl=HOUR,
    ),
    "road-weather-usa": Layer(
        name="road-weather-usa",
        title="Road weather stations (more states)",
        title_es="Estaciones meteorológicas viales (más estados)",
        description=(
            "Roadside weather stations: air and pavement temperature, wind and humidity, in "
            "Maryland (CHART) and Ohio (OHGO). Refreshed hourly."
        ),
        category="roadweather",
        group="roads",
        coverage="usa",
        loader=load_road_weather,
        ttl=HOUR,
    ),
}

_ITERIS_511 = ", ".join(c for _, c in ITERIS.values())  # each state once its key is approved
_STATE_CENTERS = f"Maryland CHART (MDOT SHA); ALGO Traffic (ALDOT); {_ITERIS_511}; OHGO (Ohio DOT)"
SOURCES = {
    "work-zones": (
        "USDOT Work Zone Data Exchange (WZDx) feed registry: every keyless state/city feed; "
        f"ALGO Traffic (ALDOT); {_ITERIS_511}; OHGO (Ohio DOT)"
    ),
    "road-incidents": _STATE_CENTERS,
    "message-signs-usa": _STATE_CENTERS,
    "road-weather-usa": "Maryland CHART (MDOT SHA) RWIS; OHGO (Ohio DOT) weather sensors",
}
# Baked only where the keys exist (CI's isolated keyed job): see refresh_live.py.
KEYED = tuple(LAYERS)
