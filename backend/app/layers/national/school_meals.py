"""Schools where every student eats free, one baked layer per state.

Why each school is on the map (popup reason, frontend/src/school-meals.ts):
  - State law: nine states pay for free breakfast and lunch for every public
    school student (UNIVERSAL in _school_meals_parse.py, checked each summer
    against each state's own page). Every open, in-person public school there
    that takes part in the school lunch program is shown.
  - Community Eligibility Provision (CEP) or Provision 2 or 3: the federal
    options that let a high-need school serve every student free with no
    application. From the NCES Common Core of Data (CCD) school file, whose
    NSLP_STATUS field records each school's choice (the newest file NCES has
    published; found through the CCD file API, a pinned copy as fallback),
    joined on the 12-digit NCES school id to the NCES EDGE school points
    (every open school matches: same ids, same year).
  - North Carolina reports no school under CEP to NCES, so its list is the
    N.C. Department of Public Instruction's CEP notification workbook
    ("Currently Participating"), joined through CCD's state school id.

Why one layer per state instead of one national file: about 57,000 schools
qualify, a ~9 MB file (1 MB gzipped) that would load in full for one
family's school. Per state, the biggest (California) is ~1.7 MB, and a
state's layer shows up in the sidebar whenever that state is on screen.

Left out on purpose, and documented in each layer's description: schools
that don't take part in the lunch program at all, fully virtual schools,
schools not open this year, and Provision 1 (it doesn't make meals free for
everyone). Idaho, Puerto Rico, American Samoa and the U.S. Virgin Islands
report no school-level status to NCES, so they have no layer (rather than a
layer that wrongly shows no free schools).

Refreshed weekly by CI (scripts/refresh_live.py --weekly): the sources
change once a year, but a weekly check picks up a new CCD release or a new
N.C. list without a code change. Properties: see _school_meals_parse.py.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from pathlib import Path

import httpx

from ...core.config import Settings
from ...core.http import fetch_capped
from .. import service
from ..service import Layer
from . import _school_meals_parse as smp
from . import _services_parse as sp
from .services import UA, WEEK, _get

logger = logging.getLogger(__name__)

DATA = Path(__file__).resolve().parent.parent / "data"
_BBOXES = json.loads((DATA / "state_bboxes.json").read_text())
STATE_NAMES = {k: v["name"] for k, v in _BBOXES.items()}
NAMES_ES = {
    "DC": "Distrito de Columbia",
    "HI": "Hawái",
    "LA": "Luisiana",
    "MP": "Islas Marianas del Norte",
    "MS": "Misisipi",
    "MO": "Misuri",
    "NH": "Nuevo Hampshire",
    "NJ": "Nueva Jersey",
    "NM": "Nuevo México",
    "NY": "Nueva York",
    "NC": "Carolina del Norte",
    "ND": "Dakota del Norte",
    "OR": "Oregón",
    "PA": "Pensilvania",
    "SC": "Carolina del Sur",
    "SD": "Dakota del Sur",
    "WV": "Virginia Occidental",
}

# --- sources -----------------------------------------------------------------

CCD_API = "https://nces.ed.gov/ccd/datatables/api/File"
CCD_SCHOOL_FILES = 11  # "Public Elementary/Secondary School Universe Survey Data"
CCD_129 = re.compile(r"https://nces\.ed\.gov/ccd/[Dd]ata/zip/ccd_sch_129_\d{4}_w_\w+\.zip")
# The newest school characteristics file when this was written (2024-25,
# released July 30, 2025): used when the file API is slow or changes.
CCD_129_PINNED = "https://nces.ed.gov/ccd/Data/zip/ccd_sch_129_2425_w_1a_073025.zip"
EDGE = (
    "https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/"
    "School_Characteristics_Current/FeatureServer/1/query"
)
EDGE_FIELDS = "NCESSCH,LSTATE,SCH_NAME,LEA_NAME,SY_STATUS_TEXT,VIRTUAL,LATCOD,LONCOD"
EDGE_PAGE = 2000
EDGE_MIN = 90_000  # fewer schools than this means the service broke
NC_PAGE = (
    "https://www.dpi.nc.gov/districts-schools/district-operations/school-nutrition/sn-data-reports"
)
NC_FILE = re.compile(
    r"/documents/schoolnutrition/(\d{4})-annual-notification-schools-eligibility-report/download"
)
NC_PINNED = (
    "https://www.dpi.nc.gov/documents/schoolnutrition/"
    "2026-annual-notification-schools-eligibility-report/download?attachment"
)
CEP_PAGE = "https://www.fna.usda.gov/cn/cep"  # USDA (fns.usda.gov redirects here)


async def _once(client: httpx.AsyncClient, url: str) -> bytes:
    """One try, small cap: the file API is only a hint (there's a pinned file)."""
    body, _ = await fetch_capped(client, url, max_bytes=5 * 1024 * 1024, headers=UA)
    return body


async def ccd_zip_url(client: httpx.AsyncClient) -> str:
    """The newest CCD school characteristics zip the file API lists (the
    pinned 2024-25 file if the API is down, slow or has changed)."""
    try:
        listing = json.loads(await _once(client, CCD_API))
        years = next(
            f["fileName"]["yearVersionModels"]
            for f in listing
            if f["fileName"]["fileNameId"] == CCD_SCHOOL_FILES
        )
        for v in sorted(years, key=lambda y: -int(y["schoolYearId"]))[:4]:
            sy, ver = int(v["schoolYearId"]), int(v["versionId"])
            body = await _once(client, f"{CCD_API}/0/0/{sy}/{CCD_SCHOOL_FILES}/{ver}/{sy}")
            if m := CCD_129.search(body.decode("utf-8", "replace")):
                return m[0]
    except (httpx.HTTPError, ValueError, KeyError, TypeError, StopIteration) as exc:
        logger.warning("CCD file API: %s; using the pinned file", exc)
    return CCD_129_PINNED


async def edge_schools(client: httpx.AsyncClient) -> list[dict]:
    """Every school in NCES EDGE's current characteristics service (attributes
    only: it carries LATCOD/LONCOD), checked against the service's own count."""

    async def page(**params) -> dict:
        query = {"where": "1=1", "f": "json", **params}
        return json.loads(await _get(client, EDGE, max_mb=20, params=query))

    total = (await page(returnCountOnly="true")).get("count")
    if not isinstance(total, int) or total < EDGE_MIN:
        raise ValueError(f"EDGE: odd school count {total!r}")
    rows: list[dict] = []
    for _ in range(-(-total // min(EDGE_PAGE, 500)) + 1):  # bounded, even for smaller pages
        data = await page(
            outFields=EDGE_FIELDS,
            returnGeometry="false",
            orderByFields="OBJECTID",
            resultOffset=str(len(rows)),
            resultRecordCount=str(EDGE_PAGE),
        )
        batch = smp.edge_rows(data)
        rows.extend(batch)
        if not batch or not data.get("exceededTransferLimit"):
            break
    if len(rows) != total:  # never publish a list cut short
        raise ValueError(f"EDGE: {len(rows)} rows read, service has {total}")
    return rows


async def nc_list(client: httpx.AsyncClient, by_state_id: dict[str, str]) -> tuple[int, set]:
    """North Carolina's participating schools (newest notification workbook)."""
    url = NC_PINNED
    try:
        html = (await _get(client, NC_PAGE, max_mb=5)).decode("utf-8", "replace")
        links = sorted({(int(m[1]), m[0]) for m in NC_FILE.finditer(html)})
        if links:
            url = "https://www.dpi.nc.gov" + links[-1][1] + "?attachment"
    except httpx.HTTPError as exc:
        logger.warning("NC DPI page: %s; using the pinned file", exc)
    rows = sp.read_xlsx(await _get(client, url, max_mb=20), smp.NC_SHEET)
    year, ids, missed = smp.nc_participating(rows, by_state_id)
    logger.info("NC CEP: %d schools matched to NCES ids, %d rows unmatched", len(ids), missed)
    if len(ids) < 1000 or missed > len(ids) * 0.05:
        raise ValueError(f"NC CEP list: {len(ids)} matched, {missed} unmatched")
    return year, ids


# One download shared by every state's layer (reused for an hour).
SHARED_TTL = 3600
_shared: dict = {}
_lock = asyncio.Lock()


async def all_states(client: httpx.AsyncClient) -> dict[str, list[dict]]:
    async with _lock:
        if time.monotonic() - _shared.get("at", -SHARED_TTL) < SHARED_TTL:
            return _shared["by_state"]
        # A failed download is remembered too: the other 51 layers re-raise it
        # instead of each running the whole download again.
        if (err := _shared.get("err")) and time.monotonic() - _shared["err_at"] < SHARED_TTL:
            raise err
        try:
            by_state = await _download(client)
        except Exception as exc:
            _shared.update(err=exc, err_at=time.monotonic())
            raise
        _shared.pop("err", None)
        _shared.update(by_state=by_state, at=time.monotonic())
        return by_state


async def _download(client: httpx.AsyncClient) -> dict[str, list[dict]]:
    """Every state's schools: CCD status + EDGE points (+ North Carolina's list)."""
    zip_url = await ccd_zip_url(client)
    text = smp.read_zip_csv(await _get(client, zip_url, max_mb=40))
    year, status, by_state_id = smp.ccd_nslp(text)
    if len(status) < 90_000:
        raise ValueError(f"CCD file: only {len(status)} schools")
    rows = await edge_schools(client)
    try:
        nc = await nc_list(client, by_state_id)
    except (httpx.HTTPError, ValueError) as exc:  # only NC keeps last week's file
        logger.warning("NC CEP list: %s", exc)
        nc = (0, set())
    by_state = smp.free_schools(rows, status, year, {"NC": nc})
    total = sum(len(v) for v in by_state.values())
    if total < 40_000:
        raise ValueError(f"free school meals: only {total} schools")
    logger.info("free school meals: %d schools from %s", total, zip_url.rsplit("/", 1)[-1])
    return by_state


def _baked_count(name: str) -> int:
    try:
        path = service.BAKED_LAYERS / f"{name}.geojson"
        return len(json.loads(path.read_text()).get("features", []))
    except (OSError, ValueError, AttributeError):
        return 0


def _loader(state: str):
    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        name = f"{state.lower()}-free-school-meals"
        feats = (await all_states(client)).get(state, [])
        # A state never goes blank or loses most of its schools in one refresh
        # (e.g. a new CCD year with a state's status only partly reported):
        # the last good file stays and the log says why.
        before = _baked_count(name)
        if not feats or len(feats) < before * 0.5:
            raise ValueError(f"{name}: {len(feats)} schools (last file had {before})")
        return smp.collection(feats)

    return load


# --- registry -------------------------------------------------------------------

# Every state and territory with school-level data (see the module docstring).
LAYER_STATES = sorted(set(STATE_NAMES) - {"ID", "PR", "AS", "VI"})


def _texts(st: str) -> tuple[str, str]:
    name, name_es = STATE_NAMES[st], NAMES_ES.get(st, STATE_NAMES[st])
    left_out = (
        "Not shown: schools outside the school lunch program, fully online schools and "
        "schools not open this year."
    )
    left_out_es = (
        "No se muestran: escuelas fuera del programa de almuerzos escolares, escuelas "
        "solo en línea y escuelas que no abren este año."
    )
    if law := smp.UNIVERSAL.get(st):
        y = law["year"]
        yy = f"{y}-{(y + 1) % 100:02d}"
        if law["opt_in"]:
            return (
                f"Free breakfast and lunch for every student at {name} public schools whose "
                f"district takes part in {law['law']}, the state program ({yy}). Ask the "
                f"school if unsure. Schools from NCES. {left_out}",
                f"Desayuno y almuerzo gratis para todos los alumnos en las escuelas públicas de "
                f"{name_es} cuyo distrito participa en el programa estatal {law['law']} (ciclo "
                f"escolar {yy}). Si tiene dudas, pregunte en la escuela. Escuelas según NCES. "
                f"{left_out_es}",
            )
        return (
            f"Every public school in {name} serves free breakfast and lunch to every student, "
            f"with no application, under state law: {law['law']} ({yy}). Schools from NCES. "
            f"{left_out}",
            f"Todas las escuelas públicas de {name_es} dan desayuno y almuerzo gratis a todos "
            f"los alumnos, sin llenar solicitud, por ley estatal: {law['law']} (ciclo escolar "
            f"{yy}). Escuelas según NCES. {left_out_es}",
        )
    if st == "NC":  # the state's own list names CEP schools only
        how, how_es = "", ""
        src = "N.C. Department of Public Instruction list"
        src_es = "lista del Departamento de Instrucción Pública de Carolina del Norte"
    else:
        how, how_es = " or Provision 2 or 3", " o las Provisiones 2 y 3"
        src, src_es = "the latest NCES school data", "los datos escolares más recientes de NCES"
    return (
        f"Public schools in {name} where every student gets free breakfast and lunch with no "
        f"application, through the federal Community Eligibility Provision (CEP){how} "
        f"({src}; the popup shows the school year). Schools can join or leave each year: "
        f"check with the school. {left_out}",
        f"Escuelas públicas de {name_es} donde todos los alumnos reciben desayuno y almuerzo "
        f"gratis sin llenar solicitud, gracias a la Provisión de Elegibilidad Comunitaria "
        f"(CEP) federal{how_es} ({src_es}; la ventana muestra el ciclo escolar). Las escuelas "
        f"pueden entrar o salir cada año: confírmelo con la escuela. {left_out_es}",
    )


LAYERS: dict[str, Layer] = {}
SOURCES: dict[str, str] = {}
_CCD_SOURCE = (
    "NCES Common Core of Data school file (NSLP status: CEP, Provision 2/3), joined on "
    "NCES school id to NCES EDGE school locations"
)
for _st in LAYER_STATES:
    _name = f"{_st.lower()}-free-school-meals"
    _desc, _desc_es = _texts(_st)
    LAYERS[_name] = Layer(
        name=_name,
        title=f"Schools where every student eats free ({STATE_NAMES[_st]})",
        title_es=(
            f"Escuelas donde todos los alumnos comen gratis ({NAMES_ES.get(_st, STATE_NAMES[_st])})"
        ),
        description=_desc,
        description_es=_desc_es,
        category="service",
        group="places",
        coverage=_st,
        ttl=WEEK,
        loader=_loader(_st),
    )
    if _st in smp.UNIVERSAL:
        _law = smp.UNIVERSAL[_st]
        SOURCES[_name] = (
            f"{_law['law']}, {_law['cite']} ({_law['page']}); schools: NCES EDGE school "
            "locations and Common Core of Data"
        )
    elif _st == "NC":
        SOURCES[_name] = (
            "N.C. Department of Public Instruction, CEP annual notification (currently "
            "participating schools), joined through NCES Common Core of Data state school ids "
            "to NCES EDGE school locations"
        )
    else:
        SOURCES[_name] = _CCD_SOURCE

# Refreshed weekly by CI (scripts/refresh_live.py --weekly).
WEEKLY = tuple(LAYERS)
