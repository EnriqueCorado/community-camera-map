"""Overlay layer endpoints. Thin: the registry, caching and fetching live in
`LayerService`; new datasets appear here and in the frontend panel automatically.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .alpr_access import ALPR_ACCESS_FILE
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
    same_data_as: str | None = None
    coverage: str = "stanislaus"
    view: dict | None = None
    osm: str | None = None
    title_es: str | None = None
    group: str | None = None
    metric: dict | None = None
    classes: dict | None = None


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
            same_data_as=layer.same_data_as,
            **layer.catalog_extras(),
        )
        for layer in service.list_layers()
    ]


@router.get("/times", summary="When each cached layer was fetched (epoch seconds)")
async def layer_times(service: LayerService = Depends(get_service)) -> dict[str, float]:
    return service.fetched_times()


@router.get("/alpr/access", summary="Who can search each plate reader (sourced profiles)")
async def alpr_access() -> FileResponse:
    return FileResponse(
        ALPR_ACCESS_FILE, media_type="application/json", headers={"Cache-Control": "max-age=3600"}
    )


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
    # Browser caching follows the layer's own freshness (15 s for flights, …).
    layer = next((x for x in service.list_layers() if x.name == name), None)
    ttl = layer.ttl if layer and layer.ttl is not None else service.settings.overlay_ttl_seconds
    return Response(
        content=body,
        media_type="application/geo+json",
        headers={"Cache-Control": f"max-age={max(5, min(3600, ttl))}"},
    )
