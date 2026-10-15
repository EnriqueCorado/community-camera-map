"""Nationwide license plate readers, split into tiles the map loads by view.

Source: DeFlock's processed OpenStreetMap export (cdn.deflock.me, the data
behind deflock.me; OSM data, ODbL). Its CDN only allows deflock.me in
browsers, so we fetch it here (once a day in CI) and publish our own tiles:

  frontend/public/data/alpr/index.json      {cell_deg, cells: {"35_-125": n}, total, updated}
  frontend/public/data/alpr/<lat>_<lon>.geojson   one 5-degree cell (SW corner)
  frontend/public/data/alpr/overview.geojson      counts on a 0.5-degree grid (zoomed out)

Stanislaus readers keep the "who can search them" fields from the curated
California file (app/cameras/data/alpr_ca.geojson, see enrich_alpr.py).

    cd backend && uv run python scripts/build_alpr_usa.py
"""

from __future__ import annotations

import datetime as dt
import json
import math
import shutil
import sys
from collections import defaultdict
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend/public/data/alpr"
CA_FILE = ROOT / "backend/app/cameras/data/alpr_ca.geojson"
INDEX = "https://cdn.deflock.me/regions/index.json"
CELL = 5  # degrees per published tile
GRID = 0.5  # overview grid
# Contiguous US, Alaska, Hawaii, Puerto Rico (same boxes as the frontend).
US_BOXES = (
    (-125.0, 24.4, -66.9, 49.5),
    (-180.0, 51.0, -129.9, 71.5),
    (-160.3, 18.9, -154.8, 22.3),
    (-67.3, 17.9, -65.2, 18.6),
)
UA = "stanislaus-cam-map/alpr (+https://github.com/EnriqueCorado/stanislaus-cam-map)"
MAX_TILE_BYTES = 50 * 1024 * 1024
MIN_READERS = 50_000  # far below today's ~145k: a smaller result means a broken download
KEEP_FRACTION = 0.8  # never publish fewer than 80% of the previous build's readers


def get_capped(client: httpx.Client, url: str) -> bytes:
    """GET from cdn.deflock.me only (no redirects), aborting past MAX_TILE_BYTES."""
    if httpx.URL(url).host != "cdn.deflock.me" or not url.startswith("https://"):
        raise SystemExit(f"refusing non-DeFlock URL: {url}")
    with client.stream("GET", url) as r:
        r.raise_for_status()
        body = bytearray()
        for chunk in r.iter_bytes():
            body += chunk
            if len(body) > MAX_TILE_BYTES:
                raise SystemExit(f"{url}: larger than {MAX_TILE_BYTES} bytes")
        return bytes(body)


def in_us(lon: float, lat: float) -> bool:
    return any(w <= lon <= e and s <= lat <= n for w, s, e, n in US_BOXES)


def vendor(tags: dict) -> str:
    """Same three buckets as the California file and the map's filter."""
    m = f"{tags.get('manufacturer', '')} {tags.get('brand', '')}".lower()
    if "flock" in m:
        return "Flock Safety"
    if "motorola" in m or "vigilant" in m:
        return "Motorola / Vigilant"
    return "Other / unknown"


def feature(node: dict, extra: dict | None = None) -> dict | None:
    """One DeFlock node -> our compact feature (or None if unusable)."""
    try:
        lon, lat = float(node["lon"]), float(node["lat"])
        osm_id = int(node["id"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (math.isfinite(lon) and math.isfinite(lat)) or not in_us(lon, lat):
        return None
    raw = node.get("tags")
    tags: dict = raw if isinstance(raw, dict) else {}
    props: dict = {"osm_id": osm_id, "vendor": vendor(tags)}
    if tags.get("operator"):
        props["operator"] = str(tags["operator"])[:120]
    direction = tags.get("direction") or tags.get("camera:direction")
    if direction:
        props["direction"] = str(direction)[:40]
    props.update(extra or {})
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
    }


def tiles_needed(size: int) -> list[str]:
    """DeFlock tile keys ("lat/lon" SW corners) that touch the US boxes."""
    keys = set()
    for w, s, e, n in US_BOXES:
        for lat in range(math.floor(s / size) * size, math.ceil(n / size) * size, size):
            for lon in range(math.floor(w / size) * size, math.ceil(e / size) * size, size):
                keys.add(f"{lat}/{lon}")
    return sorted(keys)


def ca_extras() -> dict[int, dict]:
    """County and agency fields from the curated California file, by OSM id."""
    keep = ("county", "agency", "agency_basis")
    out = {}
    for f in json.loads(CA_FILE.read_text()).get("features", []):
        p = f.get("properties") or {}
        extra = {k: p[k] for k in keep if p.get(k)}
        if extra and isinstance(p.get("osm_id"), int):
            out[p["osm_id"]] = extra
    return out


def build(nodes: list[dict], extras: dict[int, dict], out: Path, min_readers: int = 0) -> dict:
    """Write the tiles, overview and index from DeFlock nodes."""
    feats: dict[int, dict] = {}
    for node in nodes:
        nid = node.get("id")
        f = feature(node, extras.get(nid) if isinstance(nid, int) else None)
        if f:
            feats[f["properties"]["osm_id"]] = f  # tiles overlap at edges: dedupe
    previous = 0
    try:
        previous = int(json.loads((out / "index.json").read_text()).get("total", 0))
    except (OSError, ValueError, AttributeError):
        pass
    if len(feats) < max(min_readers, int(previous * KEEP_FRACTION)):
        raise SystemExit(
            f"only {len(feats)} readers (previous build: {previous}); keeping the old tiles"
        )
    cells: dict[str, list] = defaultdict(list)
    grid: dict[tuple[float, float], int] = defaultdict(int)
    for f in feats.values():
        lon, lat = f["geometry"]["coordinates"]
        cells[f"{math.floor(lat / CELL) * CELL}_{math.floor(lon / CELL) * CELL}"].append(f)
        grid[(math.floor(lon / GRID) * GRID, math.floor(lat / GRID) * GRID)] += 1
    tmp = out.with_name(out.name + ".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    for key, fs in cells.items():
        (tmp / f"{key}.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": fs}, separators=(",", ":"))
        )
    overview = [
        {
            "type": "Feature",
            "properties": {"count": n},
            "geometry": {"type": "Point", "coordinates": [lon + GRID / 2, lat + GRID / 2]},
        }
        for (lon, lat), n in grid.items()
    ]
    (tmp / "overview.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": overview}, separators=(",", ":"))
    )
    index = {
        "cell_deg": CELL,
        "cells": {k: len(v) for k, v in sorted(cells.items())},
        "total": len(feats),
        "updated": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "source": "DeFlock / OpenStreetMap contributors (ODbL)",
    }
    (tmp / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    shutil.rmtree(out, ignore_errors=True)
    tmp.rename(out)  # swap in only a complete build
    return index


def main() -> int:
    with httpx.Client(timeout=120, headers={"User-Agent": UA}, follow_redirects=False) as client:
        ix = json.loads(get_capped(client, INDEX))
        size = int(ix["tile_size_degrees"])
        template = str(ix["tile_url"])
        if "{lat}/{lon}" not in template:
            raise SystemExit(f"unexpected tile URL: {template}")
        available = set(ix.get("regions", []))
        nodes: list[dict] = []
        for key in tiles_needed(size):
            if key not in available:
                continue
            # Any failure aborts: a partial country must never replace good tiles.
            data = json.loads(get_capped(client, template.replace("{lat}/{lon}", key)))
            if not isinstance(data, list):
                raise SystemExit(f"{key}: not a list")
            nodes.extend(n for n in data if isinstance(n, dict))
            print(f"  {key}: {len(data)} nodes")
    index = build(nodes, ca_extras(), OUT, min_readers=MIN_READERS)
    print(f"alpr: {index['total']} readers in {len(index['cells'])} tiles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
