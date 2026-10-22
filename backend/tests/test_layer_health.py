"""The layer health report's offline classification (no network)."""

from __future__ import annotations

import datetime as dt

import pytest

from scripts.layer_health import (
    ORIGIN,
    classify,
    last_edit,
    load_specs,
    needs_attention,
    parse,
    sample_query,
    stale_able,
    summary,
)

NOW = dt.datetime(2026, 10, 22, tzinfo=dt.UTC)
OLD = int(dt.datetime(2021, 1, 5, tzinfo=dt.UTC).timestamp() * 1000)
RECENT = int(dt.datetime(2026, 9, 1, tzinfo=dt.UTC).timestamp() * 1000)


def _spec(**kw) -> dict:
    spec = {
        "name": "ca-food-pantries",
        "state": "CA",
        "title": "Food pantries (Fresno)",
        "group": "help",
        "category": "point",
        "view": {
            "url": "https://x.gov/arcgis/rest/services/A/MapServer/0",
            "fields": {"NAME": "name"},
        },
        "verified": {"bbox": [-120, 36, -119, 37], "features_in_probe": 12},
    }
    spec.update(kw)
    return spec


def _meta(edited: int | None = RECENT, fields=("OBJECTID", "NAME")) -> dict:
    meta = {"fields": [{"name": f} for f in fields]}
    if edited is not None:
        meta["editingInfo"] = {"lastEditDate": edited}
    return meta


GEOJSON = {"type": "FeatureCollection", "features": [{"type": "Feature"}]}


def test_a_working_layer_is_ok():
    assert classify(_spec(), _meta(), GEOJSON, now=NOW) == ("ok", "")
    assert classify(_spec(), _meta(), GEOJSON, now=NOW, acao=ORIGIN)[0] == "ok"


@pytest.mark.parametrize(
    "meta, sample, acao, why",
    [
        ("HTTP 404", GEOJSON, "*", "layer description: HTTP 404"),
        (_meta(fields=("OBJECTID",)), GEOJSON, "*", "fields gone from the layer: NAME"),
        ({}, GEOJSON, "*", "fields gone"),  # a description with no field list
        (_meta(), "ArcGIS error: Invalid query", "*", "sample query: ArcGIS error"),
        (_meta(), {"features": []}, "*", "did not return GeoJSON"),
        (_meta(), GEOJSON, "", "no CORS"),
        (_meta(), GEOJSON, "https://evil.example", "no CORS"),
    ],
)
def test_broken_layers_say_why(meta, sample, acao, why):
    status, detail = classify(_spec(), meta, sample, now=NOW, acao=acao)
    assert status == "broken"
    assert why in detail


def test_empty_only_when_the_verifier_saw_features():
    none = {"type": "FeatureCollection", "features": []}
    status, detail = classify(_spec(), _meta(), none, now=NOW)
    assert status == "empty" and "12" in detail
    # Nothing in the sample area when verified either: a sparse layer, not a fault.
    sparse = _spec(verified={"bbox": [-120, 36, -119, 37], "features_in_probe": 0})
    assert classify(sparse, _meta(), none, now=NOW)[0] == "ok"
    assert classify(_spec(verified={}), _meta(), none, now=NOW)[0] == "ok"
    # Live feeds go quiet: no closures this week is not a fault.
    for kw in ({"group": "live"}, {"category": "roadops"}, {"title": "Active wildfires (Florida)"}):
        assert classify(_spec(**kw), _meta(), none, now=NOW)[0] == "ok"


def test_stale_when_timely_data_is_years_old():
    status, detail = classify(_spec(), _meta(edited=OLD), GEOJSON, now=NOW)
    assert (status, detail) == ("stale", "data last edited 2021-01-05")
    # No edit date reported: can't tell, so not stale.
    assert classify(_spec(), _meta(edited=None), GEOJSON, now=NOW)[0] == "ok"
    # Static boundaries never go stale.
    zoning = _spec(
        name="ca-fresno-zoning", title="Zoning (Fresno)", group="planning", category="landuse"
    )
    assert classify(zoning, _meta(edited=OLD), GEOJSON, now=NOW)[0] == "ok"


def test_data_edit_date_wins_over_schema_edit_date():
    meta = _meta(edited=RECENT)
    meta["editingInfo"]["dataLastEditDate"] = OLD
    assert last_edit(meta) == dt.datetime(2021, 1, 5, tzinfo=dt.UTC)
    assert last_edit({}) is None
    assert last_edit({"editingInfo": {"lastEditDate": None}}) is None
    # A server's junk never crashes the run.
    for junk in (1e20, float("nan"), float("inf"), -5, "2021-01-05"):
        assert last_edit({"editingInfo": {"lastEditDate": junk}}) is None
    assert last_edit({"editingInfo": []}) is None
    assert classify(_spec(), {"fields": 5}, GEOJSON, now=NOW)[0] == "broken"


@pytest.mark.parametrize(
    "kw, expected",
    [
        ({}, True),  # help: places people go change
        ({"group": "roads", "category": "roadops", "title": "Road closures (Cheyenne)"}, True),
        ({"group": "hazards", "category": "hazard", "title": "Active wildfires (Florida)"}, True),
        ({"group": "civic", "category": "point", "title": "Early voting sites (DuPage)"}, False),
        ({"group": "civic", "category": "boundary", "title": "Trash days (Anchorage)"}, False),
        ({"group": "planning", "category": "landuse", "title": "Zoning (Austin)"}, False),
        ({"group": "nature", "category": "park", "title": "State parks"}, False),
        (
            {"group": "hazards", "category": "hazard", "title": "Hurricane evacuation zones (NYC)"},
            False,
        ),
        ({"group": "hazards", "category": "hazard", "title": "Landslide deposits (Oregon)"}, False),
        (
            {
                "group": "roads",
                "category": "roadops",
                "title": "Hurricane evacuation routes (Texas)",
            },
            False,
        ),
        ({"group": "help", "category": "point", "title": "School districts"}, False),
    ],
)
def test_which_layers_can_go_stale(kw, expected):
    assert stale_able(_spec(**kw)) is expected


def test_parse_reads_arcgis_errors_inside_http_200():
    assert (
        parse(200, '{"type": "FeatureCollection", "features": []}')["type"] == "FeatureCollection"
    )
    assert (
        parse(200, '{"error": {"code": 400, "message": "Invalid URL"}}')
        == "ArcGIS error: Invalid URL"
    )
    assert parse(200, '{"error": {"code": 499}}') == "ArcGIS error: 499"
    assert parse(200, "<html>Service unavailable</html>") == "not JSON"
    assert parse(200, "[1, 2]") == "not a JSON object"
    assert parse(403, "{}") == "HTTP 403"


def test_one_bad_run_waits_a_week():
    broken = {"name": "ca-x", "status": "broken"}
    assert needs_attention(broken, None)  # no earlier report: report it now
    assert not needs_attention(broken, {"ca-x": "ok"})
    assert not needs_attention(broken, {})  # new layer
    assert needs_attention(broken, {"ca-x": "empty"})
    assert needs_attention({"name": "ca-x", "status": "stale"}, {"ca-x": "ok"})
    assert not needs_attention({"name": "ca-x", "status": "ok"}, {"ca-x": "broken"})


def _row(name, status, attention, state="CA", detail="x"):
    url = f"https://x.gov/arcgis/rest/services/{name}/MapServer/0"
    return {
        "name": name,
        "state": state,
        "title": name.upper(),
        "url": url,
        "status": status,
        "detail": detail,
        "attention": attention,
    }


def test_summary_groups_by_status_then_state():
    rows = [
        _row("ca-a", "broken", True, detail="HTTP `500`\n@someone [x](https://evil)"),
        _row("tx-b", "broken", True, state="TX"),
        _row("ca-c", "stale", True),
        _row("ca-d", "empty", False),
        _row("ca-e", "ok", False),
    ]
    md = summary(rows, checked="2026-10-22")
    assert md.startswith("Checked 5 state layers on 2026-10-22: 2 broken, 1 empty, 1 stale, 1 ok.")
    assert "**3 need attention**" in md
    assert (
        md.index("## Broken (2)")
        < md.index("### CA (1)")
        < md.index("### TX (1)")
        < md.index("## Stale (1)")
    )
    assert "## Empty" not in md  # ca-d failed once: waiting, names only
    assert "1 failed for the first time" in md and "`ca-d`" in md
    # Server text stays inside one code span on one line.
    assert "`HTTP '500' @someone [x](https://evil)`" in md


def test_summary_fits_in_an_issue():
    rows = [_row(f"ca-layer-{i}", "broken", True, detail="y" * 300) for i in range(2000)]
    md = summary(rows, checked="2026-10-22")
    assert len(md) < 65_536
    assert "cut for length" in md
    # Cut inside the first-time list: the <details> block still closes.
    waiting = [_row(f"ca-layer-{i:05}", "broken", False) for i in range(5000)]
    md = summary(waiting, checked="2026-10-22", max_chars=2000)
    assert len(md) < 2000
    assert md.count("<details>") == md.count("</details>") == 1


def test_summary_says_when_nothing_was_compared():
    md = summary([_row("ca-a", "broken", True)], checked="2026-10-22", compared=False)
    assert "no earlier report to compare with" in md


def test_sample_query_matches_the_map():
    point = _spec()
    point["view"].update(geometry="point", min_zoom=10, where="STATUS='OPEN'")
    q = sample_query(point, [-120, 36, -119, 37])
    assert q["where"] == "STATUS='OPEN'" and q["outFields"] == "NAME"
    assert q["geometry"] == "-120,36,-119,37" and q["f"] == "geojson"
    assert q["resultRecordCount"] == "2000"  # small pages time out on big Esri services
    assert "maxAllowableOffset" not in q
    poly = _spec()
    poly["view"].update(geometry="polygon", min_zoom=10, max_features=500)
    q = sample_query(poly, [-120, 36, -119, 37])
    assert q["resultRecordCount"] == "500"
    assert q["maxAllowableOffset"] == "0.000343"  # (180 / (512 * 2 ** 10)).toPrecision(3)


def test_every_shipped_spec_can_be_probed():
    specs = load_specs()
    assert len(specs) > 1000
    for spec in specs:
        stale_able(spec)  # no KeyError on any real spec
        assert spec["view"]["fields"] and spec["view"]["url"]
