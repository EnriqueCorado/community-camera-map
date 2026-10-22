"""Parsers for the nationwide-parity pack (see parity.py).

The leading underscore keeps this helper from being loaded as a layer pack.
Pure functions over decoded JSON, each unit-tested with a small hand-written
fixture.

USGS groundwater (waterservices.usgs.gov WaterML-JSON, public domain):
  - Instantaneous Values (`/nwis/iv`): each well's newest reading of
    parameter 72019, depth to water level in feet below land surface
    (negative = above ground, a flowing well), with the site's name and the
    reading's local time.
  - Daily Values (`/nwis/dv`): daily means (statistic 00003) around the same
    day a year ago, for the year-over-year change.

Output properties match the California `groundwater` layer, so the map's
groundwater popup and depth colors work unchanged:
  depth_ft · date (the reading's local day) · change_ft (+ deeper / -
  shallower vs. ~a year ago) · since · trend (deeper | shallower | steady) ·
  name (USGS site name) · st (USPS state) · site (agency-site number)
"""

from __future__ import annotations

import datetime as dt
import re

# Year-over-year change smaller than this is "steady" (sensor noise and the
# daily swing of a pumped aquifer are often a few tenths of a foot).
STEADY_FT = 1.0
# The year-ago reading must be at least this many days before the latest one.
MIN_GAP_DAYS = 300
_AGENCY = re.compile(r"^[A-Z0-9]{2,10}$")
_SITE_NO = re.compile(r"^\d{8,15}$")


def _num(v: object) -> float | None:
    if v is None or isinstance(v, bool):
        return None
    try:
        x = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return x if x == x and abs(x) != float("inf") else None


def _date(v: object) -> str:
    """'2026-10-21T21:45:00.000-05:00' -> '2026-10-21' (the local day)."""
    s = str(v or "")[:10]
    try:
        dt.date.fromisoformat(s)
    except ValueError:
        return ""
    return s


def _series(payload: object) -> list[dict]:
    value = payload.get("value") if isinstance(payload, dict) else None
    ts = value.get("timeSeries") if isinstance(value, dict) else None
    return [t for t in ts if isinstance(t, dict)] if isinstance(ts, list) else []


def _site(t: dict) -> tuple[str, dict]:
    """('USGS-380616075380701', sourceInfo) for a time series, or ('', {})."""
    info = t.get("sourceInfo")
    codes = info.get("siteCode") if isinstance(info, dict) else None
    code = codes[0] if isinstance(codes, list) and codes and isinstance(codes[0], dict) else {}
    agency, number = str(code.get("agencyCode") or ""), str(code.get("value") or "")
    if not (_AGENCY.match(agency) and _SITE_NO.match(number)):
        return "", {}
    return f"{agency}-{number}", info


def _values(t: dict) -> list[dict]:
    """The series' readings, minus its no-data sentinel (-999999)."""
    var = t.get("variable") if isinstance(t.get("variable"), dict) else {}
    nodata = _num(var.get("noDataValue"))
    out = []
    for block in t.get("values") or []:
        for v in (block.get("value") or []) if isinstance(block, dict) else []:
            if isinstance(v, dict) and (x := _num(v.get("value"))) is not None and x != nodata:
                out.append({"v": x, "t": str(v.get("dateTime") or "")})
    return out


def iv_latest(
    payloads: list[tuple[str, object]],
) -> tuple[dict[str, tuple[float, float, float, str]], dict[str, dict]]:
    """From (USPS state, IV reply) pairs: site id -> (lon, lat, depth_ft, day)
    of its newest reading, and site id -> {name, st}. A well with two depth
    series (two sensors) keeps the newer reading."""
    best: dict[str, tuple[str, tuple[float, float, float, str]]] = {}
    sites: dict[str, dict] = {}
    for st, payload in payloads:
        for t in _series(payload):
            sid, info = _site(t)
            geo = info.get("geoLocation", {}).get("geogLocation", {}) if sid else {}
            lon, lat = _num(geo.get("longitude")), _num(geo.get("latitude"))
            vals = _values(t)
            if not sid or lon is None or lat is None or not vals:
                continue
            if not (-180 <= lon <= -60 or 130 <= lon <= 180) or not (-15 <= lat <= 72):
                continue
            last = max(vals, key=lambda v: v["t"])
            day = _date(last["t"])
            if not day or abs(last["v"]) > 5000:
                continue
            if sid not in best or last["t"] > best[sid][0]:
                best[sid] = (last["t"], (lon, lat, last["v"], day))
                sites[sid] = {"name": str(info.get("siteName") or "").strip()[:80], "st": st}
    return {k: v for k, (_, v) in best.items()}, sites


def dv_values(payloads: list[object]) -> dict[str, list[tuple[str, float]]]:
    """site id -> [(day, daily mean depth_ft), ...] from DV replies."""
    out: dict[str, list[tuple[str, float]]] = {}
    for payload in payloads:
        for t in _series(payload):
            sid, _ = _site(t)
            for v in _values(t) if sid else []:
                if day := _date(v["t"]):
                    out.setdefault(sid, []).append((day, v["v"]))
    return out


def year_ago(latest_day: str, readings: list[tuple[str, float]]) -> tuple[str, float] | None:
    """The reading closest to 365 days before `latest_day`, at least
    MIN_GAP_DAYS earlier."""
    try:
        now = dt.date.fromisoformat(latest_day)
    except ValueError:
        return None
    target = now - dt.timedelta(days=365)
    best: tuple[int, str, float] | None = None
    for day, v in readings:
        d = dt.date.fromisoformat(day)
        if (now - d).days < MIN_GAP_DAYS:
            continue
        off = abs((d - target).days)
        if best is None or off < best[0]:
            best = (off, day, v)
    return (best[1], best[2]) if best else None


def trend(change_ft: float | None) -> str:
    if change_ft is None:
        return ""
    if change_ft > STEADY_FT:
        return "deeper"
    if change_ft < -STEADY_FT:
        return "shallower"
    return "steady"


def groundwater_fc(
    latest: dict[str, tuple[float, float, float, str]],
    daily: dict[str, list[tuple[str, float]]],
    sites: dict[str, dict],
    since: str = "",
) -> dict:
    """One point per well: latest depth, its date and the change vs. ~a year
    ago. Wells whose newest reading is before `since` (offline) are left off."""
    feats = []
    for sid in sorted(latest):
        lon, lat, depth, day = latest[sid]
        if day < since:
            continue
        meta = sites.get(sid, {})
        props: dict = {
            "depth_ft": round(depth, 1),
            "date": day,
            "change_ft": None,
            "since": "",
            "trend": "",
            "name": meta.get("name", ""),
            "st": meta.get("st", ""),
            "site": sid,
        }
        old = year_ago(day, daily.get(sid, []))
        if old:
            props["change_ft"] = round(depth - old[1], 1)
            props["since"] = old[0]
            props["trend"] = trend(props["change_ft"])
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
                "properties": {k: v for k, v in props.items() if v not in ("", None)},
            }
        )
    return {"type": "FeatureCollection", "features": feats}


# --- ORNL ODIN current outages (odin.ornl.gov/odi/map?scale=COUNTY) ----------
# A JSON list, one item per county with customers out: county FIPS `id`,
# `countyName`, `stateName`, `metersOut`, the county shape in `feature`, and
# per-utility rows in `outages`. Output, per county polygon:
#   name ("Salt Lake County, Utah") · out (meters out) · utils (reporting
#   utilities, "; "-joined) · fips

_FIPS = re.compile(r"^\d{5}$")
_COUNTY_WORDS = ("County", "Parish", "Borough", "Census Area", "Municipality", "city", "City")


def _ring(ring: object) -> list[list[float]] | None:
    """A rounded, deduped ring; None if malformed or too small to keep."""
    if not isinstance(ring, list):
        return None
    out: list[list[float]] = []
    for pt in ring:
        if not isinstance(pt, list) or len(pt) < 2:
            return None
        x, y = _num(pt[0]), _num(pt[1])
        if x is None or y is None or not (-180 <= x <= 180 and -90 <= y <= 90):
            return None
        q = [round(x, 3), round(y, 3)]  # ~100 m: plenty for a county outline
        if not out or out[-1] != q:
            out.append(q)
    return out if len(out) >= 4 else None


def _polygon(rings: object) -> list | None:
    """Outer ring (required) plus whichever holes survive rounding."""
    if not isinstance(rings, list) or not rings:
        return None
    outer = _ring(rings[0])
    return [outer, *(h for h in map(_ring, rings[1:]) if h)] if outer else None


def shape(geom: object) -> dict | None:
    """A clean Polygon/MultiPolygon, or None. Islands too small to survive
    rounding are dropped rather than losing the whole county."""
    if not isinstance(geom, dict):
        return None
    kind, coords = geom.get("type"), geom.get("coordinates")
    if kind == "Polygon":
        poly = _polygon(coords)
        return {"type": kind, "coordinates": poly} if poly else None
    if kind == "MultiPolygon" and isinstance(coords, list):
        polys = [p for p in map(_polygon, coords) if p]
        return {"type": kind, "coordinates": polys} if polys else None
    return None


def county_label(county: str, state: str) -> str:
    """'Salt Lake', 'Utah' -> 'Salt Lake County, Utah' (Louisiana: Parish)."""
    county, state = county.strip(), state.strip()
    if county and not county.endswith(_COUNTY_WORDS):
        county += " Parish" if state == "Louisiana" else " County"
    return ", ".join(s for s in (county, state) if s)


def odin_counties(payload: object) -> dict:
    """ODIN's county outage summary -> county polygons with meters out."""
    if not isinstance(payload, list):
        raise ValueError("ODIN outage map: expected a list")
    feats = []
    for item in payload:
        if not isinstance(item, dict) or not _FIPS.match(str(item.get("id") or "")):
            continue
        out = _num(item.get("metersOut"))
        geom = shape(item.get("feature"))
        if not out or out <= 0 or geom is None:
            continue
        rows = item.get("outages") if isinstance(item.get("outages"), list) else []
        utils = sorted(
            {
                str(o.get("utilityName")).strip()[:60]
                for o in rows
                if isinstance(o, dict) and o.get("utilityName")
            }
        )
        county = str(item.get("countyName") or "")[:60]
        state = str(item.get("stateName") or "")[:30]
        props = {
            "name": county_label(county, state),
            "out": int(out),
            "utils": "; ".join(utils[:6]),
            "fips": str(item["id"]),
        }
        feats.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {k: v for k, v in props.items() if v not in ("", None)},
            }
        )
    feats.sort(key=lambda f: -f["properties"]["out"])
    return {"type": "FeatureCollection", "features": feats}
