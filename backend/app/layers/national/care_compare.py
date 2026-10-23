"""Health care facilities with their Medicare star ratings, nationwide.

From CMS Care Compare open data (data.cms.gov provider-data, keyless, U.S.
government work), the same lists Medicare.gov's Care Compare shows:

  - Dialysis centers (Dialysis Facility - Listing by Facility, 23ew-n7w9):
    quality-of-care stars, stations, home dialysis and evening shifts.
  - Hospice providers (Hospice - General Information, yc9t-dgbk), with the
    family caregiver survey stars (CAHPS Hospice, gxki-hrr8).
  - Home health agencies (Home Health Care Agencies, 6jpm-sxkc): quality
    stars and services, with the patient survey stars (HHCAHPS, found by
    title: CMS gives that dataset a new id each quarter).
  - Hospital star ratings (Hospital General Information, xubh-q36u): the
    overall rating, emergency services and "birthing-friendly". Additive to
    the HIFLD `hospitals` layer, which has no ratings.

Nursing homes are left out: `us-nursing-homes` already covers them.

The lists have addresses but no coordinates, so they're geocoded with the
U.S. Census batch geocoder like the SSA offices (ZIP-area center fallback,
flagged x=1). A facility whose address hasn't changed keeps last week's
point, so the weekly refresh (scripts/refresh_live.py --weekly) only
geocodes new or moved facilities.

Privacy: explicit allowlists (_care_compare_parse.py). Facility names,
addresses, public phones, CMS ids, ratings and services only. These
datasets list facilities, not clinicians, and no person's name is read.
"""

from __future__ import annotations

import json
import logging
import re

import httpx

from ...core.config import Settings
from ..service import BAKED_LAYERS, Layer
from . import _care_compare_parse as cp
from .services import WEEK, _enough, _get, geocode

logger = logging.getLogger(__name__)

CMS = "https://data.cms.gov/provider-data/api/1"
DATASTORE = CMS + "/datastore/query/{}/0"
METASTORE = CMS + "/metastore/schemas/dataset/items"
PAGE = 1500  # the API's largest page
MAX_ROWS = 60_000  # never page forever (the biggest list is ~12,500 rows)

DIALYSIS = "23ew-n7w9"
HOSPICE = "yc9t-dgbk"
HOSPICE_CAHPS = "gxki-hrr8"
HOME_HEALTH = "6jpm-sxkc"
HOSPITALS = "xubh-q36u"
# "Home Health Care - Patient Survey (HHCAHPS) 2025Q2 to 2026Q1": the
# provider file, not its National / State / Measure Dates companions.
HHCAHPS_TITLE = re.compile(r"^Home Health Care - Patient Survey \(HHCAHPS\) \d{4}Q\d to \d{4}Q\d$")

COLUMNS = {
    DIALYSIS: (
        "cms_certification_number_ccn",
        "facility_name",
        "address_line_1",
        "address_line_2",
        "citytown",
        "state",
        "zip_code",
        "telephone_number",
        "five_star",
        "of_dialysis_stations",
        "offers_incenter_hemodialysis",
        "offers_peritoneal_dialysis",
        "offers_home_hemodialysis_training",
        "late_shift",
        "profit_or_nonprofit",
        "chain_organization",
    ),
    HOSPICE: (
        "cms_certification_number_ccn",
        "facility_name",
        "address_line_1",
        "address_line_2",
        "citytown",
        "state",
        "zip_code",
        "telephone_number",
        "ownership_type",
    ),
    HOSPICE_CAHPS: ("cms_certification_number_ccn", "star_rating"),
    HOME_HEALTH: (
        "cms_certification_number_ccn",
        "provider_name",
        "address",
        "citytown",
        "state",
        "zip_code",
        "telephone_number",
        "type_of_ownership",
        "quality_of_patient_care_star_rating",
        "offers_nursing_care_services",
        "offers_physical_therapy_services",
        "offers_occupational_therapy_services",
        "offers_speech_pathology_services",
        "offers_medical_social_services",
        "offers_home_health_aide_services",
    ),
    "hhcahps": ("cms_certification_number_ccn", "hhcahps_survey_summary_star_rating"),
    HOSPITALS: (
        "facility_id",
        "facility_name",
        "address",
        "citytown",
        "state",
        "zip_code",
        "telephone_number",
        "hospital_type",
        "hospital_ownership",
        "emergency_services",
        "meets_criteria_for_birthing_friendly_designation",
        "hospital_overall_rating",
    ),
}


async def cms_rows(
    client: httpx.AsyncClient,
    dataset: str,
    columns: tuple[str, ...],
    where: tuple[str, str] | None = None,
) -> list[dict]:
    """Every row of one CMS dataset (only `columns`), page by page. A short
    or over-long read fails, so a cut list is never published."""
    params = {
        "limit": str(PAGE),
        "count": "true",
        "results": "true",
        "schema": "false",
        "keys": "true",
    }
    params.update({f"properties[{i}]": c for i, c in enumerate(columns)})
    # A fixed order (the CCN is always the first column), so no row is read
    # twice or skipped between pages.
    params.update({"sorts[0][property]": columns[0], "sorts[0][order]": "asc"})
    if where:
        params.update(
            {
                "conditions[0][property]": where[0],
                "conditions[0][value]": where[1],
                "conditions[0][operator]": "=",
            }
        )
    rows: list[dict] = []
    offset, total = 0, 1
    while offset < total:
        body = await _get(
            client, DATASTORE.format(dataset), max_mb=24, params={**params, "offset": str(offset)}
        )
        got, total = cp.page(json.loads(body))
        if total > MAX_ROWS:
            raise ValueError(f"CMS {dataset}: {total} rows (expected <= {MAX_ROWS})")
        if not got and offset < total:
            raise ValueError(f"CMS {dataset}: empty page at {offset} of {total}")
        rows += got
        offset += len(got)  # follows the server if it lowers its page size
    if len(rows) != total:
        raise ValueError(f"CMS {dataset}: read {len(rows)} of {total} rows")
    return rows


def hhcahps_dataset(items: object) -> str:
    """The current quarter's HHCAHPS provider dataset id from the catalog."""
    rows = items if isinstance(items, list) else []
    hits = sorted(
        (str(d.get("modified", "")), str(d.get("identifier", "")))
        for d in rows
        if isinstance(d, dict) and HHCAHPS_TITLE.match(str(d.get("title", "")).strip())
    )
    if not hits or not re.fullmatch(r"[a-z0-9]{4}-[a-z0-9]{4}", hits[-1][1]):
        raise ValueError("no HHCAHPS provider dataset in the CMS catalog")
    return hits[-1][1]


async def place(client: httpx.AsyncClient, name: str, records: list[dict]) -> list:
    """Points for the records: last week's point where the address is
    unchanged, the Census geocoder (ZIP-area fallback) for the rest."""
    known: dict = {}
    try:
        known = cp.known_places(json.loads((BAKED_LAYERS / f"{name}.geojson").read_text()))
    except (OSError, ValueError):
        pass  # first bake: geocode everything
    feats, todo = cp.reuse(records, known)
    logger.info("%s: %d kept, %d to geocode", name, len(records) - len(todo), len(todo))
    if todo:
        fresh = await geocode(client, [records[i] for i in todo], True)
        for i, f in zip(todo, fresh, strict=True):
            feats[i] = f
    missing = sum(1 for f in feats if f is None)
    if missing:
        logger.warning("%s: %d facilities could not be placed", name, missing)
    return feats


async def _dialysis(client: httpx.AsyncClient, _s: Settings) -> dict:
    recs = cp.dialysis(await cms_rows(client, DIALYSIS, COLUMNS[DIALYSIS]))
    return _enough("dialysis-facilities", await place(client, "dialysis-facilities", recs), 5000)


async def _hospice(client: httpx.AsyncClient, _s: Settings) -> dict:
    rows = await cms_rows(client, HOSPICE, COLUMNS[HOSPICE])
    survey: dict = {}
    try:  # the survey stars are extra, as for home health
        found = await cms_rows(
            client,
            HOSPICE_CAHPS,
            COLUMNS[HOSPICE_CAHPS],
            where=("measure_code", "SUMMARY_STAR_RATING"),
        )
        survey = cp.star_map(found, "cms_certification_number_ccn", "star_rating")
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("hospice survey stars skipped: %s", exc)
    recs = cp.hospice(rows, survey)
    return _enough("hospice-providers", await place(client, "hospice-providers", recs), 4000)


async def _home_health(client: httpx.AsyncClient, _s: Settings) -> dict:
    rows = await cms_rows(client, HOME_HEALTH, COLUMNS[HOME_HEALTH])
    survey: dict = {}
    try:  # the survey stars are extra: a moved dataset mustn't block the list
        items = json.loads(await _get(client, METASTORE, max_mb=16))
        found = await cms_rows(client, hhcahps_dataset(items), COLUMNS["hhcahps"])
        survey = cp.star_map(
            found, "cms_certification_number_ccn", "hhcahps_survey_summary_star_rating"
        )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("home health survey stars skipped: %s", exc)
    recs = cp.home_health(rows, survey)
    return _enough("home-health-agencies", await place(client, "home-health-agencies", recs), 8000)


async def _hospitals(client: httpx.AsyncClient, _s: Settings) -> dict:
    recs = cp.hospitals(await cms_rows(client, HOSPITALS, COLUMNS[HOSPITALS]))
    return _enough("hospital-ratings", await place(client, "hospital-ratings", recs), 4000)


def _layer(
    name: str, title: str, title_es: str, description: str, description_es: str, loader
) -> Layer:
    return Layer(
        name=name,
        title=title,
        title_es=title_es,
        description=description,
        description_es=description_es,
        category="service",
        group="help",
        coverage="usa",
        ttl=WEEK,
        loader=loader,
    )


LAYERS: dict[str, Layer] = {
    "dialysis-facilities": _layer(
        "dialysis-facilities",
        "Dialysis centers (Medicare star ratings)",
        "Centros de diálisis (calificación de Medicare)",
        "Medicare-certified dialysis centers with their quality-of-care star "
        "rating, home dialysis options and evening shifts (CMS Care Compare).",
        "Centros de diálisis certificados por Medicare, con su calificación de calidad "
        "en estrellas, opciones de diálisis en casa y turnos de tarde-noche "
        "(CMS Care Compare).",
        _dialysis,
    ),
    "hospice-providers": _layer(
        "hospice-providers",
        "Hospice providers (Medicare)",
        "Proveedores de cuidados paliativos (hospicio, Medicare)",
        "Medicare-certified hospice providers, with the star rating from "
        "families' survey answers (CMS Care Compare). Hospice care usually "
        "comes to the home.",
        "Proveedores de cuidados paliativos (hospicio) certificados por Medicare, con la "
        "calificación en estrellas de las encuestas a las familias (CMS Care Compare). "
        "Estos cuidados casi siempre se dan en la casa.",
        _hospice,
    ),
    "home-health-agencies": _layer(
        "home-health-agencies",
        "Home health agencies (Medicare star ratings)",
        "Agencias de atención médica a domicilio (calificación de Medicare)",
        "Medicare-certified home health agencies with their quality and patient "
        "survey star ratings and services (CMS Care Compare). Agencies come to "
        "the home: check which ones serve your ZIP code on Care Compare.",
        "Agencias de atención médica a domicilio certificadas por Medicare, con sus "
        "calificaciones en estrellas de calidad y de encuestas a pacientes, y sus servicios "
        "(CMS Care Compare). Las agencias van a la casa: vea en Care Compare cuáles "
        "atienden su código postal.",
        _home_health,
    ),
    "hospital-ratings": _layer(
        "hospital-ratings",
        "Hospital star ratings (Medicare)",
        "Calificación de hospitales (Medicare)",
        "Medicare's overall hospital star rating, emergency services and "
        "'birthing-friendly' designation for each hospital (CMS Care Compare).",
        "La calificación general en estrellas de Medicare para cada hospital, si tiene "
        "servicio de emergencias y si tiene la designación 'amigable con el parto' "
        "(birthing-friendly) (CMS Care Compare).",
        _hospitals,
    ),
}

_CMS_SOURCE = (
    "CMS Care Compare provider data (data.cms.gov), geocoded with the U.S. Census Geocoder"
)
SOURCES: dict[str, str] = {
    "dialysis-facilities": f"{_CMS_SOURCE}: Dialysis Facility - Listing by Facility",
    "hospice-providers": (
        f"{_CMS_SOURCE}: Hospice - General Information and CAHPS Hospice Survey star ratings"
    ),
    "home-health-agencies": (
        f"{_CMS_SOURCE}: Home Health Care Agencies and HHCAHPS patient survey star ratings"
    ),
    "hospital-ratings": f"{_CMS_SOURCE}: Hospital General Information (overall star rating)",
}

# Refreshed weekly by CI (scripts/refresh_live.py --weekly).
WEEKLY = tuple(n for n, layer in LAYERS.items() if layer.loader)
