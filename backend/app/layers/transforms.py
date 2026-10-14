"""Normalizers that turn non-GeoJSON upstreams into GeoJSON FeatureCollections.

Kept as pure functions (payload dict -> GeoJSON dict) so they're unit-testable
without network access.
"""

from __future__ import annotations

import math
import re
from urllib.parse import urlparse, urlunparse


def _fc(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


def _pt(lon: float, lat: float, props: dict) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
        "properties": props,
    }


def _num(v: object) -> float | None:
    """Finite float, or None (NaN/inf would serialize to JSON the browser can't parse)."""
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _records(payload: object) -> list:
    """Safely pull the `data` array from a possibly-malformed upstream payload."""
    return payload.get("data", []) if isinstance(payload, dict) else []


def caltrans_cms(payload: object) -> dict:
    """Changeable message signs -> points with the current message text."""
    feats = []
    for rec in _records(payload):
        cms = rec.get("cms", {})
        loc = cms.get("location", {})
        lat, lon = _num(loc.get("latitude")), _num(loc.get("longitude"))
        if lat is None or lon is None:
            continue
        msg = cms.get("message", {})
        lines = [
            (msg.get("phase1", {}) or {}).get(k, "")
            for k in ("phase1Line1", "phase1Line2", "phase1Line3")
        ]
        text = " ".join(x for x in lines if x).strip() or (msg.get("display") or "Blank")
        feats.append(
            _pt(lon, lat, {"name": loc.get("locationName", ""), "message": text})
        )
    return _fc(feats)


def caltrans_lcs(payload: object) -> dict:
    """Lane closures -> line segments from begin->end coordinates."""
    feats = []
    for rec in _records(payload):
        lcs = rec.get("lcs", {})
        loc = lcs.get("location", {})
        begin, end = loc.get("begin", {}), loc.get("end", {})
        blon, blat = _num(begin.get("beginLongitude")), _num(begin.get("beginLatitude"))
        elon, elat = _num(end.get("endLongitude")), _num(end.get("endLatitude"))
        if blon is None or blat is None:
            continue
        coords = [[round(blon, 5), round(blat, 5)]]
        if elon is not None and elat is not None:
            coords.append([round(elon, 5), round(elat, 5)])
        geom = (
            {"type": "LineString", "coordinates": coords}
            if len(coords) == 2
            else {"type": "Point", "coordinates": coords[0]}
        )
        closure = lcs.get("closure", {})
        feats.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "route": begin.get("beginRoute", ""),
                    "type": closure.get("typeOfClosure", closure.get("closureType", "")),
                },
            }
        )
    return _fc(feats)


def usgs_nwis(payload: object) -> dict:
    """USGS NWIS instantaneous-values JSON -> one point per site with latest
    streamflow (cfs) and gage height (ft)."""
    if not isinstance(payload, dict):
        return _fc([])
    sites: dict[str, dict] = {}
    for ts in (payload.get("value") or {}).get("timeSeries", []):
        info = ts.get("sourceInfo", {})
        code = (info.get("siteCode") or [{}])[0].get("value")
        geo = info.get("geoLocation", {}).get("geogLocation", {})
        lat, lon = _num(geo.get("latitude")), _num(geo.get("longitude"))
        if not code or lat is None or lon is None:
            continue
        var = (ts.get("variable", {}).get("variableCode") or [{}])[0].get("value")
        no_data = _num(ts.get("variable", {}).get("noDataValue"))
        values = (ts.get("values") or [{}])[0].get("value", [])
        latest = _num(values[-1].get("value")) if values else None
        if latest is not None and no_data is not None and latest == no_data:
            latest = None  # gauge offline / missing reading sentinel (e.g. -999999)
        site = sites.setdefault(code, {"name": info.get("siteName", ""), "lon": lon, "lat": lat})
        if var == "00060":
            site["streamflow_cfs"] = latest
        elif var == "00065":
            site["gage_height_ft"] = latest
    feats = [
        _pt(s["lon"], s["lat"], {k: v for k, v in s.items() if k not in ("lon", "lat")})
        for s in sites.values()
    ]
    return _fc(feats)


def nid_dams(payload: object) -> dict:
    """USACE National Inventory of Dams query JSON -> points."""
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("results") or payload.get("data") or []
    else:
        rows = []
    feats = []
    for d in rows:
        lat, lon = _num(d.get("latitude")), _num(d.get("longitude"))
        if lat is None or lon is None:
            continue
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": d.get("name", ""),
                    "hazard": d.get("hazardPotential") or d.get("publicHazardId", ""),
                    "height_ft": d.get("nidHeight"),
                },
            )
        )
    return _fc(feats)


# ---------- public webcams ----------

# Image hosts we'll hand to the browser. Anything else (or non-https) is dropped:
# the page is served over https, and we only link to official camera operators.
# Mirrored in frontend/src/popup-logic.ts (which re-checks before rendering).
WEBCAM_IMAGE_HOSTS = ("cameras.alertcalifornia.org", "usgs-nims-images.s3.amazonaws.com")
WEBCAM_PAGE_HOSTS = (
    "cameras.alertcalifornia.org",
    "www.alertwildfire.org",
    "alertwildfire.org",
    "apps.usgs.gov",
    "www.windy.com",
    "webcams.windy.com",
)


def _https_on(url: object, hosts: tuple[str, ...]) -> str:
    """A normalized https URL on an allowlisted host, else "".

    Rejects anything Python and browsers might parse differently (backslashes,
    whitespace/control chars, userinfo, explicit ports), and returns a URL
    rebuilt from its parsed parts rather than the raw string.
    """
    u = str(url or "").strip()
    if not u or re.search(r"[\\\s\x00-\x1f]", u):
        return ""
    try:
        p = urlparse(u)
        ok = (
            p.scheme == "https"
            and p.hostname in hosts
            and p.username is None
            and p.password is None
            and p.port is None
        )
    except ValueError:  # e.g. malformed bracketed host
        return ""
    return urlunparse(("https", p.hostname, p.path, "", p.query, "")) if ok else ""


def fire_cameras(fc: object) -> dict:
    """Cal OES consolidated webcams (GeoJSON) -> California wildfire cameras only.

    Keeps ALERTCalifornia / ALERTWildfire cameras in California (Caltrans
    cameras in the same layer are already on the map), with a cleaned set of
    properties.
    """
    networks = {"Alert California": "ALERTCalifornia", "Alert Wildfire": "ALERTWildfire"}
    feats = []
    for f in fc.get("features", []) if isinstance(fc, dict) else []:
        if not isinstance(f, dict):
            continue
        p = f.get("properties") or {}
        geom = f.get("geometry") or {}
        network = networks.get(str(p.get("Source") or "").strip())
        state = str(p.get("State") or "").strip().upper()
        coords = geom.get("coordinates")
        if not network or state not in ("CA", "CALIFORNIA") or geom.get("type") != "Point":
            continue
        if not isinstance(coords, list) or len(coords) < 2:
            continue
        lon, lat = _num(coords[0]), _num(coords[1])
        if lon is None or lat is None:
            continue
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": str(p.get("Location") or "").strip(),
                    "network": network,
                    "county": str(p.get("County") or "").strip().title(),
                    "image": _https_on(p.get("Thumbnail_Url"), WEBCAM_IMAGE_HOSTS),
                    "page": _https_on(p.get("Webcam_URL"), WEBCAM_PAGE_HOSTS),
                },
            )
        )
    return _fc(feats)


def usgs_cameras(payload: object) -> dict:
    """USGS HIVIS camera catalog (api.waterdata.usgs.gov/nims/cameras) -> CA points."""
    feats = []
    for c in payload if isinstance(payload, list) else []:
        if not isinstance(c, dict) or c.get("stateAbrv") != "CA" or c.get("hideCam"):
            continue
        cam_id = str(c.get("camId") or "")
        lat, lon = _num(c.get("lat")), _num(c.get("lng"))
        # Must contain a letter, so ids like ".." can't form odd paths.
        if not re.fullmatch(r"(?=.*[A-Za-z])[A-Za-z0-9_.-]+", cam_id) or lat is None or lon is None:
            continue
        small = _https_on(c.get("smallDir"), WEBCAM_IMAGE_HOSTS)
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": str(c.get("camName") or cam_id).strip(),
                    "network": "USGS",
                    "image": f"{small}{cam_id}_newest.jpg" if small else "",
                    "page": f"https://apps.usgs.gov/hivis/camera/{cam_id}",
                    "gage": str(c.get("nwisId") or ""),
                },
            )
        )
    return _fc(feats)


def windy_webcams(payload: object) -> dict:
    """Windy Webcams API v3 `/webcams` response -> points.

    Free-tier image URLs expire after 10 minutes, so we keep only the stable
    page/player links; the popup links out to Windy's live view.
    """
    rows = payload.get("webcams", []) if isinstance(payload, dict) else []
    feats = []
    for w in rows:
        if not isinstance(w, dict) or str(w.get("status", "active")) != "active":
            continue
        loc = w.get("location") or {}
        lat, lon = _num(loc.get("latitude")), _num(loc.get("longitude"))
        if lat is None or lon is None:
            continue
        urls = w.get("urls") or {}
        player = w.get("player") or {}
        page = _https_on(urls.get("detail"), WEBCAM_PAGE_HOSTS) or _https_on(
            player.get("day") or player.get("live"), WEBCAM_PAGE_HOSTS
        )
        if not page:  # no image either (expiring), so nothing useful to show
            continue
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": str(w.get("title") or "").strip(),
                    "network": "Windy",
                    "county": str(loc.get("city") or "").strip(),
                    "image": "",
                    "page": page,
                },
            )
        )
    return _fc(feats)


# readsb `dbFlags` bits: 1 military, 2 interesting, 4 PIA, 8 LADD.
ADSB_PIA = 4
ADSB_LADD = 8


def _round(v: object) -> int | None:
    n = _num(v)
    return None if n is None else round(n)


def adsb_flights(payload: object) -> dict:
    """adsb.fi / readsb `aircraft` JSON -> points.

    Keeps only what an aircraft broadcasts about its flight (callsign, type,
    altitude, speed, heading); owner/operator and registration fields are
    dropped. A private plane's callsign is often its tail number, so aircraft
    whose owners opted out of tracking (FAA LADD, or a PIA privacy address)
    are excluded entirely. Missing values stay None (never "0 ft").
    """
    rows = payload.get("aircraft", []) if isinstance(payload, dict) else []
    feats = []
    for a in rows:
        if not isinstance(a, dict):
            continue
        flags = a.get("dbFlags")
        if isinstance(flags, int) and flags & (ADSB_PIA | ADSB_LADD):
            continue
        lat, lon = _num(a.get("lat")), _num(a.get("lon"))
        if lat is None or lon is None:
            continue
        alt = a.get("alt_baro")
        on_ground = alt == "ground"
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "callsign": str(a.get("flight") or "").strip(),
                    "type": str(a.get("desc") or a.get("t") or "").strip(),
                    "alt_ft": 0 if on_ground else _round(alt),
                    "on_ground": on_ground,
                    "speed_kt": _round(a.get("gs")),
                    "track": _round(a.get("track")),
                },
            )
        )
    fc = _fc(feats)
    # When these positions were true (lets the browser glide dots forward).
    now = _num(payload.get("now")) if isinstance(payload, dict) else None
    if now is not None:
        fc["generated_at"] = now
    return fc
