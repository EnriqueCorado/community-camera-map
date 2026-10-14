"""Unit tests for the non-GeoJSON upstream normalizers (pure, offline)."""

from __future__ import annotations

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
