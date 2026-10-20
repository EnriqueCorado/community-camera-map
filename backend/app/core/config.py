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
    # Also load the other public camera sources (state DOTs, USGS volcano cams,
    # NOAA buoys; see cameras/national.py). CAM_NATIONAL_CAMERAS=false = Caltrans only.
    national_cameras: bool = True

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

    # --- Windy Webcams API (free key: https://api.windy.com/keys, "Webcams API").
    # Sent as a header, never in URLs/logs. Used server-side/at bake time only.
    windy_api_key: str = ""

    # --- Iteris "511" camera APIs (free per-state keys; request one on each
    # site's /developers/doc page). Unset = that state is skipped; a key still
    # pending approval is skipped too (the API answers "Invalid Key"). Keys go in
    # the query string, so they're only ever used server-side / at bake time.
    iteris_key_ga: str = ""
    iteris_key_wi: str = ""
    iteris_key_nv: str = ""
    iteris_key_nc: str = ""
    iteris_key_ut: str = ""
    iteris_key_ak: str = ""
    iteris_key_la: str = ""
    iteris_key_id: str = ""
    iteris_key_az: str = ""

    # OHGO (Ohio DOT) public API key (free: https://publicapi.ohgo.com/). Sent
    # as an Authorization header. Unset = Ohio is skipped.
    ohgo_api_key: str = ""

    @property
    def iteris_keys(self) -> dict[str, str]:
        """{"nv": key, ...} for the states that have a key set."""
        return {
            name.removeprefix("iteris_key_"): value
            for name, value in self.model_dump().items()
            if name.startswith("iteris_key_") and value
        }

    # --- Future state (documented extension points; not yet wired) ---
    # database_url: str = "sqlite+aiosqlite:///./cams.db"
    # See README "Roadmap" for how the service layer becomes a repository.


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so settings are parsed once per process."""
    return Settings()
