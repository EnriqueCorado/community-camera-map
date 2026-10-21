"""The static site's split camera list (app/cameras/static_split.py): the index,
search file and grid cells line up, round-trip to the one-file form, and the
committed copy is consistent. No network."""

from __future__ import annotations

import json
from pathlib import Path

from app.cameras import static_split as ss
from app.layers import service

KEYS = {"n": "name", "c": "county", "p": "nearby_place", "r": "route", "src": "source",
        "st": "state", "s": "snapshot_url"}  # fmt: skip
SOURCES = {
    "caltrans": {"name": "Caltrans", "state": "CA"},
    "il": {"name": "Illinois DOT", "state": "IL"},
    "ndbc": {"name": "NOAA", "state": ""},
}


def _payload() -> dict:
    cams = [
        {"id": "d10-b", "n": "SR-99 at Briggsmore", "c": "Stanislaus", "p": "Modesto",
         "r": "SR-99", "latitude": 37.66, "longitude": -120.99, "s": "https://x/b.jpg"},
        {"id": "il-1", "n": "Hillside", "r": "I-290", "latitude": 41.8801, "longitude": -87.9,
         "src": "il", "s": "https://x/il.jpg"},
        {"id": "d10-a", "n": "SR-99 at 5th", "c": "Stanislaus", "latitude": 37.63,
         "longitude": -121.0, "s": "https://x/a.jpg"},
        # Southern/western hemispheres and a cell edge: floor, not truncation.
        {"id": "ndbc-1", "n": "Buoy", "latitude": -0.5, "longitude": -2.0, "src": "ndbc",
         "st": "CA", "s": "https://x/n.jpg"},
        {"id": "edge", "n": "Edge", "latitude": 37.99996, "longitude": -122.00004,
         "s": "https://x/e.jpg"},
    ]  # fmt: skip
    return {"count": len(cams), "source": "test", "sources": SOURCES, "keys": KEYS, "cameras": cams}


def _decode(index: dict) -> list[tuple[str, int, int]]:
    out, i = [], 0
    for key, n in zip(index["cells"], index["n"], strict=True):
        a, o = (int(x) * index["grid"] * index["q"] for x in key.split("_"))
        for _ in range(n):
            a += index["lat"][i]
            o += index["lon"][i]
            out.append((key, a, o))
            i += 1
    return out


def test_cell_key_floors_toward_minus_infinity():
    assert ss.cell_key(37.66, -120.99) == "18_-61"
    assert ss.cell_key(-0.5, -2.0) == "-1_-1"
    assert ss.cell_key(38.0, -122.0) == "19_-61"
    assert ss.quantize(37.12345) == 371235 and ss.quantize(-120.00005) == -1200000


def test_split_lines_up_index_search_and_cells():
    files = ss.split(_payload())
    index, search = files["index.json"], files["search.json"]
    assert set(files) == {"index.json", "search.json"} | {f"cells/{k}.json" for k in index["cells"]}
    assert index["count"] == 5 and sum(index["n"]) == 5 and index["agencies"] == 3
    assert index["cells"] == sorted(index["cells"])
    blob = json.dumps(index)  # positions only: no URLs, names or ids
    assert "Briggsmore" not in blob and "d10-a" not in blob and "https://x" not in blob
    # Point i == search row i == record k of its cell, with matching coordinates.
    records = [c for key in index["cells"] for c in files[f"cells/{key}.json"]["cameras"]]
    for i, ((key, qa, qo), cam) in enumerate(zip(_decode(index), records, strict=True)):
        assert ss.cell_key(cam["latitude"], cam["longitude"]) == key
        assert (qa, qo) == (ss.quantize(cam["latitude"]), ss.quantize(cam["longitude"]))
        assert search["n"][i] == cam["n"]
        assert search["strings"][search["r"][i]] == cam.get("r", "")
    # Within a cell, sorted by position: Modesto's two cameras south to north.
    modesto = files["cells/18_-61.json"]["cameras"]
    assert [c["id"] for c in modesto] == ["d10-a", "d10-b"]
    # State: the source's unless the camera names its own.
    st = {c["id"]: search["strings"][search["st"][i]] for i, c in enumerate(records)}
    assert st == {"d10-a": "CA", "d10-b": "CA", "il-1": "IL", "ndbc-1": "CA", "edge": "CA"}
    assert search["strings"][0] == ""
    # One layout version everywhere.
    assert {f["v"] for f in files.values()} == {index["v"]}


def test_version_tracks_the_layout_only():
    p = _payload()
    v = ss.split(p)["index.json"]["v"]
    p["cameras"][0]["s"] = "https://x/new.jpg"  # new still URL: same layout
    assert ss.split(p)["index.json"]["v"] == v
    p["cameras"][1]["latitude"] += 0.001  # moved (same order in its cell): new layout
    moved = ss.split(p)["index.json"]["v"]
    assert moved != v
    p["cameras"].pop()  # a camera gone: new layout
    assert ss.split(p)["index.json"]["v"] not in (v, moved)


def test_write_read_round_trip_and_replace(tmp_path: Path):
    p = _payload()
    (tmp_path / "cameras.json").write_text("{}")  # the old one-file form is removed
    sizes = ss.write(tmp_path, p)
    assert not (tmp_path / "cameras.json").exists()
    assert sizes["index.json"] == len((tmp_path / "cameras/index.json").read_text())
    back = ss.read(tmp_path)
    assert {k: v for k, v in back.items() if k != "cameras"} == {
        k: v for k, v in p.items() if k != "cameras"
    }
    assert sorted(back["cameras"], key=lambda c: c["id"]) == sorted(
        p["cameras"], key=lambda c: c["id"]
    )
    assert ss.read_count(tmp_path) == 5
    assert sorted(ss.read_points(tmp_path)) == sorted(
        (ss.quantize(c["latitude"]) / ss.Q, ss.quantize(c["longitude"]) / ss.Q)
        for c in p["cameras"]
    )
    # A smaller list replaces the folder whole: emptied cells disappear.
    p["cameras"] = [c for c in p["cameras"] if c["id"] != "il-1"]
    p["count"] = 4
    ss.write(tmp_path, p)
    assert not (tmp_path / "cameras/cells/20_-44.json").exists()
    assert not (tmp_path / "cameras.tmp").exists()
    assert ss.read_count(tmp_path) == 4
    assert ss.read_count(tmp_path / "nowhere") == 0


def test_write_refuses_a_secret_in_any_file(tmp_path: Path):
    p = _payload()
    ss.write(tmp_path, p, secrets=["", "not-there"])
    p["sources"] = {
        **SOURCES,
        "il": {"name": "Illinois DOT", "state": "IL", "url": "https://x/?k=sekrit"},
    }
    try:
        ss.write(tmp_path, p, secrets=["sekrit"])
    except ValueError as exc:
        assert "API key" in str(exc)
    else:
        raise AssertionError("a key was written")
    assert "sekrit" not in (tmp_path / "cameras/index.json").read_text()  # old list kept


def test_join_refuses_cells_from_another_bake():
    files = ss.split(_payload())
    files["cells/18_-61.json"] = {**files["cells/18_-61.json"], "v": "other"}
    try:
        ss.join(files)
    except ValueError as exc:
        assert "another bake" in str(exc)
    else:
        raise AssertionError("mixed bakes joined")


def test_committed_split_is_consistent():
    data = service.BAKED_DATA
    assert not (data / "cameras.json").exists()
    index = json.loads((data / "cameras/index.json").read_text())
    search = json.loads((data / "cameras/search.json").read_text())
    joined = ss.read(data)  # every cell present and from the same bake
    assert len(joined["cameras"]) == index["count"] == len(search["n"]) == len(index["lat"])
    assert search["v"] == index["v"]
    assert index["agencies"] == len(index["sources"])
    assert {p.name for p in (data / "cameras/cells").iterdir()} == {
        f"{k}.json" for k in index["cells"]
    }
    # The split is the canonical form: re-splitting the joined list reproduces it.
    assert ss.split(joined)["index.json"] == index
    # The Windy dedupe reads positions from the index.
    assert len(service._known_cameras()) == index["count"]
