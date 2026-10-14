"""FastAPI application entrypoint.

Run locally:  uv run uvicorn app.main:app --reload
Docs:         http://localhost:8000/docs
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .cameras.router import router as cameras_router
from .cameras.service import CameraService
from .core.config import get_settings
from .layers.router import router as layers_router
from .layers.service import LayerService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
# httpx/httpcore log every request URL at INFO — including Census/AirNow URLs whose
# query string carries the API key. Keep them at WARNING so keys never hit logs.
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Own one HTTP client and one service for the app's lifetime (connection
    pooling + a shared cache), and close them cleanly on shutdown."""
    settings = get_settings()
    client = httpx.AsyncClient(
        timeout=settings.http_timeout_seconds,
        headers={"User-Agent": "stanislaus-cam-map/0.1"},
        follow_redirects=True,
    )
    app.state.camera_service = CameraService(settings, client)
    app.state.layer_service = LayerService(settings=settings, client=client)
    try:
        yield
    finally:
        await client.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Stanislaus Camera Map API",
        version="0.1.0",
        summary="Legally-accessible public traffic cameras in Stanislaus County.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    app.include_router(cameras_router)
    app.include_router(layers_router)

    @app.get("/api/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
