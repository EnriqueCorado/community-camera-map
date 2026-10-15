"""sync_catalog: the static catalog follows the registry without a re-bake."""

from __future__ import annotations

from app.layers.service import COVERAGES, LAYERS, Layer, View, sync_catalog

VIEW = View("https://x.example/FeatureServer/0", {"NAME": "name"}, "point", min_zoom=8)


def test_adds_new_layers_drops_removed_and_keeps_counts():
    old = [
        {"name": "a", "title": "Old A", "available": True, "count": 7, "source": "src A"},
        {"name": "gone", "title": "Removed", "available": True},
    ]
    reg = [
        Layer(name="a", title="New A", description="d", category="point"),
        Layer(name="b", title="B", description="d", category="point", view=VIEW),
        Layer(name="c", title="C", description="d", category="point"),
    ]
    out = sync_catalog(old, reg, {"b": "src B"})
    assert [c["name"] for c in out] == ["a", "b", "c"]
    a, b, c = out
    assert a["title"] == "New A" and a["count"] == 7 and a["source"] == "src A"
    assert b["available"] is True and b["coverage"] == "usa" and b["view"]["url"].endswith("/0")
    assert b["source"] == "src B"
    assert c["available"] is False and c["coverage"] == "stanislaus" and c["view"] is None


def test_a_view_makes_a_layer_available_even_if_its_bake_failed():
    out = sync_catalog(
        [{"name": "b", "available": False}],
        [Layer(name="b", title="B", description="d", category="point", view=VIEW)],
        {},
    )
    assert out[0]["available"] is True


def test_every_registry_coverage_is_known_and_views_are_https_arcgis():
    for layer in LAYERS.values():
        assert layer.catalog_extras()["coverage"] in COVERAGES, layer.name
        if layer.view:
            assert layer.view.url.startswith("https://"), layer.name
            assert layer.view.geometry in ("point", "line", "polygon"), layer.name
            assert layer.view.fields, layer.name


def test_ci_cache_carries_every_hourly_and_daily_layer():
    """Fast CI runs restore hourly/daily layers from the cache: a layer missing
    from the workflow's cache paths silently reverts to its committed copy."""
    import re
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(root / "backend" / "scripts"))
    from refresh_live import DAILY, HOURLY

    workflow = (root / ".github/workflows/pages.yml").read_text()
    cached = re.findall(r"frontend/public/data/layers/([\w-]+)\.geojson", workflow)
    for name in (*HOURLY, *DAILY):
        assert cached.count(name) >= 2, f"{name}: add it to both cache path lists in pages.yml"


def test_alpr_tiles_are_cached_between_ci_runs():
    from pathlib import Path

    workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/pages.yml").read_text()
    assert workflow.count("frontend/public/data/alpr\n") == 2  # restore + save
