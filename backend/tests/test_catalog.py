"""sync_catalog: the static catalog follows the registry without a re-bake."""

from __future__ import annotations

from app.layers.service import COVERAGES, LAYERS, Layer, View, sync_catalog

# isort: split
from app.layers.national.states import STATES

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
        cov = layer.catalog_extras()["coverage"]
        assert cov in COVERAGES or cov in STATES, layer.name  # or one state (USPS code)
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


def test_self_describing_layers_carry_title_group_metric_and_no_baked_copy():
    from app.layers.service import Metric

    layer = Layer(
        name="m",
        title="M",
        description="d",
        category="census",
        view=View(VIEW.url, {"NAME": "name", "X": "x"}, "polygon", 9, levels=((0, "s"), (5, "c"))),
        title_es="Eme",
        group="people",
        metric=Metric("x", "pct", (1, 2, 3)),
    )
    (c,) = sync_catalog([], [layer], {})
    assert c["title_es"] == "Eme" and c["group"] == "people" and c["available"] is True
    assert c["metric"] == {"field": "x", "fmt": "pct", "breaks": [1, 2, 3], "ramp": "purple"}
    assert c["view"]["baked"] is False  # browser must not ask for a home file
    assert c["view"]["levels"] == [{"min_zoom": 0, "url": "s"}, {"min_zoom": 5, "url": "c"}]


def test_spanish_descriptions_reach_the_catalog():
    """description_es (the "About this layer" panel) flows registry -> catalog;
    a layer without one gets null (the frontend falls back to English)."""
    reg = [
        Layer(
            name="a", title="A", description="Parks.", category="park", description_es="Parques."
        ),
        Layer(name="b", title="B", description="d", category="point"),
    ]
    a, b = sync_catalog([{"name": "a", "available": True}], reg, {})
    assert a["description"] == "Parks." and a["description_es"] == "Parques."
    assert "description_es" in b and b["description_es"] is None
    # real registry layers: a home layer, a national pack layer and a state spec
    out = {c["name"]: c for c in sync_catalog([], list(LAYERS.values()), {})}
    for name in ("hospitals", "census-hispanic", "immigration-legal-help", "ca-lacounty-parcels"):
        es = out[name]["description_es"]
        assert es and es != out[name]["description"], name


def test_every_layer_has_a_spanish_description():
    missing = [n for n, lay in LAYERS.items() if not (lay.description_es or "").strip()]
    assert not missing, f"add description_es to: {missing[:20]}"
    same = [n for n, lay in LAYERS.items() if lay.description_es == lay.description]
    assert not same, f"description_es is just the English text: {same[:20]}"


def test_every_acs_metric_layer_is_nationwide_with_state_and_county_levels():
    acs = [lay for lay in LAYERS.values() if lay.metric and lay.name.startswith("census-")]
    assert len(acs) >= 27
    for lay in acs:
        assert lay.title_es and lay.group in {"people", "housing"}
        assert lay.view and lay.view.url.endswith("/FeatureServer/2")
        assert [u.rsplit("/", 1)[1] for _, u in lay.view.levels] == ["0", "1"]
        assert not lay.has_home_copy
        # computed fields land in "pct"; everything else colors by its own field
        assert lay.metric.field in lay.view.fields.values() or lay.view.post in {"ratio", "sum"}


def test_every_layer_credits_its_source():
    from scripts.bake import SOURCES

    missing = [name for name in LAYERS if not SOURCES.get(name)]
    assert missing == []


def test_workflow_weekly_cache_lists_match_the_weekly_layers():
    # pages.yml restores/saves the weekly files by path: both lists must name
    # exactly the layers refresh_live.py --weekly rewrites.
    import re
    from pathlib import Path

    from scripts.refresh_live import WEEKLY

    yml = (Path(__file__).resolve().parents[2] / ".github/workflows/pages.yml").read_text()
    blocks = re.findall(r"key: services-weekly-v\d+-\$\{\{ github\.run_id \}\}", yml)
    assert len(blocks) == 2
    for part in yml.split("key: services-weekly-")[:2]:
        paths = part.rsplit("path: |", 1)[1]
        names = re.findall(r"layers/([\w-]+)\.geojson", paths)
        assert sorted(names) == sorted(WEEKLY)


def test_every_polygon_view_is_generalized_to_the_zoom():
    # without maxAllowableOffset one US county query was 13 MB instead of ~150 KB
    raw = [
        n
        for n, lay in LAYERS.items()
        if lay.view and lay.view.geometry == "polygon" and not lay.view.simplify
    ]
    assert raw == []


def test_state_pack_frontend_copies_are_in_sync():
    from scripts.sync_state_specs import outputs

    for path, text in outputs().items():
        assert path.read_text() == text, f"run scripts/sync_state_specs.py ({path.name} is stale)"


def test_state_specs_are_validated_strictly(tmp_path):
    import json

    import pytest

    from app.layers.national import states

    good = {
        "name": "tx-parcels", "state": "TX", "title": "Parcels (Texas)", "title_es": "Parcelas (Texas)",
        "description": "d", "group": "planning", "category": "landuse", "source": "TxGIO",
        "view": {"url": "https://example.gov/arcgis/rest/services/P/FeatureServer/0",
                 "fields": {"OWNER_ADDR": "address"}, "geometry": "polygon", "min_zoom": 15},
    }  # fmt: skip
    (tmp_path / "a.json").write_text(json.dumps([good]))
    layers, sources, hosts = states.load(tmp_path)
    lay = layers["tx-parcels"]
    assert lay.coverage == "TX" and lay.view.simplify and lay.group == "planning" and lay.title_es
    assert sources == {"tx-parcels": "TxGIO"} and hosts == {"example.gov"}
    assert lay.description_es is None  # optional in a spec
    (tmp_path / "a.json").write_text(json.dumps([{**good, "description_es": "Lotes."}]))
    assert states.load(tmp_path)[0]["tx-parcels"].description_es == "Lotes."
    bad = [
        {**good, "name": "ok-parcels"},  # prefix must match the state
        {**good, "view": {**good["view"], "url": "http://example.gov/x/FeatureServer/0"}},
        {**good, "view": {**good["view"], "url": "https://example.gov/x/query?f=json"}},
        {**good, "view": {**good["view"], "fields": {"A;DROP": "x"}}},
        {**good, "group": "secret"},
        {**good, "title_es": ""},
        {**good, "description_es": " "},
        {**good, "description_es": 7},
    ]
    for spec in bad:
        (tmp_path / "a.json").write_text(json.dumps([spec]))
        with pytest.raises(states.SpecError):
            states.load(tmp_path)


def test_state_layers_keep_their_state_coverage():
    states = [lay for lay in LAYERS.values() if len(lay.coverage) == 2]
    for lay in states:
        assert lay.catalog_extras()["coverage"] == lay.coverage, lay.name


def test_a_baked_file_makes_a_new_layer_available(tmp_path, monkeypatch):
    import json

    from app.layers import service

    (tmp_path / "fresh.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": [{}, {}]})
    )
    monkeypatch.setattr(service, "BAKED_LAYERS", tmp_path)
    reg = [
        Layer(name="fresh", title="F", description="d", category="point"),
        Layer(name="missing", title="M", description="d", category="point"),
    ]
    fresh, missing = sync_catalog([], reg, {})
    assert fresh["available"] is True and fresh["count"] == 2
    assert missing["available"] is False


def test_shipped_catalog_marks_every_baked_layer_available():
    import json

    from app.layers import service

    cat = json.loads((service.BAKED_LAYERS.parent / "layers.json").read_text())
    off = [
        c["name"]
        for c in cat
        if not c["available"] and (service.BAKED_LAYERS / f"{c['name']}.geojson").is_file()
    ]
    assert off == []


def test_state_zone_styles_color_a_loaded_property():
    from app.layers.national.states import STYLES

    for name, cls in STYLES.items():
        lay = LAYERS[name]  # a style for a removed layer fails here
        assert cls.field in lay.view.fields.values(), name
        assert lay.catalog_extras()["classes"]["items"], name
