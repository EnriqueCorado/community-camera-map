"""Overlay registry + cache.

Three kinds of layer:
  - static  : a GeoJSON file in app/cameras/data/ (e.g. the ALPR dataset)
  - arcgis   : fetched + paginated from an ArcGIS FeatureServer, then cached
  - census   : ACS demographics joined to TIGERweb geometry, then cached

Remote layers are cached in-memory with a long TTL (they change rarely) and a
per-layer lock so a cold cache doesn't fetch the same layer twice at once.
Adding a layer is one entry in LAYERS — the API and the frontend's layer panel
pick it up automatically.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from ..core.config import Settings
from ..core.http import fetch_capped, post_capped
from . import arcgis, census, haze, transforms

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "cameras" / "data"
ARCGIS_BASE = "https://services.arcgis.com/EeYBJFxLdUojipYa/arcgis/rest/services"

Loader = Callable[[httpx.AsyncClient, Settings], Awaitable[dict]]


@dataclass(frozen=True)
class Layer:
    name: str
    title: str
    description: str
    # frontend rendering hint: alpr|boundary|landuse|census|fire|weather|quake|point|webcam|…
    category: str
    file: str | None = None
    loader: Loader | None = None
    # advisory flag so the frontend can show "needs setup" instead of an error
    requires_key: bool = False
    # per-layer cache TTL; None => settings.overlay_ttl_seconds (for live feeds)
    ttl: int | None = None
    # tiles drawn straight from a public tile server in the browser (no GeoJSON)
    client_side: bool = False
    # serves another layer's data (same features, styled differently in the UI)
    same_data_as: str | None = None


# County bounding box (WGS84) for spatially filtering large statewide/national layers.
STANISLAUS_BBOX = "-121.6,37.3,-120.3,38.0"


def _arcgis(service_path: str) -> Loader:
    """A FeatureServer layer on the Stanislaus County ArcGIS org."""

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        return await arcgis.fetch_layer(client, f"{ARCGIS_BASE}/{service_path}")

    return load


def _arcgis_url(
    service_url: str,
    where: str = "1=1",
    bbox: str | None = None,
    page_size: int = arcgis.PAGE,
    simplify: float | None = None,
) -> Loader:
    """A FeatureServer/MapServer layer on any ArcGIS host (NIFC, FEMA, CAL FIRE…)."""

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        return await arcgis.fetch_layer(
            client, service_url, where=where, bbox=bbox, page_size=page_size, simplify=simplify
        )

    return load


def _geojson(url: str) -> Loader:
    """A source that already returns GeoJSON (NWS, NIFC geojson query)."""

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        body, _ = await fetch_capped(client, url, max_bytes=arcgis.MAX_BYTES)
        return json.loads(body)

    return load


def _arcgis_transform(
    service_url: str, transform: Callable[[object], dict], where: str = "1=1"
) -> Loader:
    """An ArcGIS layer whose GeoJSON is then cleaned/filtered by `transform`."""

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        return transform(await arcgis.fetch_layer(client, service_url, where=where))

    return load


CALIFORNIA_BBOX = (-124.5, 32.5, -114.1, 42.1)

# OpenStreetMap places, fetched server-side for the Stanislaus region (daily in
# CI). Public Overpass servers rate-limit hard and only one allows browsers, so
# visitors never query Overpass directly. Mirrors are tried in order.
OVERPASS_MIRRORS = (  # the OSM community's main instance first; third-party last
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)
OSM_REGION = (37.13, -121.56, 38.08, -120.38)  # south, west, north, east
OSM_PLACES = {  # layer -> (title, description noun, Overpass selector)
    "aed": ("Defibrillators (AED)", "Public defibrillators", '["emergency"="defibrillator"]'),
    "drinking-water": ("Drinking fountains", "Drinking water", '["amenity"="drinking_water"]'),
    "restrooms": ("Public restrooms", "Public toilets", '["amenity"="toilets"]'),
    "ev-chargers": (
        "EV chargers",
        "Electric-vehicle charging stations",
        '["amenity"="charging_station"]',
    ),
    "libraries": ("Libraries", "Public libraries", '["amenity"="library"]'),
    "playgrounds": ("Playgrounds", "Playgrounds", '["leisure"="playground"]'),
    "pharmacies": ("Pharmacies", "Pharmacies", '["amenity"="pharmacy"]'),
    "fire-stations": ("Fire stations", "Fire stations", '["amenity"="fire_station"]'),
    "free-wifi": (
        "Free Wi-Fi",
        "Free public Wi-Fi hotspots",
        '["internet_access"~"^(wlan|yes)$"]["internet_access:fee"="no"]',
    ),
    "food-banks": (
        "Food banks & pantries",
        "Food banks and pantries",
        '["social_facility"="food_bank"]',
    ),
    "clinics": ("Clinics", "Health clinics", '["amenity"="clinic"]'),
    "community-centers": (
        "Community centers",
        "Community centers",
        '["amenity"="community_centre"]',
    ),
    "farmers-markets": ("Markets", "Farmers' and public markets", '["amenity"="marketplace"]'),
}


# Python twins of the Overpass selectors above: one UNION query fetches every
# category at once, and each layer keeps its own elements by tag.
OSM_MATCH: dict[str, Callable[[dict], bool]] = {
    "aed": lambda t: t.get("emergency") == "defibrillator",
    "drinking-water": lambda t: t.get("amenity") == "drinking_water",
    "restrooms": lambda t: t.get("amenity") == "toilets",
    "ev-chargers": lambda t: t.get("amenity") == "charging_station",
    "libraries": lambda t: t.get("amenity") == "library",
    "playgrounds": lambda t: t.get("leisure") == "playground",
    "pharmacies": lambda t: t.get("amenity") == "pharmacy",
    "fire-stations": lambda t: t.get("amenity") == "fire_station",
    "free-wifi": lambda t: t.get("internet_access") in ("wlan", "yes")
    and t.get("internet_access:fee") == "no",
    "food-banks": lambda t: t.get("social_facility") == "food_bank",
    "clinics": lambda t: t.get("amenity") == "clinic",
    "community-centers": lambda t: t.get("amenity") == "community_centre",
    "farmers-markets": lambda t: t.get("amenity") == "marketplace",
}

_osm_union: dict = {}  # {"at": monotonic, "elements": [...]}
_osm_lock = asyncio.Lock()
OSM_UNION_TTL = 3600


async def _osm_elements(client: httpx.AsyncClient) -> list[dict]:
    """Every OSM place in the region, from ONE union query shared by all OSM
    layers (cached an hour) — Overpass allows ~2 requests per IP at a time."""
    async with _osm_lock:
        if _osm_union and time.monotonic() - _osm_union["at"] < OSM_UNION_TTL:
            return _osm_union["elements"]
        s, w, n, e = OSM_REGION
        union = "".join(f"nwr{sel}({s},{w},{n},{e});" for _t, _n, sel in OSM_PLACES.values())
        query = f"[out:json][timeout:120];({union});out center tags;"
        last: Exception | None = None
        for attempt in range(2):  # two passes over the mirrors, with a pause
            for url in OVERPASS_MIRRORS:
                try:
                    body = await post_capped(
                        client, url, data={"data": query}, max_bytes=48 * 1024 * 1024, timeout_s=150
                    )
                    payload = json.loads(body)
                    # Overpass reports timeouts/out-of-memory as HTTP 200 + "remark"
                    # with partial (or no) elements: never treat that as data.
                    if not isinstance(payload, dict) or payload.get("remark"):
                        raise ValueError("Overpass returned a remark (partial result)")
                    elements = payload.get("elements") or []
                    _osm_union.update(at=time.monotonic(), elements=elements)
                    return elements
                except (httpx.HTTPError, ValueError) as exc:
                    last = exc
            if attempt == 0:
                await asyncio.sleep(10)
        raise httpx.HTTPError(f"all Overpass mirrors failed ({type(last).__name__})")


def _overpass(name: str) -> Loader:
    match = OSM_MATCH[name]

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        elements = await _osm_elements(client)
        mine = [el for el in elements if isinstance(el, dict) and match(el.get("tags") or {})]
        return transforms.osm_points({"elements": mine}, region=OSM_REGION)

    return load


def _caltrans(kind: str, transform: Callable[[object], dict]) -> Loader:
    """A Caltrans cwwp2 feed (lcs, cms, rwis, cc…) for all 12 districts.
    URL quirk: the directory is d1…d12, the file is D01…D12. A district that
    fails is skipped; the layer fails only if every district does."""

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        async def one(d: int) -> dict:
            url = f"https://cwwp2.dot.ca.gov/data/d{d}/{kind}/{kind}StatusD{d:02d}.json"
            body, _ = await fetch_capped(client, url, max_bytes=arcgis.MAX_BYTES)
            return transforms.parse_caltrans_json(body)

        results = await asyncio.gather(*(one(d) for d in range(1, 13)), return_exceptions=True)
        ok = [r for r in results if isinstance(r, dict)]
        if not ok:
            raise next(r for r in results if isinstance(r, BaseException))
        if len(ok) < 12:  # partial statewide data gets cached for the TTL: say so
            logger.warning("Caltrans %s: %d of 12 districts failed", kind, 12 - len(ok))
        return transform({"data": [row for r in ok for row in r.get("data", [])]})

    return load


def _arcgis_select(
    service_url: str,
    transform: Callable[[object], dict],
    where: str = "1=1",
    bbox: str | None = STANISLAUS_BBOX,
    simplify: float | None = None,
) -> Loader:
    """An ArcGIS layer reduced to a fixed set of fields by `transform`."""

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        fc = await arcgis.fetch_layer(
            client, service_url, where=where, bbox=bbox, simplify=simplify
        )
        return transform(fc)

    return load


# Browser-live layers: (name, title, description, category).
BROWSER_LIVE = (
    ("iss", "Space station (ISS)", "Live position of the International Space Station.", "space"),
    (
        "satellites",
        "Satellites overhead",
        "The ~150 brightest satellites, computed live from CelesTrak orbits.",
        "space",
    ),
    ("trains", "Amtrak trains", "Live Amtrak train positions (via Amtraker).", "train"),
    (
        "wildlife",
        "Wildlife sightings",
        "Recent iNaturalist observations where you're looking.",
        "nature",
    ),
    (
        "wikipedia",
        "Wikipedia places",
        "Wikipedia articles about places near the map's center.",
        "wiki",
    ),
    (
        "weather-now",
        "Temperature & wind",
        "Current conditions on a grid across the view (Open-Meteo).",
        "weather-now",
    ),
    (
        "air-now",
        "Air quality (live)",
        "Current US AQI on a grid across the view (Open-Meteo).",
        "aqi",
    ),
)


def _text_transform(url: str, transform: Callable[[str], dict]) -> Loader:
    """A text (e.g. CSV) source normalized to GeoJSON."""

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        body, _ = await fetch_capped(client, url, max_bytes=arcgis.MAX_BYTES)
        return transform(body.decode("utf-8", errors="replace"))

    return load


def _json_transform(url: str, transform: Callable[[object], dict]) -> Loader:
    """A non-GeoJSON JSON source normalized to GeoJSON (Caltrans, USGS, NID)."""

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        body, _ = await fetch_capped(client, url, max_bytes=arcgis.MAX_BYTES)
        return transform(json.loads(body))

    return load


WINDY_URL = "https://api.windy.com/webcams/api/v3/webcams"
WINDY_RADIUS_KM = 150  # around Modesto
WINDY_MAX_PAGES = 25  # 50 per page (~970 within 150 km, mostly Caltrans re-lists)
# The baked Caltrans camera list, used to drop Windy's re-lists of them.
BAKED_CAMERAS = Path(__file__).resolve().parents[3] / "frontend/public/data/cameras.json"


# Baked static copies of each layer (fallback when an upstream is down).
BAKED_LAYERS = BAKED_CAMERAS.parent / "layers"
# Never fall back to these: the committed file is an empty placeholder.
LIVE_ONLY = {"flights"}


# When each baked layer was actually fetched (written by bake.py/refresh_live.py).
# File mtimes are useless here: a git checkout resets them all to "now".
LAYER_TIMES = BAKED_CAMERAS.parent / "layer_times.json"


def _baked_times() -> dict[str, float]:
    try:
        data = json.loads(LAYER_TIMES.read_text())
        return {k: float(v) for k, v in data.items()} if isinstance(data, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def record_layer_times(names: list[str]) -> None:
    """Note that `names` were just fetched (merging with earlier entries)."""
    times = _baked_times()
    now = time.time()
    times.update({n: now for n in names})
    LAYER_TIMES.write_text(json.dumps(times, sort_keys=True, indent=0))


def _known_cameras() -> list[tuple[float, float]]:
    try:
        cams = json.loads(BAKED_CAMERAS.read_text()).get("cameras", [])
        return [(float(c["latitude"]), float(c["longitude"])) for c in cams]
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return []  # title-pattern dedupe still applies


async def _windy(client: httpx.AsyncClient, s: Settings) -> dict:
    """Windy public webcams near Modesto (needs a free key, sent as a header)."""
    if not s.windy_api_key:
        raise census.CensusKeyMissing("Set CAM_WINDY_API_KEY (free: https://api.windy.com/keys)")
    rows: list = []
    for page in range(WINDY_MAX_PAGES):
        body, _ = await fetch_capped(
            client,
            WINDY_URL,
            max_bytes=4 * 1024 * 1024,
            params={
                "nearby": f"{haze.CENTER[0]},{haze.CENTER[1]},{WINDY_RADIUS_KM}",
                "include": "location,urls,player",
                "limit": 50,
                "offset": page * 50,
            },
            headers={"x-windy-api-key": s.windy_api_key},  # header only: never in URLs/logs
        )
        payload = json.loads(body)
        batch = payload.get("webcams", []) if isinstance(payload, dict) else []
        rows.extend(batch)
        total = payload.get("total") if isinstance(payload, dict) else None
        if len(batch) < 50 or (isinstance(total, int) and len(rows) >= total):
            break
    return transforms.windy_webcams({"webcams": rows}, known=_known_cameras())


async def _airnow(client: httpx.AsyncClient, s: Settings) -> dict:
    """AirNow current air-quality observations near the county (needs a key)."""
    if not s.airnow_api_key:
        raise census.CensusKeyMissing(
            "Set CAM_AIRNOW_API_KEY (free: https://docs.airnowapi.org/account/request/)"
        )
    feats = []
    seen: set[tuple] = set()
    for zip_code in s.airnow_zips:
        url = (
            "https://www.airnowapi.org/aq/observation/zipCode/current/"
            f"?format=application/json&zipCode={zip_code}&distance=25&API_KEY={s.airnow_api_key}"
        )
        body, _ = await fetch_capped(client, url, max_bytes=2 * 1024 * 1024)
        for obs in json.loads(body):
            lat, lon = obs.get("Latitude"), obs.get("Longitude")
            if lat is None or lon is None:
                continue
            key = (round(float(lat), 4), round(float(lon), 4), obs.get("ParameterName"))
            if key in seen:
                continue
            seen.add(key)
            feats.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
                    "properties": {
                        "parameter": obs.get("ParameterName"),
                        "aqi": obs.get("AQI"),
                        "category": (obs.get("Category") or {}).get("Name"),
                        "area": obs.get("ReportingArea"),
                    },
                }
            )
    return {"type": "FeatureCollection", "features": feats}


async def _census(client: httpx.AsyncClient, settings: Settings) -> dict:
    return await census.fetch_tracts(client, settings)


NIFC = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services"


LAYERS: dict[str, Layer] = {
    "alpr": Layer(
        name="alpr",
        title="License plate readers",
        description=(
            "Automated license plate readers (Flock, Vigilant, others) "
            "from OpenStreetMap / DeFlock."
        ),
        category="alpr",
        file="alpr_ca.geojson",
    ),
    "city-limits": Layer(
        name="city-limits",
        title="City limits",
        description="Incorporated city boundaries in Stanislaus County.",
        category="boundary",
        loader=_arcgis("City_Limits_AGOL/FeatureServer/0"),
    ),
    "general-plan": Layer(
        name="general-plan",
        title="General plan land use",
        description="Stanislaus County general plan land-use designations.",
        category="landuse",
        loader=_arcgis("General_Plan/FeatureServer/0"),
    ),
    "zoning": Layer(
        name="zoning",
        title="Zoning",
        description="Stanislaus County zoning districts.",
        category="landuse",
        loader=_arcgis("Zoning_AGOL/FeatureServer/0"),
    ),
    "annexations": Layer(
        name="annexations",
        title="Annexations (growth)",
        description="LAFCO annexations — the mappable proxy for city growth/development.",
        category="boundary",
        loader=_arcgis("Annexations/FeatureServer/6"),
    ),
    "parks": Layer(
        name="parks",
        title="Parks",
        description="Parks and recreation areas in Stanislaus County.",
        category="point",
        loader=_arcgis("Parks_Hosted/FeatureServer/0"),
    ),
    "schools": Layer(
        name="schools",
        title="Public schools",
        description="Public schools (NCES) in Stanislaus County.",
        category="point",
        loader=_arcgis("Public_School_by_NCES/FeatureServer/0"),
    ),
    "census": Layer(
        name="census",
        title="Census (income)",
        description="ACS 5-year tract demographics (median household income, population, age).",
        category="census",
        loader=_census,
        requires_key=True,
    ),
    "census-spanish": Layer(
        name="census-spanish",
        title="Spanish spoken at home",
        description="Share of residents (5+) who speak Spanish at home, by census tract (ACS).",
        category="census",
        requires_key=True,
        same_data_as="census",
    ),
    "census-poverty": Layer(
        name="census-poverty",
        title="Below the poverty line",
        description="Share of residents with income below the poverty line, by census tract (ACS).",
        category="census",
        requires_key=True,
        same_data_as="census",
    ),
    "census-renters": Layer(
        name="census-renters",
        title="Renters",
        description="Share of homes that are renter-occupied, by census tract (ACS).",
        category="census",
        requires_key=True,
        same_data_as="census",
    ),
    "census-foreign-born": Layer(
        name="census-foreign-born",
        title="Born outside the US",
        description="Share of residents born outside the United States, by census tract (ACS).",
        category="census",
        requires_key=True,
        same_data_as="census",
    ),
    # --- Public safety & hazards ---
    "hospitals": Layer(
        name="hospitals",
        title="Hospitals",
        description="Hospitals in Stanislaus County (HIFLD).",
        category="point",
        loader=_arcgis_url(
            "https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Hospitals_hifld/FeatureServer/0",
            where="COUNTY='STANISLAUS' AND STATE='CA'",
        ),
    ),
    "law-enforcement": Layer(
        name="law-enforcement",
        title="Law enforcement",
        description="Law enforcement facilities in Stanislaus County (HIFLD).",
        category="point",
        loader=_arcgis_url(
            "https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Local_Law_Enforcement_Locations_RAPT/FeatureServer/0",
            where="COUNTY='STANISLAUS'",
        ),
    ),
    "flood": Layer(
        name="flood",
        title="FEMA flood zones",
        description="FEMA National Flood Hazard Layer — special flood hazard areas.",
        category="hazard",
        loader=_arcgis_url(
            "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
            bbox=STANISLAUS_BBOX,
            page_size=500,  # FEMA 500s on larger geometry pages
            simplify=0.0003,  # thin dense flood polygons for a lighter payload
        ),
    ),
    "fire-hazard": Layer(
        name="fire-hazard",
        title="Fire hazard severity",
        description="CAL FIRE Fire Hazard Severity Zones (State Responsibility Area).",
        category="hazard",
        loader=_arcgis_url(
            "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/FHSZSRA_23_3/FeatureServer/0",
            bbox=STANISLAUS_BBOX,
            simplify=0.0005,  # dense fire-zone polygons — thin for a lighter payload
        ),
    ),
    "enviroscreen": Layer(
        name="enviroscreen",
        title="Pollution burden",
        description="CalEnviroScreen 4.0 overall percentile by census tract (OEHHA).",
        category="enviroscreen",
        loader=_arcgis_url(
            "https://services1.arcgis.com/PCHfdHz4GlDNAhBb/arcgis/rest/services/CalEnviroScreen_4_0_Results_/FeatureServer/0",
            bbox=STANISLAUS_BBOX,
        ),
    ),
    # --- Live feeds (short TTL) ---
    "wildfire": Layer(
        name="wildfire",
        title="Wildfire incidents",
        description="Active California wildfire incidents (NIFC / WFIGS).",
        category="fire",
        loader=_arcgis_url(
            f"{NIFC}/WFIGS_Incident_Locations_Current/FeatureServer/0",
            where="POOState='US-CA'",
        ),
        ttl=300,
    ),
    "weather-alerts": Layer(
        name="weather-alerts",
        title="Weather alerts",
        description="Active National Weather Service alerts for California.",
        category="weather",
        loader=_geojson("https://api.weather.gov/alerts/active?area=CA"),
        ttl=120,
    ),
    "quakes": Layer(
        name="quakes",
        title="Earthquakes (24h)",
        description="USGS earthquakes, magnitude 1+, past 24 hours (all US; CA relevant).",
        category="quake",
        loader=_geojson(
            "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
        ),
        ttl=120,
    ),
    "streamflow": Layer(
        name="streamflow",
        title="River gauges",
        description="USGS real-time streamflow/stage at area river gauges (flood sentinel).",
        category="point",
        loader=_json_transform(
            "https://waterservices.usgs.gov/nwis/iv/?format=json"
            "&sites=11290000,11289650,11303000,11300000&parameterCd=00060,00065",
            transforms.usgs_nwis,
        ),
        ttl=300,
    ),
    "lane-closures": Layer(
        name="lane-closures",
        title="Lane closures",
        description="Caltrans active lane closures, statewide.",
        category="roadops",
        loader=_caltrans("lcs", transforms.caltrans_lcs),
        ttl=180,
    ),
    "message-signs": Layer(
        name="message-signs",
        title="Highway message signs",
        description="Caltrans changeable message signs and their current text, statewide.",
        category="point",
        loader=_caltrans("cms", transforms.caltrans_cms),
        ttl=180,
    ),
    "air-quality": Layer(
        name="air-quality",
        title="Air quality monitors (AirNow)",
        description="Current AirNow air-quality observations (AQI) across the county.",
        category="point",
        loader=_airnow,
        requires_key=True,
        ttl=900,
    ),
    # --- Transit (static GTFS, converted to GeoJSON) ---
    "transit-routes": Layer(
        name="transit-routes",
        title="Transit routes",
        description="MOVE Stanislaus / Modesto Area Express bus route shapes.",
        category="line",
        file="transit_routes.geojson",
    ),
    "transit-stops": Layer(
        name="transit-stops",
        title="Transit stops",
        description="MOVE Stanislaus / Modesto Area Express bus stops.",
        category="point",
        file="transit_stops.geojson",
    ),
    # --- Boundaries ---
    "supervisor-districts": Layer(
        name="supervisor-districts",
        title="Supervisor districts",
        description="Stanislaus County Board of Supervisors districts.",
        category="boundary",
        loader=_arcgis("Supervisorial_Districts_AGOL/FeatureServer/8"),
        ttl=24 * 3600,
    ),
    "zip-codes": Layer(
        name="zip-codes",
        title="ZIP codes",
        description="ZIP Code Tabulation Areas (Census TIGERweb).",
        category="boundary",
        loader=_arcgis_url(
            "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
            "PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11",
            bbox=STANISLAUS_BBOX,
            simplify=0.0005,
        ),
        ttl=24 * 3600,
    ),
    "congressional-districts": Layer(
        name="congressional-districts",
        title="Congressional districts",
        description="U.S. congressional districts (Census TIGERweb).",
        category="boundary",
        loader=_arcgis_url(
            "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0",
            where="STATE='06'",
            bbox=STANISLAUS_BBOX,
            simplify=0.001,
        ),
        ttl=24 * 3600,
    ),
    # --- Infrastructure ---
    "airports": Layer(
        name="airports",
        title="Airports",
        description="Public-use airports in Stanislaus County (FAA/NTAD).",
        category="point",
        loader=_arcgis_url(
            "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Aviation_Facilities/FeatureServer/0",
            where="COUNTY_NAME='STANISLAUS'",
        ),
        ttl=24 * 3600,
    ),
    "amtrak": Layer(
        name="amtrak",
        title="Amtrak stations",
        description="Amtrak rail stations near Stanislaus County (BTS/NTAD).",
        category="point",
        loader=_arcgis_url(
            "https://services2.arcgis.com/aIrBD8yn1TDTEXoz/ArcGIS/rest/services/Amtrak/FeatureServer/0",
            where="State='CA'",
            bbox=STANISLAUS_BBOX,
        ),
        ttl=24 * 3600,
    ),
    "dams": Layer(
        name="dams",
        title="Dams",
        description="USACE National Inventory of Dams (California), with hazard class.",
        category="point",
        loader=_json_transform(
            "https://nid.sec.usace.army.mil/api/query?sy=@stateKey:CA", transforms.nid_dams
        ),
        ttl=24 * 3600,
    ),
    "road-weather": Layer(
        name="road-weather",
        title="Road weather stations",
        description="Caltrans roadside weather stations (temperature, wind, humidity), statewide.",
        category="roadweather",
        loader=_caltrans("rwis", transforms.caltrans_rwis),
        ttl=600,
    ),
    "chain-controls": Layer(
        name="chain-controls",
        title="Chain controls",
        description="Caltrans chain-control checkpoints and their current requirement.",
        category="chain",
        loader=_caltrans("cc", transforms.caltrans_chain),
        ttl=600,
    ),
    "wildfire-perimeters": Layer(
        name="wildfire-perimeters",
        title="Wildfire perimeters",
        description="Current wildfire perimeters in California (NIFC WFIGS).",
        category="perimeter",
        loader=_arcgis_select(
            f"{NIFC}/WFIGS_Interagency_Perimeters_Current/FeatureServer/0",
            lambda fc: transforms.select_props(
                fc,
                {
                    "poly_IncidentName": "name",
                    "attr_IncidentSize": "acres",
                    "attr_PercentContained": "contained",
                },
            ),
            where="attr_POOState='US-CA'",
            bbox=None,
            simplify=0.0005,
        ),
        ttl=1800,
    ),
    "faults": Layer(
        name="faults",
        title="Earthquake faults",
        description="Quaternary-active fault traces (California Geological Survey).",
        category="fault",
        loader=_arcgis_select(
            "https://gis.conservation.ca.gov/server/rest/services/CGS/FAM_QFaults/FeatureServer/0",
            lambda fc: transforms.select_props(
                fc,
                {
                    "FLT_NAME": "name",
                    "ZN_NAME": "zone",
                    "SECT_NAME": "section",
                    "LTYPE": "certainty",
                },
            ),
        ),
        ttl=7 * 24 * 3600,
    ),
    "superfund": Layer(
        name="superfund",
        title="Superfund sites",
        description="EPA National Priorities List hazardous-waste cleanup sites.",
        category="superfund",
        loader=_arcgis_select(
            "https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/"
            "Superfund_National_Priorities_List_(NPL)_Sites_with_Status_Information/FeatureServer/0",
            transforms.superfund_sites,
        ),
        ttl=7 * 24 * 3600,
    ),
    "power-plants": Layer(
        name="power-plants",
        title="Power plants",
        description="Power plants and their primary fuel (HIFLD / EIA).",
        category="power",
        loader=_arcgis_select(
            "https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Power_Plants/FeatureServer/0",
            lambda fc: transforms.select_props(
                fc,
                {
                    "NAME": "name",
                    "OPERATOR": "operator",
                    "PRIMARY_FU": "fuel",
                    "OPER_CAP": "capacity_mw",
                },
            ),
        ),
        ttl=7 * 24 * 3600,
    ),
    "substations": Layer(
        name="substations",
        title="Electric substations",
        description="Electric substations (HIFLD).",
        category="power",
        loader=_arcgis_select(
            "https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Electric_Substations/FeatureServer/0",
            lambda fc: transforms.select_props(fc, {"NAME": "name", "MAX_VOLTAG": "max_kv"}),
        ),
        ttl=7 * 24 * 3600,
    ),
    "cooling-centers": Layer(
        name="cooling-centers",
        title="Cooling & warming centers",
        description="County cooling/warming centers, with hours and status.",
        category="info",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/Cooling_Warming_Centers_(Public)/FeatureServer/0",
            lambda fc: transforms.select_props(
                fc,
                {
                    "Name": "name",
                    "Type": "kind",
                    "Status": "status",
                    "Address": "address",
                    "City": "city",
                    "Phone": "phone",
                    "Monday": "mon",
                    "Tuesday": "tue",
                    "Wednesday": "wed",
                    "Thursday": "thu",
                    "Friday": "fri",
                    "Saturday": "sat",
                    "Sunday": "sun",
                },
            ),
        ),
        ttl=6 * 3600,
    ),
    "sandbags": Layer(
        name="sandbags",
        title="Sandbag pickup sites",
        description="Where the county and cities hand out sandbags.",
        category="info",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/Sandbags_locations_Public/FeatureServer/0",
            lambda fc: transforms.select_props(
                fc, {"locations": "address", "city": "city", "notes": "notes", "phone": "phone"}
            ),
        ),
        ttl=6 * 3600,
    ),
    "shelters": Layer(
        name="shelters",
        title="Emergency shelters",
        description="Emergency shelters listed by the county.",
        category="info",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/Shelters/FeatureServer/1",
            lambda fc: transforms.select_props(
                fc, {"USER_NAME": "name", "USER_Full_Address": "address", "USER_CITY": "city"}
            ),
        ),
        ttl=6 * 3600,
    ),
    "fire-districts": Layer(
        name="fire-districts",
        title="Fire districts",
        description="Fire protection districts and agencies.",
        category="boundary",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/Fire_Districts/FeatureServer/1",
            lambda fc: transforms.select_props(fc, {"Name": "name"}),
        ),
        ttl=6 * 3600,
    ),
    "bridges": Layer(
        name="bridges",
        title="County bridges",
        description="Bridges maintained by Stanislaus County.",
        category="info",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/Maintained_Bridges/FeatureServer/1",
            lambda fc: transforms.select_props(
                fc,
                {
                    "bridge_name": "name",
                    "road_name": "road",
                    "Feature_Intersected": "crosses",
                    "year_built": "built",
                    "structure": "structure",
                },
            ),
        ),
        ttl=6 * 3600,
    ),
    "rivers": Layer(
        name="rivers",
        title="Rivers",
        description="Rivers in Stanislaus County.",
        category="info",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/Rivers/FeatureServer/5",
            lambda fc: transforms.select_props(fc, {"name": "name"}),
        ),
        ttl=6 * 3600,
    ),
    "railroads": Layer(
        name="railroads",
        title="Railroads",
        description="Rail lines in Stanislaus County.",
        category="info",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/Railroads_AGOL/FeatureServer/0",
            lambda fc: transforms.select_props(fc, {"name": "name", "type": "kind"}),
        ),
        ttl=6 * 3600,
    ),
    "elementary-districts": Layer(
        name="elementary-districts",
        title="Elementary school districts",
        description="Elementary and unified school district boundaries.",
        category="boundary",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/Elementary_School_Districts/FeatureServer/4",
            lambda fc: transforms.select_props(fc, {"District": "name"}),
        ),
        ttl=6 * 3600,
    ),
    "high-school-districts": Layer(
        name="high-school-districts",
        title="High school districts",
        description="High school district boundaries.",
        category="boundary",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/High_School_Districts/FeatureServer/3",
            lambda fc: transforms.select_props(fc, {"District": "name"}),
        ),
        ttl=6 * 3600,
    ),
    "county-islands": Layer(
        name="county-islands",
        title="County islands",
        description="Unincorporated pockets surrounded by a city.",
        category="boundary",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/County_Islands/FeatureServer/0",
            lambda fc: transforms.select_props(fc, {"NAME": "name", "EST_ACRES": "acres"}),
        ),
        ttl=6 * 3600,
    ),
    "mosquito-districts": Layer(
        name="mosquito-districts",
        title="Mosquito abatement districts",
        description="Mosquito abatement district boundaries.",
        category="boundary",
        loader=_arcgis_select(
            f"{ARCGIS_BASE}/MosquitoAbatement/FeatureServer/0",
            lambda fc: transforms.select_props(fc, {"name": "name"}),
        ),
        ttl=6 * 3600,
    ),
    "historical-markers": Layer(
        name="historical-markers",
        title="Historical markers",
        description="Roadside historical markers (Historical Marker Database, via Cal OES).",
        category="info",
        loader=_arcgis_select(
            "https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services/Historical_Marker_Database/FeatureServer/0",
            transforms.historical_markers,
        ),
        ttl=7 * 24 * 3600,
    ),
    "mobile-home-parks": Layer(
        name="mobile-home-parks",
        title="Mobile home parks",
        description="Licensed mobile home parks (CA Housing & Community Development).",
        category="info",
        loader=_arcgis_select(
            "https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services/CA_HCD_Mobilehome_Parks_view/FeatureServer/0",
            lambda fc: transforms.select_props(
                fc, {"Park_Name": "name", "Park_Address": "address", "MH_Spaces": "spaces"}
            ),
        ),
        ttl=7 * 24 * 3600,
    ),
    "historic-places": Layer(
        name="historic-places",
        title="Historic places",
        description="National Register of Historic Places listings (National Park Service).",
        category="info",
        loader=_arcgis_select(
            "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/0",
            transforms.historic_places,
        ),
        ttl=7 * 24 * 3600,
    ),
    **{
        name: Layer(
            name=name,
            title=title,
            description=f"{noun} in the Stanislaus region, from OpenStreetMap.",
            category="poi",
            loader=_overpass(name),
            ttl=24 * 3600,
        )
        for name, (title, noun, _selector) in OSM_PLACES.items()
    },
    # --- Public webcams ---
    "fire-cameras": Layer(
        name="fire-cameras",
        title="Wildfire cameras",
        description=(
            "ALERTCalifornia (UC San Diego) and ALERTWildfire mountaintop cameras in "
            "California, via Cal OES's consolidated webcam layer."
        ),
        category="webcam",
        loader=_arcgis_transform(
            "https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services/"
            "CalOES_California_Webcams/FeatureServer/0",
            transforms.fire_cameras,
            where="Source IN ('Alert California','Alert Wildfire')",
        ),
        ttl=24 * 3600,
    ),
    "windy-webcams": Layer(
        name="windy-webcams",
        title="Windy webcams",
        description="Public webcams within 150 km of Modesto listed on Windy.com.",
        category="webcam",
        loader=_windy,
        requires_key=True,
        ttl=24 * 3600,
    ),
    "smoke-haze": Layer(
        name="smoke-haze",
        title="Smoke & haze (experimental)",
        description=(
            "How washed-out the view is on ALERTCalifornia cameras near Modesto: an "
            "experimental visibility index (smoke, fog or dust look alike)."
        ),
        category="haze",
        loader=None,  # built in LayerService from the cached fire-cameras layer
        ttl=3600,
    ),
    # --- Live & imagery ---
    "flights": Layer(
        name="flights",
        title="Flights overhead",
        description="Aircraft broadcasting ADS-B within ~80 nautical miles of Modesto (adsb.fi).",
        category="flight",
        loader=_json_transform(
            "https://opendata.adsb.fi/api/v2/lat/37.64/lon/-120.99/dist/80",
            transforms.adsb_flights,
        ),
        ttl=15,
    ),
    "rain-radar": Layer(
        name="rain-radar",
        title="Rain radar",
        description="Latest precipitation radar (RainViewer).",
        category="raster",
        client_side=True,
    ),
    "satellite": Layer(
        name="satellite",
        title="Satellite (yesterday)",
        description="True-color satellite imagery from NASA GIBS (VIIRS), previous day.",
        category="raster",
        client_side=True,
    ),
    "fire-hotspots": Layer(
        name="fire-hotspots",
        title="Satellite fire detections (24h)",
        description="NASA FIRMS VIIRS heat detections in California over the last 24 hours.",
        category="hotspot",
        loader=_text_transform(
            "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/"
            "SUOMI_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv",
            lambda text: transforms.firms_hotspots(text, CALIFORNIA_BBOX),
        ),
        ttl=3600,
    ),
    # --- Browser-live layers: fetched straight from public APIs in the browser
    # (see frontend/src/live-sources.ts); nothing to bake. ---
    **{
        name: Layer(name=name, title=title, description=desc, category=cat, client_side=True)
        for name, title, desc, cat in BROWSER_LIVE
    },
    "river-cameras": Layer(
        name="river-cameras",
        title="River cameras",
        description="USGS streamgage webcams in California (HIVIS).",
        category="webcam",
        loader=_json_transform(
            "https://api.waterdata.usgs.gov/nims/cameras", transforms.usgs_cameras
        ),
        ttl=24 * 3600,  # the catalog; images are always fetched live
    ),
}


@dataclass
class _Entry:
    body: bytes  # serialized GeoJSON, cached so we don't re-parse/re-dump per request
    fetched_at: float
    etag: str | None = None  # for file layers: the file mtime, to detect edits


@dataclass
class LayerService:
    settings: Settings
    client: httpx.AsyncClient
    # Serve the last baked copy when an upstream is down (live API only; the
    # bake/refresh scripts turn this off so failures stay visible to them).
    fallback_to_baked: bool = True
    _cache: dict[str, _Entry] = field(default_factory=dict)
    _locks: dict[str, asyncio.Lock] = field(default_factory=dict)

    def list_layers(self) -> list[Layer]:
        return list(LAYERS.values())

    def is_available(self, layer: Layer) -> bool:
        if layer.same_data_as:
            return self.is_available(LAYERS[layer.same_data_as])
        if layer.client_side:
            return True
        if layer.file is not None:
            return (DATA_DIR / layer.file).is_file()
        if layer.requires_key:
            if layer.name == "census":
                return bool(self.settings.census_api_key)
            if layer.name == "air-quality":
                return bool(self.settings.airnow_api_key)
            if layer.name == "windy-webcams":
                return bool(self.settings.windy_api_key)
            return False
        return True

    async def get_bytes(self, name: str) -> bytes:
        """Return a layer's GeoJSON as serialized bytes, cached.

        File layers are served straight from disk (re-read only when the file
        changes). Remote layers are fetched, serialized once, and cached for
        their TTL; if a refresh fails but we still hold a (stale) copy, we serve
        that rather than erroring — important for the live feeds.
        """
        layer = LAYERS.get(name)
        if layer is None:
            raise KeyError(name)

        if layer.client_side:
            raise KeyError(name)  # tiles come straight from the tile server; no GeoJSON
        if layer.same_data_as:
            return await self.get_bytes(layer.same_data_as)
        if layer.file is not None:
            return self._file_bytes(name, layer.file)

        ttl = layer.ttl if layer.ttl is not None else self.settings.overlay_ttl_seconds
        entry = self._cache.get(name)
        if entry and (time.monotonic() - entry.fetched_at < ttl):
            return entry.body

        lock = self._locks.setdefault(name, asyncio.Lock())
        async with lock:
            entry = self._cache.get(name)
            if entry and (time.monotonic() - entry.fetched_at < ttl):
                return entry.body
            # Cold start: a baked copy younger than the TTL is as good as a fetch
            # (and instant — some upstreams take 20 s+). Live API only.
            baked = BAKED_LAYERS / f"{name}.geojson"
            fetched_at = _baked_times().get(name)
            if (
                entry is None
                and fetched_at is not None
                and self.fallback_to_baked
                and name not in LIVE_ONLY
                and self.is_available(layer)  # a missing key must stay a 503
                and baked.is_file()
            ):
                age = time.time() - fetched_at
                if age < ttl:
                    body = baked.read_bytes()
                    self._cache[name] = _Entry(body=body, fetched_at=time.monotonic() - age)
                    return body
            try:
                if name == "smoke-haze":  # reuse the cached camera list
                    fire = json.loads(await self.get_bytes("fire-cameras"))
                    data = await haze.build(self.client, fire)
                else:
                    assert layer.loader is not None
                    data = await layer.loader(self.client, self.settings)
            except census.CensusKeyMissing:
                raise  # "needs a key" must stay a 503, never stale data
            except Exception as exc:
                # Log only the exception TYPE, never the exception message: for
                # keyed upstreams (AirNow/Census) httpx embeds the full request
                # URL — API key included — in the message.
                if entry is not None:  # serve stale data over a transient upstream failure
                    logger.warning(
                        "Layer %s refresh failed (%s); serving stale cache",
                        name,
                        type(exc).__name__,
                    )
                    return entry.body
                baked = BAKED_LAYERS / f"{name}.geojson"
                if self.fallback_to_baked and name not in LIVE_ONLY and baked.is_file():
                    logger.warning(
                        "Layer %s fetch failed (%s); serving the baked copy",
                        name,
                        type(exc).__name__,
                    )
                    body = baked.read_bytes()
                    # Cache briefly so requests don't queue behind a dead upstream.
                    self._cache[name] = _Entry(body=body, fetched_at=time.monotonic() - ttl + 60)
                    return body
                raise
            body = json.dumps(data, separators=(",", ":")).encode()
            self._cache[name] = _Entry(body=body, fetched_at=time.monotonic())
            return body

    def _file_bytes(self, name: str, filename: str) -> bytes:
        path = DATA_DIR / filename
        if not path.is_file():
            raise FileNotFoundError(name)
        mtime = str(path.stat().st_mtime_ns)
        entry = self._cache.get(name)
        if entry is None or entry.etag != mtime:
            entry = _Entry(body=path.read_bytes(), fetched_at=time.monotonic(), etag=mtime)
            self._cache[name] = entry
        return entry.body
