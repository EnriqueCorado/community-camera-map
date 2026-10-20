"""Public API shapes for cameras.

These are the *normalized* models we expose to the frontend — deliberately
decoupled from Caltrans' raw JSON so the upstream format can change (or a second
source be added) without touching clients. The raw-feed parsing lives in
`caltrans.py` and `national.py`.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Camera(BaseModel):
    """A single public traffic camera, normalized for the map UI."""

    id: str = Field(description="Stable slug, unique within the app")
    name: str = Field(description="Human-readable location, e.g. 'SB SR-99 @ Briggsmore'")
    county: str
    nearby_place: str = Field(default="", description="Nearest city/town")
    route: str = Field(default="", description="Highway, e.g. 'SR-99'")
    direction: str = Field(default="", description="Travel direction the camera faces")
    latitude: float
    longitude: float
    snapshot_url: str = Field(description="Still JPEG, refreshed upstream every ~2 min")
    stream_url: str = Field(description="Live HLS (.m3u8) video playlist")
    in_service: bool = True
    source: str = Field(default="caltrans", description="Key into CameraList.sources")
    state: str = Field(default="CA", description="US state (postal code); '' if offshore/unknown")
    views: list[str] = Field(
        default_factory=list, description="Extra still images from the same site (other directions)"
    )


class SourceInfo(BaseModel):
    """Who publishes a camera feed, for credit lines and the About page."""

    name: str
    state: str = ""
    url: str = ""
    credit: str = Field(description="Attribution line shown with the camera")
    license: str = ""
    license_url: str = ""


class CameraList(BaseModel):
    """Envelope so we can add pagination/metadata without a breaking change."""

    count: int
    source: str = "Public camera feeds: Caltrans, state DOTs, USGS and NOAA"
    sources: dict[str, SourceInfo] = Field(default_factory=dict)
    cameras: list[Camera]
