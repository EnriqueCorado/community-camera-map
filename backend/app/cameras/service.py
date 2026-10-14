"""Camera service: the single seam between the API and the data source.

Today it reads from the Caltrans feed with an in-memory TTL cache. When you add
a database (see README "Roadmap"), this is the one class that changes: give it a
repository, have `_load()` upsert into the DB, and read queries hit the DB
instead of the cache. The router and schemas stay untouched.
"""

from __future__ import annotations

import asyncio
import logging
import time

import httpx

from ..core.config import Settings
from ..core.http import fetch_capped
from . import caltrans
from .schemas import Camera

logger = logging.getLogger(__name__)


class CameraService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._lock = asyncio.Lock()
        self._cache: dict[str, Camera] = {}
        self._fetched_at: float = 0.0

    def _is_fresh(self) -> bool:
        return bool(self._cache) and (
            time.monotonic() - self._fetched_at < self._settings.feed_ttl_seconds
        )

    async def _load(self) -> None:
        """Refresh the cache: fetch every configured district feed concurrently,
        merge, and filter to configured counties (empty counties = statewide)."""
        s = self._settings
        urls = [caltrans.feed_url(s.feed_url_template, d) for d in s.districts]
        results = await asyncio.gather(
            *(
                caltrans.fetch_feed(u, client=self._client, max_bytes=s.feed_max_bytes)
                for u in urls
            ),
            return_exceptions=True,
        )

        cameras: list[Camera] = []
        failed: list[int] = []
        for district, res in zip(s.districts, results, strict=True):
            if isinstance(res, BaseException):
                logger.warning("District %s feed failed: %s", district, res)
                failed.append(district)
            else:
                cameras.extend(res)

        wanted = {c.casefold() for c in s.counties}

        def keep(c: Camera) -> bool:
            return c.in_service and (not wanted or c.county.casefold() in wanted)

        kept = [c for c in cameras if keep(c)]

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
        return sorted(self._cache.values(), key=lambda c: (c.route, c.name))

    async def get_camera(self, camera_id: str) -> Camera | None:
        await self._ensure_loaded()
        return self._cache.get(camera_id)

    async def fetch_snapshot(self, camera_id: str) -> tuple[bytes, str] | None:
        """Proxy the upstream JPEG. This is the future ML frame-grab hook:
        a worker can call the same path, decode the bytes, and run inference."""
        camera = await self.get_camera(camera_id)
        if camera is None or not camera.snapshot_url:
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
