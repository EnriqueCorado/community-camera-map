"""Overlay layer endpoints. Thin: the registry, caching and fetching live in
`LayerService`; new datasets appear here and in the frontend panel automatically.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from .census import CensusKeyMissing
from .service import LayerService

router = APIRouter(prefix="/api/layers", tags=["layers"])


def get_service(request: Request) -> LayerService:
    return request.app.state.layer_service


class LayerInfo(BaseModel):
    name: str
    title: str
    description: str
    category: str
    available: bool
    requires_key: bool


@router.get("", summary="List available overlay layers")
async def list_layers(service: LayerService = Depends(get_service)) -> list[LayerInfo]:
    return [
        LayerInfo(
            name=layer.name,
            title=layer.title,
            description=layer.description,
            category=layer.category,
            available=service.is_available(layer),
            requires_key=layer.requires_key,
        )
        for layer in service.list_layers()
    ]


@router.get("/{name}", summary="Fetch one overlay layer as GeoJSON")
async def get_layer(name: str, service: LayerService = Depends(get_service)) -> Response:
    try:
        body = await service.get_bytes(name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown layer") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Layer data not available yet") from exc
    except CensusKeyMissing as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Upstream layer source unavailable") from exc
    return Response(
        content=body,
        media_type="application/geo+json",
        headers={"Cache-Control": "max-age=3600"},
    )
