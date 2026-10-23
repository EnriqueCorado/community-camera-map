"""Non-Caltrans camera sources: each normalizer against a small hand-written
fixture (shaped like the real feed, 2026-10-19), plus failure isolation and the
backend/frontend media-host allowlist drift check. No network."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import httpx
import pytest

from app.cameras import national
from app.cameras.national import _safe
from app.cameras.service import CameraService
from app.core.config import Settings

POPUP_LOGIC = Path(__file__).resolve().parents[2] / "frontend/src/popup-logic.ts"
SAMPLE_D10 = (Path(__file__).parent / "d10_sample.json").read_text()


def _pt(lon, lat, props, fid=None):
    f = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }
    if fid is not None:
        f["id"] = fid
    return f


# ---------- URL allowlist ----------


@pytest.mark.parametrize(
    "url",
    [
        "http://images.wsdot.wa.gov/a.jpg",  # not https
        "https://evil.example/a.jpg",
        "https://images.wsdot.wa.gov.evil.example/a.jpg",  # suffix spoof
        "https://notimages.wsdot.wa.gov.example/a.jpg",
        "https://u:p@images.wsdot.wa.gov/a.jpg",
        "https://images.wsdot.wa.gov:8443/a.jpg",
        "https://evil.example\\@images.wsdot.wa.gov/a.jpg",
        "https://images.wsdot.wa.gov/a b.jpg",
        "https://evil.example%2f.images.wsdot.wa.gov/a.jpg",  # %-escape in the host
        "javascript:alert(1)",
        "",
        None,
    ],
)
def test_safe_rejects_off_list_and_ambiguous_urls(url):
    assert _safe(url, ("images.wsdot.wa.gov",)) == ""


def test_safe_normalizes_case_default_port_and_fragment():
    assert (
        _safe("HTTPS://Video.DelDOT.gov:443/live/K1.stream/playlist.m3u8#x", ("video.deldot.gov",))
        == "https://video.deldot.gov/live/K1.stream/playlist.m3u8"
    )
    # Subdomains of an allowlisted host are fine; the query is kept.
    assert (
        _safe("https://sfs01-traveler.modot.mo.gov/a?b=1", ("modot.mo.gov",))
        == "https://sfs01-traveler.modot.mo.gov/a?b=1"
    )


# ---------- ArcGIS / GeoJSON sources ----------


def test_parse_il_ids_county_service_and_hosts():
    fc = {
        "features": [
            _pt(
                -87.91483,
                41.88597,
                {
                    "OBJECTID": 1,
                    "ImgPath": "https://travelmidwest.com/showCamera?id=IL-IDOTD1-IK14B&direction=NONE",
                    "CameraLocation": "Hillside Tower Camera 9",
                    "CameraDirection": "NONE",
                    "SnapShot": "https://cctv.travelmidwest.com/snapshots/IL-IDOTD1_1_Cook_WB_Albin_4188597_-8791483_2_NONE.jpg",
                    "TooOld": "false",
                },
            ),
            _pt(
                -88.0,
                42.3,
                {
                    "OBJECTID": 2,
                    "ImgPath": "https://travelmidwest.com/showCamera?id=LCDOT-7&direction=N",
                    "CameraLocation": "Darrell @ Roberts",
                    "CameraDirection": "N",
                    "SnapShot": "https://www.lakecountypassage.com/snapshots/Darrell_@_Roberts_(Cell)_cctv_North_Leg.jpg",
                    "TooOld": "true",
                },
            ),
            _pt(-88, 42, {"OBJECTID": 3, "SnapShot": "https://evil.example/x.jpg"}),
            {
                "type": "Feature",
                "geometry": None,
                "properties": {"SnapShot": "https://cctv.travelmidwest.com/x.jpg"},
            },
        ]
    }
    a, b = national.parse_il(fc)
    assert (a.id, a.county, a.state, a.source, a.in_service) == (
        "il-idotd1-ik14b",
        "Cook",
        "IL",
        "il",
        True,
    )
    assert (
        a.snapshot_url.startswith("https://cctv.travelmidwest.com/snapshots/")
        and a.stream_url == ""
    )
    assert (b.id, b.direction, b.in_service) == ("il-lcdot-7-n", "North", False)


def test_parse_wa_drops_non_wsdot_hosts():
    fc = {
        "features": [
            _pt(
                -122.66,
                45.66,
                {
                    "OBJECTID": 1003,
                    "CameraTitle": "I-5 at MP 3.2: Main St",
                    "ImageURL": "https://images.wsdot.wa.gov/sw/005vc00320.jpg",
                    "CompassDirection": "B",
                },
            ),
            _pt(
                -122.67,
                45.62,
                {
                    "OBJECTID": 1001,
                    "CameraTitle": "I-5 Bridge",
                    "ImageURL": "https://www.tripcheck.com/RoadCams/cams/x.jpg",
                },
            ),
        ]
    }
    (cam,) = national.parse_wa(fc)
    assert (cam.id, cam.route, cam.direction, cam.state) == ("wa-1003", "I-5", "", "WA")


def test_parse_ky_https_only_and_status():
    fc = {
        "features": [
            _pt(
                -84.46,
                39.05,
                {
                    "id": 428,
                    "status": "Online",
                    "state": "Kentucky",
                    "county": "Campbell",
                    "highway": "I-471",
                    "description": "I-471 NB just N of I-275",
                    "direction": "North",
                    "snapshot": "https://www.trimarc.org/images/milestone/CCTV_06_471_0006.jpg",
                },
            ),
            _pt(
                -85.7,
                38.3,
                {
                    "OBJECTID": 9,
                    "status": None,
                    "state": None,
                    "description": "I-65 at SR 60 Indiana",
                    "snapshot": "https://www.trimarc.org/images/milestone/IND.jpg",
                },
            ),
            _pt(
                -85.7,
                38.4,
                {
                    "id": 5,
                    "status": "Offline",
                    "state": "Kentucky",
                    "description": "x",
                    "snapshot": "https://www.trimarc.org/images/milestone/off.jpg",
                },
            ),
            _pt(
                -85.75,
                38.34,
                {
                    "id": 6,
                    "description": "http only",
                    "snapshot": "http://pws.trafficwise.org/pullover/1.jpg",
                },
            ),
        ]
    }
    a, b, c = national.parse_ky(fc)
    assert (a.id, a.county, a.route, a.direction, a.in_service) == (
        "ky-428",
        "Campbell",
        "I-471",
        "North",
        True,
    )
    assert (b.state, b.in_service) == ("IN", True)
    assert c.in_service is False


def test_parse_sc_snapshot_redirect_target_and_problem_streams():
    base = {"route": "I-77", "direction": "SB", "jurisdiction": "Columbia", "active": True}
    fc = {
        "features": [
            _pt(
                -80.99,
                33.94,
                {
                    **base,
                    "id": "2735",
                    "name": "10002",
                    "description": "I-77 S @ MM 4.9",
                    "image_url": "https://scdotsnap.us-east-1.skyvdn.com/thumbs/10002.flv.png",
                    "https_url": "https://s18.us-east-1.skyvdn.com/rtplive/10002/playlist.m3u8",
                },
            ),
            _pt(
                -80.98,
                33.95,
                {
                    **base,
                    "name": "10003",
                    "problem_stream": True,
                    "image_url": "https://scdotsnap.us-east-1.skyvdn.com/thumbs/10003.flv.png",
                    "https_url": "https://s18.us-east-1.skyvdn.com/rtplive/10003/playlist.m3u8",
                },
            ),
            _pt(
                -80.9,
                33.9,
                {
                    **base,
                    "name": "x",
                    "image_url": "rtmp://s18.us-east-1.skyvdn.com/x",
                    "https_url": "",
                },
            ),
        ]
    }
    a, b = national.parse_sc(fc)
    assert a.snapshot_url == "https://scdotsnap.us-east-1.skyvdn.com/10002.png"
    assert a.stream_url == "https://s18.us-east-1.skyvdn.com/rtplive/10002/playlist.m3u8"
    assert (a.id, a.direction, a.county) == ("sc-10002", "South", "Columbia")
    assert b.stream_url == "" and b.snapshot_url.endswith("/10003.png")


def test_parse_sd_sites_become_one_camera_with_views():
    img = "https://sd.cdn.iteris-atis.com/camera_images/CSDATY/{}/latest.jpg"
    fc = {
        "features": [
            _pt(
                -97.06,
                44.95,
                {
                    "name": "Watertown North",
                    "route": "I-29",
                    "cameras": [
                        {"id": "1", "image": img.format(1)},
                        {"id": "0", "image": img.format(0)},
                        {"id": "2", "image": "https://evil.example/2.jpg"},
                    ],
                },
                fid="CSDATY",
            ),
            _pt(-97, 44, {"name": "No views", "cameras": []}, fid="EMPTY"),
            _pt(-97, 44, {"name": "Bad", "cameras": "nope"}, fid="BAD"),
        ]
    }
    (cam,) = national.parse_sd(fc)
    assert (cam.id, cam.name, cam.route, cam.state) == (
        "sd-csdaty",
        "Watertown North",
        "I-29",
        "SD",
    )
    assert cam.snapshot_url == img.format(0)
    assert cam.views == [img.format(1)]
    # MT's sites use the same shape; its own host only.
    mt = {
        "features": [
            _pt(
                -108.6,
                44.9,
                {
                    "name": "",
                    "description": "US-310 Frannie",
                    "cameras": [
                        {"id": "1", "image": "https://mt.cdn.iteris-atis.com/camera_images/x.jpg"}
                    ],
                },
                fid="6683",
            )
        ]
    }
    (m,) = national.parse_mt(mt)
    assert (m.id, m.name, m.state) == ("mt-6683", "US-310 Frannie", "MT")
    assert national.parse_mt(fc) == []  # SD images aren't on MT's host


# ---------- plain-JSON sources ----------


def test_parse_mo_hls_on_modot_hosts_only():
    rows = [
        {
            "location": "141 AT 21, MM 27.1",
            "x": -90.42,
            "y": 38.46,
            "html": "https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_209/playlist.m3u8",
        },
        {
            "location": "I-29 NB",
            "x": -94.6,
            "y": 39.2,
            "html": "https://traveler.modot.org/tisvc/api/Tms/CameraStream/M029NBC-07-LQ",
        },
        {
            "location": "Ozarks",
            "x": -93.2,
            "y": 37.1,
            "html": "https://s2.ozarkstrafficoneview.com/rtplive/CAM38/playlist.m3u8",
        },
        {
            "location": "port",
            "x": -90.1,
            "y": 38.6,
            "html": "https://sfs07-traveler.modot.mo.gov:443/rtplive/MODOT_CAM_7/playlist.m3u8",
        },
        {
            "location": "no coords",
            "x": None,
            "y": None,
            "html": "https://sfs01-traveler.modot.mo.gov/rtplive/A/playlist.m3u8",
        },
    ]
    a, b = national.parse_mo(rows)
    assert (a.id, a.snapshot_url, a.state) == ("mo-modot-cam-209", "", "MO")
    assert a.stream_url.endswith("/MODOT_CAM_209/playlist.m3u8")
    assert b.stream_url == "https://sfs07-traveler.modot.mo.gov/rtplive/MODOT_CAM_7/playlist.m3u8"


def test_parse_md_builds_hls_and_validates_id_and_host():
    good = {
        "id": "7a00a1dc01250075004d823633235daa",
        "cctvIp": "strmr5.sha.maryland.gov",
        "lat": 39.27,
        "lon": -77.32,
        "description": "I-270 & Old Hundred Rd",
        "name": "x",
        "opStatus": "OK",
        "commMode": "ONLINE",
        "routePrefix": "IS",
        "routeNumber": 270,
        "cameraCategories": ["Wash. DC"],
    }
    payload = {
        "data": [
            good,
            {**good, "id": "9201ff5801f700d700437a45351f0214", "opStatus": "COMM_FAILURE"},
            {**good, "id": "../../etc"},
            {**good, "id": "aaaaaaaaaaaaaaaa", "cctvIp": "10.0.0.1"},
            {**good, "id": "bbbbbbbbbbbbbbbb", "cctvIp": "evil.example/x?"},
        ]
    }
    a, b = national.parse_md(payload)
    assert (
        a.stream_url
        == "https://strmr5.sha.maryland.gov/rtplive/7a00a1dc01250075004d823633235daa/playlist.m3u8"
    )
    assert (a.route, a.nearby_place, a.in_service, b.in_service) == (
        "I-270",
        "Wash. DC",
        True,
        False,
    )


def test_parse_de_https_stream_and_status():
    cam = {
        "id": "KCAM001",
        "title": "DE 1 @ MILFORD NECK ROAD",
        "county": "Kent",
        "lat": 38.99,
        "lon": -75.44,
        "enabled": True,
        "status": "Active",
        "urls": {
            "m3u8": "http://video.deldot.gov:1935/live/KCAM001.stream/playlist.m3u8",
            "m3u8s": "https://video.deldot.gov:443/live/KCAM001.stream/playlist.m3u8",
        },
    }
    payload = {
        "videoCameras": [
            cam,
            {**cam, "id": "KCAM002", "status": "Unavailable"},
            {**cam, "id": "KCAM003", "urls": {"m3u8": "http://video.deldot.gov:1935/x.m3u8"}},
        ]
    }
    a, b = national.parse_de(payload)
    assert a.stream_url == "https://video.deldot.gov/live/KCAM001.stream/playlist.m3u8"
    assert (a.id, a.county, a.route, b.in_service) == ("de-kcam001", "Kent", "DE-1", False)


def test_parse_al_public_only_with_snapshot_and_hls():
    cam = {
        "id": 1845,
        "accessLevel": "Public",
        "location": {
            "latitude": 30.535,
            "longitude": -88.239,
            "city": "Mobile",
            "county": "Mobile",
            "displayRouteDesignator": "I-10",
            "displayCrossStreet": "McDonald Rd",
            "direction": "East",
        },
        "playbackUrls": {
            "hls": "https://cdn3.wowza.com/5/abc/mobile-fastly/mob-cam-c095.stream/playlist.m3u8"
        },
        "snapshotImageUrl": "https://api.algotraffic.com/v4/Cameras/1845/snapshot.jpg",
    }
    rows = [
        cam,
        {**cam, "id": 1, "accessLevel": "FirstResponder"},
        {**cam, "id": 2, "location": {}},
    ]
    (a,) = national.parse_al(rows)
    assert (a.id, a.name, a.county, a.nearby_place, a.direction) == (
        "al-1845",
        "I-10 @ McDonald Rd",
        "Mobile",
        "Mobile",
        "East",
    )
    assert a.snapshot_url.startswith("https://api.algotraffic.com/") and a.stream_url.startswith(
        "https://cdn3.wowza.com/"
    )


def test_parse_mi_reads_coords_and_image_out_of_html():
    row = {
        "route": "I-75",
        "county": 'Wayne County <a href="/MiDrive/map?cameras=true&amp;lat=42.491304&amp;lon=-83.04479&zoom=15&id=1129"target="_blank">Go to</a>',
        "location": " @ Mound NB",
        "direction": "Traffic closest to camera is traveling north.",
        "image": '<img alt="x" id="1129Img" src="https://micamerasimages.net/thumbs/semtoc_cam_253.flv.jpg?item=1" height="170"><div>Report</div>',
    }
    rows = [
        row,
        {**row, "image": '<img src="javascript:alert(1)">'},  # not an image host
        {**row, "image": '<img src="https://evil.example/x.jpg">'},
        {**row, "county": "Kent County"},  # no coordinates in the HTML
        {**row, "county": '<a href="?lat=999&lon=-83">x</a>'},  # out of range
        {"route": None, "county": 5, "image": None},
    ]
    (a,) = national.parse_mi(rows)
    assert (a.id, a.name, a.county, a.route, a.direction) == (
        "mi-1129",
        "I-75 @ Mound NB",
        "Wayne",
        "I-75",
        "North",
    )
    assert (a.latitude, a.longitude) == (42.491304, -83.04479)
    assert a.snapshot_url == "https://micamerasimages.net/thumbs/semtoc_cam_253.flv.jpg?item=1"
    assert "<" not in a.name + a.county


def test_parse_avo_recent_non_faa_only():
    now = 1_800_000_000
    cam = {
        "webcamCode": "akutan_aksd",
        "webcamName": "Akutan [AKS]",
        "latitude": 54.11,
        "longitude": -165.69,
        "faaInd": "N",
        "hasImages": "Y",
        "lastImageTimestamp": now - 3600,
        "vName": "Akutan",
        "currentImageUrl": "https://avo-volcview.wr.usgs.gov/ashcam-api/images/webcams/akutan_aksd/current.jpg",
    }
    payload = {
        "webcams": [
            cam,
            {**cam, "webcamCode": "cvo-hood", "latitude": 45.3, "longitude": -121.7},
            {**cam, "webcamCode": "faa1", "faaInd": "Y"},
            {**cam, "webcamCode": "stale", "lastImageTimestamp": now - 30 * 86400},
            {**cam, "webcamCode": "noimg", "currentImageUrl": None},
            {**cam, "webcamCode": "zero", "latitude": 0},
        ]
    }
    a, b = national.parse_avo(payload, now=now)
    assert (a.id, a.state, a.nearby_place) == ("avo-akutan-aksd", "AK", "Akutan")
    assert (b.id, b.state) == ("avo-cvo-hood", "")


def test_parse_ndbc_stable_station_image():
    rows = [
        {
            "id": "41004",
            "name": "EDISTO - 41 NM Southeast of Charleston, SC",
            "lat": 32.5,
            "lng": -79.09,
            "img": "Z.jpg",
        },
        {
            "id": "46026",
            "name": "SAN FRANCISCO - 18NM West of San Francisco, CA",
            "lat": 37.75,
            "lng": -122.83,
        },
        {"id": "../x", "name": "bad id", "lat": 1, "lng": 1},
    ]
    a, b = national.parse_ndbc(rows)
    assert a.snapshot_url == "https://www.ndbc.noaa.gov/buoycam.php?station=41004"
    assert (a.id, a.state, b.state) == ("ndbc-41004", "SC", "CA")
    assert a.name.startswith("Buoy 41004: EDISTO")


@pytest.mark.parametrize("name", [n for n in national.FETCHERS])
def test_every_parser_tolerates_garbage(name):
    parse = getattr(national, f"parse_{name.replace('-', '_')}")
    for junk in (
        None,
        5,
        "x",
        [],
        {},
        [None, 1, "x"],
        {"features": "x", "data": 1, "webcams": None},
    ):
        assert parse(junk) == []


def test_every_source_has_metadata_and_hosts():
    for key in national.FETCHERS:
        assert key in national.SOURCES and national.HOSTS[key]
    il = national.SOURCES["il"]
    assert (
        "Illinois DOT" in il.credit
        and il.license == "CC BY-SA 2.0"
        and il.license_url.startswith("https://")
    )


# ---------- isolation ----------


async def test_fetch_all_isolates_a_failing_source(monkeypatch, caplog):
    async def boom(_client, _max):
        raise httpx.ConnectError("failed for https://example.invalid/?key=secret")

    async def ok(_client, _max):
        return national.parse_ndbc([{"id": "41004", "name": "x", "lat": 32.5, "lng": -79.1}])

    monkeypatch.setattr(national, "FETCHERS", {"il": boom, "ndbc": ok})
    with caplog.at_level(logging.WARNING):
        res = await national.fetch_all(None, max_bytes=1)  # type: ignore[arg-type]
    assert [c.id for c in res.cameras] == ["ndbc-41004"]
    assert (res.counts, res.failed) == ({"ndbc": 1}, ["il"])
    assert (
        "ConnectError" in caplog.text
        and "secret" not in caplog.text
        and "example.invalid" not in caplog.text
    )


async def test_service_merges_caltrans_with_surviving_sources():
    """End to end through CameraService: Caltrans + NDBC answer, every other
    source errors (500 / bad JSON) — the map still gets both."""
    ndbc = json.dumps([{"id": "41004", "name": "EDISTO, SC", "lat": 32.5, "lng": -79.1}])

    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host == "cwwp2.dot.ca.gov":
            return httpx.Response(200, text=SAMPLE_D10)
        if host == "www.ndbc.noaa.gov":
            return httpx.Response(200, text=ndbc)
        if host == "tmc.deldot.gov":
            return httpx.Response(200, text="<html>not json")
        return httpx.Response(500)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        svc = CameraService(Settings(districts=(10,)), client)
        cams = await svc.list_cameras()
    sources = {c.source for c in cams}
    assert sources == {"caltrans", "ndbc"}
    assert cams[0].source == "caltrans"  # Caltrans first, as before
    assert svc.source_counts == {"ndbc": 1}


async def test_service_can_be_caltrans_only():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "cwwp2.dot.ca.gov", "no other source may be fetched"
        return httpx.Response(200, text=SAMPLE_D10)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        svc = CameraService(Settings(districts=(10,), national_cameras=False), client)
        assert {c.source for c in await svc.list_cameras()} == {"caltrans"}


# ---------- frontend allowlist drift ----------


def test_frontend_camera_hosts_mirror_backend():
    src = POPUP_LOGIC.read_text()
    m = re.search(r"CAMERA_MEDIA_HOSTS\s*=\s*\[(.*?)\]", src, re.S)
    assert m, "CAMERA_MEDIA_HOSTS missing from popup-logic.ts"
    frontend = set(re.findall(r'"([^"]+)"', m.group(1)))
    backend = {h for hosts in national.HOSTS.values() for h in hosts} | {"dot.ca.gov"}
    assert frontend == backend
