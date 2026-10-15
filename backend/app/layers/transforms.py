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
