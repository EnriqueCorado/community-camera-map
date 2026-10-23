"""Free school meals pack: the CCD / EDGE / N.C. parsers on small hand-written
fixtures, the join rules (who is shown and why), the paged EDGE reader and the
CCD file discovery against mocked upstreams, and pack-wide rules (one layer
per state, Spanish text, attribution, weekly wiring, frontend sync, size)."""

from __future__ import annotations

import io
import json
import re
import zipfile
from pathlib import Path

import httpx
import pytest

from app.layers.service import LAYERS  # first: it registers the packs

# isort: split
from app.layers.national import _school_meals_parse as smp
from app.layers.national import school_meals as sm
from scripts.bake import SOURCES

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = (ROOT / "frontend/src/school-meals.ts").read_text()

CSV = (
    "SCHOOL_YEAR,FIPST,ST,SCH_NAME,ST_LEAID,LEAID,ST_SCHID,NCESSCH,NSLP_STATUS,NSLP_STATUS_TEXT\n"
    "2024-2025,01,AL,A,AL-101,0100005,AL-101-0010,010000500870,NSLPCEO,CEO\n"
    "2024-2025,01,AL,B,AL-101,0100005,AL-101-0020,010000500871,NSLPWOPRO,No provision\n"
    "2024-2025,05,AR,C,AR-1,0500001,AR-1-1,050000100001,NSLPPRO2,Provision 2\n"
    "2024-2025,37,NC,D,NC-260,3700001,NC-260-308,370000100308,NSLPWOPRO,No provision\n"
    "2024-2025,37,NC,E,NC-32A,3700002,NC-32A-000,370000200000,NSLPWOPRO,No provision\n"
    "2024-2025,01,AL,junk id,AL-1,1,AL-1-1,12345,NSLPCEO,CEO\n"
)


def _row(nces: str, st: str, name: str = "School", **kw) -> dict:
    return {
        "NCESSCH": nces,
        "LSTATE": st + " ",  # EDGE pads the state code
        "SCH_NAME": name,
        "LEA_NAME": kw.pop("lea", "District"),
        "SY_STATUS_TEXT": kw.pop("status", "Open"),
        "VIRTUAL": kw.pop("virtual", "Not Virtual"),
        "LATCOD": kw.pop("lat", 34.5),
        "LONCOD": kw.pop("lon", -86.5),
    }


# --- CCD file ---------------------------------------------------------------------


def test_ccd_status_year_and_state_ids():
    year, status, by_sid = smp.ccd_nslp(CSV)
    assert year == 2024
    assert status["010000500870"] == "NSLPCEO" and status["050000100001"] == "NSLPPRO2"
    assert "12345" not in status  # not a 12-digit NCES id
    assert by_sid["NC-260-308"] == "370000100308"


def test_ccd_refuses_a_changed_file():
    with pytest.raises(ValueError, match="missing columns"):
        smp.ccd_nslp("SCHOOL_YEAR,NCESSCH\n2024-2025,010000500870\n")
    with pytest.raises(ValueError, match="school year"):
        smp.ccd_nslp(CSV.replace("2024-2025", "2024-2026"))
    with pytest.raises(ValueError, match="no schools"):
        smp.ccd_nslp(CSV.splitlines()[0] + "\n")


def test_zip_must_hold_exactly_one_csv():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("ccd_sch_129.csv", CSV)
        z.writestr("ccd_sch_129.sas7bdat", b"\x00binary")
    assert smp.read_zip_csv(buf.getvalue()) == CSV
    for names in ((), ("a.csv", "b.csv")):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for n in names:
                z.writestr(n, CSV)
        with pytest.raises(ValueError, match="CSV"):
            smp.read_zip_csv(buf.getvalue())


# --- the join ---------------------------------------------------------------------


def test_who_is_shown_and_why():
    status = {
        "010000000001": "NSLPCEO",
        "010000000002": "NSLPWOPRO",
        "010000000003": "NSLPPRO2",
        "010000000004": "NSLPPRO1",  # Provision 1: not free for everyone
        "060000000001": "NSLPWOPRO",
        "060000000002": "NSLPNO",
        "060000000003": "MISSING",
        "080000000001": "NSLPCEO",
        "370000000001": "NSLPCEO",  # NC: the state's list wins over CCD
        "370000000002": "NSLPWOPRO",
    }
    rows = [
        _row("010000000001", "AL", "CEP Elementary", lea="Mobile County"),
        _row("010000000002", "AL", "Paid Lunch High"),
        _row("010000000003", "AL", "Provision Two Middle"),
        _row("010000000004", "AL", "Provision One Middle"),
        _row("010000000001", "AL", "Duplicate row"),
        _row("060000000001", "CA", "Any School", lon=-120.9, lat=37.6),
        _row("060000000002", "CA", "No Lunch Program", lon=-120.9, lat=37.6),
        _row("060000000003", "CA", "Not Reported To NCES", lon=-120.9, lat=37.6),
        _row("060000000004", "CA", "Online Academy", virtual="Full Virtual"),
        _row("060000000005", "CA", "Opens Next Year", status="Future"),
        _row("060000000006", "CA", "No Point", lon=None),
        _row("060000000007", "CA", "Null Island", lon=0, lat=0),
        _row("080000000001", "CO", "Opt-in State School", lon=-105.0, lat=39.7),
        _row("370000000001", "NC", "Not On The State List", lon=-80.0, lat=35.0),
        _row("370000000002", "NC", "On The State List", lon=-80.0, lat=35.0),
        _row("990000000001", "AL", "Unknown To CCD"),
        _row("010000000009", "AL", "", lea="Nameless"),
    ]
    by = smp.free_schools(rows, status, 2024, {"NC": (2025, {"370000000002"})})
    names = {st: [f["properties"]["n"] for f in feats] for st, feats in by.items()}
    assert names == {
        "AL": ["CEP Elementary", "Provision Two Middle"],
        "CA": ["Any School", "Not Reported To NCES"],
        "CO": ["Opt-in State School"],
        "NC": ["On The State List"],
    }
    props = {f["properties"]["n"]: f["properties"] for feats in by.values() for f in feats}
    assert props["CEP Elementary"] == {
        "n": "CEP Elementary",
        "d": "Mobile County",
        "r": "c",
        "y": 2024,
    }
    assert props["Provision Two Middle"]["r"] == "p"
    assert props["Any School"]["r"] == "l" and props["Any School"]["y"] == 2026
    assert props["Opt-in State School"]["r"] == "o"
    assert props["On The State List"]["r"] == "c" and props["On The State List"]["y"] == 2025
    assert by["CA"][0]["geometry"]["coordinates"] == [-120.9, 37.6]


def test_district_left_out_when_it_is_the_school_itself():
    rows = [_row("010000000001", "AL", "Charter Academy", lea="CHARTER ACADEMY")]
    (feat,) = smp.free_schools(rows, {"010000000001": "NSLPCEO"}, 2024)["AL"]
    assert "d" not in feat["properties"]


def test_collection_is_sorted_by_district_then_school():
    feats = [
        smp.point(-86.0, 34.0, {"n": "B School", "d": "Zeta", "r": "c", "y": 2024}),
        smp.point(-86.0, 34.0, {"n": "Alpha Charter", "r": "c", "y": 2024}),
        smp.point(-86.0, 34.0, {"n": "A School", "d": "Zeta", "r": "c", "y": 2024}),
    ]
    out = smp.collection(feats)
    assert [f["properties"]["n"] for f in out["features"]] == [
        "Alpha Charter",
        "A School",
        "B School",
    ]


def test_edge_page_errors_raise():
    assert smp.edge_rows({"features": [{"attributes": {"a": 1}}, {"x": 1}]}) == [{"a": 1}]
    for bad in ({"error": {"code": 400}}, {"features": {}}, [], None):
        with pytest.raises(ValueError):
            smp.edge_rows(bad)


# --- North Carolina DPI -----------------------------------------------------------

NC_ROWS = [
    ["Community Eligibility Provision (CEP) Annual Notification of Local Education Agencies (LEA)"],
    ["", "", "", "", "", "", "", "", "SY2025-2026 as of 4/23/2026 (SNTS Data)"],
    [],
    [
        "LEA ID", "LEA Name", "School ID", "School Name", "Identified_x000D_\nStudent", "Proxy",
        "Eligible to_x000D_\nParticipate", "Near Eligible", "Currently_x000D_\nParticipating",
    ],
    ["260", "Cumberland", "308", "Elementary", "48.9", "", "X", " ", "X"],
    ["260", "Cumberland", "309", "Not participating", "30", "", "X", " ", " "],
    ["32A", "A Charter", "001", "A Charter", "50", "", "X", " ", "X"],
    ["9999", "Residential Sponsor", "001", "Group Home", "90", "", "X", " ", "X"],
    ["010", "Alamance", "Pre-K", "Center", "90", "", "X", " ", "x"],
]  # fmt: skip


def test_nc_list_joins_state_ids_with_the_charter_rule():
    by_sid = {"NC-260-308": "370000100308", "NC-32A-000": "370000200000", "NC-260-309": "3"}
    year, ids, missed = smp.nc_participating(NC_ROWS, by_sid)
    assert year == 2025
    assert ids == {"370000100308", "370000200000"}
    assert missed == 2  # never guessed


def test_nc_list_refuses_a_changed_workbook():
    with pytest.raises(ValueError, match="school year or header"):
        smp.nc_participating([r for r in NC_ROWS if "SNTS" not in "".join(r)], {})
    no_column = [[c.replace("Currently", "Was") for c in r] for r in NC_ROWS]
    with pytest.raises(ValueError, match="missing columns"):
        smp.nc_participating(no_column, {})


# --- network readers (mocked) ------------------------------------------------------


async def test_edge_reader_pages_and_checks_the_count(monkeypatch):
    monkeypatch.setattr(sm, "EDGE_PAGE", 2)
    rows = [{"NCESSCH": f"{i:012d}"} for i in range(5)]
    total = {"n": 5}

    def handler(request: httpx.Request) -> httpx.Response:
        q = request.url.params
        assert request.url.host == "services1.arcgis.com"
        if q.get("returnCountOnly"):
            return httpx.Response(200, json={"count": total["n"]})
        assert q["returnGeometry"] == "false" and "NCESSCH" in q["outFields"]
        off = int(q["resultOffset"])
        chunk = rows[off : off + 2]
        return httpx.Response(
            200,
            json={
                "features": [{"attributes": r} for r in chunk],
                "exceededTransferLimit": off + 2 < len(rows),
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="odd school count"):
            await sm.edge_schools(client)  # 5 < 90,000: a broken service
        monkeypatch.setattr(sm, "EDGE_MIN", 1)
        assert await sm.edge_schools(client) == rows  # three pages
        total["n"] = 7
        with pytest.raises(ValueError, match="5 rows read"):
            await sm.edge_schools(client)  # cut short: never published


async def test_ccd_discovery_takes_the_newest_listed_file_or_the_pinned_one():
    newest = "https://nces.ed.gov/ccd/Data/zip/ccd_sch_129_2526_w_1a_073126.zip"
    listing = [
        {
            "fileName": {
                "fileNameId": 7,
                "yearVersionModels": [{"schoolYearId": 40, "versionId": 1}],
            }
        },
        {
            "fileName": {
                "fileNameId": 11,
                "yearVersionModels": [
                    {"schoolYearId": 39, "versionId": 24},
                    {"schoolYearId": 40, "versionId": 52},
                ],
            }
        },
    ]
    asked: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(request.url.path)
        if request.url.path.endswith("/api/File"):
            return httpx.Response(200, json=listing)
        if request.url.path.endswith("/40/11/52/40"):  # preliminary: no 129 file yet
            return httpx.Response(200, text='{"x":"ccd_sch_029_2526_w_0a_050626.zip"}')
        return httpx.Response(200, text=f'{{"fileURL":"{newest}"}}')

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await sm.ccd_zip_url(client) == newest
    assert asked[1].endswith("/40/11/52/40") and asked[2].endswith("/39/11/24/39")

    def down(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    async with httpx.AsyncClient(transport=httpx.MockTransport(down)) as client:
        assert await sm.ccd_zip_url(client) == sm.CCD_129_PINNED


async def test_a_failed_download_runs_once_for_all_52_layers(monkeypatch):
    calls = {"n": 0}

    async def broken(_client):
        calls["n"] += 1
        raise ValueError("CCD file: only 3 schools")

    monkeypatch.setattr(sm, "_download", broken)
    monkeypatch.setattr(sm, "_shared", {})
    for name in ("al-free-school-meals", "tx-free-school-meals"):
        with pytest.raises(ValueError, match="only 3 schools"):
            await sm.LAYERS[name].loader(None, None)  # type: ignore[arg-type]
    assert calls["n"] == 1


async def test_a_state_never_goes_blank_or_loses_half_its_schools(tmp_path, monkeypatch):
    feat = smp.point(-86.0, 34.0, {"n": "A", "r": "c", "y": 2024})
    (tmp_path / "al-free-school-meals.geojson").write_text(json.dumps(smp.fc([feat] * 10)))
    monkeypatch.setattr(sm.service, "BAKED_LAYERS", tmp_path)

    async def fake(_client):
        return {"AL": [feat] * 4, "TX": [feat] * 3}

    monkeypatch.setattr(sm, "all_states", fake)
    with pytest.raises(ValueError, match="4 schools \\(last file had 10\\)"):
        await sm.LAYERS["al-free-school-meals"].loader(None, None)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="0 schools"):
        await sm.LAYERS["nc-free-school-meals"].loader(None, None)  # type: ignore[arg-type]
    out = await sm.LAYERS["tx-free-school-meals"].loader(None, None)  # type: ignore[arg-type]
    assert len(out["features"]) == 3  # no earlier file: any non-empty list


async def test_a_broken_nc_list_only_blanks_nc(monkeypatch):
    status = {"010000000001": "NSLPCEO", "370000000001": "NSLPCEO"}
    rows = [_row("010000000001", "AL"), _row("370000000001", "NC", lon=-80.0, lat=35.0)]

    async def url(_c):
        return "https://nces.ed.gov/x.zip"

    async def get(_c, _u, **_kw):
        return b"zip"

    async def edge(_c):
        return rows * 1

    async def nc(_c, _ids):
        raise ValueError("NC notification: missing columns")

    monkeypatch.setattr(sm, "ccd_zip_url", url)
    monkeypatch.setattr(sm, "_get", get)
    monkeypatch.setattr(smp, "read_zip_csv", lambda _b: "csv")
    monkeypatch.setattr(
        smp, "ccd_nslp", lambda _t: (2024, {**status, **{str(i): "x" for i in range(90_000)}}, {})
    )
    monkeypatch.setattr(sm, "edge_schools", edge)
    monkeypatch.setattr(sm, "nc_list", nc)
    real = smp.free_schools
    monkeypatch.setattr(smp, "free_schools", lambda *a: {**real(*a), "TX": [None] * 40_000})
    by_state = await sm._download(None)  # type: ignore[arg-type]
    assert len(by_state["AL"]) == 1 and "NC" not in by_state


# --- pack-wide rules ----------------------------------------------------------------


def test_one_self_describing_layer_per_state_with_data():
    assert set(sm.LAYER_STATES) == set(sm.STATE_NAMES) - {"ID", "PR", "AS", "VI"}
    assert len(sm.LAYERS) == len(sm.LAYER_STATES) == 52
    for st in sm.LAYER_STATES:
        name = f"{st.lower()}-free-school-meals"
        layer = sm.LAYERS[name]
        assert LAYERS[name] is layer  # registered
        assert layer.coverage == st and layer.category == "service" and layer.group == "places"
        assert layer.loader and not layer.view
        assert layer.title_es and layer.title_es != layer.title
        assert layer.description_es and layer.description_es != layer.description
        assert SOURCES.get(name) and sm.SOURCES[name] == SOURCES[name]
        law = smp.UNIVERSAL.get(st)
        if law:
            assert law["law"] in layer.description and law["page"] in SOURCES[name]
        else:
            assert "Community Eligibility Provision" in layer.description
    assert sm.LAYERS["ny-free-school-meals"].title_es.endswith("(Nueva York)")


def test_statewide_laws_cite_an_official_page_and_a_current_year():
    assert set(smp.UNIVERSAL) == {"CA", "CO", "ME", "MA", "MI", "MN", "NM", "NY", "VT"}
    for st, law in smp.UNIVERSAL.items():
        host = re.match(r"https://([^/]+)/", law["page"])[1]
        assert host.endswith((".gov", ".us", "mass.edu")), st
        assert law["cite"] and law["year"] >= 2026 and isinstance(law["opt_in"], bool), st


def test_frontend_lists_match_the_backend():
    m = re.search(r'SCHOOL_MEALS_STATES = \(\s*"([A-Z ]+)"', FRONTEND)
    assert m and m[1].split() == sm.LAYER_STATES
    pages = dict(re.findall(r"^  ([A-Z]{2}): \"(https://[^\"]+)\",$", FRONTEND, re.M))
    assert pages == {st: law["page"] for st, law in smp.UNIVERSAL.items()}
    assert f'CEP_PAGE = "{sm.CEP_PAGE}"' in FRONTEND


def test_weekly_refresh_covers_every_state(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / "backend" / "scripts"))  # its sibling import
    from scripts.refresh_live import WEEKLY

    assert set(sm.WEEKLY) == set(sm.LAYERS) and set(sm.WEEKLY) <= set(WEEKLY)


def test_committed_files_hold_only_compact_properties():
    total = 0
    for st in sm.LAYER_STATES:
        path = ROOT / "frontend/public/data/layers" / f"{st.lower()}-free-school-meals.geojson"
        fc = json.loads(path.read_text())
        feats = fc["features"]
        total += len(feats)
        assert feats, st
        assert path.stat().st_size < 3_000_000, st  # a state loads in full
        reasons = {"l", "o"} if st in smp.UNIVERSAL else {"c", "p"}
        for f in feats:
            p = f["properties"]
            assert set(p) <= {"n", "d", "r", "y"} and p["n"], (st, p)
            assert p["r"] in reasons and 2020 <= p["y"] <= 2030, (st, p)
        assert not re.search(r"[\w.+'-]+@[\w-]+\.[\w.-]+", path.read_text()), f"{st}: an email"
    assert total > 50_000
