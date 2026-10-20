"""The national census_extra pack: self-describing, nationwide, allowlisted."""

from __future__ import annotations

import importlib
import re
from pathlib import Path

import pytest

from app.layers.service import LAYERS  # first: it registers the packs

# The pack imports service; loading it first would register a half-built pack.
PACK = importlib.import_module("app.layers.national.census_extra").LAYERS

ROOT = Path(__file__).resolve().parents[2]
# Properties each browser post produces (frontend/src/view-logic.ts POST).
POST_OUTPUTS = {"place": {"name"}, "bdc": {"name", "pct"}}
# Hidden inputs a post consumes (never shown, so never a metric).
POST_INPUTS = {
    "place": {"_geoid", "_county", "_state"},
    "bdc": {"_geoid", "_county", "_state", "_den", "_served"},
}
GROUPS = {"people", "housing", "civic", "hazards"}


def _view_hosts() -> re.Pattern[str]:
    src = (ROOT / "frontend/src/view-sources.ts").read_text()
    m = re.search(r"const VIEW_HOSTS =\s*/(.+?)/;", src, re.S)
    assert m, "VIEW_HOSTS regex not found"
    return re.compile(m.group(1).replace("\\/", "/"))


def _levels(layer):
    v = layer.view
    return [(v.min_zoom, v.url, v.fields)] + [
        (lv[0], lv[1], lv[2] if len(lv) > 2 else v.fields) for lv in v.levels
    ]


def test_pack_is_registered_and_complete():
    assert len(PACK) >= 24
    for name, layer in PACK.items():
        assert LAYERS[name] is layer
        assert layer.name == name
        assert layer.title_es and layer.title_es != layer.title, name
        assert layer.group in GROUPS, name
        assert layer.coverage == "usa" and layer.catalog_extras()["coverage"] == "usa", name
        assert layer.view and not layer.has_home_copy, name  # view-only: nothing to bake
        assert layer.view.max_features >= 1000, name


@pytest.mark.parametrize("name", sorted(PACK))
def test_metric_field_comes_from_every_level(name):
    layer = PACK[name]
    if layer.metric is None:
        assert layer.category in ("landuse", "point"), name
        return
    assert layer.view.geometry == "polygon"
    produced = POST_OUTPUTS.get(layer.view.post or "", set())
    for _z, _url, fields in _levels(layer):
        assert layer.metric.field in set(fields.values()) | produced, (name, _url)
    assert list(layer.metric.breaks) == sorted(layer.metric.breaks), name
    assert len(layer.metric.breaks) == 5, name


@pytest.mark.parametrize("name", sorted(PACK))
def test_levels_are_coarser_and_https_allowlisted(name):
    hosts = _view_hosts()
    layer = PACK[name]
    zooms = [lv[0] for lv in layer.view.levels]
    assert zooms == sorted(zooms) and all(z < layer.view.min_zoom for z in zooms), name
    for _z, url, fields in _levels(layer):
        assert url.startswith("https://") and hosts.match(url), (name, url)
        assert fields and all(re.fullmatch(r"\w+", k) for k in fields), (name, url)
        post = layer.view.post
        if post:
            assert post in POST_OUTPUTS, (name, post)
            hidden = {v for v in fields.values() if v.startswith("_")}
            assert hidden <= POST_INPUTS[post], (name, hidden)


def test_posts_exist_in_the_frontend():
    src = (ROOT / "frontend/src/view-logic.ts").read_text()
    for post in POST_OUTPUTS:
        assert re.search(rf"^\s*{post}:", src, re.M), post


def test_level_fields_travel_in_the_catalog_only_when_set():
    view = PACK["health-depression"].view.as_json()
    assert view["levels"][0]["fields"] == {
        "CountyName": "_county",
        "StateAbbr": "_state",
        "DEPRESSION_CrudePrev": "pct",
    }
    fcc = PACK["broadband-unserved"].view.as_json()["levels"]
    assert "fields" in fcc[0] and "fields" not in fcc[1]  # counties share the spec's fields


def test_existing_health_layers_read_counties_zoomed_out():
    for name in ("health-asthma", "health-diabetes", "health-uninsured", "food-insecurity"):
        ((z, url, fields),) = LAYERS[name].view.levels
        assert z < LAYERS[name].view.min_zoom and url.endswith("/FeatureServer/2")
        assert "TractFIPS" not in fields and set(fields.values()) == {"county", "pct"}
