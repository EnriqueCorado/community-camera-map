"""State-feed bakes (national/state_bakes.py): parsers on hand-written
fixtures (no network) and pack-wide rules (registration, attribution, CI
cadence, privacy of the baked files)."""

from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

import pytest

from app.layers.service import LAYERS  # first: it registers the packs

# isort: split
from app.layers.national import _state_bakes_parse as sb
from app.layers.national import state_bakes as pack
from app.layers.national.states import HOSTS as STATE_HOSTS
from scripts.bake import SOURCES

ROOT = Path(__file__).resolve().parents[2]
TODAY = dt.date(2026, 10, 21)

# --- Arkansas burn bans (HTML) ---------------------------------------------------

AR_PAGE = """<html><body>
<img src="data:image/png;base64,QUJD" alt="map">
<h3>Wildfire Danger &amp; Burn Bans</h3><span> as of 10/21/2026 9:04 AM</span>
<script>var x = "Burn Ban Counties (9)";</script>
<h4>County Judges Issue Burn Bans</h4>
<h5>Burn Ban Counties (3)</h5>
<p>Pulaski, Saint Francis, Hot Spring</p>
<h5>High Risk Counties (2)</h5>
<p>Pulaski, Hot Spring</p>
<h5>Moderate Risk Counties (2)</h5>
<p>Benton, Saint Francis</p>
<h5>Risk Level Definitions</h5>
</body></html>"""


def _county(name: str) -> dict:
    ring = [[-92.5, 34.6], [-92.0, 34.6], [-92.0, 35.0], [-92.5, 34.6]]
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "properties": {"NAME": name, "BASENAME": name.removesuffix(" County")},
    }


def test_ar_burn_bans_parses_lists_and_joins_counties():
    as_of, status = sb.ar_burn_bans(AR_PAGE)
    assert as_of == "10/21/2026 9:04 AM"
    assert status["pulaski"] == {"ban": True, "danger": "High"}
    assert status["st francis"] == {"ban": True, "danger": "Moderate"}
    assert status["benton"] == {"ban": False, "danger": "Moderate"}
    counties = {
        "features": [
            _county(n)
            for n in ("Pulaski County", "St. Francis County", "Hot Spring County", "Benton County")
        ]
    }
    feats = sb.ar_county_features(counties, status, as_of)
    assert [f["properties"]["name"] for f in feats] == [
        "Pulaski County",
        "St. Francis County",
        "Hot Spring County",
    ]
    assert feats[0]["properties"] == {
        "name": "Pulaski County",
        "status": "Burn ban in effect",
        "danger": "High wildfire danger",
        "as_of": "10/21/2026 9:04 AM",
    }


def test_ar_burn_bans_fail_loudly_on_layout_changes():
    with pytest.raises(ValueError, match="lists 2 of 3"):
        sb.ar_burn_bans(
            AR_PAGE.replace("Pulaski, Saint Francis, Hot Spring", "Pulaski, Hot Spring")
        )
    with pytest.raises(ValueError, match="as of"):
        sb.ar_burn_bans(AR_PAGE.replace("as of", "at"))
    _, status = sb.ar_burn_bans(AR_PAGE)
    with pytest.raises(ValueError, match="unknown counties"):
        sb.ar_county_features({"features": [_county("Pulaski County")]}, status, "x")


def test_ar_no_bans_today_is_an_empty_layer_not_an_error():
    page = AR_PAGE.replace("Burn Ban Counties (3)", "Burn Ban Counties (0)").replace(
        "<p>Pulaski, Saint Francis, Hot Spring</p>", ""
    )
    _, status = sb.ar_burn_bans(page)
    assert not any(v["ban"] for v in status.values())
    assert sb.ar_county_features({"features": [_county("Pulaski County")]}, status, "x") == []


# --- Reservoirs -------------------------------------------------------------------


def test_twdb_reservoirs_percent_full_and_stale_gauges_dropped():
    doc = {
        "Abilene": {
            "full_name": "Lake Abilene",
            "conservation_storage": 546.0,
            "conservation_capacity": 7900.0,
            "gauge_location": {"type": "Point", "coordinates": [-99.88897705, 32.23457718]},
            "timestamp": "2026-10-21",
        },
        "Old": {
            "full_name": "Stale Lake",
            "conservation_storage": 1,
            "conservation_capacity": 2,
            "gauge_location": {"coordinates": [-99, 32]},
            "timestamp": "2026-06-01",
        },
        "NoGauge": {
            "full_name": "No Gauge",
            "conservation_storage": 1,
            "conservation_capacity": 2,
            "timestamp": "2026-10-21",
        },
    }
    (f,) = sb.twdb_reservoirs(doc, TODAY)
    assert f["geometry"]["coordinates"] == [-99.88898, 32.23458]
    assert f["properties"] == {
        "name": "Lake Abilene",
        "pct_full": 6.9,
        "storage_af": 546,
        "capacity_af": 7900,
        "as_of": "2026-10-21",
        "state": "TX",
        "label": "7%",
    }


AWDB_STATIONS = [
    {
        "stationTriplet": "A:NM:BOR",
        "name": "Abiquiu Reservoir",
        "stateCode": "NM",
        "latitude": 36.237,
        "longitude": -106.429,
        "reservoirMetadata": {"capacity": 1198500.0, "usableCapacity": 1198500.0},
    },
    {
        "stationTriplet": "B:AZ:BOR",
        "name": "Lake Mead",
        "stateCode": "AZ",
        "latitude": 36.0,
        "longitude": -114.7,
        "reservoirMetadata": {"capacity": 26159000.0},
    },
    {
        "stationTriplet": "C:MT:BOR",
        "name": "No Capacity",
        "stateCode": "MT",
        "latitude": 47,
        "longitude": -110,
        "reservoirMetadata": {},
    },
    {
        "stationTriplet": "D:CO:BOR",
        "name": "Stale",
        "stateCode": "CO",
        "latitude": 39,
        "longitude": -105,
        "reservoirMetadata": {"capacity": 100},
    },
]


def test_awdb_daily_first_then_month_end_with_average():
    daily = sb.awdb_latest(
        [
            {
                "stationTriplet": "A:NM:BOR",
                "data": [
                    {
                        "values": [
                            {"date": "2026-10-19", "value": 112306},
                            {"date": "2026-10-20", "value": 112213},
                            {"date": "2026-10-21", "value": None},
                        ]
                    }
                ],
            },
            {
                "stationTriplet": "D:CO:BOR",
                "data": [{"values": [{"date": "2026-09-01", "value": 50}]}],
            },
        ]
    )
    monthly = sb.awdb_latest(
        [
            {
                "stationTriplet": "B:AZ:BOR",
                "data": [
                    {"values": [{"month": 9, "year": 2026, "value": 6830422, "average": 15500000}]}
                ],
            }
        ]
    )
    feats = sb.awdb_reservoirs(AWDB_STATIONS, daily, monthly, TODAY)
    by = {f["properties"]["name"]: f["properties"] for f in feats}
    assert set(by) == {"Abiquiu Reservoir", "Lake Mead"}  # no capacity / stale: left out
    assert (
        by["Abiquiu Reservoir"]["as_of"] == "2026-10-20"
        and by["Abiquiu Reservoir"]["pct_full"] == 9.4
    )
    assert "pct_avg" not in by["Abiquiu Reservoir"]
    assert by["Lake Mead"] == {
        "name": "Lake Mead",
        "pct_full": 26.1,
        "pct_avg": 44,
        "storage_af": 6830422,
        "capacity_af": 26159000,
        "as_of": "end of Sep 2026",
        "state": "AZ",
        "label": "26%",
    }


def test_impossible_reservoir_readings_are_dropped():
    assert sb._reservoir(-100, 35, "x", 500, 100, "d") is None  # 500% full: bad capacity
    assert sb._reservoir(-100, 35, "x", 5, 0, "d") is None
    assert sb._reservoir(0, 0, "x", 5, 10, "d") is None


# --- Child care: centers only ------------------------------------------------------


def test_ny_child_care_keeps_centers_and_drops_homes_and_people():
    rows = [
        {
            "program_type": "DCC",
            "facility_status": "License",
            "facility_name": "Sunshine Day Care Center",
            "street_number": "22",
            "street_name": "Grove St",
            "city": "Voorheesville",
            "phone_number": "(518)765-2399",
            "total_capacity": "79",
            "provider_name": "Jane Q. Director",
            "latitude": "42.65",
            "longitude": "-73.93",
        },
        {
            "program_type": "GFDC",
            "facility_status": "License",
            "facility_name": "Doe, Jane",
            "street_number": "1",
            "street_name": "Home Ave",
            "city": "Bronx",
            "latitude": "40.8",
            "longitude": "-73.9",
        },
        {
            "program_type": "FDC",
            "facility_status": "Registration",
            "facility_name": "Roe, Rita",
            "latitude": "40.8",
            "longitude": "-73.9",
        },
        {
            "program_type": "SACC",
            "facility_status": "Pending Revocation",
            "facility_name": "After School",
            "latitude": "40.8",
            "longitude": "-73.9",
        },
        {
            "program_type": "SACC",
            "facility_status": "Registration",
            "facility_name": "PS 12 After School",
            "city": "Queens",
            "latitude": "40.7",
            "longitude": "-73.8",
        },
    ]
    feats = sb.ny_child_care(rows)
    assert [f["properties"]["name"] for f in feats] == [
        "Sunshine Day Care Center",
        "PS 12 After School",
    ]
    assert feats[0]["properties"] == {
        "name": "Sunshine Day Care Center",
        "address": "22 Grove St",
        "city": "Voorheesville",
        "phone": "(518) 765-2399",
        "kind": "Day care center",
        "capacity": 79,
    }
    assert "Jane" not in json.dumps(feats)


def test_pa_child_care_centers_only_at_the_facility_not_the_owner():
    rows = [
        {
            "provider_type": "Child Care Center",
            "facility_name": "SMALL WORLD DISCOVERY CENTER",
            "facility_address": "5933 MCCALLUM ST",
            "facility_city": "PHILADELPHIA",
            "facility_phone": "(215) 843-6949",
            "capacity": "126",
            "star_level": "STAR 2",
            "geocoded_column": {"type": "Point", "coordinates": [-75.19, 40.04]},
            "geocoded_column_1": {"type": "Point", "coordinates": [-75.0, 40.0]},
        },
        {
            "provider_type": "Family Child Care Home",
            "facility_name": "JANE DOE",
            "geocoded_column": {"type": "Point", "coordinates": [-75.1, 40.1]},
        },
        {
            "provider_type": "Group Child Care Home",
            "facility_name": "JOHN ROE",
            "geocoded_column": {"type": "Point", "coordinates": [-75.1, 40.1]},
        },
        {
            "provider_type": "Child Care Center",
            "facility_name": "No STAR",
            "star_level": "No STAR Level",
            "capacity": "N/A",
            "geocoded_column": {"type": "Point", "coordinates": [-76.0, 40.2]},
        },
    ]
    a, b = sb.pa_child_care(rows)
    assert a["geometry"]["coordinates"] == [-75.19, 40.04]
    assert a["properties"] == {
        "name": "Small World Discovery Center",
        "address": "5933 McCallum St",
        "city": "Philadelphia",
        "phone": "(215) 843-6949",
        "kind": "Child care center",
        "capacity": 126,
        "quality": "STAR 2",
    }
    assert "quality" not in b["properties"] and "capacity" not in b["properties"]


def test_tx_child_care_licensed_centers_only_then_geocoded():
    rows = [
        {
            "operation_number": "1676219",
            "operation_type": "Licensed Center",
            "operation_status": "Y",
            "operation_name": "Children's Education Station LLC",
            "address_line": "1713 DIAMOND AVE",
            "city": "PENITAS",
            "zipcode": "78576 8327",
            "phone_number": "9565194140",
            "administrator_director_name": "Victoria Example",
            "total_capacity": "190",
            "hours_of_operation": "06:30 AM-06:30 PM",
            "accepts_child_care_subsidies": "Y",
            "temporarily_closed": "NO",
        },
        {
            "operation_number": "2",
            "operation_type": "Registered Child-Care Home",
            "operation_status": "Y",
            "operation_name": "Jane Doe",
            "address_line": "1 HOME ST",
            "city": "AUSTIN",
        },
        {
            "operation_number": "3",
            "operation_type": "Listed Family Home",
            "operation_status": "Y",
            "operation_name": "John Roe",
            "address_line": "2 HOME ST",
            "city": "AUSTIN",
        },
        {
            "operation_number": "4",
            "operation_type": "Licensed Center",
            "operation_status": "Y",
            "temporarily_closed": "YES",
            "operation_name": "Closed",
            "address_line": "3 A ST",
            "city": "AUSTIN",
        },
        {
            "operation_number": "5",
            "operation_type": "Licensed Center",
            "operation_status": "N",
            "operation_name": "Gone",
            "address_line": "4 A ST",
            "city": "AUSTIN",
        },
    ]
    (rec,) = sb.tx_child_care(rows)
    assert rec["a"] == "1713 Diamond Ave" and rec["c"] == "Penitas" and rec["zip"] == "78576"
    f = sb.tx_feature(rec, -98.4321, 26.2301)
    assert f["properties"] == {
        "id": "1676219",
        "name": "Children's Education Station LLC",
        "address": "1713 Diamond Ave",
        "city": "Penitas",
        "phone": "(956) 519-4140",
        "kind": "Licensed child care center",
        "capacity": 190,
        "hours": "06:30 AM-06:30 PM",
        "subsidy": "yes",
    }
    assert "Victoria" not in json.dumps(f)


# --- pack-wide rules -----------------------------------------------------------------

VIEW_HOSTS = re.search(
    r"const VIEW_HOSTS =\s*/(.+)/;", (ROOT / "frontend/src/view-sources.ts").read_text()
)[1]
CHILD_CARE_PROPS = {
    "id",
    "name",
    "address",
    "city",
    "phone",
    "kind",
    "capacity",
    "quality",
    "hours",
    "subsidy",
}
PERSONAL = re.compile(r"director|provider_name|administrator|owner|email|legal_entity", re.I)


def test_pack_layers_are_registered_self_describing_and_credited():
    assert set(pack.LAYERS) == {
        "tx-burn-bans",
        "ar-burn-bans",
        "reservoirs-usa",
        "ny-child-care-centers",
        "pa-child-care-centers",
        "tx-child-care-centers",
    }
    for name, layer in pack.LAYERS.items():
        assert LAYERS[name] is layer, name
        assert layer.title_es and layer.title_es != layer.title, name
        assert layer.group in {"live", "weather", "help"}, name
        assert SOURCES.get(name), f"{name}: no attribution in bake.py SOURCES"
        assert layer.coverage == "usa" or name.startswith(f"{layer.coverage.lower()}-"), name
        if layer.view:  # browser-loaded: its host must be one the frontend allows
            host = layer.view.url.split("/")[2]
            assert re.match(VIEW_HOSTS, layer.view.url) or host in STATE_HOSTS, name
            assert not layer.loader
        else:
            assert layer.loader and layer.ttl, name


def test_every_baked_layer_has_exactly_one_ci_cadence_and_cache_paths():
    import sys

    sys.path.insert(0, str(ROOT / "backend" / "scripts"))
    from refresh_live import DAILY, HOURLY, WEEKLY

    baked = {n for n, layer in pack.LAYERS.items() if layer.loader}
    cadences = [set(pack.HOURLY), set(pack.DAILY), set(pack.WEEKLY)]
    assert set().union(*cadences) == baked and sum(map(len, cadences)) == len(baked)
    assert set(pack.HOURLY) <= set(HOURLY) and set(pack.DAILY) <= set(DAILY)
    assert set(pack.WEEKLY) <= set(WEEKLY)
    yml = (ROOT / ".github/workflows/pages.yml").read_text()
    for name in baked:
        assert yml.count(f"frontend/public/data/layers/{name}.geojson") == 2, name


def test_committed_baked_files_are_small_private_and_well_formed():
    for name, layer in pack.LAYERS.items():
        path = ROOT / "frontend/public/data/layers" / f"{name}.geojson"
        if not layer.loader:
            assert not path.exists(), name
            continue
        assert path.stat().st_size < 3_000_000, name
        fc = json.loads(path.read_text())
        assert fc["type"] == "FeatureCollection", name
        keys = {k for f in fc["features"] for k in f["properties"]}
        assert not any(PERSONAL.search(k) for k in keys), name
        if "child-care" in name:
            assert len(fc["features"]) > 2000, name
            assert keys <= CHILD_CARE_PROPS, f"{name}: {keys - CHILD_CARE_PROPS}"
            kinds = {f["properties"].get("kind", "") for f in fc["features"]}
            assert not any(re.search(r"home|family", k, re.I) for k in kinds), name


def test_arkansas_intermediate_certificate_is_bundled():
    pem = pack.AR_INTERMEDIATE.read_text()
    assert pem.startswith("-----BEGIN CERTIFICATE-----") and pem.count("BEGIN CERTIFICATE") == 1
    assert pack._ar_tls().verify_mode.name == "CERT_REQUIRED"
