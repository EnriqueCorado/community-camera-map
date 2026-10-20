"""Pre-bake all map data to static files for a backend-free (GitHub Pages) deploy.

Runs the same CameraService / LayerService used by the live API, once, and writes:
  frontend/public/data/cameras.json      the /api/cameras payload
  frontend/public/data/layers.json       the layer catalog (+ source URLs)
  frontend/public/data/layers/<name>.geojson   each available layer
  frontend/public/data/alpr_access.json  who can search each plate reader
  frontend/public/data/meta.json         { baked_at }

Keys (Census) are read from the backend's .env and used ONLY here —
they never reach the shipped static site. Run from backend/: `uv run python scripts/bake.py`.
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


# Live-only layers: the committed file is an empty placeholder; the scheduled
# Pages workflow (scripts/refresh_live.py) writes real data at deploy time.
LIVE_ONLY = {"flights"}
EMPTY_FC = '{"type":"FeatureCollection","features":[]}'


async def main() -> None:
    settings = get_settings()
    (OUT / "layers").mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(
        timeout=90.0,  # generous: one-time build, some layers (FEMA) page slowly
        headers={"User-Agent": "stanislaus-cam-map/bake"},
        follow_redirects=True,
    ) as client:
        cams = CameraService(settings, client)
        layers = LayerService(settings=settings, client=client, fallback_to_baked=False)

        camera_list = await cams.list_cameras()
        payload = {
            "count": len(camera_list),
            "source": "Caltrans public CCTV feeds (all districts)",
            "cameras": [c.model_dump() for c in camera_list],
        }
        (OUT / "cameras.json").write_text(json.dumps(payload, separators=(",", ":")))
        print(f"cameras.json: {len(camera_list)} cameras")

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
