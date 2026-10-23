"""Keyless camera feeds added 2026-10-23 for states that had none: MnDOT IRIS
`camera_pub`, City of Austin (Socrata), City of Arlington TX and City of
Lawrence KS (ArcGIS). Each normalizer against a small hand-written fixture
shaped like the live feed. No network."""

from __future__ import annotations

import httpx

from app.cameras import national
from app.cameras.service import CameraService
from app.core.config import Settings

NEW = ("mn", "tx-austin", "tx-arlington", "ks-lawrence")


def _pt(lon, lat, props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


# ---------- MnDOT ----------

MN_IMG = "https://video.dot.state.mn.us/video/image/metro/"


def _mn(name, **kw):
    row = {
        "name": name,
        "publish": True,
        "streamable": True,
        "roadway": "T.H.36",
        "road_dir": "WB",
        "location": "T.H.36 WB @ Cleveland Ave",
        "lat": 45.0103771789102,
        "lon": -93.1860000160346,
        "views": [],
    }
    row.update(kw)
    return row


def test_parse_mn_stills_streams_and_views():
    rows = [
        _mn("C001"),
        # A road-weather site: only ?view=N answers; no HLS even if flagged.
        _mn(
            "C30198",
            streamable=True,
            roadway="I-35",
            road_dir="",
            location="I-35 (Little Chicago - MP 70.0)",
            lat=44.4787,
            lon=-93.2943,
            views=[3, 1, 2, True, "4", 1],
        ),
        _mn("D6-C011", streamable=False, roadway="U.S.169", road_dir="N-S", lat=44.0, lon=-92.5),
        _mn("C027", publish=False),  # unpublished
        _mn("CTEST1"),  # test camera
        _mn("C1/../x"),  # unsafe name
        _mn("C999", lat=None),  # no position
        _mn("C998", publish="true"),  # only a real True counts
        _mn("c001"),  # same slug as C001: kept once
    ]
    a, b, c = national.parse_mn(rows)
    assert (a.id, a.name, a.route, a.direction, a.state, a.source) == (
        "mn-c001",
        "T.H.36 WB @ Cleveland Ave",
        "TH-36",
        "West",
        "MN",
        "mn",
    )
    assert a.snapshot_url == MN_IMG + "C001" and a.views == []
    assert a.stream_url == "https://video.dot.state.mn.us/public/C001.stream/playlist.m3u8"
    assert b.snapshot_url == MN_IMG + "C30198?view=1"
    assert b.views == [MN_IMG + "C30198?view=2", MN_IMG + "C30198?view=3"]
    assert b.stream_url == "" and b.route == "I-35" and b.direction == ""
    assert (c.id, c.route, c.direction, c.stream_url) == ("mn-d6-c011", "US-169", "", "")
    for cam in (a, b, c):
        assert national.snapshot_allowed(cam)
        assert national._safe(cam.stream_url, national.HOSTS["mn"]) == cam.stream_url


# ---------- City of Austin ----------

AUSTIN_IMG = "https://cctv.austinmobility.io/image/{}.jpg"


def _austin(cam_id, **kw):
    row = {
        "camera_id": cam_id,
        "location_name": " LAMAR BLVD / BARTON SPRINGS RD",
        "camera_status": "TURNED_ON",
        "jurisdiction_label": "AUSTIN FULL PURPOSE",
        "primary_st": " LAMAR BLVD",
        "cross_st": " BARTON SPRINGS RD",
        "screenshot_address": AUSTIN_IMG.format(cam_id),
        "location": {"type": "Point", "coordinates": [-97.75589, 30.308735]},
    }
    row.update(kw)
    return row


def test_parse_tx_austin_turned_on_with_screenshot_only():
    rows = [
        _austin("100"),
        _austin(
            "7",
            location_name="",
            jurisdiction_label="WEST LAKE HILLS ETJ",
            primary_st=" US 183",
            cross_st=" ANDERSON MILL RD",
        ),
        _austin("8", camera_status="DESIRED"),
        _austin("9", camera_status="REMOVED"),
        _austin("10", screenshot_address="http://cctv.austinmobility.io/image/10.jpg"),
        _austin("11", screenshot_address="https://cctv.austinmobility.io.evil.example/x.jpg"),
        _austin("12", location=None),
        _austin("../13"),
    ]
    a, b = national.parse_tx_austin(rows)
    assert (a.id, a.name, a.nearby_place, a.state, a.source) == (
        "tx-austin-100",
        "LAMAR BLVD / BARTON SPRINGS RD",
        "Austin",
        "TX",
        "tx-austin",
    )
    assert (a.latitude, a.longitude) == (30.308735, -97.75589)
    assert a.snapshot_url == AUSTIN_IMG.format(100) and a.stream_url == ""
    # No location name: built from the streets; outside the city: no place.
    assert (b.name, b.nearby_place, b.route) == ("US 183 / ANDERSON MILL RD", "", "US-183")


# ---------- City of Arlington, TX ----------

ARL_IMG = "https://webapps.arlingtontx.gov/webcams/{}"


def test_parse_tx_arlington_ids_from_file_names_and_status():
    fc = {
        "features": [
            _pt(
                -97.107116,
                32.735661,
                {
                    "ObjectId": 1,
                    "Camera_Location": "Abram & Center",
                    "Status": "Online",
                    "Pic_URL": ARL_IMG.format("Abram_Center.jpg"),
                },
            ),
            _pt(
                -97.09,
                32.75,
                {
                    "ObjectId": 2,
                    "Camera_Location": "I-30 & Collins",
                    "Status": "Offline",
                    "Thumb_URL": ARL_IMG.format("I30-Collins.jpg"),
                },
            ),
            _pt(
                -97.1,
                32.7,
                {"Status": "Online (Entertainment)", "Pic_URL": ARL_IMG.format("AT&T.jpg")},
            ),
            _pt(-97.1, 32.7, {"Status": "Retired", "Pic_URL": ARL_IMG.format("Old.jpg")}),
            _pt(
                -97.1,
                32.7,
                {"Status": "Online", "Pic_URL": "http://webapps.arlingtontx.gov/webcams/x.jpg"},
            ),
            # The same image listed twice: kept once (the first row).
            _pt(-97.2, 32.8, {"Status": "Online", "Pic_URL": ARL_IMG.format("Abram_Center.jpg")}),
            # Listed offline first, then online: the online row wins.
            _pt(-97.3, 32.6, {"Status": "Offline", "Pic_URL": ARL_IMG.format("Cooper_Park.jpg")}),
            _pt(
                -97.31,
                32.61,
                {
                    "Camera_Location": "Cooper & Park Row",
                    "Status": "Online",
                    # A bad Pic_URL falls back to the thumbnail; raw spaces are encoded.
                    "Pic_URL": "https://evil.example/x.jpg",
                    "Thumb_URL": ARL_IMG.format("Cooper Park.jpg"),
                },
            ),
            _pt(0, 0, {"Status": "Online", "Pic_URL": ARL_IMG.format("y.jpg")}),
        ]
    }
    a, b, c, d = national.parse_tx_arlington(fc)
    assert (a.id, a.name, a.nearby_place, a.in_service, a.state) == (
        "tx-arlington-abram-center",
        "Abram & Center",
        "Arlington",
        True,
        "TX",
    )
    assert (b.id, b.route, b.in_service) == ("tx-arlington-i30-collins", "I-30", False)
    assert b.snapshot_url == ARL_IMG.format("I30-Collins.jpg")
    assert (c.id, c.name, c.in_service) == ("tx-arlington-at-t", "Arlington camera", True)
    assert (d.id, d.name, d.in_service, d.longitude) == (
        "tx-arlington-cooper-park",
        "Cooper & Park Row",
        True,
        -97.31,
    )
    assert d.snapshot_url == ARL_IMG.format("Cooper%20Park.jpg")


# ---------- City of Lawrence, KS ----------

LAW_IMG = "https://assets.lawrenceks.gov/gis/traffic/"


def test_parse_ks_lawrence_names_from_file_names_and_encodes_paths():
    fc = {
        "features": [
            _pt(
                -95.235046,
                38.977688,
                {
                    "FacilityID": "DE-1000",
                    "Status": 8,
                    "Direction": "N",
                    "Hyperlink": LAW_IMG + "GEN_2nd%20&%20Locust.jpeg",
                },
            ),
            # Raw spaces and an apostrophe in the file name.
            _pt(
                -95.25,
                38.94,
                {
                    "FacilityID": "DE-10010",
                    "Status": 8,
                    "Direction": "NE",
                    "Hyperlink": LAW_IMG + "GEN_23rd & O'Connell.jpeg",
                },
            ),
            _pt(-95.2, 38.9, {"FacilityID": "DE-2", "Status": 4, "Hyperlink": LAW_IMG + "a.jpeg"}),
            _pt(-95.2, 38.9, {"FacilityID": "DE-3", "Status": 8, "Hyperlink": None}),
            _pt(
                -95.2,
                38.9,
                {"FacilityID": "DE-4", "Status": 8, "Hyperlink": "https://evil.example/a.jpeg"},
            ),
            _pt(-95.2, 38.9, {"FacilityID": "../5", "Status": 8, "Hyperlink": LAW_IMG + "b.jpeg"}),
            _pt(
                -95.2, 38.9, {"FacilityID": "DE-6", "Status": "8", "Hyperlink": LAW_IMG + "c.jpeg"}
            ),
            # DE_1000 slugs like DE-1000: kept once.
            _pt(
                -95.2, 38.9, {"FacilityID": "DE_1000", "Status": 8, "Hyperlink": LAW_IMG + "d.jpeg"}
            ),
        ]
    }
    a, b = national.parse_ks_lawrence(fc)
    assert (a.id, a.name, a.nearby_place, a.county, a.direction, a.state) == (
        "ks-lawrence-de-1000",
        "2nd & Locust",
        "Lawrence",
        "Douglas",
        "North",
        "KS",
    )
    assert a.snapshot_url == LAW_IMG + "GEN_2nd%20&%20Locust.jpeg"
    assert (b.name, b.direction) == ("23rd & O'Connell", "")
    assert b.snapshot_url == LAW_IMG + "GEN_23rd%20&%20O'Connell.jpeg"
    assert national.snapshot_allowed(a) and national.snapshot_allowed(b)


# ---------- wiring ----------


def test_new_sources_are_wired_and_credited():
    for key in NEW:
        s = national.SOURCES[key]
        assert key in national.FETCHERS and national.HOSTS[key] and key in national.YIELDING_SOURCES
        assert s.state and s.credit and s.license and s.license_url.startswith("https://")
    assert national.SOURCES["tx-austin"].license == "Public Domain"


def test_new_sources_give_way_to_an_earlier_camera_at_the_same_spot():
    cams = [
        *national.parse_mn([_mn("C001")]),
        *national.parse_tx_austin([_austin("1")]),
    ]
    il = cams[0].model_copy(update={"id": "il-1", "source": "il"})
    assert [c.id for c in national.dedupe_by_location([il, *cams])] == ["il-1", "tx-austin-1"]


async def test_service_keeps_new_sources_when_others_fail():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "data.dot.state.mn.us":
            return httpx.Response(200, json=[_mn("C001")])
        if request.url.host == "data.austintexas.gov":
            assert request.url.params["camera_status"] == "TURNED_ON"
            return httpx.Response(200, json=[_austin("100")])
        return httpx.Response(500)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        svc = CameraService(Settings(districts=(10,)), client)
        cams = await svc.list_cameras()
    assert sorted(c.id for c in cams) == ["mn-c001", "tx-austin-100"]
    assert svc.source_counts == {"mn": 1, "tx-austin": 1}
