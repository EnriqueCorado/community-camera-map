"""Nationwide equivalents of layers that only cover California or Stanislaus.

The California/Stanislaus originals stay (they are more detailed there); each
layer here is titled so the two read apart in the sidebar.

  - groundwater-usa: USGS continuously monitored wells, latest depth to water
    and change vs. the same time last year, from the keyless USGS Water
    Services (waterservices.usgs.gov, public domain), one request per state.
    The newer api.waterdata.usgs.gov OGC API is not used: its robots.txt
    disallows automated /items requests without an API key (see
    state_bakes.py). Baked daily in CI (scripts/refresh_live.py DAILY);
    ~1,800 wells, so the file loads in full.
  - power-outages-usa: counties with customers out, from ORNL's ODIN public
    (token-free) county summary. ODIN sends no CORS headers, so it's baked in
    the 15-minute FAST run; ~100 counties at a time.

Utility/state outage services that are ArcGIS views (Duke Energy, Maryland)
and state-scoped cooling centers / historical markers live in the verified
state specs (app/layers/data/state_layers/parity.json), not here. Wildfire
cameras outside California were rejected: ALERTWest's terms forbid reuse and
ALERTWildfire's list is no longer public (see the commit message).
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json

import httpx

from ...core.config import Settings
from ...core.http import ResponseTooLarge, fetch_capped
from ..service import Layer, Metric
from . import _parity_parse as pp
from .states import STATES

DAY = 24 * 3600

# --- Sources (one constant each: federal hosting moves) ---
USGS_IV = "https://waterservices.usgs.gov/nwis/iv/"
USGS_DV = "https://waterservices.usgs.gov/nwis/dv/"
ODIN_MAP = "https://odin.ornl.gov/odi/map"  # public, no token (no CORS: baked)
DEPTH_TO_WATER = "72019"  # feet below land surface
RECENT_DAYS = 30  # a well whose newest reading is older is left off (offline)
YEAR_AGO_WINDOW = 7  # days either side of a year ago, for the year-ago reading
PARALLEL = 4  # concurrent USGS requests
MAX_MB = 24
UA = {
    "User-Agent": "community-camera-map/bake (+https://github.com/EnriqueCorado/community-camera-map)"
}

SOURCES: dict[str, str] = {}
LAYERS: dict[str, Layer] = {}


def _add(source: str, **kw) -> None:
    kw.setdefault("coverage", "usa")
    layer = Layer(**kw)
    LAYERS[layer.name] = layer
    SOURCES[layer.name] = source


async def _get_json(client: httpx.AsyncClient, url: str, params: dict | None = None) -> object:
    """GET JSON with a size cap and no redirects (stays on the named host);
    patient with 429/5xx."""
    last: Exception | None = None
    for attempt in range(3):
        try:
            body, _ = await fetch_capped(
                client,
                url,
                max_bytes=MAX_MB * 1024 * 1024,
                params=params,
                headers=UA,
                follow_redirects=False,
            )
            return json.loads(body)
        except ResponseTooLarge:
            raise
        except httpx.HTTPStatusError as exc:
            # 404: no such wells there; 400: a code USGS doesn't take (AS).
            # The callers' sanity checks catch a source that rejects everything.
            if exc.response.status_code in (400, 404):
                return {}
            if exc.response.status_code not in (429, 500, 502, 503, 504):
                raise
            last = exc
        except httpx.TransportError as exc:
            last = exc
        if attempt < 2:
            await asyncio.sleep(10 * (attempt + 1))
    assert last is not None
    raise last


async def _groundwater_usa(client: httpx.AsyncClient, _s: Settings) -> dict:
    today = dt.date.today()
    ago = today - dt.timedelta(days=365)
    gate = asyncio.Semaphore(PARALLEL)
    common = {"format": "json", "parameterCd": DEPTH_TO_WATER, "siteType": "GW"}

    async def one(url: str, params: dict) -> object:
        async with gate:
            return await _get_json(client, url, {**common, **params})

    states = sorted(STATES)
    latest_replies = await asyncio.gather(
        *(one(USGS_IV, {"stateCd": st, "siteStatus": "active"}) for st in states)
    )
    latest, sites = pp.iv_latest(list(zip(states, latest_replies, strict=True)))
    if len(latest) < 500:  # ~1,800 wells: a format change must not gut the layer
        raise ValueError(f"USGS groundwater: only {len(latest)} wells")
    window = {
        "statCd": "00003",  # daily mean
        "startDT": str(ago - dt.timedelta(days=YEAR_AGO_WINDOW)),
        "endDT": str(ago + dt.timedelta(days=YEAR_AGO_WINDOW)),
    }
    have = sorted({sites[s]["st"] for s in latest})
    daily = pp.dv_values(
        list(await asyncio.gather(*(one(USGS_DV, {"stateCd": st, **window}) for st in have)))
    )
    since = str(today - dt.timedelta(days=RECENT_DAYS))
    return pp.groundwater_fc(latest, daily, sites, since=since)


_add(
    "U.S. Geological Survey, USGS Water Services (waterservices.usgs.gov): instantaneous "
    "depth to water (parameter 72019) and daily values; public domain",
    name="groundwater-usa",
    title="Groundwater levels (US wells)",
    title_es="Niveles de agua subterránea (pozos de EE. UU.)",
    description=(
        "Depth to water at about 1,800 wells the USGS measures continuously, nationwide: "
        "the latest reading (last 30 days) and, for about half, whether the water is deeper or "
        "shallower than a year ago. Provisional data. California's DWR layer has many more "
        "wells there."
    ),
    description_es=(
        "Profundidad del agua en unos 1,800 pozos que el USGS mide de forma continua en todo el "
        "país: la lectura más reciente (últimos 30 días) y, para cerca de la mitad, si el agua "
        "está más profunda o menos profunda que hace un año. Datos provisionales. La capa del DWR "
        "de California tiene muchos más pozos en ese estado."
    ),
    category="groundwater",
    loader=_groundwater_usa,
    ttl=DAY,
    group="hazards",
)


async def _power_outages_usa(client: httpx.AsyncClient, _s: Settings) -> dict:
    payload = await _get_json(client, ODIN_MAP, {"scale": "COUNTY"})
    return pp.odin_counties(payload)  # empty list is legitimate: no outages reported


_add(
    "Oak Ridge National Laboratory, U.S. Dept. of Energy: ODIN (Outage Data Initiative "
    "Nationwide) public county outage summary (odin.ornl.gov), courtesy of ORNL",
    name="power-outages-usa",
    title="Power outages by county (ODIN, multi-state)",
    title_es="Cortes de luz por condado (ODIN, varios estados)",
    description=(
        "Counties where utilities that share data with the Energy Department's ODIN program "
        "report customers without power now (about 150 utilities so far; many, including "
        "PG&E, aren't in it yet, so a blank county doesn't mean no outages). Counts are "
        "meters out."
    ),
    description_es=(
        "Condados donde las compañías eléctricas que comparten datos con el programa ODIN del "
        "Departamento de Energía reportan clientes sin luz ahora (unas 150 compañías hasta ahora; "
        "muchas, incluida PG&E, todavía no participan, así que un condado en blanco no significa "
        "que no haya cortes). Las cifras son medidores sin servicio."
    ),
    category="info",
    loader=_power_outages_usa,
    ttl=600,
    group="live",
    metric=Metric("out", "count", (10, 100, 1000, 10000, 50000), "red"),
)

# CI cadence (scripts/refresh_live.py): USGS posts new readings hourly, but a
# daily bake is plenty for a slow-moving water table (and ~100 keyless
# requests a day). Outages ride the 15-minute FAST run.
DAILY = ("groundwater-usa",)
FAST = ("power-outages-usa",)
