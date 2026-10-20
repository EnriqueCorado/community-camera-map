"""Keyed camera sources (Iteris 511 states, OHGO): normalizers against small
hand-written fixtures, and the key never reaching a log line, exception or URL
we keep. No network; the key below is a dummy."""

from __future__ import annotations

import json
import logging

import httpx
import pytest

from app.cameras import national
from app.core.config import Settings

FAKE_KEY = "dummy-test-key-0000"


def _site(**kw):
    site = {
        "Id": 1,
        "Source": "ADOT&PF",
        "SourceId": "0",
        "Roadway": "Seward Highway",
        "Direction": "Northbound",
        "Latitude": 60.818883,
        "Longitude": -148.975515,
        "Location": "Seward Highway MP 78.9 / Portage Glacier Road (#0)",
        "SortOrder": 0,
        "Views": [
            {
                "Id": 2,
                "Url": "https://511.alaska.gov/map/Cctv/2",
                "Status": "Enabled",
                "Description": "N/A",
            },
            {"Id": 1, "Url": "https://511.alaska.gov/map/Cctv/1", "Status": "Disabled"},
            {"Id": 3, "Url": "https://511.alaska.gov/map/Cctv/3", "Status": "Enabled"},
            {"Id": 4, "Url": "https://evil.example/map/Cctv/4", "Status": "Enabled"},
        ],
    }
    site.update(kw)
    return site


def _client(status: int, body: str, seen: list[httpx.Request]) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status, text=body)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ---------- Iteris 511 ----------


def test_parse_iteris_site_views_and_names():
    rows = [
        _site(),
        _site(Id=7, Roadway="McCarran & Kietzke", Location="N/A", Direction="Unknown"),
        _site(
            Id=8,
            Views=[{"Id": 9, "Url": "https://511.alaska.gov/map/Cctv/9", "Status": "Disabled"}],
        ),
        _site(Id=10, Latitude=None),
        {"Id": 11, "Views": "x"},
    ]
    a, b = national.parse_iteris("ak", rows)
    assert (a.id, a.source, a.state, a.direction) == ("ak-1", "ak", "AK", "North")
    assert a.name == "Seward Highway MP 78.9 / Portage Glacier Road (#0)"
    assert a.snapshot_url == "https://511.alaska.gov/map/Cctv/2"
    assert a.views == ["https://511.alaska.gov/map/Cctv/3"]  # disabled + off-host views dropped
    assert a.stream_url == ""  # AK video isn't verified CORS-open
    assert (b.name, b.direction) == ("McCarran & Kietzke", "")
    # A coded location (NC style) keeps the roadway in front.
    (c,) = national.parse_iteris(
        "ak", [_site(Roadway="I-485", Location="CCTV10-I485-30.1O_I85", County="Mecklenburg")]
    )
    assert (c.name, c.route, c.county) == ("I-485 - CCTV10-I485-30.1O_I85", "I-485", "Mecklenburg")


def test_parse_iteris_video_only_where_verified():
    view = {
        "Id": 5,
        "Url": "https://511wi.gov/map/Cctv/5",
        "Status": "Enabled",
        "VideoUrl": "https://cctv1.dot.wi.gov/rtplive/CCTV-40-0001/playlist.m3u8",
    }
    (wi,) = national.parse_iteris("wi", [_site(Views=[view])])
    assert wi.stream_url == "https://cctv1.dot.wi.gov/rtplive/CCTV-40-0001/playlist.m3u8"
    nv_view = {
        "Id": 2,
        "Url": "https://www.nvroads.com/map/Cctv/2",
        "Status": "Enabled",
        "VideoUrl": "https://d2wse1.its.nv.gov:443/reno/x.stream/playlist.m3u8",
    }
    (nv,) = national.parse_iteris("nv", [_site(Views=[nv_view])])
    assert (nv.snapshot_url, nv.stream_url) == ("https://www.nvroads.com/map/Cctv/2", "")


@pytest.mark.parametrize("junk", [None, 5, "x", {}, [None, 1]])
def test_keyed_parsers_tolerate_garbage(junk):
    assert national.parse_iteris("nv", junk) == []
    assert national.parse_oh(junk) == []


async def test_iteris_one_call_per_state():
    seen: list[httpx.Request] = []
    view = {"Id": 2, "Url": "https://www.nvroads.com/map/Cctv/2", "Status": "Enabled"}
    async with _client(200, json.dumps([_site(Views=[view])]), seen) as client:
        res = await national.fetch_all(
            client, max_bytes=1 << 20, iteris_keys={"nv": FAKE_KEY}, only=("nv",)
        )
    assert [c.id for c in res.cameras] == ["nv-1"] and res.failed == []
    assert len(seen) == 1
    assert (seen[0].url.host, seen[0].url.path) == ("www.nvroads.com", "/api/v2/get/cameras")
    assert FAKE_KEY not in json.dumps([c.model_dump() for c in res.cameras])


async def test_iteris_invalid_key_skips_the_state_quietly(caplog):
    seen: list[httpx.Request] = []
    with caplog.at_level(logging.INFO):
        async with _client(400, "<Error><Message>Invalid Key</Message></Error>", seen) as client:
            res = await national.fetch_all(
                client, max_bytes=1 << 20, iteris_keys={"ga": FAKE_KEY}, only=("ga",)
            )
    assert (res.cameras, res.failed, res.counts) == ([], [], {"ga": 0})
    assert "GA: invalid key" in caplog.text
    assert FAKE_KEY not in caplog.text and "511ga.org" not in caplog.text


async def test_iteris_errors_never_carry_the_key(caplog):
    seen: list[httpx.Request] = []
    with caplog.at_level(logging.DEBUG):
        async with _client(503, "down", seen) as client:
            res = await national.fetch_all(
                client, max_bytes=1 << 20, iteris_keys={"nc": FAKE_KEY}, only=("nc",)
            )
    assert res.failed == ["nc"]
    assert "SourceError" in caplog.text and FAKE_KEY not in caplog.text
    # The sanitized exception (if anyone logs it) holds no URL and no chained cause.
    fetch = national._iteris("nc", FAKE_KEY)
    async with _client(503, "down", seen) as client:
        with pytest.raises(national.SourceError) as info:
            await fetch(client, 1 << 20)
    assert FAKE_KEY not in str(info.value)
    assert info.value.__cause__ is None and info.value.__suppress_context__


def test_unknown_or_empty_iteris_keys_add_no_fetchers():
    # Only states in ITERIS with a non-empty key are fetched.
    assert set(national.ITERIS) == {"ga", "wi", "nv", "nc", "ut", "ak", "la", "id", "az"}
    for st in national.ITERIS:
        assert national.SOURCES[st].credit and national.HOSTS[st]


# ---------- OHGO ----------


def _oh(**kw):
    row = {
        "id": "00000000000001",
        "latitude": 41.50557,
        "longitude": -82.84921,
        "location": "SR-2 at S Lightner Rd, 5060",
        "description": "SR-2 at S Lightner Rd, 5060",
        "cameraViews": [
            {
                "direction": "View",
                "smallUrl": "https://itscameras.dot.state.oh.us:443/images/toledo/SR2-EB-West-s.jpg",
                "largeUrl": "https://itscameras.dot.state.oh.us:443/images/toledo/SR2-EB-West.jpg",
            },
            {
                "direction": "East",
                "largeUrl": "https://itscameras.dot.state.oh.us/images/toledo/SR2-E.jpg",
            },
            {"direction": "x", "largeUrl": "https://evil.example/x.jpg"},
        ],
    }
    row.update(kw)
    return row


def test_parse_oh_normalizes_port_and_lists_views():
    payload = {
        "results": [_oh(), _oh(id="2", cameraViews=[]), _oh(id="../3"), _oh(id="4", latitude=None)]
    }
    (a,) = national.parse_oh(payload)
    assert (a.id, a.source, a.state, a.route) == ("oh-1", "oh", "OH", "SR-2")
    assert a.snapshot_url == "https://itscameras.dot.state.oh.us/images/toledo/SR2-EB-West.jpg"
    assert a.views == ["https://itscameras.dot.state.oh.us/images/toledo/SR2-E.jpg"]
    assert a.direction == ""  # "View" isn't a compass direction


async def test_ohgo_key_goes_in_a_header_not_the_url(caplog):
    seen: list[httpx.Request] = []
    async with _client(200, json.dumps({"results": [_oh()]}), seen) as client:
        res = await national.fetch_all(client, max_bytes=1 << 20, ohgo_key=FAKE_KEY, only=("oh",))
    assert [c.id for c in res.cameras] == ["oh-1"]
    (req,) = seen
    assert req.headers["Authorization"] == f"APIKEY {FAKE_KEY}"
    assert FAKE_KEY not in str(req.url) and req.url.params["page-all"] == "true"

    seen.clear()
    with caplog.at_level(logging.INFO):
        async with _client(401, "unauthorized", seen) as client:
            res = await national.fetch_all(
                client, max_bytes=1 << 20, ohgo_key=FAKE_KEY, only=("oh",)
            )
    assert (res.cameras, res.failed) == ([], [])
    assert "OHGO: invalid key" in caplog.text and FAKE_KEY not in caplog.text


async def test_no_keys_means_no_keyed_requests():
    seen: list[httpx.Request] = []
    async with _client(500, "", seen) as client:
        res = await national.fetch_all(client, max_bytes=1 << 20, only=("oh", "nv"))
    assert (res.cameras, seen) == ([], [])


def test_settings_collect_only_set_keys(monkeypatch):
    # isolate from a developer's real backend/.env and CAM_* environment
    for k in [k for k in __import__("os").environ if k.startswith("CAM_ITERIS_KEY_")]:
        monkeypatch.delenv(k)
    s = Settings(_env_file=None, iteris_key_nv=FAKE_KEY, iteris_key_ga="", ohgo_api_key="")
    # compare key names only, so a failure can never print a real key
    assert sorted(s.iteris_keys) == ["nv"] and s.iteris_keys["nv"] == FAKE_KEY


async def test_keyed_sources_never_follow_redirects():
    # a 30x would forward the Iteris key (query string) to the new Location
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(302, headers={"Location": "http://evil.example/steal"})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=True
    ) as client:
        res = await national.fetch_all(
            client,
            max_bytes=1 << 20,
            iteris_keys={"nv": FAKE_KEY},
            ohgo_key=FAKE_KEY,
            only=("nv", "oh"),
        )
    assert res.cameras == []
    assert seen and all(r.url.host != "evil.example" for r in seen)


def test_tests_never_load_the_developers_real_keys():
    # conftest's autouse fixture: no backend/.env, no CAM_* variables
    s = Settings()
    assert s.iteris_keys == {} and not s.ohgo_api_key
