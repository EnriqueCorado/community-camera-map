"""Application configuration, loaded from the environment (12-factor).

Every value has a sensible default so the app runs with zero config locally.
Override any field with an env var, e.g. `CAM_FEED_TTL_SECONDS=120`.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CAM_", env_file=".env", extra="ignore")

    # --- Upstream data source (Caltrans public CCTV feeds, one per district) ---
    # Caltrans uses an asymmetric convention: the directory is un-padded (d1..d12)
    # but the filename is always zero-padded (D01..D12). `{dir}` and `{num}` below
    # are filled accordingly (see caltrans.feed_url).
    feed_url_template: str = "https://cwwp2.dot.ca.gov/data/d{dir}/cctv/cctvStatusD{num}.json"
    districts: tuple[int, ...] = tuple(range(1, 13))  # all 12 Caltrans districts
    # Restrict served cameras to these counties. Empty tuple = statewide (all).
    counties: tuple[str, ...] = ()

    # --- Caching ---
    # The upstream feed updates image URLs frequently but the camera *inventory*
    # changes rarely, so a short TTL keeps us fresh without hammering Caltrans.
    feed_ttl_seconds: int = 300
    http_timeout_seconds: float = 15.0

    # Hard caps on upstream response bodies, so a misbehaving/compromised source
    # can't exhaust memory. Generous enough for real data (D12 feed ~1.3 MB; a
    # statewide feed a few MB; camera JPEGs well under 1 MB).
    feed_max_bytes: int = 64 * 1024 * 1024
    snapshot_max_bytes: int = 16 * 1024 * 1024

    # --- CORS: the Vite dev server origin(s) allowed to call this API ---
    cors_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )

    # --- Overlay layers ---
    # Overlays (boundaries, land use, census…) change rarely; cache them long.
    overlay_ttl_seconds: int = 6 * 60 * 60

    # --- Census (ACS 5-year). A free key is required since 2026-05-12.
    # Get one at https://api.census.gov/data/key_signup.html and set
    # CAM_CENSUS_API_KEY in the environment (kept server-side via the proxy).
    census_api_key: str = ""
    census_acs_year: int = 2023
    census_state_fips: str = "06"  # California
    census_county_fips: str = "099"  # Stanislaus

    # --- AirNow air quality (free key: https://docs.airnowapi.org/account/request/).
    # Set CAM_AIRNOW_API_KEY. ZIPs sampled for current observations across the county.
    airnow_api_key: str = ""
    airnow_zips: tuple[str, ...] = ("95354", "95350", "95382", "95307", "95361", "95367")

    # --- Windy Webcams API (free key: https://api.windy.com/keys, "Webcams API").
    # Sent as a header, never in URLs/logs. Used server-side/at bake time only.
    windy_api_key: str = ""

    # --- Future state (documented extension points; not yet wired) ---
    # database_url: str = "sqlite+aiosqlite:///./cams.db"
    # See README "Roadmap" for how the service layer becomes a repository.


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so settings are parsed once per process."""
    return Settings()
