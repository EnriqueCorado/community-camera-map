"""Caltrans CCTV feed client and normalizer (one feed per district).

Responsibilities, kept narrow:
  - fetch the raw JSON feed over HTTP
  - parse/normalize each record into our public `Camera` model
  - drop records that aren't usable (missing coords, or no media URL on an
    allowed host)

Out-of-service cameras are *kept* and flagged (`in_service=False`); filtering by
service status is the caller's job (see `service.py`). Likewise, which counties
we keep, caching, and HTTP wiring all live elsewhere, so this module stays a
pure, testable transform.
"""

from __future__ import annotations

import json
import logging
import re
from urllib.parse import urlsplit

import httpx

from ..core.http import fetch_capped
from .schemas import Camera

logger = logging.getLogger(__name__)

_slug_re = re.compile(r"[^a-z0-9]+")

# Media URLs come from an upstream feed, so we only trust ones on Caltrans
# hosts. This bounds the snapshot proxy to known image/stream origins (a
# defense-in-depth guard against a tampered feed pointing us at internal hosts).
_ALLOWED_HOST_SUFFIX = ".dot.ca.gov"


def _safe_media_url(raw: str | None) -> str:
    """Return the URL only if it is http(s) on an allowed Caltrans host."""
    url = (raw or "").strip()
    if not url:
        return ""
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https"):
        return ""
    host = (parsed.hostname or "").lower()
    if host == "dot.ca.gov" or host.endswith(_ALLOWED_HOST_SUFFIX):
        return url
    logger.warning("Dropping media URL on untrusted host: %s", host)
    return ""


def _slugify(value: str) -> str:
    return _slug_re.sub("-", value.lower()).strip("-")


def _clean_name(location_name: str) -> str:
    """Caltrans names look like '247 - SB SR-99 @ Briggsmore'. Drop the index."""
    return re.sub(r"^\s*\d+\s*-\s*", "", location_name).strip()


def normalize(record: dict) -> Camera | None:
    """Convert one raw `cctv` record into a Camera, or None if unusable."""
    cctv = record.get("cctv", record)
    loc = cctv.get("location", {})
    image = cctv.get("imageData") or {}
    static = image.get("static") or {}

    stream_url = _safe_media_url(image.get("streamingVideoURL"))
    snapshot_url = _safe_media_url(static.get("currentImageURL"))
    if not stream_url and not snapshot_url:
        return None

    try:
        lat = float(loc["latitude"])
        lon = float(loc["longitude"])
    except (KeyError, TypeError, ValueError):
        return None

    index = str(cctv.get("index", "")).strip()
    district = str(loc.get("district", "")).strip()
    route = (loc.get("route") or "").strip()
    name = _clean_name(loc.get("locationName", "")) or f"Camera {index}"
    # Index is unique only within a district, so prefix with the district code to
    # keep ids unique statewide.
    slug = _slugify(f"d{district}-{route}-{index}-{name}")[:90] or f"cam-d{district}-{index}"

    return Camera(
        id=slug,
        name=name,
        county=(loc.get("county") or "").strip(),
        nearby_place=(loc.get("nearbyPlace") or "").strip(),
        route=route,
        direction=(loc.get("direction") or "").strip(),
        latitude=lat,
        longitude=lon,
        snapshot_url=snapshot_url,
        stream_url=stream_url,
        in_service=str(cctv.get("inService", "true")).lower() == "true",
    )


def parse_feed(payload: dict) -> list[Camera]:
    """Normalize a full feed payload into a list of valid cameras."""
    records = payload.get("data", [])
    cameras = [cam for rec in records if (cam := normalize(rec)) is not None]
    logger.info("Parsed %d usable cameras from %d raw records", len(cameras), len(records))
    return cameras


def feed_url(template: str, district: int) -> str:
    """Build a district's feed URL. Directory is un-padded (d1..d12); filename is
    zero-padded (D01..D12) — Caltrans' asymmetric convention."""
    return template.format(dir=district, num=f"{district:02d}")


async def fetch_feed(url: str, *, client: httpx.AsyncClient, max_bytes: int) -> list[Camera]:
    """Fetch and normalize one Caltrans district feed (size-capped)."""
    body, _ = await fetch_capped(client, url, max_bytes=max_bytes)
    return parse_feed(json.loads(body))
