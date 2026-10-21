"""Public cameras outside Caltrans: other state DOTs, USGS volcano cams, NOAA buoys.

One small fetch + normalize pair per source, all keyless and published by the
agency itself (see README "Camera sources"). Each `parse_*` is a pure function
from the raw payload to `Camera`s, so it's unit-tested against hand-written
fixtures; each `fetch_*` only does the HTTP.

Rules every source follows:
  - media URLs must be https on that source's own hosts (`_safe`), so a tampered
    feed can't point the browser (or the snapshot proxy) anywhere else;
  - HLS is kept only where the stream host answers `Access-Control-Allow-Origin: *`
    (verified 2026-10-19: MoDOT, MD CHART, DelDOT, ALGO/Wowza, SCDOT/skyvdn);
    everything else is snapshot-only;
  - records without usable coordinates or media are dropped, not guessed.

`fetch_all` runs every source concurrently and isolates failures: one source
down never blanks the others, and only the exception *type* is logged (URLs
never are).
"""

from __future__ import annotations

import asyncio
import html
import ipaddress
import json
import logging
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import quote, urlsplit

import httpx

from ..core.http import fetch_capped
from ..layers import arcgis
from .schemas import Camera, SourceInfo

logger = logging.getLogger(__name__)
# httpx logs every request URL at INFO, and the Iteris keys ride in the query
# string. main.py and bake.py already quiet these; do it here too so any other
# entry point that imports this module (scripts, tests, a REPL) can't leak a key.
for _noisy in ("httpx", "httpcore"):
    _lg = logging.getLogger(_noisy)
    _lg.setLevel(max(_lg.level, logging.WARNING))  # an explicit level, not inherited

_slug_re = re.compile(r"[^a-z0-9]+")
_SAFE_ID = re.compile(r"[A-Za-z0-9_.-]{1,80}")
_ROUTE = re.compile(
    r"\b(I-\d+[A-Z]?|I \d+|US[- ]\d+[A-Z]?|SR[- ]\d+|MO[- ]\d+|KY[- ]\d+|DE[- ]\d+|M-\d+)\b"
)
_DIRS = {
    "n": "North",
    "s": "South",
    "e": "East",
    "w": "West",
    "nb": "North",
    "sb": "South",
    "eb": "East",
    "wb": "West",
    "north": "North",
    "south": "South",
    "east": "East",
    "west": "West",
    "northbound": "North",
    "southbound": "South",
    "eastbound": "East",
    "westbound": "West",
}


# ---------- per-source metadata (shipped to the UI for credit lines) ----------

SOURCES: dict[str, SourceInfo] = {
    "caltrans": SourceInfo(
        name="Caltrans", state="CA", url="https://cwwp2.dot.ca.gov/", credit="Caltrans"
    ),
    "il": SourceInfo(
        name="Illinois DOT",
        state="IL",
        url="https://www.gettingaroundillinois.com/",
        credit="Illinois DOT (Illinois Department of Transportation)",
        license="CC BY-SA 2.0",
        license_url="https://creativecommons.org/licenses/by-sa/2.0/",
    ),
    "wa": SourceInfo(
        name="WSDOT",
        state="WA",
        url="https://wsdot.com/travel/real-time/",
        credit="Washington State DOT",
    ),
    "ky": SourceInfo(
        name="KYTC",
        state="KY",
        url="https://goky.ky.gov/",
        credit="Kentucky Transportation Cabinet",
    ),
    "sc": SourceInfo(
        name="SCDOT 511SC",
        state="SC",
        url="https://www.511sc.org/",
        credit="South Carolina DOT (511SC)",
    ),
    "sd": SourceInfo(
        name="SDDOT SD511",
        state="SD",
        url="https://www.sd511.org/",
        credit="South Dakota DOT (SD511)",
    ),
    "mt": SourceInfo(
        name="MDT 511MT", state="MT", url="https://www.511mt.net/", credit="Montana DOT (511MT)"
    ),
    "mo": SourceInfo(
        name="MoDOT",
        state="MO",
        url="https://traveler.modot.org/",
        credit="Missouri DOT (MoDOT Traveler)",
    ),
    "md": SourceInfo(
        name="MDOT SHA CHART",
        state="MD",
        url="https://chart.maryland.gov/",
        credit="Maryland DOT SHA (CHART)",
    ),
    "de": SourceInfo(
        name="DelDOT", state="DE", url="https://deldot.gov/map/", credit="Delaware DOT"
    ),
    "al": SourceInfo(
        name="ALDOT ALGO Traffic",
        state="AL",
        url="https://www.algotraffic.com/",
        credit="Alabama DOT (ALGO Traffic)",
    ),
    "mi": SourceInfo(
        name="MDOT MiDrive",
        state="MI",
        url="https://mdotjboss.state.mi.us/MiDrive/",
        credit="Michigan DOT (MiDrive)",
    ),
    "avo": SourceInfo(
        name="USGS volcano webcams",
        state="",
        url="https://avo.alaska.edu/webcam/",
        credit="USGS Volcano Hazards Program (Alaska Volcano Observatory ashcam)",
        license="Public domain (USGS)",
    ),
    "ndbc": SourceInfo(
        name="NOAA NDBC BuoyCAMs",
        state="",
        url="https://www.ndbc.noaa.gov/buoycams.shtml",
        credit="NOAA National Data Buoy Center",
        license="Public domain (NOAA)",
    ),
}

# Iteris "511" sites with a free per-state API key (CAM_ITERIS_KEY_<ST>):
# state -> (site host, credit line). Only GET /api/v2/get/cameras is used (the
# documented API); the sites' robots.txt disallows the /map/map*/ internals.
ITERIS: dict[str, tuple[str, str]] = {
    "ga": ("511ga.org", "511GA / Georgia DOT"),
    "wi": ("511wi.gov", "511 Wisconsin / WisDOT"),
    "nv": ("www.nvroads.com", "NVRoads / Nevada DOT"),
    "nc": ("www.drivenc.gov", "DriveNC / NCDOT"),
    "ut": ("www.udottraffic.utah.gov", "UDOT Traffic / Utah DOT"),
    "ak": ("511.alaska.gov", "511 Alaska / Alaska DOT&PF"),
    "la": ("www.511la.org", "511LA / Louisiana DOTD"),
    "id": ("511.idaho.gov", "511 Idaho / Idaho Transportation Department"),
    "az": ("az511.com", "AZ511 / Arizona DOT"),
}
SOURCES["oh"] = SourceInfo(
    name="OHGO", state="OH", url="https://www.ohgo.com/", credit="OHGO / Ohio DOT"
)

# Keyless state feeds published as open ArcGIS layers by the agency itself or
# by another state agency that republishes it (FDEM for FL511, Oregon OEM for
# TripCheck). Checked 2026-10-21; licenses are as stated on each item.
SOURCES.update(
    {
        "ia": SourceInfo(
            name="Iowa DOT",
            state="IA",
            url="https://www.arcgis.com/home/item.html?id=c4063f200a7b4da5826e2ac86c677cf5",
            credit="Iowa Department of Transportation",
            license="CC BY 4.0",
            license_url="https://creativecommons.org/licenses/by/4.0/",
        ),
        "fl": SourceInfo(
            name="FL511 (via FDEM)",
            state="FL",
            url="https://fl511.com/",
            credit="FL511 / Florida DOT, published by the Florida Division of Emergency Management",
            license="Public data, no license stated",
            license_url="https://www.arcgis.com/home/item.html?id=8c0046dd833347bea1c39decec1d3abb",
        ),
        "or": SourceInfo(
            name="ODOT TripCheck (via Oregon OEM)",
            state="OR",
            url="https://www.tripcheck.com/",
            credit="ODOT TripCheck, published by Oregon Emergency Management",
            license="Public",
            license_url="https://www.arcgis.com/home/item.html?id=1e3fb7169cd74127b9c1707258a6e6e9",
        ),
    }
)
# Sources added after the others overlapped them at the same spot; their
# cameras give way to an earlier source's camera there (see dedupe_by_location).
YIELDING_SOURCES = ("ia", "fl", "or")

# HLS kept only where the research verified CORS-open, unauthenticated streams.
ITERIS_VIDEO_HOSTS: dict[str, tuple[str, ...]] = {"wi": ("cctv1.dot.wi.gov",)}
for _st, (_host, _credit) in ITERIS.items():
    SOURCES[_st] = SourceInfo(
        name=_credit.split(" / ")[0], state=_st.upper(), url=f"https://{_host}/", credit=_credit
    )

# Each source's media hosts (a host matches itself or any subdomain). Mirrored
# — as one union, plus Caltrans — in frontend/src/popup-logic.ts
# CAMERA_MEDIA_HOSTS; tests/test_national.py fails if the two drift.
HOSTS: dict[str, tuple[str, ...]] = {
    # Lake County PASSAGE cameras are published in IDOT's dataset too.
    "il": ("cctv.travelmidwest.com", "www.lakecountypassage.com"),
    "wa": ("images.wsdot.wa.gov",),
    "ky": ("www.trimarc.org",),
    "sc": ("us-east-1.skyvdn.com",),
    "sd": ("sd.cdn.iteris-atis.com",),
    "mt": ("mt.cdn.iteris-atis.com",),
    "mo": ("modot.mo.gov",),
    "md": ("sha.maryland.gov",),
    "de": ("video.deldot.gov",),
    "al": ("api.algotraffic.com", "cdn3.wowza.com"),
    "mi": ("micamerasimages.net",),
    "avo": ("avo-volcview.wr.usgs.gov",),
    "ndbc": ("www.ndbc.noaa.gov",),
    **{st: (host, *ITERIS_VIDEO_HOSTS.get(st, ())) for st, (host, _) in ITERIS.items()},
    "oh": ("itscameras.dot.state.oh.us",),
    # HLS on video*.iowadot.gov runs on port 8888, so Iowa is stills only.
    "ia": ("atmsqf.iowadot.gov",),
    "fl": ("images-dis.divas.cloud",),  # FDOT DIVAS video/image system
    "or": ("tripcheck.com",),
}


# ---------- shared helpers ----------


def _safe(url: object, hosts: tuple[str, ...]) -> str:
    """A normalized https URL on one of `hosts` (or a subdomain), else "".

    Same posture as layers.transforms._https_on: rejects backslashes, whitespace
    and control characters, userinfo, and any port but the default 443, and
    returns a URL rebuilt from its parsed parts rather than the raw string.
    """
    u = str(url or "").strip()
    if not u or re.search(r"[\\\s\x00-\x1f]", u):
        return ""
    try:
        p = urlsplit(u)
        port = p.port
    except ValueError:
        return ""
    host = (p.hostname or "").lower()
    ok = (
        p.scheme.lower() == "https"
        and p.username is None
        and p.password is None
        and port in (None, 443)
        and re.fullmatch(r"[a-z0-9.-]+", host) is not None  # no %-escapes in the host
        and any(host == h or host.endswith("." + h) for h in hosts)
    )
    if not ok:
        return ""
    return f"https://{host}{p.path or '/'}" + (f"?{p.query}" if p.query else "")


def _num(v: object) -> float | None:
    try:
        n = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return n if n == n and abs(n) != float("inf") else None


def _coords(lat: object, lon: object) -> tuple[float, float] | None:
    """(lat, lon) if both are real, in range, and not the 0 placeholder."""
    la, lo = _num(lat), _num(lon)
    if la is None or lo is None or la == 0 or lo == 0:
        return None
    if not (-90 <= la <= 90 and -180 <= lo <= 180):
        return None
    return round(la, 6), round(lo, 6)


def _slug(*parts: object) -> str:
    return _slug_re.sub("-", "-".join(str(p) for p in parts if p).lower()).strip("-")[:80]


def _text(v: object) -> str:
    """Plain text from a feed field: entities decoded, then tags (and any stray
    angle brackets) and extra spaces removed, in that order so an encoded
    "&lt;img ...&gt;" can't come back out as markup."""
    s = re.sub(r"<[^>]*>", " ", html.unescape(str(v or ""))).replace("<", "").replace(">", "")
    return re.sub(r"\s+", " ", s).strip()


def _route(name: str) -> str:
    m = _ROUTE.search(name)
    return m.group(1).replace(" ", "-") if m else ""


def _direction(v: object) -> str:
    return _DIRS.get(str(v or "").strip().lower(), "")


def _cam(source: str, **kw: object) -> Camera:
    kw.setdefault("state", SOURCES[source].state)
    kw.setdefault("county", "")
    kw.setdefault("snapshot_url", "")
    kw.setdefault("stream_url", "")
    return Camera(source=source, **kw)  # type: ignore[arg-type]


def _features(payload: object) -> list[dict]:
    rows = payload.get("features") if isinstance(payload, dict) else None
    return [f for f in rows if isinstance(f, dict)] if isinstance(rows, list) else []


def _point(f: dict) -> tuple[float, float] | None:
    """(lat, lon) of a GeoJSON Point feature."""
    g = f.get("geometry") or {}
    c = g.get("coordinates") if isinstance(g, dict) else None
    if not isinstance(c, list) or len(c) < 2:
        return None
    return _coords(c[1], c[0])


def _props(f: dict) -> dict:
    p = f.get("properties")
    return p if isinstance(p, dict) else {}


def _rows(payload: object, key: str | None = None) -> list[dict]:
    rows = payload.get(key) if key and isinstance(payload, dict) else payload
    return [r for r in rows if isinstance(r, dict)] if isinstance(rows, list) else []


# ---------- ArcGIS / GeoJSON sources ----------


def parse_il(fc: object) -> list[Camera]:
    """IDOT / Gateway Traveler Information (ArcGIS, as GeoJSON). CC BY-SA 2.0."""
    out = []
    for f in _features(fc):
        p, ll = _props(f), _point(f)
        snap = _safe(p.get("SnapShot"), HOSTS["il"])
        if not ll or not snap:
            continue
        name = _text(p.get("CameraLocation"))
        m = re.search(r"[?&]id=([A-Za-z0-9_-]+)", str(p.get("ImgPath") or ""))
        raw_dir = str(p.get("CameraDirection") or "").strip()
        cam_id = re.sub(r"^IL-", "", m.group(1), flags=re.I) if m else str(p.get("OBJECTID") or "")
        county = re.search(r"/snapshots/[A-Za-z0-9-]+_\d+_([A-Za-z.]+)_", snap)
        out.append(
            _cam(
                "il",
                id=_slug("il", cam_id, raw_dir if raw_dir.upper() != "NONE" else ""),
                name=name or f"Camera {cam_id}",
                county=county.group(1) if county else "",
                route=_route(snap.rsplit("/", 1)[-1].replace("_", " ")) or _route(name),
                direction=_direction(raw_dir),
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=snap,
                in_service=str(p.get("TooOld") or "").lower() != "true",
            )
        )
    return out


def parse_wa(fc: object) -> list[Camera]:
    """WSDOT highway cameras (ArcGIS). Border cameras hosted by ODOT TripCheck are
    dropped (not on a WSDOT host)."""
    out = []
    for f in _features(fc):
        p, ll = _props(f), _point(f)
        snap = _safe(p.get("ImageURL"), HOSTS["wa"])
        if not ll or not snap:
            continue
        name = _text(p.get("CameraTitle"))
        out.append(
            _cam(
                "wa",
                id=_slug("wa", p.get("OBJECTID"), name if not p.get("OBJECTID") else ""),
                name=name or "WSDOT camera",
                route=_route(name),
                direction=_direction(p.get("CompassDirection")),
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=snap,
            )
        )
    return out


_KY_STATES = {"kentucky": "KY", "indiana": "IN", "ohio": "OH"}


def parse_ky(fc: object) -> list[Camera]:
    """KYTC current traffic cameras (ArcGIS). Mostly Louisville/N. Kentucky (TRIMARC);
    the few http-only snapshots are dropped."""
    out = []
    for f in _features(fc):
        p, ll = _props(f), _point(f)
        snap = _safe(p.get("snapshot"), HOSTS["ky"])
        if not ll or not snap:
            continue
        name = _text(p.get("description")) or _text(p.get("name"))
        state = _KY_STATES.get(str(p.get("state") or "").lower()) or (
            "IN" if "indiana" in name.lower() else "KY"
        )
        out.append(
            _cam(
                "ky",
                id=_slug("ky", p.get("id") or p.get("OBJECTID")),
                name=name or "KYTC camera",
                state=state,
                county=_text(p.get("county")),
                route=_text(p.get("highway")) or _route(name),
                direction=_direction(p.get("direction")),
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=snap,
                in_service=str(p.get("status") or "Online").lower() == "online",
            )
        )
    return out


def parse_sc(fc: object) -> list[Camera]:
    """SCDOT 511SC (Iteris ATIS CDN GeoJSON): snapshot + CORS-open HLS."""
    out = []
    for f in _features(fc):
        p, ll = _props(f), _point(f)
        if not ll:
            continue
        snap = _safe(p.get("image_url"), HOSTS["sc"])
        # The thumbs URL 301s to /{id}.png; use the target so the snapshot proxy
        # (which never follows redirects) can fetch it too.
        snap = re.sub(r"/thumbs/([A-Za-z0-9_-]+)\.flv\.png$", r"/\1.png", snap)
        stream = "" if p.get("problem_stream") else _safe(p.get("https_url"), HOSTS["sc"])
        if not snap and not stream:
            continue
        name = _text(p.get("description")) or _text(p.get("name"))
        out.append(
            _cam(
                "sc",
                id=_slug("sc", p.get("name") or p.get("id")),
                name=name or "SCDOT camera",
                county=_text(p.get("jurisdiction")),
                route=_text(p.get("route")),
                direction=_direction(p.get("direction")),
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=snap,
                stream_url=stream,
                in_service=p.get("active") is not False,
            )
        )
    return out


def _parse_atis_sites(source: str, fc: object) -> list[Camera]:
    """SD511 / 511MT camera + road-weather sites: one camera per site, with the
    site's other views as extra snapshots."""
    out = []
    for f in _features(fc):
        p, ll = _props(f), _point(f)
        views = p.get("cameras")
        if not ll or not isinstance(views, list):
            continue
        images = sorted(
            (
                (str(v.get("id") or ""), u)
                for v in views
                if isinstance(v, dict) and (u := _safe(v.get("image"), HOSTS[source]))
            ),
        )
        urls = list(dict.fromkeys(u for _, u in images))
        if not urls:
            continue
        first = next((v for v in views if isinstance(v, dict)), {})
        name = (
            _text(p.get("name")) or _text(p.get("description")) or _text(first.get("description"))
        )
        out.append(
            _cam(
                source,
                id=_slug(source, f.get("id") or p.get("id") or name),
                name=name or f"{SOURCES[source].name} camera",
                route=_text(p.get("route")),
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=urls[0],
                views=urls[1:],
            )
        )
    return out


def parse_sd(fc: object) -> list[Camera]:
    return _parse_atis_sites("sd", fc)


def parse_mt(fc: object) -> list[Camera]:
    return _parse_atis_sites("mt", fc)


# ---------- plain-JSON sources ----------


def parse_mo(payload: object) -> list[Camera]:
    """MoDOT Traveler streaming cameras: HLS only (no stills). Streams on other
    hosts (KC Scout API, Ozarks Traffic) are dropped: they refuse browser playback."""
    out = []
    for r in _rows(payload):
        ll = _coords(r.get("y"), r.get("x"))
        stream = _safe(r.get("html"), HOSTS["mo"])
        m = re.search(r"/rtplive/([A-Za-z0-9_.-]+)/playlist\.m3u8$", stream)
        if not ll or not m:
            continue
        name = _text(r.get("location"))
        out.append(
            _cam(
                "mo",
                id=_slug("mo", m.group(1)),
                name=name or m.group(1),
                route=_route(name),
                latitude=ll[0],
                longitude=ll[1],
                stream_url=stream,
            )
        )
    return out


_MD_PREFIX = {"IS": "I-", "US": "US-", "MD": "MD-"}


def parse_md(payload: object) -> list[Camera]:
    """MDOT SHA CHART camera export: HLS built from `cctvIp` + `id`."""
    out = []
    for r in _rows(payload, "data"):
        ll = _coords(r.get("lat"), r.get("lon"))
        cam_id = str(r.get("id") or "")
        host = str(r.get("cctvIp") or "")
        if not ll or not re.fullmatch(r"[0-9a-fA-F]{8,64}", cam_id):
            continue
        stream = _safe(f"https://{host}/rtplive/{cam_id}/playlist.m3u8", HOSTS["md"])
        if not stream:
            continue
        prefix, number = str(r.get("routePrefix") or ""), r.get("routeNumber")
        cats = r.get("cameraCategories")
        out.append(
            _cam(
                "md",
                id=_slug("md", cam_id[:16]),
                name=_text(r.get("description")) or _text(r.get("name")) or "CHART camera",
                nearby_place=_text(cats[0]) if isinstance(cats, list) and cats else "",
                route=f"{_MD_PREFIX[prefix]}{number}" if prefix in _MD_PREFIX and number else "",
                latitude=ll[0],
                longitude=ll[1],
                stream_url=stream,
                in_service=r.get("opStatus") == "OK" and r.get("commMode") == "ONLINE",
            )
        )
    return out


def parse_de(payload: object) -> list[Camera]:
    """DelDOT video cameras: the https HLS URL (the http/RTMP variants are ignored)."""
    out = []
    for r in _rows(payload, "videoCameras"):
        ll = _coords(r.get("lat"), r.get("lon"))
        urls = r.get("urls") if isinstance(r.get("urls"), dict) else {}
        stream = _safe(urls.get("m3u8s"), HOSTS["de"])
        cam_id = str(r.get("id") or "")
        if not ll or not stream or not _SAFE_ID.fullmatch(cam_id):
            continue
        name = _text(r.get("title"))
        out.append(
            _cam(
                "de",
                id=_slug("de", cam_id),
                name=name or cam_id,
                county=_text(r.get("county")),
                route=_route(name),
                latitude=ll[0],
                longitude=ll[1],
                stream_url=stream,
                in_service=r.get("enabled") is not False and r.get("status") == "Active",
            )
        )
    return out


def parse_al(payload: object) -> list[Camera]:
    """ALGO Traffic (ALDOT) v4 cameras: still + Wowza HLS. Public cameras only."""
    out = []
    for r in _rows(payload):
        if r.get("accessLevel") != "Public":
            continue
        loc = r.get("location") if isinstance(r.get("location"), dict) else {}
        ll = _coords(loc.get("latitude"), loc.get("longitude"))
        playback = r.get("playbackUrls") if isinstance(r.get("playbackUrls"), dict) else {}
        snap = _safe(r.get("snapshotImageUrl"), HOSTS["al"])
        stream = _safe(playback.get("hls"), HOSTS["al"])
        if not ll or not (snap or stream):
            continue
        route = _text(loc.get("displayRouteDesignator"))
        cross = _text(loc.get("displayCrossStreet"))
        out.append(
            _cam(
                "al",
                id=_slug("al", r.get("id")),
                name=" @ ".join(x for x in (route, cross) if x) or f"Camera {r.get('id')}",
                county=_text(loc.get("county")),
                nearby_place=_text(loc.get("city")),
                route=route,
                direction=_direction(loc.get("direction")),
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=snap,
                stream_url=stream,
            )
        )
    return out


_MI_LATLON = re.compile(r"lat=(-?\d{1,3}(?:\.\d+)?)&(?:amp;)?lon=(-?\d{1,3}(?:\.\d+)?)")
_MI_ID = re.compile(r"[?&](?:amp;)?id=(\d{1,10})")
_MI_SRC = re.compile(r"""\bsrc\s*=\s*["']([^"'<>]+)["']""", re.I)
_MI_TRAVEL = re.compile(r"traveling\s+(north|south|east|west)", re.I)


def parse_mi(payload: object) -> list[Camera]:
    """MDOT MiDrive camera list. Fields carry HTML, so coordinates come from the
    "Go to" map link and the image from the <img src>; nothing else of the HTML
    is kept."""
    out = []
    for r in _rows(payload):
        county_html = str(r.get("county") or "")
        m = _MI_LATLON.search(county_html)
        src = _MI_SRC.search(str(r.get("image") or ""))
        snap = _safe(html.unescape(src.group(1)), HOSTS["mi"]) if src else ""
        ll = _coords(m.group(1), m.group(2)) if m else None
        if not ll or not snap:
            continue
        cam_id = _MI_ID.search(county_html)
        route, loc = _text(r.get("route")), _text(r.get("location"))
        county = _text(re.split(r"<a\b", county_html, maxsplit=1, flags=re.I)[0])
        d = _MI_TRAVEL.search(str(r.get("direction") or ""))
        out.append(
            _cam(
                "mi",
                id=_slug("mi", cam_id.group(1) if cam_id else f"{route}-{loc}"),
                name=f"{route} {loc}".strip()
                if loc.startswith("@")
                else ", ".join(x for x in (route, loc) if x),
                county=re.sub(r"\s+County$", "", county),
                route=route if _route(route) else _route(loc),
                direction=d.group(1).title() if d else "",
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=snap,
            )
        )
    return out


AVO_MAX_AGE_S = 7 * 24 * 3600


def parse_avo(payload: object, now: float | None = None) -> list[Camera]:
    """USGS volcano webcams (AVO ashcam API; also Cascades + Yellowstone).

    Only cameras with a frame in the last week. FAA-owned cameras the API
    re-serves (`faaInd` = Y) are skipped: FAA gates its own images behind a
    Referer check, so we don't route around that through USGS."""
    now = time.time() if now is None else now
    out = []
    for w in _rows(payload, "webcams"):
        if w.get("faaInd") == "Y" or w.get("hasImages") != "Y":
            continue
        last = _num(w.get("lastImageTimestamp")) or 0
        ll = _coords(w.get("latitude"), w.get("longitude"))
        snap = _safe(w.get("currentImageUrl"), HOSTS["avo"])
        code = str(w.get("webcamCode") or "")
        if not ll or not snap or now - last > AVO_MAX_AGE_S or not _SAFE_ID.fullmatch(code):
            continue
        out.append(
            _cam(
                "avo",
                id=_slug("avo", code),
                name=_text(w.get("webcamName")) or code,
                state="AK" if ll[0] > 51 else "",
                nearby_place=_text(w.get("vName")),
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=snap,
            )
        )
    return out


_STATE_TAIL = re.compile(r",\s*([A-Z]{2})\s*$")


def parse_ndbc(payload: object) -> list[Camera]:
    """NOAA NDBC BuoyCAMs: the station's stable latest-image URL."""
    out = []
    for r in _rows(payload):
        station = str(r.get("id") or "")
        ll = _coords(r.get("lat"), r.get("lng"))
        if not ll or not re.fullmatch(r"[A-Za-z0-9]{3,8}", station):
            continue
        name = _text(r.get("name"))
        st = _STATE_TAIL.search(name)
        out.append(
            _cam(
                "ndbc",
                id=_slug("ndbc", station),
                name=f"Buoy {station}: {name}" if name else f"Buoy {station}",
                state=st.group(1) if st else "",
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=f"https://www.ndbc.noaa.gov/buoycam.php?station={station}",
            )
        )
    return out


def parse_iteris(st: str, payload: object) -> list[Camera]:
    """Iteris 511 `/api/v2/get/cameras` sites: one camera per site, first enabled
    view as the still and the rest as extra views (same as SD/MT). Stills are the
    site's keyless /map/Cctv/{id} images; video only where ITERIS_VIDEO_HOSTS
    allows it."""
    host, _ = ITERIS[st]
    video_hosts = ITERIS_VIDEO_HOSTS.get(st, ())
    out = []
    for site in _rows(payload):
        ll = _coords(site.get("Latitude"), site.get("Longitude"))
        raw_views = site.get("Views")
        views = [
            v
            for v in (raw_views if isinstance(raw_views, list) else [])
            if isinstance(v, dict) and str(v.get("Status") or "").lower() == "enabled"
        ]
        urls = list(dict.fromkeys(u for v in views if (u := _safe(v.get("Url"), (host,)))))
        if not ll or not urls:
            continue
        stream = ""
        if video_hosts:
            stream = next((u for v in views if (u := _safe(v.get("VideoUrl"), video_hosts))), "")
        road, loc = _text(site.get("Roadway")), _text(site.get("Location"))
        if loc.upper() == "N/A":
            loc = ""
        name = loc if road.lower() in loc.lower() else " - ".join(x for x in (road, loc) if x)
        out.append(
            _cam(
                st,
                id=_slug(st, site.get("Id")),
                name=name or f"{SOURCES[st].name} camera {site.get('Id')}",
                county=_text(site.get("County")),
                route=_route(road) or road,
                direction=_direction(site.get("Direction")),
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=urls[0],
                views=urls[1:],
                stream_url=stream,
            )
        )
    return out


def parse_oh(payload: object) -> list[Camera]:
    """OHGO public API cameras: one camera per site, its views' large stills
    (the feed writes some with an explicit :443, which `_safe` drops)."""
    out = []
    for r in _rows(payload, "results"):
        ll = _coords(r.get("latitude"), r.get("longitude"))
        cam_id = str(r.get("id") or "")
        raw_views = r.get("cameraViews")
        views = [
            v for v in (raw_views if isinstance(raw_views, list) else []) if isinstance(v, dict)
        ]
        urls = list(
            dict.fromkeys(
                u
                for v in views
                if (u := _safe(v.get("largeUrl") or v.get("smallUrl"), HOSTS["oh"]))
            )
        )
        if not ll or not urls or not re.fullmatch(r"[0-9A-Za-z_-]{1,40}", cam_id):
            continue
        name = _text(r.get("location")) or _text(r.get("description"))
        out.append(
            _cam(
                "oh",
                id=_slug("oh", cam_id.lstrip("0") or "0"),
                name=name or f"OHGO camera {cam_id}",
                route=_route(name),
                direction=_direction(views[0].get("direction")) if views else "",
                latitude=ll[0],
                longitude=ll[1],
                snapshot_url=urls[0],
                views=urls[1:],
            )
        )
    return out


# ---------- state ArcGIS layers (IA, FL, OR, CO) ----------

_ROUTE_CODE = re.compile(r"(I|US|SR|IA|OR|CO)[- ]?(\d{1,3}[A-Z]?)", re.I)
_SITE_ID = re.compile(r"\d{1,12}")
_LOOKING = re.compile(r"\b(north|south|east|west)", re.I)


def _route_code(raw: str) -> str:
    """'IA 100' / 'OR238' / 'US 160' -> 'IA-100' / 'OR-238' / 'US-160'; a local
    road name ('Broadway Blvd') is kept as is."""
    raw = raw.strip()
    if raw.lower() in ("unknown", "n/a", "none"):
        return ""
    m = _ROUTE_CODE.fullmatch(raw)
    return f"{m.group(1).upper()}-{m.group(2).upper()}" if m else (_route(raw) or raw)


def _by_site(source: str, items: list[tuple[object, object, str, dict]]) -> list[Camera]:
    """`items` holds (site key, sort key, still URL, camera fields) per view.
    Views sharing a site key become one camera, as SD/MT do: the lowest sort
    key's fields and still, the other stills as extra views."""
    groups: dict[object, list[tuple[object, str, dict]]] = {}
    for site, order, url, fields in items:
        groups.setdefault(site, []).append((order, url, fields))
    out = []
    for rows in groups.values():
        rows.sort(key=lambda r: r[0])  # type: ignore[arg-type,return-value]
        urls = list(dict.fromkeys(u for _, u, _ in rows))
        out.append(_cam(source, **rows[0][2], snapshot_url=urls[0], views=urls[1:]))
    return out


_IA_NOT_PLACE = {"rwis cameras", "wwd", "iwz", "icws"}


def parse_ia(fc: object) -> list[Camera]:
    """Iowa DOT `Traffic_Cameras_View` (CC BY 4.0): stills only (its HLS runs on
    port 8888). Rest-area and road-weather sites carry several views."""
    items: list[tuple[object, object, str, dict]] = []
    for f in _features(fc):
        p, ll = _props(f), _point(f)
        snap = _safe(p.get("ImageURL"), HOSTS["ia"])
        dev = str(p.get("device_id") or "")
        if not ll or not snap or not _SITE_ID.fullmatch(dev):
            continue
        region = _text(p.get("REGION"))
        place = (
            region
            if re.fullmatch(r"[A-Za-z][A-Za-z .'-]{1,40}", region)
            and region.lower() not in _IA_NOT_PLACE
            else ""
        )
        name = _text(p.get("Desc_")) or _text(p.get("ImageName"))
        fields = {
            "id": _slug("ia", dev),
            "name": name or f"Iowa DOT camera {dev}",
            "nearby_place": place,
            "route": _route_code(_text(p.get("Route"))),
            "latitude": ll[0],
            "longitude": ll[1],
        }
        items.append(((round(ll[0], 5), round(ll[1], 5)), (int(dev), snap), snap, fields))
    return _by_site("ia", items)


_FL_CHAN = re.compile(r"/chan-(\d{1,10})_h\.jpg$")


def parse_fl(fc: object) -> list[Camera]:
    """FL511 cameras as republished by FDEM (`FL511_Traffic_Cameras`): FDOT DIVAS
    stills. The feed's `ID` repeats, so the image's channel number is the id; a
    channel listed twice (at two spots) is kept once, at its first spot."""
    items: list[tuple[object, object, str, dict]] = []
    seen: set[str] = set()
    for f in _features(fc):
        p, ll = _props(f), _point(f)
        snap = _safe(p.get("IMAGE"), HOSTS["fl"])
        m = _FL_CHAN.search(snap)
        cam_id = m.group(1) if m else f"o{p.get('OBJECTID_1') or ''}"
        if not ll or not snap or not _SAFE_ID.fullmatch(cam_id) or cam_id in seen:
            continue
        seen.add(cam_id)
        name = _text(p.get("DESCRIPT"))
        if name.lower() in ("[not provided]", "n/a"):
            name = ""
        hwy = _text(p.get("HIGHWAY"))
        fields = {
            "id": _slug("fl", cam_id),
            "name": name or (f"{hwy} camera" if hwy else f"FL511 camera {cam_id}"),
            "county": _text(p.get("COUNTY")),
            "route": _route_code(hwy),
            "direction": _direction(p.get("DIRECTION")),
            "latitude": ll[0],
            "longitude": ll[1],
        }
        items.append(((round(ll[0], 5), round(ll[1], 5)), cam_id.zfill(10), snap, fields))
    return _by_site("fl", items)


def _encode_path(raw: object) -> str:
    """TripCheck file names contain spaces: percent-encode the path (already
    encoded parts are kept) so `_safe` can check it. Backslashes and control
    characters are refused outright rather than encoded past the check."""
    s = str(raw or "").strip()
    if not s or re.search(r"[\\\x00-\x1f\x7f]", s):
        return ""
    try:
        p = urlsplit(s)
    except ValueError:
        return ""
    path = quote(p.path, safe="/%()@&!$'*+,;=:-_.~")
    return f"{p.scheme}://{p.netloc}{path}" + (f"?{p.query}" if p.query else "")


def parse_or(fc: object) -> list[Camera]:
    """ODOT TripCheck cameras as republished daily by Oregon OEM
    (`TripCheck_Cameras`), not TripCheck's internal map data. Stills only."""
    items: list[tuple[object, object, str, dict]] = []
    for f in _features(fc):
        p, ll = _props(f), _point(f)
        snap = _safe(_encode_path(p.get("attributes_filename")), HOSTS["or"])
        cam_id = str(p.get("attributes_cameraId") or "")
        if not ll or not snap or not _SITE_ID.fullmatch(cam_id):
            continue
        title = _text(p.get("attributes_title"))
        road = _text(p.get("attributes_route"))
        route = "" if road.lower() in ("cnty", "city") else _route_code(road)
        fields = {
            "id": _slug("or", cam_id),
            "name": title or f"TripCheck camera {cam_id}",
            "route": route or _route(title),
            "latitude": ll[0],
            "longitude": ll[1],
        }
        items.append(((round(ll[0], 5), round(ll[1], 5)), int(cam_id), snap, fields))
    return _by_site("or", items)


def dedupe_by_location(cameras: list[Camera]) -> list[Camera]:
    """Drop a YIELDING_SOURCES camera at the same spot (coordinates rounded to 4
    decimals, ~10 m) as a camera from a different source (an earlier source, or Caltrans, wins), so
    one physical camera isn't listed twice. Cameras of one source never drop
    each other."""

    def spot(c: Camera) -> tuple[float, float]:
        return round(c.latitude, 4), round(c.longitude, 4)

    taken: dict[tuple[float, float], set[str]] = {}
    for c in cameras:
        if c.source not in YIELDING_SOURCES:
            taken.setdefault(spot(c), set()).add(c.source)
    out = []
    for c in cameras:
        if c.source in YIELDING_SOURCES:
            here = taken.setdefault(spot(c), set())
            if here - {c.source}:
                continue
            here.add(c.source)
        out.append(c)
    return out


# ---------- fetching ----------

IL_URL = "https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/TrafficCamerasTM_Public/FeatureServer/0"
WA_URL = "https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather/FeatureServer/0"
KY_URL = "https://services2.arcgis.com/CcI36Pduqd0OR4W9/ArcGIS/rest/services/trafficCamerasCur_Prd/FeatureServer/0"
ATIS = "https://{st}.cdn.iteris-atis.com/geojson/icons/metadata/icons.{kind}.geojson"
MO_URL = "https://traveler.modot.org/timconfig/feed/desktop/StreamingCams2.json"
MD_URL = "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getCameraMapDataJSON.do"
DE_URL = "https://tmc.deldot.gov/json/videocamera.json"
AL_URL = "https://api.algotraffic.com/v4.0/Cameras"
MI_URL = "https://mdotjboss.state.mi.us/MiDrive/camera/list"
AVO_URL = "https://avo-volcview.wr.usgs.gov/ashcam-api/webcamApi/webcams"
NDBC_URL = "https://www.ndbc.noaa.gov/buoycams.php"
OHGO_URL = "https://publicapi.ohgo.com/api/v1/cameras"
IA_URL = "https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0"
FL_URL = "https://services.arcgis.com/3wFbqsFPLeKqOlIK/arcgis/rest/services/FL511_Traffic_Cameras/FeatureServer/0"
OR_URL = "https://services.arcgis.com/uUvqNMGPm7axC2dD/arcgis/rest/services/TripCheck_Cameras/FeatureServer/0"
Fetcher = Callable[[httpx.AsyncClient, int], Awaitable[list[Camera]]]


async def _json(client: httpx.AsyncClient, url: str, max_bytes: int) -> object:
    body, _ = await fetch_capped(client, url, max_bytes=max_bytes)
    return json.loads(body)


def _plain(url: str, parse: Callable[[object], list[Camera]]) -> Fetcher:
    async def run(client: httpx.AsyncClient, max_bytes: int) -> list[Camera]:
        return parse(await _json(client, url, max_bytes))

    return run


def _arcgis(url: str, fields: str, parse: Callable[[object], list[Camera]], page: int) -> Fetcher:
    async def run(client: httpx.AsyncClient, _max_bytes: int) -> list[Camera]:
        return parse(await arcgis.fetch_layer(client, url, out_fields=fields, page_size=page))

    return run


def _atis(st: str, parse: Callable[[object], list[Camera]]) -> Fetcher:
    """Camera sites + road-weather sites (which carry cameras too), merged."""

    async def run(client: httpx.AsyncClient, max_bytes: int) -> list[Camera]:
        cams, rwis = await asyncio.gather(
            _json(client, ATIS.format(st=st, kind="cameras"), max_bytes),
            _json(client, ATIS.format(st=st, kind="rwis"), max_bytes),
        )
        return parse({"features": _features(cams) + _features(rwis)})

    return run


FETCHERS: dict[str, Fetcher] = {
    "il": _arcgis(
        IL_URL, "OBJECTID,ImgPath,CameraLocation,CameraDirection,SnapShot,TooOld", parse_il, 1000
    ),
    "wa": _arcgis(WA_URL, "OBJECTID,CameraTitle,ImageURL,CompassDirection", parse_wa, 2000),
    "ky": _arcgis(
        KY_URL,
        "OBJECTID,id,status,state,county,highway,description,direction,snapshot",
        parse_ky,
        2000,
    ),
    "sc": _plain(ATIS.format(st="sc", kind="cameras"), parse_sc),
    "sd": _atis("sd", parse_sd),
    "mt": _atis("mt", parse_mt),
    "mo": _plain(MO_URL, parse_mo),
    "md": _plain(MD_URL, parse_md),
    "de": _plain(DE_URL, parse_de),
    "al": _plain(AL_URL, parse_al),
    "mi": _plain(MI_URL, parse_mi),
    "avo": _plain(AVO_URL, parse_avo),
    "ndbc": _plain(NDBC_URL, parse_ndbc),
    "ia": _arcgis(IA_URL, "device_id,Desc_,ImageName,Route,ImageURL,REGION", parse_ia, 2000),
    "fl": _arcgis(FL_URL, "OBJECTID_1,DESCRIPT,COUNTY,HIGHWAY,DIRECTION,IMAGE", parse_fl, 2000),
    "or": _arcgis(
        OR_URL,
        "attributes_title,attributes_route,attributes_filename,attributes_cameraId",
        parse_or,
        1000,
    ),
}


class SourceError(httpx.HTTPError):
    """A sanitized upstream failure: carries no URL (keyed URLs hold the key)."""


def _iteris(st: str, key: str) -> Fetcher:
    """One call per state per refresh (Iteris allows 10 calls / 60 s per key).
    An unapproved or wrong key (HTTP 400 "Invalid Key") skips the state quietly,
    so pending keys start working on their own once approved."""
    host, _ = ITERIS[st]

    async def run(client: httpx.AsyncClient, max_bytes: int) -> list[Camera]:
        try:
            body, _ = await fetch_capped(
                client,
                f"https://{host}/api/v2/get/cameras",
                params={"key": key, "format": "json"},
                max_bytes=max_bytes,
                # a redirect would forward the key (it's in the query string)
                follow_redirects=False,
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (400, 401, 403):
                logger.warning("Iteris %s: invalid key; skipped", st.upper())
                return []
            # Re-raise without the original: its message and request carry the key.
            raise SourceError(f"HTTP {exc.response.status_code}") from None
        except httpx.HTTPError as exc:
            raise SourceError(type(exc).__name__) from None
        cams = parse_iteris(st, json.loads(body))
        # Belt and braces: never keep (and so never publish) a URL carrying the key.
        return [
            c for c in cams if all(key not in u for u in (c.snapshot_url, c.stream_url, *c.views))
        ]

    return run


def _ohgo(key: str) -> Fetcher:
    """OHGO public API. The key travels in the Authorization header (never the
    URL); a rejected key skips Ohio quietly, like Iteris."""

    async def run(client: httpx.AsyncClient, max_bytes: int) -> list[Camera]:
        try:
            body, _ = await fetch_capped(
                client,
                OHGO_URL,
                params={"page-all": "true"},
                headers={"Authorization": f"APIKEY {key}"},
                max_bytes=max_bytes,
                follow_redirects=False,
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (400, 401, 403):
                logger.warning("OHGO: invalid key; skipped")
                return []
            raise SourceError(f"HTTP {exc.response.status_code}") from None
        except httpx.HTTPError as exc:
            raise SourceError(type(exc).__name__) from None
        return parse_oh(json.loads(body))

    return run


@dataclass
class Result:
    cameras: list[Camera]
    counts: dict[str, int]  # source -> cameras parsed
    failed: list[str]  # sources that raised


async def fetch_all(
    client: httpx.AsyncClient,
    *,
    max_bytes: int,
    iteris_keys: dict[str, str] | None = None,
    ohgo_key: str = "",
    only: tuple[str, ...] | None = None,
) -> Result:
    """Fetch every source concurrently; a failing source is logged and skipped.
    `iteris_keys` ({"nv": key, ...}) adds the keyed Iteris 511 states and
    `ohgo_key` adds Ohio."""
    fetchers = dict(FETCHERS)
    for st, key in (iteris_keys or {}).items():
        if key and st in ITERIS:
            fetchers[st] = _iteris(st, key)
    if ohgo_key:
        fetchers["oh"] = _ohgo(ohgo_key)
    keys = [k for k in fetchers if only is None or k in only]
    results = await asyncio.gather(
        *(fetchers[k](client, max_bytes) for k in keys), return_exceptions=True
    )
    cams: list[Camera] = []
    counts: dict[str, int] = {}
    failed: list[str] = []
    for key, res in zip(keys, results, strict=True):
        if isinstance(res, BaseException):
            # Type only: exception text can echo the request URL.
            logger.warning("Camera source %s failed: %s", key, type(res).__name__)
            failed.append(key)
            continue
        counts[key] = len(res)
        cams.extend(res)
    return Result(cams, counts, failed)


def snapshot_allowed(camera: Camera) -> bool:
    """Whether the snapshot proxy may fetch this camera's still: https on the
    camera's *own* source hosts (not the union of every source), unchanged by
    normalization. Caltrans keeps its original *.dot.ca.gov rule."""
    hosts = ("dot.ca.gov",) if camera.source == "caltrans" else HOSTS.get(camera.source, ())
    return bool(hosts) and _safe(camera.snapshot_url, hosts) == camera.snapshot_url


async def resolves_public(host: str) -> bool:
    """True only if every address `host` resolves to is a public one, so a feed
    whose (allowlisted) name points at 10.x / 127.x / 169.254.x can't turn the
    proxy into an internal-network fetcher. Residual risk: DNS can change
    between this check and httpx's own lookup (rebinding); the host allowlist
    is the primary control."""
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, 443, type=0)
    except OSError:
        return False
    addrs = {info[4][0] for info in infos}
    return bool(addrs) and all(ipaddress.ip_address(a.split("%", 1)[0]).is_global for a in addrs)


def sources_for(cameras: list[Camera]) -> dict[str, SourceInfo]:
    """The SOURCES entries the given cameras actually use (envelope metadata)."""
    used = {c.source for c in cameras}
    return {k: v for k, v in SOURCES.items() if k in used}
