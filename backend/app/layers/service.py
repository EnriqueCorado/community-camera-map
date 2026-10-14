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
from ..core.http import fetch_capped
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


def _json_transform(url: str, transform: Callable[[object], dict]) -> Loader:
    """A non-GeoJSON JSON source normalized to GeoJSON (Caltrans, USGS, NID)."""

    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        body, _ = await fetch_capped(client, url, max_bytes=arcgis.MAX_BYTES)
        return transform(json.loads(body))

    return load


WINDY_URL = "https://api.windy.com/webcams/api/v3/webcams"
WINDY_RADIUS_KM = 150  # around Modesto
WINDY_MAX_PAGES = 10  # 50 per page


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
    return transforms.windy_webcams({"webcams": rows})




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
        loader=_geojson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"),
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
        description="Caltrans District 10 active lane closures.",
        category="roadops",
        loader=_json_transform(
            "https://cwwp2.dot.ca.gov/data/d10/lcs/lcsStatusD10.json", transforms.caltrans_lcs
        ),
        ttl=180,
    ),
    "message-signs": Layer(
        name="message-signs",
        title="Highway message signs",
        description="Caltrans District 10 changeable message signs and their current text.",
        category="point",
        loader=_json_transform(
            "https://cwwp2.dot.ca.gov/data/d10/cms/cmsStatusD10.json", transforms.caltrans_cms
        ),
        ttl=180,
    ),
    "air-quality": Layer(
        name="air-quality",
        title="Air quality",
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
    _cache: dict[str, _Entry] = field(default_factory=dict)
    _locks: dict[str, asyncio.Lock] = field(default_factory=dict)

    def list_layers(self) -> list[Layer]:
        return list(LAYERS.values())

    def is_available(self, layer: Layer) -> bool:
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
            try:
                if name == "smoke-haze":  # reuse the cached camera list
                    fire = json.loads(await self.get_bytes("fire-cameras"))
                    data = await haze.build(self.client, fire)
                else:
                    assert layer.loader is not None
                    data = await layer.loader(self.client, self.settings)
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
