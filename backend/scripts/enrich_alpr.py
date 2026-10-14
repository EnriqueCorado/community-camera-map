"""Tag Stanislaus County plate readers in alpr_ca.geojson with the agency
profile (data/alpr_access.json) that says who can search them.

Fetches the county's readers (with full OSM tags) from Overpass and the city
limits from the county GIS, then applies the conservative rules in
`app.layers.alpr_access`. Re-run after refreshing alpr_ca.geojson:

    cd backend && uv run python scripts/enrich_alpr.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from app.core.config import get_settings
from app.layers.alpr_access import enrich
from app.layers.service import LayerService

for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

DATA = Path(__file__).resolve().parent.parent / "app" / "cameras" / "data"
# Public Overpass mirrors, tried in order (each occasionally 504s under load).
OVERPASS = (
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
)
QUERY = (
    '[out:json][timeout:120];area["name"="Stanislaus County"]["admin_level"="6"]->.c;'
    'node["surveillance:type"="ALPR"](area.c);out body;'
)


async def fetch_readers(client: httpx.AsyncClient) -> dict[int, dict]:
    last: Exception | None = None
    for attempt in range(4):
        url = OVERPASS[attempt % len(OVERPASS)]
        try:
            r = await client.post(url, data={"data": QUERY})
            r.raise_for_status()
            return {e["id"]: e for e in r.json()["elements"]}
        except httpx.HTTPError as exc:
            last = exc
            print(f"  overpass attempt {attempt + 1} failed: {type(exc).__name__}")
            await asyncio.sleep(5)
    raise RuntimeError("all Overpass attempts failed") from last


async def main() -> None:
    async with httpx.AsyncClient(
        timeout=150.0, headers={"User-Agent": "stanislaus-cam-map/enrich"}
    ) as client:
        raw = await fetch_readers(client)
        cities = json.loads(
            await LayerService(settings=get_settings(), client=client).get_bytes("city-limits")
        )["features"]

    path = DATA / "alpr_ca.geojson"
    fc = json.loads(path.read_text())
    counts = enrich(fc, raw, cities)
    path.write_text(json.dumps(fc, separators=(",", ":")))
    in_county = sum(1 for f in fc["features"] if f["properties"].get("osm_id") in raw)
    print(f"{len(raw)} county readers from Overpass, {in_county} matched in the layer")
    print(f"{len(cities)} city-limit shapes")
    for key, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {n:4d}  {key}")


if __name__ == "__main__":
    asyncio.run(main())
