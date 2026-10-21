"""Keyless state camera layers added 2026-10-21 (Iowa DOT, FL511 via FDEM,
ODOT TripCheck via Oregon OEM, CDOT): each normalizer against a small
hand-written fixture shaped like the live layer, plus the cross-source
location dedupe. No network."""

from __future__ import annotations

import httpx

from app.cameras import national
from app.cameras.schemas import Camera
from app.cameras.service import CameraService
from app.core.config import Settings


def _pt(lon, lat, props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


IA_IMG = "https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/{}"


def test_parse_ia_groups_views_and_skips_bad_records():
    fc = {
        "features": [
            _pt(
                -91.820917,
                41.687152,
                {
                    "device_id": 59643334,
                    "Desc_": "IC - I-80 @ MM 229.2",
                    "Route": "I-80",
                    "ImageURL": IA_IMG.format("Metro/ictv29hd.jpeg"),
                    "REGION": "Iowa City",
                },
            ),
            # A rest area: two views of one device, at one spot.
            *(
                _pt(
                    -93.9,
                    40.6,
                    {
                        "device_id": 59643469,
                        "Desc_": "Rest Area: I-35 N/S MM 7 - Lamoni",
                        "Route": "IA 2",
                        "ImageURL": IA_IMG.format(f"RestAreas/RA35-{d}.jpg"),
                        "REGION": "RA35DEC02 Rest Area: I-35 N/S MM 7",
                    },
                )
                for d in ("South", "Northeast")
            ),
            _pt(
                -93.6,
                41.6,
                {
                    "device_id": 1,
                    "Desc_": "x",
                    "REGION": "RWIS Cameras",
                    "ImageURL": "http://atmsqf.iowadot.gov/a.jpg",
                },
            ),  # http
            _pt(-93.6, 41.6, {"device_id": 2, "ImageURL": "https://evil.example/a.jpg"}),
            _pt(0, 0, {"device_id": 3, "ImageURL": IA_IMG.format("a.jpg")}),  # no coords
            _pt(-93.6, 41.6, {"device_id": "../x", "ImageURL": IA_IMG.format("b.jpg")}),
        ]
    }
    a, b = national.parse_ia(fc)
    assert (a.id, a.name, a.route, a.nearby_place, a.state, a.source) == (
        "ia-59643334",
        "IC - I-80 @ MM 229.2",
        "I-80",
        "Iowa City",
        "IA",
        "ia",
    )
    assert a.stream_url == "" and a.views == []
    assert (b.id, b.route, b.nearby_place) == ("ia-59643469", "IA-2", "")  # REGION isn't a place
    assert b.snapshot_url == IA_IMG.format("RestAreas/RA35-Northeast.jpg")
    assert b.views == [IA_IMG.format("RestAreas/RA35-South.jpg")]


def test_parse_fl_ids_from_channel_and_fallback_names():
    img = "https://images-dis.divas.cloud/DGI/chan-{}_h.jpg"
    fc = {
        "features": [
            _pt(
                -82.180882,
                29.18658,
                {
                    "ID": "1215",
                    "DESCRIPT": "I-75 @ MM 352 NB",
                    "COUNTY": "Marion",
                    "HIGHWAY": "I-75",
                    "DIRECTION": "N",
                    "IMAGE": img.format(9422),
                },
            ),
            _pt(
                -80.2,
                26.1,
                {
                    "ID": "1215",
                    "DESCRIPT": "[not provided]",
                    "COUNTY": "Broward",
                    "HIGHWAY": "Floridas Turnpike",
                    "DIRECTION": "NOT DIRECTIONAL",
                    "IMAGE": img.format(11773),
                },
            ),
            _pt(
                -80.3,
                26.2,
                {
                    "OBJECTID_1": 7,
                    "HIGHWAY": "SR 417",
                    "IMAGE": "https://snapshots.divas.cloud/DGI/US-98 at SR-281.jpg",
                },
            ),
            _pt(
                -80.3,
                26.2,
                {"OBJECTID_1": 8, "IMAGE": "https://images-dis.divas.cloud.evil.example/x.jpg"},
            ),
        ]
    }
    fc["features"].append(  # the same channel again, elsewhere: kept once, at its first spot
        _pt(-81.0, 28.0, {"DESCRIPT": "dup", "IMAGE": img.format(9422)})
    )
    a, b = national.parse_fl(fc)
    assert (a.id, a.name, a.county, a.route, a.direction, a.state) == (
        "fl-9422",
        "I-75 @ MM 352 NB",
        "Marion",
        "I-75",
        "North",
        "FL",
    )
    assert a.snapshot_url == img.format(9422)
    # The repeated feed ID doesn't collide: the channel number is the id.
    assert (b.id, b.name, b.route, b.direction) == (
        "fl-11773",
        "Floridas Turnpike camera",
        "Floridas Turnpike",
        "",
    )


def test_parse_or_encodes_file_names_and_groups_a_site():
    base = "https://tripcheck.com/RoadCams/cams/"
    fc = {
        "features": [
            _pt(
                -122.99404,
                42.29126,
                {
                    "attributes_title": "OR238 at Jacksonville Hill",
                    "attributes_route": "OR238 ",
                    "attributes_cameraId": 451,
                    "attributes_filename": base + "Jacksonville Hill WB_pid1980.JPG",
                },
            ),
            _pt(
                -122.99404,
                42.29126,
                {
                    "attributes_title": "OR238 at Jacksonville Hill",
                    "attributes_route": "OR238 ",
                    "attributes_cameraId": 450,
                    "attributes_filename": base + "Jacksonville Hill WB_pid1977.JPG",
                },
            ),
            _pt(
                -122.7,
                45.5,
                {
                    "attributes_title": "I-5 at Marquam Bridge (Upper)",
                    "attributes_route": "CNTY  ",
                    "attributes_cameraId": 9,
                    "attributes_filename": "https://www.tripcheck.com/RoadCams/cams/a%20b.jpg",
                },
            ),
            # refused: backslash, a host that only ends in the name, http
            _pt(
                -122.7,
                45.5,
                {
                    "attributes_cameraId": 10,
                    "attributes_filename": "https://evil.example\\@tripcheck.com/x.jpg",
                },
            ),
            _pt(
                -122.7,
                45.5,
                {
                    "attributes_cameraId": 11,
                    "attributes_filename": "https://nottripcheck.com/x.jpg",
                },
            ),
            _pt(
                -122.7,
                45.5,
                {"attributes_cameraId": 12, "attributes_filename": "http://tripcheck.com/x.jpg"},
            ),
        ]
    }
    a, b = national.parse_or(fc)
    assert (a.id, a.name, a.route, a.state) == (
        "or-450",
        "OR238 at Jacksonville Hill",
        "OR-238",
        "OR",
    )
    assert a.snapshot_url == base + "Jacksonville%20Hill%20WB_pid1977.JPG"
    assert a.views == [base + "Jacksonville%20Hill%20WB_pid1980.JPG"]
    # Already-encoded names stay as they are; a county road takes the route from the title.
    assert b.snapshot_url == "https://www.tripcheck.com/RoadCams/cams/a%20b.jpg"
    assert b.route == "I-5"
    # The encoded still passes the snapshot proxy's own-host check unchanged.
    assert national.snapshot_allowed(a)


def test_parse_co_public_views_one_camera_per_site():
    img = "https://cocam.carsprogram.org/Douglas/2_Brdwy-cotrip{}.jpg"
    site = {
        "cpk": 417,
        "name": "Broadway Blvd MP 001.00 NB at Dad Clark Dr",
        "route": "Broadway Blvd",
    }
    fc = {
        "features": [
            _pt(
                -104.986656,
                39.562679,
                {
                    **site,
                    "cvpk": 1013,
                    "view_": "Looking North",
                    "viewurl": img.format("North"),
                    "public_": "TRUE",
                },
            ),
            _pt(
                -104.986656,
                39.562679,
                {
                    **site,
                    "cvpk": 1012,
                    "view_": "Looking South",
                    "viewurl": img.format("South"),
                    "public_": "TRUE",
                },
            ),
            _pt(
                -104.986656,
                39.562679,
                {
                    **site,
                    "cvpk": 1014,
                    "view_": "Looking East",
                    "viewurl": img.format("East"),
                    "public_": "FALSE",
                },
            ),
            _pt(
                -104.83,
                39.03,
                {
                    "cpk": 9,
                    "cvpk": 1,
                    "name": "I-25 (mm156) Gleneagle",
                    "route": "I 25",
                    "view_": "Road Surface",
                    "public_": "TRUE",
                    "viewurl": "https://websvc.coloradosprings.gov/live/TOC/00084_I-25%20%28mm156%29.jpg",
                },
            ),
            _pt(
                -105,
                39.5,
                {"cpk": 10, "cvpk": 2, "public_": "TRUE", "viewurl": "https://cotrip.org/x.jpg"},
            ),
        ]
    }
    a, b = national.parse_co(fc)
    assert (a.id, a.route, a.direction, a.state) == ("co-417", "Broadway Blvd", "South", "CO")
    assert a.snapshot_url == img.format("South") and a.views == [img.format("North")]
    assert img.format("East") not in (a.snapshot_url, *a.views)  # non-public view dropped
    assert (b.id, b.route, b.direction) == ("co-9", "I-25", "")


def _c(source: str, lat: float, lon: float, cid: str) -> Camera:
    return Camera(
        id=cid,
        name=cid,
        county="",
        latitude=lat,
        longitude=lon,
        snapshot_url="x",
        stream_url="",
        source=source,
    )


def test_dedupe_by_location_only_drops_new_sources_over_another_source():
    cams = [
        _c("caltrans", 41.99800, -121.99000, "ca"),
        _c("ga", 33.00001, -84.00002, "ga-1"),
        _c("or", 41.99801, -121.99004, "or-1"),  # same spot as Caltrans: dropped
        _c("fl", 33.00003, -84.00001, "fl-1"),  # same spot as an Iteris camera: dropped
        _c("fl", 27.0, -82.0, "fl-2"),
        _c("fl", 27.0, -82.0, "fl-3"),  # same source, same spot: both kept
        _c("co", 27.0, -82.0, "co-1"),  # a later new source over FL: dropped
        _c("or", 30.0, -85.0, "or-2"),  # under a camera listed after it: still dropped
        _c("il", 30.0, -85.0, "il-1"),  # an established source is never dropped
    ]
    assert [c.id for c in national.dedupe_by_location(cams)] == [
        "ca",
        "ga-1",
        "fl-2",
        "fl-3",
        "il-1",
    ]


async def test_service_dedupes_and_survives_new_sources_failing():
    """Iowa answers; Caltrans, FL, OR, CO and every other source fail, OR
    error out — Iowa still makes it through on its own."""
    ia = {
        "type": "FeatureCollection",
        "features": [
            _pt(-93.6, 41.6, {"device_id": 5, "Desc_": "DSM", "ImageURL": IA_IMG.format("a.jpg")}),
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "cwwp2.dot.ca.gov":
            return httpx.Response(404)
        if "Traffic_Cameras_View" in request.url.path:
            return httpx.Response(200, json=ia)
        return httpx.Response(500)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        svc = CameraService(Settings(districts=(10,)), client)
        cams = await svc.list_cameras()
    assert [c.id for c in cams] == ["ia-5"]
    assert svc.source_counts == {"ia": 1}


def test_route_code_normalizes_and_drops_placeholders():
    assert national._route_code("IA 100") == "IA-100"
    assert national._route_code("i-35w") == "I-35W"
    assert national._route_code("Unknown") == ""
    assert national._route_code("Broadway Blvd") == "Broadway Blvd"


def test_new_sources_have_attribution_and_license():
    for key in national.YIELDING_SOURCES:
        s = national.SOURCES[key]
        assert key in national.FETCHERS and national.HOSTS[key]
        assert s.credit and s.license and s.license_url.startswith("https://")
        assert s.url.startswith("https://")
    assert national.SOURCES["ia"].license == "CC BY 4.0"
