"""The nationwide hazards / environment / water pack (app/layers/national/hazards.py)."""

from __future__ import annotations

import importlib
import re
from pathlib import Path

from app.layers.service import LAYERS, sync_catalog

# After service.py (which registers the packs): importing a pack first would
# leave the registry without it.
hazards = importlib.import_module("app.layers.national.hazards")

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend" / "src"
GROUPS = {
    "cameras", "live", "civic", "help", "people", "housing", "growth", "weather",
    "hazards", "roads", "places", "nature", "planning", "infra",
}  # fmt: skip
PACK = hazards.LAYERS


def _view_hosts() -> re.Pattern[str]:
    """The browser's VIEW_HOSTS allowlist, read from view-sources.ts."""
    src = (FRONTEND / "view-sources.ts").read_text()
    m = re.search(r"const VIEW_HOSTS =\s*/(.+?)/;", src, re.S)
    assert m, "VIEW_HOSTS regex not found"
    return re.compile(m.group(1))


def test_pack_is_registered_and_self_describing():
    assert len(PACK) >= 25
    for name, layer in PACK.items():
        assert LAYERS[name] is layer, name
        assert layer.title_es and layer.title_es != layer.title, name
        assert layer.group in GROUPS, name
        assert layer.catalog_extras()["coverage"] == "usa", name
        assert hazards.SOURCES.get(name), f"{name}: no attribution"
        assert not layer.has_home_copy, name  # national service only, nothing to bake


def test_views_are_https_on_allowlisted_hosts_with_safe_allowlists():
    hosts = _view_hosts()
    for name, layer in PACK.items():
        if layer.client_side:
            continue
        v = layer.view
        assert v, name
        assert v.url.startswith("https://") and hosts.match(v.url), f"{name}: {v.url}"
        assert all(hosts.match(u) for _, u in v.levels), name
        assert v.geometry in ("point", "line", "polygon"), name
        assert v.fields and "*" not in v.fields, name
        # Privacy: no contact-person fields ever reach the browser.
        for f in v.fields:
            assert not re.search(r"poc|email|phone|contact", f, re.I), f"{name}: {f}"


def test_named_cleanups_exist_in_the_frontend():
    posts = (FRONTEND / "view-posts-hazards.ts").read_text()
    logic = (FRONTEND / "view-logic.ts").read_text()
    assert "...HAZARD_POST" in logic
    for name, layer in PACK.items():
        if layer.view and layer.view.post:
            assert re.search(
                rf"^\s*{layer.view.post}[,:]", posts, re.M
            ), f"{name}: {layer.view.post}"


def test_rasters_have_a_tile_source_and_info_layers_a_popup():
    mapview = (FRONTEND / "components" / "MapView.tsx").read_text()
    raster_block = mapview.split("const HAZARD_RASTERS", 1)[1].split("\n};", 1)[0]
    info_block = mapview.split("const INFO_FIELDS", 1)[1].split("\n};", 1)[0]
    for name, layer in PACK.items():
        if layer.client_side:
            assert layer.category == "raster" and not layer.view, name
            assert f'"{name}"' in raster_block, f"{name}: add it to HAZARD_RASTERS"
        elif layer.category == "info":
            assert re.search(rf'^\s*"?{re.escape(name)}"?: \{{', info_block, re.M), name


def test_metric_layers_color_by_a_field_they_load():
    for name, layer in PACK.items():
        if not layer.metric:
            continue
        derived = {"radon": {"level"}}.get(layer.view.post or "", set())
        assert layer.metric.field in {*layer.view.fields.values(), *derived}, name


def test_existing_national_sources_gained_views_and_kept_their_home_copy():
    for name in ("streamflow", "dams", "shelters"):
        layer = LAYERS[name]
        assert layer.view and layer.has_home_copy, name
        assert layer.catalog_extras()["coverage"] == "usa", name
    (shelters,) = sync_catalog([], [LAYERS["shelters"]], {})
    assert shelters["view"]["baked"] is True
    assert not any(re.search(r"poc|email|phone", f, re.I) for f in LAYERS["shelters"].view.fields)
