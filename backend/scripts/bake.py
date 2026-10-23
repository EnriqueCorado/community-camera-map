"""Pre-bake all map data to static files for a backend-free (GitHub Pages) deploy.

Runs the same CameraService / LayerService used by the live API, once, and writes:
  frontend/public/data/cameras/          the /api/cameras payload, split for a light
                                         first load (app/cameras/static_split.py)
  frontend/public/data/layers.json       the layer catalog (+ source URLs)
  frontend/public/data/layers/<name>.geojson   each available layer
  frontend/public/data/alpr_access.json  who can search each plate reader
  frontend/public/data/meta.json         { baked_at }

Keys (Census) are read from the backend's .env and used ONLY here —
they never reach the shipped static site. Run from backend/: `uv run python scripts/bake.py`.
`--cameras-only` rebuilds just the camera list (all camera sources, ~1 minute).
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import shutil
import sys
from pathlib import Path

# Make the backend package importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from app.cameras import static_split
from app.cameras.national import sources_for
from app.cameras.schemas import Camera
from app.cameras.service import CameraService
from app.core.config import get_settings
from app.layers.alpr_access import ALPR_ACCESS_FILE
from app.layers.service import LayerService, record_layer_times

# httpx logs full request URLs (incl. the Census key) at INFO — keep it quiet
# even if logging is configured verbosely here later.
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "frontend" / "public" / "data"

# Public source URL shown in the UI / About page for provenance.
SOURCES = {
    "alpr": "https://openstreetmap.org (DeFlock)",
    "buses": "StanRTA real-time feed (Availtec InfoPoint)",
    "transit-vehicles": (
        "Each transit agency's official keyless real-time vehicle feed (GTFS-realtime; "
        "MBTA V3 API; MTA; CapMetro via data.texas.gov), found via the MobilityData catalog"
    ),
    "wastewater": "CDC National Wastewater Surveillance System (viral activity levels)",
    "air-quality": "US EPA AirNow current monitors (public ArcGIS service)",
    "river-gauges": "NOAA National Water Prediction Service river gauges",
    "storm-reports": "NWS local storm reports (NOAA)",
    "fire-weather": "NWS Storm Prediction Center fire weather outlook",
    "smoke-forecast": "NOAA NDGD smoke forecast (HRRR-Smoke)",
    "volcanoes": "USGS Volcano Hazards Program (alert levels)",
    "national-parks": "National Park Service unit boundaries",
    "groundwater": "California DWR periodic groundwater level measurements (CNRA open data)",
    "housing-proposals": "California HCD Housing Element Annual Progress Reports (Table A)",
    "new-homes": "California HCD Housing Element Annual Progress Reports (Table A2)",
    "ceqa-projects": "CEQAnet, Governor's Office of Land Use and Climate Innovation",
    "voting": "Stanislaus County Registrar of Voters (stanvote.gov voting flier, 2026-09-28)",
    "legal-help": (
        "Each office's own website, the DOJ EOIR recognized-organization roster and CA DSS "
        "(checked 2026-10-19)"
    ),
    "power-outages": "Cal OES statewide power outages (from utility outage maps)",
    "outage-areas": "Cal OES statewide power outages (PG&E outage areas)",
    "health-asthma": "CDC PLACES: Local Data for Better Health",
    "health-diabetes": "CDC PLACES: Local Data for Better Health",
    "health-uninsured": "CDC PLACES: Local Data for Better Health",
    "food-insecurity": "CDC PLACES: Local Data for Better Health",
    "snap-stores": "USDA SNAP Retailer Locator data",
    "fatal-crashes": "NHTSA Fatality Analysis Reporting System (via USDOT NTAD)",
    "reservoirs": "California DWR / CDEC reservoir storage (via Cal OES)",
    "drought": "U.S. Drought Monitor (NDMC / USDA / NOAA)",
    "heat-risk": "NWS HeatRisk (experimental, NOAA)",
    "census": "https://api.census.gov (ACS 5-year)",
    "census-spanish": "https://api.census.gov (ACS 5-year)",
    "census-poverty": "https://api.census.gov (ACS 5-year)",
    "census-renters": "https://api.census.gov (ACS 5-year)",
    "census-foreign-born": "https://api.census.gov (ACS 5-year)",
    "flood": "https://hazards.fema.gov (FEMA NFHL)",
    "fire-hazard": "https://osfm.fire.ca.gov (CAL FIRE FHSZ)",
    "enviroscreen": "https://oehha.ca.gov/calenviroscreen",
    "wildfire": "https://nifc.gov (WFIGS)",
    "weather-alerts": "https://api.weather.gov",
    "quakes": "https://earthquake.usgs.gov",
    "streamflow": "https://waterservices.usgs.gov",
    "lane-closures": "https://cwwp2.dot.ca.gov (Caltrans)",
    "message-signs": "https://cwwp2.dot.ca.gov (Caltrans)",
    "transit-routes": "Stanislaus Regional Transit Authority GTFS",
    "transit-stops": "Stanislaus Regional Transit Authority GTFS",
    "dams": "https://nid.sec.usace.army.mil",
    "fire-cameras": "ALERTCalifornia (UC San Diego) / ALERTWildfire, via Cal OES",
    "smoke-haze": "Computed from ALERTCalifornia | UC San Diego frames",
    "windy-webcams": "https://www.windy.com/webcams",
    "flights": "https://adsb.fi (open data, ADS-B Exchange-style feed); routes: adsbdb.com",
    "fire-hotspots": "NASA FIRMS (VIIRS, public 24h file)",
    "road-weather": "https://cwwp2.dot.ca.gov (Caltrans RWIS)",
    "chain-controls": "https://cwwp2.dot.ca.gov (Caltrans)",
    "wildfire-perimeters": "https://nifc.gov (WFIGS current perimeters)",
    "faults": "California Geological Survey (Quaternary faults)",
    "superfund": "US EPA (NPL sites)",
    "power-plants": "HIFLD / US EIA",
    "substations": "HIFLD",
    "air-now": "https://open-meteo.com (air quality)",
    "historic-places": "National Park Service (National Register of Historic Places)",
    "historical-markers": "Historical Marker Database (hmdb.org), via Cal OES",
    "mobile-home-parks": "CA Housing & Community Development, via Cal OES",
    "libraries": "OpenStreetMap (Overpass API)",
    "playgrounds": "OpenStreetMap (Overpass API)",
    "pharmacies": "OpenStreetMap (Overpass API)",
    "fire-stations": "OpenStreetMap (Overpass API)",
    "free-wifi": "OpenStreetMap (Overpass API)",
    "food-banks": "OpenStreetMap (Overpass API)",
    "clinics": "OpenStreetMap (Overpass API)",
    "community-centers": "OpenStreetMap (Overpass API)",
    "farmers-markets": "OpenStreetMap (Overpass API)",
    "cooling-centers": "Stanislaus County GIS (ArcGIS Hub)",
    "sandbags": "Stanislaus County GIS (ArcGIS Hub)",
    "shelters": "Stanislaus County GIS (ArcGIS Hub)",
    "fire-districts": "Stanislaus County GIS (ArcGIS Hub)",
    "bridges": "Stanislaus County GIS (ArcGIS Hub)",
    "rivers": "Stanislaus County GIS (ArcGIS Hub)",
    "railroads": "Stanislaus County GIS (ArcGIS Hub)",
    "elementary-districts": "Stanislaus County GIS (ArcGIS Hub)",
    "high-school-districts": "Stanislaus County GIS (ArcGIS Hub)",
    "county-islands": "Stanislaus County GIS (ArcGIS Hub)",
    "mosquito-districts": "Stanislaus County GIS (ArcGIS Hub)",
    "iss": "https://wheretheiss.at; space weather: NOAA SWPC",
    "satellites": "https://celestrak.org (orbits) + satellite.js",
    "trains": "https://amtraker.com (Amtrak data)",
    "wildlife": "https://www.inaturalist.org",
    "wikipedia": "https://www.wikipedia.org",
    "weather-now": "https://open-meteo.com",
    "aed": "OpenStreetMap (Overpass API)",
    "drinking-water": "OpenStreetMap (Overpass API)",
    "restrooms": "OpenStreetMap (Overpass API)",
    "ev-chargers": "OpenStreetMap (Overpass API)",
    "rain-radar": "https://www.rainviewer.com",
    "satellite": "NASA EOSDIS GIBS / Worldview (VIIRS true color)",
    "river-cameras": "https://apps.usgs.gov/hivis (USGS)",
}
for _k in ("city-limits", "general-plan", "zoning", "annexations", "parks", "schools"):
    SOURCES[_k] = "Stanislaus County GIS (ArcGIS Hub)"
for _k in ("supervisor-districts",):
    SOURCES[_k] = "Stanislaus County GIS (ArcGIS Hub)"
for _k in ("zip-codes", "congressional-districts"):
    SOURCES[_k] = "US Census TIGERweb"
for _k in ("hospitals", "law-enforcement", "airports", "amtrak"):
    SOURCES[_k] = "HIFLD / US DOT (ArcGIS)"
# Nationwide packs carry their own attribution (imported after service.py,
# which registers them).
from app.layers.national.hazards import SOURCES as _HAZARD_SOURCES  # noqa: E402

SOURCES.update(_HAZARD_SOURCES)
SOURCES["dams"] = "https://nid.sec.usace.army.mil (USACE NID; nationwide via Esri federal copy)"
SOURCES["streamflow"] = (
    "https://waterservices.usgs.gov (nationwide: USGS gauges via Esri Live Stream Gauges)"
)
SOURCES["shelters"] = "Stanislaus County GIS; nationwide: FEMA National Shelter System"
from app.layers.national.planning import SOURCES as _PLANNING_SOURCES  # noqa: E402

SOURCES.update(_PLANNING_SOURCES)
from app.layers.national.census_extra import SOURCES as _CENSUS_SOURCES  # noqa: E402
from app.layers.service import _ACS_METRICS  # noqa: E402

SOURCES.update(_CENSUS_SOURCES)
from app.layers.national.states import SOURCES as _STATE_SOURCES  # noqa: E402

SOURCES.update(_STATE_SOURCES)
from app.layers.national.state_bakes import SOURCES as _STATE_BAKE_SOURCES  # noqa: E402

SOURCES.update(_STATE_BAKE_SOURCES)
from app.layers.national.roads import SOURCES as _ROAD_SOURCES  # noqa: E402

SOURCES.update(_ROAD_SOURCES)
from app.layers.national.help_offices import SOURCES as _HELP_OFFICE_SOURCES  # noqa: E402

SOURCES.update(_HELP_OFFICE_SOURCES)
from app.layers.national.care_compare import SOURCES as _CARE_COMPARE_SOURCES  # noqa: E402

SOURCES.update(_CARE_COMPARE_SOURCES)
from app.layers.national.parity import SOURCES as _PARITY_SOURCES  # noqa: E402

SOURCES.update(_PARITY_SOURCES)
for _row in _ACS_METRICS:
    SOURCES[_row[0]] = "U.S. Census Bureau ACS 2020-2024 5-year, via Esri Living Atlas"
# Community & immigrant services pack (app/layers/national/services.py).
_CENSUS_GEO = "geocoded with the U.S. Census Geocoder"
SOURCES.update(
    {
        "immigration-legal-help": (
            f"U.S. DOJ EOIR, Recognized Organizations roster by state and city ({_CENSUS_GEO})"
        ),
        "detention-centers": (
            f"U.S. ICE detention statistics, facilities sheet ({_CENSUS_GEO}; "
            "the rest from a hand-checked list sourced to HIFLD prison records)"
        ),
        "immigration-offices": (
            "U.S. DOJ EOIR immigration court pages and ICE field-office list "
            f"(hand-kept, one source per row; {_CENSUS_GEO})"
        ),
        "health-centers": "HRSA health center service delivery sites (gisportal.hrsa.gov)",
        "head-start": "Office of Head Start center locator (headstart.gov)",
        "early-head-start": "Office of Head Start center locator (headstart.gov)",
        "job-centers": f"U.S. DOL CareerOneStop American Job Centers ({_CENSUS_GEO})",
        "mental-health": "SAMHSA FindTreatment.gov",
        "addiction-treatment": "SAMHSA FindTreatment.gov",
        "housing-counseling": "HUD-approved housing counseling agencies (HUD)",
        "public-housing": "HUD public housing authorities",
        "hud-multifamily": "HUD eGIS Multifamily Properties - Assisted",
        "usda-rural-rentals": "USDA Rural Development multifamily housing, via HUD eGIS",
        "colleges": "NCES EDGE postsecondary school locations (IPEDS)",
        "va-facilities": "Veterans Health Administration facilities (VA)",
        "border-ports": "BTS / CBP border crossing entry data (NTAD)",
        "summer-meals": "USDA FNS summer meal site finder",
    }
)


# Live-only layers: the committed file is an empty placeholder; the scheduled
# Pages workflow (scripts/refresh_live.py) writes real data at deploy time.
LIVE_ONLY = {"flights"}
EMPTY_FC = '{"type":"FeatureCollection","features":[]}'


# Short keys for the baked camera list (~16k cameras: long keys alone were
# ~1.5 MB). Shipped in the file as "keys" so the frontend expands them
# (frontend/src/camera-data.ts `withDefaults`). latitude/longitude keep their names: the Windy
# layer reads them from this file to drop Caltrans re-lists.
SHORT_KEYS = {
    "name": "n",
    "county": "c",
    "nearby_place": "p",
    "route": "r",
    "direction": "d",
    "snapshot_url": "s",
    "stream_url": "v",
    "in_service": "i",
    "source": "src",
    "state": "st",
    "views": "w",
}


def compact_camera(c: Camera, default_state: str) -> dict:
    """A camera without its default/empty fields (state too, when it's the
    source's own), coordinates to ~1 m, under short keys."""
    d = {
        k: v
        for k, v in c.model_dump(exclude_defaults=True).items()
        if v not in ("", []) and k != "state"
    }
    if c.state != default_state:  # e.g. a California buoy from the (stateless) NDBC source
        d["state"] = c.state
    for k in ("latitude", "longitude"):
        d[k] = round(d[k], 5)
    return {SHORT_KEYS.get(k, k): v for k, v in d.items()}


class CameraBakeError(RuntimeError):
    """The fresh camera list looks broken; keep the previous file instead."""


MIN_KEEP = 0.8  # of the previous list's size


def check_camera_list(camera_list: list[Camera], previous_count: int, secrets: list[str]) -> None:
    """Sanity checks before the camera list is replaced (and, in CI, published and
    cached): Caltrans must be present, the list mustn't shrink below MIN_KEEP of
    the last one, and no configured API key may appear anywhere in it."""
    if not any(c.source == "caltrans" for c in camera_list):
        raise CameraBakeError("no Caltrans cameras")
    if previous_count and len(camera_list) < MIN_KEEP * previous_count:
        raise CameraBakeError(f"only {len(camera_list)} cameras (was {previous_count})")
    blob = json.dumps([c.model_dump() for c in camera_list])
    if any(s and s in blob for s in secrets):
        raise CameraBakeError("an API key appears in the camera list")


async def bake_cameras(cams: CameraService) -> None:
    camera_list = await cams.list_cameras()
    previous = static_split.read_count(OUT)
    s = get_settings()
    secrets = [*s.iteris_keys.values(), s.ohgo_api_key]
    check_camera_list(camera_list, previous, secrets)
    sources = sources_for(camera_list)
    payload = {
        "count": len(camera_list),
        "source": "Public camera feeds: Caltrans, state DOTs, USGS and NOAA",
        "sources": {k: v.model_dump() for k, v in sources.items()},
        "keys": {short: long for long, short in SHORT_KEYS.items()},
        "cameras": [
            compact_camera(c, sources[c.source].state if c.source in sources else "CA")
            for c in camera_list
        ],
    }
    try:  # the key check again, on the exact bytes that get published
        sizes = static_split.write(OUT, payload, secrets)
    except ValueError as exc:
        raise CameraBakeError(str(exc)) from exc
    per: dict[str, int] = {}
    for c in camera_list:
        per[c.source] = per.get(c.source, 0) + 1
    cells = [n for p, n in sizes.items() if p.startswith("cells/")]
    print(
        f"cameras/: {len(camera_list)} cameras; index {sizes['index.json'] / 1e3:.0f} kB, "
        f"search {sizes['search.json'] / 1e3:.0f} kB, {len(cells)} cells "
        f"(largest {max(cells, default=0) / 1e3:.0f} kB, all {sum(cells) / 1e6:.2f} MB)"
    )
    print("  by source:", ", ".join(f"{k} {n}" for k, n in sorted(per.items())))


async def main() -> None:
    settings = get_settings()
    (OUT / "layers").mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(
        timeout=90.0,  # generous: one-time build, some layers (FEMA) page slowly
        headers={
            "User-Agent": "community-camera-map/bake (+https://enriquecorado.github.io/community-camera-map/)"
        },
        follow_redirects=True,
    ) as client:
        cams = CameraService(settings, client)
        try:
            await bake_cameras(cams)
        except CameraBakeError as exc:
            # Fail loudly (CI keeps the cached/committed list); never write it.
            sys.exit(f"camera list NOT updated: {exc}")
        if "--cameras-only" in sys.argv[1:]:
            return
        layers = LayerService(settings=settings, client=client, fallback_to_baked=False)

        catalog = []
        fetched: list[str] = []
        for layer in layers.list_layers():
            info = {
                "name": layer.name,
                "title": layer.title,
                "description": layer.description,
                "category": layer.category,
                "requires_key": layer.requires_key,
                "same_data_as": layer.same_data_as,
                "source": SOURCES.get(layer.name, ""),
                "available": False,
                **layer.catalog_extras(),
            }
            if layer.same_data_as:  # the browser reuses the source layer's file
                # Available only if the source actually baked (it's listed first).
                source = next((c for c in catalog if c["name"] == layer.same_data_as), None)
                info["available"] = bool(source and source["available"])
                catalog.append(info)
                continue
            if layer.view and (not layers.is_available(layer) or not layer.has_home_copy):
                # e.g. census without a key: the browser still loads it nationally
                info["available"] = True
                catalog.append(info)
                continue
            if layer.client_side:  # browser loads tiles directly; nothing to bake
                info["available"] = True
                catalog.append(info)
                continue
            if layer.name in LIVE_ONLY:  # never commit live positions; CI fills these in
                (OUT / "layers" / f"{layer.name}.geojson").write_text(EMPTY_FC)
                info["available"] = True
                catalog.append(info)
                continue
            if not layers.is_available(layer):
                print(f"  skip {layer.name} (unavailable — key not set)")
                catalog.append(info)
                continue
            body = None
            for attempt in range(3):  # upstreams (FEMA) are occasionally slow
                try:
                    body = await layers.get_bytes(layer.name)
                    break
                except Exception as exc:  # noqa: BLE001 - bake is best-effort per layer
                    if attempt == 2:
                        print(f"  FAIL {layer.name}: {type(exc).__name__}")
                    else:
                        await asyncio.sleep(2)
            if body is None:
                # Keep the last committed file rather than dropping the layer.
                info["available"] = (OUT / "layers" / f"{layer.name}.geojson").is_file()
                catalog.append(info)
                continue
            (OUT / "layers" / f"{layer.name}.geojson").write_bytes(body)
            fetched.append(layer.name)
            info["available"] = True
            catalog.append(info)
            n = len(json.loads(body).get("features", []))
            info["count"] = n  # lets the UI say "none mapped yet" for empty layers
            print(f"  {layer.name}: {n} features")

        shutil.copyfile(ALPR_ACCESS_FILE, OUT / "alpr_access.json")
        record_layer_times(fetched)
        (OUT / "layers.json").write_text(json.dumps(catalog, separators=(",", ":")))
        (OUT / "meta.json").write_text(
            json.dumps({"baked_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds")})
        )
        print(f"baked {sum(1 for c in catalog if c['available'])}/{len(catalog)} layers to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
