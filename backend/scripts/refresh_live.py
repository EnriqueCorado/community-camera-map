"""Refresh the fast-changing, keyless layers of the static site in place.

Run by the scheduled GitHub Pages workflow (every 15 min) right before the
build, so the public site's live layers stay fresh without a server. It only
overwrites a layer's file when the fetch succeeds — on failure the committed
(last baked) file is kept. Nothing is committed back to git.

    cd backend && uv run python scripts/refresh_live.py            # fast layers
    cd backend && uv run python scripts/refresh_live.py --hourly   # + haze, webcams
    cd backend && uv run python scripts/refresh_live.py --weekly   # nationwide service lists

Keys: none needed. The Windy list is refreshed separately in CI
(`--only windy-webcams`) so its key never shares a process with the step that
decodes third-party images.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from bake import SOURCES  # noqa: E402 - sibling script

from app.core.config import get_settings
from app.layers import service as _registry  # noqa: F401 - loads every pack before one is imported
from app.layers.national.services import WEEKLY as SERVICES_WEEKLY
from app.layers.service import LayerService, record_layer_times, sync_catalog

for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

OUT = Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "data"

FAST = (
    "flights",
    "air-quality",
    "river-gauges",
    "storm-reports",
    "power-outages",
    "outage-areas",
    "wildfire",
    "weather-alerts",
    "quakes",
    "lane-closures",
    "message-signs",
    "streamflow",
    "road-weather",
    "chain-controls",
)
# Slow-changing, and Overpass servers rate-limit: once a day.
DAILY = (
    "drought",  # the Drought Monitor updates weekly (Thursdays)
    "voting",  # empties itself once the election is over
    "wastewater",  # CDC updates weekly
    "groundwater",  # DWR posts new well readings daily
    "ceqa-projects",  # filings arrive daily
    "housing-proposals",  # yearly reports, checked daily (cheap)
    "new-homes",
    "building-permits",  # Census BPS: yearly, by place, nationwide
    "aed",
    "drinking-water",
    "restrooms",
    "ev-chargers",
    "libraries",
    "playgrounds",
    "pharmacies",
    "fire-stations",
    "free-wifi",
    "food-banks",
    "clinics",
    "community-centers",
    "farmers-markets",
)
# Nationwide baked lists that change slowly and take minutes to rebuild
# (PDF/spreadsheet downloads + Census geocoding): once a week, own cache in CI.
WEEKLY = SERVICES_WEEKLY
HOURLY = (
    "reservoirs",
    "fire-weather",
    "volcanoes",
    "fire-cameras",  # before smoke-haze, which reuses it
    "smoke-haze",
    "river-cameras",
    "fire-hotspots",
    "wildfire-perimeters",
)  # haze reuses fire-cameras


async def main(names: tuple[str, ...]) -> int:
    settings = get_settings()
    catalog_path = OUT / "layers.json"
    catalog = json.loads(catalog_path.read_text())
    by_name = {c["name"]: c for c in catalog}
    ok = 0
    refreshed: list[str] = []
    async with httpx.AsyncClient(
        timeout=60.0, headers={"User-Agent": "stanislaus-cam-map/refresh"}, follow_redirects=True
    ) as client:
        layers = LayerService(settings=settings, client=client, fallback_to_baked=False)
        # Registry changes (new layers, titles, views) reach the catalog first,
        # so layers added since the last bake can be marked available below.
        catalog = sync_catalog(catalog, layers.list_layers(), SOURCES)
        by_name = {c["name"]: c for c in catalog}
        for name in names:
            layer = next((x for x in layers.list_layers() if x.name == name), None)
            if layer is None or not layers.is_available(layer):
                print(f"  skip {name}")
                continue
            try:
                body = await layers.get_bytes(name)
                n = len(json.loads(body).get("features", []))
            except Exception as exc:  # noqa: BLE001 - keep the last good file
                print(f"  keep {name} (refresh failed: {type(exc).__name__})")
                continue
            (OUT / "layers" / f"{name}.geojson").write_bytes(body)
            if name in by_name:
                by_name[name]["available"] = True
                by_name[name]["count"] = n
            ok += 1
            refreshed.append(name)
            print(f"  {name}: {n} features")
    catalog_path.write_text(json.dumps(catalog, separators=(",", ":")))
    record_layer_times(refreshed)
    if ok and "flights" in names:  # only claim "live" when the live layers refreshed
        meta_path = OUT / "meta.json"
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        meta["live_at"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
        meta_path.write_text(json.dumps(meta))
    print(f"refreshed {ok}/{len(names)} layers")
    return 0


def adopt(name: str) -> int:
    """Mark `name` available if a valid FeatureCollection was dropped in place
    (the Windy list is built in an isolated CI job and handed over as data)."""
    path = OUT / "layers" / f"{name}.geojson"
    try:
        fc = json.loads(path.read_text())
        ok = fc.get("type") == "FeatureCollection" and isinstance(fc.get("features"), list)
    except (OSError, ValueError, AttributeError):
        ok = False
    if not ok:
        path.unlink(missing_ok=True)
        print(f"  no valid {name} artifact; left unavailable")
        return 0
    catalog_path = OUT / "layers.json"
    catalog = json.loads(catalog_path.read_text())
    for c in catalog:
        if c["name"] == name:
            c["available"] = True
    catalog_path.write_text(json.dumps(catalog, separators=(",", ":")))
    print(f"  adopted {name}: {len(fc['features'])} features")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--hourly", action="store_true", help="also refresh slower/heavier layers")
    ap.add_argument("--daily", action="store_true", help="refresh the OpenStreetMap places")
    ap.add_argument("--weekly", action="store_true", help="refresh the nationwide service lists")
    ap.add_argument("--only", help="comma-separated layer names (e.g. windy-webcams)")
    ap.add_argument("--adopt", help="mark an already-present layer file available (CI artifact)")
    args = ap.parse_args()
    if args.adopt:
        raise SystemExit(adopt(args.adopt))
    chosen = (
        tuple(args.only.split(","))
        if args.only
        else WEEKLY + FAST  # the weekly run deploys too
        if args.weekly
        else DAILY + FAST  # the daily run deploys too: keep live layers fresh
        if args.daily
        else FAST + (HOURLY if args.hourly else ())
    )
    raise SystemExit(asyncio.run(main(chosen)))
