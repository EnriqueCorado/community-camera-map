""" "Where to get help" offices pack: parsers (small hand-written fixtures),
loaders against mocked upstreams, and pack-wide rules (Spanish titles,
groups, allowlisted hosts and fields, weekly refresh wiring, privacy)."""

from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

import httpx
import pytest

from app.layers.service import LAYERS  # first: it registers the packs

# isort: split
from app.layers.national import _help_offices_parse as hp
from app.layers.national import help_offices as ho
from app.layers.national import services as sv
from scripts.bake import SOURCES

ROOT = Path(__file__).resolve().parents[2]
NUL = "\x00" * 22

# --- SSA field offices / resident stations ------------------------------------

DAYS = "MONDAY OPEN TIME,MONDAY CLOSE TIME,TUESDAY OPEN TIME,TUESDAY CLOSE TIME,WEDNESDAY OPEN TIME,WEDNESDAY CLOSE TIME,THURSDAY OPEN TIME,THURSDAY CLOSE TIME,FRIDAY OPEN TIME,FRIDAY CLOSE TIME"
HEADER = f"OFFICE CODE,OFFICE NAME,ADDRESS LINE 1,ADDRESS LINE 2,ADDRESS LINE 3,CITY,STATE,ZIP CODE,PHONE,FAX,{DAYS}"
WEEK = ",".join(["9:00 AM,4:00 PM"] * 5)
SSA_CSV = "\n".join(
    [
        HEADER,
        f"A00,HENDERSON NV          ,SOCIAL SECURITY       ,                      ,10416 S EASTERN AVENUE,HENDERSON                   ,NV,89052,(855) 207-7084,(833) 950-3025,{WEEK}",
        f"C93,MODESTO CA            ,SOCIAL SECURITY ADMINISTRATION,{NUL},1031 15TH ST          ,MODESTO                     ,CA,95354,(866) 964-7590,(833) 950-1111,{WEEK}",
        f"X01,TRENTON NJ            ,FEDERAL BUILDING      ,2ND FLOOR             ,635 S CLINTON AVE     ,TRENTON                     ,NJ,08611,(877) 405-0000,(833) 950-2222,{WEEK}",
        f"F5E,FOSU East - Branch 5,SOCIAL SECURITY ADMINISTRATION,,807 CROSBY ST,CHESTER,PA,19013,(877) 685-5942,,{WEEK}",
        "162,ROCKAWAY PARK NY,SOCIAL SECURITY,,11306 ROCKAWAY BCH BLVD,ROCKAWAY PARK,NY,11694,(866) 331-2310,,"
        + ",".join(["CLOSED,CLOSED"] * 5),
        "A05,CARLSBAD NM RS        ,SOCIAL SECURITY       ,SUITE D               ,2302 W PIERCE ST      ,CARLSBAD                    ,NM,88220,(866) 568-9442,,"
        + "9:00 AM,4:00 PM,9:00 AM,4:00 PM,CLOSED,CLOSED,9:00 AM,4:00 PM,9:00 AM,12:00 PM",
        f"Z99,,SOCIAL SECURITY,,1 NOWHERE RD,NOWHERE,ZZ,00000,,,{WEEK}",
    ]
)


def test_ssa_offices_keep_public_open_offices_with_tidy_names_and_streets():
    out = hp.ssa_offices(SSA_CSV)
    assert [o["n"] for o in out] == [
        "Social Security - Henderson",
        "Social Security - Modesto",
        "Social Security - Trenton",
        "Social Security - Carlsbad",  # back office, closed office and junk row dropped
    ]
    henderson, modesto, trenton, carlsbad = out
    assert henderson == {
        "n": "Social Security - Henderson",
        "t": "",
        "a": "10416 S Eastern Avenue",
        "c": "Henderson",
        "s": "NV",
        "zip": "89052",
        "p": "(855) 207-7084",
        "d": "Mon-Fri 9:00 AM-4:00 PM",
    }
    assert modesto["a"] == "1031 15th St"  # NUL padding and the agency's own name dropped
    assert trenton["a"] == "635 S Clinton Ave, 2nd Floor, Federal Building"  # street first
    assert trenton["zip"] == "08611"
    assert carlsbad["t"].startswith("Resident station")  # the "RS" suffix
    assert carlsbad["d"] == "Mon, Tue, Thu 9:00 AM-4:00 PM; Fri 9:00 AM-12:00 PM; Wed closed"
    assert "fax" not in json.dumps(out).lower()  # never read
    every = hp.ssa_offices(SSA_CSV, resident_station=True)
    assert all(o["t"] for o in every)  # the resident-station file marks every row


def test_ssa_offices_refuse_a_changed_file():
    with pytest.raises(ValueError, match="unexpected columns"):
        hp.ssa_offices("CODE,NAME,STREET\nA00,X,1 Main St\n")


def test_wayback_snapshot_takes_the_newest_recent_ssa_copy():
    now = dt.datetime(2026, 10, 21, tzinfo=dt.UTC)
    url = "https://www.ssa.gov/data/FO-Address-Open-Close-Times.csv"
    rows = [
        ["timestamp", "original", "statuscode"],
        ["20260802032059", url, "200"],
        ["20260828142437", url, "200"],
        ["20260901000000", url, "404"],
    ]
    assert hp.wayback_snapshot(rows, now) == f"https://web.archive.org/web/20260828142437id_/{url}"
    with pytest.raises(ValueError, match="too old"):
        hp.wayback_snapshot(rows[:2], dt.datetime(2028, 1, 1, tzinfo=dt.UTC))
    with pytest.raises(ValueError, match="unexpected archived URL"):
        hp.wayback_snapshot([rows[0], ["20260828142437", "https://evil.example/x.csv", "200"]], now)
    with pytest.raises(ValueError, match="no archived copy"):
        hp.wayback_snapshot([rows[0]], now)
    with pytest.raises(ValueError):
        hp.wayback_snapshot({"not": "cdx"}, now)


@pytest.mark.parametrize(
    "refusal",
    [httpx.Response(403, text="Access Denied"), httpx.Response(200, text="<html>Blocked</html>")],
)
async def test_ssa_falls_back_to_the_archived_copy_when_ssa_gov_refuses(refusal):
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.host)
        if request.url.host == "www.ssa.gov":
            return refusal
        if request.url.path.startswith("/cdx/"):
            assert request.url.params["url"].startswith("https://www.ssa.gov/data/")
            ts = dt.datetime.now(dt.UTC).strftime("%Y%m%d%H%M%S")
            return httpx.Response(
                200,
                json=[
                    ["timestamp", "original", "statuscode"],
                    [ts, request.url.params["url"], "200"],
                ],
            )
        assert "id_/https://www.ssa.gov/data/" in str(request.url)
        return httpx.Response(200, text=SSA_CSV)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        text = await ho._ssa_csv(client, "FO-Address-Open-Close-Times.csv")
    assert text.startswith("OFFICE CODE") and seen == [
        "www.ssa.gov",
        "web.archive.org",
        "web.archive.org",
    ]


async def test_ssa_uses_ssa_gov_directly_when_it_answers():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "www.ssa.gov"
        return httpx.Response(200, content=b"\xef\xbb\xbf" + SSA_CSV.encode())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        text = await ho._ssa_csv(client, "FO-Address-Open-Close-Times.csv")
    assert len(hp.ssa_offices(text)) == 4  # BOM stripped


# --- LSC service areas ----------------------------------------------------------


def _square(x: float, y: float, d: float = 1.0) -> list:
    return [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]


def _area_file(sa: str, *squares: list) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"SA": sa, "State": "X", "ST": "XX"},
                "geometry": {"type": "Polygon", "coordinates": [sq]},
            }
            for sq in squares
        ],
    }


PROGRAMS = [
    {
        "R_Legalname": "California Rural Legal Assistance, Inc.",
        "Web_URL": "http://www.crla.org",
        "Local_800": "800-337-0690",
        "Phone": "(510) 267-0762",
        "Fax": "(510) 267-0763",
        "Serv_Area_ID": "CA-31",
    },
    {
        "R_Legalname": "Acadiana Legal Service Corporation",
        "Web_URL": "javascript:alert(1)",
        "Local_800": "",
        "Phone": "(866) 275-2572",
        "Fax": "",
        "Serv_Area_ID": "LA-15",
    },
    {"R_Legalname": "Memphis Area Legal Services", "Serv_Area_ID": "TN-4 Closeout"},
]


def test_lsc_area_ids_merge_the_lookup_boxes_and_the_program_list():
    rect = 'var rectangles = [\n[48.4, 71.3, -184.4, -129.9, "AK-1"]\n,[29.3,33.0,-94.0,-90.8,"LA-10"]\n];'
    assert hp.lsc_area_ids(rect, PROGRAMS) == ["AK-1", "CA-31", "LA-10", "LA-15"]
    assert hp.lsc_area_ids("", "junk") == []
    assert hp.lsc_area_ids("", [{"Serv_Area_ID": "CA-1\n"}, {"Serv_Area_ID": "CA-١"}]) == ["CA-1"]
    many = [{"Serv_Area_ID": f"XX-{i}"} for i in range(501)]
    with pytest.raises(ValueError, match="service areas listed"):
        hp.lsc_area_ids("", many)


def test_lsc_areas_join_programs_by_the_files_own_area_and_merge_pieces():
    files = [
        ("CA-31", _area_file("CA-31", _square(-121, 37), _square(-119, 39))),  # two pieces
        ("LA-10", _area_file("LA-15", _square(-93, 30))),  # renamed area, LSC's tool reads SA
        ("PA-11", _area_file("PA-11", _square(-80, 40))),  # merged away: no current program
        ("XX-1", _area_file("CA-31", _square(0, 0))),  # a stray second copy is ignored
        ("BAD", {"features": ["nope", {"properties": None}]}),
    ]
    fc = hp.lsc_areas(files, PROGRAMS)
    by = {f["properties"]["area"]: f for f in fc["features"]}
    assert sorted(by) == ["CA-31", "LA-15"]
    crla = by["CA-31"]
    assert crla["geometry"]["type"] == "MultiPolygon" and len(crla["geometry"]["coordinates"]) == 2
    assert crla["properties"] == {
        "name": "California Rural Legal Assistance, Inc.",
        "phone": "(800) 337-0690",  # the intake line first
        "web": "https://www.crla.org",  # upgraded to https
        "area": "CA-31",
    }
    assert by["LA-15"]["properties"] == {
        "name": "Acadiana Legal Service Corporation",
        "phone": "(866) 275-2572",  # falls back to the main line
        "area": "LA-15",  # a non-web "website" is dropped
    }
    assert "fax" not in json.dumps(fc).lower()


def test_simplify_ring_generalizes_keeps_rings_closed_and_drops_specks():
    wiggly = [[x / 100, 0.0001 * (x % 2)] for x in range(101)] + [[1, 1], [0, 1], [0, 0]]
    out = hp.simplify_ring(wiggly, 0.001)
    assert out[0] == out[-1] and len(out) <= 6
    assert hp.simplify_ring(_square(0, 0, 0.0001), 0.001) is None  # a speck at this scale
    assert hp.simplify_ring([[0, 0], ["x", 1], [1, 1], [0, 0]], 0.001) is None
    assert hp.simplify_ring([[0, 0], [float("nan"), 1], [1, 1], [0, 0]], 0.001) is None
    assert hp.simplify_ring([[0, 0], [1, 0], [1, 1e9], [0, 0]], 0.001) is None
    geom = {"type": "Polygon", "coordinates": [_square(0, 0), _square(0.2, 0.2, 0.0001)]}
    assert hp.simplify_geometry(geom, 0.001) == {
        "type": "MultiPolygon",
        "coordinates": [[_square(0, 0)]],
    }
    assert hp.simplify_geometry({"type": "Point", "coordinates": [0, 0]}, 0.001) is None


async def test_legal_aid_loader_skips_missing_area_files(monkeypatch):
    got: dict = {}

    def check(files, programs, tol=None):
        got["files"] = [f[0] for f in files]
        return {"type": "FeatureCollection", "features": [{}] * 120}

    monkeypatch.setattr(ho.hp, "lsc_areas", check)

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("Programs.json"):
            return httpx.Response(200, json=PROGRAMS)
        if path.endswith("Rectangles.js"):
            return httpx.Response(200, text='[1,2,3,4,"LA-10"]')
        area = path.rsplit("/", 1)[1].removesuffix(".geojson")
        if area == "LA-15":
            return httpx.Response(404)
        return httpx.Response(200, json=_area_file(area, _square(0, 0)))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        fc = await ho._legal_aid_areas(client, None)
    assert got["files"] == ["CA-31", "LA-10"] and len(fc["features"]) == 120


async def test_legal_aid_loader_never_publishes_a_gutted_layer():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("Programs.json"):
            return httpx.Response(200, json=PROGRAMS)
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="only 0 service areas"):
            await ho._legal_aid_areas(client, None)


# --- pack-wide rules --------------------------------------------------------------

VIEW_HOSTS = re.search(
    r"const VIEW_HOSTS =\s*/(.+)/;", (ROOT / "frontend/src/view-sources.ts").read_text()
)[1]
PERSONAL = re.compile(r"email|e_mail|contact|first_name|last_name|director|person|fax", re.I)
# services-pack compact names (points) / generic-popup names (LSC areas)
ALLOWED = {
    "social-security-offices": {"n", "a", "c", "s", "p", "t", "d", "x"},
    "post-offices": {"n", "a", "c", "s"},
    "legal-aid-areas": {"name", "phone", "web", "area"},
    "marketplace-assisters": {"n", "o", "a", "c", "s", "p", "t", "l", "d", "web", "x"},
}


def test_pack_layers_are_self_describing_national_and_attributed():
    assert set(ho.LAYERS) == set(ALLOWED)
    for name, layer in ho.LAYERS.items():
        assert LAYERS[name] is layer, name  # registered
        assert layer.title_es and layer.title_es != layer.title, name
        assert layer.group in {"help", "civic"}, name
        assert layer.coverage == "usa", name
        assert SOURCES.get(name) and ho.SOURCES[name] == SOURCES[name], name
        if layer.view:
            assert re.match(VIEW_HOSTS, layer.view.url), f"{name}: host not in VIEW_HOSTS"
            assert set(layer.view.fields.values()) <= ALLOWED[name], name
            for src in layer.view.fields:
                assert not PERSONAL.search(src), f"{name}: personal field {src}"
    # point layers use the services-pack popup; the areas are polygons
    assert ho.LAYERS["social-security-offices"].category == "service"
    assert ho.LAYERS["legal-aid-areas"].category == "boundary"


def test_weekly_refresh_and_ci_cache_cover_every_baked_pack_layer(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / "backend" / "scripts"))  # its sibling import
    from scripts.refresh_live import WEEKLY

    baked = {n for n, layer in ho.LAYERS.items() if layer.loader}
    assert set(ho.WEEKLY) == baked and baked <= set(WEEKLY)
    workflow = (ROOT / ".github/workflows/pages.yml").read_text()
    for name in ho.WEEKLY:
        assert workflow.count(f"frontend/public/data/layers/{name}.geojson") == 2, name
    assert not set(ho.LAYERS) & set(sv.LAYERS)


def test_committed_baked_files_hold_only_allowlisted_properties():
    for name, layer in ho.LAYERS.items():
        path = ROOT / "frontend/public/data/layers" / f"{name}.geojson"
        fc = json.loads(path.read_text())
        keys = {k for f in fc["features"] for k in f["properties"]}
        assert keys <= ALLOWED[name], f"{name}: {keys - ALLOWED[name]}"
        assert not re.search(r"[\w.+'-]+@[\w-]+\.[\w.-]+", path.read_text()), f"{name}: an email"
        if not layer.view:  # whole-US files load in full: keep them small
            assert path.stat().st_size < 3_100_000, name
            assert len(fc["features"]) > 100, name


# --- edge cases ---------------------------------------------------------------


def test_lsc_areas_prefer_the_areas_own_file_and_skip_files_that_collapse():
    files = [
        ("LA-10", _area_file("LA-15", _square(-93, 30))),  # stale renamed copy, read first
        ("LA-15", _area_file("LA-15", _square(-92, 31))),  # the area's own file wins
        ("CA-30", _area_file("CA-31", _square(-121, 37, 0.0001))),  # collapses to nothing
        ("CA-31", _area_file("CA-31", _square(-120, 38))),  # so this one still counts
    ]
    by = {f["properties"]["area"]: f for f in hp.lsc_areas(files, PROGRAMS)["features"]}
    assert by["LA-15"]["geometry"]["coordinates"] == [[_square(-92, 31)]]
    assert by["CA-31"]["geometry"]["coordinates"] == [[_square(-120, 38)]]


def test_simplify_geometry_keeps_surviving_islands_and_holes():
    hole = _square(0.25, 0.25, 0.5)
    geom = {
        "type": "MultiPolygon",
        "coordinates": [[_square(0, 0), hole], [_square(5, 5, 0.0001)], [_square(3, 3)]],
    }
    out = hp.simplify_geometry(geom, 0.001)
    assert out["coordinates"] == [[_square(0, 0), hole], [_square(3, 3)]]


def test_ssa_hours_edge_cases():
    closed = {f"{d} {k} TIME": "CLOSED" for d in hp.SSA_DAYS for k in ("OPEN", "CLOSE")}
    assert hp.ssa_hours(closed) == ""
    assert hp.ssa_hours({}) == ""
    open_ended = {**closed, "MONDAY OPEN TIME": "9:00 AM", "MONDAY CLOSE TIME": ""}
    assert hp.ssa_hours(open_ended) == "Mon from 9:00 AM; Tue, Wed, Thu, Fri closed"


async def test_social_security_loader_merges_both_files_and_guards_the_count(monkeypatch):
    async def fake_csv(_client, name):
        return SSA_CSV

    async def fake_geocode(_client, records, zip_fallback):
        raise AssertionError("never geocodes a short list")

    monkeypatch.setattr(ho, "_ssa_csv", fake_csv)
    monkeypatch.setattr(ho, "geocode", fake_geocode)
    with pytest.raises(ValueError, match="only 8 offices"):  # 4 per file, far below a real list
        await ho._social_security(None, None)


# --- HealthCare.gov Find Local Help (Marketplace assisters) ---------------------

LH_HEADER = (
    "record_id,data_set_name,organization_name,main_phone_number,street_address,city,"
    "state_or_territory,zip_code,non_english_assistance_offered,organization_acronym,"
    "office_hours,toll_free_phone,tty_phone,language_line_phone_for_non_english_speakers,"
    "location_name,website_url,additional_information,accessibility_service_offered,"
    "geo_location,email_address,display,display_address,address_comment"
)
WEEKDAYS = "\n".join(f"{d}: 8:00 AM - 5:00 PM" for d in ("Mon", "Tue", "Wed", "Thu", "Fri"))


def _lh_row(rid, kind, org, **kw) -> list:
    v = {
        "phone": "2095550100",
        "street": "100 Main St",
        "city": "Houston",
        "state": "TX",
        "zip": "77001",
        "langs": "English",
        "hours": "",
        "label": "",
        "web": "",
        "geo": "(29.76046,-95.36980)",
        "email": "",
        "display": "true",
        "public": "true",
        **kw,
    }
    return [
        rid, kind, org, v["phone"], v["street"], v["city"], v["state"], v["zip"], v["langs"],
        "", v["hours"], "", "", "", v["label"], v["web"], "Call jane@example.org", "", v["geo"],
        v["email"], v["display"], v["public"], "",
    ]  # fmt: skip


def _lh_csv(*rows: list) -> str:
    import csv
    import io

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(LH_HEADER.split(","))
    w.writerows(rows)
    return buf.getvalue()


LH_CSV = _lh_csv(
    # an agent/broker (a person): never parsed, even with a full address
    _lh_row("1", "Agent/Broker (ABA)", "", label="Jane Q Doe", email="jane@example.org"),
    # one clinic listed as CAC and as Medicaid specialist: merged
    _lh_row(
        "2", "Certified Application Counselor (CAC)", "Valley Health Center, Inc.",
        street="100 Main St\nSte 2", hours=WEEKDAYS + "\nSat: 9:00 AM - 1:00 PM",
        langs="English, Spanish, Interpretation services available for other languages",
        label="Valley Health - Downtown", web="www.valleyhealth.example.org",
        email="intake@valleyhealth.example.org",
    ),
    _lh_row(
        "2", "Medicaid Specialist", "Valley Health Center, Inc.", street="100 Main St\nSte 2",
        langs="English, Vietnamese", label="Valley Health - Downtown",
    ),
    # a Navigator with no public address: area point only, no street or hours
    _lh_row(
        "3", "Navigator (NAV)", "Covering Texas", street="", city="", state="", zip="",
        hours=WEEKDAYS, label="TX Navigator", geo="(30.26715,-97.74306)", public="false",
    ),
    # a site labeled with a counselor's own name: kept as an area, name dropped
    _lh_row(
        "4", "Certified Application Counselor (CAC)", "Rural Clinic Network",
        street="9 Oak Ln", label="Janet Smithson", geo="(31.54933,-97.14667)",
    ),
    # CMS test records and hidden rows are dropped
    _lh_row("5", "Navigator (NAV)", "GDIT Test Org - 3915", label="River Rd Test Location"),
    _lh_row("6", "Certified Application Counselor (CAC)", "TestOrgCSG", label="Central Ave"),
    _lh_row("7", "Navigator (NAV)", "Hidden Org", display="false"),
    # a public site without a point: handed to the geocoder
    _lh_row("8", "In-person Assister (IPA)", "Family Services", street="5 Elm St", geo=""),
    # a bad hours line (ends before it starts): no hours at all
    _lh_row(
        "9", "Navigator (NAV)", "Test-Taking Solution Foundation", street="7 Pine St",
        hours="Mon: 7:00 AM - 5:00 AM", geo="(29.5,-95.1)",
    ),
    # counselor-named sites keep only the organization's own line
    _lh_row("10", "Navigator (NAV)", "Lakeside Health", street="1 Lake Rd", phone="2095550111"),
    _lh_row(
        "11", "Navigator (NAV)", "Lakeside Health", label="Kim Hixley", phone="2095550111",
        geo="(32.71,-96.81)",
    ),
    _lh_row(
        "12", "Navigator (NAV)", "Lakeside Health", label="Joy Humbert", phone="2095550122",
        geo="(33.11,-96.11)",
    ),
    _lh_row(
        "13", "Certified Application Counselor (CAC)", "Lakeside Health", public="false",
        street="", label="Heather's Application Services", phone="8505550199",
        geo="(30.41,-87.21)",
    ),
    _lh_row(
        "14", "Certified Application Counselor (CAC)", "Lakeside Health", public="false",
        street="", label="Bay Navigator", phone="8005550100", geo="(30.71,-88.01)",
    ),
    # an "organization" that is a person's name
    _lh_row("15", "Certified Application Counselor (CAC)", "Jane Doe", street="4 Elm St"),
)  # fmt: skip


def test_marketplace_assisters_keep_free_organizations_only():
    feats, pending = hp.marketplace_assisters(LH_CSV)
    lakeside = [f for f in feats if f["properties"]["n"] == "Lakeside Health"]
    feats = [f for f in feats if f not in lakeside]
    by = {f["properties"]["n"]: f for f in feats}
    assert set(by) == {
        "Valley Health Center, Inc.",
        "Covering Texas",
        "Rural Clinic Network",
        "Test-Taking Solution Foundation",  # a real-looking name, not a CMS test record
    }
    # the org's own and toll-free lines stay; counselors' direct lines don't
    assert [(f["properties"].get("o"), f["properties"].get("p")) for f in lakeside] == [
        (None, "(209) 555-0111"),  # the public site
        (None, "(209) 555-0111"),  # Kim Hixley's site: the org's main line
        (None, None),  # Joy Humbert's own number
        (None, None),  # Heather's Application Services: a person's business
        ("Bay Navigator", "(800) 555-0100"),
    ]
    assert sum(1 for f in lakeside if f["properties"].get("x") == 2) == 4
    clinic = by["Valley Health Center, Inc."]
    assert clinic["geometry"]["coordinates"] == [-95.3698, 29.76046]
    assert clinic["properties"] == {
        "n": "Valley Health Center, Inc.",
        "o": "Valley Health - Downtown",
        "a": "100 Main St, Ste 2",
        "c": "Houston",
        "s": "TX",
        "p": "(209) 555-0100",
        "d": "Mon-Fri 8:00 AM-5:00 PM; Sat 9:00 AM-1:00 PM",
        "web": "https://www.valleyhealth.example.org",
        "t": "cac mcd",
        "l": "English, Spanish, Vietnamese, Interpreters",
    }
    nav = by["Covering Texas"]
    assert nav["geometry"]["coordinates"] == [-97.7, 30.3]  # ~10 km, not the site
    assert nav["properties"]["x"] == 2 and nav["properties"]["t"] == "nav"
    assert "a" not in nav["properties"] and "d" not in nav["properties"]
    rural = by["Rural Clinic Network"]
    assert rural["properties"]["x"] == 2
    assert "o" not in rural["properties"] and "a" not in rural["properties"]
    assert rural["geometry"]["coordinates"] == [-97.1, 31.5]
    assert "d" not in by["Test-Taking Solution Foundation"]["properties"]
    assert [p["n"] for p in pending] == ["Family Services"]
    assert pending[0]["zip"] == "77001" and pending[0]["t"] == "ipa"
    text = json.dumps([feats, pending])
    assert "@" not in text and "Jane" not in text and "Janet" not in text


def test_marketplace_assisters_refuse_a_changed_file():
    with pytest.raises(ValueError, match="unexpected columns"):
        hp.marketplace_assisters("id,name\n1,x\n")


def test_assister_hours_group_days_and_reject_typos():
    assert hp.assister_hours(WEEKDAYS) == "Mon-Fri 8:00 AM-5:00 PM"
    split = "Mon: 8:00 AM - 5:00 PM\nTue: 8:00 AM - 8:00 PM\nThu: 8:00 AM - 5:00 PM"
    assert hp.assister_hours(split) == "Mon, Thu 8:00 AM-5:00 PM; Tue 8:00 AM-8:00 PM"
    assert hp.assister_hours("Mon: 12:00 PM - 1:00 PM") == "Mon 12:00 PM-1:00 PM"
    assert hp.assister_hours("Mon: 9:00 AM - 5:00 AM") == ""
    assert hp.assister_hours("Mon: by appointment") == ""
    assert hp.assister_hours("") == ""


def test_person_labels_are_told_apart_from_places():
    for label in ("Jenny Rivers", "Celeste L. Bondurant-Bell", "Andrea Toms/SEARHC", "Kim Hixley"):
        assert hp._person_label(label, "Some Health Org", "Austin"), label
    places = ("Fort Walton", "Winter Haven", "Riverview Location", "Enroll Alabama", "Mound City")
    for label in places:
        assert not hp._person_label(label, "Some Health Org", "Winter Haven"), label
    assert not hp._person_label("Capstone Parrish", "Capstone Health", "Parrish")
    # a part named after the organization doesn't vouch for the other parts
    org = "Samuel Q. Dalton Health Center"
    assert not hp._person_label("Samuel Q. Dalton / County Health Dept.", org, "Kansas City")
    assert hp._person_label("Samuel Q. Dalton / Mary Jo Fenwick", org, "Kansas City")
    assert hp._person_label("Mike Jonsson", "Jonsson Navigator Services", "Austin")
    assert hp._person_label("Adam Smithers", "Some Health Org", "Ada")


async def test_marketplace_loader_geocodes_sites_without_a_point(monkeypatch):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "data.healthcare.gov"
        return httpx.Response(200, content=b"\xef\xbb\xbf" + LH_CSV.encode())

    async def fake_geocode(_client, records, zip_fallback):
        seen.extend(r["n"] for r in records)
        assert zip_fallback
        props = [{k: v for k, v in r.items() if k != "zip"} for r in records]
        return [sv.sp.point(-95.0, 29.0, p) for p in props]

    monkeypatch.setattr(ho, "geocode", fake_geocode)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="only 10 features"):  # far below a real list
            await ho._marketplace_assisters(client, None)
    assert seen == ["Family Services"]
