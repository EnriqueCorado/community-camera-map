"""Guards around the nationwide cameras: the snapshot proxy's per-source host
and public-address checks, HTML-entity handling, keys never kept in URLs, the
bake's sanity checks and the compact cameras.json format. No network."""

from __future__ import annotations

import importlib.util
import json
import socket
from pathlib import Path

import httpx
import pytest

from app.cameras import national
from app.cameras.schemas import Camera
from app.cameras.service import CameraService
from app.core.config import Settings

_spec = importlib.util.spec_from_file_location(
    "bake", Path(__file__).resolve().parents[1] / "scripts/bake.py"
)
bake = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bake)  # type: ignore[union-attr]


def _cam(**kw) -> Camera:
    base = dict(
        id="x", name="x", county="", latitude=40.0, longitude=-90.0, snapshot_url="", stream_url=""
    )
    base.update(kw)
    return Camera(**base)


# ---------- snapshot proxy ----------


def test_snapshot_allowed_is_per_source():
    il = "https://cctv.travelmidwest.com/snapshots/a.jpg"
    assert national.snapshot_allowed(_cam(source="il", state="IL", snapshot_url=il))
    # Another source's host is refused even though it's on the combined list.
    assert not national.snapshot_allowed(_cam(source="wa", state="WA", snapshot_url=il))
    assert not national.snapshot_allowed(_cam(source="nope", snapshot_url=il))
    ca = "https://cwwp2.dot.ca.gov/data/d10/cctv/image/x/x.jpg"
    assert national.snapshot_allowed(_cam(snapshot_url=ca))


def _fake_dns(monkeypatch, addr: str):
    async def getaddrinfo(self, host, port, **kw):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (addr, port))]

    monkeypatch.setattr("asyncio.base_events.BaseEventLoop.getaddrinfo", getaddrinfo)


@pytest.mark.parametrize(
    ("addr", "ok"),
    [
        ("93.184.216.34", True),
        ("10.0.0.5", False),
        ("127.0.0.1", False),
        ("169.254.169.254", False),
    ],
)
async def test_resolves_public(monkeypatch, addr, ok):
    _fake_dns(monkeypatch, addr)
    assert await national.resolves_public("cctv.travelmidwest.com") is ok


async def test_proxy_refuses_an_allowlisted_name_pointing_inside(monkeypatch):
    _fake_dns(monkeypatch, "10.1.2.3")
    ndbc = json.dumps([{"id": "41004", "name": "x", "lat": 32.5, "lng": -79.1}])

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "www.ndbc.noaa.gov" and request.url.path == "/buoycams.php":
            return httpx.Response(200, text=ndbc)
        if request.url.host == "www.ndbc.noaa.gov":
            raise AssertionError("the proxy must not fetch an internal address")
        return httpx.Response(500)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        svc = CameraService(Settings(districts=()), client)
        assert await svc.fetch_snapshot("ndbc-41004") is None


# ---------- feed text / keys ----------


def test_text_decodes_entities_before_stripping_tags():
    assert national._text("I-75 &lt;img src=x onerror=alert(1)&gt; @ 8 Mile &amp; M-10") == (
        "I-75 @ 8 Mile & M-10"
    )
    assert "<" not in national._text("a &lt;b") and ">" not in national._text("a&gt;b")


async def test_iteris_drops_any_url_carrying_the_key():
    key = "dummy-test-key-0000"
    sites = [
        {"Id": 1, "Latitude": 36.1, "Longitude": -115.1, "Roadway": "I-15",
         "Views": [{"Id": 1, "Url": f"https://www.nvroads.com/map/Cctv/1?key={key}", "Status": "Enabled"}]},
        {"Id": 2, "Latitude": 36.2, "Longitude": -115.2, "Roadway": "I-15",
         "Views": [{"Id": 2, "Url": "https://www.nvroads.com/map/Cctv/2", "Status": "Enabled"}]},
    ]  # fmt: skip

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=json.dumps(sites))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        res = await national.fetch_all(
            client, max_bytes=1 << 20, iteris_keys={"nv": key}, only=("nv",)
        )
    assert [c.id for c in res.cameras] == ["nv-2"]


# ---------- bake ----------


def test_check_camera_list_guards():
    ca = _cam(id="d10-a", snapshot_url="https://cwwp2.dot.ca.gov/a.jpg")
    il = _cam(
        id="il-a", source="il", state="IL", snapshot_url="https://cctv.travelmidwest.com/a.jpg"
    )
    bake.check_camera_list([ca, il], previous_count=2, secrets=["k"])
    with pytest.raises(bake.CameraBakeError, match="Caltrans"):
        bake.check_camera_list([il], previous_count=0, secrets=[])
    with pytest.raises(bake.CameraBakeError, match="only 2"):
        bake.check_camera_list([ca, il], previous_count=10, secrets=[])
    leaky = _cam(
        id="nv-1", source="nv", state="NV", snapshot_url="https://www.nvroads.com/x?key=sekrit"
    )
    with pytest.raises(bake.CameraBakeError, match="API key"):
        bake.check_camera_list([ca, leaky], previous_count=0, secrets=["sekrit", ""])


def test_compact_camera_drops_defaults_and_keeps_non_default_state():
    ca = _cam(id="d10-a", county="Stanislaus", latitude=37.6543219, longitude=-120.9876543,
              snapshot_url="https://cwwp2.dot.ca.gov/a.jpg")  # fmt: skip
    buoy = _cam(
        id="ndbc-46026", source="ndbc", state="CA", snapshot_url="https://www.ndbc.noaa.gov/b"
    )
    avo = _cam(
        id="avo-x", source="avo", state="", snapshot_url="https://avo-volcview.wr.usgs.gov/c"
    )
    ak = _cam(id="avo-y", source="avo", state="AK", snapshot_url="https://avo-volcview.wr.usgs.gov/d",
              views=["https://avo-volcview.wr.usgs.gov/e"], in_service=False)  # fmt: skip
    assert bake.compact_camera(ca, "CA") == {
        "id": "d10-a", "n": "x", "c": "Stanislaus", "latitude": 37.65432, "longitude": -120.98765,
        "s": "https://cwwp2.dot.ca.gov/a.jpg",
    }  # fmt: skip
    assert bake.compact_camera(buoy, "")["st"] == "CA"  # CA is the schema default, but not NDBC's
    assert "st" not in bake.compact_camera(avo, "")
    a = bake.compact_camera(ak, "")
    assert (a["st"], a["w"], a["i"], a["src"]) == (
        "AK",
        ["https://avo-volcview.wr.usgs.gov/e"],
        False,
        "avo",
    )
