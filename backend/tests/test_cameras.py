"""Tests run fully offline against a saved copy of the Caltrans feed."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.cameras import caltrans
from app.cameras.schemas import Camera

SAMPLE = json.loads((Path(__file__).parent / "d10_sample.json").read_text())


def test_parse_feed_returns_cameras():
    cameras = caltrans.parse_feed(SAMPLE)
    assert cameras, "sample feed should yield cameras"
    assert all(isinstance(c, Camera) for c in cameras)


def test_every_camera_has_coords_and_a_source():
    for c in caltrans.parse_feed(SAMPLE):
        assert -90 <= c.latitude <= 90
        assert -180 <= c.longitude <= 180
        assert c.stream_url or c.snapshot_url


def test_ids_are_unique():
    cameras = caltrans.parse_feed(SAMPLE)
    ids = [c.id for c in cameras]
    assert len(ids) == len(set(ids))


def test_name_has_index_prefix_stripped():
    cam = caltrans.normalize(
        {
            "cctv": {
                "index": "247",
                "location": {
                    "locationName": "247 - SB SR-99 @ Briggsmore",
                    "county": "Stanislaus",
                    "route": "SR-99",
                    "latitude": "37.66",
                    "longitude": "-120.99",
                },
                "inService": "true",
                "imageData": {
                    "streamingVideoURL": "https://wzmedia.dot.ca.gov/D10/x.stream/playlist.m3u8",
                    "static": {"currentImageURL": "https://cwwp2.dot.ca.gov/data/d10/cctv/x.jpg"},
                },
            }
        }
    )
    assert cam is not None
    assert cam.name == "SB SR-99 @ Briggsmore"
    assert cam.county == "Stanislaus"


def test_media_url_on_untrusted_host_is_dropped():
    # A tampered feed pointing at a non-Caltrans host yields no usable camera.
    assert (
        caltrans.normalize(
            {
                "cctv": {
                    "index": "9",
                    "location": {
                        "locationName": "9 - x",
                        "county": "Stanislaus",
                        "latitude": "37.6",
                        "longitude": "-121.0",
                    },
                    "imageData": {
                        "streamingVideoURL": "https://169.254.169.254/latest/meta-data",
                        "static": {"currentImageURL": "http://evil.example/x.jpg"},
                    },
                }
            }
        )
        is None
    )


def test_record_without_coords_is_dropped():
    assert (
        caltrans.normalize({"cctv": {"index": "1", "location": {}, "imageData": {"static": {}}}})
        is None
    )


@pytest.mark.parametrize("county", ["Stanislaus"])
def test_sample_contains_target_county(county):
    counties = {c.county for c in caltrans.parse_feed(SAMPLE)}
    assert county in counties


@pytest.mark.parametrize(
    ("district", "expected"),
    [
        (1, "https://cwwp2.dot.ca.gov/data/d1/cctv/cctvStatusD01.json"),
        (9, "https://cwwp2.dot.ca.gov/data/d9/cctv/cctvStatusD09.json"),
        (10, "https://cwwp2.dot.ca.gov/data/d10/cctv/cctvStatusD10.json"),
        (12, "https://cwwp2.dot.ca.gov/data/d12/cctv/cctvStatusD12.json"),
    ],
)
def test_feed_url_padding_convention(district, expected):
    # Directory is un-padded (d1..d12); filename is always zero-padded (D01..D12).
    template = "https://cwwp2.dot.ca.gov/data/d{dir}/cctv/cctvStatusD{num}.json"
    assert caltrans.feed_url(template, district) == expected
