"""Community & immigrant services pack: parsers (small hand-written fixtures)
and pack-wide rules (Spanish titles, groups, official https hosts, privacy)."""

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
from app.layers.national import _services_parse as sp
from app.layers.national import services as sv
from scripts.bake import SOURCES

ROOT = Path(__file__).resolve().parents[2]

# --- DOJ EOIR roster (text layer of the PDF, pypdf layout mode) --------------

EOIR_TEXT = """\
                         Recognized Organizations and Accredited Representatives Roster
                                                          Report Last Updated on: 10/18/26
                                                                            CALIFORNIA

Recognized                                                                  Date        Recognition      Organization
Organization                                                                Recognized  Expiration Date  Status

                                                                          Modesto

Catholic Charities of the Diocese of Stockton                               03/17/25    03/13/31         Active

Tenaya Drive - Modesto Extention Office
1506 H Street
Modesto, CA 95354
World Relief                                                                09/25/24    09/25/30*        Active
                                                                                        (Pending Renewal)
World Relief Modesto Extension Office
909 14th Street, Suite 2
Modesto, CA 95354-1234
(209) 491-2712
World Relief

Turlock Extension Office
100 Main Street
Turlock, CA 95380
(209) 555-0100
Closed Shop Immigration                                                     01/01/20    01/01/22         Inactive

Principal Office
1 Gone Street
Modesto, CA 95350
(209) 555-0199
=== page 1
                                                                          Trenton

Lutheran Social Ministries of New                                           05/16/90    06/17/31         Active
Jersey
Principal Office
714-716 S. Clinton Avenue
Trenton, NJ 8611
(609) 688-0881

Recognized                                                              Accredited Representative          Accreditation Expiration     Representative
Organization                                                                                               Date                         Status
Catholic Charities of the Diocese of Stockton                           Romero, Modesto (DHS only)         09/14/27                     Active
Principal Office
5 Private Lane
Modesto, CA 95354
"""


def test_eoir_offices_keeps_active_org_offices_only():
    offices = sp.eoir_offices(EOIR_TEXT)
    assert [o["o"] for o in offices] == [
        "Tenaya Drive - Modesto Extention Office",
        "World Relief Modesto Extension Office",
        "Turlock Extension Office",
        "Principal Office",
    ]
    cc, wr, turlock, nj = offices
    assert cc == {
        "n": "Catholic Charities of the Diocese of Stockton",
        "o": "Tenaya Drive - Modesto Extention Office",
        "a": "1506 H Street",
        "c": "Modesto",
        "s": "CA",
        "zip": "95354",
    }  # no phone line in the roster: none invented
    assert wr["a"] == "909 14th Street, Suite 2" and wr["p"] == "(209) 491-2712"
    assert wr["zip"] == "95354"
    assert turlock["n"] == "World Relief" and turlock["p"] == "(209) 555-0100"  # repeated org
    assert nj["n"] == "Lutheran Social Ministries of New Jersey"  # wrapped name
    assert nj["zip"] == "08611"  # leading zero restored
    assert sp.eoir_reported_date(EOIR_TEXT) == "10/18/26"


def test_eoir_never_reads_the_accredited_representative_section():
    blob = json.dumps(sp.eoir_offices(EOIR_TEXT))
    assert "Romero" not in blob and "DHS only" not in blob and "Private Lane" not in blob
    assert "Gone Street" not in blob  # inactive organization


# --- XLSX reader (stdlib) ----------------------------------------------------


def make_xlsx(rows: list[list[str]], sheet: str = "Facilities FY26", dtd: bool = False) -> bytes:
    shared: list[str] = []

    def cell(ref: str, v: str) -> str:
        if v.replace(".", "", 1).isdigit():
            return f'<c r="{ref}"><v>{v}</v></c>'
        shared.append(v)
        return f'<c r="{ref}" t="s"><v>{len(shared) - 1}</v></c>'

    body = "".join(
        f'<row r="{i + 1}">'
        + "".join(cell(f"{chr(65 + j)}{i + 1}", v) for j, v in enumerate(r) if v != "")
        + "</row>"
        for i, r in enumerate(rows)
    )
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    rel = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    doctype = '<!DOCTYPE x [<!ENTITY a "aaaa">]>' if dtd else ""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "xl/workbook.xml",
            f'<workbook {ns} {rel}><sheets><sheet name="Header" sheetId="1" r:id="rId1"/>'
            f'<sheet name="{sheet}" sheetId="2" r:id="rId2"/></sheets></workbook>',
        )
        z.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
        )
        z.writestr("xl/worksheets/sheet1.xml", f"<worksheet {ns}><sheetData/></worksheet>")
        z.writestr(
            "xl/worksheets/sheet2.xml",
            f"{doctype}<worksheet {ns}><sheetData>{body}</sheetData></worksheet>",
        )
        sst = "".join(f"<si><t>{v}</t></si>" for v in shared)
        z.writestr("xl/sharedStrings.xml", f"<sst {ns}>{sst}</sst>")
    return buf.getvalue()


ICE_ROWS = [
    ["ICE Facilities Data, FY26"],
    ["Facility Information"],
    [
        "Name",
        "Address",
        "City",
        "State",
        "Zip",
        "AOR",
        "Type Detailed",
        "Male/Female",
        "FY26 ALOS",
        "Level A",
        "Level B",
        "Level C",
        "Level D",
    ],
    [
        "ADELANTO ICE PROCESSING CENTER",
        "10250 RANCHO ROAD",
        "ADELANTO",
        "CA",
        "92301",
        "LOS",
        "CDF",
        "Male",
        "51.9",
        "613.4",
        "178.5",
        "399.4",
        "494.8",
    ],
    [
        "PORT ISABEL SPC",
        "27991 BUENA VISTA BLVD",
        "LOS FRESNOS",
        "TX",
        "78566",
        "HOU",
        "SPC",
        "Male",
        "9",
        "1",
        "",
        "",
        "",
    ],
    ["Footnote: totals", "", "", "", "", "", "", "", "", "", "", "", ""],
]


def test_read_xlsx_picks_the_sheet_by_pattern_and_ice_rows_parse():
    rows = sp.read_xlsx(make_xlsx(ICE_ROWS), re.compile(r"^Facilities FY\d\d"))
    facs = sp.ice_facilities(rows)
    assert facs == [
        {
            "n": "Adelanto ICE Processing Center",
            "a": "10250 Rancho Road",
            "c": "Adelanto",
            "s": "CA",
            "zip": "92301",
            "t": "CDF",
            "fo": "Los Angeles",
            "pop": 1686,
        },
        {
            "n": "Port Isabel SPC",
            "a": "27991 Buena Vista Blvd",
            "c": "Los Fresnos",
            "s": "TX",
            "zip": "78566",
            "t": "SPC",
            "fo": "Houston",
            "pop": 1,
        },
    ]


def test_read_xlsx_refuses_a_dtd():
    with pytest.raises(ValueError, match="DTD"):
        sp.read_xlsx(make_xlsx(ICE_ROWS, dtd=True), "Facilities FY26")


def test_job_centers_drop_staff_and_closed_centers():
    rows = [
        [
            "ID",
            "Name of Center",
            "Program Type",
            "Address1",
            "Address2",
            "City",
            "State",
            "Zip Code",
            "Phone",
            "Email Address",
            "Vet Rep1 Name",
            "Vet Rep1 Email",
            "Latitiude",
            "Longitude",
            "Center Closure Y/N",
        ],
        [
            "1",
            "Modesto Job Center",
            "Comprehensive American Job Center",
            "251 E Hackett Rd",
            "",
            "Modesto",
            "CA",
            "95358",
            "209-558-2100",
            "info@example.org",
            "Jane Doe",
            "jane@example.org",
            "37.6",
            "-121.0",
            "N",
        ],
        [
            "2",
            "Old Center",
            "Affiliate American Job Center",
            "1 Main St",
            "",
            "Turlock",
            "CA",
            "95380",
            "209-555-0100",
            "",
            "",
            "",
            "37.5",
            "-120.8",
            "Y",
        ],
    ]
    out = sp.job_centers(sp.read_xlsx(make_xlsx(rows, sheet="AJC Data"), "AJC Data"))
    assert out == [
        {
            "n": "Modesto Job Center",
            "t": "comp",
            "a": "251 E Hackett Rd",
            "c": "Modesto",
            "s": "CA",
            "zip": "95358",
            "p": "(209) 558-2100",
        }
    ]
    assert "Jane" not in json.dumps(out) and "@" not in json.dumps(out)


# --- Census batch geocoder ---------------------------------------------------


def test_census_batch_round_trip_and_street_cleanup():
    assert sp.street_only("909 14th Street, Suite 2") == "909 14th Street"
    assert sp.street_only("P.O. Box 12, 5 Oak Ave Ste 4") == "5 Oak Ave"
    assert (
        sp.census_batch_csv([("0", 'A "B" St', "Modesto", "CA", "95354")])
        == b"0,A B St,Modesto,CA,95354\n"
    )
    reply = (
        '"0","909 14th St, Modesto, CA, 95354","Match","Exact","909 14TH ST, MODESTO, CA, 95354","-120.99,37.64","1","L"\n'
        '"1","1 Nowhere, X, CA, 00000","No_Match"\n'
        '"2","5 Oak, Y, CA, 95350","Tie"\n'
    )
    assert sp.census_batch_result(reply) == {"0": (-120.99, 37.64)}


async def test_geocode_falls_back_to_the_zip_area_flagged_approximate():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "geocoding.geo.census.gov":
            return httpx.Response(
                200,
                text='"0","x","Match","Exact","x","-121.000001,37.600004","1","L"\n"1","y","No_Match"\n',
            )
        assert "95380" in request.url.params["where"]
        return httpx.Response(
            200,
            json={
                "features": [
                    {"attributes": {"ZCTA5": "95380", "INTPTLAT": "+37.49", "INTPTLON": "-120.85"}}
                ]
            },
        )

    recs = [
        {"n": "A", "a": "1 Main St", "c": "Modesto", "s": "CA", "zip": "95354"},
        {"n": "B", "a": "2 Rural Rte", "c": "Turlock", "s": "CA", "zip": "95380"},
        {"n": "C", "a": "3 Lost Rd", "c": "Nowhere", "s": "CA", "zip": "99999"},
    ]
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        a, b, c = await sv.geocode(client, recs, zip_fallback=True)
    assert a["geometry"]["coordinates"] == [-121.0, 37.6] and "x" not in a["properties"]
    assert "zip" not in a["properties"]
    assert b["geometry"]["coordinates"] == [-120.85, 37.49] and b["properties"]["x"] == 1
    assert c is None  # never placed by guesswork


# --- ICE / Head Start / SAMHSA -------------------------------------------------


def test_newest_ice_spreadsheet_and_overrides_are_sourced():
    html = (
        '<a href="https://www.ice.gov/doclib/detention/FY26_detentionStats07202026.xlsx">'
        '<a href="https://www.ice.gov/doclib/detention/FY25_detentionStats.xlsx">'
        '<a href="https://www.ice.gov/doclib/detention/FY22-detentionStats.xlsx">'
    )
    assert sv.newest_ice_xlsx(html).endswith("FY26_detentionStats07202026.xlsx")
    rows = json.loads(sv.ICE_COORDS.read_text())["facilities"]
    assert rows, "hand-kept ICE coordinates file is empty"
    for r in rows:
        assert r["source"].startswith("https://") and r["method"] and r["address"], r["name"]
        assert -180 <= r["lon"] <= 180 and -15 <= r["lat"] <= 72
    assert set(sv.ice_overrides()) == {r["name"].upper() for r in rows}


HEAD_START_DOCS = {
    "results": 3,
    "documents": [
        {
            "status": "Open",
            "type": 1,
            "name": "Kings Canyon Head Start",
            "addressLineOne": "4995 E Balch Ave",
            "city": "Fresno",
            "state": "CA",
            "phone": "(559) 263-1200",
            "latitude": 36.7390429,
            "longitude": -119.7281708,
            "program": {"name": "Fresno EOC", "registrationPhone": "(559)263-1200"},
        },
        {
            "status": "Open",
            "type": 4,
            "name": "Migrant EHS",
            "addressLineOne": "1 Farm Rd",
            "city": "Patterson",
            "state": "CA",
            "phone": "",
            "latitude": 37.47,
            "longitude": -121.13,
            "program": {"name": "MAAC", "registrationPhone": "209-555-0100"},
        },
        {"status": "Closed", "type": 1, "name": "Closed Center", "latitude": 37, "longitude": -121},
    ],
}


def test_head_start_splits_preschool_and_early_and_skips_closed():
    hs = sp.head_start(HEAD_START_DOCS, early=False)
    ehs = sp.head_start(HEAD_START_DOCS, early=True)
    assert [f["properties"]["n"] for f in hs] == ["Kings Canyon Head Start"]
    assert hs[0]["geometry"]["coordinates"] == [-119.72817, 36.73904]
    assert "rp" not in hs[0]["properties"]  # same as the center line
    assert ehs[0]["properties"] == {
        "n": "Migrant EHS",
        "a": "1 Farm Rd",
        "c": "Patterson",
        "s": "CA",
        "rp": "(209) 555-0100",
        "t": "m",
        "g": "MAAC",
    }


def _row(name, kind, sl="", pyas="", tc="", lat="37.6", lon="-121.0", street="704 I Street"):
    svc = [
        {"f1": "Type of Care", "f2": "TC", "f3": tc},
        {"f1": "Language Services", "f2": "SL", "f3": sl},
        {"f1": "Payment Assistance Available", "f2": "PYAS", "f3": pyas},
    ]
    return {
        "name1": name,
        "name2": "",
        "street1": street,
        "street2": "",
        "city": "Modesto",
        "state": "CA",
        "phone": "209-529-1855",
        "latitude": lat,
        "longitude": lon,
        "typeFacility": kind,
        "services": svc,
    }


def test_treatment_flags_split_and_dedupe():
    rows = [
        _row(
            "Clinic A",
            "MH",
            sl="Spanish; Sign language services for the deaf and hard of hearing",
            pyas="Sliding fee scale (fee is based on income and other factors)",
            tc="Mental health treatment; Substance use treatment",
        ),
        _row("Clinic A", "MH"),  # repeated in the export
        _row(
            "Clinic B",
            "MH",
            sl="Other languages (excluding Spanish)",
            pyas="Payment assistance (check with facility for details)",
        ),
        _row("Hidden", "SA", lat=None, lon=None),  # no published location
        _row("Rehab C", "SA", tc="Substance use treatment"),
        _row("Methadone D", "OTP", street="9 Elm St"),
    ]
    mh = sp.treatment(rows, mental_health=True)
    su = sp.treatment(rows, mental_health=False)
    assert [f["properties"]["n"] for f in mh] == ["Clinic A", "Clinic B"]
    a, b = (f["properties"] for f in mh)
    assert a["es"] == 1 and a["sf"] == 1 and a["t"] == "both" and a["p"] == "(209) 529-1855"
    assert "es" not in b and "sf" not in b  # "excluding Spanish" is not Spanish
    assert [f["properties"]["n"] for f in su] == ["Rehab C", "Methadone D"]


def test_point_scrubs_email_addresses_from_text():
    f = sp.point(
        -72.5,
        44.2,
        {"n": "Judy.Doe@vermont.gov", "a": "5 Perry St (info@x.org)", "c": "ARIZONA@WORK"},
    )
    assert f["properties"] == {"a": "5 Perry St ()", "c": "ARIZONA@WORK"}


def test_tidy_points_rounds_and_trims():
    fc = {
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-121.339011000185, 37.9837019989422]},
                "properties": {"n": "PHA ", "a": "2575 Grand Canal Blvd      ", "p": None},
            }
        ]
    }
    out = sv.tidy_points(fc)["features"][0]
    assert out["geometry"]["coordinates"] == [-121.33901, 37.9837]
    assert out["properties"] == {"n": "PHA", "a": "2575 Grand Canal Blvd"}


# --- pack-wide rules -------------------------------------------------------------

VIEW_HOSTS = re.search(
    r"const VIEW_HOSTS =\s*/(.+)/;", (ROOT / "frontend/src/view-sources.ts").read_text()
)[1]
PERSONAL = re.compile(
    r"email|e_mail|contact|exec_dir|first_name|last_name|rep\d?_?name|judge|person", re.I
)
COMPACT = {
    "n",
    "o",
    "g",
    "a",
    "c",
    "s",
    "p",
    "rp",
    "t",
    "k",
    "l",
    "sv",
    "es",
    "sf",
    "fo",
    "pop",
    "u",
    "code",
    "d",
    "d0",
    "d1",
    "bt",
    "lt",
    "x",
    "pg",
    "z",
    "pr",
    "un",
    "ut",
}


def test_pack_layers_are_self_describing_national_and_private():
    for name, layer in sv.LAYERS.items():
        assert LAYERS[name] is layer, name  # registered
        assert layer.title_es and layer.title_es != layer.title, name
        assert layer.group in {"help", "places", "civic", "housing"}, name
        assert layer.coverage == "usa" and layer.category == "service", name
        assert SOURCES.get(name), f"{name}: no attribution in bake.py SOURCES"
        if layer.view:
            assert re.match(VIEW_HOSTS, layer.view.url), f"{name}: host not in VIEW_HOSTS"
            for src, prop in layer.view.fields.items():
                assert not PERSONAL.search(src), f"{name}: personal field {src}"
                assert prop in COMPACT, f"{name}: unexpected property {prop}"
    for name in ("immigration-legal-help", "detention-centers"):
        assert sv.LAYERS[name].group == "help"


def test_committed_baked_files_hold_only_allowlisted_properties():
    for name, layer in sv.LAYERS.items():
        path = ROOT / "frontend/public/data/layers" / f"{name}.geojson"
        if not layer.loader:
            assert not path.exists(), name
            continue
        fc = json.loads(path.read_text())
        keys = {k for f in fc["features"] for k in f["properties"]}
        assert keys <= COMPACT, f"{name}: {keys - COMPACT}"
        assert not sp.EMAIL.search(path.read_text()), f"{name}: an email address"
        if not layer.view:  # whole-US files load in full: keep them small
            assert path.stat().st_size < 3_100_000, name
            assert len(fc["features"]) > 50, name


def test_weekly_refresh_covers_every_baked_pack_layer():
    baked = {n for n, layer in sv.LAYERS.items() if layer.loader}
    assert set(sv.WEEKLY) == baked - set(sv.HAND_KEPT)
    workflow = (ROOT / ".github/workflows/pages.yml").read_text()
    for name in sv.WEEKLY:
        assert workflow.count(f"frontend/public/data/layers/{name}.geojson") == 2, name


def test_eoir_phone_never_lands_on_the_wrong_office_and_header_is_required():
    text = (
        "Org One                                                                     01/01/25    01/01/31         Active\n"
        "Principal Office\n1 A St\nModesto, CA 95354\n"
        "Mailing address only\nPO Box 9\nModesto, CA 95354\n(209) 555-9999\n"
        "Recognized                                                              Accredited Representative\n"
    )
    (o,) = sp.eoir_offices(text)
    assert "p" not in o  # the mailing entry's phone is not attached to the office
    with pytest.raises(ValueError, match="header not found"):
        sp.eoir_offices(text.rsplit("Recognized", 1)[0])


def test_head_start_leaves_out_family_child_care_homes():
    names = (
        "FCCH - Doe Jane",
        "Little Angels Family Day Care",
        "Star Light Family Day Care Center",
        "Sunrise EHS",
    )
    docs = {
        "documents": [
            {"status": "Open", "type": 2, "name": n, "latitude": 37.6, "longitude": -121.0}
            for n in names
        ]
    }
    kept = [f["properties"]["n"] for f in sp.head_start(docs, early=True)]
    assert kept == ["Star Light Family Day Care Center", "Sunrise EHS"]


def test_read_xlsx_rejects_absurd_column_references():
    data = make_xlsx([["Name"], ["x"]])
    bad = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(bad, "w") as dst:
        for item in src.infolist():
            body = src.read(item)
            if item.filename.endswith("sheet2.xml"):
                body = body.replace(b'r="A1"', b'r="ZZZZZZ1"')
            dst.writestr(item, body)
    with pytest.raises(ValueError, match="out of range"):
        sp.read_xlsx(bad.getvalue(), "Facilities FY26")


def test_immigration_offices_need_an_official_source_per_row():
    doc = {
        "offices": [
            {
                "kind": "court",
                "name": "Sacramento Immigration Court",
                "address": "650 Capitol Mall",
                "city": "Sacramento",
                "state": "CA",
                "phone": "916-447-9301",
                "source": "https://www.justice.gov/eoir/sacramento-immigration-court",
                "lat": 38.57,
                "lon": -121.5,
            },
            {
                "kind": "ice",
                "name": "Unsourced",
                "source": "https://example.com/x",
                "lat": 1,
                "lon": 1,
            },
            {"kind": "court", "name": "No coordinates", "source": "https://www.justice.gov/eoir/x"},
        ]
    }
    (f,) = sv.immigration_offices(doc)["features"]
    assert f["properties"] == {
        "n": "Sacramento Immigration Court",
        "t": "court",
        "a": "650 Capitol Mall",
        "c": "Sacramento",
        "s": "CA",
        "p": "(916) 447-9301",
        "pg": "https://www.justice.gov/eoir/sacramento-immigration-court",
    }
    committed = json.loads(sv.IMMIGRATION_OFFICES.read_text())["offices"]
    assert committed and all(
        r["source"].startswith(("https://www.justice.gov/eoir/", "https://www.ice.gov/"))
        for r in committed
    )
    assert len(sv.immigration_offices({"offices": committed})["features"]) == len(committed)


def _treat_row(name1, street1, name2=""):
    return {**_row(name1, "SA", street=street1), "name2": name2}


def test_treatment_drops_solo_practitioners_listed_under_their_own_name():
    rows = [
        _treat_row(name1="Victor H Lopez LSW MSW LCADC CCS", street1="1 Elm St"),
        _treat_row(name1="Maria Lopez-Garcia, LPC", street1="2 Elm St"),
        # an organization under the person's listing keeps it (name2 = the org)
        _treat_row(name1="Jane Doe, LCSW", name2="Hope Counseling Center", street1="3 Elm St"),
        # incorporated practices and plain organizations stay
        _treat_row(name1="Lisa B Creef LCSW PC", street1="4 Elm St"),
        _treat_row(name1="Hope House", street1="5 Elm St"),
    ]
    names = [f["properties"]["n"] for f in sp.treatment(rows, mental_health=False)]
    assert names == ["Jane Doe, LCSW", "Lisa B Creef LCSW PC", "Hope House"]


def test_assisted_housing_views_are_hud_egis_and_skip_contacts():
    """HUD multifamily + USDA rural rentals: HUD eGIS views, no contact people,
    and the browser cleanup that drops individuals' names and phones exists."""
    posts = (ROOT / "frontend/src/view-logic.ts").read_text()
    for name, post in (("hud-multifamily", "mgmt"), ("usda-rural-rentals", "mgmt")):
        v = sv.LAYERS[name].view
        assert v and not sv.LAYERS[name].loader, name  # view-only: nothing baked
        assert v.url.startswith(sv.HUD + "/"), name
        assert v.post == post and re.search(rf"^\s*{post}:", posts, re.M), name
        assert v.min_zoom >= 8 and v.max_features >= 1000, name
        for src in v.fields:
            assert not re.search(r"contact|email|manager_name|agent_addr|extn", src, re.I), src
        assert {"n", "a", "c", "s", "z", "t", "un", "ut", "g", "p"} <= set(v.fields.values())
    assert sv.LAYERS["hud-multifamily"].view.where == "TOTAL_ASSISTED_UNIT_COUNT > 0"
