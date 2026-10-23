"""Parsers for the free school meals pack (school_meals.py). No I/O here.

Inputs:
  - NCES Common Core of Data (CCD) school characteristics file (ccd_sch_129):
    one row per public school with NSLP_STATUS, keyed by the 12-digit NCES
    school id (NCESSCH) and the state's own id (ST_SCHID, e.g. "NC-260-308").
  - NCES EDGE "School Characteristics - Current" (ArcGIS): name, district,
    point, open/closed status and virtual flag for the same NCES ids.
  - North Carolina DPI's CEP annual notification workbook (CCD lists no NC
    school under CEP, a state reporting gap): "Currently Participating" = X.

Output properties (compact; services-pack style):
  n school name · d district (left out when it's the school's own name) ·
  r why every student eats free: l state law, o state program the district
  opts into, c Community Eligibility Provision (CEP), p Provision 2 or 3 ·
  y the school year it applies to (2024 = 2024-25).
"""

from __future__ import annotations

import collections
import csv
import io
import re
import zipfile

from ._services_parse import clean, fc, point

# Statewide free breakfast and lunch for every public school student, checked
# against each state's own page for the school year in `year` (2026 = 2026-27).
# opt_in: the law lets each district choose to take part (nearly all do).
# Upkeep each summer: re-check every row, bump `year`, add new states.
UNIVERSAL: dict[str, dict] = {
    "CA": {
        "law": "California Universal Meals Program",
        "cite": "California Education Code 49501.5",
        "page": "https://www.cde.ca.gov/ls/nu/sn/cauniversalmeals.asp",
        "year": 2026,
        "opt_in": False,
    },
    "CO": {
        "law": "Colorado Healthy School Meals for All",
        "cite": "Proposition FF (2022)",
        "page": (
            "https://ed.cde.state.co.us/nutrition/nutrition-programs/"
            "healthy-school-meals-for-all-program"
        ),
        "year": 2026,
        "opt_in": True,
    },
    "ME": {
        "law": "Maine universal free school meals",
        "cite": "state law enacted in 2021",
        "page": "https://www.maine.gov/doe/schools/nutrition",
        "year": 2026,
        "opt_in": False,
    },
    "MA": {
        "law": "Massachusetts universal free school meals",
        "cite": "made permanent in the FY2024 state budget (2023)",
        "page": "https://www.doe.mass.edu/cnp/",
        "year": 2026,
        "opt_in": False,
    },
    "MI": {
        "law": "Michigan School Meals",
        "cite": (
            "State School Aid Act section 30d, renewed in each yearly budget "
            "(FY2027 signed July 21, 2026)"
        ),
        "page": "https://www.michigan.gov/mde/services/food/michigan-school-meals",
        "year": 2026,
        "opt_in": True,
    },
    "MN": {
        "law": "Minnesota Free School Meals Program",
        "cite": "Minnesota Statutes 124D.111 (2023)",
        "page": "https://education.mn.gov/MDE/dse/FNS/SNP/free/",
        "year": 2026,
        "opt_in": False,
    },
    "NM": {
        "law": "New Mexico Healthy Universal School Meals",
        "cite": "Healthy Universal School Meals Act (2023)",
        "page": "https://web.ped.nm.gov/bureaus/student-success-wellness/school-meals/",
        "year": 2026,
        "opt_in": False,
    },
    "NY": {
        "law": "New York Universal Free School Meals",
        "cite": "Education Law section 915-a (2025)",
        "page": "https://www.cn.nysed.gov/programs/national-school-lunch-program",
        "year": 2026,
        "opt_in": False,
    },
    "VT": {
        "law": "Vermont universal school meals",
        "cite": "Act 64 of 2023",
        "page": "https://education.vermont.gov/schools/nutrition",
        "year": 2026,
        "opt_in": False,
    },
}

# CCD NSLP_STATUS codes where every student eats free. Provision 1 is left
# out on purpose: it only stretches paperwork for students already eligible.
FREE_STATUS = {"NSLPCEO": "c", "NSLPPRO2": "p", "NSLPPRO3": "p"}
NO_LUNCH_PROGRAM = "NSLPNO"
# EDGE SY_STATUS_TEXT values for schools not open this year.
NOT_OPEN = {"Closed", "Inactive", "Future"}
FULL_VIRTUAL = "Full Virtual"  # students don't eat at a building
MAX_CSV = 64 * 1024 * 1024  # the 2024-25 file is 20 MB unzipped


def read_zip_csv(body: bytes) -> str:
    """The one CSV inside a CCD zip (the zip also holds a SAS copy)."""
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        names = [i for i in z.infolist() if i.filename.lower().endswith(".csv")]
        if len(names) != 1:
            raise ValueError(f"CCD zip: expected one CSV, found {len(names)}")
        if names[0].file_size > MAX_CSV:
            raise ValueError("CCD zip: CSV too large")
        # Only ASCII columns are read (ids and status codes); latin-1 never fails.
        return z.read(names[0]).decode("latin-1")


def ccd_nslp(text: str) -> tuple[int, dict[str, str], dict[str, str]]:
    """(school year start, NCESSCH -> NSLP_STATUS, ST_SCHID -> NCESSCH)."""
    reader = csv.DictReader(io.StringIO(text))
    need = {"SCHOOL_YEAR", "NCESSCH", "ST_SCHID", "NSLP_STATUS"}
    if not need <= set(reader.fieldnames or ()):
        raise ValueError(f"CCD file: missing columns {need - set(reader.fieldnames or ())}")
    status: dict[str, str] = {}
    by_state_id: dict[str, str] = {}
    years: collections.Counter[str] = collections.Counter()
    for row in reader:
        nces = (row["NCESSCH"] or "").strip()
        if not re.fullmatch(r"\d{12}", nces):
            continue
        status[nces] = (row["NSLP_STATUS"] or "").strip()
        sid = (row["ST_SCHID"] or "").strip().upper()
        if sid:
            by_state_id[sid] = nces
        years[(row["SCHOOL_YEAR"] or "").strip()] += 1
    if not years:
        raise ValueError("CCD file: no schools")
    m = re.fullmatch(r"(\d{4})-(\d{4})", years.most_common(1)[0][0])
    if not m or int(m[2]) != int(m[1]) + 1:
        raise ValueError(f"CCD file: odd school year {years.most_common(1)[0][0]!r}")
    return int(m[1]), status, by_state_id


def edge_rows(page: object) -> list[dict]:
    """Attribute rows of one EDGE query page (f=json); ArcGIS errors raise."""
    if not isinstance(page, dict) or "error" in page or not isinstance(page.get("features"), list):
        raise ValueError("EDGE: not a feature page")
    return [f["attributes"] for f in page["features"] if isinstance(f.get("attributes"), dict)]


# --- North Carolina DPI ------------------------------------------------------

NC_SHEET = "School Notification Report"
NC_YEAR = re.compile(r"SY\s*(\d{4})\s*-\s*(\d{4})")


def _norm(h: str) -> str:
    return re.sub(r"[^a-z]+", " ", h.replace("_x000D_", " ").lower()).strip()


def nc_participating(rows: list[list[str]], by_state_id: dict[str, str]) -> tuple[int, set, int]:
    """(school year start, NCES ids of participating schools, rows not matched).

    DPI ids are LEA (3 characters: "260", or "32A" for a charter) + school
    (3 digits). CCD's ST_SCHID is "NC-<LEA>-<school>", except that charters
    use school "000" where DPI writes "001". Rows that match neither (private
    or residential sponsors, pre-K centers) are counted, never guessed."""
    year = None
    head_at = None
    for i, r in enumerate(rows[:20]):
        for cell in r:
            if (m := NC_YEAR.search(cell or "")) and int(m[2]) == int(m[1]) + 1:
                year = int(m[1])
        names = [_norm(c) for c in r]
        if "lea id" in names and "school id" in names:
            head_at = i
            break
    if year is None or head_at is None:
        raise ValueError("NC notification: no school year or header row")
    names = [_norm(c) for c in rows[head_at]]
    try:
        lea, sch = names.index("lea id"), names.index("school id")
        part = names.index("currently participating")
    except ValueError as exc:
        raise ValueError("NC notification: missing columns") from exc
    found: set[str] = set()
    missed = 0
    for r in rows[head_at + 1 :]:
        if len(r) <= max(lea, sch, part) or r[part].strip().upper() != "X":
            continue
        a, b = r[lea].strip().upper(), r[sch].strip()
        if not a or not b.isdigit():
            missed += 1
            continue
        nces = by_state_id.get(f"NC-{a}-{b.zfill(3)}")
        if nces is None and not a.isdigit():
            nces = by_state_id.get(f"NC-{a}-000")  # charter: one school per LEA
        if nces is None:
            missed += 1
        else:
            found.add(nces)
    return year, found, missed


# --- the join ---------------------------------------------------------------


def _coord(v: object) -> float | None:
    try:
        x = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return x if x == x else None  # NaN


def free_schools(
    rows: list[dict],
    status: dict[str, str],
    ccd_year: int,
    overrides: dict[str, tuple[int, set[str]]] | None = None,
    universal: dict[str, dict] | None = None,
) -> dict[str, list[dict]]:
    """Point features by state for every open, in-person public school where
    every student eats free. `overrides` replaces the CCD status for a whole
    state with a state agency's own list: {state: (year, NCES ids)}."""
    universal = UNIVERSAL if universal is None else universal
    overrides = overrides or {}
    out: dict[str, list[dict]] = collections.defaultdict(list)
    seen: set[str] = set()
    for row in rows:
        nces = str(row.get("NCESSCH") or "").strip()
        st = str(row.get("LSTATE") or "").strip().upper()
        if not re.fullmatch(r"\d{12}", nces) or not re.fullmatch(r"[A-Z]{2}", st) or nces in seen:
            continue
        if str(row.get("SY_STATUS_TEXT") or "").strip() in NOT_OPEN:
            continue
        if str(row.get("VIRTUAL") or "").strip() == FULL_VIRTUAL:
            continue
        lon, lat = _coord(row.get("LONCOD")), _coord(row.get("LATCOD"))
        if lon is None or lat is None:
            continue
        s = status.get(nces, "")
        if st in universal:
            if s == NO_LUNCH_PROGRAM:  # the state laws work through the school lunch program
                continue
            law = universal[st]
            reason, year = ("o" if law["opt_in"] else "l"), int(law["year"])
        elif st in overrides:
            year, ids = overrides[st]
            if nces not in ids:
                continue
            reason = "c"
        elif s in FREE_STATUS:
            reason, year = FREE_STATUS[s], ccd_year
        else:
            continue
        name = clean(row.get("SCH_NAME"))
        if not name:
            continue
        props: dict = {"n": name}
        district = clean(row.get("LEA_NAME"))
        if district and district.lower() != name.lower():
            props["d"] = district
        props.update(r=reason, y=year)
        feat = point(lon, lat, props)  # None outside the US and its territories
        if feat:
            seen.add(nces)
            out[st].append(feat)
    return dict(out)


def collection(features: list[dict]) -> dict:
    """A state's FeatureCollection, in a stable order (district, then name)."""
    feats = sorted(
        features,
        key=lambda f: (f["properties"].get("d", f["properties"]["n"]), f["properties"]["n"]),
    )
    return fc(feats)
