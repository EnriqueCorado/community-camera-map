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
    payload = {
        "data": [
            {
                "cms": {
                    "location": {"latitude": "37.6", "longitude": "-121.0"},
                    "message": {"display": "Blank"},
                }
            }
        ]
    }
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
                    "closure": {"typeOfClosure": "Full", "code1097": {"isCode1097": "true"}},
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
    payload = {
        "data": [
            {"lcs": {"location": {"begin": begin}, "closure": {"code1097": {"isCode1097": "true"}}}}
        ]
    }
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


def _cal_oes(
    source,
    state="CA",
    thumb="https://cameras.alertcalifornia.org/public-camera-data/Axis-Oso/latest-frame.jpg",
    page="https://cameras.alertcalifornia.org/?id=Axis-Oso\n",
    geom=(-121.5, 37.5),
):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": list(geom)} if geom else None,
        "properties": {
            "Source": source,
            "State": state,
            "Location": " Mt. Oso ",
            "County": "stanislaus",
            "Thumbnail_Url": thumb,
            "Webcam_URL": page,
            "Creator_1": "someone",
        },
    }


def test_fire_cameras_keeps_only_california_fire_cams_with_clean_fields():
    fc = {
        "features": [
            _cal_oes("Alert California"),
            _cal_oes("CalTrans"),  # already on the map from the Caltrans feed
            _cal_oes("Alert Wildfire", state="NV"),  # out of state
            _cal_oes(
                "Alert Wildfire",
                state="California",
                thumb="http://api.nvseismolab.org/camera/Axis-X",
                page="https://alertwildfire.org/?currentFirecam=ca-x-1",
            ),
            _cal_oes("Alert California", geom=None),
        ]
    }
    out = transforms.fire_cameras(fc)["features"]
    assert len(out) == 2
    a, w = (f["properties"] for f in out)
    assert a == {
        "name": "Mt. Oso",
        "network": "ALERTCalifornia",
        "county": "Stanislaus",
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
        {
            "camId": "CA_Good",
            "stateAbrv": "CA",
            "lat": "38.1",
            "lng": "-121.6",
            "camName": "Good",
            "smallDir": s3 + "CA_Good/",
            "newestImageDT": "2026-10-14T21:30:04.000Z",
            "nwisId": "123",
        },
        {"camId": "CA_Hidden", "stateAbrv": "CA", "lat": "38", "lng": "-121", "hideCam": True},
        {"camId": "IL_Other", "stateAbrv": "IL", "lat": "39", "lng": "-89"},
        {"camId": "CA_bad/../id", "stateAbrv": "CA", "lat": "38", "lng": "-121"},
        {"camId": "CA_NoCoords", "stateAbrv": "CA", "lat": "", "lng": None},
        {
            "camId": "CA_OddHost",
            "stateAbrv": "CA",
            "lat": "38",
            "lng": "-121",
            "smallDir": "https://evil.example/",
        },
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
    fc = {
        "features": [
            "not a feature",
            {
                "geometry": {"type": "Point", "coordinates": [1]},
                "properties": {"Source": "Alert California", "State": "CA"},
            },
            _cal_oes("Alert California", geom=("NaN", 37)),
            _cal_oes("Alert California", geom=(-121, "inf")),
            _cal_oes("Alert California"),
        ]
    }
    assert len(transforms.fire_cameras(fc)["features"]) == 1
    rows = [
        {"camId": "..", "stateAbrv": "CA", "lat": "38", "lng": "-121"},
        {"camId": "CA_Nan", "stateAbrv": "CA", "lat": "nan", "lng": "-121"},
    ]
    assert transforms.usgs_cameras(rows)["features"] == []


async def test_arcgis_error_payload_raises_instead_of_returning_empty():
    import httpx

    from app.layers import arcgis

    def handler(request):
        return httpx.Response(
            200, json={"error": {"code": 400, "message": "Invalid or missing input parameters."}}
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(arcgis.ArcGISError):
            await arcgis.fetch_layer(
                client, "https://example.test/arcgis/rest/services/x/MapServer/28"
            )


# ---------- Caltrans road weather / chain controls / lane closures ----------


def test_caltrans_json_repairs_missing_commas_between_repeated_keys():
    broken = b'{"data": [{"a": {"x": "1"} "a": {"x": "2"}}]}'
    assert transforms.parse_caltrans_json(broken) == {"data": [{"a": {"x": "2"}}]}
    assert transforms.parse_caltrans_json(b'{"data": []}') == {"data": []}
    assert transforms.parse_caltrans_json(b"[1, 2]") == {}


def _rwis(temp="227", wind="16", gust="18", rh="23", service="true", lat="37.06"):
    return {
        "rwis": {
            "inService": service,
            "location": {
                "locationName": "SR-152 : San Luis Reservoir",
                "latitude": lat,
                "longitude": "-121.06",
                "elevation": "272",
            },
            "rwisData": {
                "windData": {"essAvgWindSpeed": wind, "essMaxWindGustSpeed": gust},
                "temperatureData": {
                    "essTemperatureSensorTable": [
                        {"essTemperatureSensorEntry": {"essAirTemperature": ""}},
                        {"essTemperatureSensorEntry": {"essAirTemperature": temp}},
                    ]
                },
                "humidityPrecipData": {"essRelativeHumidity": rh},
            },
        }
    }


def test_rwis_converts_ntcip_units_and_treats_sentinels_as_missing():
    p = transforms.caltrans_rwis({"data": [_rwis()]})["features"][0]["properties"]
    assert p["temp_f"] == 73  # 22.7 °C (tenths) -> 72.9 °F
    assert p["wind_mph"] == 4  # 1.6 m/s (tenths) -> 3.6 mph
    assert p["gust_mph"] == 4 and p["humidity"] == 23
    m = transforms.caltrans_rwis({"data": [_rwis(temp="65535", wind="65535", gust="", rh="101")]})
    q = m["features"][0]["properties"]
    assert (
        q["temp_f"] is None
        and q["wind_mph"] is None
        and q["gust_mph"] is None
        and q["humidity"] is None
    )
    assert (
        transforms.caltrans_rwis({"data": [_rwis(service="false"), _rwis(lat="")]})["features"]
        == []
    )


def test_chain_controls_keep_only_known_status_codes():
    def cc(status):
        return {
            "cc": {
                "inService": "true",
                "location": {
                    "locationName": "Bear Valley",
                    "route": "SR-4",
                    "latitude": "38.46",
                    "longitude": "-120.04",
                },
                "statusData": {"status": status, "statusDescription": " Chains required "},
            }
        }

    feats = transforms.caltrans_chain({"data": [cc("R-2"), cc("<script>")]})["features"]
    assert feats[0]["properties"] == {
        "name": "Bear Valley",
        "route": "SR-4",
        "status": "R-2",
        "detail": "Chains required",
    }
    assert feats[1]["properties"]["status"] == ""


def _lcs(start, end, c1097="false", c1098="false", indefinite="false"):
    return {
        "lcs": {
            "location": {
                "begin": {"beginLongitude": "-121", "beginLatitude": "37.6", "beginRoute": "SR-99"},
                "end": {"endLongitude": "-121.01", "endLatitude": "37.61"},
            },
            "closure": {
                "closureTimestamp": {
                    "closureStartEpoch": str(start),
                    "closureEndEpoch": str(end),
                    "isClosureEndIndefinite": indefinite,
                },
                "typeOfClosure": "Lane",
                "typeOfWork": "Paving",
                "lanesClosed": "2",
                "code1097": {"isCode1097": c1097},
                "code1098": {"isCode1098": c1098},
            },
        }
    }


def test_lane_closures_only_in_effect_now():
    now = 1_000_000
    rows = [
        _lcs(now - 10, now + 10),  # in its window
        _lcs(now + 3600, now + 7200),  # scheduled later: skipped
        _lcs(now + 3600, now + 7200, c1097="true"),  # crew already on scene
        _lcs(now - 10, now + 10, c1098="true"),  # picked up early
        _lcs(now - 99, 0, indefinite="true"),  # open-ended
        _lcs(now - 99, now - 1),  # already over
    ]
    feats = transforms.caltrans_lcs({"data": rows}, now=now)["features"]
    assert len(feats) == 3
    assert feats[0]["properties"] == {
        "route": "SR-99",
        "type": "Lane",
        "work": "Paving",
        "lanes": "2",
    }


async def test_caltrans_loader_survives_some_districts_failing():
    import httpx

    from app.layers.service import _caltrans

    def handler(request):
        if "/d3/" in str(request.url):
            return httpx.Response(500)
        body = b'{"data": [{"cc": {"inService": "true", "location": {"latitude": "38", "longitude": "-120"}, "statusData": {"status": "R-0"}}}]}'
        return httpx.Response(200, content=body)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        fc = await _caltrans("cc", transforms.caltrans_chain)(client, None)
    assert len(fc["features"]) == 11  # 12 districts, one down

    def all_down(request):
        return httpx.Response(500)

    async with httpx.AsyncClient(transport=httpx.MockTransport(all_down)) as client:
        with pytest.raises(httpx.HTTPError):
            await _caltrans("cc", transforms.caltrans_chain)(client, None)


def test_select_props_ships_only_mapped_fields():
    fc = {
        "features": [
            {
                "geometry": {"type": "Point", "coordinates": [0, 0]},
                "properties": {
                    "NAME": "POUST",
                    "MAX_VOLTAG": 115,
                    "PHONE": "555",
                    "Creator": "someone",
                },
            },
            {"geometry": None, "properties": {"NAME": "no geometry"}},
        ]
    }
    out = transforms.select_props(fc, {"NAME": "name", "MAX_VOLTAG": "max_kv"})["features"]
    assert [f["properties"] for f in out] == [{"name": "POUST", "max_kv": 115}]


def test_superfund_extracts_only_the_epa_profile_link():
    def site(profile):
        return {
            "geometry": {"type": "Point", "coordinates": [-120.8, 37.5]},
            "properties": {
                "Site_Name": "Valley Wood Preserving, Inc.",
                "City": "Turlock",
                "Status": "NPL Site",
                "Site_Progress_Profile": profile,
            },
        }

    good = '<a href="https://cumulis.epa.gov/supercpad/cursites/csitinfo.cfm?id=0901490" target="_blank">x</a>'
    bad = '<a href="javascript:alert(1)">x</a>'
    out = transforms.superfund_sites({"features": [site(good), site(bad)]})["features"]
    assert (
        out[0]["properties"]["page"]
        == "https://cumulis.epa.gov/supercpad/cursites/csitinfo.cfm?id=0901490"
    )
    assert out[1]["properties"]["page"] == ""
    assert "_profile" not in out[0]["properties"]


def test_historic_places_keep_only_national_archives_links():
    def place(url):
        return {
            "geometry": {"type": "Point", "coordinates": [-120.9, 37.6]},
            "properties": {
                "RESNAME": "McHenry Mansion",
                "ResType": "building",
                "Address": "906 15th St",
                "City": "Modesto",
                "CertDate": "1978-05-",
                "NARA_URL": url,
                "SRC_COORD": "noise",
            },
        }

    out = transforms.historic_places(
        {
            "features": [
                place("https://catalog.archives.gov/id/123"),
                place("https://evil.example/id/1"),
            ]
        }
    )["features"]
    assert out[0]["properties"] == {
        "name": "McHenry Mansion",
        "kind": "building",
        "address": "906 15th St",
        "city": "Modesto",
        "listed": "1978-05",
        "page": "https://catalog.archives.gov/id/123",
    }
    assert out[1]["properties"]["page"] == ""


def test_historical_markers_upgrade_hmdb_links_to_https_only():
    def m(link):
        return {
            "geometry": {"type": "Point", "coordinates": [-120.4, 37.9]},
            "properties": {"Title": "Chinese Camp", "Year_Erected": 1949, "Link": link},
        }

    out = transforms.historical_markers(
        {"features": [m("http://www.hmdb.org/m.asp?m=906"), m("http://evil.example/?m=1")]}
    )["features"]
    assert out[0]["properties"]["page"] == "https://www.hmdb.org/m.asp?m=906"
    assert out[1]["properties"]["page"] == ""


def test_historical_markers_strip_markup_from_text():
    f = {
        "geometry": {"type": "Point", "coordinates": [-121, 37.6]},
        "properties": {
            "Title": "Graffiti Cruise Route",
            "Add_l_Subtitle": '<i>"The Modesto music scene"</i> &amp; more',
            "Link": "",
        },
    }
    p = transforms.historical_markers({"features": [f]})["features"][0]["properties"]
    assert p["subtitle"] == '"The Modesto music scene" & more'


def test_voting_locations_expire_after_the_election():
    import datetime as dt

    payload = {
        "election": "2026-11-03",
        "locations": [
            {"kind": "vote-center", "name": "A", "lat": 37.6, "lon": -121.0, "hours": "x"},
            {"kind": "bogus", "name": "B", "lat": 37.6, "lon": -121.0},
            {"kind": "drop-box", "name": "C"},  # not geocoded
        ],
    }
    live = transforms.voting_locations(payload, today=dt.date(2026, 11, 3))
    assert [f["properties"]["name"] for f in live["features"]] == ["A"]
    assert transforms.voting_locations(payload, today=dt.date(2026, 11, 4))["features"] == []
    assert transforms.voting_locations({"election": "garbage"})["features"] == []


def test_outage_types_fold_into_three():
    fc = {
        "features": [
            {"geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"OutageType": t}}
            for t in ("Not Planned", "Planned", "Planned maintenance", "Unplanned", "Unknown", None)
        ]
    }
    got = [f["properties"]["type"] for f in transforms.power_outages(fc)["features"]]
    assert got == ["unplanned", "planned", "planned", "unplanned", "unknown", "unknown"]


def test_num_strips_thousands_separators_but_rejects_nan():
    assert transforms._num("1,655,887") == 1655887.0
    assert transforms._num(float("nan")) is None
    assert transforms._num("") is None


def test_wastewater_takes_the_worst_level_per_county_and_virus():
    states = [{"attributes": {"NAME": "California", "STATE": "06"}}]
    counties = [
        {
            "attributes": {
                "NAME": "Stanislaus County",
                "BASENAME": "Stanislaus",
                "STATE": "06",
                "CENTLAT": "37.56",
                "CENTLON": "-121.0",
            }
        },
        {
            "attributes": {
                "NAME": "Merced County",
                "BASENAME": "Merced",
                "STATE": "06",
                "CENTLAT": "37.19",
                "CENTLON": "-120.7",
            }
        },
    ]
    row = {"state_territory": "California", "week_end": "2026-10-03T00:00:00"}
    rows = [
        {
            **row,
            "site": "1",
            "counties_served": "Stanislaus",
            "pathogen_target": "SARS-CoV-2",
            "site_wval_category": "Low",
        },
        {
            **row,
            "site": "2",
            "counties_served": "Stanislaus, Merced",
            "pathogen_target": "SARS-CoV-2",
            "site_wval_category": "High",
        },
        {
            **row,
            "site": "2",
            "counties_served": "Stanislaus, Merced",
            "pathogen_target": "RSV",
            "site_wval_category": "Very Low",
        },
        {
            **row,
            "site": "3",
            "counties_served": "Nowhere",
            "pathogen_target": "RSV",
            "site_wval_category": "High",
        },
        {
            **row,
            "site": "4",
            "counties_served": "Stanislaus",
            "pathogen_target": "Mpox",
            "site_wval_category": "High",
        },
    ]
    fc = transforms.wastewater_counties(rows, counties, states)
    by = {f["properties"]["county"]: f["properties"] for f in fc["features"]}
    assert set(by) == {"Stanislaus County", "Merced County"}
    assert by["Stanislaus County"] == {
        "county": "Stanislaus County",
        "sites": 2,
        "week": "2026-10-03",
        "covid": "High",
        "flu": "",
        "rsv": "Very Low",
        "worst": "High",
    }
    assert transforms.wastewater_counties(None, None, None)["features"] == []


def test_wastewater_county_names_match_tiger_spellings():
    states = [
        {"attributes": {"NAME": "Missouri", "STATE": "29"}},
        {"attributes": {"NAME": "Illinois", "STATE": "17"}},
        {"attributes": {"NAME": "New Mexico", "STATE": "35"}},
        {"attributes": {"NAME": "Connecticut", "STATE": "09"}},
    ]
    c = lambda st, name, base, lat: {  # noqa: E731
        "attributes": {"STATE": st, "NAME": name, "BASENAME": base, "CENTLAT": lat, "CENTLON": -90}
    }
    counties = [
        c("29", "St. Louis city", "St. Louis", 38.6),
        c("29", "St. Louis County", "St. Louis", 38.7),
        c("29", "Jackson County", "Jackson", 39.0),
        c("29", "Johnson County", "Johnson", 38.7),
        c("17", "DuPage County", "DuPage", 41.8),
        c("35", "Doña Ana County", "Doña Ana", 32.3),
    ]
    row = {"week_end": "2026-10-03", "pathogen_target": "SARS-CoV-2", "site_wval_category": "Low"}
    rows = [
        {**row, "site": "1", "state_territory": "Missouri", "counties_served": "Saint Louis City"},
        {**row, "site": "2", "state_territory": "Missouri", "counties_served": "Saint Louis"},
        {**row, "site": "3", "state_territory": "Illinois", "counties_served": "Du Page"},
        {**row, "site": "4", "state_territory": "New Mexico", "counties_served": "Dona Ana"},
        {**row, "site": "5", "state_territory": "Connecticut", "counties_served": "New Haven"},
        # Kansas City, MO plant listing Kansas counties: skipped, not misplaced.
        {
            **row,
            "site": "6",
            "state_territory": "Missouri",
            "counties_served": "Jackson, Johnson, Wyandotte",
        },
    ]
    names = sorted(
        f["properties"]["county"]
        for f in transforms.wastewater_counties(rows, counties, states)["features"]
    )
    assert names == [
        "Doña Ana County",
        "DuPage County",
        "New Haven County",
        "St. Louis County",
        "St. Louis city",
    ]


def test_wastewater_keeps_each_plants_newest_week():
    states = [{"attributes": {"NAME": "California", "STATE": "06"}}]
    counties = [
        {
            "attributes": {
                "NAME": "Stanislaus County",
                "BASENAME": "Stanislaus",
                "STATE": "06",
                "CENTLAT": 37.5,
                "CENTLON": -121,
            }
        }
    ]
    base = {
        "site": "1",
        "state_territory": "California",
        "counties_served": "Stanislaus",
        "pathogen_target": "RSV",
    }
    rows = [
        {**base, "week_end": "2026-09-19", "site_wval_category": "Very High"},  # older: superseded
        {**base, "week_end": "2026-09-26", "site_wval_category": "Low"},
    ]
    p = transforms.wastewater_counties(rows, counties, states)["features"][0]["properties"]
    assert p["rsv"] == "Low" and p["week"] == "2026-09-26"
