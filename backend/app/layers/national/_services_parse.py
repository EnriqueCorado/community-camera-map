"""Parsers for the community & immigrant services pack (see services.py).

The leading underscore keeps this helper from being loaded as a layer pack.

Pure functions over downloaded bytes/text, so each is unit-tested with a small
hand-written fixture. Everything here keeps an explicit allowlist of fields:
organization names, street addresses and public office lines only. Never
personal names (accredited representatives, staff contacts), emails or
personal phones.

Compact property names keep the nationwide files small (they load in full):
  n name · o office/site label · g parent organization/program · a street
  c city · s state · p public phone · rp registration phone · t type
  es 1 = services in Spanish · sf 1 = sliding fee / free care
  h hours · fo ICE field office · pop average daily population
  x 1 = approximate location (ZIP-area center, not the street address)
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from xml.etree import ElementTree as ET

# --- small helpers ----------------------------------------------------------

_WS = re.compile(r"\s+")


def clean(v: object) -> str:
    """A tidy one-line string ('' for None/NaN-like placeholders)."""
    if v is None:
        return ""
    s = _WS.sub(" ", str(v)).strip()
    return "" if s.lower() in {"nan", "none", "null", "n/a", "na", "-"} else s


EMAIL = re.compile(r"[\w.+'-]+@[\w-]+(\.[\w-]+)+")


def point(lon: object, lat: object, props: dict) -> dict | None:
    """A GeoJSON point (5 dp, ~1 m) with empty properties dropped, or None
    when the coordinates are missing or outside the US and its territories."""
    try:
        x, y = float(lon), float(lat)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not (-180 <= x <= -60 or 130 <= x <= 180) or not (-15 <= y <= 72) or (x == 0 and y == 0):
        return None
    # Source text fields sometimes hold a staff email (one AJC "center name"
    # is a person's address): scrub any email-like token from every string.
    scrubbed = {k: (clean(EMAIL.sub("", v)) if isinstance(v, str) else v) for k, v in props.items()}
    keep = {k: v for k, v in scrubbed.items() if v not in ("", None, 0, False)}
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(x, 5), round(y, 5)]},
        "properties": keep,
    }


def fc(features: list) -> dict:
    return {"type": "FeatureCollection", "features": [f for f in features if f]}


_PHONE = re.compile(r"\(?\b(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})\b")


def phone(v: object) -> str:
    """'(209) 555-0100' from common US formats; '' if it isn't one."""
    m = _PHONE.search(clean(v))
    return f"({m[1]}) {m[2]}-{m[3]}" if m else ""


# --- XLSX (stdlib only: an .xlsx is a zip of XML parts) ---------------------

_NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}
_COL = re.compile(r"([A-Z]+)")
MAX_XLSX_PART = 64 * 1024 * 1024  # uncompressed bytes per part (zip-bomb guard)


def _part(z: zipfile.ZipFile, name: str) -> bytes:
    info = z.getinfo(name)
    if info.file_size > MAX_XLSX_PART:
        raise ValueError(f"xlsx part {name} too large")
    body = z.read(info)
    # Spreadsheet parts never declare a DTD: refuse any that do (no entity
    # expansion tricks reach the XML parser).
    if b"<!DOCTYPE" in body or b"<!ENTITY" in body:
        raise ValueError(f"xlsx part {name} has a DTD")
    return body


MAX_COLS = 16384  # Excel's limit; a bigger reference is a malformed file


def _col_index(ref: str) -> int:
    m = _COL.match(ref)
    n = 0
    for ch in m[1] if m else "A":
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_xlsx(data: bytes, sheet: str | re.Pattern[str] | None = None) -> list[list[str]]:
    """Rows of one worksheet as strings (numbers as written in the file).
    `sheet` is a name or a regex (first match); None = the first sheet."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(_part(z, "xl/sharedStrings.xml"))
            for si in root.findall("m:si", _NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{_NS['m']}}}t")))
        wb = ET.fromstring(_part(z, "xl/workbook.xml"))
        sheets = [
            (s.get("name") or "", s.get(f"{{{_NS['r']}}}id") or "")
            for s in wb.findall("m:sheets/m:sheet", _NS)
        ]
        if sheet is None:
            chosen = sheets[0] if sheets else None
        elif isinstance(sheet, str):
            chosen = next((s for s in sheets if s[0].strip() == sheet), None)
        else:
            chosen = next((s for s in sheets if sheet.search(s[0])), None)
        if not chosen:
            raise ValueError(f"sheet {sheet!r} not found")
        rels = ET.fromstring(_part(z, "xl/_rels/workbook.xml.rels"))
        target = next(
            (
                r.get("Target") or ""
                for r in rels.findall("pr:Relationship", _NS)
                if r.get("Id") == chosen[1]
            ),
            "",
        )
        path = target.lstrip("/") if target.startswith("/") else f"xl/{target}"
        root = ET.fromstring(_part(z, path))
    rows: list[list[str]] = []
    for row in root.iter(f"{{{_NS['m']}}}row"):
        cells: dict[int, str] = {}
        for c in row.findall("m:c", _NS):
            kind = c.get("t")
            v = c.find("m:v", _NS)
            if kind == "s" and v is not None and v.text and v.text.isdigit():
                i = int(v.text)
                val = shared[i] if i < len(shared) else ""
            elif kind == "inlineStr":
                val = "".join(t.text or "" for t in c.iter(f"{{{_NS['m']}}}t"))
            else:
                val = v.text if v is not None and v.text else ""
            col = _col_index(c.get("r") or "A")
            if not 0 <= col < MAX_COLS:
                raise ValueError("xlsx cell reference out of range")
            cells[col] = val
        if cells:
            width = max(cells) + 1
            rows.append([cells.get(i, "") for i in range(width)])
        else:
            rows.append([])
    return rows


def table(rows: list[list[str]], must_have: tuple[str, ...]) -> list[dict[str, str]]:
    """Rows below the first header row that contains every `must_have` column
    (headers can sit under a title block), as dicts keyed by header."""
    for i, row in enumerate(rows):
        header = [clean(h) for h in row]
        if all(h in header for h in must_have):
            out = []
            for r in rows[i + 1 :]:
                if not any(clean(v) for v in r):
                    continue
                out.append({h: (r[j] if j < len(r) else "") for j, h in enumerate(header) if h})
            return out
    raise ValueError(f"no header row with {must_have}")


# --- DOJ EOIR recognized organizations (roster PDF, text layer) -------------

_DATES = re.compile(r"\s{2,}(\d\d/\d\d/\d\d)\s+(\d\d/\d\d/\d\d\*?)\s+([A-Za-z][A-Za-z ]*?)\s*$")
# "City, ST 12345[-6789]"; the roster also has "482102416" and "8611" (lost zero).
_CSZ = re.compile(r"^(?P<city>[^,]+?),\s*(?P<st>[A-Z]{2})\s+(?P<zip>\d{4,9})(?:-\d{4})?\s*$")


def zip5(z: str) -> str:
    d = re.sub(r"\D", "", z)
    if len(d) in (4, 8):  # a leading zero lost by a spreadsheet
        d = "0" + d
    return d[:5] if len(d) >= 5 else ""


_PHONE_LINE = re.compile(r"^\(\d{3}\)\s*\d{3}-\d{4}(\s*(x|ext\.?)\s*\d+)?$", re.I)
# Column header of the second (per-person) section of the PDF.
_REP_HEADER = re.compile(r"^\s*Recognized\s+Accredited Representative\b")
_HEADER_WORDS = {
    "Recognized",
    "Organization",
    "Date",
    "Recognition",
    "Expiration Date",
    "Organization Status",
    "Recognized Organization",
}


def eoir_offices(text: str) -> list[dict]:
    """Active recognized-organization offices from the "Roster by State and
    City" PDF's text (pypdf layout mode). The second half of that PDF lists
    accredited representatives by name: parsing stops at its header, and the
    office fields never include a person's name. If that header can't be
    found the layout changed: fail rather than risk reading names."""
    offices: list[dict] = []
    reps_header = False
    after_office = False  # the previous line closed an office entry
    org = ""  # current organization (an entry may repeat it without dates)
    status = ""
    fresh = False  # no office read yet since the org's own (dated) line
    block: list[str] = []
    for raw in text.splitlines():
        if _REP_HEADER.match(raw):
            reps_header = True
            break  # the per-person section: never read it
        line = raw.rstrip()
        s = line.strip()
        if not s or s.startswith("=== page") or s.startswith("\f"):
            continue
        indent = len(line) - len(line.lstrip())
        if s in _HEADER_WORDS or re.fullmatch(r"(Recognized|Organization)\s{2,}.*", s):
            continue
        if s.startswith("(Pending") or s == "Renewal)":
            continue
        if _PHONE_LINE.match(s) and after_office:
            offices[-1]["p"] = phone(s)  # the phone follows its office's city line
            after_office = False
            continue
        after_office = False
        m = _DATES.search(line)
        if m and indent < 10:
            org, status, fresh = s[: m.start() - indent].strip(), m[3].strip(), True
            block = []
            continue
        if indent >= 30 and not _CSZ.match(s):
            block = []  # a centered state or city heading
            continue
        csz = _CSZ.match(s)
        if csz:
            entry = [b for b in block if not _PHONE_LINE.match(b)]
            labels = [i for i, b in enumerate(entry) if re.search(r"\bOffice$", b)]
            block = []
            if not labels:  # no "... Office" label: not an office entry
                fresh = False
                continue
            office = labels[-1]
            before = " ".join(entry[:office]).strip()
            if before and fresh and before != org:
                org = f"{org} {before}"  # the org name wrapped onto a second line
            elif before and before != org:
                org, status = before, ""  # another org without dates: status unknown
            fresh = False
            offices.append(
                {
                    "n": org,
                    "o": entry[office],
                    "a": ", ".join(entry[office + 1 :]).strip(", "),
                    "c": csz["city"].strip(),
                    "s": csz["st"],
                    "zip": zip5(csz["zip"]),
                    "status": status,
                }
            )
            after_office = True
            continue
        block.append(s)
    if not reps_header:
        raise ValueError("EOIR roster: accredited-representative header not found")
    out, seen = [], set()
    for o in offices:
        key = (o["n"], o["a"], o["c"])
        if o.pop("status") != "Active" or not o["a"] or key in seen:
            continue
        seen.add(key)
        out.append(o)
    return out


def eoir_reported_date(text: str) -> str:
    m = re.search(r"Report Last Updated on:\s*(\d\d/\d\d/\d\d)", text)
    return m[1] if m else ""


# --- U.S. Census batch geocoder ---------------------------------------------

_SUITE = re.compile(
    r"[,\s]+(suite|ste\.?|unit|room|rm\.?|floor|fl\.?|bldg\.?|building|#)\s*[\w-]*.*$", re.I
)


def street_only(street: str) -> str:
    """The first street line without suite/unit/floor (what the geocoder wants)."""
    first = street.split(",")[0].strip()
    lines = [first] + [p.strip() for p in street.split(",")[1:]]
    # "P.O. Box" lines can't be geocoded: prefer another line if there is one.
    if re.match(r"p\.?\s*o\.?\s*box", first, re.I) and len(lines) > 1:
        first = lines[1]
    return _SUITE.sub("", first).strip() or first


def census_batch_csv(rows: list[tuple[str, str, str, str, str]]) -> bytes:
    """(id, street, city, state, zip) rows -> the batch geocoder's input file."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    for row in rows:
        w.writerow([clean(v).replace('"', "") for v in row])
    return buf.getvalue().encode()


def census_batch_result(body: str) -> dict[str, tuple[float, float]]:
    """id -> (lon, lat) for every Match row of the batch geocoder's CSV reply."""
    out: dict[str, tuple[float, float]] = {}
    for r in csv.reader(io.StringIO(body)):
        if len(r) >= 6 and r[2] == "Match" and "," in r[5]:
            try:
                lon, lat = (float(v) for v in r[5].split(","))
            except ValueError:
                continue
            out[r[0].strip()] = (lon, lat)
    return out


# --- ICE detention facilities (FY detention-statistics spreadsheet) ---------

# ERO field offices ("AOR" column) by code.
ICE_FIELD_OFFICES = {
    "ATL": "Atlanta",
    "BAL": "Baltimore",
    "BOS": "Boston",
    "BUF": "Buffalo",
    "CHI": "Chicago",
    "DAL": "Dallas",
    "DEN": "Denver",
    "DET": "Detroit",
    "ELP": "El Paso",
    "HOU": "Houston",
    "HQ": "Headquarters",
    "LOS": "Los Angeles",
    "MIA": "Miami",
    "NEW": "Newark",
    "NOL": "New Orleans",
    "NYC": "New York City",
    "PHI": "Philadelphia",
    "PHO": "Phoenix",
    "SEA": "Seattle",
    "SFR": "San Francisco",
    "SLC": "Salt Lake City",
    "SNA": "San Antonio",
    "SND": "San Diego",
    "SPM": "St. Paul",
    "WAS": "Washington",
}


_KEEP_UPPER = {
    "ICE",
    "ICA",
    "CCA",
    "CDF",
    "FDC",
    "FCI",
    "USP",
    "BOP",
    "LLC",
    "II",
    "III",
    "IV",
    "NE",
    "NW",
    "SE",
    "SW",
    "US",
    "USA",
    "IAH",
    "ADC",
    "PO",
    "DHS",
    "GEO",
    "CEC",
    "SPC",
    "ERO",
}


def smart_title(v: str) -> str:
    """ALL-CAPS spreadsheet text in title case, keeping acronyms (ICE, II...)."""
    out = []
    for w in clean(v).split(" "):
        core = re.sub(r"[^A-Za-z]", "", w).upper()
        if core in _KEEP_UPPER:
            out.append(w.upper())
        elif re.match(r"MC[A-Z]{2}", w.upper()):  # McCook, McHenry
            out.append("Mc" + w[2:3].upper() + w[3:].lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return " ".join(out)


def _num(v: object) -> float:
    try:
        return float(clean(v) or 0)
    except ValueError:
        return 0.0


def ice_facilities(rows: list[list[str]]) -> list[dict]:
    """Facilities sheet rows -> name/address/city/state/zip/type/field office/
    average daily population (aggregate counts only: no individuals)."""
    out = []
    for r in table(rows, ("Name", "Address", "City", "State", "Zip", "AOR")):
        name = clean(r.get("Name"))
        state = clean(r.get("State")).upper()
        if not name or not re.fullmatch(r"[A-Z]{2}", state):
            continue  # totals / footnote rows
        # Average daily population = the four classification levels together.
        adp = sum(_num(r.get(f"Level {x}")) for x in "ABCD")
        aor = clean(r.get("AOR")).upper()
        out.append(
            {
                "n": smart_title(name),
                "a": smart_title(clean(r.get("Address"))),
                "c": smart_title(clean(r.get("City"))),
                "s": state,
                "zip": zip5(clean(r.get("Zip"))),
                "t": clean(r.get("Type Detailed")).upper(),
                "fo": ICE_FIELD_OFFICES.get(aor, aor),
                "pop": round(adp),
            }
        )
    return out


# --- American Job Centers (DOL CareerOneStop) -------------------------------


def job_centers(rows: list[list[str]]) -> list[dict]:
    """Open centers: name/type/address/center phone. The sheet's coordinates
    come from a licensed geocoder, so they're not used (we geocode the
    address); staff names, emails and phones are never read."""
    out = []
    for r in table(rows, ("Name of Center", "Address1", "City", "State", "Zip Code")):
        if clean(r.get("Center Closure Y/N")).upper().startswith("Y"):
            continue
        kind = clean(r.get("Program Type")).lower()
        out.append(
            {
                "n": clean(r.get("Name of Center")),
                "t": "comp" if kind.startswith("comprehensive") else "aff" if kind else "",
                "a": clean(r.get("Address1")),
                "c": clean(r.get("City")),
                "s": clean(r.get("State")).upper()[:2],
                "zip": zip5(clean(r.get("Zip Code"))),
                "p": phone(r.get("Phone")),
            }
        )
    return [o for o in out if o["n"] and o["a"]]


# --- Head Start centers (headstart.gov locator API) -------------------------

# Locator `type` -> (early = Early Head Start, ages 0-3?, program kind):
# "" regular, "m" Migrant & Seasonal, "ai" American Indian / Alaska Native.
HEAD_START_TYPES = {
    1: (False, ""),
    2: (True, ""),
    3: (False, "m"),
    4: (True, "m"),
    5: (False, "ai"),
    6: (True, "ai"),
}


# Family child care homes partner with Head Start: the "center" is a person's
# home and is often listed under her name ("FCCH - Last First"). Leave them out.
FAMILY_CHILD_CARE = re.compile(
    r"\bFCCH\b|\bFDCH?\b|family (child|day) ?care(?! cent)|child ?care home|day ?care home", re.I
)


def head_start(docs: object, early: bool) -> list[dict]:
    """One state's open centers: Head Start (ages 3-5) or, with `early`,
    Early Head Start (pregnancy to age 3), with center + program lines."""
    rows = docs.get("documents") if isinstance(docs, dict) else None
    feats = []
    for d in rows if isinstance(rows, list) else []:
        if not isinstance(d, dict) or d.get("status") != "Open":
            continue
        kind = HEAD_START_TYPES.get(d.get("type"))  # type: ignore[arg-type]
        if kind is None or kind[0] != early:
            continue
        if FAMILY_CHILD_CARE.search(clean(d.get("name"))):
            continue  # a provider's own home (often named after her): not shown
        prog = d.get("program") if isinstance(d.get("program"), dict) else {}
        reg = phone(prog.get("registrationPhone"))
        p = phone(d.get("phone"))
        feats.append(
            point(
                d.get("longitude"),
                d.get("latitude"),
                {
                    "n": clean(d.get("name")),
                    "a": clean(d.get("addressLineOne")),
                    "c": clean(d.get("city")),
                    "s": clean(d.get("state")),
                    "p": p,
                    "rp": reg if reg != p else "",
                    "t": kind[1],
                    "g": clean(prog.get("name")),
                },
            )
        )
    return [f for f in feats if f]


# --- SAMHSA FindTreatment.gov ------------------------------------------------


def _services(row: dict) -> dict[str, str]:
    """Service code (f2: TC, SL, PYAS...) -> its '; '-separated values (f3)."""
    out: dict[str, str] = {}
    for s in row.get("services") or []:
        if isinstance(s, dict) and clean(s.get("f2")):
            out[clean(s.get("f2"))] = clean(s.get("f3"))
    return out


_NO_COST = re.compile(r"\bsliding fee|\bno charge\b|\bfree of charge\b", re.I)

# "Jane Q. Doe, LCSW" / "John Smith MD": a solo practitioner listed under their
# own name, whose address may be a home office (like Head Start home providers).
_PERSON = re.compile(
    r"^[A-Z][a-z']+(?:-[A-Z][a-z']+)?(?: [A-Z]\.?)?(?: [A-Z][a-z']+(?:-[A-Z][a-z']+)?){1,2},? "
    r"(?:(?:LCSW|LSW|LMSW|LPC|LMFT|LMHC|LCADC|LADC|LCPC|LISW|LCAS|CASAC|CCS|CAP|"
    r"PsyD|PhD|MD|DO|NP|PMHNP|APRN|RN|MSW|MA|MS|LPCC|CADC|LCDC)\b[ ,/-]*)+$"
)


def _is_person(name: str) -> bool:
    return bool(_PERSON.match(name))


def treatment(rows: object, mental_health: bool) -> list[dict]:
    """FindTreatment.gov export rows -> mental-health facilities (typeFacility
    MH) or substance-use ones (everything else: SA, OTP...), with Spanish /
    sliding-fee flags; t = "both" when a facility treats both."""
    feats, seen = [], set()
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict) or (clean(r.get("typeFacility")) == "MH") != mental_health:
            continue
        if _is_person(clean(r.get("name1"))) and not clean(r.get("name2")):
            continue  # a person's own practice: keep their (home) address off the map
        key = (clean(r.get("name1")), clean(r.get("street1")), clean(r.get("city")))
        if key in seen:  # the export repeats some facilities
            continue
        seen.add(key)
        svc = _services(r)
        tc = svc.get("TC", "")
        kind = clean(r.get("typeFacility"))
        mh = "Mental health" in tc or kind == "MH"
        su = "Substance use" in tc or kind in {"SA", "OTP", "BUPREN"}
        street = clean(r.get("street1"))
        if clean(r.get("street2")):
            street = f"{street}, {clean(r.get('street2'))}"
        feats.append(
            point(
                r.get("longitude"),
                r.get("latitude"),
                {
                    "n": clean(r.get("name1")),
                    "g": clean(r.get("name2")),
                    "a": street,
                    "c": clean(r.get("city")),
                    "s": clean(r.get("state")),
                    "p": phone(r.get("phone")),
                    "t": "both" if mh and su else "",  # treats both: mental health + substance use
                    # exact item: "Other languages (excluding Spanish)" is not Spanish
                    "es": 1 if "Spanish" in svc.get("SL", "").split("; ") else 0,
                    "sf": 1 if _NO_COST.search(svc.get("PYAS", "")) else 0,
                },
            )
        )
    return [f for f in feats if f]
