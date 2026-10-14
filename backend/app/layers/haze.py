"""Experimental smoke/haze index from ALERTCalifornia camera frames.

Haze (smoke, fog or dust) washes out a landscape: contrast and color
saturation drop. We measure both in the middle band of each frame (skipping
the sky at the top and the camera's info bar at the bottom) and bucket the
result. It can't tell smoke from fog, and a PTZ camera that's zoomed or
pointed at sky reads hazier than it is — so it's labeled "experimental".

`haze_metrics` / `classify` are pure (bytes in, numbers out) for testing.
"""

from __future__ import annotations

import asyncio
import io
import math

import httpx
from PIL import Image, ImageStat, UnidentifiedImageError

from ..core.http import fetch_capped

# Calibrated 2026-10-14 against ~90 frames around Modesto: clear ridgelines
# score 0.4–0.6 contrast; visibly hazy ones 0.15–0.25; fogged/smoked-in < 0.1.
LEVELS = ((0.12, "very-hazy"), (0.25, "hazy"), (0.35, "slightly-hazy"))
NIGHT_BRIGHTNESS = 45  # mean 0–255 below this: too dark to judge
CENTER = (37.64, -120.99)  # Modesto
RADIUS_KM = 70
MAX_CAMERAS = 30
FRAME_MAX_BYTES = 3 * 1024 * 1024
# Camera frames are ~2 MP; refuse anything claiming to be far larger (bomb guard).
MAX_PIXELS = 20_000_000


def haze_metrics(jpeg: bytes) -> dict | None:
    """{brightness, contrast, saturation} for the frame's middle band, or None."""
    try:
        # JPEG only: never let a (spoofed) server pick a riskier decoder by magic bytes.
        im = Image.open(io.BytesIO(jpeg), formats=["JPEG"])
        if im.width * im.height > MAX_PIXELS:
            return None
        im.draft("RGB", (480, 480))  # decode at reduced size: less memory, same stats
        im = im.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return None
    w, h = im.size
    if w < 16 or h < 16:
        return None
    im = im.resize((480, max(16, round(480 * h / w))))
    band = im.crop((0, round(im.height * 0.15), im.width, round(im.height * 0.85)))
    gray = ImageStat.Stat(band.convert("L"))
    sat = ImageStat.Stat(band.convert("HSV").getchannel("S"))
    mean = gray.mean[0]
    return {
        "brightness": round(mean, 1),
        "contrast": round(gray.stddev[0] / max(mean, 1.0), 3),
        "saturation": round(sat.mean[0] / 255, 3),
    }


def classify(m: dict | None) -> tuple[str, int | None]:
    """(level, visibility score 0–100). Level is one of: night, clear,
    slightly-hazy, hazy, very-hazy, unknown."""
    if not m:
        return "unknown", None
    if m["brightness"] < NIGHT_BRIGHTNESS:
        return "night", None
    score = max(0, min(100, round(m["contrast"] / 0.5 * 100)))
    for limit, level in LEVELS:
        if m["contrast"] < limit:
            return level, score
    return "clear", score


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.radians
    a = (
        math.sin(p(lat2 - lat1) / 2) ** 2
        + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(a))


def pick_cameras(fire_fc: dict) -> list[dict]:
    """ALERTCalifornia cameras near Modesto with an image: one per site, nearest first."""
    seen: set[tuple[float, float]] = set()
    out = []
    for f in fire_fc.get("features", []):
        p, (lon, lat) = f["properties"], f["geometry"]["coordinates"][:2]
        if not p.get("image") or (lon, lat) in seen:
            continue
        d = _km(CENTER[0], CENTER[1], lat, lon)
        if d <= RADIUS_KM:
            seen.add((lon, lat))
            out.append((d, f))
    return [f for _, f in sorted(out, key=lambda t: t[0])[:MAX_CAMERAS]]


async def build(client: httpx.AsyncClient, fire_fc: dict) -> dict:
    """Fetch each picked camera's latest frame and score it."""
    sem = asyncio.Semaphore(4)  # be gentle with ALERTCalifornia's servers

    async def one(f: dict) -> dict | None:
        async with sem:
            try:
                # No redirects: the allowlisted host must serve the frame itself.
                body, _ = await fetch_capped(
                    client,
                    f["properties"]["image"],
                    max_bytes=FRAME_MAX_BYTES,
                    follow_redirects=False,
                )
            except httpx.HTTPError:
                return None
        # Decode off the event loop so the live API stays responsive.
        level, score = classify(await asyncio.to_thread(haze_metrics, body))
        p = f["properties"]
        return {
            "type": "Feature",
            "geometry": f["geometry"],
            "properties": {
                "name": p["name"],
                "network": p["network"],
                "county": p.get("county", ""),
                "image": p["image"],
                "page": p.get("page", ""),
                "level": level,
                "score": score,
            },
        }

    results = await asyncio.gather(*(one(f) for f in pick_cameras(fire_fc)), return_exceptions=True)
    feats = [x for x in results if isinstance(x, dict)]  # one bad frame never sinks the layer
    return {"type": "FeatureCollection", "features": feats}
