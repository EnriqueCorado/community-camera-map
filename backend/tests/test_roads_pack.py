"""Nationwide road operations pack (app/layers/national/roads.py): normalizers
on small hand-written fixtures, source isolation, keyed-source hygiene, and the
CI wiring that keeps the keys out of the build job. No network."""

from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

import httpx
import pytest

# service.py first: it registers the packs (importing a pack first is circular)
from app.layers.service import LAYERS as REGISTRY

from app.core.config import Settings  # isort: skip
from app.layers.national import _roads_parse as rp  # isort: skip
from app.layers.national import roads  # isort: skip

ROOT = Path(__file__).resolve().parents[2]
NOW = dt.datetime(2026, 10, 21, 18, 0, tzinfo=dt.UTC)
H = dt.timedelta(hours=1)


def _iso(d: dt.datetime) -> str:
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture(autouse=True)
def _fresh_memo():
    roads._memo.clear()
    yield
    roads._memo.clear()


# ---------- WZDx ----------


def _wz(start, end, *, kind="work-zone", geom=None, **extra) -> dict:
    return {
        "type": "Feature",
        "geometry": geom or {"type": "LineString", "coordinates": [[-90.0, 40.0], [-90.01, 40.0]]},
        "properties": {
            "core_details": {
                "event_type": kind,
                "data_source_id": "x",
                "road_names": ["I-70", "I-70", "US 40"],
                "direction": "eastbound",
                "description": "  Lane <b>closure</b> &amp; paving  ",
            },
            "start_date": start,
            "end_date": end,
            "vehicle_impact": "some-lanes-closed",
            "worker_presence": {"are_workers_present": True, "confidence": "high"},
            "lanes": [
                {"order": 1, "type": "general", "status": "closed"},
                {"order": 2, "type": "general", "status": "open"},
                {"order": 3, "type": "shoulder", "status": "closed"},
            ],
            **extra,
        },
    }


def test_wzdx_v4_keeps_active_and_next_24h_only():
    fc = {
        "feed_info": {"version": "4.2"},
        "features": [
            _wz(_iso(NOW - 48 * H), _iso(NOW + 48 * H)),  # active
            _wz(_iso(NOW + 5 * H), _iso(NOW + 9 * H)),  # starts within 24 h
            _wz(_iso(NOW + 30 * H), _iso(NOW + 40 * H)),  # too far out
            _wz(_iso(NOW - 9 * H), _iso(NOW - 1 * H)),  # over
            _wz(_iso(NOW - H), _iso(NOW + H), kind="detour"),  # an alternate route
            _wz(_iso(NOW - H), _iso(NOW + H), event_status="completed"),
        ],
    }
    out = rp.wzdx_events(fc, NOW, state="MO", source="Missouri DOT", link="https://x.gov/")
    assert len(out) == 2
    p = out[0]["properties"]
    assert p == {
        "route": "I-70 / US 40",
        "type": "work-zone",
        "impact": "some-lanes-closed",
        "lanes": "1 of 2 lanes closed",
        "detail": "Lane closure & paving",
        "direction": "east",
        "start": "2026-10-19T18:00Z",
        "end": "2026-10-23T18:00Z",
        "state": "MO",
        "source": "Missouri DOT",
        "page": "https://x.gov/",
    }
    assert "worker_presence" not in json.dumps(out)  # never copied


def test_wzdx_v3_flat_properties_double_encoding_and_multipoint():
    v3 = {
        "road_event_feed_info": {"version": "3.1"},
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "MultiPoint", "coordinates": [[-75.1, 39.9], [-75.2, 39.95]]},
                "properties": {
                    "event_type": "work-zone",
                    "road_names": ["Rt 1"],
                    "direction": "northbound",
                    "start_date": _iso(NOW - H),
                    "end_date": None,
                    "vehicle_impact": "all-lanes-closed",
                    "description": "x" * 400,
                },
            }
        ],
    }
    body = json.dumps(json.dumps(v3)).encode()  # NJ ships a JSON string of JSON
    (f,) = rp.wzdx_events(rp.wzdx_payload(body), NOW, state="NJ", source="NJ")
    assert f["geometry"] == {"type": "LineString", "coordinates": [[-75.1, 39.9], [-75.2, 39.95]]}
    p = f["properties"]
    assert p["impact"] == "all-lanes-closed" and p["direction"] == "north" and "end" not in p
    assert len(p["detail"]) <= rp.DETAIL_MAX and p["detail"].endswith("…")


def test_wzdx_rejects_garbage_and_unknown_impacts():
    assert rp.wzdx_events("nope", NOW, state="X", source="X") == []
    assert (
        rp.wzdx_events({"features": [None, {"properties": "x"}]}, NOW, state="X", source="X") == []
    )
    bad = _wz(_iso(NOW - H), None, vehicle_impact="<script>")
    bad["geometry"] = {"type": "Polygon", "coordinates": []}
    ok = _wz(_iso(NOW - H), None, vehicle_impact="<script>")
    out = rp.wzdx_events({"features": [bad, ok]}, NOW, state="X", source="X")
    assert len(out) == 1 and "impact" not in out[0]["properties"]


def test_lines_are_simplified_and_rounded():
    pts = [[-90 + i * 1e-5, 40 + (i % 2) * 1e-6] for i in range(200)]  # nearly straight
    g = rp.geometry({"type": "LineString", "coordinates": pts})
    assert g["type"] == "LineString" and len(g["coordinates"]) == 2
    assert all(len(str(c).split(".")[-1]) <= rp.COORD_DP for xy in g["coordinates"] for c in xy)


def test_page_links_are_https_only():
    assert rp.page("https://511ga.org/") == "https://511ga.org/"
    for bad in ("http://511ga.org/", "javascript:alert(1)", "https://x.org/<a>", None):
        assert rp.page(bad) == ""


# ---------- Iteris 511 ----------


def _iteris(**kw) -> dict:
    return {
        "ID": 1,
        "RoadwayName": "I-85",
        "DirectionOfTravel": "Northbound",
        "Description": "Crash on I-85 NB",
        "StartDate": int((NOW - H).timestamp()),
        "PlannedEndDate": None,
        "LanesAffected": "No Data",
        "Latitude": 33.7,
        "Longitude": -84.4,
        "EventType": "accidentsAndIncidents",
        "EventSubType": "crash",
        "IsFullClosure": True,
        "EncodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@",  # Google's documented example
        **kw,
    }


def test_iteris_events_classify_decode_and_filter():
    rows = [
        _iteris(),
        _iteris(EventType="roadwork", EventSubType="construction", EncodedPolyline=None),
        _iteris(EventType="closures", EventSubType="Road Work"),  # NC: a roadwork closure
        _iteris(EventType="specialEvents", EventSubType="parade"),
        _iteris(EventType="closures", EventSubType="[other]"),
        _iteris(StartDate=-62135596800),  # year 1 = "no start": still counts
        _iteris(PlannedEndDate=int((NOW - H).timestamp())),  # ended
        _iteris(Latitude=None),
        "junk",
    ]
    out = rp.iteris_events(rows, NOW, state="GA", source="511GA", link="https://511ga.org/")
    kinds = [f["properties"]["type"] for f in out]
    assert kinds == ["crash", "work-zone", "work-zone", "special-event", "closure", "crash"]
    first = out[0]
    assert first["geometry"]["type"] == "LineString"
    assert first["geometry"]["coordinates"][0] == [-120.2, 38.5]  # decoded lon, lat
    assert first["properties"]["impact"] == "all-lanes-closed"
    assert "lanes" not in first["properties"]  # "No Data" dropped
    assert out[1]["geometry"] == {"type": "Point", "coordinates": [-84.4, 33.7]}
    assert "start" not in out[5]["properties"]


def test_iteris_signs():
    rows = [
        {"Id": "a", "Name": "I-75 SB @ US 41", "Roadway": "I-75", "Latitude": 33.8,
         "Longitude": -84.4, "Messages": ["I-85 AVG SPEED\nNORTH OF 75/85\n35-40 MPH", "NO_MESSAGE"]},
        {"Id": "b", "Name": "x", "Roadway": "Unknown", "Latitude": "bad", "Longitude": 1},
    ]  # fmt: skip
    (f,) = rp.iteris_signs(rows, state="GA", source="511GA")
    assert f["properties"] == {
        "name": "I-75 SB @ US 41",
        "message": "I-85 AVG SPEED NORTH OF 75/85 35-40 MPH",
        "road": "I-75",
        "state": "GA",
        "source": "511GA",
    }


# ---------- OHGO ----------


def test_ohgo_construction_reads_ohio_local_time():
    payload = {
        "results": [
            {
                "latitude": 39.95,
                "longitude": -83.0,
                "routeName": "I-70 westbound",
                "description": "Closed overnight",
                "direction": "westbound",
                "status": "Closed",
                "startDate": "2026-10-21T10:00:00",  # Eastern (EDT, UTC-4)
                "endDate": "2026-10-22T05:00:00",
                "workZones": [{"polyline": [[-83.0, 39.95], [-83.01, 39.951]]}],
            },
            {"latitude": 1, "longitude": 1, "startDate": "2026-12-01T00:00:00"},  # later
        ]
    }
    (f,) = rp.ohgo_construction(payload, NOW, source="OHGO", link="https://www.ohgo.com/")
    p = f["properties"]
    assert p["start"] == "2026-10-21T14:00Z" and p["impact"] == "all-lanes-closed"
    assert f["geometry"]["type"] == "LineString" and p["state"] == "OH"


def test_ohgo_incidents_signs_weather():
    inc = {"results": [
        {"latitude": 41.4, "longitude": -81.7, "category": "Crash", "roadStatus": "Restricted",
         "routeName": "I-90", "description": "Crash", "direction": "W"},
        {"latitude": 41.4, "longitude": -81.7, "category": "Road Work", "roadStatus": "Closed"},
    ]}  # fmt: skip
    a, b = rp.ohgo_incidents(inc, source="OHGO", link="")
    assert a["properties"]["type"] == "crash" and a["properties"]["impact"] == "some-lanes-closed"
    assert b["properties"]["type"] == "work-zone"
    signs = {"results": [{"latitude": 39.8, "longitude": -84.3, "location": "I-70 EB @ SR-49",
                          "messages": ["   MILES  MIN\r\nI-75   9   8"]}]}  # fmt: skip
    (s,) = rp.ohgo_signs(signs, source="OHGO")
    assert s["properties"]["message"] == "MILES MIN I-75 9 8"
    wx = {"results": [{
        "latitude": 40.7, "longitude": -83.8, "location": "D01 OH002F HAR SR235 16.00- SR235 @ SR309",
        "atmosphericSensors": [{"airTemperature": 62.1, "humidity": 48, "averageWindSpeed": 0.0,
                                "maximumWindSpeed": 3.1, "pressure": 65535}],
        "surfaceSensors": [{"surfaceTemperature": 73.4}],
    }]}  # fmt: skip
    (w,) = rp.ohgo_weather(wx, source="OHGO")
    assert w["properties"] == {
        "name": "SR235 @ SR309", "temp_f": 62, "surface_f": 73, "wind_mph": 0, "gust_mph": 3,
        "humidity": 48, "state": "OH", "source": "OHGO",
    }  # fmt: skip


# ---------- Maryland CHART ----------


def test_chart_events_drop_responders_and_closed_events():
    payload = {"data": [
        {"closed": False, "lat": 39.6, "lon": -77.4, "incidentType": "Property Damage",
         "description": "Collision @ MD 77 (E MAIN ST) @ WATER ST", "direction": "East",
         "startDateTime": int((NOW - H).timestamp() * 1000), "lanesStatus": "1 of 2 closed",
         "participants": ["Trooper Smith"], "vehicles": "2 vehicles involved.",
         "other": "THURMONT PD", "opCenter": "SOC"},
        {"closed": True, "lat": 39.6, "lon": -77.4, "description": "done"},
    ]}  # fmt: skip
    (f,) = rp.chart_events(payload, source="CHART", link="https://chart.maryland.gov/")
    p = f["properties"]
    assert p["type"] == "crash" and p["route"] == "MD 77" and p["start"] == "2026-10-21T17:00Z"
    text = json.dumps(f)
    assert "Smith" not in text and "THURMONT" not in text and "vehicles" not in text


def test_chart_signs_and_weather():
    dms = {"data": [
        {"commMode": "ONLINE", "lat": 39.48, "lon": -76.26, "description": "I-95 South, past Ex 80",
         "msgPlain": "I-695       15 MILES   14 MINUTES"},
        {"commMode": "OFFLINE", "lat": 39.0, "lon": -76.0, "description": "x", "msgPlain": ""},
    ]}  # fmt: skip
    (s,) = rp.chart_signs(dms, source="CHART")
    assert s["properties"]["message"] == "I-695 15 MILES 14 MINUTES"
    rwis = {"data": [
        {"lat": 39.2, "lon": -76.2, "description": "MD 20 at MD 21", "airTemp": "55F",
         "pavementTemp": "66F to 66F", "windDescription": "N 3 MPH", "gustSpeed": "7 MPH",
         "relativeHumidity": "64%"},
        {"lat": 38.2, "lon": -76.5, "description": "MD 5", "airTemp": "No Data Available",
         "relativeHumidity": "No Data Available", "windDescription": "No Data Available"},
    ]}  # fmt: skip
    a, b = rp.chart_weather(rwis, source="CHART")
    assert a["properties"] == {
        "name": "MD 20 at MD 21", "temp_f": 55, "surface_f": 66, "wind_mph": 3, "gust_mph": 7,
        "humidity": 64, "state": "MD", "source": "CHART",
    }  # fmt: skip
    assert "temp_f" not in b["properties"] and "humidity" not in b["properties"]


# ---------- Alabama ALGO ----------


def test_algo_events_and_signs():
    loc = {"latitude": 33.0, "longitude": -87.75, "displayRouteDesignator": "I-20/59",
           "direction": "East", "displayCrossStreet": "Exit 62"}  # fmt: skip
    events = [
        {"active": True, "type": "Roadwork", "severity": "Closed", "title": "Bridge work",
         "description": "All lanes closed.", "shortSubTitle": "I-20/59 EB @ MP 55 to MP 62",
         "start": _iso(NOW - H), "end": _iso(NOW + H), "startLocation": loc,
         "endLocation": {**loc, "latitude": 33.1}, "permLink": "https://www.algotraffic.com?id=1"},
        {"active": True, "type": "Crash", "start": _iso(NOW - H), "startLocation": loc,
         "permLink": "https://evil.example/"},
        {"active": False, "type": "Crash", "startLocation": loc},
    ]  # fmt: skip
    a, b = rp.algo_events(events, NOW, source="ALGO", link="https://www.algotraffic.com/")
    assert a["properties"]["type"] == "work-zone" and a["geometry"]["type"] == "LineString"
    assert a["properties"]["detail"] == "Bridge work. All lanes closed."
    assert a["properties"]["page"] == "https://www.algotraffic.com?id=1"
    assert b["properties"]["page"] == "https://www.algotraffic.com/"  # off-site link replaced
    signs = [{"location": loc, "pages": [
        {"lines": [{"text": "5 MILES"}, {"text": "7-9 MINS"}]},
        {"lines": [{"text": "5 MILES"}, {"text": "5-7 MINS"}]},
    ]}]  # fmt: skip
    (s,) = rp.algo_signs(signs, source="ALGO")
    assert s["properties"]["name"] == "I-20/59 East @ Exit 62"
    assert s["properties"]["message"] == "5 MILES 7-9 MINS / 5 MILES 5-7 MINS"


# ---------- registry + loaders ----------


def test_keyless_feeds_from_the_registry():
    reg = [
        {"feedname": "modot", "state": "missouri", "needapikey": False, "active": True,
         "version": "4.1", "url": {"url": "https://traveler.modot.org/x.json"}},
        {"feedname": "cdot", "needapikey": True, "active": True, "version": "4.2",
         "url": {"url": "https://data.cotrip.org/api/v1/wzdx?apiKey="}},
        {"feedname": "CivicLink_CrewCast", "state": "n/a", "needapikey": False, "active": True,
         "version": "4.2", "url": {"url": "https://x.replit.app/wzdx"}},
        {"feedname": "newone", "state": "Vermont", "needapikey": False, "active": True,
         "version": "4.2", "url": {"url": "https://vt.example.gov/wzdx"}},
        {"feedname": "plain", "state": "Vermont", "needapikey": False, "active": True,
         "version": "4.2", "url": {"url": "http://vt.example.gov/wzdx"}},
        {"feedname": "abroad", "state": "n/a", "needapikey": False, "active": True,
         "version": "3.1", "url": {"url": "https://q.example/wzdx"}},
        {"feedname": "cwz", "state": "Vermont", "needapikey": False, "active": True,
         "version": "CWZ 1.0", "url": {"url": "https://vt.example.gov/cwz"}},
    ]  # fmt: skip
    feeds = roads.keyless_feeds(reg)
    assert [f["name"] for f in feeds] == ["modot", "newone"]
    assert feeds[0]["state"] == "MO" and feeds[0]["page"] == "https://traveler.modot.org/"
    assert feeds[1]["state"] == "VT" and feeds[1]["page"] == ""


REGISTRY_ROWS = [
    {"feedname": "modot", "state": "missouri", "needapikey": False, "active": True,
     "version": "4.1", "url": {"url": "https://traveler.modot.org/wzdx.json"}},
    {"feedname": "odot", "state": "oklahoma", "needapikey": False, "active": True,
     "version": "4", "url": {"url": "https://oktraffic.org/api/workzones?access_token=SECRETTOKEN"}},
    {"feedname": "wisdot", "state": "wisconsin", "needapikey": False, "active": True,
     "version": "4.2", "url": {"url": "https://511wi.gov/api/wzdx"}},
]  # fmt: skip


def _feed(start_offset_h: float = -1) -> dict:
    now = dt.datetime.now(dt.UTC)
    return {"features": [_wz(_iso(now + start_offset_h * H), _iso(now + 5 * H))]}


def _client(
    routes: dict[str, object], seen: list[httpx.Request] | None = None
) -> httpx.AsyncClient:
    def handler(req: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(req)
        for prefix, resp in routes.items():
            if str(req.url).startswith(prefix):
                if isinstance(resp, httpx.Response):
                    return resp
                return httpx.Response(200, json=resp)
        return httpx.Response(404)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _iteris_row(kind: str) -> dict:
    now = dt.datetime.now(dt.UTC)
    return _iteris(EventType=kind, EventSubType="", StartDate=int((now - H).timestamp()))


async def test_work_zones_isolate_failing_feeds_and_skip_iteris_where_wzdx_delivered():
    s = Settings(iteris_key_wi="WIKEY", iteris_key_ga="GAKEY")
    routes = {
        "https://data.transportation.gov/": REGISTRY_ROWS,
        "https://traveler.modot.org/": _feed(),
        "https://oktraffic.org/": httpx.Response(500),  # one broken feed
        "https://511wi.gov/api/wzdx": _feed(),
        "https://511wi.gov/api/v2/get/event": [_iteris_row("roadwork")],
        "https://511ga.org/api/v2/get/event": [_iteris_row("roadwork"), _iteris_row("closures")],
        "https://api.algotraffic.com/": httpx.Response(503),
    }
    async with _client(routes) as c:
        fc = await roads.load_work_zones(c, s)
    states = sorted(f["properties"]["state"] for f in fc["features"])
    assert states == ["GA", "MO", "WI"]  # WI once (WZDx), GA roadwork from 511GA
    assert all("type" not in f["properties"] for f in fc["features"])  # implied by the layer


async def test_layer_fails_only_when_every_source_fails():
    async with _client({}) as c:
        with pytest.raises(roads.SourceError):
            await roads.load_road_incidents(c, Settings())
        roads._memo.clear()
        with pytest.raises(roads.SourceError):
            await roads.load_work_zones(c, Settings())


async def test_keyed_sources_skip_bad_keys_never_redirect_and_never_publish_keys():
    s = Settings(iteris_key_ga="GAKEY", iteris_key_nv="NVKEY", ohgo_api_key="OHKEY")
    seen: list[httpx.Request] = []
    leaky = _iteris_row("closures") | {"Description": "see https://511ga.org/?key=GAKEY"}
    routes = {
        "https://chartexp1.sha.maryland.gov/": httpx.Response(500),
        "https://api.algotraffic.com/": [],
        "https://511ga.org/api/v2/get/event": [leaky, _iteris_row("closures")],
        "https://www.nvroads.com/": httpx.Response(400, json={"message": "Invalid Key"}),
        "https://publicapi.ohgo.com/": httpx.Response(302, headers={"location": "https://x/"}),
    }
    async with _client(routes, seen) as c:
        fc = await roads.load_road_incidents(c, s)
    assert [f["properties"]["state"] for f in fc["features"]] == ["GA"]
    assert "GAKEY" not in json.dumps(fc)
    assert not any(r.url.host == "x" for r in seen)  # the OHGO redirect was not followed
    ohgo = [r for r in seen if r.url.host == "publicapi.ohgo.com"]
    assert ohgo and all(r.headers["authorization"] == "APIKEY OHKEY" for r in ohgo)
    assert all("OHKEY" not in str(r.url) for r in ohgo)


async def test_work_zones_and_incidents_share_one_iteris_call():
    s = Settings(iteris_key_ga="GAKEY")
    seen: list[httpx.Request] = []
    routes = {
        "https://data.transportation.gov/": [],
        "https://api.algotraffic.com/": [],
        "https://chartexp1.sha.maryland.gov/": {"data": []},
        "https://511ga.org/api/v2/get/event": [_iteris_row("roadwork"), _iteris_row("closures")],
    }
    async with _client(routes, seen) as c:
        wz = await roads.load_work_zones(c, s)
        inc = await roads.load_road_incidents(c, s)
    assert len(wz["features"]) == 1 and len(inc["features"]) == 1
    assert sum(r.url.host == "511ga.org" for r in seen) == 1  # Iteris: 10 calls / min


async def test_published_registry_tokens_are_used_but_never_kept():
    seen: list[httpx.Request] = []
    routes = {
        "https://data.transportation.gov/": REGISTRY_ROWS[1:2],
        "https://oktraffic.org/": _feed(),
        "https://api.algotraffic.com/": [],
    }
    async with _client(routes, seen) as c:
        fc = await roads.load_work_zones(c, Settings())
    assert len(fc["features"]) == 1 and "SECRETTOKEN" not in json.dumps(fc)
    assert any("SECRETTOKEN" in str(r.url) for r in seen)


# ---------- pack + wiring ----------


def test_pack_is_self_describing_nationwide_and_credited():
    from scripts.bake import SOURCES

    assert set(roads.LAYERS) == {
        "work-zones",
        "road-incidents",
        "message-signs-usa",
        "road-weather-usa",
    }
    for name, lay in roads.LAYERS.items():
        assert REGISTRY[name] is lay
        assert lay.title_es and lay.title_es != lay.title and lay.group == "roads"
        assert lay.coverage == "usa" and lay.catalog_extras()["coverage"] == "usa"
        assert lay.loader and not lay.view and lay.ttl
        assert SOURCES.get(name) == roads.SOURCES[name]
    assert roads.KEYED == tuple(roads.LAYERS)
    for st in (
        "511GA",
        "511 Wisconsin",
        "NVRoads",
        "DriveNC",
        "511 Alaska",
        "OHGO",
        "CHART",
        "ALGO",
    ):
        assert st in SOURCES["road-incidents"], st


def test_page_hosts_match_the_frontend_allowlist():
    src = (ROOT / "frontend/src/popup-logic.ts").read_text()
    block = re.search(r"export const ROAD_PAGE_HOSTS = \[(.*?)\];", src, re.S)
    assert block, "ROAD_PAGE_HOSTS not found"
    assert re.findall(r'"([^"]+)"', block.group(1)) == roads.PAGE_HOSTS


def test_keyed_layers_bake_only_in_the_keyed_job_and_are_cached():
    import sys

    sys.path.insert(0, str(ROOT / "backend" / "scripts"))
    from refresh_live import DAILY, FAST, HOURLY, WEEKLY

    assert not set(roads.KEYED) & {*FAST, *HOURLY, *DAILY, *WEEKLY}  # build job: no keys
    yml = (ROOT / ".github/workflows/pages.yml").read_text()
    jobs = re.split(r"\n  (?=[\w-]+:\n)", yml.split("\njobs:\n", 1)[1])
    by_name = {j.split(":", 1)[0].strip(): j for j in jobs}
    assert "--keyed" in by_name["cameras"] and "--keyed" not in by_name["build"]
    assert "secrets.ITERIS" not in by_name["build"] and "secrets.OHGO" not in by_name["build"]
    for name in roads.KEYED:
        path = f"frontend/public/data/layers/{name}.geojson"
        assert by_name["cameras"].count(path) == 1, f"{name}: upload it in the road-ops artifact"
        assert by_name["build"].count(path) == 2, f"{name}: restore + save in the road-ops cache"
        assert name in by_name["build"].split("--adopt ", 1)[1].split("\n", 1)[0]


# ---------- review follow-ups ----------


def test_staff_contacts_phones_and_emails_are_scrubbed():
    s = rp.text("Lane closure on SR 60. Contact: FDOT Jane Doe 727-555-0100 jane@fdot.gov")
    assert s == "Lane closure on SR 60."
    assert rp.text("Call (877) 555-0110 or ops@dot.gov for info") == "Call or for info"
    s = rp.text("Roadwork, status: approved Emergency Contact Information: - Name: Matt Doe")
    assert s == "Roadwork, status: approved"


def test_kind_regexes_use_word_boundaries():
    assert (
        rp._iteris_kind({"EventType": "accidentsAndIncidents", "EventSubType": "Police Activity"})
        == "incident"
    )
    assert (
        rp._iteris_kind({"EventType": "accidentsAndIncidents", "EventSubType": "Crash on bridge"})
        == "crash"
    )
    assert rp._iteris_kind({"EventType": "closures", "EventSubType": "Ice on road"}) == "weather"


def test_a_bare_end_date_lasts_the_whole_day():
    assert rp.iso(rp.when("2026-10-21", end=True)) == "2026-10-21T23:59Z"
    assert rp.iso(rp.when("2026-10-21")) == "2026-10-21T00:00Z"


async def test_county_feeds_do_not_suppress_a_states_511_roadwork():
    s = Settings(iteris_key_az="AZKEY")
    rows = [{"feedname": "mcdot", "state": "arizona", "needapikey": False, "active": True,
             "version": "4.2", "url": {"url": "https://wzdxapi.aztech.org/construction"}}]  # fmt: skip
    routes = {
        "https://data.transportation.gov/": rows,
        "https://wzdxapi.aztech.org/": _feed(),
        "https://az511.com/api/v2/get/event": [_iteris_row("roadwork")],
        "https://api.algotraffic.com/": [],
    }
    async with _client(routes) as c:
        fc = await roads.load_work_zones(c, s)
    assert [f["properties"]["source"] for f in fc["features"]] == [
        "Maricopa County DOT / AZTech",
        "AZ511 / Arizona DOT",
    ]


def test_adopt_from_a_dir_keeps_layers_that_did_not_arrive(tmp_path, monkeypatch):
    import sys

    sys.path.insert(0, str(ROOT / "backend" / "scripts"))
    import refresh_live

    out = tmp_path / "data"
    (out / "layers").mkdir(parents=True)
    (out / "layers.json").write_text(json.dumps([
        {"name": "work-zones", "available": True, "count": 5},
        {"name": "road-incidents", "available": True, "count": 7},
    ]))  # fmt: skip
    (out / "layers" / "road-incidents.geojson").write_text(
        '{"type":"FeatureCollection","features":[]}'
    )
    incoming = tmp_path / "in"
    incoming.mkdir()
    (incoming / "work-zones.geojson").write_text('{"type":"FeatureCollection","features":[{}]}')
    timed: list[list[str]] = []
    monkeypatch.setattr(refresh_live, "OUT", out)
    monkeypatch.setattr(refresh_live, "record_layer_times", timed.append)
    refresh_live.adopt("work-zones,road-incidents", incoming)
    cat = {c["name"]: c for c in json.loads((out / "layers.json").read_text())}
    assert cat["work-zones"]["count"] == 1 and cat["road-incidents"]["count"] == 7
    assert timed == [["work-zones"]]
    assert json.loads((out / "layers" / "work-zones.geojson").read_text())["features"] == [{}]


def test_workflow_is_valid_yaml():
    yaml = pytest.importorskip("yaml")
    jobs = yaml.safe_load((ROOT / ".github/workflows/pages.yml").read_text())["jobs"]
    upload = next(
        s for s in jobs["cameras"]["steps"] if s.get("with", {}).get("name") == "road-ops"
    )
    assert upload["with"]["path"].split() == [
        f"frontend/public/data/layers/{n}.geojson" for n in roads.KEYED
    ]
