"""Parsers for the Medicare Care Compare pack (see care_compare.py).

The leading underscore keeps this helper from being loaded as a layer pack.

Pure functions over the CMS provider-data API's JSON (one page of rows at a
time), each unit-tested with a small hand-written fixture. Explicit
allowlists only: the facility's name, street address, public phone, CMS
certification number and its published ratings and services. These datasets
list facilities, never individual clinicians; nothing else is read.

Compact property names (the services pack's, plus the ones below), since the
nationwide files load in full:
  n name · a street · c city · s state · p phone (10 digits) · x 1 = approximate location
  id CMS certification number (CCN) · st star rating (1-5; home health in
  half stars) · ss patient survey stars (home health) · ow ownership
  (fp for-profit · np nonprofit · gov government · tribal) · t hospital type
  · er 1 = emergency services · bf 1 = "birthing-friendly" · ns dialysis
  stations · sv services offered (bit flags, see below) · ls 1 = a dialysis
  shift starting after 5 pm · g dialysis chain (company)
"""

from __future__ import annotations

import re

from . import _services_parse as sp

MAX_STARS = 5


def page(doc: object) -> tuple[list[dict], int]:
    """(rows, total count) from one datastore query reply; a reply without
    them means the API changed, so it fails instead of publishing less."""
    if not isinstance(doc, dict) or not isinstance(doc.get("results"), list):
        raise ValueError("CMS datastore: no results list")
    count = doc.get("count")
    if not isinstance(count, int) or count < 0:
        raise ValueError("CMS datastore: no row count")
    return [r for r in doc["results"] if isinstance(r, dict)], count


def stars(v: object) -> float | int | None:
    """1-5 stars (halves kept), or None for 'Not Available' / '-' / junk."""
    try:
        n = float(sp.clean(v))
    except ValueError:
        return None
    if not 1 <= n <= MAX_STARS or (n * 2) % 1:
        return None
    return int(n) if n.is_integer() else n


def _yes(v: object) -> int:
    return 1 if sp.clean(v).upper() in {"YES", "Y"} else 0


def ownership(v: object) -> str:
    """CMS ownership wording (it differs per dataset) -> fp / np / gov / tribal."""
    s = sp.clean(v).upper()
    if not s:
        return ""
    if "TRIBAL" in s:
        return "tribal"
    if "GOVERNMENT" in s or "VETERANS" in s or "DEFENSE" in s:
        return "gov"
    if "NON-PROFIT" in s or "NONPROFIT" in s:
        return "np"
    if s in {"PROFIT", "FOR-PROFIT", "PROPRIETARY", "PHYSICIAN"}:
        return "fp"
    return ""


_CCN = re.compile(r"^[0-9A-Z]{6}$")
# A small agency registered at an apartment is run from someone's home: like
# home-based child care, it stays off the map (address and phone are personal).
HOME_ADDRESS = re.compile(r"\b(APT|APARTMENT)\b", re.I)


def _base(r: dict, name: str, street: str, ccn: str) -> dict | None:
    """The fields every layer shares, or None for a row that can't be placed."""
    ccn = sp.clean(r.get(ccn)).upper()
    rec = {
        "id": ccn,
        "n": sp.clean(r.get(name)),
        "a": street,
        "c": sp.clean(r.get("citytown")),
        "s": sp.clean(r.get("state")).upper(),
        "zip": sp.zip5(sp.clean(r.get("zip_code"))),
        # ten digits (the popup formats them): 4 bytes a row in 12,000-row files
        "p": re.sub(r"\D", "", sp.phone(r.get("telephone_number"))),
    }
    if not _CCN.match(ccn) or not rec["n"] or not street or not re.fullmatch(r"[A-Z]{2}", rec["s"]):
        return None
    if HOME_ADDRESS.search(street):
        return None
    return rec


def _street(*parts: object) -> str:
    return ", ".join(p for p in (sp.clean(x) for x in parts) if p)


# --- Dialysis Facility - Listing by Facility ---------------------------------

# sv is a sum of bit flags (a 12,000-row file can't afford the words; the
# frontend's CARE_SERVICES lists the same bits).
_DIALYSIS_SERVICES = (
    ("offers_incenter_hemodialysis", 1),  # in-center hemodialysis
    ("offers_peritoneal_dialysis", 2),  # peritoneal (at home)
    ("offers_home_hemodialysis_training", 4),  # home hemodialysis training
)


def _flags(r: dict, columns: tuple[tuple[str, int], ...]) -> int:
    return sum(bit for col, bit in columns if _yes(r.get(col)))


def dialysis(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        rec = _base(
            r,
            "facility_name",
            _street(r.get("address_line_1"), r.get("address_line_2")),
            "cms_certification_number_ccn",
        )
        if not rec:
            continue
        chain = sp.clean(r.get("chain_organization"))
        try:
            stations = int(float(sp.clean(r.get("of_dialysis_stations")) or 0))
        except (ValueError, OverflowError):
            stations = 0
        rec.update(
            st=stars(r.get("five_star")),
            ns=stations,
            sv=_flags(r, _DIALYSIS_SERVICES),
            ls=_yes(r.get("late_shift")),
            ow=ownership(r.get("profit_or_nonprofit")),
            g="" if chain.upper() in {"INDEPENDENT", "OTHER", "STATE OWNED"} else chain,
        )
        out.append(rec)
    return out


# --- Home Health Care Agencies (+ HHCAHPS patient survey stars) --------------

_HOME_HEALTH_SERVICES = (
    ("offers_nursing_care_services", 1),
    ("offers_physical_therapy_services", 2),
    ("offers_occupational_therapy_services", 4),
    ("offers_speech_pathology_services", 8),
    ("offers_medical_social_services", 16),
    ("offers_home_health_aide_services", 32),
)


def star_map(rows: list[dict], ccn: str, column: str) -> dict[str, float | int]:
    """CCN -> stars from a ratings dataset (rows without a rating are left out)."""
    out = {}
    for r in rows:
        n = stars(r.get(column))
        if n is not None:
            out[sp.clean(r.get(ccn)).upper()] = n
    return out


def home_health(rows: list[dict], survey: dict[str, float | int]) -> list[dict]:
    out = []
    for r in rows:
        rec = _base(r, "provider_name", sp.clean(r.get("address")), "cms_certification_number_ccn")
        if not rec:
            continue
        rec.update(
            st=stars(r.get("quality_of_patient_care_star_rating")),
            ss=survey.get(rec["id"]),
            sv=_flags(r, _HOME_HEALTH_SERVICES),
            ow=ownership(r.get("type_of_ownership")),
        )
        out.append(rec)
    return out


# --- Hospice - General Information (+ CAHPS family survey stars) -------------


def hospice(rows: list[dict], survey: dict[str, float | int]) -> list[dict]:
    out = []
    for r in rows:
        rec = _base(
            r,
            "facility_name",
            _street(r.get("address_line_1"), r.get("address_line_2")),
            "cms_certification_number_ccn",
        )
        if not rec:
            continue
        rec.update(st=survey.get(rec["id"]), ow=ownership(r.get("ownership_type")))
        out.append(rec)
    return out


# --- Hospital General Information (overall star rating) ----------------------

HOSPITAL_TYPES = {
    "ACUTE CARE HOSPITALS": "acute",
    "CRITICAL ACCESS HOSPITALS": "cah",
    "PSYCHIATRIC": "psych",
    "CHILDRENS": "kids",
    "ACUTE CARE - VETERANS ADMINISTRATION": "va",
    "ACUTE CARE - DEPARTMENT OF DEFENSE": "dod",
    "RURAL EMERGENCY HOSPITAL": "reh",
    "LONG-TERM": "ltc",
}


def hospitals(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        rec = _base(r, "facility_name", sp.clean(r.get("address")), "facility_id")
        if not rec:
            continue
        kind = sp.clean(r.get("hospital_type"))
        rec.update(
            st=stars(r.get("hospital_overall_rating")),
            t=HOSPITAL_TYPES.get(kind.upper(), kind),
            er=_yes(r.get("emergency_services")),
            bf=_yes(r.get("meets_criteria_for_birthing_friendly_designation")),
            ow=ownership(r.get("hospital_ownership")),
        )
        out.append(rec)
    return out


# --- geocoding reuse ---------------------------------------------------------


def _key(props: dict) -> tuple:
    return (props.get("id"), props.get("a"), props.get("c"), props.get("s"))


def known_places(fc: object) -> dict[tuple, tuple[float, float]]:
    """(CCN, street, city, state) -> (lon, lat) from the last published file:
    a facility whose address hasn't changed keeps its point, so the weekly
    refresh only geocodes new or moved facilities. ZIP-area points (x=1) are
    not kept: they're tried again each week (a few thousand rows, one batch)."""
    out: dict[tuple, tuple[float, float]] = {}
    for f in fc.get("features", []) if isinstance(fc, dict) else []:
        try:
            props = f["properties"]
            lon, lat = (float(v) for v in f["geometry"]["coordinates"][:2])
        except (KeyError, TypeError, ValueError):
            continue
        if props.get("id") and props.get("x") != 1:
            out[_key(props)] = (lon, lat)
    return out


def reuse(records: list[dict], known: dict) -> tuple[list[dict | None], list[int]]:
    """A point per record found in `known` (None elsewhere) and the indexes
    still to geocode. `zip` never reaches the output."""
    feats: list[dict | None] = []
    todo = []
    for i, r in enumerate(records):
        props = {k: v for k, v in r.items() if k != "zip"}
        hit = known.get(_key(props))
        if hit:
            feats.append(sp.point(*hit, props))
        else:
            feats.append(None)
            todo.append(i)
    return feats, todo
