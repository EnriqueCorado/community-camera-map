"""Parsers for the "where to get help" offices pack (see help_offices.py).

The leading underscore keeps this helper from being loaded as a layer pack.

Pure functions over downloaded text/JSON, each unit-tested with a small
hand-written fixture. Explicit allowlists only: office names, street
addresses, public office lines, hours and the program's website. Never a
person's name, email or personal phone (SSA and LSC carry none; the
allowlists keep it that way if one ever does). Find Local Help does list
people (agents/brokers, counselor-named sites): see its section below.

Social Security offices use the services pack's compact names (n name ·
a street · c city · s state · p public phone · t type · d hours · x 1 =
approximate location). Legal aid service areas are polygons drawn with the
map's generic popup, so they keep its readable names (name · phone · web).
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import math
import re

from . import _services_parse as sp

# --- Social Security field offices & resident stations (SSA open data) ------

SSA_COLUMNS = ("OFFICE CODE", "OFFICE NAME", "ADDRESS LINE 3", "CITY", "STATE", "ZIP CODE")
SSA_DAYS = ("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY")
_DAY_ABBR = ("Mon", "Tue", "Wed", "Thu", "Fri")
# Field Office Support Units: back-office teams that share a public field
# office's address and number; nobody can visit them.
_BACK_OFFICE = re.compile(r"^\s*FOSU\b", re.I)
_RS = re.compile(r"\s+RS$")
_BUILDING = {"SOCIAL SECURITY", "SOCIAL SECURITY ADMINISTRATION"}


def _cell(v: object) -> str:
    """A CSV cell without the NUL padding some SSA rows carry."""
    return sp.clean(str(v or "").replace("\x00", ""))


def ssa_hours(row: dict[str, str]) -> str:
    """Weekday hours, grouped: 'Mon-Fri 9:00 AM-4:00 PM' or
    'Mon, Tue, Thu, Fri 9:00 AM-4:00 PM; Wed closed'. '' if never open."""
    groups: dict[str, list[str]] = {}
    for day, abbr in zip(SSA_DAYS, _DAY_ABBR, strict=True):
        start, end = _cell(row.get(f"{day} OPEN TIME")), _cell(row.get(f"{day} CLOSE TIME"))
        if not start or start.upper() == "CLOSED":
            span = "closed"
        else:
            span = f"{start}-{end}" if end and end.upper() != "CLOSED" else f"from {start}"
        groups.setdefault(span, []).append(abbr)
    if list(groups) == ["closed"]:
        return ""
    parts = []
    for span, days in sorted(groups.items(), key=lambda kv: (kv[0] == "closed", -len(kv[1]))):
        label = "Mon-Fri" if len(days) == 5 else ", ".join(days)
        parts.append(f"{label} {span}")
    return "; ".join(parts)


def ssa_offices(text: str, resident_station: bool = False) -> list[dict]:
    """Rows of SSA's field-office (or resident-station) CSV -> records for the
    geocoder (`zip` is dropped after geocoding). Offices closed every weekday
    and back-office support units are left out."""
    reader = csv.DictReader(io.StringIO(text.replace("\x00", "")))
    header = [sp.clean(h) for h in reader.fieldnames or []]
    if not all(c in header for c in SSA_COLUMNS):
        raise ValueError(f"SSA office file: unexpected columns {header[:8]}")
    out = []
    for raw in reader:
        row = {sp.clean(k): v for k, v in raw.items() if k}
        name = _cell(row.get("OFFICE NAME"))
        state = _cell(row.get("STATE")).upper()
        street = _cell(row.get("ADDRESS LINE 3"))
        if not name or not street or not re.fullmatch(r"[A-Z]{2}", state):
            continue
        if _BACK_OFFICE.match(name):
            continue
        hours = ssa_hours(row)
        if not hours:
            continue  # closed all week (temporarily or for good)
        rs = resident_station or bool(_RS.search(name))
        place = _RS.sub("", name)
        if place.endswith(f" {state}"):
            place = place[: -len(state) - 1]
        # street first (what the geocoder reads), then suite / building
        lines = (_cell(row.get(k)) for k in ("ADDRESS LINE 2", "ADDRESS LINE 1"))
        extra = [v for v in lines if v and v.upper() not in _BUILDING]
        out.append(
            {
                "n": f"Social Security - {sp.smart_title(place)}",
                "t": "Resident station (limited services)" if rs else "",
                "a": ", ".join([sp.smart_title(street), *map(sp.smart_title, extra)]),
                "c": sp.smart_title(_cell(row.get("CITY"))),
                "s": state,
                "zip": sp.zip5(_cell(row.get("ZIP CODE"))),
                "p": sp.phone(row.get("PHONE")),
                "d": hours,
            }
        )
    return out


WAYBACK_MAX_AGE_DAYS = 200  # SSA updates these files quarterly: allow one missed update


def wayback_snapshot(rows: object, now: dt.datetime | None = None) -> str:
    """The raw-bytes URL ("id_") of the newest Wayback Machine snapshot of an
    ssa.gov file, from a CDX API reply (output=json: a header row, then
    [timestamp, original, statuscode] rows), if it's recent enough to publish."""
    ok = [
        r
        for r in (rows[1:] if isinstance(rows, list) else [])
        if isinstance(r, list) and len(r) >= 3 and str(r[2]) == "200"
    ]
    if not ok:
        raise ValueError("no archived copy")
    newest = max(ok, key=lambda r: str(r[0]))
    ts, original = str(newest[0]), str(newest[1])
    if not re.fullmatch(r"\d{14}", ts):
        raise ValueError(f"bad snapshot timestamp {ts!r}")
    taken = dt.datetime.strptime(ts, "%Y%m%d%H%M%S").replace(tzinfo=dt.UTC)
    if ((now or dt.datetime.now(dt.UTC)) - taken).days > WAYBACK_MAX_AGE_DAYS:
        raise ValueError(f"archived copy from {ts[:8]} is too old")
    if not re.fullmatch(r"https?://(www\.)?ssa\.gov/data/[\w.-]+\.csv", original, re.ASCII):
        raise ValueError(f"unexpected archived URL {original!r}")
    return f"https://web.archive.org/web/{ts}id_/{original.replace('http://', 'https://', 1)}"


# --- LSC service areas (lsc.gov "Find legal aid" tool; data CC0) ------------

LSC_AREA_ID = re.compile(r"[A-Z]{2,3}-\d{1,3}", re.ASCII)
MAX_LSC_AREAS = 500  # ~130 real ones: never fan out into thousands of requests


def lsc_area_ids(rectangles_js: str, programs: object) -> list[str]:
    """Every service-area id the tool knows: its lookup rectangles plus the
    program list (an area can be renamed in one before the other)."""
    ids = re.findall(r"\"([A-Z]{2,3}-\d{1,3})\"\s*\]", rectangles_js)
    for p in programs if isinstance(programs, list) else []:
        if isinstance(p, dict):
            ids.append(sp.clean(p.get("Serv_Area_ID")))
    out = sorted({i for i in ids if LSC_AREA_ID.fullmatch(i)})
    if len(out) > MAX_LSC_AREAS:
        raise ValueError(f"LSC: {len(out)} service areas listed (expected < {MAX_LSC_AREAS})")
    return out


def _web(v: object) -> str:
    u = sp.clean(v)
    if u.startswith("http://"):
        u = "https://" + u[len("http://") :]
    return u if re.fullmatch(r"https://[\w.-]+\.[a-z]{2,}(/\S*)?", u, re.I | re.ASCII) else ""


def _perp(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / (dx * dx + dy * dy) ** 0.5


def simplify_ring(ring: list, tol: float, ndp: int = 4) -> list | None:
    """Douglas-Peucker on a closed ring (iterative), rounded to `ndp` places;
    None when it collapses below a triangle."""
    pts = []
    for c in ring:
        if isinstance(c, list | tuple) and len(c) >= 2:
            try:
                x, y = float(c[0]), float(c[1])
            except (TypeError, ValueError):
                return None
            # NaN/Infinity would make json.dumps write a file browsers can't parse
            if not (math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90):
                return None
            pts.append((x, y))
    if len(pts) < 4:
        return None
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    # split the closed ring at its farthest point from the start, so both
    # halves are open polylines DP handles well
    x0, y0 = pts[0]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2)
    keep[far] = True
    stack = [(0, far), (far, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        idx, dmax = i, 0.0
        for k in range(i + 1, j):
            d = _perp(pts[k], pts[i], pts[j])
            if d > dmax:
                idx, dmax = k, d
        if dmax > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    out: list[list[float]] = []
    for p, k in zip(pts, keep, strict=True):
        q = [round(p[0], ndp), round(p[1], ndp)]
        if k and (not out or q != out[-1]):
            out.append(q)
    if out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else None


def simplify_geometry(geom: object, tol: float) -> dict | None:
    """A Polygon/MultiPolygon generalized for a whole-US view (holes and
    islands kept while they survive), always as a MultiPolygon."""
    if not isinstance(geom, dict):
        return None
    kind, coords = geom.get("type"), geom.get("coordinates")
    polys = [coords] if kind == "Polygon" else coords if kind == "MultiPolygon" else None
    out = []
    for poly in polys or []:
        if not isinstance(poly, list) or not poly:
            continue
        rings = [simplify_ring(r, tol) for r in poly if isinstance(r, list)]
        if not rings or rings[0] is None:
            continue  # the outer ring collapsed: a speck at this scale
        out.append([r for r in rings if r])
    return {"type": "MultiPolygon", "coordinates": out} if out else None


def lsc_areas(areas: list[tuple[str, object]], programs: object, tol: float = 0.003) -> dict:
    """(file id, GeoJSON) pairs + Programs.json -> one feature per service
    area that has a current program, like LSC's own tool: the area comes from
    each feature's SA property (a file may hold a renamed area, and an area's
    separate pieces come as separate features of one file), the program's
    name, intake phone and website from the program list."""
    by_area = {
        sp.clean(p.get("Serv_Area_ID")): p
        for p in (programs if isinstance(programs, list) else [])
        if isinstance(p, dict)
    }
    shapes: dict[str, list] = {}  # area -> polygons, in file order
    owner: dict[str, str] = {}  # area -> the one file its shape is taken from
    # An area's own file (id == SA) wins over a renamed copy in another file;
    # a file owns an area only once one of its pieces survives simplification.
    pieces = [
        (file_id, f)
        for file_id, doc in areas
        for f in (doc.get("features", []) if isinstance(doc, dict) else [])
        if isinstance(f, dict) and isinstance(f.get("properties"), dict)
    ]
    pieces.sort(key=lambda p: sp.clean(p[1]["properties"].get("SA")) != p[0])  # stable
    for file_id, f in pieces:
        area = sp.clean(f["properties"].get("SA"))
        if area not in by_area or owner.get(area, file_id) != file_id:
            continue  # no current program (merged / closed out), or a second copy
        geom = simplify_geometry(f.get("geometry"), tol)
        if geom:
            owner.setdefault(area, file_id)
            shapes.setdefault(area, []).extend(geom["coordinates"])
    feats = []
    for area, polys in shapes.items():
        prog = by_area[area]
        name = sp.clean(prog.get("R_Legalname"))
        if not name:
            continue
        phone = sp.phone(prog.get("Local_800")) or sp.phone(prog.get("Phone"))
        props = {"name": name, "phone": phone, "web": _web(prog.get("Web_URL")), "area": area}
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "MultiPolygon", "coordinates": polys},
                "properties": {k: v for k, v in props.items() if v},
            }
        )
    return {"type": "FeatureCollection", "features": feats}


def parse_json(body: bytes) -> object:
    return json.loads(body.decode("utf-8-sig", "replace"))


# --- HealthCare.gov "Find Local Help" assisters (data.healthcare.gov) -------
#
# One daily CSV backs localhelp.healthcare.gov: free assisters (Navigators,
# Certified Application Counselors, in-person assisters, Medicaid/CHIP
# specialists) and, in the same file, ~80,000 agents and brokers. Agents and
# brokers are individuals who sell plans: their rows are never parsed.
# Assister rows are organizations, but a site's label is sometimes a
# counselor's own name, and about a fifth of the sites have no public address
# (CMS's display_address flag, which localhelp honors too). Those, and sites
# labeled with a person's name, keep only a ~10 km area point: no street, no
# hours, and no label that names a person or holds an address, so the map never
# pins a place the source withholds. A counselor-named site keeps a phone only
# when it is toll-free or one of the organization's other public lines (each
# counselor can list their own direct number).
#
# Compact names (services-pack): n organization · o site label · a street ·
# c city · s state · p phone · t types (space-separated codes) · l languages ·
# d hours · web website · x 1 = ZIP-area point, 2 = area served (no address).

ASSISTER_COLUMNS = (
    "record_id",
    "data_set_name",
    "organization_name",
    "main_phone_number",
    "street_address",
    "city",
    "state_or_territory",
    "zip_code",
    "geo_location",
    "display",
    "display_address",
)
# data_set_name -> type code; anything else (Agent/Broker...) is skipped.
ASSISTER_TYPES = {
    "Navigator (NAV)": "nav",
    "Certified Application Counselor (CAC)": "cac",
    "In-person Assister (IPA)": "ipa",
    "Medicaid Specialist": "mcd",
    "CHIP Specialist": "chip",
}
_TYPE_ORDER = tuple(ASSISTER_TYPES.values())
# CMS's own QA records ("GDIT Test Org", "TestOrgCSG", "FLHAutomation Dontuse").
_TEST_ROW = re.compile(
    r"\btest ?(org|location|cdo)\b|^test[a-z]*(org|automation|location|sec)|automation|"
    r"dontuse|do not use|\bgdit\b|\bdummy\b|\bux test\b|testing display",
    re.I,
)
_NAME_WORD = r"(?:Mc|Mac|O')?[A-Z][a-z'’]+(?:-[A-Z][a-z'’]+)?"
_PERSON_NAME = re.compile(rf"^{_NAME_WORD}(?: [A-Z]\.?)?(?: {_NAME_WORD}){{1,3}}$")
# Words that make a short capitalized label a place or a program, not a person.
_PLACE_WORDS = re.compile(
    r"\b(fort|city|hills?|haven|springs?|falls|lakes?|mount|mt|point|park|valley|beach|"
    r"creek|river|heights|grove|village|county|north|south|east|west|downtown|center|centre|"
    r"main|office|offices|clinic|clinica|health|healthcare|hospital|medical|mall|plaza|"
    r"campus|site|branch|library|school|church|community|family|care|services?|program|"
    r"navigator|counselors?|assistance|enrollment|outreach|helpline|apartments|building|"
    r"street|avenue|road|island|peninsula|alaska|tribe|tribal|nation|band|pediatrics|"
    r"wellness|pharmacy|dental|elementary|academy|consulate|heart|hope|life|new|san|santa|"
    r"saint|st|la|el|de|del|los|las|ave|blvd|hall|house|location|project|council|unity|"
    r"memorial|aging|remote|only|region|enroll|covering|american|mexican|woods|meadows?|"
    r"summit|nurses?|association|foodbank|neighbors?|highrise|elderly|legal|aid|mountains?|"
    r"country|drive|board|children's|foundation|resource|korean|visiting|happens|wic|"
    r"alabama|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|"
    r"hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|"
    r"massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|"
    r"hampshire|jersey|mexico|york|carolina|dakota|ohio|oklahoma|oregon|pennsylvania|"
    r"rhode|tennessee|texas|utah|vermont|virginia|washington|wisconsin|wyoming)\b",
    re.I,
)
_HOME_LABEL = re.compile(r"\bhome office\b|\bresidence\b|\bmy home\b", re.I)
# "Heather's Application Services": one person's own business, by first name
# (not "Women's Health Center" / "Children's Clinic").
_POSSESSIVE_NAME = re.compile(
    r"^(?!(?i:women|men|children|kids|people|veterans)['’])[A-Z][a-z]+['’]s\b"
)
# Words that make a capitalized "First Last"-shaped organization name a business.
_ORG_WORDS = re.compile(
    r"\b(inc|llc|corp|corporation|co|group|university|college|communities|ministries|"
    r"partners|network|coalition|alliance|society|league|institute|agency|department|dept)\b",
    re.I,
)
_TOLL_FREE = re.compile(r"^\(8(00|33|44|55|66|77|88)\)")
_LANG_ALIASES = {"Interpretation services available for other languages": "Interpreters"}
_DAY = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
_HOURS_LINE = re.compile(
    r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun):\s*(\d{1,2}):(\d\d)\s*([AP]M)\s*-\s*(\d{1,2}):(\d\d)\s*([AP]M)$"
)
AREA_DP = 1  # decimal places kept for a site without a public address (~10 km)


def _minutes(h: str, m: str, ampm: str) -> int:
    return (int(h) % 12 + (12 if ampm == "PM" else 0)) * 60 + int(m)


def assister_hours(text: object) -> str:
    """'Mon-Fri 8:00 AM-5:00 PM; Sat 10:00 AM-2:00 PM' from localhelp's
    one-line-per-day hours. '' when any line is malformed or ends before it
    starts ('7:00 AM - 5:00 AM' typos): no hours beats wrong hours."""
    spans: dict[str, str] = {}
    for line in (ln.strip() for ln in str(text or "").splitlines()):
        if not line:
            continue
        m = _HOURS_LINE.match(line)
        if not m or _minutes(*m.group(5, 6, 7)) <= _minutes(*m.group(2, 3, 4)):
            return ""
        spans[m[1]] = f"{int(m[2])}:{m[3]} {m[4]}-{int(m[5])}:{m[6]} {m[7]}"
    groups: dict[str, list[str]] = {}
    for day in _DAY:
        if day in spans:
            groups.setdefault(spans[day], []).append(day)
    parts = []
    for span, days in groups.items():
        idx = [_DAY.index(d) for d in days]
        run = len(days) > 2 and idx == list(range(idx[0], idx[0] + len(idx)))
        parts.append(f"{days[0]}-{days[-1]} {span}" if run else f"{', '.join(days)} {span}")
    return "; ".join(parts)


def _languages(v: object) -> list[str]:
    out: list[str] = []
    for raw in str(v or "").split(","):
        lang = _LANG_ALIASES.get(sp.clean(raw), sp.clean(raw))
        if lang and lang not in out and len(lang) <= 40:
            out.append(lang)
    return sorted(out, key=_lang_order)


def _lang_order(lang: str) -> tuple[bool, bool, bool]:
    """English, then Spanish, then the rest as listed; "Interpreters" last."""
    return (lang == "Interpreters", lang != "English", lang != "Spanish")


def _website(v: object) -> str:
    u = sp.clean(v)
    if u and not re.match(r"https?://", u, re.I):
        u = "https://" + u
    return _web(u)


def _person_label(label: str, org: str, city: str) -> bool:
    """A site label that is a person's name ('Jenny Rivera', 'Andrea
    Thomas/SEARHC'): the counselor, not the place. Each '/'- or ' - '-separated
    part is checked; a part made only of words from the organization's name or
    the city ('Capstone Parrish', 'Samuel U. Rodgers') is the place."""
    known = set(re.findall(r"[a-z'’]+", f"{org} {city}".lower()))
    for part in re.split(r"\s*/\s*|\s+-\s+", label):
        if not _PERSON_NAME.match(part) or _PLACE_WORDS.search(part):
            continue
        if not set(re.findall(r"[a-z'’]+", part.lower())) <= known:
            return True
    return False


def _geo(v: object) -> tuple[float, float] | None:
    """localhelp's '(lat,lon)' -> (lon, lat)."""
    m = re.fullmatch(r"\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?", sp.clean(v))
    return (float(m[2]), float(m[1])) if m else None


def marketplace_assisters(text: str) -> tuple[list[dict], list[dict]]:
    """The Find Local Help CSV -> (point features, records to geocode).

    One entry per organization site: a site listed under several assister
    types (CAC + Medicaid + CHIP...) is merged, its types and languages
    combined. Agents/brokers, CMS test records and rows without an
    organization are dropped; emails and free-text notes are never read."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    header = [sp.clean(h) for h in reader.fieldnames or []]
    if not all(c in header for c in ASSISTER_COLUMNS):
        raise ValueError(f"Find Local Help file: unexpected columns {header[:8]}")
    sites: dict[tuple, dict] = {}
    org_lines: dict[str, set[str]] = {}  # organization -> phones of its unnamed sites
    for raw in reader:
        kind = ASSISTER_TYPES.get(sp.clean(raw.get("data_set_name")))
        org = sp.clean(raw.get("organization_name"))
        label = sp.clean(raw.get("location_name"))
        if not kind or not org or sp.clean(raw.get("display")).lower() == "false":
            continue
        if _TEST_ROW.search(org) or _TEST_ROW.search(label) or sp._is_person(org):
            continue
        if _PERSON_NAME.match(org) and not (_PLACE_WORDS.search(org) or _ORG_WORDS.search(org)):
            continue  # an "organization" that is a person's name
        state = sp.clean(raw.get("state_or_territory")).upper()
        state = state if re.fullmatch(r"[A-Z]{2}", state) else ""
        city = sp.clean(raw.get("city"))
        lines = str(raw.get("street_address") or "").splitlines()
        street = ", ".join(sp.clean(x) for x in lines if sp.clean(x))
        person = bool(label) and (
            _person_label(label, org, city) or bool(_POSSESSIVE_NAME.match(label))
        )
        public = (
            sp.clean(raw.get("display_address")).lower() == "true"
            and bool(street)
            and not person
            and not _HOME_LABEL.search(label)
        )
        geo = _geo(raw.get("geo_location"))
        if not public:
            if not geo:
                continue  # no public address and no point: nothing to show
            geo = (round(geo[0], AREA_DP), round(geo[1], AREA_DP))
            street = ""
        shown = label if label and not person and label.lower() != org.lower() else ""
        if not public and (re.search(r"\d", shown) or _HOME_LABEL.search(shown)):
            shown = ""  # a withheld site's label can be its street address
        tel = sp.phone(raw.get("main_phone_number")) or sp.phone(raw.get("toll_free_phone"))
        if not person:
            org_lines.setdefault(org.lower(), set()).add(tel)
        rec = {
            "n": org,
            "o": shown,
            "a": street,
            "c": city,
            "s": state,
            # a counselor-named site's number can be that person's own line:
            # decided below, once every public line of the organization is known
            "p": "" if person else tel,
            "pp": tel if person else "",
            "d": assister_hours(raw.get("office_hours")) if public else "",
            "web": _website(raw.get("website_url")),
            "x": 0 if public else 2,
            "types": {kind},
            "langs": _languages(raw.get("non_english_assistance_offered")),
            "zip": sp.zip5(sp.clean(raw.get("zip_code"))),
            "geo": geo,
        }
        if public:
            key: tuple = (org.lower(), street.lower(), city.lower(), state)
        else:
            key = (org.lower(), geo)
        if key in sites:
            have = sites[key]
            have["types"] |= rec["types"]
            have["langs"] += [x for x in rec["langs"] if x not in have["langs"]]
            for k in ("o", "p", "pp", "d", "web"):
                have[k] = have[k] or rec[k]
            have["geo"] = have["geo"] or rec["geo"]
        else:
            sites[key] = rec
    feats, pending = [], []
    for rec in sites.values():
        pp, lines = rec["pp"], org_lines.get(rec["n"].lower(), set())
        if not rec["p"] and pp and (_TOLL_FREE.match(pp) or pp in lines):
            rec["p"] = pp  # the organization's toll-free or main line, not a person's
        props = {k: rec[k] for k in ("n", "o", "a", "c", "s", "p", "d", "web", "x")}
        props["t"] = " ".join(t for t in _TYPE_ORDER if t in rec["types"])
        props["l"] = ", ".join(sorted(rec["langs"], key=_lang_order))
        if rec["geo"]:
            feats.append(sp.point(*rec["geo"], props))
        else:  # a public street address without a point: the Census geocoder places it
            pending.append({**props, "zip": rec["zip"]})
    return [f for f in feats if f], pending
