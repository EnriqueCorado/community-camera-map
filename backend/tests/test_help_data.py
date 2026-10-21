"""Help tools data: the legal-help directory transform + its curated file, and
the parcel year-built bake (pure helpers and the shipped shards)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from build_parcel_years import build, reduce, shard_key, use_class, years  # noqa: E402

from app.layers import transforms  # noqa: E402
from app.layers.service import LAYER_DATA, LAYERS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PARCELS = ROOT / "frontend" / "public" / "data" / "parcels"
MODESTO = (-120.997, 37.639)
# Offices in the county, plus the few nearby ones county residents are sent to
# (Stockton/Lodi immigration and wage-claim offices, Merced).
MAX_KM = 70


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    import math

    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(h))


# ---------- legal help ----------


def test_legal_help_keeps_only_complete_sourced_entries():
    payload = {
        "checked": "2026-10-19",
        "offices": [
            {
                "id": "ok",
                "name": "OK",
                "kinds": ["immigration", "nonsense"],
                "lat": 37.6,
                "lon": -121.0,
                "website": "https://ok.example",
                "cost": "free",
                "eoir_recognized": True,
                "languages": ["English", "Spanish"],
                "sources": ["https://ok.example/contact"],
            },
            {
                "id": "no-kind",
                "kinds": ["bogus"],
                "lat": 37.6,
                "lon": -121.0,
                "sources": ["https://x"],
            },
            {"id": "no-geo", "kinds": ["housing"], "sources": ["https://x"]},
            {
                "id": "no-source",
                "kinds": ["housing"],
                "lat": 37.6,
                "lon": -121.0,
                "sources": ["http://x"],
            },
            {
                "id": "insecure-site",
                "kinds": ["housing"],
                "lat": 37.6,
                "lon": -121.0,
                "website": "javascript:alert(1)",
                "cost": "expensive",
                "sources": ["https://x"],
            },
        ],
    }
    feats = transforms.legal_help(payload)["features"]
    assert [f["properties"]["id"] for f in feats] == ["ok", "insecure-site"]
    ok, bad = (f["properties"] for f in feats)
    assert (
        ok["kinds"] == "immigration" and ok["eoir"] is True and ok["languages"] == "English|Spanish"
    )
    assert ok["checked"] == "2026-10-19"
    assert bad["website"] == "" and bad["cost"] == "varies"
    assert transforms.legal_help(None)["features"] == []


def test_shipped_legal_help_file_is_complete_and_in_the_county():
    layer = LAYERS["legal-help"]
    assert layer.category == "legal"
    raw = json.loads((LAYER_DATA / "legal_help.json").read_text())
    feats = transforms.legal_help(raw)["features"]
    # Every curated office must survive the transform (nothing silently dropped).
    assert len(feats) == len(raw["offices"]) >= 8
    ids = [f["properties"]["id"] for f in feats]
    assert len(ids) == len(set(ids)), "duplicate ids"
    for f in feats:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        assert _km((lon, lat), MODESTO) <= MAX_KM, p["id"]
        assert p["name"] and p["address"] and p["city"], p["id"]
        assert re.fullmatch(r"\(\d{3}\) \d{3}-\d{4}( .*)?", p["phone"]), (p["id"], p["phone"])
        assert p["website"] == "" or p["website"].startswith("https://"), p["id"]
        assert p["note_en"] and p["note_es"], p["id"]
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", p["checked"]), p["id"]


# ---------- parcel years ----------


def test_years_parse_lists_and_ignore_junk():
    assert years("2021") == (2021, 2021)
    assert years("1971, 1979") == (1971, 1979)
    assert years("2026, 1948") == (1948, 2026)
    assert years("    , 1950") == (1950, 1950)
    assert years("977 ") is None
    assert years("2508") is None
    assert years(None) is None


def test_use_class_falls_back_to_multifamily_neighborhoods():
    assert use_class("101", "R904") == "sfr"
    assert use_class("131", "R102") == "condo"
    assert use_class("201", None) == "duplex"
    assert use_class(None, "M102") == "multi"
    assert use_class(None, "C121") == ""


def test_reduce_keeps_only_address_year_and_use():
    attrs = {
        "situs_number": "737       ",
        "situs_street": "WHITECHURCH",
        "situs_suffix": "WAY",
        "situs_dir": None,
        "situs_city": "Newman CA 95360",
        "yearbuilt": "2008",
        "lu_code": "101",
        "neighborhoodcode": "R007",
        "owner": "SOMEONE",  # never requested, and never kept even if present
    }
    street, number, row = reduce(attrs)
    assert (street, number) == ("WHITECHURCH", "737")
    assert row == ["", "WAY", "NEWMAN", 2008, 2008, "sfr"]
    assert "SOMEONE" not in json.dumps(build([attrs]))
    assert reduce({**attrs, "yearbuilt": None}) is None
    assert reduce({**attrs, "situs_number": "0-A"}) is None


def test_shard_key_matches_the_browser():
    # frontend/src/help/parcels.ts shardKey(): first two [A-Z0-9], padded with "_".
    assert shard_key("CELESTE") == "CE"
    assert shard_key("9TH") == "9T"
    assert shard_key("O'BRIEN") == "OB"
    assert shard_key("A") == "A_"


def test_shipped_parcel_shards_hold_no_personal_fields():
    meta = json.loads((PARCELS / "meta.json").read_text())
    assert meta["addresses"] > 100_000
    shard = json.loads((PARCELS / "CE.json").read_text())
    rows = shard["CELESTE"]["1313"]  # a 1970s apartment complex in Modesto
    assert rows == [["", "DR", "MODESTO", 1971, 1979, ""]]
    for street, numbers in shard.items():
        assert shard_key(street) == "CE"
        for number, rows in numbers.items():
            for row in rows:
                assert len(row) == 6, (street, number)
