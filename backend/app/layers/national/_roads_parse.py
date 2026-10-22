"""Pure normalizers for the nationwide road-operations pack (roads.py).

Every function takes an already-parsed upstream payload (untrusted: any shape)
and returns GeoJSON features with one small, fixed set of properties, so the
popups in MapView.tsx work the same for every source:

  work zones / incidents ("roadops"): route, type, impact, lanes, detail,
      direction, start, end, state, source, page
  message signs ("info"): name, message, road, state, source
  road weather ("roadweather"): name, temp_f, surface_f, wind_mph, gust_mph,
      humidity, state, source

Only these fields are copied: WZDx worker-presence data, CHART responder /
participant lists, contact names and e-mails are never kept.
"""

from __future__ import annotations

import datetime as dt
import html
import json
import math
import re
from zoneinfo import ZoneInfo

DETAIL_MAX = 140  # characters of description kept per event
NAME_MAX = 120
MESSAGE_MAX = 300
COORD_DP = 5  # ~1 m; lines are simplified first
SIMPLIFY_DEG = 0.0002  # Douglas-Peucker tolerance (~20 m)
SOON_S = 24 * 3600  # keep events starting within this many seconds
EASTERN = ZoneInfo("America/New_York")

# WZDx vehicle_impact values the popup translates (anything else is dropped).
IMPACTS = {
    "all-lanes-closed",
    "some-lanes-closed",
    "all-lanes-open",
    "alternating-one-way",
    "some-lanes-closed-merge-left",
    "some-lanes-closed-merge-right",
    "all-lanes-open-shift-left",
    "all-lanes-open-shift-right",
    "some-lanes-closed-split",
    "flagging",
    "temporary-traffic-signal",
}
_DIRS = {
    "n": "north",
    "s": "south",
    "e": "east",
    "w": "west",
    "nb": "north",
    "sb": "south",
    "eb": "east",
    "wb": "west",
    "north": "north",
    "south": "south",
    "east": "east",
    "west": "west",
    "northbound": "north",
    "southbound": "south",
    "eastbound": "east",
    "westbound": "west",
    "both": "both",
    "both directions": "both",
    "both-directions": "both",
}
_TAG = re.compile(r"<[^>]{0,200}>")
_WS = re.compile(r"\s+")
# Feeds sometimes append a staff contact ("Contact: FDOT Jane Doe 727-555-0100"):
# cut from "Contact" on, and drop any phone number or e-mail address left over.
_CONTACT = re.compile(
    r"\b(?:(?:emergency\s+)?contacts?|POC|point of contact)\b[^:\-]{0,30}[:\-].*|\bname\s*:.*", re.I
)
_PHONE = re.compile(r"\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b(?:\s*(?:x|ext\.?)\s*\d{1,6})?", re.I)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_HTTPS = re.compile(r"https://[a-z0-9.-]+(?:[/?][\w./?=&%-]*)?\Z", re.I)


# ---------- small helpers ----------


def fc(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


def text(v: object, limit: int = DETAIL_MAX) -> str:
    """Plain, single-line, length-capped text (tags/entities, staff contacts,
    phone numbers and e-mail addresses removed)."""
    if v is None or isinstance(v, dict | list | bool):
        return ""
    s = _WS.sub(" ", html.unescape(_TAG.sub(" ", str(v))))
    s = _EMAIL.sub("", _PHONE.sub("", _CONTACT.sub("", s)))
    s = _WS.sub(" ", s).strip().rstrip(" ,;:-(")
    if len(s) <= limit:
        return s
    cut = s[: limit - 1]
    return (cut.rsplit(" ", 1)[0] if " " in cut[limit // 2 :] else cut).rstrip(" ,;:-") + "…"


def num(v: object) -> float | None:
    if isinstance(v, bool):
        return None
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def direction(v: object) -> str:
    return _DIRS.get(text(v, 40).lower(), "")


def page(url: object) -> str:
    """An official https link, or "" (the frontend re-checks its host)."""
    s = str(url or "").strip()
    return s if _HTTPS.match(s) else ""


def _ll(lon: object, lat: object) -> list[float] | None:
    x, y = num(lon), num(lat)
    if x is None or y is None or not (-180 <= x <= 180 and -90 <= y <= 90):
        return None
    if x == 0 and y == 0:
        return None
    return [x, y]


def when(v: object, naive_tz: dt.tzinfo = dt.UTC, *, end: bool = False) -> dt.datetime | None:
    """ISO 8601 text or epoch seconds/milliseconds -> aware datetime. A bare
    date as an `end` means the end of that day."""
    if v is None or v == "" or isinstance(v, bool):
        return None
    if isinstance(v, int | float):
        if not math.isfinite(v) or v <= 0:  # Iteris writes year 1 as -62135596800
            return None
        secs = v / 1000 if v > 1e11 else v
        try:
            return dt.datetime.fromtimestamp(secs, dt.UTC)
        except (OverflowError, OSError, ValueError):
            return None
    s = str(v).strip()
    if end and re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        s += "T23:59:59"
    # .NET writes 7 fractional digits; fromisoformat takes at most 6
    s = re.sub(r"(\.\d{6})\d+", r"\1", s).replace("Z", "+00:00")
    try:
        d = dt.datetime.fromisoformat(s)
    except ValueError:
        return None
    if d.year < 1971:
        return None
    return d if d.tzinfo else d.replace(tzinfo=naive_tz)


def iso(d: dt.datetime | None) -> str:
    return d.astimezone(dt.UTC).strftime("%Y-%m-%dT%H:%MZ") if d else ""


def in_window(start: dt.datetime | None, end: dt.datetime | None, now: dt.datetime) -> bool:
    """Active now, or starting within SOON_S. No start = treat as started."""
    if end is not None and end < now:
        return False
    return start is None or (start - now).total_seconds() <= SOON_S


def _rdp(pts: list[list[float]], eps: float) -> list[list[float]]:
    """Douglas-Peucker (iterative), keeps the endpoints."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy)
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            x0, y0 = pts[i]
            d = (
                abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norm
                if norm
                else math.hypot(x0 - x1, y0 - y1)
            )
            if d > best:
                best, idx = d, i
        if idx > 0 and best > eps:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep, strict=True) if k]


def _clean_line(coords: object) -> list[list[float]]:
    pts: list[list[float]] = []
    for c in coords if isinstance(coords, list) else []:
        if isinstance(c, list | tuple) and len(c) >= 2 and (p := _ll(c[0], c[1])):
            if not pts or pts[-1] != p:
                pts.append(p)
    pts = _rdp(pts, SIMPLIFY_DEG)
    out: list[list[float]] = []
    for x, y in pts:
        p = [round(x, COORD_DP), round(y, COORD_DP)]
        if not out or out[-1] != p:
            out.append(p)
    return out


def geometry(geom: object) -> dict | None:
    """Any GeoJSON point/line geometry -> a simplified Point / LineString /
    MultiLineString (a MultiPoint of begin/end points becomes a line)."""
    if not isinstance(geom, dict):
        return None
    kind, coords = geom.get("type"), geom.get("coordinates")
    if kind == "Point" and isinstance(coords, list) and len(coords) >= 2:
        p = _ll(coords[0], coords[1])
        return point(p) if p else None
    if kind in ("LineString", "MultiPoint"):
        return line([_clean_line(coords)])
    if kind == "MultiLineString" and isinstance(coords, list):
        return line([_clean_line(part) for part in coords])
    return None


def point(p: list[float]) -> dict:
    return {"type": "Point", "coordinates": [round(p[0], COORD_DP), round(p[1], COORD_DP)]}


def line(parts: list[list[list[float]]]) -> dict | None:
    parts = [p for p in parts if p]
    if not parts:
        return None
    lines = [p for p in parts if len(p) >= 2]
    if not lines:
        return {"type": "Point", "coordinates": parts[0][0]}
    if len(lines) == 1:
        return {"type": "LineString", "coordinates": lines[0]}
    return {"type": "MultiLineString", "coordinates": lines}


def decode_polyline(s: object) -> list[list[float]]:
    """Google encoded polyline (precision 5) -> [[lon, lat], ...]."""
    if not isinstance(s, str) or not s or len(s) > 200_000:
        return []
    out, i, lat, lon = [], 0, 0, 0
    try:
        while i < len(s):
            vals = []
            for _ in range(2):
                shift = result = 0
                while True:
                    b = ord(s[i]) - 63
                    i += 1
                    result |= (b & 0x1F) << shift
                    shift += 5
                    if b < 0x20:
                        break
                vals.append(~(result >> 1) if result & 1 else result >> 1)
            lat += vals[0]
            lon += vals[1]
            out.append([lon / 1e5, lat / 1e5])
    except IndexError:
        return []
    return out


def feature(geom: dict, props: dict) -> dict:
    return {
        "type": "Feature",
        "geometry": geom,
        "properties": {k: v for k, v in props.items() if v not in (None, "")},
    }


def road_event(
    geom: dict,
    *,
    route: object,
    kind: str,
    impact: str = "",
    lanes: object = "",
    detail: object = "",
    dir_: object = "",
    start: dt.datetime | None = None,
    end: dt.datetime | None = None,
    state: str = "",
    source: str = "",
    link: str = "",
) -> dict:
    return feature(
        geom,
        {
            "route": text(route, 80),
            "type": kind,
            "impact": impact if impact in IMPACTS else "",
            "lanes": text(lanes, 80),
            "detail": text(detail),
            "direction": direction(dir_),
            "start": iso(start),
            "end": iso(end),
            "state": state,
            "source": source,
            "page": page(link),
        },
    )


# ---------- WZDx (v3.x and v4.x) ----------


def wzdx_payload(body: bytes) -> object:
    """Parse a WZDx feed body (one feed double-encodes it as a JSON string)."""
    data = json.loads(body)
    if isinstance(data, str):
        data = json.loads(data)
    return data


def wzdx_events(
    payload: object, now: dt.datetime, *, state: str, source: str, link: str = ""
) -> list[dict]:
    """Work zones (and restrictions) in effect now or within 24 h. v4 keeps
    the event fields in `core_details`; v3 has them at the top level."""
    if not isinstance(payload, dict):
        return []
    out = []
    for f in payload.get("features") or []:
        if not isinstance(f, dict) or not isinstance(f.get("properties"), dict):
            continue
        p = f["properties"]
        core = p.get("core_details") if isinstance(p.get("core_details"), dict) else p
        kind = str(core.get("event_type") or p.get("event_type") or "")
        if kind not in ("work-zone", "restriction"):
            continue  # detours are alternate routes, not closures
        if str(p.get("event_status") or "").lower() in ("completed", "cancelled", "canceled"):
            continue
        start, end = when(p.get("start_date")), when(p.get("end_date"), end=True)
        if not in_window(start, end, now):
            continue
        geom = geometry(f.get("geometry"))
        if geom is None:
            continue
        roads = core.get("road_names")
        roads = roads if isinstance(roads, list) else [roads] if roads else []
        route = " / ".join(dict.fromkeys(text(r, 60) for r in roads if text(r, 60)))
        out.append(
            road_event(
                geom,
                route=route,
                kind="work-zone" if kind == "work-zone" else "restriction",
                impact=str(p.get("vehicle_impact") or ""),
                lanes=_wzdx_lanes(p.get("lanes")),
                detail=core.get("description") or core.get("name"),
                dir_=core.get("direction"),
                start=start,
                end=end,
                state=state,
                source=source,
                link=link,
            )
        )
    return out


def _wzdx_lanes(lanes: object) -> str:
    """'1 of 3 lanes closed' from a WZDx lanes list (general lanes only)."""
    if not isinstance(lanes, list):
        return ""
    general = [ln for ln in lanes if isinstance(ln, dict) and ln.get("type") == "general"]
    closed = [ln for ln in general if ln.get("status") == "closed"]
    return f"{len(closed)} of {len(general)} lanes closed" if closed and general else ""


# ---------- Iteris 511 (/api/v2/get/event, /api/v2/get/messagesigns) ----------

_ROADWORK = re.compile(
    r"\b(?:road ?work|construction|maintenance|paving|bridge (?:work|repair|maintenance)|"
    r"utility work|gas ?main)",
    re.I,
)
_CRASH = re.compile(r"\b(?:crash|accident|collision|overturn|injur|fatal)", re.I)
_WEATHER = re.compile(r"\b(?:weather|flood|washout|snow|ice|icy|wind|fog)\b", re.I)


def _iteris_kind(rec: dict) -> str:
    et = str(rec.get("EventType") or "")
    orig = str(rec.get("OriginalEventType") or "")
    sub = str(rec.get("EventSubType") or rec.get("Subtype") or "")
    if "roadwork" in (et, orig):
        return "work-zone"
    if _CRASH.search(sub):
        return "crash"
    if _ROADWORK.search(sub):
        return "work-zone"
    if et == "specialEvents" or orig.lower() == "specialevents":
        return "special-event"
    if et == "weatherConditions" or _WEATHER.search(sub):
        return "weather"
    if et == "closures":
        return "closure"
    return "incident"


def iteris_events(
    rows: object, now: dt.datetime, *, state: str, source: str, link: str
) -> list[dict]:
    """Iteris 511 events in effect now (or within 24 h). `type` is work-zone,
    closure, crash, incident, special-event or weather."""
    out = []
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict):
            continue
        start, end = when(r.get("StartDate")), when(r.get("PlannedEndDate"), end=True)
        if not in_window(start, end, now):
            continue
        p1 = _ll(r.get("Longitude"), r.get("Latitude"))
        if not p1:
            continue
        pts = decode_polyline(r.get("EncodedPolyline"))
        if len(pts) < 2 and (p2 := _ll(r.get("LongitudeSecondary"), r.get("LatitudeSecondary"))):
            pts = [p1, p2]
        geom = line([_clean_line(pts)]) if len(pts) >= 2 else None
        lanes = text(r.get("LanesAffected"), 80)
        out.append(
            road_event(
                geom or point(p1),
                route=r.get("RoadwayName"),
                kind=_iteris_kind(r),
                impact="all-lanes-closed" if r.get("IsFullClosure") is True else "",
                lanes="" if lanes.lower() in ("no data", "unknown") else lanes,
                detail=r.get("Description"),
                dir_=r.get("DirectionOfTravel"),
                start=start,
                end=end,
                state=state,
                source=source,
                link=link,
            )
        )
    return out


def _sign_text(pages: object) -> str:
    """Sign pages -> one line: lines joined by spaces, pages by ' / '."""
    if isinstance(pages, str):
        pages = [pages]
    msgs = []
    for pg in pages if isinstance(pages, list) else []:
        t = text(pg, MESSAGE_MAX)
        if t and t.upper() not in ("NO_MESSAGE", "BLANK", "NONE") and t not in msgs:
            msgs.append(t)
    return text(" / ".join(msgs), MESSAGE_MAX)


def iteris_signs(rows: object, *, state: str, source: str) -> list[dict]:
    out = []
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict) or not (p := _ll(r.get("Longitude"), r.get("Latitude"))):
            continue
        road = text(r.get("Roadway"), 60)
        out.append(
            feature(
                point(p),
                {
                    "name": text(r.get("Name") or r.get("DeviceDescription"), NAME_MAX),
                    "message": _sign_text(r.get("Messages")),
                    "road": "" if road.lower() == "unknown" else road,
                    "state": state,
                    "source": source,
                },
            )
        )
    return out


# ---------- OHGO (Ohio DOT public API, /api/v1/...) ----------

_OHGO_STATUS = {"closed": "all-lanes-closed", "restricted": "some-lanes-closed"}


def _results(payload: object) -> list:
    rows = payload.get("results") if isinstance(payload, dict) else None
    return rows if isinstance(rows, list) else []


def ohgo_construction(payload: object, now: dt.datetime, *, source: str, link: str) -> list[dict]:
    """OHGO construction (dates are Ohio local time, without an offset)."""
    out = []
    for r in _results(payload):
        if not isinstance(r, dict):
            continue
        start = when(r.get("startDate"), EASTERN)
        end = when(r.get("endDate"), EASTERN, end=True)
        if not in_window(start, end, now):
            continue
        zones = r.get("workZones") if isinstance(r.get("workZones"), list) else []
        geom = line([_clean_line(z.get("polyline")) for z in zones if isinstance(z, dict)])
        if geom is None:
            p = _ll(r.get("longitude"), r.get("latitude"))
            if not p:
                continue
            geom = point(p)
        out.append(
            road_event(
                geom,
                route=r.get("routeName") or r.get("location"),
                kind="work-zone",
                impact=_OHGO_STATUS.get(str(r.get("status") or "").lower(), ""),
                detail=r.get("description"),
                dir_=r.get("direction"),
                start=start,
                end=end,
                state="OH",
                source=source,
                link=link,
            )
        )
    return out


def ohgo_incidents(payload: object, *, source: str, link: str) -> list[dict]:
    out = []
    for r in _results(payload):
        if not isinstance(r, dict) or not (p := _ll(r.get("longitude"), r.get("latitude"))):
            continue
        cat = str(r.get("category") or "")
        kind = (
            "crash"
            if _CRASH.search(cat)
            else "work-zone"
            if _ROADWORK.search(cat) or "repair" in cat.lower()
            else "weather"
            if _WEATHER.search(cat)
            else "incident"
        )
        out.append(
            road_event(
                point(p),
                route=r.get("routeName") or r.get("location"),
                kind=kind,
                impact=_OHGO_STATUS.get(str(r.get("roadStatus") or "").lower(), ""),
                detail=r.get("description"),
                dir_=r.get("direction"),
                state="OH",
                source=source,
                link=link,
            )
        )
    return out


def ohgo_signs(payload: object, *, source: str) -> list[dict]:
    out = []
    for r in _results(payload):
        if not isinstance(r, dict) or not (p := _ll(r.get("longitude"), r.get("latitude"))):
            continue
        out.append(
            feature(
                point(p),
                {
                    "name": text(r.get("location"), NAME_MAX),
                    "message": _sign_text(r.get("messages")),
                    "state": "OH",
                    "source": source,
                },
            )
        )
    return out


def _temp_f(v: object) -> float | None:
    t = num(v)
    return round(t) if t is not None and -60 <= t <= 160 else None


def _speed(v: object) -> float | None:
    s = num(v)
    return round(s) if s is not None and 0 <= s <= 250 else None


def ohgo_weather(payload: object, *, source: str) -> list[dict]:
    """OHGO weather sensor sites (°F, mph). The site name carries a district /
    station code prefix ('D01 OH002F HAR SR235 16.00- SR235 @ SR309')."""
    out = []
    for r in _results(payload):
        if not isinstance(r, dict) or not (p := _ll(r.get("longitude"), r.get("latitude"))):
            continue
        atm = r.get("atmosphericSensors") if isinstance(r.get("atmosphericSensors"), list) else []
        a = atm[0] if atm and isinstance(atm[0], dict) else {}
        surf = r.get("surfaceSensors") if isinstance(r.get("surfaceSensors"), list) else []
        s_t = next(
            (
                t
                for s in surf
                if isinstance(s, dict) and (t := _temp_f(s.get("surfaceTemperature"))) is not None
            ),
            None,
        )
        name = text(r.get("location"), NAME_MAX)
        name = name.split("- ", 1)[1].strip() if "- " in name else name
        rh = num(a.get("humidity"))
        out.append(
            feature(
                point(p),
                {
                    "name": name,
                    "temp_f": _temp_f(a.get("airTemperature", r.get("averageAirTemperature"))),
                    "surface_f": s_t,
                    "wind_mph": _speed(a.get("averageWindSpeed")),
                    "gust_mph": _speed(a.get("maximumWindSpeed")),
                    "humidity": round(rh) if rh is not None and 0 <= rh <= 100 else None,
                    "state": "OH",
                    "source": source,
                },
            )
        )
    return out


# ---------- Maryland CHART exports ----------


def _chart_rows(payload: object) -> list:
    rows = payload.get("data") if isinstance(payload, dict) else None
    return rows if isinstance(rows, list) else []


_MD_ROUTE = re.compile(r"\b(I-?\s?\d{1,3}|US\s?\d{1,3}|MD\s?\d{1,4})\b")


def chart_events(payload: object, *, source: str, link: str) -> list[dict]:
    """CHART open events (incidents, disabled vehicles, debris, signal
    outages). Responder, participant and vehicle fields are not copied."""
    out = []
    for r in _chart_rows(payload):
        if not isinstance(r, dict) or r.get("closed") is True:
            continue
        if not (p := _ll(r.get("lon"), r.get("lat"))):
            continue
        desc = text(r.get("description") or r.get("name"))
        typ = str(r.get("incidentType") or "")
        kind = (
            "crash"
            if _CRASH.search(typ) or "property damage" in typ.lower()
            else "weather"
            if _WEATHER.search(typ)
            else "work-zone"
            if _ROADWORK.search(typ)
            else "incident"
        )
        m = _MD_ROUTE.search(desc)
        out.append(
            road_event(
                point(p),
                route=m.group(1) if m else "",
                kind=kind,
                lanes=r.get("lanesStatus"),
                detail=desc,
                dir_=r.get("direction"),
                start=when(r.get("startDateTime")),
                state="MD",
                source=source,
                link=link,
            )
        )
    return out


def chart_signs(payload: object, *, source: str) -> list[dict]:
    out = []
    for r in _chart_rows(payload):
        if not isinstance(r, dict) or str(r.get("commMode") or "").upper() != "ONLINE":
            continue
        if not (p := _ll(r.get("lon"), r.get("lat"))):
            continue
        out.append(
            feature(
                point(p),
                {
                    "name": text(r.get("description") or r.get("name"), NAME_MAX),
                    "message": _sign_text(r.get("msgPlain")),
                    "state": "MD",
                    "source": source,
                },
            )
        )
    return out


_FIRST_NUM = re.compile(r"-?\d+(?:\.\d+)?")


def _first(v: object) -> float | None:
    m = _FIRST_NUM.search(str(v or ""))
    return float(m.group(0)) if m else None


def chart_weather(payload: object, *, source: str) -> list[dict]:
    """CHART road weather stations ('55F', 'N 3 MPH', '64%', '66F to 66F')."""
    out = []
    for r in _chart_rows(payload):
        if not isinstance(r, dict) or not (p := _ll(r.get("lon"), r.get("lat"))):
            continue
        rh = _first(r.get("relativeHumidity"))
        out.append(
            feature(
                point(p),
                {
                    "name": text(r.get("description") or r.get("name"), NAME_MAX),
                    "temp_f": _temp_f(_first(r.get("airTemp"))),
                    "surface_f": _temp_f(_first(r.get("pavementTemp"))),
                    "wind_mph": _speed(_first(r.get("windDescription"))),
                    "gust_mph": _speed(_first(r.get("gustSpeed"))),
                    "humidity": round(rh) if rh is not None and 0 <= rh <= 100 else None,
                    "state": "MD",
                    "source": source,
                },
            )
        )
    return out


# ---------- Alabama ALGO Traffic (api.algotraffic.com/v4.0) ----------

_ALGO_KIND = {"roadwork": "work-zone", "crash": "crash", "facility": "closure"}
ALGO_HOST = "www.algotraffic.com"


def _algo_link(v: object, fallback: str) -> str:
    s = page(v)
    return (
        s
        if s.startswith(f"https://{ALGO_HOST}/") or s.startswith(f"https://{ALGO_HOST}?")
        else fallback
    )


def algo_events(payload: object, now: dt.datetime, *, source: str, link: str) -> list[dict]:
    out = []
    for r in payload if isinstance(payload, list) else []:
        if not isinstance(r, dict) or r.get("active") is False:
            continue
        start, end = when(r.get("start")), when(r.get("end"), end=True)
        if not in_window(start, end, now):
            continue
        a = r.get("startLocation") if isinstance(r.get("startLocation"), dict) else {}
        b = r.get("endLocation") if isinstance(r.get("endLocation"), dict) else {}
        p1 = _ll(a.get("longitude"), a.get("latitude"))
        if not p1:
            continue
        p2 = _ll(b.get("longitude"), b.get("latitude"))
        geom = line([_clean_line([p1, p2])]) if p2 and p2 != p1 else point(p1)
        title, desc = text(r.get("title"), 80), text(r.get("description"))
        out.append(
            road_event(
                geom or point(p1),
                route=a.get("displayRouteDesignator"),
                kind=_ALGO_KIND.get(str(r.get("type") or "").lower(), "incident"),
                impact="all-lanes-closed" if r.get("severity") == "Closed" else "",
                lanes=r.get("shortSubTitle"),
                detail=f"{title}. {desc}" if title and desc else title or desc,
                dir_=a.get("direction"),
                start=start,
                end=end,
                state="AL",
                source=source,
                link=_algo_link(r.get("permLink"), link),
            )
        )
    return out


def algo_signs(payload: object, *, source: str) -> list[dict]:
    out = []
    for r in payload if isinstance(payload, list) else []:
        if not isinstance(r, dict):
            continue
        loc = r.get("location") if isinstance(r.get("location"), dict) else {}
        if not (p := _ll(loc.get("longitude"), loc.get("latitude"))):
            continue
        pages = []
        for pg in r.get("pages") if isinstance(r.get("pages"), list) else []:
            lines = pg.get("lines") if isinstance(pg, dict) else None
            pages.append(
                " ".join(
                    text(ln.get("text"), 80)
                    for ln in (lines if isinstance(lines, list) else [])
                    if isinstance(ln, dict)
                )
            )
        road = text(loc.get("displayRouteDesignator"), 40)
        cross = text(loc.get("displayCrossStreet"), 60)
        name = " ".join(x for x in (road, text(loc.get("direction"), 12)) if x)
        out.append(
            feature(
                point(p),
                {
                    "name": f"{name} @ {cross}" if name and cross else name or cross,
                    "message": _sign_text(pages),
                    "road": road,
                    "state": "AL",
                    "source": source,
                },
            )
        )
    return out
