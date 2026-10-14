"""Unit tests for the non-GeoJSON upstream normalizers (pure, offline)."""

from __future__ import annotations

import pytest

from app.layers import transforms


def test_caltrans_cms_builds_points_with_message():
    payload = {
        "data": [
            {
                "cms": {
                    "location": {"latitude": "37.6", "longitude": "-121.0", "locationName": "SB99"},
                    "message": {"phase1": {"phase1Line1": "CRASH", "phase1Line2": "AHEAD"}},
                }
            },
            {"cms": {"location": {"latitude": "", "longitude": ""}}},  # dropped
        ]
    }
    fc = transforms.caltrans_cms(payload)
    assert len(fc["features"]) == 1
    f = fc["features"][0]
    assert f["geometry"]["type"] == "Point"
    assert f["geometry"]["coordinates"] == [-121.0, 37.6]
    assert f["properties"]["message"] == "CRASH AHEAD"


def test_caltrans_cms_blank_message():
    payload = {"data": [{"cms": {"location": {"latitude": "37.6", "longitude": "-121.0"},
                                  "message": {"display": "Blank"}}}]}
    assert transforms.caltrans_cms(payload)["features"][0]["properties"]["message"] == "Blank"


def test_caltrans_lcs_line_from_begin_end():
    payload = {
        "data": [
            {
                "lcs": {
                    "location": {
                        "begin": {
                            "beginLatitude": "37.6",
                            "beginLongitude": "-121.0",
                            "beginRoute": "SR-99",
                        },
                        "end": {"endLatitude": "37.7", "endLongitude": "-121.1"},
                    },
                    "closure": {"typeOfClosure": "Full"},
                }
            }
        ]
    }
    f = transforms.caltrans_lcs(payload)["features"][0]
    assert f["geometry"]["type"] == "LineString"
    assert f["geometry"]["coordinates"] == [[-121.0, 37.6], [-121.1, 37.7]]
    assert f["properties"]["route"] == "SR-99"


def test_caltrans_lcs_point_when_no_end():
    begin = {"beginLatitude": "37.6", "beginLongitude": "-121.0"}
    payload = {"data": [{"lcs": {"location": {"begin": begin}}}]}
    f = transforms.caltrans_lcs(payload)["features"][0]
    assert f["geometry"]["type"] == "Point"


def test_usgs_nwis_merges_params_per_site():
    payload = {
        "value": {
            "timeSeries": [
                {
                    "sourceInfo": {
                        "siteName": "Tuolumne R",
                        "siteCode": [{"value": "11290000"}],
                        "geoLocation": {"geogLocation": {"latitude": 37.63, "longitude": -121.0}},
                    },
                    "variable": {"variableCode": [{"value": "00060"}]},
                    "values": [{"value": [{"value": "1234"}]}],
                },
                {
                    "sourceInfo": {
                        "siteName": "Tuolumne R",
                        "siteCode": [{"value": "11290000"}],
                        "geoLocation": {"geogLocation": {"latitude": 37.63, "longitude": -121.0}},
                    },
                    "variable": {"variableCode": [{"value": "00065"}]},
                    "values": [{"value": [{"value": "5.6"}]}],
                },
            ]
        }
    }
    fc = transforms.usgs_nwis(payload)
    assert len(fc["features"]) == 1
    props = fc["features"][0]["properties"]
    assert props["streamflow_cfs"] == 1234.0
    assert props["gage_height_ft"] == 5.6


def test_nid_dams_accepts_list_and_drops_missing_coords():
    payload = [
        {"name": "Big Dam", "latitude": 37.7, "longitude": -121.0, "hazardPotential": "High"},
        {"name": "No Coords"},
    ]
    fc = transforms.nid_dams(payload)
    assert len(fc["features"]) == 1
    assert fc["features"][0]["properties"]["name"] == "Big Dam"


def test_nid_dams_handles_unexpected_payload():
    assert transforms.nid_dams("oops") == {"type": "FeatureCollection", "features": []}


def test_caltrans_cms_handles_non_dict_payload():
    assert transforms.caltrans_cms([1, 2, 3]) == {"type": "FeatureCollection", "features": []}


def test_usgs_nwis_filters_no_data_sentinel():
    payload = {
        "value": {
            "timeSeries": [
                {
                    "sourceInfo": {
                        "siteName": "Dry Creek",
                        "siteCode": [{"value": "11290000"}],
                        "geoLocation": {"geogLocation": {"latitude": 37.6, "longitude": -121.0}},
                    },
                    "variable": {
                        "variableCode": [{"value": "00060"}],
                        "noDataValue": -999999.0,
                    },
                    "values": [{"value": [{"value": "-999999"}]}],
                }
            ]
        }
    }
    props = transforms.usgs_nwis(payload)["features"][0]["properties"]
    assert props.get("streamflow_cfs") is None


def test_arcgis_strips_editor_fields():
    import asyncio
    import json

    import httpx

    from app.layers import arcgis

    page = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": None,
                "properties": {
                    "GP": "AG",
                    "created_user": "someone@stancounty.com",
                    "last_edited_user": "someone@stancounty.com",
                },
            }
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=json.dumps(page).encode())

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await arcgis.fetch_layer(client, "https://example.invalid/FeatureServer/0")

    props = asyncio.run(run())["features"][0]["properties"]
    assert props == {"GP": "AG"}


# ---------- public webcams ----------


def _cal_oes(source, state="CA", thumb="https://cameras.alertcalifornia.org/public-camera-data/Axis-Oso/latest-frame.jpg",
             page="https://cameras.alertcalifornia.org/?id=Axis-Oso\n", geom=(-121.5, 37.5)):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": list(geom)} if geom else None,
        "properties": {"Source": source, "State": state, "Location": " Mt. Oso ", "County": "stanislaus",
                       "Thumbnail_Url": thumb, "Webcam_URL": page, "Creator_1": "someone"},
    }


def test_fire_cameras_keeps_only_california_fire_cams_with_clean_fields():
    fc = {"features": [
        _cal_oes("Alert California"),
        _cal_oes("CalTrans"),  # already on the map from the Caltrans feed
        _cal_oes("Alert Wildfire", state="NV"),  # out of state
        _cal_oes("Alert Wildfire", state="California", thumb="http://api.nvseismolab.org/camera/Axis-X",
                 page="https://alertwildfire.org/?currentFirecam=ca-x-1"),
        _cal_oes("Alert California", geom=None),
    ]}
    out = transforms.fire_cameras(fc)["features"]
    assert len(out) == 2
    a, w = (f["properties"] for f in out)
    assert a == {
        "name": "Mt. Oso", "network": "ALERTCalifornia", "county": "Stanislaus",
        "image": "https://cameras.alertcalifornia.org/public-camera-data/Axis-Oso/latest-frame.jpg",
        "page": "https://cameras.alertcalifornia.org/?id=Axis-Oso",  # trailing newline stripped
    }
    assert w["network"] == "ALERTWildfire"
    assert w["image"] == ""  # plain-http image would be blocked on an https page
    assert w["page"] == "https://alertwildfire.org/?currentFirecam=ca-x-1"


def test_fire_cameras_drops_urls_on_unexpected_hosts():
    f = _cal_oes("Alert California", thumb="https://evil.example/x.jpg", page="javascript:alert(1)")
    p = transforms.fire_cameras({"features": [f]})["features"][0]["properties"]
    assert p["image"] == "" and p["page"] == ""


def test_fire_cameras_tolerates_garbage():
    assert transforms.fire_cameras(None) == {"type": "FeatureCollection", "features": []}
    assert transforms.fire_cameras({"features": [{}]})["features"] == []


def test_usgs_cameras_ca_only_visible_and_safe_ids():
    s3 = "https://usgs-nims-images.s3.amazonaws.com/720/"
    rows = [
        {"camId": "CA_Good", "stateAbrv": "CA", "lat": "38.1", "lng": "-121.6", "camName": "Good",
         "smallDir": s3 + "CA_Good/", "newestImageDT": "2026-10-14T21:30:04.000Z", "nwisId": "123"},
        {"camId": "CA_Hidden", "stateAbrv": "CA", "lat": "38", "lng": "-121", "hideCam": True},
        {"camId": "IL_Other", "stateAbrv": "IL", "lat": "39", "lng": "-89"},
        {"camId": "CA_bad/../id", "stateAbrv": "CA", "lat": "38", "lng": "-121"},
        {"camId": "CA_NoCoords", "stateAbrv": "CA", "lat": "", "lng": None},
        {"camId": "CA_OddHost", "stateAbrv": "CA", "lat": "38", "lng": "-121", "smallDir": "https://evil.example/"},
    ]
    out = transforms.usgs_cameras(rows)["features"]
    assert [f["properties"]["name"] for f in out] == ["Good", "CA_OddHost"]
    good, odd = (f["properties"] for f in out)
    assert good["image"] == s3 + "CA_Good/CA_Good_newest.jpg"
    assert good["page"] == "https://apps.usgs.gov/hivis/camera/CA_Good"
    assert odd["image"] == ""  # untrusted image host dropped
    assert transforms.usgs_cameras({"not": "a list"})["features"] == []


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.com\\@cameras.alertcalifornia.org/x.jpg",  # browsers read host as evil.com
        "https://u:p@cameras.alertcalifornia.org/x.jpg",
        "https://[::1]@cameras.alertcalifornia.org/",  # urlparse raises on this
        "https://[x/",
        "https://cameras.alertcalifornia.org:8443/x.jpg",
        "https://ca\nmeras.alertcalifornia.org/x.jpg",
        "https://cameras.alertcalifornia.org/x.jpg\x00",
    ],
)
def test_webcam_urls_that_parsers_disagree_on_are_dropped(url):
    f = _cal_oes("Alert California", thumb=url)
    p = transforms.fire_cameras({"features": [f]})["features"][0]["properties"]
    assert p["image"] == ""


def test_webcam_urls_are_normalized():
    f = _cal_oes("Alert California", thumb="HTTPS://Cameras.AlertCalifornia.org/p/x.jpg?a=1#frag")
    p = transforms.fire_cameras({"features": [f]})["features"][0]["properties"]
    assert p["image"] == "https://cameras.alertcalifornia.org/p/x.jpg?a=1"


def test_one_bad_record_never_breaks_the_layer():
    fc = {"features": [
        "not a feature",
        {"geometry": {"type": "Point", "coordinates": [1]}, "properties": {"Source": "Alert California", "State": "CA"}},
        _cal_oes("Alert California", geom=("NaN", 37)),
        _cal_oes("Alert California", geom=(-121, "inf")),
        _cal_oes("Alert California"),
    ]}
    assert len(transforms.fire_cameras(fc)["features"]) == 1
    rows = [{"camId": "..", "stateAbrv": "CA", "lat": "38", "lng": "-121"},
            {"camId": "CA_Nan", "stateAbrv": "CA", "lat": "nan", "lng": "-121"}]
    assert transforms.usgs_cameras(rows)["features"] == []
