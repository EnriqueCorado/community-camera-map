"""Parsers for the state-feed bakes (national/state_bakes.py). Pure functions
over already-downloaded bodies, so each one is unit-tested with a small
hand-written fixture and never touches the network.

Privacy rules applied here, not left to the caller:
  - child care: centers only. Family and group family day-care homes (a
    person's name at a home address) are dropped by program type, never
    published; provider/director names are never read.
  - burn bans and reservoirs carry no people at all.
"""

from __future__ import annotations

import datetime as dt
import html
import re

from ._services_parse import clean, phone, smart_title

# --- shared ---------------------------------------------------------------------


def _num(v: object) -> float | None:
    try:
        n = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return n if n == n and abs(n) != float("inf") else None  # NaN/inf -> None


def _in_us(lon: float, lat: float) -> bool:
    return (-180 <= lon <= -60 or 130 <= lon <= 180) and -15 <= lat <= 72 and (lon, lat) != (0, 0)


def _point(lon: object, lat: object, props: dict) -> dict | None:
    x, y = _num(lon), _num(lat)
    if x is None or y is None or not _in_us(x, y):
        return None
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(x, 5), round(y, 5)]},
        "properties": {k: v for k, v in props.items() if v not in ("", None)},
    }


def fc(features: list) -> dict:
    return {"type": "FeatureCollection", "features": [f for f in features if f]}


# --- Arkansas Forestry Division: burn bans + wildfire danger (HTML page) --------

_AR_ASOF = re.compile(r"as of\s+(\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}\s*[AP]M)", re.I)
# "Burn Ban Counties (52)" / "High Risk Counties (69)", then a comma list.
_AR_LIST = re.compile(
    r"(Burn Ban|Low Risk|Moderate Risk|High Risk|Extreme Risk) Counties \((\d+)\)"
)
DANGER_ORDER = ("Low", "Moderate", "High", "Extreme")


def county_key(name: str) -> str:
    """'Saint Francis' / 'St. Francis County' / 'ST FRANCIS' -> 'st francis'."""
    s = clean(name).lower().replace(".", "")
    s = re.sub(r"\s+(county|parish)$", "", s)
    s = re.sub(r"^saint\s+", "st ", s)
    return re.sub(r"[^a-z ]", "", s).strip()


def _page_text(body: str) -> str:
    body = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", body)
    body = re.sub(r"(?s)<img\b[^>]*>", " ", body)  # the page inlines a huge base64 PNG
    text = html.unescape(re.sub(r"<[^>]+>", "\n", body))
    return re.sub(r"[ \t\xa0]+", " ", text)


def ar_burn_bans(body: str) -> tuple[str, dict[str, dict]]:
    """(as_of, county_key -> {"ban": bool, "danger": "High"...}) from the
    Forestry Division's Fire_Info page. Each list's stated count must match
    the names parsed, so a layout change fails loudly instead of mis-mapping."""
    text = _page_text(body)
    m = _AR_ASOF.search(text)
    if not m:
        raise ValueError("Arkansas burn bans: 'as of' date not found")
    as_of = clean(m[1])
    out: dict[str, dict] = {}
    heads = list(_AR_LIST.finditer(text))
    if not any(h[1] == "Burn Ban" for h in heads):
        raise ValueError("Arkansas burn bans: burn-ban list not found")
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        chunk = text[h.end() : end].strip()
        line = chunk.split("\n", 1)[0] if int(h[2]) else ""
        names = [clean(n) for n in line.split(",") if clean(n)]
        if len(names) != int(h[2]):
            raise ValueError(f"Arkansas burn bans: {h[1]} lists {len(names)} of {h[2]} counties")
        for n in names:
            row = out.setdefault(county_key(n), {"ban": False, "danger": ""})
            if h[1] == "Burn Ban":
                row["ban"] = True
            else:
                row["danger"] = h[1].split(" ")[0]
    return as_of, out


def ar_county_features(counties: dict, status: dict[str, dict], as_of: str) -> list[dict]:
    """Counties under a burn ban (TIGERweb polygons, NAME = 'Pulaski County'),
    with that county's wildfire danger level."""
    feats = []
    matched = set()
    for f in counties.get("features", []):
        props = f.get("properties") or {}
        key = county_key(props.get("NAME") or props.get("BASENAME") or "")
        row = status.get(key)
        if not row or not row["ban"] or not f.get("geometry"):
            continue
        matched.add(key)
        danger = row["danger"]
        feats.append(
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "name": clean(props.get("NAME")) or smart_title(key) + " County",
                    "status": "Burn ban in effect",
                    "danger": f"{danger} wildfire danger" if danger else "",
                    "as_of": as_of,
                },
            }
        )
    banned = {k for k, v in status.items() if v["ban"]}
    if banned - matched:
        raise ValueError(f"Arkansas burn bans: unknown counties {sorted(banned - matched)}")
    for f in feats:
        f["properties"] = {k: v for k, v in f["properties"].items() if v}
    return feats


# --- Reservoirs: Water Data for Texas (TWDB) + USDA NRCS AWDB (West) -------------


def _reservoir(
    lon: object,
    lat: object,
    name: str,
    storage: float | None,
    capacity: float | None,
    as_of: str,
    operator: str = "",
    pct_avg: float | None = None,
    state: str = "",
) -> dict | None:
    if storage is None or capacity is None or capacity <= 0 or storage < 0:
        return None
    pct = round(100 * storage / capacity, 1)
    if pct > 200:  # a unit or capacity mismatch upstream, not a real reading
        return None
    return _point(
        lon,
        lat,
        {
            "name": clean(name),
            "pct_full": pct,
            "pct_avg": round(pct_avg) if pct_avg is not None else None,
            "storage_af": round(storage),
            "capacity_af": round(capacity),
            "as_of": as_of,
            "operator": operator,
            "state": state,
            "label": f"{round(pct)}%",
        },
    )


def twdb_reservoirs(doc: object, today: dt.date) -> list[dict]:
    """Water Data for Texas recent-conditions.json: {short_name: {...}} with
    conservation storage/capacity and the gauge's GeoJSON point. Readings
    older than 30 days are left out (a gauge that stopped reporting)."""
    if not isinstance(doc, dict):
        raise ValueError("Water Data for Texas: expected an object")
    feats = []
    for r in doc.values():
        if not isinstance(r, dict):
            continue
        try:
            day = dt.date.fromisoformat(str(r.get("timestamp"))[:10])
        except ValueError:
            continue
        if (today - day).days > 30:
            continue
        coords = (r.get("gauge_location") or {}).get("coordinates") or [None, None]
        feats.append(
            _reservoir(
                coords[0],
                coords[1],
                r.get("full_name") or r.get("short_name") or "",
                _num(r.get("conservation_storage")),
                _num(r.get("conservation_capacity")),
                day.isoformat(),
                state="TX",
            )
        )
    return [f for f in feats if f]


def awdb_latest(rows: object) -> dict[str, dict]:
    """AWDB /data reply -> triplet -> its latest non-null value row."""
    out: dict[str, dict] = {}
    for r in rows if isinstance(rows, list) else []:
        for d in (r or {}).get("data", []) if isinstance(r, dict) else []:
            vals = [v for v in d.get("values", []) if _num(v.get("value")) is not None]
            if vals:
                out[str(r.get("stationTriplet"))] = vals[-1]
    return out


def awdb_reservoirs(
    stations: object, daily: dict[str, dict], monthly: dict[str, dict], today: dt.date
) -> list[dict]:
    """NRCS reservoir stations (network BOR: Reclamation, Corps, irrigation and
    city reservoirs across the West) with their latest storage: a daily
    reading from the last 14 days, else last month's end-of-month storage
    (which also carries the month's historical average -> pct_avg)."""
    feats = []
    for s in stations if isinstance(stations, list) else []:
        if not isinstance(s, dict):
            continue
        meta = s.get("reservoirMetadata") or {}
        cap = _num(meta.get("usableCapacity")) or _num(meta.get("capacity"))
        trip = str(s.get("stationTriplet"))
        d, m = daily.get(trip), monthly.get(trip)
        storage = as_of = None
        pct_avg = None
        if d:
            try:
                day = dt.date.fromisoformat(str(d.get("date"))[:10])
            except ValueError:
                day = None
            if day and (today - day).days <= 14:
                storage, as_of = _num(d.get("value")), day.isoformat()
        if storage is None and m:
            try:
                month = dt.date(int(m["year"]), int(m["month"]), 1)
            except (KeyError, TypeError, ValueError):
                month = None
            if month and (today - month).days <= 75:
                storage = _num(m.get("value"))
                as_of = f"end of {month:%b %Y}"
                avg = _num(m.get("average"))
                if storage is not None and avg:
                    pct_avg = 100 * storage / avg
        if storage is None or as_of is None:
            continue
        feats.append(
            _reservoir(
                s.get("longitude"),
                s.get("latitude"),
                s.get("name") or "",
                storage,
                cap,
                as_of,
                pct_avg=pct_avg,
                state=clean(s.get("stateCode")),
            )
        )
    return [f for f in feats if f]


# --- Licensed child care centers (state Socrata datasets) ----------------------

# NY OCFS program types: centers and school-age programs. FDC (family day
# care) and GFDC (group family day care) are homes and are never kept.
NY_CENTER_TYPES = {
    "DCC": "Day care center",
    "SDCC": "Small day care center",
    "SACC": "School-age child care",
}
NY_ACTIVE = {"License", "Registration"}


def ny_child_care(rows: object) -> list[dict]:
    feats = []
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict):
            continue
        kind = NY_CENTER_TYPES.get(clean(r.get("program_type")))
        if not kind or clean(r.get("facility_status")) not in NY_ACTIVE:
            continue
        street = clean(f"{clean(r.get('street_number'))} {clean(r.get('street_name'))}")
        feats.append(
            _point(
                r.get("longitude"),
                r.get("latitude"),
                {
                    "name": clean(r.get("facility_name")),
                    "address": street,
                    "city": clean(r.get("city")),
                    "phone": phone(r.get("phone_number")),
                    "kind": kind,
                    "capacity": int(_num(r.get("total_capacity")) or 0) or None,
                },
            )
        )
    return [f for f in feats if f]


PA_CENTER = "Child Care Center"  # not Family/Group Child Care Home, not "Other"


def pa_child_care(rows: object) -> list[dict]:
    feats = []
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict) or clean(r.get("provider_type")) != PA_CENTER:
            continue
        # geocoded_column is the facility; geocoded_column_1 is the legal
        # entity's (owner's) address and is never used.
        coords = (r.get("geocoded_column") or {}).get("coordinates") or [None, None]
        stars = clean(r.get("star_level"))
        feats.append(
            _point(
                coords[0],
                coords[1],
                {
                    "name": smart_title(clean(r.get("facility_name"))),
                    "address": smart_title(clean(r.get("facility_address"))),
                    "city": smart_title(clean(r.get("facility_city"))),
                    "phone": phone(r.get("facility_phone")),
                    "kind": "Child care center",
                    "capacity": int(_num(r.get("capacity")) or 0) or None,
                    "quality": stars if stars.startswith("STAR") else "",
                },
            )
        )
    return [f for f in feats if f]


TX_CENTER = "Licensed Center"  # never Licensed/Registered Child-Care Homes or Listed Family Homes
_TX_ZIP = re.compile(r"^(\d{5})")


def tx_child_care(rows: object) -> list[dict]:
    """HHSC child care operations -> geocoder records (no coordinates in the
    source): operating licensed centers only, keyed by operation number."""
    out = []
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict) or clean(r.get("operation_type")) != TX_CENTER:
            continue
        if clean(r.get("operation_status")) != "Y" or clean(r.get("temporarily_closed")) == "YES":
            continue
        street, city = clean(r.get("address_line")), clean(r.get("city"))
        zm = _TX_ZIP.match(clean(r.get("zipcode")))
        if not street or not city:
            continue
        out.append(
            {
                "id": clean(r.get("operation_number")) or clean(r.get("operation_id")),
                "name": clean(r.get("operation_name")),
                "a": smart_title(street),
                "c": smart_title(city),
                "s": "TX",
                "zip": zm[1] if zm else "",
                "phone": phone(r.get("phone_number")),
                "kind": "Licensed child care center",
                "capacity": int(_num(r.get("total_capacity")) or 0) or None,
                "hours": clean(r.get("hours_of_operation")),
                "subsidy": "yes" if clean(r.get("accepts_child_care_subsidies")) == "Y" else "",
            }
        )
    return out


def tx_feature(rec: dict, lon: float, lat: float) -> dict | None:
    """A geocoded HHSC record in the same property names as NY/PA."""
    return _point(
        lon,
        lat,
        {
            "id": rec["id"],
            "name": rec["name"],
            "address": rec["a"],
            "city": rec["c"],
            "phone": rec.get("phone"),
            "kind": rec.get("kind"),
            "capacity": rec.get("capacity"),
            "hours": rec.get("hours"),
            "subsidy": rec.get("subsidy"),
        },
    )
