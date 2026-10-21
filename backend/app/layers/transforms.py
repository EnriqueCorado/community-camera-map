"""Normalizers that turn non-GeoJSON upstreams into GeoJSON FeatureCollections.

Kept as pure functions (payload dict -> GeoJSON dict) so they're unit-testable
without network access.
"""

from __future__ import annotations

import csv
import datetime as dt
import html
import io
import json
import math
import re
import time
import unicodedata
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
    """Finite float, or None (NaN/inf would serialize to JSON the browser can't
    parse). Strings may carry thousands separators ("1,655,887", from DWR)."""
    try:
        f = float(v.replace(",", "").strip() if isinstance(v, str) else v)  # type: ignore[arg-type]
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
        feats.append(_pt(lon, lat, {"name": loc.get("locationName", ""), "message": text}))
    return _fc(feats)


def _lcs_active(closure: dict, now: float) -> bool:
    """In effect right now: crew on scene (code 10-97) and not yet picked up
    (10-98), or inside its scheduled window. The feed also lists closures
    scheduled days ahead; those are skipped."""
    if str((closure.get("code1098") or {}).get("isCode1098")) == "true":
        return False
    if str((closure.get("code1097") or {}).get("isCode1097")) == "true":
        return True
    ts = closure.get("closureTimestamp") or {}
    start, end = _num(ts.get("closureStartEpoch")), _num(ts.get("closureEndEpoch"))
    indefinite = str(ts.get("isClosureEndIndefinite")) == "true"
    return start is not None and start <= now and (indefinite or (end is not None and now <= end))


def caltrans_lcs(payload: object, now: float | None = None) -> dict:
    """Lane closures in effect now -> line segments from begin->end coordinates."""
    now = time.time() if now is None else now
    feats = []
    for rec in _records(payload):
        lcs = rec.get("lcs", {})
        if not _lcs_active(lcs.get("closure", {}) or {}, now):
            continue
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
                    "work": closure.get("typeOfWork", ""),
                    "lanes": closure.get("lanesClosed", ""),
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
    "windy.com",
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
    """USGS HIVIS camera catalog (api.waterdata.usgs.gov/nims/cameras) -> points,
    nationwide (hidden cameras dropped)."""
    feats = []
    for c in payload if isinstance(payload, list) else []:
        if not isinstance(c, dict) or c.get("hideCam"):
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
                    "state": str(c.get("stateAbrv") or "")[:2],
                    "image": f"{small}{cam_id}_newest.jpg" if small else "",
                    "page": f"https://apps.usgs.gov/hivis/camera/{cam_id}",
                    "gage": str(c.get("nwisId") or ""),
                },
            )
        )
    return _fc(feats)


# Windy re-lists most Caltrans cameras ("Modesto › South: 100 - SB SR 99 5th St").
_CALTRANS_TITLE = re.compile(r":\s*\d+\s*-\s*(NB|SB|EB|WB|[NSEW]/O)\b", re.I)
_DUP_DEG = 0.005  # ~500 m


def windy_webcams(payload: object, known: list[tuple[float, float]] | None = None) -> dict:
    """Windy Webcams API v3 `/webcams` response -> points.

    Free-tier image URLs expire after 10 minutes, so we keep only the stable
    page/player links; the popup links out to Windy's live view. Re-listed
    Caltrans cameras (by title pattern, or within ~500 m of a `known` camera
    as (lat, lon)) are dropped — they're already on the map.
    """
    rows = payload.get("webcams", []) if isinstance(payload, dict) else []
    known = known or []
    feats = []
    for w in rows:
        if not isinstance(w, dict) or str(w.get("status", "active")) != "active":
            continue
        loc = w.get("location") or {}
        lat, lon = _num(loc.get("latitude")), _num(loc.get("longitude"))
        if lat is None or lon is None:
            continue
        if _CALTRANS_TITLE.search(str(w.get("title") or "")) or any(
            abs(lat - k_lat) < _DUP_DEG and abs(lon - k_lon) < _DUP_DEG for k_lat, k_lon in known
        ):
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


def firms_hotspots(csv_text: str, bbox: tuple[float, float, float, float]) -> dict:
    """NASA FIRMS VIIRS active-fire CSV (public 24 h file) -> points in `bbox`
    (west, south, east, north). These are satellite heat detections, not
    confirmed fires."""
    w, s_, e, n = bbox
    feats = []
    for row in csv.DictReader(io.StringIO(csv_text)):
        lat, lon = _num(row.get("latitude")), _num(row.get("longitude"))
        if lat is None or lon is None or not (w <= lon <= e and s_ <= lat <= n):
            continue
        t = str(row.get("acq_time") or "").zfill(4)
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "acquired": f"{row.get('acq_date', '')}T{t[:2]}:{t[2:]}:00Z",
                    "confidence": str(row.get("confidence") or ""),
                    "frp_mw": _num(row.get("frp")),
                    "daynight": "day" if row.get("daynight") == "D" else "night",
                },
            )
        )
    return _fc(feats)


# ---------- Caltrans road weather / chain controls (all districts) ----------

_MISSING_NTCIP = {"", "65535", "255", "-1"}


# A JSON string literal, OR a `}` that is directly followed by a string (the
# missing-comma defect). Linear-time: no nested quantifiers.
_STRING_OR_BRACE = re.compile(r'"(?:[^"\\]|\\.)*"|\}(?=\s*")')


def _add_missing_comma(m: re.Match) -> str:
    return m.group(0) if m.group(0).startswith('"') else "},"


def parse_caltrans_json(body: bytes) -> dict:
    """Parse a Caltrans cwwp2 feed. Some feeds (RWIS) ship invalid JSON with
    repeated keys and no comma between them (`} "key"`). The repair walks the
    text string-aware — string literals are matched first and left untouched —
    so a `}` inside a value (e.g. sign text) is never altered."""
    text = body.decode("utf-8", errors="replace")
    try:
        data = json.loads(text)
    except ValueError:
        data = json.loads(_STRING_OR_BRACE.sub(_add_missing_comma, text))
    return data if isinstance(data, dict) else {}


def _ntcip(v: object) -> float | None:
    s = str(v if v is not None else "").strip()
    return None if s in _MISSING_NTCIP else _num(s)


def caltrans_rwis(payload: object) -> dict:
    """Road weather (RWIS) stations -> points. NTCIP units: air temperature in
    tenths of °C, wind in tenths of m/s."""
    feats = []
    for rec in _records(payload):
        r = rec.get("rwis", {}) if isinstance(rec, dict) else {}
        loc = r.get("location", {})
        lat, lon = _num(loc.get("latitude")), _num(loc.get("longitude"))
        if lat is None or lon is None or str(r.get("inService")) != "true":
            continue
        d = r.get("rwisData", {}) or {}
        temps = ((d.get("temperatureData") or {}).get("essTemperatureSensorTable")) or []
        t_c = None
        for entry in temps if isinstance(temps, list) else []:
            v = _ntcip(
                ((entry or {}).get("essTemperatureSensorEntry") or {}).get("essAirTemperature")
            )
            if v is not None:
                t_c = v / 10
                break
        wind = d.get("windData") or {}
        hum = d.get("humidityPrecipData") or {}
        ms = _ntcip(wind.get("essAvgWindSpeed"))
        gust = _ntcip(wind.get("essMaxWindGustSpeed"))
        rh = _ntcip(hum.get("essRelativeHumidity"))
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": loc.get("locationName", ""),
                    "temp_f": None if t_c is None else round(t_c * 9 / 5 + 32),
                    "wind_mph": None if ms is None else round(ms / 10 * 2.237),
                    "gust_mph": None if gust is None else round(gust / 10 * 2.237),
                    "humidity": None if rh is None or rh > 100 else round(rh),
                    "elevation_ft": _num(loc.get("elevation")),
                },
            )
        )
    return _fc(feats)


def caltrans_chain(payload: object) -> dict:
    """Chain-control checkpoints -> points with status (R-0 none … R-3)."""
    feats = []
    for rec in _records(payload):
        c = rec.get("cc", {}) if isinstance(rec, dict) else {}
        loc = c.get("location", {})
        lat, lon = _num(loc.get("latitude")), _num(loc.get("longitude"))
        if lat is None or lon is None or str(c.get("inService")) != "true":
            continue
        st = c.get("statusData", {}) or {}
        code = str(st.get("status") or "")
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": loc.get("locationName", ""),
                    "route": loc.get("route", ""),
                    "status": code if re.fullmatch(r"R-[0-3]", code) else "",
                    "detail": str(st.get("statusDescription") or "").strip(),
                },
            )
        )
    return _fc(feats)


# ---------- ArcGIS field selection ----------


def select_props(fc: object, mapping: dict[str, str]) -> dict:
    """Keep only `mapping`'s fields from an ArcGIS GeoJSON layer, renamed.
    Unknown/third-party fields (incl. editor or contact fields) never ship."""
    feats = []
    for f in fc.get("features", []) if isinstance(fc, dict) else []:
        if not isinstance(f, dict) or not f.get("geometry"):
            continue
        p = f.get("properties") or {}
        feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {new: p.get(old) for old, new in mapping.items()},
            }
        )
    return _fc(feats)


_EPA_LINK = re.compile(
    r'href="(https://cumulis\.epa\.gov/supercpad/cursites/csitinfo\.cfm\?id=\d+)"'
)


def superfund_sites(fc: object) -> dict:
    """EPA NPL sites -> name/city/status/dates + the EPA site-profile link."""
    out = select_props(
        fc,
        {
            "Site_Name": "name",
            "City": "city",
            "Status": "status",
            "Listing_Date": "listed",
            "Construction_Completion_Date": "cleanup_built",
            "Site_Progress_Profile": "_profile",
        },
    )
    for f in out["features"]:
        p = f["properties"]
        m = _EPA_LINK.search(str(p.pop("_profile") or ""))
        p["page"] = m.group(1) if m else ""
    return out


_NARA = re.compile(r"https://catalog\.archives\.gov/id/\d+")


def historic_places(fc: object) -> dict:
    """National Register of Historic Places points -> name/type/address + the
    National Archives nomination link (only if it's that exact host)."""
    out = select_props(
        fc,
        {
            "RESNAME": "name",
            "ResType": "kind",
            "Address": "address",
            "City": "city",
            "CertDate": "listed",
            "NARA_URL": "page",
        },
    )
    for f in out["features"]:
        p = f["properties"]
        p["page"] = p["page"] if isinstance(p["page"], str) and _NARA.fullmatch(p["page"]) else ""
        p["listed"] = str(p["listed"] or "").rstrip("-")
    return out


_TAG = re.compile(r"<[^<>]{0,200}>")


def strip_html(v: object) -> str:
    """Plain text from a field that sometimes carries markup (e.g. <i>…</i>)."""
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub("", str(v or "")))).strip()


_HMDB = re.compile(r"https?://(?:www\.)?hmdb\.org/m\.asp\?m=(\d+)")


def historical_markers(fc: object) -> dict:
    """HMdb markers -> title/subtitle/year/erected-by/where + an https HMdb link."""
    out = select_props(
        fc,
        {
            "Title": "name",
            "Add_l_Subtitle": "subtitle",
            "Year_Erected": "built",
            "Erected_By": "erected_by",
            "Location": "where",
            "Link": "page",
        },
    )
    for f in out["features"]:
        p = f["properties"]
        for k in ("name", "subtitle", "erected_by", "where"):
            p[k] = strip_html(p.get(k))
        m = _HMDB.fullmatch(str(p.get("page") or ""))
        p["page"] = f"https://www.hmdb.org/m.asp?m={m.group(1)}" if m else ""
    return out


# ---------- OpenStreetMap places (Overpass) ----------


def osm_points(
    payload: object,
    region: tuple[float, float, float, float] | None = None,
    max_features: int = 5000,
) -> dict:
    """Overpass `out center tags` JSON -> points (nodes, and centers of ways),
    keeping a small set of useful tags and a link to the OSM object. Points
    outside `region` (south, west, north, east) are dropped and the count is
    capped — a misbehaving mirror can't plant pins elsewhere or flood the layer."""
    els = payload.get("elements", []) if isinstance(payload, dict) else []
    feats = []
    for el in els:
        if len(feats) >= max_features:
            break
        if not isinstance(el, dict):
            continue
        center = el.get("center") or {}
        lat = _num(el.get("lat")) if el.get("lat") is not None else _num(center.get("lat"))
        lon = _num(el.get("lon")) if el.get("lon") is not None else _num(center.get("lon"))
        if lat is None or lon is None:
            continue
        if region and not (region[0] <= lat <= region[2] and region[1] <= lon <= region[3]):
            continue
        tags = el.get("tags") or {}
        osm_type, osm_id = str(el.get("type") or ""), el.get("id")
        sockets = sorted(
            k[7:].replace("_", " ")
            for k, v in tags.items()
            if re.fullmatch(r"socket:[a-z0-9_]+", k) and v != "no"
        )
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": tags.get("name") or tags.get("operator") or tags.get("brand") or "",
                    "access": tags.get("access", ""),
                    "hours": tags.get("opening_hours", ""),
                    "indoor": tags.get("indoor") == "yes" or tags.get("location") == "indoor",
                    "fee": tags.get("fee", ""),
                    "wheelchair": tags.get("wheelchair", ""),
                    "capacity": _num(tags.get("capacity")),
                    "sockets": ", ".join(sockets),
                    "page": (
                        f"https://www.openstreetmap.org/{osm_type}/{int(osm_id)}"
                        if osm_type in ("node", "way", "relation") and isinstance(osm_id, int)
                        else ""
                    ),
                },
            )
        )
    return _fc(feats)


VOTING_KINDS = ("drop-box", "outdoor-drop-box", "vote-center", "curbside")


def voting_locations(payload: object, today: dt.date | None = None) -> dict:
    """The curated county voting-locations file -> points (geocoded entries
    only). Empty once the election is over, so old sites never linger."""
    if not isinstance(payload, dict):
        return _fc([])
    try:
        election = dt.date.fromisoformat(str(payload.get("election", "")))
    except ValueError:
        return _fc([])
    if (today or dt.date.today()) > election:
        return _fc([])
    locs = payload.get("locations", [])
    feats = []
    for loc in locs:
        if not isinstance(loc, dict) or loc.get("kind") not in VOTING_KINDS:
            continue
        lat, lon = loc.get("lat"), loc.get("lon")
        if not isinstance(lat, int | float) or not isinstance(lon, int | float):
            continue
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "name": str(loc.get("name", "")),
                    "kind": loc["kind"],
                    "address": str(loc.get("address", "")),
                    "city": str(loc.get("city", "")),
                    "hours": str(loc.get("hours", "")),
                    "opens": str(loc.get("opens", "")),
                },
            }
        )
    return _fc(feats)


LEGAL_KINDS = (
    "immigration",
    "housing",
    "general",
    "seniors",
    "family",
    "workers",
    "court-self-help",
    "consumer",
)
LEGAL_COSTS = ("free", "low-cost", "varies")


def legal_help(payload: object) -> dict:
    """The curated free/low-cost legal help directory -> points. Only entries
    with a known kind, coordinates and an https source survive, so a half-
    filled record never puts a pin in the wrong place."""
    if not isinstance(payload, dict):
        return _fc([])
    checked = str(payload.get("checked", ""))
    feats = []
    for org in payload.get("offices", []):
        if not isinstance(org, dict):
            continue
        kinds = [k for k in org.get("kinds", []) if k in LEGAL_KINDS]
        lat, lon = org.get("lat"), org.get("lon")
        sources = [
            u for u in org.get("sources", []) if isinstance(u, str) and u.startswith("https://")
        ]
        if not kinds or not sources:
            continue
        if not isinstance(lat, int | float) or not isinstance(lon, int | float):
            continue
        website = str(org.get("website", ""))
        cost = org.get("cost")
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "id": str(org.get("id", "")),
                    "name": str(org.get("name", "")),
                    # "|"-joined: MapLibre hands array properties back as JSON text.
                    "kinds": "|".join(kinds),
                    "address": str(org.get("address", "")),
                    "city": str(org.get("city", "")),
                    "zip": str(org.get("zip", "")),
                    "phone": str(org.get("phone", "")),
                    "website": website if website.startswith("https://") else "",
                    "languages": "|".join(str(x) for x in org.get("languages", [])),
                    "cost": cost if cost in LEGAL_COSTS else "varies",
                    "eoir": org.get("eoir_recognized") is True,
                    "note_en": str(org.get("note_en", "")),
                    "note_es": str(org.get("note_es", "")),
                    "checked": str(org.get("checked", checked)),
                },
            )
        )
    return _fc(feats)


def power_outages(fc: object) -> dict:
    """Cal OES outages -> utility / customers / cause / times, with the
    utilities' many type labels ("Not Planned", "Planned maintenance",
    "Unknown", ...) folded into planned | unplanned | unknown."""
    out = select_props(
        fc,
        {
            "UtilityCompany": "utility",
            "ImpactedCustomers": "customers",
            "Cause": "cause",
            "StartDate": "started",
            "EstimatedRestoreDate": "restore_eta",
            "OutageType": "type",
        },
    )
    for f in out["features"]:
        t = str(f["properties"]["type"] or "").strip().lower()
        f["properties"]["type"] = (
            "unplanned"
            if t.startswith(("not planned", "unplanned"))
            else "planned"
            if t.startswith("planned")
            else "unknown"
        )
    return out


def reservoirs(fc: object) -> dict:
    """DWR reservoir storage -> name / % full / % of average / storage."""
    out = select_props(
        fc,
        {
            "Reservoir_Name": "name",
            "Percent_Capacity": "pct_full",
            "Water_Percent_of_Average": "pct_avg",
            "Storage_AF": "storage_af",
            "Capacity_AF": "capacity_af",
            "Date_Time": "as_of",
            "OperatingAgency": "operator",
        },
    )
    for f in out["features"]:
        p = f["properties"]
        for k in ("pct_full", "pct_avg", "storage_af", "capacity_af"):
            p[k] = _num(p[k])
        p["label"] = f"{p['pct_full']:.0f}%" if p["pct_full"] is not None else ""
    return out


WVAL_LEVELS = ("Very Low", "Low", "Moderate", "High", "Very High")
WVAL_PATHOGENS = {"SARS-CoV-2": "covid", "Influenza A virus": "flu", "RSV": "rsv"}


# CDC still lists Connecticut's eight old counties; TIGER now has planning
# regions instead, so those get fixed centers (approximate county centroids).
CT_OLD_COUNTIES = {
    "fairfield": (-73.39, 41.27),
    "hartford": (-72.73, 41.81),
    "litchfield": (-73.25, 41.79),
    "middlesex": (-72.52, 41.43),
    "new haven": (-72.90, 41.35),
    "new london": (-72.10, 41.47),
    "tolland": (-72.34, 41.86),
    "windham": (-71.99, 41.83),
}


def county_key(name: object) -> str:
    """'Saint Louis City' / 'St. Louis city' / 'Doña Ana' / 'Du Page' -> one key."""
    s = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\bsaint\b", "st", s)
    s = re.sub(r"\s+(county|parish|borough|census area|municipality)$", "", s.strip())
    return re.sub(r"[.'\s-]", "", s)


def wastewater_counties(rows: object, counties: object, states: object) -> dict:
    """CDC wastewater viral activity (one row per site and virus, naming the
    counties each plant serves) -> one point per county at its center, with the
    worst current level per virus among the plants serving it. A plant whose
    list names a county outside its own state (e.g. Kansas City, MO listing
    Johnson and Wyandotte, KS) is skipped rather than misplaced."""
    state_fips = {}
    for s in states if isinstance(states, list) else []:
        a = (s or {}).get("attributes") or {}
        if a.get("NAME") and a.get("STATE"):
            state_fips[str(a["NAME"]).strip().lower()] = str(a["STATE"])
    centers: dict[tuple[str, str], tuple[float, float, str]] = {}
    for c in counties if isinstance(counties, list) else []:
        a = (c or {}).get("attributes") or {}
        lat, lon = _num(a.get("CENTLAT")), _num(a.get("CENTLON"))
        if not (a.get("STATE") and a.get("BASENAME")) or lat is None or lon is None:
            continue
        st, name = str(a["STATE"]), str(a.get("NAME") or a["BASENAME"])
        # Index by full name ("Alexandria city") and by base name ("Alexandria");
        # on a base-name clash (Baltimore city / County) the county wins.
        centers[(st, county_key(name))] = (lon, lat, name)
        base = (st, county_key(a["BASENAME"]))
        if base not in centers or "city" not in name.lower():
            centers[base] = (lon, lat, name)
    for name, (lon, lat) in CT_OLD_COUNTIES.items():
        centers.setdefault(("09", county_key(name)), (lon, lat, f"{name.title()} County"))
    latest: dict[tuple[str, str], dict] = {}  # newest row per (site, virus)
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict):
            continue
        k = (str(r.get("site", "")), str(r.get("pathogen_target", "")))
        if k not in latest or str(r.get("week_end", "")) > str(latest[k].get("week_end", "")):
            latest[k] = r
    worst: dict[tuple[str, str], dict] = {}
    for r in latest.values():
        key = WVAL_PATHOGENS.get(str(r.get("pathogen_target", "")))
        level = str(r.get("site_wval_category", ""))
        fips = state_fips.get(str(r.get("state_territory", "")).strip().lower())
        if not key or level not in WVAL_LEVELS or not fips:
            continue
        names = [n for n in str(r.get("counties_served", "")).split(",") if n.strip()]
        keys = [(fips, county_key(n)) for n in names]
        if not keys or any(ck not in centers for ck in keys):
            continue  # a cross-state plant, or a name we can't place: don't guess
        for ck in keys:
            w = worst.setdefault(ck, {"sites": set(), "week": ""})
            w["sites"].add(str(r.get("site", "")))
            w["week"] = max(w["week"], str(r.get("week_end", ""))[:10])
            if key not in w or WVAL_LEVELS.index(level) > WVAL_LEVELS.index(w[key]):
                w[key] = level
    feats = []
    for ck, w in worst.items():
        lon, lat, name = centers[ck]
        props = {"county": name or "", "sites": len(w["sites"]), "week": w["week"]}
        for key in WVAL_PATHOGENS.values():
            props[key] = w.get(key, "")
        props["worst"] = max(
            (w[k] for k in WVAL_PATHOGENS.values() if k in w),
            key=WVAL_LEVELS.index,
            default="",
        )
        feats.append(_pt(lon, lat, props))
    return _fc(feats)


def groundwater_wells(recent: object, prior: object) -> dict:
    """DWR periodic groundwater levels: each well's latest depth to water
    (feet below ground) and, when there's a reading at least ~10 months
    earlier, how much deeper (+) or shallower (-) the water is now."""
    before = {}
    for r in prior if isinstance(prior, list) else []:
        if isinstance(r, dict) and r.get("site_code"):
            before[str(r["site_code"])] = r
    feats = []
    for r in recent if isinstance(recent, list) else []:
        if not isinstance(r, dict):
            continue
        lat, lon, depth = _num(r.get("latitude")), _num(r.get("longitude")), _num(r.get("gse_gwe"))
        if lat is None or lon is None or depth is None or not (-125 < lon < -113 and 32 < lat < 43):
            continue
        date = str(r.get("msmt_date", ""))[:10]
        props = {
            "depth_ft": round(depth, 1),
            "date": date,
            "use": str(r.get("well_use") or ""),
            "county": str(r.get("county_name") or ""),
            "well_depth_ft": _num(r.get("well_depth")),
            "change_ft": None,
            "since": "",
        }
        b = before.get(str(r.get("site_code")))
        old = _num(b.get("gse_gwe")) if b else None
        old_date = str(b.get("msmt_date", ""))[:10] if b else ""
        if old is not None and old_date and date:
            try:
                gap = (dt.date.fromisoformat(date) - dt.date.fromisoformat(old_date)).days
            except ValueError:
                gap = 0
            if gap >= 300:
                props["change_ft"] = round(depth - old, 1)
                props["since"] = old_date
        feats.append(_pt(lon, lat, props))
    return _fc(feats)


def aqi_category(aqi: float | None) -> str:
    """EPA AQI band (same keys as the frontend's aqiCategory)."""
    if aqi is None:
        return ""
    for top, cat in (
        (50, "good"),
        (100, "moderate"),
        (150, "usg"),
        (200, "unhealthy"),
        (300, "very"),
    ):
        if aqi <= top:
            return cat
    return "hazardous"


def airnow_monitors(fc: object) -> dict:
    """EPA AirNow current monitors (public ArcGIS, no key) -> AQI points."""
    out = select_props(
        fc,
        {
            "SiteName": "name",
            "OZONEPM_AQI": "aqi",
            "PM25": "pm2_5",
            "OZONE": "ozone_ppb",
            "Status": "_status",
        },
    )
    keep = []
    for f in out["features"]:
        p = f["properties"]
        aqi = _num(p.pop("aqi"))
        if p.pop("_status") not in (None, "Active") or aqi is None or aqi < 0:
            continue
        aqi = round(aqi)  # band and label from the same (rounded) number
        p.update(aqi=aqi, category=aqi_category(aqi), label=str(aqi))
        keep.append(f)
    return _fc(keep)


RIVER_FIELDS = {
    "gaugelid": "gauge",
    "status": "status",
    "location": "location",
    "waterbody": "waterbody",
    "state": "state",
    "obstime": "observed_at",
    "observed": "stage",
    "units": "units",
    "action": "action",
    "flood": "flood",
    "moderate": "moderate",
    "major": "major",
    "url": "page",
}


def river_gauges(fc: object) -> dict:
    """NOAA river gauges with flood status; links only to water.noaa.gov."""
    out = select_props(fc, RIVER_FIELDS)
    for f in out["features"]:
        p = f["properties"]
        page = str(p.get("page") or "")
        p["page"] = page if page.startswith("https://water.noaa.gov/") else ""
    return out


STORM_FIELDS = {
    "descript": "kind",
    "magnitude": "magnitude",
    "units": "units",
    "loc_desc": "where",
    "state": "state",
    "lsr_validtime": "time",
    "remarks": "remarks",
}


def storm_reports(fc: object) -> dict:
    """NWS local storm reports (tornado, hail, wind, flooding...) past 24 h."""
    return select_props(fc, STORM_FIELDS)


def fire_weather(fc: object) -> dict:
    """SPC day-1 fire weather outlook: dn 5 elevated, 8 critical, 10 extreme."""
    out = select_props(fc, {"dn": "level", "expire": "expires"})
    out["features"] = [f for f in out["features"] if _num(f["properties"]["level"]) in (5, 8, 10)]
    return out


VOLCANO_COLORS = ("GREEN", "YELLOW", "ORANGE", "RED")


def volcanoes(locations: object, monitored: object) -> dict:
    """USGS-monitored volcanoes with their current aviation color code and
    alert level (joined by volcano number); links only to USGS pages."""
    status = {}
    for m in monitored if isinstance(monitored, list) else []:
        if isinstance(m, dict) and m.get("vnum"):
            status[str(m["vnum"])] = m
    feats = []
    for f in (locations or {}).get("features", []) if isinstance(locations, dict) else []:
        p = (f or {}).get("properties") or {}
        geom = (f or {}).get("geometry") or {}
        m = status.get(str(p.get("vnum", "")))
        coords = geom.get("coordinates") if geom.get("type") == "Point" else None
        if not m or not isinstance(coords, list) or len(coords) < 2:
            continue
        lon, lat = _num(coords[0]), _num(coords[1])
        if lon is None or lat is None:
            continue
        color = str(m.get("color_code") or "").upper()
        page = str(m.get("notice_url") or "")
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": str(m.get("volcano_name") or p.get("volcanoName") or ""),
                    "color": color if color in VOLCANO_COLORS else "UNASSIGNED",
                    "alert": str(m.get("alert_level") or ""),
                    "observatory": str(m.get("obs_fullname") or ""),
                    "since": str(m.get("sent_utc") or "")[:19],  # last notice (UTC)
                    "page": page if page.startswith("https://volcanoes.usgs.gov/") else "",
                },
            )
        )
    return _fc(feats)
