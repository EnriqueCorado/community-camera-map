"""Camera service: the single seam between the API and the data source.

Today it reads the Caltrans district feeds plus the other public sources in
`national.py` (state DOTs, USGS, NOAA), all concurrently, with an in-memory
TTL cache. When you add
a database (see README "Roadmap"), this is the one class that changes: give it a
repository, have `_load()` upsert into the DB, and read queries hit the DB
instead of the cache. The router and schemas stay untouched.
"""

from __future__ import annotations

import asyncio
import logging
import time
from urllib.parse import urlsplit

import httpx

from ..core.config import Settings
from ..core.http import fetch_capped
from . import caltrans, national
from .schemas import Camera

logger = logging.getLogger(__name__)


async def _no_others() -> national.Result:
    return national.Result([], {}, [])


class CameraService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._lock = asyncio.Lock()
        self._cache: dict[str, Camera] = {}
        self._fetched_at: float = 0.0
        # Cameras parsed per non-Caltrans source on the last refresh (for the bake log).
        self.source_counts: dict[str, int] = {}

    def _is_fresh(self) -> bool:
        return bool(self._cache) and (
            time.monotonic() - self._fetched_at < self._settings.feed_ttl_seconds
        )

    async def _load(self) -> None:
        """Refresh the cache: fetch every configured district feed and every other
        public source concurrently, merge, and filter to configured counties
        (empty counties = everywhere). Each feed fails on its own."""
        s = self._settings
        urls = [caltrans.feed_url(s.feed_url_template, d) for d in s.districts]
        others = (
            national.fetch_all(
                self._client,
                max_bytes=s.feed_max_bytes,
                iteris_keys=s.iteris_keys,
                ohgo_key=s.ohgo_api_key,
            )
            if s.national_cameras
            else _no_others()
        )
        *results, other = await asyncio.gather(
            *(
                caltrans.fetch_feed(u, client=self._client, max_bytes=s.feed_max_bytes)
                for u in urls
            ),
            others,
            return_exceptions=True,
        )

        cameras: list[Camera] = []
        failed: list[int] = []
        for district, res in zip(s.districts, results, strict=True):
            if isinstance(res, BaseException):
                # Type only: exception text can echo the request URL.
                logger.warning("District %s feed failed: %s", district, type(res).__name__)
                failed.append(district)
            else:
                cameras.extend(res)
        if isinstance(other, BaseException):  # fetch_all isolates sources; belt and braces
            logger.warning("Non-Caltrans camera sources failed: %s", type(other).__name__)
        else:
            cameras.extend(other.cameras)
            self.source_counts = other.counts

        # Counties are a home-county filter: setting CAM_COUNTIES drops every
        # camera without a matching county (most non-Caltrans ones have none).
        wanted = {c.casefold() for c in s.counties}

        def keep(c: Camera) -> bool:
            return c.in_service and (not wanted or c.county.casefold() in wanted)

        # A camera from one of national.YIELDING_SOURCES (the state ArcGIS
        # layers) is dropped where an in-service camera from another source
        # already sits; every other source always stays.
        kept = national.dedupe_by_location([c for c in cameras if keep(c)])

        if not kept:
            if self._cache:  # total failure: keep serving the last good data
                logger.warning("Refresh yielded no cameras; keeping stale cache")
                return
            raise RuntimeError("No cameras available from any district feed")

        self._cache = {c.id: c for c in kept}  # dict keys dedupe by id
        self._fetched_at = time.monotonic()
        logger.info(
            "Loaded %d cameras from %d/%d districts (counties=%s)",
            len(self._cache),
            len(s.districts) - len(failed),
            len(s.districts),
            ", ".join(s.counties) or "ALL",
        )

    async def _ensure_loaded(self) -> None:
        if self._is_fresh():
            return
        async with self._lock:
            # Re-check inside the lock so concurrent requests don't double-fetch.
            if not self._is_fresh():
                await self._load()

    async def list_cameras(self) -> list[Camera]:
        await self._ensure_loaded()
        return sorted(self._cache.values(), key=lambda c: (c.source != "caltrans", c.route, c.name))

    async def get_camera(self, camera_id: str) -> Camera | None:
        await self._ensure_loaded()
        return self._cache.get(camera_id)

    async def fetch_snapshot(self, camera_id: str) -> tuple[bytes, str] | None:
        """Proxy the upstream JPEG. This is the future ML frame-grab hook:
        a worker can call the same path, decode the bytes, and run inference."""
        camera = await self.get_camera(camera_id)
        if camera is None or not camera.snapshot_url:
            return None
        # Re-check at fetch time: only the camera's own source hosts, and only
        # if the name resolves to public addresses.
        if not national.snapshot_allowed(camera) or not await national.resolves_public(
            urlsplit(camera.snapshot_url).hostname or ""
        ):
            logger.warning("Snapshot proxy refused camera %s", camera.id)
            return None
        # follow_redirects=False so a redirect from the (semi-trusted) image host
        # can't bounce the proxy to an off-allowlist internal address; size-capped
        # so an oversized body can't exhaust memory.
        body, content_type = await fetch_capped(
            self._client,
            camera.snapshot_url,
            max_bytes=self._settings.snapshot_max_bytes,
            follow_redirects=False,
        )
        return body, content_type or "image/jpeg"
