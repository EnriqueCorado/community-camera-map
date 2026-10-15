"""Unit tests for ALPR agency attribution (pure logic, no network)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.layers.alpr_access import assign, city_for, enrich, point_in_geometry

SQUARE = {"type": "Polygon", "coordinates": [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]}
SQUARE_WITH_HOLE = {
    "type": "Polygon",
    "coordinates": [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ],
}


@pytest.mark.parametrize(
    ("tags", "city", "expected"),
    [
        # Operator tags win and are "tagged".
        (
            {"operator": "Modesto Police Department", "manufacturer": "Flock Safety"},
            "MODESTO",
            ("modesto-pd", "tagged"),
        ),
        (
            {"operator": "The Home Depot", "manufacturer": "Flock Safety"},
            "MODESTO",
            ("retail-home-depot", "tagged"),
        ),
        ({"operator": "Lowe's"}, "CERES", ("retail-lowes", "tagged")),
        # An operator we have no records for is left unknown, never re-inferred.
        ({"operator": "Some HOA", "manufacturer": "Motorola Solutions"}, "MODESTO", (None, None)),
        # Inferred from vendor + jurisdiction.
        ({"manufacturer": "Motorola Solutions"}, "MODESTO", ("modesto-pd", "inferred")),
        ({"manufacturer": "Flock Safety"}, "TURLOCK", ("turlock-pd", "inferred")),
        ({"manufacturer": "EPIC IO Technologies"}, None, ("stanislaus-sheriff", "inferred")),
        ({"manufacturer": "Intelisite"}, "PATTERSON", ("stanislaus-sheriff", "inferred")),
        ({"manufacturer": "EPIC IO Technologies"}, "RIVERBANK", ("epic-io-network", "network")),
        # Deliberately NOT guessed.
        ({"manufacturer": "Flock Safety"}, "MODESTO", (None, None)),  # could be a business/HOA
        ({"manufacturer": "Motorola Solutions"}, "CERES", (None, None)),
        ({"manufacturer": "Rekor"}, "TURLOCK", (None, None)),
        ({}, None, (None, None)),
        # Vendor may come from `brand` when `manufacturer` is absent.
        ({"brand": "Motorola Solutions"}, "MODESTO", ("modesto-pd", "inferred")),
        ({"brand": "Flock Safety"}, "TURLOCK", ("turlock-pd", "inferred")),
        (
            {"manufacturer": "Rekor", "brand": "Flock Safety"},
            "TURLOCK",
            (None, None),
        ),  # manufacturer wins
        # Both spellings of the Epic iO / IntelliSite vendor are recognised.
        ({"manufacturer": "IntelliSite"}, "HUGHSON", ("stanislaus-sheriff", "inferred")),
        ({"brand": "Epic iQ"}, "WATERFORD", ("stanislaus-sheriff", "inferred")),
        ({"manufacturer": "IntelliSite"}, "CERES", ("epic-io-network", "network")),
        # An unrecognised Flock-tagged operator is not re-inferred as a city system.
        ({"operator": "Some HOA", "manufacturer": "Flock Safety"}, "TURLOCK", (None, None)),
    ],
)
def test_assign(tags, city, expected):
    assert assign(tags, city) == expected


def test_point_in_polygon_with_hole():
    assert point_in_geometry(2, 2, SQUARE_WITH_HOLE)
    assert not point_in_geometry(5, 5, SQUARE_WITH_HOLE)  # inside the hole
    assert not point_in_geometry(11, 5, SQUARE)


def test_point_on_shared_edge_belongs_to_exactly_one_polygon():
    # A camera exactly on a boundary shared by two cities must not be claimed by both
    # (or neither) — otherwise attribution would depend on feature order.
    left = {"type": "Polygon", "coordinates": [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]}
    right = {"type": "Polygon", "coordinates": [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]]}
    for pt in [(10, 5), (10, 0), (10, 10), (5, 10), (15, 0)]:
        assert point_in_geometry(*pt, left) + point_in_geometry(*pt, right) <= 1, pt
    assert point_in_geometry(10, 5, left) + point_in_geometry(10, 5, right) == 1


def test_point_in_geometry_ignores_non_polygon_types():
    assert not point_in_geometry(1, 1, {"type": "Point", "coordinates": [1, 1]})
    assert not point_in_geometry(1, 1, {"type": "Polygon", "coordinates": []})
    assert not point_in_geometry(1, 1, {})


def test_multipolygon():
    multi = {
        "type": "MultiPolygon",
        "coordinates": [
            SQUARE["coordinates"],
            [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]],
        ],
    }
    assert point_in_geometry(25, 25, multi)
    assert not point_in_geometry(15, 15, multi)


def test_county_island_beats_surrounding_city():
    cities = [
        {"properties": {"name": "MODESTO"}, "geometry": SQUARE},
        {
            "properties": {"name": "COUNTY"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]],
            },
        },
    ]
    assert city_for(2, 2, cities) == "MODESTO"
    assert city_for(5, 5, cities) is None  # unincorporated island inside Modesto
    assert city_for(50, 50, cities) is None  # outside every city


def test_enrich_only_touches_county_cameras_and_clears_stale_fields():
    fc = {
        "features": [
            {"geometry": {"type": "Point", "coordinates": [2, 2]}, "properties": {"osm_id": 1}},
            {"geometry": {"type": "Point", "coordinates": [2, 2]}, "properties": {"osm_id": 2}},
            # Outside the county: not in raw map; stale fields must be removed.
            {
                "geometry": {"type": "Point", "coordinates": [2, 2]},
                "properties": {"osm_id": 3, "agency": "x"},
            },
        ]
    }
    raw = {
        1: {"tags": {"manufacturer": "Motorola Solutions"}},
        2: {"tags": {"manufacturer": "Rekor"}},
    }
    cities = [{"properties": {"name": "MODESTO"}, "geometry": SQUARE}]
    counts = enrich(fc, raw, cities)
    p = [f["properties"] for f in fc["features"]]
    assert p[0]["agency"] == "modesto-pd" and p[0]["agency_basis"] == "inferred"
    assert "agency" not in p[1]
    assert "agency" not in p[2]
    assert counts == {"modesto-pd:inferred": 1, "unattributed": 1}


def test_enrich_skips_non_point_geometry():
    fc = {
        "features": [
            {
                "geometry": {"type": "Polygon", "coordinates": SQUARE["coordinates"]},
                "properties": {"osm_id": 1, "agency": "stale"},
            },
            {"geometry": None, "properties": {"osm_id": 2}},
        ]
    }
    raw = {
        1: {"tags": {"manufacturer": "Motorola Solutions"}},
        2: {"tags": {"manufacturer": "Motorola Solutions"}},
    }
    cities = [{"properties": {"name": "MODESTO"}, "geometry": SQUARE}]
    assert enrich(fc, raw, cities) == {}
    assert "agency" not in fc["features"][0]["properties"]  # stale value still cleared
    assert "agency_basis" not in fc["features"][1]["properties"]


# ---------- shipped data integrity ----------

DATA = Path(__file__).resolve().parent.parent / "app" / "cameras" / "data"
ACCESS = json.loads((DATA / "alpr_access.json").read_text())


def _bilingual(d: dict) -> bool:
    return isinstance(d, dict) and bool(d.get("en", "").strip()) and bool(d.get("es", "").strip())


def test_every_tagged_camera_points_at_a_real_profile():
    fc = json.loads((DATA / "alpr_ca.geojson").read_text())
    used = {f["properties"]["agency"] for f in fc["features"] if "agency" in f["properties"]}
    bases = {
        f["properties"].get("agency_basis") for f in fc["features"] if "agency" in f["properties"]
    }
    assert used, "enrich_alpr.py has not been run"
    assert used <= ACCESS["profiles"].keys()
    assert bases <= {"tagged", "inferred", "network"}


def test_every_profile_is_bilingual_and_sourced():
    sources = ACCESS["sources"]
    for src in sources.values():
        assert _bilingual(src["label"]) and src["url"].startswith("https://")
    for pid, prof in [*ACCESS["profiles"].items(), ("default", ACCESS["default"])]:
        assert _bilingual(prof["summary"]), pid
        if pid != "default":
            assert _bilingual(prof["name"]), pid
        assert prof["facts"], f"{pid} has no sourced facts"
        for fact in prof["facts"]:
            assert _bilingual(fact["text"]), pid
            assert fact["source"] in sources, (pid, fact["source"])
            assert fact["date"]
        for key in ("shares_with_source", "top_searchers_source"):
            if key in prof:
                assert prof[key] in sources


def test_modesto_sharing_list_matches_its_summary():
    mpd = ACCESS["profiles"]["modesto-pd"]
    n = len(mpd["shares_with"])
    assert n == len(set(mpd["shares_with"]))
    assert str(n) in mpd["summary"]["en"] and str(n) in mpd["summary"]["es"]


def test_outside_the_county_only_the_operator_rule_applies():
    fc = {
        "features": [
            # Not in the county's raw map: a tagged chain store elsewhere in CA.
            {
                "geometry": {"type": "Point", "coordinates": [50, 50]},
                "properties": {"osm_id": 7, "operator": "The Home Depot"},
            },
            {
                "geometry": {"type": "Point", "coordinates": [50, 50]},
                "properties": {"osm_id": 8, "operator": "Lowe’s"},
            },
            # Vendor + location rules must never fire outside the county.
            {
                "geometry": {"type": "Point", "coordinates": [50, 50]},
                "properties": {"osm_id": 9, "vendor": "EPIC IO Technologies"},
            },
        ]
    }
    counts = enrich(fc, {}, [])
    p = [f["properties"] for f in fc["features"]]
    assert (p[0]["agency"], p[0]["agency_basis"]) == ("retail-home-depot", "tagged")
    assert p[1]["agency"] == "retail-lowes"  # curly apostrophe normalized
    assert "agency" not in p[2]
    assert counts == {"statewide:retail-home-depot": 1, "statewide:retail-lowes": 1}
