"""The nationwide planning / boundaries / land / transportation pack."""

from __future__ import annotations

import re
from pathlib import Path

# service.py first: it registers the packs (importing a pack first is circular)
from app.layers.service import LAYERS as REGISTRY
from app.layers.service import sync_catalog

from app.layers.national import planning  # isort: skip
from app.layers.national.planning import LAYERS, SOURCES, building_permits  # isort: skip

FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "src"
GROUPS = {"planning", "roads", "infra", "nature", "growth"}


def _view_hosts() -> re.Pattern:
    src = (FRONTEND / "view-sources.ts").read_text()
    m = re.search(r"const VIEW_HOSTS =\s*/(.+)/;", src)
    assert m, "VIEW_HOSTS regex not found"
    return re.compile(m.group(1).replace("\\/", "/"))


def test_every_layer_is_self_describing_and_nationwide():
    assert len(LAYERS) >= 25
    for name, lay in LAYERS.items():
        assert lay.name == name
        assert REGISTRY[name] is lay, f"{name} not registered"
        assert lay.title_es and lay.title_es != lay.title, name
        assert lay.group in GROUPS, name
        assert lay.coverage == "usa" and lay.catalog_extras()["coverage"] == "usa", name
        assert SOURCES.get(name), f"{name}: no source line"
        # browser view, raster tiles, or a baked national file: exactly one way in
        assert bool(lay.view) + lay.client_side + bool(lay.loader) == 1, name


def test_views_query_allowlisted_https_hosts_with_explicit_fields():
    hosts = _view_hosts()
    posts = set(re.findall(r"^  (\w+): \(p\)", (FRONTEND / "view-logic.ts").read_text(), re.M))
    for name, lay in LAYERS.items():
        v = lay.view
        if not v:
            continue
        assert v.url.startswith("https://") and hosts.match(v.url), f"{name}: {v.url}"
        assert v.fields and "*" not in v.fields, name  # never outFields=*
        assert all(k and to for k, to in v.fields.items()), name
        assert v.geometry in ("point", "line", "polygon"), name
        assert 4 <= v.min_zoom <= 14, name
        assert v.max_features <= 4000, name
        assert v.post is None or v.post in posts, f"{name}: POST {v.post!r} missing"
        if lay.metric:
            assert lay.metric.field in v.fields.values(), name


def test_no_baked_copy_for_view_layers():
    for name, lay in LAYERS.items():
        if lay.view or lay.client_side:
            assert not lay.has_home_copy, name
    (c,) = sync_catalog([], [LAYERS["traffic-counts"]], SOURCES)
    assert c["available"] is True and c["view"]["baked"] is False
    assert c["metric"]["ramp"] == "traffic" and c["group"] == "roads"


def test_raster_layers_have_tiles_in_the_frontend():
    src = (FRONTEND / "components" / "MapView.tsx").read_text()
    for name, lay in LAYERS.items():
        if lay.client_side:
            assert lay.category == "raster", name
            assert f'name === "{name}"' in src, f"{name}: no rasterSource branch"


HEAD = (
    "Survey,State,6-Digit,County,Census Place,FIPS Place,FIPS MCD,Pop,CSA,CBSA,Footnote,"
    "Central,Zip,Region,Division,Number of,Place,,1-unit,,,2-units,,,3-4 units,,,5+ units\n"
    "Date,Code,ID,Code,Code,Code,Code,  ,Code,Code,Code,City,Code,Code,Code,Months Rep,Name,"
    "Bldgs,Units,Value\n \n"
)


def _row(st, county, place, mcd, name, u1, u2, u34, u5):
    lead = f"2025,{st},000000,{county},0000,{place} ,{mcd} ,1000 ,999,99999, , ,95354 ,4,9,12"
    return f"{lead},{name},{u1},{u1},0,{u2 // 2},{u2},0,1,{u34},0,3,{u5},0\n"


PINS = {
    "place": {"0648354": (37.64, -121.0)},
    "mcd": {"3400300300": (40.9, -74.1)},
    "county": {"06099": (37.56, -120.99)},
}


def test_building_permits_pins_place_then_township_then_county():
    text = HEAD + "".join(
        [
            _row("06", "099", "48354", "00000", "Modesto", 208, 4, 0, 300),
            _row("34", "003", "00000", "00000", "Allendale", 5, 0, 0, 0),  # no pin at all
            _row("34", "003", "99990", "00000", "Unknown Twp", 0, 0, 0, 0),  # no homes
            _row("06", "099", "99990", "00000", "Stanislaus County", 40, 0, 0, 0),
        ]
    )
    pins = {**PINS, "mcd": {}}
    feats = building_permits(text, pins)
    assert [f["properties"]["name"] for f in feats] == ["Modesto", "Stanislaus County"]
    modesto = feats[0]
    assert modesto["geometry"]["coordinates"] == [-121.0, 37.64]
    assert modesto["properties"] == {
        "name": "Modesto",
        "stage": "permitted",
        "units": 512,
        "units_1": 208,
        "units_2_4": 4,
        "units_5plus": 300,
        "year": 2025,
    }
    assert feats[1]["geometry"]["coordinates"] == [-120.99, 37.56]


def test_building_permits_uses_the_township_when_there_is_no_place():
    text = HEAD + _row("34", "003", "00000", "00300", "Allendale Twp", 2, 0, 0, 0)
    (f,) = building_permits(text, PINS)
    assert f["geometry"]["coordinates"] == [-74.1, 40.9]
    assert f["properties"]["units"] == 2


def test_bps_urls_cover_all_four_regions():
    urls = [planning.BPS_URL.format(region=r, abbr=a, year=2025) for r, a in planning.BPS_REGIONS]
    assert all(u.startswith("https://www2.census.gov/econ/bps/Place/") for u in urls)
    assert {u.rsplit("/", 1)[1][:2] for u in urls} == {"we", "mw", "ne", "so"}
