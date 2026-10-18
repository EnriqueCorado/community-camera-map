"""Local development: what's proposed, approved and being built.

- Housing projects proposed (HCD Annual Progress Report Table A): every
  housing application each city/county reports, with units and status.
- New homes (APR Table A2): units entitled, permitted and completed.
- Projects under environmental review (CEQAnet, the State Clearinghouse):
  subdivisions, commercial, roads, water... with documents to read.

The APR is filed yearly (April, for the prior year), so it lags; CEQAnet is
updated as documents are filed, so it shows new proposals first.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import re

import httpx

from ..core.http import fetch_capped
from . import arcgis
from .transforms import _fc, _num, _pt

DATA_CA_SQL = "https://data.ca.gov/api/3/action/datastore_search_sql"
APR_A = "c78b769d-cc02-4050-91ef-79ded665b5a8"  # housing development applications
APR_A2 = "fe505d9b-8c36-42ba-ba30-08bc4f34e022"  # units entitled / permitted / completed
CEQANET_CSV = "https://ceqanet.lci.ca.gov/Search"

# Stanislaus County and its nine cities, as the APR names them.
JURISDICTIONS = (
    "STANISLAUS COUNTY",
    "MODESTO",
    "OAKDALE",
    "RIVERBANK",
    "TURLOCK",
    "CERES",
    "PATTERSON",
    "NEWMAN",
    "HUGHSON",
    "WATERFORD",
)
# Keep points inside the county's box (a bad geocode can't plant a pin elsewhere).
BOX = (-121.6, 37.1, -120.3, 38.1)

UNIT_TYPES = {
    "SFD": "single-family",
    "SFA": "townhome",
    "2 TO 4": "2-4 units",
    "5+": "apartments (5+)",
    "ADU": "ADU",
    "MH": "mobile home",
}


# Every layer here shares one stage scale (the map colors by it):
# proposed -> approved -> permitted (being built) -> completed; plus denied,
# review (environmental review open) and exempt (CEQA exemption filed).
STAGES = ("proposed", "approved", "permitted", "completed", "denied", "review", "exempt")


def _name(v: object) -> str:
    s = re.sub(r"\s+", " ", str(v or "")).strip()[:120]
    return "" if s.upper() in ("NONE", "N/A", "NA", "-", "TBD", "0") else s


def _in_box(lon: float | None, lat: float | None) -> bool:
    return (
        lon is not None and lat is not None and BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3]
    )


def _date(v: object) -> str:
    s = str(v or "")[:10]
    return s if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s) else ""


def _juris_sql(table: str, columns: str, since_year: int) -> str:
    names = ", ".join(f"'{j}'" for j in JURISDICTIONS)  # constants, not input
    return (
        f'SELECT {columns} FROM "{table}" '
        f'WHERE "JURIS_NAME" IN ({names}) AND "YEAR" >= {int(since_year)} '
        'AND "LATITUDE" IS NOT NULL'
    )


async def _sql(client: httpx.AsyncClient, sql: str) -> list:
    body, _ = await fetch_capped(
        client, DATA_CA_SQL, max_bytes=arcgis.MAX_BYTES, params={"sql": sql}
    )
    j = json.loads(body)
    if not j.get("success"):
        raise ValueError("data.ca.gov query failed")
    return j["result"]["records"]


# Privacy: a single home or ADU is a private household, so it is never pinned
# at its address. Projects under SMALL_PROJECT units are grouped into ~500 m
# cells (counts by stage, no address, no permit notes); apartment complexes and
# subdivisions of SMALL_PROJECT+ units keep their exact spot and name.
SMALL_PROJECT = 5
CELL = 0.005  # degrees (~450 m north-south here)
STAGE_RANK = {"approved": 1, "permitted": 2, "completed": 3}


def _kind(r: dict) -> str:
    raw = str(r.get("UNIT_CAT") or "").strip()
    return UNIT_TYPES.get(raw, raw)


def _cell(lon: float, lat: float) -> tuple[int, int]:
    return round(lon / CELL), round(lat / CELL)


def _cell_center(key: tuple[int, int]) -> tuple[float, float]:
    return round(key[0] * CELL, 4), round(key[1] * CELL, 4)


def housing_proposals(rows: object) -> dict:
    """APR Table A rows -> one point per application (newest report wins).
    Small projects (a home, an ADU) are grouped by cell, without addresses."""
    best: dict[tuple, dict] = {}
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict):
            continue
        tid = str(r.get("JURS_TRACKING_ID") or "").strip()
        # Names drift between yearly reports, so the tracking id alone is the key.
        key = (
            (r.get("JURIS_NAME"), tid)
            if tid and tid.upper() not in ("NONE", "N/A")
            else (r.get("JURIS_NAME"), r.get("STREET_ADDRESS"), _name(r.get("PROJECT_NAME")))
        )
        if key not in best or (_num(r.get("YEAR")) or 0) > (_num(best[key].get("YEAR")) or 0):
            best[key] = r
    feats = []
    cells: dict[tuple, dict] = {}
    for r in best.values():
        lon, lat = _num(r.get("LONGITUDE")), _num(r.get("LATITUDE"))
        if not _in_box(lon, lat):
            continue
        status = str(r.get("APPLICATION_STATUS") or "").strip().lower()
        stage = {"approved": "approved", "disapproved": "denied"}.get(status, "proposed")
        units = int(_num(r.get("TOT_PROPOSED_UNITS")) or 0)
        submitted = _date(r.get("APP_SUBMIT_DT"))
        if units < SMALL_PROJECT:
            c = cells.setdefault(
                (_cell(lon, lat), stage),
                {"units": 0, "projects": 0, "latest": "", "city": ""},
            )
            c["units"] += units
            c["projects"] += 1
            c["latest"] = max(c["latest"], submitted)
            c["city"] = c["city"] or str(r.get("JURIS_NAME") or "").title()
            continue
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": _name(r.get("PROJECT_NAME")),
                    "city": str(r.get("JURIS_NAME") or "").title(),
                    "address": str(r.get("STREET_ADDRESS") or "").strip()[:120],
                    "kind": _kind(r),
                    "stage": stage,
                    "units": units,
                    "approved_units": int(_num(r.get("TOT_APPROVED_UNITS")) or 0),
                    "submitted": submitted,
                    "year": int(_num(r.get("YEAR")) or 0),
                },
            )
        )
    for (key, stage), c in cells.items():
        feats.append(
            _pt(
                *_cell_center(key),
                {
                    "grouped": True,
                    "city": c["city"],
                    "stage": stage,
                    "units": c["units"],
                    "projects": c["projects"],
                    "submitted": c["latest"],
                },
            )
        )
    return _fc(feats)


def _home_stage(r: dict) -> tuple[str, int, str] | None:
    done, permits, ents = (
        int(_num(r.get(k)) or 0)
        for k in ("NO_OTHER_FORMS_OF_READINESS", "NO_BUILDING_PERMITS", "NO_ENTITLEMENTS")
    )
    if done:
        return "completed", done, _date(r.get("CO_ISSUE_DT1"))
    if permits:
        return "permitted", permits, _date(r.get("BP_ISSUE_DT1"))
    if ents:
        return "approved", ents, _date(r.get("ENT_APPROVE_DT1"))
    return None


def new_homes(rows: object) -> dict:
    """APR Table A2 rows -> homes at their furthest stage: completed,
    permitted (building permit issued) or approved (entitled).

    Each yearly report lists a home again as it progresses, so rows are
    merged per home (furthest stage wins, then the newest report). Small
    projects are counted per cell; larger ones keep their own point."""
    best: dict[tuple, tuple[tuple, dict, tuple[str, int, str]]] = {}
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict):
            continue
        st = _home_stage(r)
        if not st:
            continue
        home = str(r.get("APN") or "").strip() or str(r.get("STREET_ADDRESS") or "").strip().upper()
        key = (r.get("JURIS_NAME"), home or id(r), r.get("UNIT_CAT"))
        rank = (STAGE_RANK[st[0]], _num(r.get("YEAR")) or 0)
        if key not in best or rank > best[key][0]:
            best[key] = (rank, r, st)
    feats = []
    cells: dict[tuple, dict] = {}
    for _rank, r, (stage, units, when) in best.values():
        lon, lat = _num(r.get("LONGITUDE")), _num(r.get("LATITUDE"))
        if not _in_box(lon, lat):
            continue
        if units < SMALL_PROJECT:
            c = cells.setdefault(
                _cell(lon, lat),
                {"completed": 0, "permitted": 0, "approved": 0, "latest": "", "city": ""},
            )
            c[stage] += units
            c["latest"] = max(c["latest"], when)
            c["city"] = c["city"] or str(r.get("JURIS_NAME") or "").title()
            continue
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": _name(r.get("PROJECT_NAME")),
                    "city": str(r.get("JURIS_NAME") or "").title(),
                    "address": str(r.get("STREET_ADDRESS") or "").strip()[:120],
                    "kind": _kind(r),
                    "stage": stage,
                    "units": units,
                    "date": when,
                    "year": int(_num(r.get("YEAR")) or 0),
                },
            )
        )
    for key, c in cells.items():
        counts = {k: c[k] for k in ("completed", "permitted", "approved")}
        feats.append(
            _pt(
                *_cell_center(key),
                {
                    "grouped": True,
                    "city": c["city"],
                    # the color: the furthest stage reached by any home here
                    "stage": max((k for k, n in counts.items() if n), key=STAGE_RANK.__getitem__),
                    "units": sum(counts.values()),
                    **counts,
                    "date": c["latest"],
                },
            )
        )
    return _fc(feats)


_DMS = re.compile(
    r"""(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*"?\s*([NSEW])"""
)


def parse_coordinates(text: str) -> tuple[float, float] | None:
    """CEQAnet 'Location Coordinates' -> (lon, lat). Accepts DMS
    (37°30'27.84"N 120°43'28.15"W) or decimal ('37.5, -120.7')."""
    parts = _DMS.findall(text or "")
    if len(parts) >= 2:
        vals = {}
        for d, m, s, hemi in parts[:2]:
            v = float(d) + float(m or 0) / 60 + float(s or 0) / 3600
            vals["lat" if hemi in "NS" else "lon"] = -v if hemi in "SW" else v
        if "lat" in vals and "lon" in vals:
            return vals["lon"], vals["lat"]
    nums = re.findall(r"-?\d+\.\d+", text or "")
    if len(nums) >= 2:
        a, b = float(nums[0]), float(nums[1])
        return (b, a) if abs(a) <= 90 else (a, b)
    return None


# Document type -> stage. A Notice of Determination means the agency approved
# the project; everything else before it means review is still open.
CEQA_TYPES = {"NOD": "approved", "NOE": "exempt"}
CEQA_TYPE_NAMES = {
    "ADM": "Addendum",
    "SIR": "Supplemental EIR",
    "SBE": "Subsequent EIR",
    "RC": "Response to comments",
    "FED": "Federal (NEPA) document",
    "OTH": "Other document",
    "NOP": "Notice of Preparation (EIR coming)",
    "EIR": "Draft EIR",
    "MND": "Mitigated Negative Declaration",
    "NEG": "Negative Declaration",
    "CON": "Early consultation",
    "FIN": "Final EIR",
    "NOD": "Notice of Determination (approved)",
    "NOE": "Notice of Exemption",
}


def ceqa_projects(csv_text: str, since: dt.date) -> dict:
    """CEQAnet CSV -> one point per project (its newest document), for
    documents with coordinates in the county. Contact names, emails and
    phone numbers in the export are never kept."""
    latest: dict[str, dict] = {}
    for r in csv.DictReader(io.StringIO(csv_text)):
        sch = (r.get("SCH Number") or "").strip()
        received = (r.get("Received") or "").strip()
        try:
            got = dt.datetime.strptime(received[:10], "%m/%d/%Y").date()
        except ValueError:
            try:
                got = dt.date.fromisoformat(received[:10])
            except ValueError:
                continue
        if not sch or got < since:
            continue
        if sch not in latest or got > latest[sch]["_got"]:
            latest[sch] = {**r, "_got": got}
    feats = []
    for sch, r in latest.items():
        pos = parse_coordinates(r.get("Location Coordinates") or "")
        if not pos or not _in_box(*pos):
            continue
        doc = (r.get("Document Type") or "").strip()
        url = (r.get("Document Portal URL") or "").strip()
        feats.append(
            _pt(
                pos[0],
                pos[1],
                {
                    "name": _name(r.get("Project Title") or r.get("Document Title")),
                    "agency": (r.get("Lead Agency Name") or "").strip()[:100],
                    "doc": CEQA_TYPE_NAMES.get(doc, doc),
                    "stage": CEQA_TYPES.get(doc, "review"),
                    "received": r["_got"].isoformat(),
                    "development": (r.get("NOC Development Type") or "").strip()[:200],
                    "action": (r.get("NOC Local Action") or "").strip()[:200],
                    "acres": _num((r.get("Location Total Acres") or "").replace(",", "")),
                    "description": re.sub(r"\s+", " ", r.get("Document Description") or "").strip()[
                        :500
                    ],
                    "page": url
                    if url.startswith("https://ceqanet.lci.ca.gov/")
                    else f"https://ceqanet.lci.ca.gov/{sch}",
                },
            )
        )
    return _fc(feats)


async def load_housing_proposals(client: httpx.AsyncClient, _s: object) -> dict:
    cols = (
        '"JURIS_NAME","YEAR","JURS_TRACKING_ID","PROJECT_NAME","STREET_ADDRESS","UNIT_CAT",'
        '"APP_SUBMIT_DT","TOT_PROPOSED_UNITS","TOT_APPROVED_UNITS","APPLICATION_STATUS",'
        '"LATITUDE","LONGITUDE"'
    )
    fc = housing_proposals(await _sql(client, _juris_sql(APR_A, cols, dt.date.today().year - 4)))
    if not fc["features"]:
        raise ValueError("no housing proposals")  # never publish an empty layer
    return fc


async def load_new_homes(client: httpx.AsyncClient, _s: object) -> dict:
    cols = (
        '"JURIS_NAME","YEAR","APN","PROJECT_NAME","STREET_ADDRESS","UNIT_CAT","ENT_APPROVE_DT1",'
        '"NO_ENTITLEMENTS","BP_ISSUE_DT1","NO_BUILDING_PERMITS","CO_ISSUE_DT1",'
        '"NO_OTHER_FORMS_OF_READINESS","LATITUDE","LONGITUDE"'
    )
    fc = new_homes(await _sql(client, _juris_sql(APR_A2, cols, dt.date.today().year - 3)))
    if not fc["features"]:
        raise ValueError("no new homes")
    return fc


async def load_ceqa(client: httpx.AsyncClient, _s: object) -> dict:
    since = dt.date.today() - dt.timedelta(days=3 * 365)
    body, _ = await fetch_capped(
        client,
        CEQANET_CSV,
        max_bytes=arcgis.MAX_BYTES,
        params={
            "SearchType": "Advanced",
            "County": "Stanislaus",
            "OutputFormat": "CSV",
            "StartRange": since.isoformat(),
        },
    )
    fc = ceqa_projects(body.decode("cp1252", errors="replace"), since)
    if not fc["features"]:
        raise ValueError("no CEQA projects")
    return fc
