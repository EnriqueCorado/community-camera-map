"""Nationwide-parity pack: USGS groundwater and ORNL ODIN parsers (small
hand-written fixtures shaped like the real replies) and pack-wide rules."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.layers.service import LAYERS  # first: it registers the packs

# isort: split
from app.layers.national import _parity_parse as pp
from app.layers.national import parity
from scripts.bake import SOURCES

ROOT = Path(__file__).resolve().parents[2]


def _ts(agency: str, number: str, values: list, name="CA Bb 27", lon=-76.66, lat=38.73) -> dict:
    """One WaterML-JSON time series (waterservices.usgs.gov iv/dv)."""
    return {
        "sourceInfo": {
            "siteName": name,
            "siteCode": [{"value": number, "network": "NWIS", "agencyCode": agency}],
            "geoLocation": {
                "geogLocation": {"srs": "EPSG:4326", "latitude": lat, "longitude": lon}
            },
        },
        "variable": {"variableCode": [{"value": "72019"}], "noDataValue": -999999.0},
        "values": [{"value": [{"value": v, "dateTime": t} for t, v in values]}],
    }


def _reply(*series: dict) -> dict:
    return {"value": {"timeSeries": list(series)}}


MD = _reply(
    _ts("USGS", "384333076394701", [("2026-10-21T20:00:00.000-04:00", "180.49")]),
    # same well, second sensor: the newer reading wins
    _ts("USGS", "384333076394701", [("2026-10-21T22:00:00.000-04:00", "180.61")]),
    _ts("USGS", "402750088523801", [("2026-10-20T05:54:00.000-05:00", "-999999")]),  # no data
    _ts("USGS", "402750088523802", [("2026-10-20T05:54:00.000-05:00", "3.1")], lon=0, lat=0),
    _ts("bad id", "402750088523803", [("2026-10-20T05:54:00.000-05:00", "3.1")]),
    _ts("USGS", "402750088523804", [("2026-09-01T05:54:00.000-05:00", "8.0")]),  # offline
)
SC = _reply(
    # flowing well: water above land surface (negative depth) is kept
    _ts(
        "USGS",
        "330548081391102",
        [("2026-10-20T19:45:00.000-04:00", "-4.7")],
        "Flowing",
        -81.65,
        33.1,
    ),
)
MO = _reply(_ts("MO005", "373706086300802", [("2026-10-19T00:00:00.000-05:00", "12.3")], "Well 5"))
DAILY = _reply(
    _ts("USGS", "384333076394701", [("2025-10-18T00:00:00.000", "176.0"), ("2025-10-22T00:00:00.000", "175.1")]),
    _ts("USGS", "330548081391102", [("2025-10-20T00:00:00.000", "-4.9")]),
    _ts("MO005", "373706086300802", [("2025-10-17T00:00:00.000", "15.0"), ("2026-09-01T00:00:00.000", "1.0")]),
)  # fmt: skip


def _parsed():
    return pp.iv_latest([("MD", MD), ("SC", SC), ("MO", MO)])


def test_latest_keeps_the_newest_valid_reading_per_well_on_its_local_day():
    latest, sites = _parsed()
    assert set(latest) == {
        "USGS-384333076394701",
        "USGS-330548081391102",
        "MO005-373706086300802",
        "USGS-402750088523804",
    }
    # 22:00 EDT on the 21st is the 22nd in UTC: the popup shows the local day
    assert latest["USGS-384333076394701"] == (-76.66, 38.73, 180.61, "2026-10-21")
    assert latest["USGS-330548081391102"][2] == -4.7
    assert sites["MO005-373706086300802"] == {"name": "Well 5", "st": "MO"}


def test_year_ago_picks_the_closest_old_enough_reading():
    rows = [("2025-10-18", 1.0), ("2025-10-22", 2.0), ("2026-09-01", 3.0)]
    assert pp.year_ago("2026-10-22", rows) == ("2025-10-22", 2.0)
    assert pp.year_ago("2026-10-22", [("2026-09-01", 3.0)]) is None
    assert pp.year_ago("not a date", rows) is None


def test_trend_classes():
    assert pp.trend(None) == ""
    assert pp.trend(5.5) == "deeper"
    assert pp.trend(-1.2) == "shallower"
    assert pp.trend(0.4) == "steady"


def test_groundwater_fc_matches_the_california_popup_fields():
    latest, sites = _parsed()
    fc = pp.groundwater_fc(latest, pp.dv_values([DAILY]), sites, since="2026-09-21")
    by = {f["properties"]["site"]: f for f in fc["features"]}
    assert "USGS-402750088523804" not in by  # offline: no reading in the last 30 days
    md = by["USGS-384333076394701"]["properties"]
    assert md == {
        "depth_ft": 180.6,
        "date": "2026-10-21",
        "change_ft": 5.5,  # 5.5 ft deeper than 2025-10-22
        "since": "2025-10-22",
        "trend": "deeper",
        "name": "CA Bb 27",
        "st": "MD",
        "site": "USGS-384333076394701",
    }
    sc = by["USGS-330548081391102"]["properties"]
    assert sc["depth_ft"] == -4.7 and sc["trend"] == "steady" and sc["name"] == "Flowing"
    mo = by["MO005-373706086300802"]["properties"]
    assert mo["change_ft"] == -2.7 and mo["since"] == "2025-10-17" and mo["trend"] == "shallower"
    assert by["USGS-384333076394701"]["geometry"]["coordinates"] == [-76.66, 38.73]
    lone = pp.groundwater_fc({"USGS-12345678": (-100.0, 40.0, 3.0, "2026-10-21")}, {}, {})
    assert lone["features"][0]["properties"] == {
        "depth_ft": 3.0,
        "date": "2026-10-21",
        "site": "USGS-12345678",
    }  # empty values are dropped


def test_parsers_ignore_garbage():
    junk = [None, {"value": "x"}, {"value": {"timeSeries": [1, {"sourceInfo": 3}]}}]
    assert pp.iv_latest([("XX", j) for j in junk]) == ({}, {})
    assert pp.dv_values(junk) == {}
    bad_day = _reply(_ts("USGS", "12345678", [("nope", "1")]))
    assert pp.dv_values([bad_day]) == {}


async def test_loader_refuses_a_gutted_reply(monkeypatch):
    async def few(_client, url, params=None):
        return MO if params.get("stateCd") == "MO" else {}

    monkeypatch.setattr(parity, "_get_json", few)
    with pytest.raises(ValueError, match="only 1 wells"):
        async with httpx.AsyncClient() as c:
            await parity._groundwater_usa(c, None)


async def test_get_json_treats_unknown_states_as_empty_and_never_follows_redirects():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("stateCd") == "AS":
            return httpx.Response(400)
        return httpx.Response(302, headers={"location": "https://evil.example/"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        assert await parity._get_json(c, parity.USGS_IV, {"stateCd": "AS"}) == {}
        with pytest.raises(httpx.HTTPStatusError):
            await parity._get_json(c, parity.USGS_IV, {"stateCd": "MD"})


_SQUARE = [[-112.17753, 40.59589], [-112.17752, 40.59589], [-111.9, 40.6], [-111.9, 40.9], [-112.17753, 40.59589]]  # fmt: skip
ODIN = [
    {
        "id": "49035",
        "countyName": "Salt Lake",
        "stateName": "Utah",
        "metersOut": 132,
        "feature": {"type": "Polygon", "coordinates": [_SQUARE], "properties": {"x": 1}},
        "outages": [
            {"utilityName": "PACIFICORP", "metersOut": 100, "metersServed": 1932558},
            {"utilityName": "PACIFICORP", "metersOut": 32},
            {"utilityName": "MURRAY CITY"},
        ],
    },
    {
        "id": "22071",
        "countyName": "Orleans",
        "stateName": "Louisiana",
        "metersOut": "1683",
        "feature": {"type": "MultiPolygon", "coordinates": [[_SQUARE], [_SQUARE]]},
        "outages": None,
    },
    {"id": "06099", "countyName": "Stanislaus", "metersOut": 0, "feature": {}},  # none out
    {"id": "bad", "metersOut": 5, "feature": {"type": "Polygon", "coordinates": [_SQUARE]}},
    {"id": "06001", "metersOut": 5, "feature": {"type": "Polygon", "coordinates": [[[1, 2]]]}},
    "junk",
]


def test_odin_counties_keeps_counties_with_customers_out_biggest_first():
    fc = pp.odin_counties(ODIN)
    assert [f["properties"] for f in fc["features"]] == [
        {"name": "Orleans Parish, Louisiana", "out": 1683, "fips": "22071"},
        {
            "name": "Salt Lake County, Utah",
            "out": 132,
            "utils": "MURRAY CITY; PACIFICORP",
            "fips": "49035",
        },
    ]
    ring = fc["features"][1]["geometry"]["coordinates"][0]
    assert ring[0] == [-112.178, 40.596] and len(ring) == 4  # rounded, repeat vertex dropped
    assert fc["features"][0]["geometry"]["type"] == "MultiPolygon"


def test_a_tiny_island_or_hole_doesnt_drop_the_county():
    speck = [[-70.0001, 41.0001], [-70.0002, 41.0001], [-70.0002, 41.0002], [-70.0001, 41.0001]]
    multi = {"type": "MultiPolygon", "coordinates": [[_SQUARE, speck], [speck]]}
    got = pp.shape(multi)
    assert got["type"] == "MultiPolygon" and len(got["coordinates"]) == 1
    assert len(got["coordinates"][0]) == 1  # the hole rounded away, the outline kept
    assert pp.shape({"type": "Polygon", "coordinates": [speck]}) is None
    assert pp.shape({"type": "Point", "coordinates": [1, 2]}) is None


def test_odin_rejects_a_changed_format_but_allows_no_outages():
    with pytest.raises(ValueError):
        pp.odin_counties({"error": "moved"})
    assert pp.odin_counties([]) == {"type": "FeatureCollection", "features": []}
    assert pp.county_label("Juneau City and Borough", "Alaska") == "Juneau City and Borough, Alaska"
    assert pp.county_label("Baltimore city", "Maryland") == "Baltimore city, Maryland"


def test_outage_layer_is_a_choropleth_refreshed_every_run():
    import sys

    sys.path.insert(0, str(ROOT / "backend" / "scripts"))
    from refresh_live import FAST

    lay = parity.LAYERS["power-outages-usa"]
    assert lay.metric and lay.metric.field == "out" and lay.loader and lay.ttl <= 900
    assert set(parity.FAST) <= set(FAST)
    assert "power-outages" in LAYERS and "outage-areas" in LAYERS  # Cal OES layers stay


def test_parity_state_specs_ship_and_never_request_contact_people():
    import json

    specs = json.loads(
        (ROOT / "backend/app/layers/data/state_layers/parity.json").read_text(encoding="utf-8")
    )
    names = {s["name"] for s in specs}
    assert {"us-duke-energy-outages", "md-power-outages", "ri-cooling-centers"} <= names
    assert sum(1 for n in names if "historical" in n or "monuments" in n) >= 10
    for s in specs:
        assert s["name"] in LAYERS and SOURCES.get(s["name"]) and s.get("license")
        src = " ".join(s["view"]["fields"]).lower()
        assert "email" not in src and "contactname" not in src and "poc" not in src, s["name"]
        assert "hmdb" not in json.dumps(s).lower(), s["name"]  # no HMDB-derived copies


def test_pack_layers_are_self_describing_and_credited():
    for name, layer in parity.LAYERS.items():
        assert LAYERS[name] is layer
        assert layer.title_es and layer.group and layer.coverage == "usa"
        assert SOURCES.get(name)
    gw = parity.LAYERS["groundwater-usa"]
    assert gw.category == "groundwater" and gw.loader and gw.ttl == 24 * 3600
    assert "groundwater" in LAYERS  # the California layer stays (more wells there)


def test_daily_layers_are_refreshed_and_cached_in_ci():
    import sys

    sys.path.insert(0, str(ROOT / "backend" / "scripts"))
    from refresh_live import DAILY

    yml = (ROOT / ".github/workflows/pages.yml").read_text()
    for name in parity.DAILY:
        assert name in DAILY
        assert yml.count(f"frontend/public/data/layers/{name}.geojson") == 2
