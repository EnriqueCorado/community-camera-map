"""HTTP routes for cameras. Thin: validation and status codes only; all logic
lives in `CameraService`, injected via FastAPI dependencies."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .national import sources_for
from .schemas import Camera, CameraList
from .service import CameraService

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

_RASTER_TYPES = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"})


def get_service(request: Request) -> CameraService:
    """Pull the singleton service created during app startup (see main.py)."""
    return request.app.state.camera_service


@router.get("", response_model=CameraList, summary="List all accessible cameras")
async def list_cameras(service: CameraService = Depends(get_service)) -> CameraList:
    try:
        cameras = await service.list_cameras()
    except (httpx.HTTPError, RuntimeError) as exc:  # upstream unreachable / all feeds down
        raise HTTPException(status_code=502, detail="Upstream camera feed unavailable") from exc
    return CameraList(count=len(cameras), sources=sources_for(cameras), cameras=cameras)


@router.get("/{camera_id}", response_model=Camera, summary="Get one camera")
async def get_camera(camera_id: str, service: CameraService = Depends(get_service)) -> Camera:
    camera = await service.get_camera(camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera


@router.get(
    "/{camera_id}/snapshot",
    summary="Proxy a camera's current still image",
    response_class=Response,
)
async def get_snapshot(camera_id: str, service: CameraService = Depends(get_service)) -> Response:
    try:
        result = await service.fetch_snapshot(camera_id)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach camera image") from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Camera or image not found")
    content, content_type = result
    # Only ever serve this as an image, and tell the browser not to sniff — so a
    # tampered upstream can't get HTML rendered from our origin. Cache-Control
    # matches the upstream ~2 min refresh so browsers don't over-fetch.
    # Allowlist raster types only: "image/svg+xml" is an image/* type that can carry
    # script, so a prefix check would let a compromised upstream serve active
    # content from our origin.
    base_type = content_type.split(";", 1)[0].strip().lower()
    safe_type = base_type if base_type in _RASTER_TYPES else "image/jpeg"
    return Response(
        content=content,
        media_type=safe_type,
        headers={
            "Cache-Control": "max-age=120",
            "X-Content-Type-Options": "nosniff",
            # Belt-and-braces: even if a browser ever renders this as a document,
            # nothing in it may load or execute.
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )
