"""Census ACS choropleth: fetch tract demographics and join them to TIGERweb
tract geometry, returning one GeoJSON FeatureCollection.

The ACS API requires a key (since 2026-05-12); it's read from settings and
never leaves the server. TIGERweb geometry is keyless public domain.
"""

from __future__ import annotations

import json
import logging
from urllib.parse import urlencode

import httpx

from ..core.config import Settings
from ..core.http import fetch_capped

logger = logging.getLogger(__name__)

MAX_BYTES = 48 * 1024 * 1024
TIGERWEB = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
    "Tracts_Blocks/MapServer/0/query"
)

# ACS variable -> output property name.
VARS = {
    "B01003_001E": "population",
    "B19013_001E": "median_income",
    "B01002_001E": "median_age",
}


class CensusKeyMissing(RuntimeError):
    """Raised when no ACS API key is configured."""


async def fetch_tracts(client: httpx.AsyncClient, settings: Settings) -> dict:
    if not settings.census_api_key:
        raise CensusKeyMissing(
            "Set CAM_CENSUS_API_KEY (free: https://api.census.gov/data/key_signup.html)"
        )

    acs = await _fetch_acs(client, settings)  # GEOID -> {metrics}
    geo = await _fetch_geometry(client, settings)  # FeatureCollection with GEOID

    kept = []
    for feature in geo.get("features", []):
        geoid = (feature.get("properties") or {}).get("GEOID")
        if not geoid:
            continue
        metrics = acs.get(geoid)
        if not metrics:
            continue
        feature["properties"] = {"geoid": geoid, **metrics}
        kept.append(feature)

    logger.info("Census: joined %d tracts", len(kept))
    return {"type": "FeatureCollection", "features": kept}


async def _fetch_acs(client: httpx.AsyncClient, s: Settings) -> dict[str, dict]:
    query = urlencode(
        {
            "get": "NAME," + ",".join(VARS),
            "for": "tract:*",
            "in": f"state:{s.census_state_fips} county:{s.census_county_fips}",
            "key": s.census_api_key,
        }
    )
    url = f"https://api.census.gov/data/{s.census_acs_year}/acs/acs5?{query}"
    body, _ = await fetch_capped(client, url, max_bytes=MAX_BYTES)
    rows = json.loads(body)
    header, *data = rows
    idx = {name: i for i, name in enumerate(header)}

    def num(v: str | None) -> float | None:
        try:
            f = float(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        return None if f < 0 else f  # ACS uses large negatives as null sentinels

    out: dict[str, dict] = {}
    for row in data:
        geoid = row[idx["state"]] + row[idx["county"]] + row[idx["tract"]]
        metrics = {prop: num(row[idx[var]]) for var, prop in VARS.items()}
        out[geoid] = {"name": row[idx["NAME"]], **metrics}
    return out


async def _fetch_geometry(client: httpx.AsyncClient, s: Settings) -> dict:
    query = urlencode(
        {
            "where": f"STATE='{s.census_state_fips}' AND COUNTY='{s.census_county_fips}'",
            "outFields": "GEOID",
            "outSR": "4326",
            "f": "geojson",
        }
    )
    body, _ = await fetch_capped(client, f"{TIGERWEB}?{query}", max_bytes=MAX_BYTES)
    return json.loads(body)
