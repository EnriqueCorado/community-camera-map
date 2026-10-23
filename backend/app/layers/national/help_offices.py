"""Where to get help in person, nationwide: government and legal-aid offices.

  - Social Security field offices and resident stations (SSA open data, CC0,
    updated quarterly): a baked nationwide file, geocoded with the U.S.
    Census geocoder and refreshed weekly in CI.
  - Free civil legal aid (Legal Services Corporation): which LSC-funded
    program serves each area, with its intake line and website (lsc.gov
    "Find legal aid" data, CC0). LSC publishes no current office list (its
    ArcGIS office layer was last edited in 2020), so the layer shows the
    service areas the programs cover. Baked nationwide, refreshed weekly.
  - Free health insurance enrollment help (CMS): Navigator, Certified
    Application Counselor and other assister organizations from the open
    dataset behind HealthCare.gov's Find Local Help (data.healthcare.gov,
    daily CSV, public). Agents and brokers (individuals) are never parsed;
    sites CMS lists without a public address get an area point only. Baked
    nationwide, refreshed weekly. States running their own marketplace
    (Covered California, NY State of Health...) aren't in it and publish no
    open assister data.
  - Post offices (USGS National Structures Dataset): a View of USGS's
    national service, queried for the area on screen; the home county keeps
    a small baked copy.

Privacy: explicit allowlists. Office names, street addresses, public office
lines, hours and program websites only; none of these sources lists people
(Find Local Help does, as agents/brokers and counselor-named sites: dropped).
Researched and left out (no open, current, keyless bulk source): IRS VITA/TCE
sites and Taxpayer Assistance Centers, passport acceptance facilities, USCIS
field offices / Application Support Centers and WIC clinics: each has only a
per-ZIP search tool (IRS, USCIS, State Dept), a stale bulk file (passport
facilities: 2016) or no national list at all (WIC is run state by state).
"""

from __future__ import annotations

import asyncio
import json
import logging

import httpx

from ...core.config import Settings
from ...core.http import ResponseTooLarge, fetch_capped
from ..service import Layer, View
from . import _help_offices_parse as hp
from .services import UA, WEEK, _enough, _get, _home, geocode

logger = logging.getLogger(__name__)

# --- Social Security offices ----------------------------------------------------

SSA_DATA = "https://www.ssa.gov/data/"
SSA_FILES = (
    ("FO-Address-Open-Close-Times.csv", False),  # field offices
    ("FO-RS-Address-Open-Close-Times.csv", True),  # resident stations
)
WAYBACK_CDX = "https://web.archive.org/cdx/search/cdx"


async def _ssa_csv(client: httpx.AsyncClient, name: str) -> str:
    """One SSA open-data file. ssa.gov's firewall turns away most scripted
    clients (403), so when it does, the Internet Archive's latest copy of the
    same file is used (checked to be recent; SSA updates it quarterly)."""
    url = SSA_DATA + name
    try:
        body, _ = await fetch_capped(client, url, max_bytes=8 * 1024 * 1024, headers=UA)
        if not body.lstrip(b"\xef\xbb\xbf").startswith(b"OFFICE CODE"):
            raise httpx.DecodingError("not the office file (a block page?)")
    except ResponseTooLarge:
        raise
    except httpx.HTTPError as exc:
        logger.info("ssa.gov refused %s (%s); using the archived copy", name, type(exc).__name__)
        cdx = await _get(
            client,
            WAYBACK_CDX,
            max_mb=2,
            params={
                "url": url,
                "output": "json",
                "fl": "timestamp,original,statuscode",
                "filter": "statuscode:200",
                "limit": "-5",  # the newest few
            },
        )
        snapshot = hp.wayback_snapshot(json.loads(cdx))
        logger.warning("SSA %s: using the archived copy %s", name, snapshot)
        body = await _get(client, snapshot, max_mb=8)
    return body.decode("utf-8-sig", "replace")


async def _social_security(client: httpx.AsyncClient, _s: Settings) -> dict:
    records: list[dict] = []
    for name, resident in SSA_FILES:
        records += hp.ssa_offices(await _ssa_csv(client, name), resident_station=resident)
    if len(records) < 1000:
        raise ValueError(f"SSA: only {len(records)} offices parsed")
    return _enough("social-security-offices", await geocode(client, records, True), 1000)


# --- LSC civil legal aid service areas -----------------------------------------

LSC_TOOL = "https://www.lsc.gov/themes/lsc/scripts/find-legal-aid-leaflet"
LSC_PROGRAMS = f"{LSC_TOOL}/Programs.json"
LSC_AREA = LSC_TOOL + "/geojson/{}.geojson"
# The tool's lookup boxes (which area files exist), served from LSC's CDN.
LSC_RECTANGLES = "https://d29f85wyq8xezh.cloudfront.net/lsc-website/get-legal-help/js/Rectangles.js"


async def _maybe(client: httpx.AsyncClient, url: str, max_mb: int) -> bytes | None:
    """GET with a couple of retries; None for a file that doesn't exist."""
    for attempt in range(3):
        try:
            body, _ = await fetch_capped(client, url, max_bytes=max_mb * 1024 * 1024, headers=UA)
            return body
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            if attempt == 2:
                raise
        except ResponseTooLarge:
            raise
        except httpx.HTTPError:
            if attempt == 2:
                raise
        await asyncio.sleep(3 * (attempt + 1))
    raise AssertionError("unreachable")  # the last attempt returns or raises


async def _legal_aid_areas(client: httpx.AsyncClient, _s: Settings) -> dict:
    programs = hp.parse_json(await _get(client, LSC_PROGRAMS, max_mb=2))
    rect = await _maybe(client, LSC_RECTANGLES, 2)
    ids = hp.lsc_area_ids(rect.decode("utf-8", "replace") if rect else "", programs)
    sem = asyncio.Semaphore(4)

    async def one(area: str) -> tuple[str, object] | None:
        async with sem:
            body = await _maybe(client, LSC_AREA.format(area), 8)
        return (area, hp.parse_json(body)) if body else None

    files = [f for f in await asyncio.gather(*(one(a) for a in ids)) if f]
    fc = hp.lsc_areas(files, programs)
    if len(fc["features"]) < 100:
        raise ValueError(f"LSC: only {len(fc['features'])} service areas")
    return fc


# --- Health insurance Marketplace assisters (HealthCare.gov Find Local Help) ------

# CMS's published copy of the data behind localhelp.healthcare.gov
# (data.healthcare.gov dataset 3ddf85bc-f71b-4417-b271-410cbf9e0905, public,
# keyless, CORS-open, updated daily). The same file lists agents and brokers;
# the parser keeps only the free assister organizations.
LOCAL_HELP_CSV = "https://data.healthcare.gov/datafile/localhelp/prod/helpers.csv"


async def _marketplace_assisters(client: httpx.AsyncClient, _s: Settings) -> dict:
    body = await _get(client, LOCAL_HELP_CSV, max_mb=80)
    feats, pending = hp.marketplace_assisters(body.decode("utf-8-sig", "replace"))
    if pending:  # a few public sites come without a point
        feats += [f for f in await geocode(client, pending, True) if f]
    return _enough("marketplace-assisters", feats, 1000)


# --- Post offices (USGS National Structures Dataset) -----------------------------

POST_OFFICES = "https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer/3"
# this MapServer returns lower-case field names
POST_OFFICE_FIELDS = {"name": "n", "address": "a", "city": "c", "state": "s"}


def _layer(
    name: str, title: str, title_es: str, description: str, description_es: str, **kw
) -> Layer:
    return Layer(
        name=name,
        title=title,
        title_es=title_es,
        description=description,
        description_es=description_es,
        coverage="usa",
        ttl=WEEK,
        **kw,
    )


LAYERS: dict[str, Layer] = {
    "social-security-offices": _layer(
        "social-security-offices",
        "Social Security offices",
        "Oficinas del Seguro Social",
        "Social Security field offices and resident stations, with weekday hours "
        "(SSA). Most services work online or at 1-800-772-1213; call ahead or "
        "make an appointment.",
        "Oficinas locales y estaciones residentes del Seguro Social, con horarios de lunes a "
        "viernes (SSA). La mayoría de los servicios funcionan en línea o en el 1-800-772-1213; "
        "llame antes o haga una cita.",
        category="service",
        group="help",
        loader=_social_security,
    ),
    "legal-aid-areas": _layer(
        "legal-aid-areas",
        "Free civil legal aid (LSC) - who serves your area",
        "Ayuda legal civil gratuita (LSC): quién atiende su zona",
        "The nonprofit legal aid program funded by the Legal Services Corporation "
        "for each area, with its intake line: free help with eviction, benefits, "
        "family and other civil cases for people with low incomes (LSC).",
        "El programa de ayuda legal sin fines de lucro financiado por la Legal Services "
        "Corporation para cada zona, con su línea de admisión: ayuda gratuita con desalojos, "
        "beneficios, asuntos familiares y otros casos civiles para personas de bajos ingresos "
        "(LSC).",
        category="boundary",
        group="help",
        loader=_legal_aid_areas,
    ),
    "marketplace-assisters": _layer(
        "marketplace-assisters",
        "Free help to sign up for health insurance (Navigators)",
        "Ayuda gratuita para inscribirse en un seguro médico (Navegadores)",
        "Organizations with trained Navigators and certified counselors who help "
        "for free, in person, to apply for Marketplace coverage, Medicaid and CHIP "
        "(HealthCare.gov Find Local Help, CMS). Open enrollment starts November 1. "
        "Covers the states that use HealthCare.gov; states with their own "
        "marketplace, such as California, New York and Illinois, list helpers on "
        "their own sites.",
        "Organizaciones con Navegadores capacitados y consejeros certificados que ayudan gratis, "
        "en persona, a solicitar cobertura del Mercado de Seguros Médicos, Medicaid y CHIP "
        "(Find Local Help de CuidadoDeSalud.gov, CMS). La inscripción abierta empieza el 1 de "
        "noviembre. Incluye los estados que usan CuidadoDeSalud.gov; los estados con su propio "
        "mercado, como California, Nueva York e Illinois, tienen la lista de ayudantes en sus "
        "propios sitios.",
        category="service",
        group="help",
        loader=_marketplace_assisters,
    ),
    "post-offices": _layer(
        "post-offices",
        "Post offices",
        "Oficinas de correos",
        "U.S. post offices (USGS National Structures Dataset). Many also take "
        "passport applications by appointment.",
        "Oficinas de correos de EE. UU. (USGS National Structures Dataset). Muchas también "
        "reciben solicitudes de pasaporte con cita.",
        category="service",
        group="civic",
        loader=_home(POST_OFFICES, POST_OFFICE_FIELDS),
        view=View(
            POST_OFFICES,
            POST_OFFICE_FIELDS,
            "point",
            min_zoom=9,
            refresh_s=7 * 24 * 3600,
            home_complete=True,
        ),
    ),
}

SOURCES: dict[str, str] = {
    "social-security-offices": (
        "SSA open data: field office and resident station files (ssa.gov/data, CC0; "
        "the Internet Archive's copy when ssa.gov refuses scripts), geocoded with the "
        "U.S. Census Geocoder"
    ),
    "legal-aid-areas": "Legal Services Corporation, Find Legal Aid service areas (lsc.gov, CC0)",
    "marketplace-assisters": (
        "CMS, HealthCare.gov Find Local Help: assisters listing (data.healthcare.gov open "
        "data, public U.S. government work; agents and brokers left out)"
    ),
    "post-offices": "USGS National Structures Dataset, post offices (The National Map)",
}

# Refreshed weekly by CI (scripts/refresh_live.py --weekly).
WEEKLY = tuple(n for n, layer in LAYERS.items() if layer.loader)
