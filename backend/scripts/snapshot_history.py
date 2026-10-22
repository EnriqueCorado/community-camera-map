"""Save today's copy of the fast-changing layers into a history folder (the
`history` branch's checkout), so the map can scrub back through past days.

    cd backend && uv run python scripts/snapshot_history.py ../history

Writes <dir>/<YYYY-MM-DD>/<layer>.geojson for HISTORY_LAYERS, updates
<dir>/index.json ({"days": {"2026-10-15": ["quakes", ...]}}) and drops days
older than KEEP_DAYS. Flights are deliberately not archived: a public
day-by-day record of aircraft positions would be a tracking history.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from app.core.config import get_settings
from app.layers.service import LayerService

HISTORY_LAYERS = (
    "quakes",
    "wildfire",
    "wildfire-perimeters",
    "fire-hotspots",
    "smoke-haze",
    "power-outages",
    "weather-alerts",
)
KEEP_DAYS = 90


def prune(index: dict, today: dt.date, root: Path) -> dict:
    """Drop days older than KEEP_DAYS from the index and the folder."""
    days = index.get("days", {}) if isinstance(index, dict) else {}
    keep = {}
    for day, names in days.items():
        try:
            old = (today - dt.date.fromisoformat(day)).days > KEEP_DAYS
        except ValueError:
            old = True
        if old:
            shutil.rmtree(root / day, ignore_errors=True)
        else:
            keep[day] = names
    return {"days": dict(sorted(keep.items()))}


async def main(root: Path, today: dt.date | None = None) -> int:
    today = today or dt.datetime.now(dt.UTC).date()
    day = today.isoformat()
    (root / day).mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    async with httpx.AsyncClient(
        timeout=60.0, headers={"User-Agent": "community-camera-map/history"}, follow_redirects=True
    ) as client:
        layers = LayerService(settings=get_settings(), client=client, fallback_to_baked=False)
        for name in HISTORY_LAYERS:
            try:
                body = await layers.get_bytes(name)
                fc = json.loads(body)
                if not isinstance(fc.get("features"), list):
                    raise ValueError("not a FeatureCollection")
            except Exception as exc:  # noqa: BLE001 - one bad source shouldn't stop the rest
                print(f"  skip {name}: {type(exc).__name__}")
                continue
            (root / day / f"{name}.geojson").write_text(json.dumps(fc, separators=(",", ":")))
            saved.append(name)
            print(f"  {name}: {len(fc['features'])} features")
    index_path = root / "index.json"
    index = json.loads(index_path.read_text()) if index_path.is_file() else {"days": {}}
    if saved:
        index.setdefault("days", {})[day] = saved
    index_path.write_text(json.dumps(prune(index, today, root), indent=1) + "\n")
    print(f"history {day}: {len(saved)}/{len(HISTORY_LAYERS)} layers")
    return 0 if saved else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main(Path(sys.argv[1]))))
