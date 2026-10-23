"""State feeds the browser can't load on its own, baked in CI.

The state packs (states.py) only take official ArcGIS services that send CORS
headers. These sources are just as official but are HTML pages, plain JSON or
Socrata APIs without a usable geometry, so scripts/refresh_live.py fetches them
on a schedule (see HOURLY / DAILY / WEEKLY below) and the site serves the
result as a static GeoJSON file:

  - ar-burn-bans: Arkansas Forestry Division's burn-ban page (HTML) joined to
    Census TIGERweb county shapes.
  - reservoirs-usa: % full for ~400 reservoirs: the 12 western states from the
    USDA NRCS Air & Water Database (AWDB, which republishes Reclamation, Corps
    and local operators' daily storage) and Texas from Water Data for Texas
    (TWDB). Each source is fetched on its own; one failing doesn't drop the
    other.
  - ny/pa/tx-child-care-centers: state licensing lists, centers only (homes
    are never kept: see _state_bakes_parse.py). Texas publishes no
    coordinates, so its addresses go through the Census geocoder, reusing last
    week's coordinates for unchanged addresses.

One exception: tx-burn-bans turned out to have a live official ArcGIS service
(Texas A&M Forest Service, CORS-enabled), so it's a browser View like the
state packs instead of a bake of the daily BURNBAN.txt file.

Sources skipped on purpose (robots.txt disallows automated API use, or a key
is required): USBR RISE (/rise/api) and the USGS Water Data OGC items API.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import ssl
from pathlib import Path

import certifi
import httpx

from ...core.config import Settings
from ...core.http import fetch_capped
from .. import arcgis
from ..service import BAKED_LAYERS, Layer, View
from . import _state_bakes_parse as sb
from .services import geocode

logger = logging.getLogger(__name__)

HOUR = 3600
DAY = 24 * HOUR
WEEK = 7 * DAY
# Identifying UA (some state CDNs refuse clients that don't say "Mozilla").
UA = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; community-camera-map/bake; "
        "+https://github.com/EnriqueCorado/community-camera-map)"
    )
}

# --- Sources (one constant each) ----------------------------------------------
TFS_BURN_BANS = "https://gis.tfs.tamu.edu/arcgis/rest/services/EOC/BurnBan/FeatureServer/0"
AR_FIRE_INFO = "https://mip.agri.arkansas.gov/agtools/Forestry/Fire_Info"
TIGER_COUNTIES = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1"
)
TWDB_RESERVOIRS = "https://www.waterdatafortexas.org/reservoirs/recent-conditions.json"
AWDB = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1"
NY_CHILD_CARE = "https://data.ny.gov/resource/cb42-qumz.json"
PA_CHILD_CARE = "https://data.pa.gov/resource/ajn5-kaxt.json"
TX_CHILD_CARE = "https://data.texas.gov/resource/bc5r-88dy.json"

MB = 1024 * 1024


async def _get(client: httpx.AsyncClient, url: str, max_mb: int, **kw) -> bytes:
    body, _ = await fetch_capped(client, url, max_bytes=max_mb * MB, headers=UA, **kw)
    return body


def _enough(name: str, feats: list, minimum: int) -> dict:
    """Never publish a gutted layer: an upstream format change must fail the
    refresh (the last good file stays) instead of emptying the map."""
    out = sb.fc(feats)
    if len(out["features"]) < minimum:
        raise ValueError(f"{name}: only {len(out['features'])} features (expected >= {minimum})")
    return out


# --- Arkansas burn bans ----------------------------------------------------------


# mip.agri.arkansas.gov sends only its leaf certificate (no intermediate), which
# browsers patch over but Python can't. Verification stays on: the missing
# public Sectigo intermediate (from the leaf's AIA URL, chains to Sectigo Root
# R46 in certifi; expires 2036) is added to the normal trust store for that
# one request, nothing else changes.
AR_INTERMEDIATE = (
    Path(__file__).resolve().parent.parent / "data/certs/sectigo-public-server-ov-r36.pem"
)


def _ar_tls() -> ssl.SSLContext:
    ctx = ssl.create_default_context(cafile=certifi.where())
    ctx.load_verify_locations(cafile=str(AR_INTERMEDIATE))
    return ctx


async def _ar_burn_bans(client: httpx.AsyncClient, _s: Settings) -> dict:
    async with httpx.AsyncClient(
        verify=_ar_tls(), timeout=60.0, follow_redirects=False
    ) as ar_client:  # the page doesn't redirect; refusing redirects keeps it on this host
        body = await _get(ar_client, AR_FIRE_INFO, 4, follow_redirects=False)
    page = body.decode("utf-8", errors="replace")
    as_of, status = sb.ar_burn_bans(page)
    counties = await arcgis.fetch_layer(
        client,
        TIGER_COUNTIES,
        where="STATE='05'",
        out_fields="NAME,BASENAME",
        simplify=0.003,
    )
    # A day with no bans is real (wet winters): publish the empty layer.
    return sb.fc(sb.ar_county_features(counties, status, as_of))


# --- Reservoirs (TWDB + NRCS AWDB) ------------------------------------------------


async def _twdb(client: httpx.AsyncClient, today: dt.date) -> list[dict]:
    return sb.twdb_reservoirs(json.loads(await _get(client, TWDB_RESERVOIRS, 8)), today)


async def _awdb(client: httpx.AsyncClient, today: dt.date) -> list[dict]:
    stations = json.loads(
        await _get(
            client,
            f"{AWDB}/stations",
            8,
            params={
                "networkCds": "BOR",
                "elements": "RESC",
                "returnReservoirMetadata": "true",
                "activeOnly": "true",
            },
        )
    )
    trips = [
        s["stationTriplet"] for s in stations if isinstance(s, dict) and s.get("stationTriplet")
    ]
    daily: dict[str, dict] = {}
    monthly: dict[str, dict] = {}
    for i in range(0, len(trips), 60):  # keep each URL well under server limits
        chunk = ",".join(trips[i : i + 60])
        for duration, begin, extra, into in (
            ("DAILY", today - dt.timedelta(days=10), {}, daily),
            (
                "MONTHLY",
                today - dt.timedelta(days=100),
                {"centralTendencyType": "AVERAGE"},
                monthly,
            ),
        ):
            body = await _get(
                client,
                f"{AWDB}/data",
                16,
                params={
                    "stationTriplets": chunk,
                    "elements": "RESC",
                    "duration": duration,
                    "beginDate": begin.isoformat(),
                    "endDate": today.isoformat(),
                    **extra,
                },
            )
            into.update(sb.awdb_latest(json.loads(body)))
    return sb.awdb_reservoirs(stations, daily, monthly, today)


async def _reservoirs_usa(client: httpx.AsyncClient, _s: Settings) -> dict:
    today = dt.date.today()
    feats: list[dict] = []
    results = await asyncio.gather(
        _awdb(client, today), _twdb(client, today), return_exceptions=True
    )
    for label, res in zip(("NRCS AWDB", "TWDB"), results, strict=True):
        if isinstance(res, BaseException):
            logger.warning("reservoirs-usa: %s failed (%s)", label, type(res).__name__)
            continue
        feats.extend(res)
    return _enough("reservoirs-usa", feats, 150)


# --- Child care centers (Socrata) --------------------------------------------------


async def _socrata(
    client: httpx.AsyncClient, url: str, where: str, select: str, limit: int = 50000
) -> list:
    body = await _get(
        client,
        url,
        48,
        params={"$where": where, "$select": select, "$limit": str(limit), "$order": ":id"},
    )
    rows = json.loads(body)
    if not isinstance(rows, list):
        raise ValueError("Socrata: expected a list")
    if len(rows) >= limit:
        raise ValueError("Socrata: result hit the row limit (would be truncated)")
    return rows


async def _ny_child_care(client: httpx.AsyncClient, _s: Settings) -> dict:
    rows = await _socrata(
        client,
        NY_CHILD_CARE,
        "program_type in ('DCC','SDCC','SACC')",
        "program_type,facility_status,facility_name,street_number,street_name,city,"
        "phone_number,total_capacity,latitude,longitude",
    )
    return _enough("ny-child-care-centers", sb.ny_child_care(rows), 2000)


async def _pa_child_care(client: httpx.AsyncClient, _s: Settings) -> dict:
    rows = await _socrata(
        client,
        PA_CHILD_CARE,
        f"provider_type = '{sb.PA_CENTER}'",
        "provider_type,facility_name,facility_address,facility_city,facility_phone,"
        "capacity,star_level,geocoded_column",
    )
    return _enough("pa-child-care-centers", sb.pa_child_care(rows), 2000)


def _previous_points(name: str) -> dict[str, tuple[str, float, float]]:
    """id -> (address, lon, lat) from the last baked file, to skip re-geocoding."""
    try:
        old = json.loads((BAKED_LAYERS / f"{name}.geojson").read_text())
        out = {}
        for f in old.get("features", []):
            p, (lon, lat) = f["properties"], f["geometry"]["coordinates"]
            if p.get("id"):
                out[str(p["id"])] = (str(p.get("address", "")), float(lon), float(lat))
        return out
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return {}


async def _tx_child_care(client: httpx.AsyncClient, _s: Settings) -> dict:
    rows = await _socrata(
        client,
        TX_CHILD_CARE,
        f"operation_type = '{sb.TX_CENTER}' AND operation_status = 'Y'",
        "operation_id,operation_number,operation_type,operation_name,address_line,city,"
        "zipcode,phone_number,total_capacity,hours_of_operation,"
        "accepts_child_care_subsidies,temporarily_closed,operation_status",
    )
    recs = sb.tx_child_care(rows)
    prev = _previous_points("tx-child-care-centers")
    feats: list[dict | None] = []
    todo = []
    for r in recs:
        hit = prev.get(r["id"])
        if hit and hit[0] == r["a"]:
            feats.append(sb.tx_feature(r, hit[1], hit[2]))
        else:
            todo.append(r)
    if todo:
        for rec, f in zip(todo, await geocode(client, todo, zip_fallback=False), strict=True):
            if f:
                feats.append(sb.tx_feature(rec, *f["geometry"]["coordinates"]))
    return _enough("tx-child-care-centers", feats, 6000)


# --- Registry -------------------------------------------------------------------------

# Attribution shown in the About page (merged into scripts/bake.py SOURCES).
SOURCES: dict[str, str] = {}
LAYERS: dict[str, Layer] = {}


def _add(source: str, **kw) -> None:
    layer = Layer(**kw)
    LAYERS[layer.name] = layer
    SOURCES[layer.name] = source


_add(
    "Texas A&M Forest Service, county burn bans (gis.tfs.tamu.edu, updated as counties report)",
    name="tx-burn-bans",
    title="County burn bans (Texas)",
    title_es="Prohibiciones de quemas por condado (Texas)",
    description=(
        "Texas counties under a burn ban right now and since when, as reported to the Texas "
        "A&M Forest Service. County judges issue and lift bans; check the county for details."
    ),
    description_es=(
        "Condados de Texas con prohibición de quemas en este momento y desde cuándo, según lo "
        "reportado al Texas A&M Forest Service. Los jueces de condado emiten y levantan las "
        "prohibiciones; consulte con el condado para más detalles."
    ),
    category="info",
    coverage="TX",
    view=View(
        TFS_BURN_BANS,
        {"County": "name", "StartDate": "since_date"},
        "polygon",
        min_zoom=5,
        where="BurnBan = 'Yes'",
        max_features=300,
        simplify=True,
        refresh_s=HOUR,
        post="fmt",
    ),
    group="live",
)
_add(
    "Arkansas Department of Agriculture, Forestry Division (burn bans and wildfire danger "
    "page); county shapes: U.S. Census TIGERweb",
    name="ar-burn-bans",
    title="County burn bans (Arkansas)",
    title_es="Prohibiciones de quemas por condado (Arkansas)",
    description=(
        "Arkansas counties under a burn ban issued by the county judge, with the Forestry "
        "Division's wildfire danger level. Updated daily."
    ),
    description_es=(
        "Condados de Arkansas con prohibición de quemas emitida por el juez del condado, con el "
        "nivel de peligro de incendios forestales de la Forestry Division. Se actualiza a diario."
    ),
    category="info",
    coverage="AR",
    loader=_ar_burn_bans,
    ttl=HOUR,
    group="live",
)
_add(
    "USDA NRCS Air & Water Database (reservoir storage reported by Reclamation, USACE and "
    "local operators); Texas: Texas Water Development Board, Water Data for Texas",
    name="reservoirs-usa",
    title="Reservoir levels (West & Texas)",
    title_es="Niveles de los embalses (Oeste y Texas)",
    description=(
        "How full ~400 reservoirs are today, as % of capacity: the 12 western states "
        "(USDA NRCS) and Texas (TWDB). Provisional daily data."
    ),
    description_es=(
        "Qué tan llenos están hoy ~400 embalses, como % de su capacidad: los 12 estados del Oeste "
        "(USDA NRCS) y Texas (TWDB). Datos diarios provisionales."
    ),
    category="reservoir",
    coverage="usa",
    loader=_reservoirs_usa,
    ttl=6 * HOUR,
    group="weather",
)
_add(
    "New York State OCFS, Child Care Regulated Programs (data.ny.gov); centers and "
    "school-age programs only",
    name="ny-child-care-centers",
    title="Licensed child care centers (New York)",
    title_es="Guarderías con licencia (Nueva York)",
    description=(
        "OCFS-licensed day care centers, small day care centers and school-age programs "
        "across New York State. Family day care homes are not shown."
    ),
    description_es=(
        "Guarderías, guarderías pequeñas y programas para niños en edad escolar con licencia de "
        "OCFS en todo el estado de Nueva York. No se muestran las guarderías familiares en casas."
    ),
    category="point",
    coverage="NY",
    loader=_ny_child_care,
    ttl=WEEK,
    group="help",
)
_add(
    "Pennsylvania DHS, Child Care Providers (data.pa.gov); centers only",
    name="pa-child-care-centers",
    title="Licensed child care centers (Pennsylvania)",
    title_es="Guarderías con licencia (Pensilvania)",
    description=(
        "DHS-certified child care centers across Pennsylvania, with Keystone STARS level. "
        "Family and group child care homes are not shown."
    ),
    description_es=(
        "Centros de cuidado infantil certificados por el DHS en toda Pensilvania, con su nivel de "
        "Keystone STARS. No se muestran los hogares de cuidado infantil familiares ni grupales."
    ),
    category="point",
    coverage="PA",
    loader=_pa_child_care,
    ttl=WEEK,
    group="help",
)
_add(
    "Texas HHSC Child Care Regulation, operations list (data.texas.gov); licensed centers "
    "only, geocoded with the U.S. Census Geocoder",
    name="tx-child-care-centers",
    title="Licensed child care centers (Texas)",
    title_es="Guarderías con licencia (Texas)",
    description=(
        "HHSC-licensed child care centers operating in Texas. Licensed, registered and "
        "listed child-care homes are not shown."
    ),
    description_es=(
        "Centros de cuidado infantil con licencia de HHSC que operan en Texas. No se muestran los "
        "hogares de cuidado infantil con licencia, registrados ni inscritos."
    ),
    category="point",
    coverage="TX",
    loader=_tx_child_care,
    ttl=WEEK,
    group="help",
)

# CI cadence (scripts/refresh_live.py). Burn bans are one small page, posted
# mid-morning: hourly keeps them current. Reservoirs post daily readings.
# Child-care lists change slowly and Texas needs geocoding: weekly.
HOURLY = ("ar-burn-bans",)
DAILY = ("reservoirs-usa",)
WEEKLY = ("ny-child-care-centers", "pa-child-care-centers", "tx-child-care-centers")
