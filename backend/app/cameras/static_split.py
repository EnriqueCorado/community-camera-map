"""The static site's camera list, split so a first visit loads little.

The baked list (the compact `/api/cameras` form: short keys, defaults left out,
see scripts/bake.py `compact_camera`) is ~6 MB for ~27k cameras, and most
visitors look at one area. It's written as:

  cameras/index.json        every camera's position (quantized, delta-coded),
                            grouped by grid cell, plus counts and sources.
                            Loaded on every visit: enough to cluster all
                            cameras and show the header counts.
  cameras/search.json       name / place / county / route / state of every
                            camera, in index order. Loaded when a search starts.
  cameras/cells/<key>.json  the full records of one GRID x GRID degree cell, in
                            index order. Loaded when a camera there is opened
                            (or the cell is in view up close).

Point i of the index, row i of search.json and record k of its cell file are
the same camera. `v` (in all three) is a hash of that layout: the frontend
(src/camera-store.ts) checks it so files from different hourly deploys are never
mixed up. `join()` rebuilds the one-file form (used by the backend and tests).
Mirrors frontend/src/camera-data.ts (decodeIndex / decodeSearch / cellKey).
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
from pathlib import Path

GRID = 2  # degrees per cell side: ~230 cells, the largest (Atlanta) ~2.5k cameras
Q = 10_000  # index coordinates in 1e-4 degree steps (~10 m; dots only, records are exact)
DIR = "cameras"


def quantize(x: float) -> int:
    """floor(x*Q + 0.5): the same IEEE arithmetic as the frontend (Python's
    round() breaks ties to even, Math.round doesn't)."""
    return math.floor(x * Q + 0.5)


def cell_key(lat: float, lon: float) -> str:
    return f"{math.floor(lat / GRID)}_{math.floor(lon / GRID)}"


def _layout(payload: dict) -> list[tuple[str, list[dict]]]:
    cells: dict[str, list[dict]] = {}
    for c in payload["cameras"]:
        cells.setdefault(cell_key(c["latitude"], c["longitude"]), []).append(c)
    return [
        (
            key,
            sorted(
                cells[key],
                key=lambda c: (quantize(c["latitude"]), quantize(c["longitude"]), c["id"]),
            ),
        )
        for key in sorted(cells)
    ]


def split(payload: dict) -> dict[str, dict]:
    """The compact one-file payload -> {path under DIR: JSON object}."""
    keys: dict[str, str] = payload.get("keys", {})  # short -> long
    short = {long: s for s, long in keys.items()}
    k_src, k_st = short.get("source", "source"), short.get("state", "state")
    sources: dict[str, dict] = payload.get("sources", {})
    layout = _layout(payload)
    # The layout: which camera is point i, and where (a moved camera is a new layout).
    v = hashlib.sha256(
        json.dumps(
            [
                [key, [[c["id"], quantize(c["latitude"]), quantize(c["longitude"])] for c in cams]]
                for key, cams in layout
            ]
        ).encode()
    ).hexdigest()[:12]

    lat: list[int] = []
    lon: list[int] = []
    strings: list[str] = [""]
    string_ix: dict[str, int] = {"": 0}

    def sx(s: object) -> int:
        s = s if isinstance(s, str) else ""
        if s not in string_ix:
            string_ix[s] = len(strings)
            strings.append(s)
        return string_ix[s]

    search: dict[str, list] = {"n": [], "c": [], "p": [], "r": [], "st": []}
    text = {f: short.get(long, long) for f, long in
            (("n", "name"), ("c", "county"), ("p", "nearby_place"), ("r", "route"))}  # fmt: skip
    files: dict[str, dict] = {}
    for key, cams in layout:
        a, o = (int(x) * GRID * Q for x in key.split("_"))  # deltas start at the cell's corner
        for c in cams:
            qa, qo = quantize(c["latitude"]), quantize(c["longitude"])
            lat.append(qa - a)
            lon.append(qo - o)
            a, o = qa, qo
            search["n"].append(c.get(text["n"], ""))
            for f in ("c", "p", "r"):
                search[f].append(sx(c.get(text[f])))
            src = c.get(k_src, "caltrans")
            search["st"].append(sx(c.get(k_st, sources.get(src, {}).get("state", "CA"))))
        files[f"cells/{key}.json"] = {"v": v, "cell": key, "keys": keys, "cameras": cams}

    files["index.json"] = {
        "v": v,
        "count": len(payload["cameras"]),
        "source": payload.get("source", ""),
        "sources": sources,
        "agencies": len({c.get(k_src, "caltrans") for c in payload["cameras"]}),
        "grid": GRID,
        "q": Q,
        "cells": [key for key, _ in layout],
        "n": [len(cams) for _, cams in layout],
        "lat": lat,
        "lon": lon,
    }
    files["search.json"] = {"v": v, "strings": strings, **search}
    return files


def join(files: dict[str, dict]) -> dict:
    """split()'s output -> the one-file compact payload (cameras in index order)."""
    index = files["index.json"]
    cams: list[dict] = []
    keys: dict[str, str] = {}
    for key in index["cells"]:
        cell = files[f"cells/{key}.json"]
        if cell.get("v") != index["v"]:
            raise ValueError(f"cell {key} is from another bake")
        keys = cell.get("keys", keys)
        cams.extend(cell["cameras"])
    return {
        "count": index["count"],
        "source": index["source"],
        "sources": index["sources"],
        "keys": keys,
        "cameras": cams,
    }


def write(out: Path, payload: dict, secrets: list[str] | tuple[str, ...] = ()) -> dict[str, int]:
    """Write the split list to out/DIR, replacing the previous one whole (cells
    that no longer have cameras disappear). Returns {path: bytes}. Refuses
    (ValueError, nothing replaced) if any of `secrets` is in a file as written."""
    files = split(payload)
    bodies = {path: json.dumps(obj, separators=(",", ":")) for path, obj in files.items()}
    if any(s and s in body for s in secrets for body in bodies.values()):
        raise ValueError("an API key appears in the camera files")
    tmp = out / f"{DIR}.tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    (tmp / "cells").mkdir(parents=True)
    sizes = {}
    for path, body in bodies.items():
        (tmp / path).write_text(body)
        sizes[path] = len(body)
    final = out / DIR
    shutil.rmtree(final, ignore_errors=True)
    tmp.rename(final)
    (out / "cameras.json").unlink(missing_ok=True)  # the old one-file form
    return sizes


def read(out: Path) -> dict:
    """The baked list in one-file form (raises OSError/ValueError if absent/bad)."""
    d = out / DIR
    index = json.loads((d / "index.json").read_text())
    files = {"index.json": index}
    for key in index["cells"]:
        files[f"cells/{key}.json"] = json.loads((d / "cells" / f"{key}.json").read_text())
    return join(files)


def read_count(out: Path) -> int:
    """How many cameras the baked list has (0 if there's none)."""
    try:
        return int(json.loads((out / DIR / "index.json").read_text()).get("count", 0))
    except (OSError, ValueError, AttributeError, TypeError):
        return 0


def read_points(out: Path) -> list[tuple[float, float]]:
    """Every baked camera's (lat, lon), from the index alone (to ~10 m)."""
    index = json.loads((out / DIR / "index.json").read_text())
    pts: list[tuple[float, float]] = []
    i = 0
    for key, n in zip(index["cells"], index["n"], strict=True):
        a, o = (int(x) * index["grid"] * index["q"] for x in key.split("_"))
        for _ in range(n):
            a += index["lat"][i]
            o += index["lon"][i]
            pts.append((a / index["q"], o / index["q"]))
            i += 1
    return pts
