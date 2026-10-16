"""Nationwide plate-reader tiles: filtering, vendor buckets, tiling, enrichment."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from build_alpr_usa import build, feature, tiles_needed, vendor  # noqa: E402


def test_vendor_buckets():
    assert vendor({"manufacturer": "Flock Safety"}) == "Flock Safety"
    assert vendor({"brand": "Flock Group Inc."}) == "Flock Safety"
    assert vendor({"manufacturer": "Motorola Solutions"}) == "Motorola / Vigilant"
    assert vendor({"manufacturer": "Genetec"}) == "Other / unknown"
    assert vendor({}) == "Other / unknown"


def test_feature_keeps_us_only_and_compact_props():
    f = feature(
        {
            "id": 1,
            "lat": 37.6,
            "lon": -121.0,
            "tags": {"manufacturer": "Flock Safety", "direction": "90", "x": "y"},
        }
    )
    assert f["properties"] == {"osm_id": 1, "vendor": "Flock Safety", "direction": "90"}
    assert feature({"id": 2, "lat": 48.85, "lon": 2.35, "tags": {}}) is None  # Paris
    assert feature({"id": 3, "lat": "nan", "lon": -121, "tags": {}}) is None
    assert feature({"lat": 37, "lon": -121}) is None  # no id


def test_build_tiles_overview_index_and_enrichment(tmp_path):
    nodes = [
        {"id": 1, "lat": 37.6, "lon": -121.0, "tags": {"manufacturer": "Flock Safety"}},
        {"id": 1, "lat": 37.6, "lon": -121.0, "tags": {}},  # same node from an overlapping tile
        {"id": 2, "lat": 41.9, "lon": -87.6, "tags": {}},
    ]
    out = tmp_path / "alpr"
    ix = build(nodes, {1: {"agency": "modesto-pd", "county": "Stanislaus"}}, out)
    # A much smaller rebuild is refused and the old tiles stay.
    import pytest

    with pytest.raises(SystemExit):
        build([], {}, out)
    assert json.loads((out / "index.json").read_text())["total"] == 2
    assert ix["total"] == 2 and ix["cells"] == {"35_-125": 1, "40_-90": 1}
    t = json.loads((out / "35_-125.geojson").read_text())["features"][0]["properties"]
    assert t["agency"] == "modesto-pd" and t["county"] == "Stanislaus"
    assert len(json.loads((out / "overview.geojson").read_text())["features"]) == 2


def test_tiles_needed_cover_alaska_and_hawaii():
    keys = tiles_needed(20)
    assert "20/-160" in keys and "60/-160" in keys and "20/-100" in keys


def test_failed_cells_keep_last_builds_tile(tmp_path):
    out = tmp_path / "alpr"
    first = [
        {"id": 1, "lat": 37.6, "lon": -121.0, "tags": {}},
        {"id": 2, "lat": 41.9, "lon": -87.6, "tags": {}},
    ]
    build(first, {}, out)
    # Next day the Chicago cell (40/-90) fails: its tile is carried over.
    ix = build([{"id": 1, "lat": 37.6, "lon": -121.0, "tags": {}}], {}, out, keep_cells=("40/-90",))
    assert ix["total"] == 2 and ix["cells"] == {"35_-125": 1, "40_-90": 1}


def test_refuses_when_most_populated_cells_failed(tmp_path):
    import pytest

    out = tmp_path / "alpr"
    nodes = [
        {"id": 1, "lat": 37.6, "lon": -121.0, "tags": {}},
        {"id": 2, "lat": 41.9, "lon": -87.6, "tags": {}},
        {"id": 3, "lat": 33.7, "lon": -84.4, "tags": {}},
    ]
    build(nodes, {}, out)
    with pytest.raises(SystemExit):  # 2 of 3 populated cells actually failed
        build(
            nodes[:1], {}, out, keep_cells=("40/-90", "30/-85"), failed_cells=("40/-90", "30/-85")
        )
    # Merely deferred (out of time) is fine: carried over with their old date.
    ix = build(nodes[:1], {}, out, keep_cells=("40/-90", "30/-85"))
    assert ix["total"] == 3
    assert ix["cell_updated"]["35_-125"] > "" and set(ix["cell_updated"]) >= {"40_-90", "30_-85"}


def test_a_cell_that_suddenly_empties_keeps_its_previous_tile(tmp_path):
    out = tmp_path / "alpr"
    chicago = [{"id": i, "lat": 41.9, "lon": -87.6 + i * 1e-4, "tags": {}} for i in range(100)]
    modesto = [{"id": 1000, "lat": 37.6, "lon": -121.0, "tags": {}}]
    build(chicago + modesto, {}, out)
    # Chicago "refreshed" with no coordinates (the `out tags` bug): kept.
    broken = [{"id": i, "tags": {}} for i in range(100)]
    ix = build(broken + modesto, {}, out)
    assert ix["cells"]["40_-90"] == 100 and ix["total"] == 101


def test_overpass_query_asks_for_coordinates():
    import inspect

    import build_alpr_usa

    assert "out body;" in inspect.getsource(build_alpr_usa.from_overpass)
