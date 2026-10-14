"""Shared HTTP helpers.

`fetch_capped` streams a response and aborts past a byte ceiling, so a
misbehaving or compromised upstream can't exhaust memory. It subclasses
`httpx.HTTPError` for the too-large case, so existing `except httpx.HTTPError`
handlers treat it as an upstream failure (502) with no extra wiring.
"""

from __future__ import annotations

import httpx


class ResponseTooLarge(httpx.HTTPError):
    """Raised when an upstream body exceeds the configured cap."""


async def fetch_capped(
    client: httpx.AsyncClient,
    url: str,
    *,
    max_bytes: int,
    follow_redirects: bool = True,
) -> tuple[bytes, str]:
    """GET `url`, returning (body, content_type), aborting past `max_bytes`."""
    async with client.stream("GET", url, follow_redirects=follow_redirects) as resp:
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        declared = resp.headers.get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > max_bytes:
            raise ResponseTooLarge(f"Upstream Content-Length {declared} exceeds cap {max_bytes}")

        chunks: list[bytes] = []
        total = 0
        async for chunk in resp.aiter_bytes():
            total += len(chunk)
            if total > max_bytes:
                raise ResponseTooLarge(f"Upstream body exceeded cap {max_bytes}")
            chunks.append(chunk)
        return b"".join(chunks), content_type
