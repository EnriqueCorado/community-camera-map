"""Add coordinates to a curated locations file with the free U.S. Census
geocoder (no key), falling back to OpenStreetMap Nominatim (1 request/second,
per its usage policy). Entries that already have lat/lon are left alone;
misses are reported so they can be fixed by hand.

    cd backend
    uv run python scripts/geocode_locations.py app/layers/data/<file>.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
NOMINATIM = "https://nominatim.openstreetmap.org/search"


def main(path: Path, state: str = "CA") -> int:
    data = json.loads(path.read_text())
    misses = 0
    with httpx.Client(
        timeout=30,
        headers={
            "User-Agent": "community-camera-map/geocode (+https://github.com/EnriqueCorado/community-camera-map)"
        },
    ) as client:
        for loc in data["locations"]:
            if "lat" in loc:
                continue
            st = f"{loc.get('state', state)} {loc.get('zip', '')}".strip()
            q = f"{loc['address']}, {loc['city']}, {st}"
            r = client.get(
                URL, params={"address": q, "benchmark": "Public_AR_Current", "format": "json"}
            )
            matches = r.json().get("result", {}).get("addressMatches", [])
            if matches:
                c = matches[0]["coordinates"]
                loc["lat"], loc["lon"] = round(c["y"], 6), round(c["x"], 6)
                loc["geocoder"] = "census"
                time.sleep(0.2)  # be polite to the free service
                continue
            time.sleep(1.1)  # Nominatim: at most 1 request/second
            hits = client.get(
                NOMINATIM, params={"q": q, "format": "jsonv2", "countrycodes": "us", "limit": 1}
            ).json()
            if hits:
                loc["lat"], loc["lon"] = (
                    round(float(hits[0]["lat"]), 6),
                    round(float(hits[0]["lon"]), 6),
                )
                loc["geocoder"] = "osm"
            else:
                misses += 1
                print(f"  no match: {q}")
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"geocoded {len(data['locations']) - misses}/{len(data['locations'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1])))
