"""Medicare Care Compare pack: parsers (small hand-written fixtures), the
paged CMS reader and geocode reuse against mocked upstreams, and pack-wide
rules (Spanish titles, group, attribution, weekly wiring, privacy, size)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import httpx
import pytest

from app.layers.service import LAYERS  # first: it registers the packs

# isort: split
from app.layers.national import _care_compare_parse as cp
from app.layers.national import care_compare as cc
from app.layers.national import help_offices as ho
from app.layers.national import services as sv
from scripts.bake import SOURCES

ROOT = Path(__file__).resolve().parents[2]

# --- small helpers -------------------------------------------------------------


def test_page_needs_results_and_a_count():
    assert cp.page({"results": [{"a": 1}, "junk"], "count": 7}) == ([{"a": 1}], 7)
    for bad in ({"results": []}, {"count": 3}, {"results": {}, "count": 1}, [], None):
        with pytest.raises(ValueError):
            cp.page(bad)


def test_stars_keep_halves_and_drop_placeholders():
    assert [cp.stars(v) for v in ("3", "3.0", "4.5", "5", "1")] == [3, 3, 4.5, 5, 1]
    for v in ("Not Available", "-", "", None, "0", "6", "3.3", "Not Applicable"):
        assert cp.stars(v) is None, v


def test_ownership_wording_from_every_dataset():
    cases = {
        "Profit": "fp",
        "For-Profit": "fp",
        "PROPRIETARY": "fp",
        "Physician": "fp",
        "Non-profit": "np",
        "NON-PROFIT": "np",
        "Voluntary non-profit - Church": "np",
        "Government - Hospital District or Authority": "gov",
        "GOVERNMENT OPERATED": "gov",
        "Combination Government & Non-Profit": "gov",
        "Veterans Health Administration": "gov",
        "Department of Defense": "gov",
        "Tribal": "tribal",
        "Other": "",
        "-": "",
        "": "",
    }
    assert {k: cp.ownership(k) for k in cases} == cases


# --- the four lists ------------------------------------------------------------

DIALYSIS_ROWS = [
    {
        "cms_certification_number_ccn": "052526",
        "facility_name": "DAVITA MODESTO DIALYSIS",
        "address_line_1": "1209 WOODROW AVENUE",
        "address_line_2": "SUITE B",
        "citytown": "MODESTO",
        "state": "CA",
        "zip_code": "95350",
        "telephone_number": "(209) 527-0920",
        "five_star": "4.0",
        "of_dialysis_stations": "24",
        "offers_incenter_hemodialysis": "Yes",
        "offers_peritoneal_dialysis": "Yes",
        "offers_home_hemodialysis_training": "No",
        "late_shift": "Yes",
        "profit_or_nonprofit": "Profit",
        "chain_organization": "DaVita",
        "mortality_rate_facility": "6.5",  # never read
    },
    {
        "cms_certification_number_ccn": "012306",
        "facility_name": "CHILDRENS HOSPITAL DIALYSIS",
        "address_line_1": "1600 7TH AVENUE SOUTH",
        "address_line_2": "",
        "citytown": "BIRMINGHAM",
        "state": "AL",
        "zip_code": "35233",
        "telephone_number": "(205) 638-9275",
        "five_star": "",
        "of_dialysis_stations": "7",
        "offers_incenter_hemodialysis": "Yes",
        "offers_peritoneal_dialysis": "No",
        "offers_home_hemodialysis_training": "No",
        "late_shift": "No",
        "profit_or_nonprofit": "Non-profit",
        "chain_organization": "Independent",
    },
    {"cms_certification_number_ccn": "BAD", "facility_name": "X", "address_line_1": "1 A St", "state": "CA"},
    {"cms_certification_number_ccn": "052999", "facility_name": "", "address_line_1": "1 A St", "state": "CA"},
]  # fmt: skip


def test_dialysis_keeps_ratings_services_and_shifts_only():
    a, b = cp.dialysis(DIALYSIS_ROWS)  # bad id and nameless rows dropped
    assert a == {
        "id": "052526",
        "n": "DAVITA MODESTO DIALYSIS",
        "a": "1209 WOODROW AVENUE, SUITE B",
        "c": "MODESTO",
        "s": "CA",
        "zip": "95350",
        "p": "2095270920",
        "st": 4,
        "ns": 24,
        "sv": 3,  # in-center + peritoneal
        "ls": 1,
        "ow": "fp",
        "g": "DaVita",
    }
    assert b["st"] is None and b["g"] == "" and b["ow"] == "np" and b["sv"] == 1


def test_home_health_joins_survey_stars_and_lists_services():
    rows = [
        {
            "cms_certification_number_ccn": "057001",
            "provider_name": "VISITING NURSE ASSOCIATION",
            "address": "4001 DALE STREET, SUITE 101",
            "citytown": "ANCHORAGE",
            "state": "AK",
            "zip_code": "99508",
            "telephone_number": "9073314075",
            "type_of_ownership": "NON-PROFIT",
            "quality_of_patient_care_star_rating": "3.5",
            "offers_nursing_care_services": "Yes",
            "offers_physical_therapy_services": "Yes",
            "offers_occupational_therapy_services": "No",
            "offers_speech_pathology_services": "Yes",
            "offers_medical_social_services": "No",
            "offers_home_health_aide_services": "Yes",
        },
        {
            "cms_certification_number_ccn": "057003",
            "provider_name": "PREMIUM HOME HEALTH CARE INC",
            "address": "2760 SW 97TH AVE APT 107",  # someone's home: left off
            "citytown": "MIAMI",
            "state": "FL",
            "zip_code": "33165",
            "telephone_number": "3055550100",
        },
        {
            "cms_certification_number_ccn": "057002",
            "provider_name": "NEW AGENCY",
            "address": "5 OAK ST",
            "citytown": "TURLOCK",
            "state": "CA",
            "zip_code": "95380",
            "telephone_number": "",
            "type_of_ownership": "-",
            "quality_of_patient_care_star_rating": "-",
            "offers_nursing_care_services": "-",
        },
    ]
    survey = cp.star_map(
        [
            {"cms_certification_number_ccn": "057001", "hhcahps_survey_summary_star_rating": "4"},
            {"cms_certification_number_ccn": "057002", "hhcahps_survey_summary_star_rating": "Not Available"},
        ],
        "cms_certification_number_ccn",
        "hhcahps_survey_summary_star_rating",
    )  # fmt: skip
    assert survey == {"057001": 4}
    a, b = cp.home_health(rows, survey)
    assert a["st"] == 3.5 and a["ss"] == 4 and a["sv"] == 1 + 2 + 8 + 32 and a["ow"] == "np"
    assert a["p"] == "9073314075"
    assert b["st"] is None and b["ss"] is None and b["sv"] == 0 and b["ow"] == ""


def test_hospice_takes_the_family_survey_stars():
    rows = [
        {
            "cms_certification_number_ccn": "001500",
            "facility_name": "AGAVE HOSPICE AND PALLIATIVE CARE",
            "address_line_1": "4050 EAST GREENWAY ROAD SUITE 1",
            "address_line_2": "-",
            "citytown": "PHOENIX",
            "state": "AZ",
            "zip_code": "85032",
            "telephone_number": "(602) 855-3500",
            "ownership_type": "For-Profit",
        }
    ]
    (rec,) = cp.hospice(rows, {"001500": 5})
    assert rec["a"] == "4050 EAST GREENWAY ROAD SUITE 1"  # '-' placeholder line dropped
    assert rec["st"] == 5 and rec["ow"] == "fp" and set(rec) == {
        "id", "n", "a", "c", "s", "zip", "p", "st", "ow",
    }  # fmt: skip


def test_hospitals_type_codes_emergency_and_birthing_friendly():
    rows = [
        {
            "facility_id": "050444",
            "facility_name": "MODESTO MEDICAL CENTER",
            "address": "1 MAIN ST",
            "citytown": "MODESTO",
            "state": "CA",
            "zip_code": "95354",
            "telephone_number": "(209) 555-0100",
            "hospital_type": "Critical Access Hospitals",
            "hospital_ownership": "Voluntary non-profit - Private",
            "emergency_services": "Yes",
            "meets_criteria_for_birthing_friendly_designation": "Y",
            "hospital_overall_rating": "Not Available",
        },
        {
            "facility_id": "05014F",
            "facility_name": "NEW KIND HOSPITAL",
            "address": "2 MAIN ST",
            "citytown": "X",
            "state": "CA",
            "zip_code": "9535",
            "telephone_number": "",
            "hospital_type": "Brand New Type",
            "emergency_services": "No",
            "hospital_overall_rating": "2",
        },
    ]
    a, b = cp.hospitals(rows)
    assert (a["t"], a["er"], a["bf"], a["st"], a["ow"]) == ("cah", 1, 1, None, "np")
    assert (b["t"], b["er"], b["bf"], b["st"], b["zip"]) == ("Brand New Type", 0, 0, 2, "09535")


# --- geocode reuse ---------------------------------------------------------------


def _feat(lon, lat, **props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


def test_reuse_keeps_unchanged_addresses_and_flags_and_geocodes_the_rest():
    old = {
        "type": "FeatureCollection",
        "features": [
            _feat(-121.0, 37.6, id="000001", n="A", a="1 MAIN ST", c="MODESTO", s="CA"),
            _feat(-120.85, 37.49, id="000002", n="B", a="2 RURAL RTE", c="TURLOCK", s="CA", x=1),
            _feat(-120.0, 37.0, id="000003", n="C", a="OLD ADDRESS", c="CERES", s="CA"),
            _feat(-120.0, 37.0, n="No id"),  # never matched
            {"geometry": None},
        ],
    }
    known = cp.known_places(old)
    assert len(known) == 2  # the ZIP-area point is tried again
    recs = [
        {"id": "000001", "n": "A (renamed)", "a": "1 MAIN ST", "c": "MODESTO", "s": "CA", "zip": "95354", "st": 4},
        {"id": "000002", "n": "B", "a": "2 RURAL RTE", "c": "TURLOCK", "s": "CA", "zip": "95380"},
        {"id": "000003", "n": "C", "a": "NEW ADDRESS", "c": "CERES", "s": "CA", "zip": "95307"},
    ]  # fmt: skip
    feats, todo = cp.reuse(recs, known)
    assert todo == [1, 2]
    a, b, c = feats
    assert a["geometry"]["coordinates"] == [-121.0, 37.6]
    assert a["properties"]["n"] == "A (renamed)" and a["properties"]["st"] == 4
    assert "zip" not in a["properties"] and "x" not in a["properties"]
    assert b is None and c is None


async def test_place_geocodes_only_new_or_moved_facilities(tmp_path, monkeypatch):
    (tmp_path / "hospital-ratings.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    _feat(-121.0, 37.6, id="000001", n="A", a="1 MAIN ST", c="MODESTO", s="CA")
                ],
            }
        )
    )
    monkeypatch.setattr(cc, "BAKED_LAYERS", tmp_path)
    sent: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "geocoding.geo.census.gov"
        sent.append(request.content.decode("utf-8", "replace"))
        return httpx.Response(200, text='"0","x","Match","Exact","x","-120.5,37.1","1","L"\n')

    recs = [
        {"id": "000001", "n": "A", "a": "1 MAIN ST", "c": "MODESTO", "s": "CA", "zip": "95354"},
        {"id": "000009", "n": "New", "a": "9 ELM ST", "c": "CERES", "s": "CA", "zip": "95307"},
    ]
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        a, b = await cc.place(client, "hospital-ratings", recs)
    assert len(sent) == 1 and "9 ELM ST" in sent[0] and "1 MAIN ST" not in sent[0]
    assert a["geometry"]["coordinates"] == [-121.0, 37.6]
    assert b["geometry"]["coordinates"] == [-120.5, 37.1] and b["properties"]["id"] == "000009"


# --- the paged CMS reader --------------------------------------------------------


async def test_cms_rows_pages_with_column_allowlist_and_filter(monkeypatch):
    monkeypatch.setattr(cc, "PAGE", 2)
    seen: list[httpx.QueryParams] = []
    data = [{"cms_certification_number_ccn": f"00000{i}", "star_rating": "4"} for i in range(5)]

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/provider-data/api/1/datastore/query/gxki-hrr8/0"
        seen.append(request.url.params)
        off = int(request.url.params["offset"])
        return httpx.Response(200, json={"results": data[off : off + 2], "count": 5})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        rows = await cc.cms_rows(
            client,
            "gxki-hrr8",
            cc.COLUMNS["gxki-hrr8"],
            where=("measure_code", "SUMMARY_STAR_RATING"),
        )
    assert rows == data
    assert [p["offset"] for p in seen] == ["0", "2", "4"]
    first = seen[0]
    assert first["properties[0]"] == "cms_certification_number_ccn"
    assert first["properties[1]"] == "star_rating" and "properties[2]" not in first
    assert first["conditions[0][value]"] == "SUMMARY_STAR_RATING"
    assert first["sorts[0][property]"] == "cms_certification_number_ccn"  # stable pages


async def test_cms_rows_refuses_a_cut_or_oversized_list(monkeypatch):
    def short(request: httpx.Request) -> httpx.Response:
        off = int(request.url.params["offset"])
        return httpx.Response(200, json={"results": [{"a": 1}] if off == 0 else [], "count": 3000})

    def huge(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"results": [{"a": 1}], "count": cc.MAX_ROWS + 1})

    for handler in (short, huge):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ValueError):
                await cc.cms_rows(client, "xubh-q36u", ("facility_id",))


def test_hhcahps_dataset_is_the_newest_provider_file():
    items = [
        {"identifier": "aaaa-1111", "title": "Home Health Care - Patient Survey (HHCAHPS) 2025Q1 to 2025Q4", "modified": "2026-06-01"},
        {"identifier": "ccn4-8vby", "title": "Home Health Care - Patient Survey (HHCAHPS) 2025Q2 to 2026Q1", "modified": "2026-09-16"},
        {"identifier": "vxub-6swi", "title": "Home Health Care - Patient Survey (HHCAHPS) National Data 2025Q2 to 2026Q1", "modified": "2026-09-17"},
        {"identifier": "m5jg-jg7i", "title": "Home Health Care - Patient Survey (HHCAHPS) State Data 2025Q2 to 2026Q1", "modified": "2026-09-17"},
        "junk",
    ]  # fmt: skip
    assert cc.hhcahps_dataset(items) == "ccn4-8vby"
    for bad in ([], None, [{"identifier": "../x", "title": items[1]["title"]}]):
        with pytest.raises(ValueError):
            cc.hhcahps_dataset(bad)


# --- pack-wide rules ---------------------------------------------------------------

# compact names (see _care_compare_parse.py); nothing else may reach a file
ALLOWED = {
    "dialysis-facilities": {"id", "n", "a", "c", "s", "p", "x", "st", "ns", "sv", "ls", "ow", "g"},
    "hospice-providers": {"id", "n", "a", "c", "s", "p", "x", "st", "ow"},
    "home-health-agencies": {"id", "n", "a", "c", "s", "p", "x", "st", "ss", "sv", "ow"},
    "hospital-ratings": {"id", "n", "a", "c", "s", "p", "x", "st", "t", "er", "bf", "ow"},
}
PERSONAL = re.compile(r"email|contact|first_name|last_name|administrator|director|person", re.I)


def test_pack_layers_are_self_describing_national_and_attributed():
    assert set(cc.LAYERS) == set(ALLOWED)
    for name, layer in cc.LAYERS.items():
        assert LAYERS[name] is layer, name  # registered
        assert layer.title_es and layer.title_es != layer.title, name
        assert layer.group == "help" and layer.category == "service", name
        assert layer.coverage == "usa" and layer.loader and not layer.view, name
        assert SOURCES.get(name) and cc.SOURCES[name] == SOURCES[name], name
    for cols in cc.COLUMNS.values():
        for col in cols:
            assert not PERSONAL.search(col), col
    # nursing homes stay with us-nursing-homes; hospitals' plain list stays HIFLD
    assert "us-nursing-homes" in LAYERS and "hospitals" in LAYERS
    assert not set(cc.LAYERS) & (set(sv.LAYERS) | set(ho.LAYERS))


def test_weekly_refresh_and_ci_cache_cover_every_pack_layer(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / "backend" / "scripts"))  # its sibling import
    from scripts.refresh_live import WEEKLY

    assert set(cc.WEEKLY) == set(cc.LAYERS) and set(cc.WEEKLY) <= set(WEEKLY)
    workflow = (ROOT / ".github/workflows/pages.yml").read_text()
    for name in cc.WEEKLY:
        assert workflow.count(f"frontend/public/data/layers/{name}.geojson") == 2, name


def test_committed_baked_files_hold_only_allowlisted_properties():
    for name in cc.LAYERS:
        path = ROOT / "frontend/public/data/layers" / f"{name}.geojson"
        fc = json.loads(path.read_text())
        keys = {k for f in fc["features"] for k in f["properties"]}
        assert keys <= ALLOWED[name], f"{name}: {keys - ALLOWED[name]}"
        assert not re.search(r"[\w.+'-]+@[\w-]+\.[\w.-]+", path.read_text()), f"{name}: an email"
        assert path.stat().st_size < 3_100_000, name  # whole-US files load in full
        assert len(fc["features"]) > 3000, name
        assert all(re.fullmatch(r"[0-9A-Z]{6}", f["properties"]["id"]) for f in fc["features"])
        homes = [
            p["a"] for f in fc["features"] if cp.HOME_ADDRESS.search((p := f["properties"])["a"])
        ]
        assert homes == [], f"{name}: apartment (home) addresses {homes[:3]}"
