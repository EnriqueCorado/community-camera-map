"""Pre-bake all map data to static files for a backend-free (GitHub Pages) deploy.

Runs the same CameraService / LayerService used by the live API, once, and writes:
  frontend/public/data/cameras.json      the /api/cameras payload
  frontend/public/data/layers.json       the layer catalog (+ source URLs)
  frontend/public/data/layers/<name>.geojson   each available layer
  frontend/public/data/alpr_access.json  who can search each plate reader
  frontend/public/data/meta.json         { baked_at }

Keys (Census / AirNow) are read from the backend's .env and used ONLY here —
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
from app.layers.service import LayerService

# httpx logs full request URLs (incl. Census/AirNow keys) at INFO — keep it quiet
# even if logging is configured verbosely here later.
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "frontend" / "public" / "data"

# Public source URL shown in the UI / About page for provenance.
SOURCES = {
    "alpr": "https://openstreetmap.org (DeFlock)",
    "census": "https://api.census.gov (ACS 5-year)",
    "flood": "https://hazards.fema.gov (FEMA NFHL)",
    "fire-hazard": "https://osfm.fire.ca.gov (CAL FIRE FHSZ)",
    "enviroscreen": "https://oehha.ca.gov/calenviroscreen",
    "wildfire": "https://nifc.gov (WFIGS)",
    "weather-alerts": "https://api.weather.gov",
    "quakes": "https://earthquake.usgs.gov",
    "streamflow": "https://waterservices.usgs.gov",
    "lane-closures": "https://cwwp2.dot.ca.gov (Caltrans)",
    "message-signs": "https://cwwp2.dot.ca.gov (Caltrans)",
    "air-quality": "https://airnowapi.org",
    "transit-routes": "Stanislaus Regional Transit Authority GTFS",
    "transit-stops": "Stanislaus Regional Transit Authority GTFS",
    "dams": "https://nid.sec.usace.army.mil",
    "fire-cameras": "ALERTCalifornia (UC San Diego) / ALERTWildfire, via Cal OES",
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


async def main() -> None:
    settings = get_settings()
    (OUT / "layers").mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(
        timeout=90.0,  # generous: one-time build, some layers (FEMA) page slowly
        headers={"User-Agent": "stanislaus-cam-map/bake"},
        follow_redirects=True,
    ) as client:
        cams = CameraService(settings, client)
        layers = LayerService(settings=settings, client=client)

        camera_list = await cams.list_cameras()
        payload = {
            "count": len(camera_list),
            "source": "Caltrans public CCTV feeds (all districts)",
            "cameras": [c.model_dump() for c in camera_list],
        }
        (OUT / "cameras.json").write_text(json.dumps(payload, separators=(",", ":")))
        print(f"cameras.json: {len(camera_list)} cameras")

        catalog = []
        for layer in layers.list_layers():
            info = {
                "name": layer.name,
                "title": layer.title,
                "description": layer.description,
                "category": layer.category,
                "requires_key": layer.requires_key,
                "source": SOURCES.get(layer.name, ""),
                "available": False,
            }
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
                catalog.append(info)
                continue
            (OUT / "layers" / f"{layer.name}.geojson").write_bytes(body)
            info["available"] = True
            catalog.append(info)
            n = len(json.loads(body).get("features", []))
            print(f"  {layer.name}: {n} features")

        shutil.copyfile(ALPR_ACCESS_FILE, OUT / "alpr_access.json")
        (OUT / "layers.json").write_text(json.dumps(catalog, separators=(",", ":")))
        (OUT / "meta.json").write_text(
            json.dumps({"baked_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds")})
        )
        print(f"baked {sum(1 for c in catalog if c['available'])}/{len(catalog)} layers to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
