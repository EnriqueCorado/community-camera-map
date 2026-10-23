"""HTTP-level tests for the API routes (no network: camera service is faked,
and only file-backed / registry-only layer paths are exercised)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.cameras.schemas import Camera
from app.main import app

CAM = Camera(
    id="d10-sr-99-1-test-cam",
    name="Test Cam",
    county="Stanislaus",
    nearby_place="Modesto",
    route="SR-99",
    direction="North",
    latitude=37.64,
    longitude=-121.0,
    snapshot_url="https://cwwp2.dot.ca.gov/x.jpg",
    stream_url="https://wzmedia.dot.ca.gov/x/playlist.m3u8",
)


class FakeCameraService:
    async def list_cameras(self) -> list[Camera]:
        return [CAM]

    async def get_camera(self, camera_id: str) -> Camera | None:
        return CAM if camera_id == CAM.id else None


@pytest.fixture
def client():
    with TestClient(app) as c:
        app.state.camera_service = FakeCameraService()
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_list_cameras(client):
    r = client.get("/api/cameras")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["cameras"][0]["id"] == CAM.id


def test_get_camera_and_404(client):
    assert client.get(f"/api/cameras/{CAM.id}").status_code == 200
    assert client.get("/api/cameras/does-not-exist").status_code == 404


def test_layer_catalog_shape(client):
    r = client.get("/api/layers")
    assert r.status_code == 200
    layers = {layer["name"]: layer for layer in r.json()}
    assert "alpr" in layers and "census" in layers
    for layer in layers.values():
        assert {"title", "category", "available", "requires_key"} <= layer.keys()
    assert layers["census"]["requires_key"] is True
    # self-describing layers keep their catalog extras through the API model
    hisp = layers["census-hispanic"]
    assert hisp["available"] is True and hisp["group"] == "people" and hisp["title_es"]
    assert hisp["metric"]["field"] == "pct_hispanic" and hisp["view"]["baked"] is False
    assert hisp["description_es"] and hisp["description_es"] != hisp["description"]
    # a national-only layer has no file to serve
    assert client.get("/api/layers/census-hispanic").status_code == 404


def test_unknown_layer_is_404(client):
    assert client.get("/api/layers/not-a-layer").status_code == 404


def test_file_layer_served_as_geojson(client):
    r = client.get("/api/layers/transit-stops")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/geo+json")
    assert r.json()["type"] == "FeatureCollection"


def test_layer_name_cannot_traverse_paths(client):
    # Layer names are registry lookups, never filesystem paths.
    assert client.get("/api/layers/..%2F..%2Fetc%2Fpasswd").status_code == 404


class SnapshotService(FakeCameraService):
    def __init__(self, body: bytes, ctype: str) -> None:
        self._body, self._ctype = body, ctype

    async def fetch_snapshot(self, camera_id: str):
        return (self._body, self._ctype) if camera_id == CAM.id else None


@pytest.mark.parametrize(
    ("upstream_type", "served_type"),
    [
        ("image/jpeg", "image/jpeg"),
        ("image/png; charset=binary", "image/png"),
        ("image/svg+xml", "image/jpeg"),  # SVG can carry script — never pass through
        ("text/html", "image/jpeg"),
    ],
)
def test_snapshot_only_serves_raster_types(client, upstream_type, served_type):
    app.state.camera_service = SnapshotService(b"\x89PNG", upstream_type)
    r = client.get(f"/api/cameras/{CAM.id}/snapshot")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(served_type)
    assert r.headers["x-content-type-options"] == "nosniff"


def test_http_client_loggers_never_log_request_urls():
    # httpx logs full request URLs (incl. API-key query params) at INFO.
    import logging

    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
    assert logging.getLogger("httpcore").getEffectiveLevel() >= logging.WARNING


def test_alpr_access_profiles_served(client):
    r = client.get("/api/layers/alpr/access")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    assert "modesto-pd" in r.json()["profiles"]


def test_layer_times_are_wall_clock(client):
    import time

    from app.layers.service import _Entry

    svc = app.state.layer_service
    svc._cache["quakes"] = _Entry(body=b"{}", fetched_at=time.monotonic() - 120)
    try:
        r = client.get("/api/layers/times")
        assert r.status_code == 200
        assert abs(r.json()["quakes"] - (time.time() - 120)) < 5
    finally:
        svc._cache.pop("quakes", None)


def test_layer_times_report_the_baked_copy_age_not_the_fallback_time(client):
    import time

    from app.layers.service import _Entry

    svc = app.state.layer_service
    svc._cache["quakes"] = _Entry(body=b"{}", fetched_at=time.monotonic(), data_at=1_700_000_000.0)
    svc._cache["alpr"] = _Entry(body=b"{}", fetched_at=time.monotonic(), etag="123")
    try:
        times = client.get("/api/layers/times").json()
        assert times["quakes"] == 1_700_000_000.0
        assert "alpr" not in times  # static file: no "updated X ago"
    finally:
        svc._cache.pop("quakes", None)
        svc._cache.pop("alpr", None)


def test_air_quality_needs_no_key_any_more(client):
    layer = next(c for c in client.get("/api/layers").json() if c["name"] == "air-quality")
    assert layer["requires_key"] is False and layer["available"] is True


def test_computed_layers_without_a_loader_still_serve(client):
    # smoke-haze is built from the camera list, not a registry loader
    from app.layers.service import LAYERS

    assert LAYERS["smoke-haze"].loader is None and not LAYERS["smoke-haze"].view
    assert LAYERS["smoke-haze"].client_side is False
