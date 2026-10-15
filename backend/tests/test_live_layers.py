"""Haze index, flights, Windy and client-side (raster) layers — offline tests."""

from __future__ import annotations

import io
import random

import pytest
from PIL import Image

from app.core.config import Settings
from app.layers import haze, transforms
from app.layers.service import LAYERS, LayerService


def _jpeg(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def _noisy(seed: int = 1, base: int = 120, spread: int = 110) -> bytes:
    rnd = random.Random(seed)
    img = Image.new("RGB", (320, 180))
    img.putdata(
        [tuple(max(0, min(255, base + rnd.randint(-spread, spread))) for _ in range(3)) for _ in range(320 * 180)]
    )
    return _jpeg(img)


# ---------- haze index ----------


def test_flat_washed_out_frame_is_very_hazy():
    level, score = haze.classify(haze.haze_metrics(_jpeg(Image.new("RGB", (320, 180), (170, 172, 175)))))
    assert level == "very-hazy" and score is not None and score < 10


def _bands(dark: int = 40, light: int = 210) -> bytes:
    """Bold light/dark bands: a crisp ridgeline-and-valley stand-in."""
    img = Image.new("RGB", (320, 180))
    img.putdata([(light,) * 3 if (y // 20) % 2 else (dark,) * 3 for y in range(180) for _ in range(320)])
    return _jpeg(img)


def test_high_contrast_frame_is_clear():
    level, score = haze.classify(haze.haze_metrics(_bands()))
    assert level == "clear" and score is not None and score > 70


def test_dark_frame_is_night_with_no_score():
    assert haze.classify(haze.haze_metrics(_noisy(base=15, spread=10))) == ("night", None)


@pytest.mark.parametrize("bad", [b"", b"not an image", _jpeg(Image.new("RGB", (8, 8)))])
def test_unreadable_frames_are_unknown(bad):
    assert haze.classify(haze.haze_metrics(bad)) == ("unknown", None)


@pytest.mark.parametrize(
    ("contrast", "level"),
    [(0.05, "very-hazy"), (0.12, "hazy"), (0.2, "hazy"), (0.3, "slightly-hazy"), (0.35, "clear"), (0.9, "clear")],
)
def test_classify_thresholds(contrast, level):
    lvl, score = haze.classify({"brightness": 120, "contrast": contrast, "saturation": 0.2})
    assert lvl == level and 0 <= score <= 100


def test_pick_cameras_one_per_site_nearest_first_within_radius():
    def cam(name, lon, lat, image="https://cameras.alertcalifornia.org/x.jpg"):
        return {"geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {"name": name, "image": image}}

    fc = {"features": [
        cam("Far", -121.6, 37.64),        # ~54 km
        cam("Near 1", -121.0, 37.65),     # ~1 km
        cam("Near 2", -121.0, 37.65),     # same site: skipped
        cam("Way out", -118.0, 34.0),     # outside radius
        cam("No image", -121.01, 37.64, image=""),
    ]}
    assert [f["properties"]["name"] for f in haze.pick_cameras(fc)] == ["Near 1", "Far"]


# ---------- flights ----------


def test_flights_keep_flight_data_and_drop_owner_and_registration():
    payload = {"aircraft": [
        {"hex": "a8d766", "flight": "N669TW  ", "r": "N669TW", "t": "C172", "desc": "CESSNA 172",
         "ownOp": "SOME OWNER LLC", "year": "2002", "alt_baro": 3500, "gs": 120.3, "track": 248.55,
         "lat": 37.6, "lon": -121.0},
        {"flight": "SWA123", "alt_baro": "ground", "gs": 5, "lat": 37.62, "lon": -120.95},
        {"flight": "NOPOS", "alt_baro": 1000},  # no position: skipped
        "junk",
    ]}
    feats = transforms.adsb_flights(payload)["features"]
    assert len(feats) == 2
    a, g = (f["properties"] for f in feats)
    assert a == {"callsign": "N669TW", "type": "CESSNA 172", "alt_ft": 3500.0, "on_ground": False,
                 "speed_kt": 120, "track": 249}
    assert g["on_ground"] is True and g["alt_ft"] == 0
    assert transforms.adsb_flights(None)["features"] == []


# ---------- Windy ----------


def test_windy_keeps_stable_links_not_expiring_images():
    payload = {"webcams": [
        {"webcamId": 1, "title": "Modesto - Downtown", "status": "active",
         "location": {"city": "Modesto", "latitude": 37.64, "longitude": -120.99},
         "images": {"current": {"preview": "https://imgproxy.windy.com/expiring?token=abc"}},
         "urls": {"detail": "https://www.windy.com/webcams/1"},
         "player": {"day": "https://webcams.windy.com/webcams/public/embed/player/1/day"}},
        {"webcamId": 2, "title": "Inactive", "status": "inactive",
         "location": {"latitude": 37.6, "longitude": -121.0}},
        {"webcamId": 3, "title": "Odd link", "location": {"latitude": 37.6, "longitude": -121.0},
         "urls": {"detail": "https://evil.example/1"}},
    ]}
    feats = transforms.windy_webcams(payload)["features"]
    # "Odd link" has no usable link (and images expire), so it's dropped.
    assert [f["properties"]["name"] for f in feats] == ["Modesto - Downtown"]
    p = feats[0]["properties"]
    assert p["image"] == "" and p["page"] == "https://www.windy.com/webcams/1" and p["network"] == "Windy"


def test_windy_is_unavailable_until_a_key_is_set():
    svc = LayerService(settings=Settings(windy_api_key=""), client=None)  # type: ignore[arg-type]
    assert not svc.is_available(LAYERS["windy-webcams"])
    keyed = LayerService(settings=Settings(windy_api_key="k"), client=None)  # type: ignore[arg-type]
    assert keyed.is_available(LAYERS["windy-webcams"])


# ---------- client-side raster layers ----------


@pytest.mark.parametrize("name", ["rain-radar", "satellite"])
async def test_raster_layers_are_available_but_serve_no_geojson(name):
    svc = LayerService(settings=Settings(), client=None)  # type: ignore[arg-type]
    assert svc.is_available(LAYERS[name])
    with pytest.raises(KeyError):
        await svc.get_bytes(name)


def test_only_jpeg_is_decoded():
    png = io.BytesIO()
    Image.new("RGB", (320, 180), (10, 200, 10)).save(png, "PNG")
    assert haze.haze_metrics(png.getvalue()) is None


def test_oversized_frames_are_refused(monkeypatch):
    monkeypatch.setattr(haze, "MAX_PIXELS", 1000)
    assert haze.haze_metrics(_bands()) is None


def test_flights_exclude_aircraft_that_opted_out_of_tracking():
    base = {"lat": 37.6, "lon": -121.0, "alt_baro": 3000}
    payload = {"aircraft": [
        {**base, "flight": "N304KC", "dbFlags": 8},   # LADD
        {**base, "flight": "PRIV1", "dbFlags": 4},    # PIA
        {**base, "flight": "N1LADD", "dbFlags": 12},  # both
        {**base, "flight": "RCH123", "dbFlags": 1},   # military: broadcast publicly, kept
        {**base, "flight": "SWA123"},
    ]}
    assert [f["properties"]["callsign"] for f in transforms.adsb_flights(payload)["features"]] == ["RCH123", "SWA123"]


def test_flights_keep_missing_values_missing():
    p = transforms.adsb_flights({"aircraft": [{"lat": 37.6, "lon": -121.0}]})["features"][0]["properties"]
    assert p["alt_ft"] is None and p["speed_kt"] is None and p["track"] is None


def test_flight_layer_cache_header_follows_its_ttl():
    from fastapi.testclient import TestClient

    from app.main import app

    class Fake:
        settings = Settings()

        def list_layers(self):
            return list(LAYERS.values())

        async def get_bytes(self, name):
            return b'{"type":"FeatureCollection","features":[]}'

    with TestClient(app) as c:
        app.state.layer_service = Fake()
        assert c.get("/api/layers/flights").headers["cache-control"] == "max-age=15"
        assert c.get("/api/layers/zoning").headers["cache-control"] == "max-age=3600"


def test_windy_drops_caltrans_relists():
    def cam(title, lat, lon):
        return {"title": title, "status": "active", "location": {"latitude": lat, "longitude": lon},
                "urls": {"detail": "https://windy.com/webcams/9"}}
    payload = {"webcams": [
        cam("Modesto › South: 100 - SB SR 99 5th St", 37.63, -121.0),   # Caltrans title pattern
        cam("Some overpass", 37.70, -121.10),                           # within 500 m of a known Caltrans cam
        cam("Mount Hamilton: Lick Observatory", 37.34, -121.64),        # genuinely new
    ]}
    out = transforms.windy_webcams(payload, known=[(37.701, -121.101)])["features"]
    assert [f["properties"]["name"] for f in out] == ["Mount Hamilton: Lick Observatory"]
    assert out[0]["properties"]["page"] == "https://windy.com/webcams/9"


# ---------- FIRMS + browser-live layers ----------

FIRMS_CSV = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
37.5,-120.9,330.1,0.4,0.4,2026-10-13,0942,N,nominal,2.0NRT,290.0,4.65,N
18.2,-70.4,338.7,0.4,0.37,2026-10-13,1813,N,high,2.0NRT,298.2,3.68,D
bad,row,,,,,,,,,,,
"""


def test_firms_keeps_only_california_with_clean_fields():
    from app.layers.service import CALIFORNIA_BBOX

    out = transforms.firms_hotspots(FIRMS_CSV, CALIFORNIA_BBOX)["features"]
    assert len(out) == 1
    assert out[0]["properties"] == {
        "acquired": "2026-10-13T09:42:00Z", "confidence": "nominal", "frp_mw": 4.65, "daynight": "night",
    }


BROWSER_LIVE = ["iss", "satellites", "trains", "wildlife", "wikipedia", "weather-now", "aed", "drinking-water", "restrooms", "ev-chargers"]


@pytest.mark.parametrize("name", BROWSER_LIVE)
async def test_browser_live_layers_are_available_but_serve_no_geojson(name):
    svc = LayerService(settings=Settings(), client=None)  # type: ignore[arg-type]
    assert LAYERS[name].client_side and svc.is_available(LAYERS[name])
    with pytest.raises(KeyError):
        await svc.get_bytes(name)


async def test_failed_upstream_falls_back_to_the_baked_copy(tmp_path, monkeypatch):
    import app.layers.service as svc_mod

    (tmp_path / "zoning.geojson").write_bytes(b'{"type":"FeatureCollection","features":[{"x":1}]}')
    monkeypatch.setattr(svc_mod, "BAKED_LAYERS", tmp_path)

    async def boom(_c, _s):
        raise RuntimeError("upstream down")

    import dataclasses

    monkeypatch.setitem(LAYERS, "zoning", dataclasses.replace(LAYERS["zoning"], loader=boom))
    svc = LayerService(settings=Settings(), client=None)  # type: ignore[arg-type]
    assert b'"x":1' in await svc.get_bytes("zoning")
    # Live-only layers never fall back (their baked file is a placeholder).
    (tmp_path / "flights.geojson").write_bytes(b'{"type":"FeatureCollection","features":[]}')
    monkeypatch.setitem(LAYERS, "flights", dataclasses.replace(LAYERS["flights"], loader=boom))
    with pytest.raises(RuntimeError):
        await svc.get_bytes("flights")


async def test_no_baked_fallback_for_missing_keys_or_when_disabled(tmp_path, monkeypatch):
    import dataclasses

    import app.layers.service as svc_mod
    from app.layers.census import CensusKeyMissing

    (tmp_path / "zoning.geojson").write_bytes(b'{"type":"FeatureCollection","features":[]}')
    (tmp_path / "windy-webcams.geojson").write_bytes(b'{"type":"FeatureCollection","features":[]}')
    monkeypatch.setattr(svc_mod, "BAKED_LAYERS", tmp_path)

    async def boom(_c, _s):
        raise RuntimeError("upstream down")

    async def nokey(_c, _s):
        raise CensusKeyMissing("Set CAM_WINDY_API_KEY")

    monkeypatch.setitem(LAYERS, "zoning", dataclasses.replace(LAYERS["zoning"], loader=boom))
    monkeypatch.setitem(LAYERS, "windy-webcams", dataclasses.replace(LAYERS["windy-webcams"], loader=nokey))
    live = LayerService(settings=Settings(), client=None)  # type: ignore[arg-type]
    with pytest.raises(CensusKeyMissing):
        await live.get_bytes("windy-webcams")
    baking = LayerService(settings=Settings(), client=None, fallback_to_baked=False)  # type: ignore[arg-type]
    with pytest.raises(RuntimeError):
        await baking.get_bytes("zoning")
