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
