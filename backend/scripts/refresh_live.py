"""Refresh the fast-changing, keyless layers of the static site in place.

Run by the scheduled GitHub Pages workflow (every 15 min) right before the
build, so the public site's live layers stay fresh without a server. It only
overwrites a layer's file when the fetch succeeds — on failure the committed
(last baked) file is kept. Nothing is committed back to git.

    cd backend && uv run python scripts/refresh_live.py            # fast layers
    cd backend && uv run python scripts/refresh_live.py --hourly   # + haze, webcams
    cd backend && uv run python scripts/refresh_live.py --weekly   # nationwide service lists
    cd backend && uv run python scripts/refresh_live.py --keyed    # road ops (511 / OHGO keys)

Keys: none needed. The Windy list is refreshed separately in CI
(`--only windy-webcams`) so its key never shares a process with the step that
decodes third-party images. The road-operations layers (KEYED) are baked with
the Iteris 511 / OHGO keys in CI's isolated `cameras` job only, and handed to
the build job as plain files (`--adopt`), so the build job never holds a key.
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
from app.layers.national import state_bakes
from app.layers.national.roads import KEYED
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
    *state_bakes.DAILY,  # state feeds (national/state_bakes.py)
)
# Nationwide baked lists that change slowly and take minutes to rebuild
# (PDF/spreadsheet downloads + Census geocoding): once a week, own cache in CI.
WEEKLY = (
    *SERVICES_WEEKLY,
    "building-permits",  # Census BPS: yearly, by place
    *state_bakes.WEEKLY,  # state child-care lists (Texas is geocoded)
)
HOURLY = (
    "reservoirs",
    "fire-weather",
    "volcanoes",
    "fire-cameras",  # before smoke-haze, which reuses it
    "smoke-haze",
    "river-cameras",
    "fire-hotspots",
    "wildfire-perimeters",
    *state_bakes.HOURLY,
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


def adopt(names: str, src: Path | None = None) -> int:
    """Mark each of `names` (comma-separated) available if a valid
    FeatureCollection was dropped in place, or (with `src`) arrived in `src`
    and is moved in place (the Windy list and the keyed road layers are built in
    isolated CI jobs and handed over as data). A layer whose file didn't arrive
    keeps its previous copy, count and time."""
    catalog_path = OUT / "layers.json"
    catalog = json.loads(catalog_path.read_text())
    adopted: list[str] = []
    for name in names.split(","):
        path = OUT / "layers" / f"{name}.geojson"
        incoming = (src / f"{name}.geojson") if src else path
        try:
            fc = json.loads(incoming.read_text())
            ok = fc.get("type") == "FeatureCollection" and isinstance(fc.get("features"), list)
        except (OSError, ValueError, AttributeError):
            ok = False
        if not ok:
            if name == "windy-webcams":  # no committed copy to fall back on
                path.unlink(missing_ok=True)
            print(f"  no valid {name} artifact; kept the previous copy")
            continue
        if src:
            path.write_text(json.dumps(fc, separators=(",", ":")))
        for c in catalog:
            if c["name"] == name:
                c["available"] = True
                c["count"] = len(fc["features"])
        adopted.append(name)
        print(f"  adopted {name}: {len(fc['features'])} features")
    catalog_path.write_text(json.dumps(catalog, separators=(",", ":")))
    if timed := [n for n in adopted if n != "windy-webcams"]:  # "updated X ago"
        record_layer_times(timed)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--hourly", action="store_true", help="also refresh slower/heavier layers")
    ap.add_argument("--daily", action="store_true", help="refresh the OpenStreetMap places")
    ap.add_argument("--weekly", action="store_true", help="refresh the nationwide service lists")
    ap.add_argument("--keyed", action="store_true", help="refresh the keyed road-ops layers")
    ap.add_argument("--only", help="comma-separated layer names (e.g. windy-webcams)")
    ap.add_argument(
        "--adopt", help="mark already-present layer files available (comma-separated; CI artifacts)"
    )
    ap.add_argument("--from", dest="src", type=Path, help="--adopt: take the files from this dir")
    args = ap.parse_args()
    if args.adopt:
        raise SystemExit(adopt(args.adopt, args.src))
    chosen = (
        tuple(args.only.split(","))
        if args.only
        else KEYED  # CI: only in the isolated job that holds the 511 / OHGO keys
        if args.keyed
        else WEEKLY + FAST  # the weekly run deploys too
        if args.weekly
        else DAILY + FAST  # the daily run deploys too: keep live layers fresh
        if args.daily
        else FAST + (HOURLY if args.hourly else ())
    )
    raise SystemExit(asyncio.run(main(chosen)))
