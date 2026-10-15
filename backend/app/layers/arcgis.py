"""Fetch an ArcGIS FeatureServer layer as GeoJSON, following pagination.

ArcGIS caps a query at `maxRecordCount` (2000 for the Stanislaus org), so we
page with `resultOffset` until a short page comes back. Everything is returned
in WGS84 (`outSR=4326`) so it drops straight onto MapLibre.
"""

from __future__ import annotations

import json
import logging
from urllib.parse import urlencode

import httpx

from ..core.http import fetch_capped

logger = logging.getLogger(__name__)


class ArcGISError(httpx.HTTPError):
    """The server answered 200 with an ArcGIS error payload instead of data."""


PAGE = 2000
# ArcGIS editor-tracking fields name the staff who edited a record. The map never
# needs them, and they can contain a person's work login — strip before serving.
EDITOR_FIELDS = frozenset(
    {
        "created_user",
        "created_date",
        "last_edited_user",
        "last_edited_date",
        "edited_user",
        "edited_date",
        "Creator",
        "CreationDate",
        "Editor",
        "EditDate",
    }
)
MAX_PAGES = 50  # safety bound (100k features at PAGE=2000) against offset-ignoring servers
MAX_BYTES = 48 * 1024 * 1024


async def fetch_layer(
    client: httpx.AsyncClient,
    service_url: str,
    *,
    where: str = "1=1",
    out_fields: str = "*",
    bbox: str | None = None,
    page_size: int = PAGE,
    simplify: float | None = None,
) -> dict:
    """Return a GeoJSON FeatureCollection for an ArcGIS FeatureServer/MapServer
    layer. `bbox` is "xmin,ymin,xmax,ymax" in WGS84 for spatial filtering of
    large statewide/national layers. `page_size` caps records per request (some
    servers 500 on big geometry pages). `simplify` sets maxAllowableOffset
    (degrees) to thin dense polygon geometry — smaller payloads, same shape."""
    features: list[dict] = []
    offset = 0
    for _page in range(MAX_PAGES):  # hard bound: some servers ignore resultOffset
        params = {
            "where": where,
            "outFields": out_fields,
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": page_size,
        }
        if bbox is not None:
            params["geometry"] = bbox
            params["geometryType"] = "esriGeometryEnvelope"
            params["inSR"] = "4326"
            params["spatialRel"] = "esriSpatialRelIntersects"
        if simplify is not None:
            params["maxAllowableOffset"] = simplify
        query = urlencode(params)
        body, _ = await fetch_capped(client, f"{service_url}/query?{query}", max_bytes=MAX_BYTES)
        page = json.loads(body)
        # ArcGIS reports failures as HTTP 200 + {"error": {...}}. Treating that as
        # "no features" would silently blank a layer (and a bake would ship it).
        if not isinstance(page, dict) or "error" in page:
            err = page.get("error") if isinstance(page, dict) else None
            code = err.get("code", "?") if isinstance(err, dict) else "?"
            raise ArcGISError(f"ArcGIS error {code}")
        batch = page.get("features", [])
        for feature in batch:
            props = feature.get("properties")
            if isinstance(props, dict):
                for field in EDITOR_FIELDS & props.keys():
                    del props[field]
        features.extend(batch)
        # Use ArcGIS's authoritative "more rows exist" flag rather than guessing
        # from page length (a server whose maxRecordCount < page_size returns a
        # full-but-short page). Advance by what actually came back.
        exceeded = page.get("exceededTransferLimit") or page.get("properties", {}).get(
            "exceededTransferLimit"
        )
        if not batch or not exceeded:
            break
        offset += len(batch)
    logger.info("ArcGIS %s -> %d features", service_url.rsplit("/services/", 1)[-1], len(features))
    return {"type": "FeatureCollection", "features": features}
