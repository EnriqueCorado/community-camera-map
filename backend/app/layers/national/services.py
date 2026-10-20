"""Community & immigrant services, nationwide.

Two kinds of layer:
  - Views: the browser queries a national ArcGIS service for the area on
    screen (HRSA health centers, HUD, NCES, VA, BTS, USDA). The home county
    gets a small baked copy so it stays fast if a federal server is down.
  - Baked nationwide files (no ArcGIS service exists): DOJ-recognized legal
    help, ICE detention facilities, Head Start, American Job Centers and
    SAMHSA treatment. Refreshed weekly in CI (scripts/refresh_live.py
    --weekly); each loads in full, so properties use the compact names
    documented in _services_parse.py.

Privacy: explicit field allowlists only. Organization names, street addresses
and public office lines; never people's names, emails or personal phones
(the DOJ roster's accredited-representative section is never parsed, AJC
staff columns and HUD/USDA contact fields are never requested).
Domestic-violence shelters are excluded on purpose (confidential locations).
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import time
from pathlib import Path

import httpx

from ...core.config import Settings
from ...core.http import ResponseTooLarge, fetch_capped
from .. import transforms
from ..service import STANISLAUS_BBOX, Layer, View, _arcgis_select, _local_json
from . import _services_parse as sp

logger = logging.getLogger(__name__)

WEEK = 7 * 24 * 3600
# Some federal CDNs (CareerOneStop, ice.gov) refuse clients that don't say
# "Mozilla"; this still names the project honestly.
UA = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; stanislaus-cam-map/bake; "
        "+https://github.com/EnriqueCorado/stanislaus-cam-map)"
    )
}
DATA = Path(__file__).resolve().parent.parent / "data"


async def _get(client: httpx.AsyncClient, url: str, max_mb: int = 48, **kw) -> bytes:
    """GET with a size cap and a few patient retries (justice.gov answers
    bursts with 403 for a while)."""
    last: Exception | None = None
    for attempt in range(4):
        try:
            body, _ = await fetch_capped(
                client, url, max_bytes=max_mb * 1024 * 1024, headers=UA, **kw
            )
            return body
        except ResponseTooLarge:
            raise
        except httpx.HTTPError as exc:
            last = exc
            await asyncio.sleep(5 * (attempt + 1))
    assert last is not None
    raise last


# --- geocoding (U.S. Census, free, public domain) ----------------------------

CENSUS_BATCH = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
ZCTA_QUERY = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
    "PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query"
)
BATCH = 1000  # rows per request (the service allows 10,000; smaller is steadier)


async def _census_batch(client: httpx.AsyncClient, rows: list[tuple]) -> dict:
    """id -> (lon, lat) for the rows the Census batch geocoder matches."""
    out: dict[str, tuple[float, float]] = {}
    for i in range(0, len(rows), BATCH):
        chunk = sp.census_batch_csv(rows[i : i + BATCH])
        for attempt in range(3):
            try:
                r = await client.post(
                    CENSUS_BATCH,
                    data={"benchmark": "Public_AR_Current"},
                    files={"addressFile": ("addresses.csv", chunk, "text/csv")},
                    headers=UA,
                    timeout=httpx.Timeout(600.0),
                )
                r.raise_for_status()
                if len(r.content) > 16 * 1024 * 1024:
                    raise ResponseTooLarge("geocoder reply too large")
                out.update(sp.census_batch_result(r.text))
                break
            except ResponseTooLarge:
                raise
            except httpx.HTTPError:
                if attempt == 2:
                    raise
                await asyncio.sleep(10)
    return out


async def _zcta_points(client: httpx.AsyncClient, zips: set[str]) -> dict:
    """ZIP -> (lon, lat) of its Census ZIP Code Tabulation Area's internal point."""
    out: dict[str, tuple[float, float]] = {}
    todo = sorted(z for z in zips if re.fullmatch(r"\d{5}", z))
    for i in range(0, len(todo), 150):
        where = "ZCTA5 IN ({})".format(",".join(f"'{z}'" for z in todo[i : i + 150]))
        body = await _get(
            client,
            ZCTA_QUERY,
            params={
                "where": where,
                "outFields": "ZCTA5,INTPTLAT,INTPTLON",
                "returnGeometry": "false",
                "f": "json",
            },
        )
        for f in json.loads(body).get("features", []):
            a = f.get("attributes") or {}
            try:
                out[str(a["ZCTA5"])] = (float(a["INTPTLON"]), float(a["INTPTLAT"]))
            except (KeyError, TypeError, ValueError):
                continue
    return out


async def geocode(
    client: httpx.AsyncClient, records: list[dict], zip_fallback: bool
) -> list[dict | None]:
    """A point feature per record (None if not found). Records carry a/c/s/zip;
    `zip` is dropped from the output. With `zip_fallback`, an address the
    Census can't match goes at its ZIP area's center, flagged x=1."""
    rows = [
        (str(i), sp.street_only(r["a"]), r["c"], r["s"], r.get("zip", ""))
        for i, r in enumerate(records)
    ]
    hits = await _census_batch(client, rows)
    # Second pass for misses: the full street text (some lines need the suite
    # or the second line, e.g. a building name first).
    again = [
        (str(i), r["a"].replace(",", " "), r["c"], r["s"], r.get("zip", ""))
        for i, r in enumerate(records)
        if str(i) not in hits
    ]
    if again:
        hits.update(await _census_batch(client, again))
    zips = {}
    if zip_fallback:
        zips = await _zcta_points(
            client, {r.get("zip", "") for i, r in enumerate(records) if str(i) not in hits}
        )
    out: list[dict | None] = []
    for i, r in enumerate(records):
        props = {k: v for k, v in r.items() if k != "zip"}
        if str(i) in hits:
            out.append(sp.point(*hits[str(i)], props))
        elif r.get("zip") in zips:
            out.append(sp.point(*zips[r["zip"]], {**props, "x": 1}))
        else:
            out.append(None)
    return out


def _enough(name: str, feats: list, minimum: int) -> dict:
    """Never publish a gutted layer: a format change upstream must fail the
    refresh (the last good file stays) instead of emptying the map."""
    fc = sp.fc(feats)
    if len(fc["features"]) < minimum:
        raise ValueError(f"{name}: only {len(fc['features'])} features (expected >= {minimum})")
    return fc


# --- 1. DOJ EOIR recognized organizations ------------------------------------

EOIR_PDF = "https://www.justice.gov/eoir/media/1398081/dl"
EOIR_PAGE = (
    "https://www.justice.gov/eoir/"
    "recognized-organizations-and-accredited-representatives-roster-state-and-city"
)
MAX_PDF_PAGES = 1500


def pdf_text(body: bytes) -> str:
    """The PDF's text layer, laid out like the page (pypdf, pure Python)."""
    from pypdf import PdfReader  # bake-time only: the live API never imports it

    reader = PdfReader(io.BytesIO(body))
    if len(reader.pages) > MAX_PDF_PAGES:
        raise ValueError("roster PDF has too many pages")
    return "\n".join(p.extract_text(extraction_mode="layout") for p in reader.pages)


async def _immigration_legal_help(client: httpx.AsyncClient, _s: Settings) -> dict:
    text = pdf_text(await _get(client, EOIR_PDF, max_mb=30))
    offices = sp.eoir_offices(text)
    if len(offices) < 800:
        raise ValueError(f"EOIR roster: only {len(offices)} offices parsed")
    return _enough("immigration-legal-help", await geocode(client, offices, True), 800)


# --- 3. ICE detention facilities ----------------------------------------------

ICE_PAGE = "https://www.ice.gov/detain/detention-management"
ICE_XLSX = re.compile(
    r"https://www\.ice\.gov/doclib/detention/FY(\d\d)[_-]detentionStats[\w-]*\.xlsx"
)
ICE_COORDS = DATA / "ice-detention-coords.json"


def ice_overrides() -> dict[str, tuple[float, float]]:
    """Hand-checked coordinates (one source per row) for facilities the
    Census geocoder can't place, keyed by facility name (upper case)."""
    rows = json.loads(ICE_COORDS.read_text()).get("facilities", [])
    return {r["name"].upper(): (float(r["lon"]), float(r["lat"])) for r in rows}


def newest_ice_xlsx(html: str) -> str:
    links = [(int(m[1]), m[0]) for m in ICE_XLSX.finditer(html)]
    if not links:
        raise ValueError("no detention statistics spreadsheet linked")
    newest = max(fy for fy, _ in links)
    return next(u for fy, u in links if fy == newest)  # the page lists newest first


async def _detention_centers(client: httpx.AsyncClient, _s: Settings) -> dict:
    html = (await _get(client, ICE_PAGE, max_mb=5)).decode("utf-8", "replace")
    xlsx = await _get(client, newest_ice_xlsx(html), max_mb=20)
    facilities = sp.ice_facilities(sp.read_xlsx(xlsx, re.compile(r"^Facilities FY\d\d")))
    feats = await geocode(client, facilities, zip_fallback=False)
    fixes = ice_overrides()
    out, missing = [], []
    for rec, feat in zip(facilities, feats, strict=True):
        if feat is None and rec["n"].upper() in fixes:
            props = {k: v for k, v in rec.items() if k != "zip"}
            feat = sp.point(*fixes[rec["n"].upper()], props)
        if feat is None:
            missing.append(rec["n"])
        out.append(feat)
    if missing:  # left off the map rather than guessed; add to ICE_COORDS
        logger.warning("ICE facilities without coordinates: %s", "; ".join(missing))
    return _enough("detention-centers", out, 100)


# --- 4a. Head Start centers --------------------------------------------------

HEAD_START = "https://headstart.gov/eclkc-apis/locator/center"
STATES = (
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV "
    "NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP"
).split()


# One national download shared by both layers (reused for an hour, so a
# long-running API still refreshes it when the layers' TTL runs out).
SHARED_TTL = 3600
_head_start_docs: dict = {}
_head_start_lock = asyncio.Lock()


async def _head_start_all(client: httpx.AsyncClient) -> list[dict]:
    async with _head_start_lock:
        if time.monotonic() - _head_start_docs.get("at", -SHARED_TTL) < SHARED_TTL:
            return _head_start_docs["docs"]
        sem = asyncio.Semaphore(4)

        async def one(st: str) -> dict:
            async with sem:
                data = json.loads(await _get(client, HEAD_START, max_mb=20, params={"state": st}))
            docs = data.get("documents") if isinstance(data, dict) else None
            if not isinstance(docs, list):
                raise ValueError(f"Head Start {st}: no documents")
            if isinstance(data.get("results"), int) and data["results"] > len(docs):
                # the API grew pagination: don't publish a cut list
                raise ValueError(f"Head Start {st}: {data['results']} results, {len(docs)} sent")
            return data

        _head_start_docs["docs"] = await asyncio.gather(*(one(st) for st in STATES))
        _head_start_docs["at"] = time.monotonic()
        return _head_start_docs["docs"]


def _head_start_loader(early: bool):
    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        parts = await _head_start_all(client)
        feats = [f for data in parts for f in sp.head_start(data, early)]
        return _enough("early-head-start" if early else "head-start", feats, 4000)

    return load


# --- 4b. American Job Centers -------------------------------------------------

AJC_XLSX = "https://www.careeronestop.org/TridionMultimedia/tcm24-51446_XLS_AJC_Data_ACC.xlsx"


async def _job_centers(client: httpx.AsyncClient, _s: Settings) -> dict:
    centers = sp.job_centers(sp.read_xlsx(await _get(client, AJC_XLSX, max_mb=20)))
    return _enough("job-centers", await geocode(client, centers, True), 1500)


# --- 4c. SAMHSA treatment (FindTreatment.gov) ---------------------------------

FIND_TREATMENT = "https://findtreatment.gov/locator/exportsAsJson/v2"
_treatment_rows: dict = {}  # shared by both layers, like _head_start_docs
_treatment_lock = asyncio.Lock()


async def _treatment_all(client: httpx.AsyncClient) -> list:
    async with _treatment_lock:
        if time.monotonic() - _treatment_rows.get("at", -SHARED_TTL) < SHARED_TTL:
            return _treatment_rows["rows"]
        rows: list = []
        page, pages = 1, 1
        while page <= pages and page <= 40:
            data = json.loads(
                await _get(
                    client,
                    FIND_TREATMENT,
                    params={
                        # Kansas, 13,000 km: every state and territory.
                        "sAddr": "39.5,-98.35",
                        "limitType": "2",
                        "limitValue": "13000000",
                        "pageSize": "2000",
                        "page": str(page),
                        "sort": "0",
                    },
                )
            )
            rows.extend(data.get("rows") or [])
            pages = int(data.get("totalPages") or 0)
            if pages > 40:  # never publish a silently cut national list
                raise ValueError(f"FindTreatment: {pages} pages (expected <= 40)")
            page += 1
        _treatment_rows.update(rows=rows, at=time.monotonic())
        return rows


def _treatment_loader(mental_health: bool):
    async def load(client: httpx.AsyncClient, _s: Settings) -> dict:
        rows = await _treatment_all(client)
        name = "mental-health" if mental_health else "addiction-treatment"
        return _enough(name, sp.treatment(rows, mental_health), 5000)

    return load


# --- 5. Immigration courts & ICE field offices (hand-kept) -------------------

IMMIGRATION_OFFICES = DATA / "immigration-offices.json"
_OFFICE_SOURCES = ("https://www.justice.gov/eoir/", "https://www.ice.gov/")


def immigration_offices(doc: object) -> dict:
    """The hand-kept list (one official source page per row) as points."""
    feats = []
    for r in doc.get("offices", []) if isinstance(doc, dict) else []:
        src = str(r.get("source", ""))
        if r.get("kind") not in ("court", "ice") or not src.startswith(_OFFICE_SOURCES):
            continue  # every row must cite an official page
        props = {
            "n": r.get("name"),
            "t": r["kind"],
            "a": r.get("address"),
            "c": r.get("city"),
            "s": r.get("state"),
            "p": sp.phone(r.get("phone")),
            "pg": src,
        }
        feats.append(sp.point(r.get("lon"), r.get("lat"), props))
    return sp.fc(feats)


# --- Views (national ArcGIS services, all verified to send CORS headers) -----

HRSA_SITES = (
    "https://gisportal.hrsa.gov/server/rest/services/HealthCareFacilities/"
    "HealthCareFacilities/MapServer/18"
)
HUD = "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services"
HOUSING_COUNSELING = f"{HUD}/Single_Family_Housing_Counseling_Agencies/FeatureServer/0"
PUBLIC_HOUSING = f"{HUD}/Public_Housing_Authorities/FeatureServer/0"
COLLEGES = (
    "https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/"
    "Postsecondary_School_Locations_Current/FeatureServer/0"
)
VA_FACILITIES = (
    "https://services1.arcgis.com/smmmD7AGkh7eJR2a/arcgis/rest/services/"
    "Veterans_Health_Administration_(VHA)_Facilities/FeatureServer/0"
)
BORDER_PORTS = "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/BorderCrossings/FeatureServer/29"
# USDA FNS (same org as SNAP). The service name changes each year: check the
# FNS org's service list each spring.
SUMMER_MEALS = (
    "https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services/"
    "Summer_Meals_Site_Finder_2026_(Testing)/FeatureServer/0"
)

HEALTH_CENTER_FIELDS = {
    "SITE_NM": "n",
    "SITE_ADDRESS": "a",
    "SITE_CITY": "c",
    "SITE_STATE_ABBR": "s",
    "SITE_PHONE_NUM": "p",  # the site's public line
    "HCC_LOC_SETTING_DESC": "t",  # School | Hospital | All Other Clinic Types | ...
    "HCC_LOC_DESC": "k",  # Permanent | Seasonal | Mobile Van
}
HEALTH_CENTER_WHERE = "HCC_LOC_SETTING_DESC <> 'Correctional Facility'"
HOUSING_COUNSELING_FIELDS = {  # never AGC_EMAIL
    "AGC_NAME": "n",
    "AGC_ADDRESS": "a",
    "AGC_CITY": "c",
    "STD_ST": "s",
    "AGC_PHONE_NBR": "p",
    "LANGUAGE_DESC": "l",
    "COUNSEL_SRV_DESC": "sv",
}
PUBLIC_HOUSING_FIELDS = {  # never HA_EMAIL_ADDR_TEXT or EXEC_DIR_* (personal)
    "FORMAL_PARTICIPANT_NAME": "n",
    "STD_ADDR": "a",
    "STD_CITY": "c",
    "STD_ST": "s",
    "HA_PHN_NUM": "p",  # the authority's main line
    "HA_PROGRAM_TYPE": "t",  # Low-Rent | Section 8 | Combined
}
COLLEGE_FIELDS = {"NAME": "n", "STREET": "a", "CITY": "c", "STATE": "s", "UNITID": "u"}
VA_FIELDS = {"STA_NAME": "n", "S_ADD2": "a", "S_CITY": "c", "S_STATE": "s", "S_ABBR": "t"}
BORDER_FIELDS = {"Port_Name": "n", "State": "s", "Border": "t", "Port_Code": "code"}
SUMMER_MEALS_FIELDS = {  # never Contact_* or Site_Phone (often a person's line)
    "Site_Name": "n",
    "Site_Address1": "a",
    "Site_City": "c",
    "Site_State": "s",
    "Sponsoring_Organization": "g",
    "Service_Model": "t",  # CONGREGATE | NON-CONGREGATE ...
    "Start_date": "d0",  # epoch ms
    "End_date": "d1",
    "Days_of_operation": "d",
    "Breakfast_Time2": "bt",
    "Lunch_Time2": "lt",
}
# Open sites whose season includes today (UTC). Outside the season (Sep-May)
# this matches nothing, so the map shows no sites rather than closed ones.
SUMMER_MEALS_WHERE = (
    "Site_Type='OPEN' AND Dropped='False' AND Expired='False' "
    "AND Start_date <= CURRENT_DATE AND End_date >= CURRENT_DATE"
)


def tidy_points(fc: dict) -> dict:
    """Round point coordinates to 5 dp and trim padded text (HUD pads its
    address fields with spaces); empty values are dropped."""
    out = []
    for f in fc.get("features", []):
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        props = {k: (sp.clean(v) if isinstance(v, str) else v) for k, v in f["properties"].items()}
        out.append(sp.point(*g["coordinates"][:2], props))
    return sp.fc(out)


def _home(url: str, fields: dict[str, str], where: str = "1=1"):
    """The home-county baked copy of a View (same fields, tidied)."""
    return _arcgis_select(
        url,
        lambda fc: tidy_points(transforms.select_props(fc, fields)),
        where=where,
        bbox=STANISLAUS_BBOX,
    )


def _layer(name: str, title: str, title_es: str, description: str, group: str, **kw) -> Layer:
    return Layer(
        name=name,
        title=title,
        title_es=title_es,
        description=description,
        category="service",
        group=group,
        coverage="usa",
        ttl=WEEK,
        **kw,
    )


LAYERS: dict[str, Layer] = {
    "immigration-legal-help": _layer(
        "immigration-legal-help",
        "Immigration legal help (DOJ-recognized)",
        "Ayuda legal de inmigración (reconocida por el DOJ)",
        "Nonprofits the Justice Department recognizes to give free or low-cost "
        "immigration legal help. Beware of 'notarios' (DOJ EOIR roster).",
        "help",
        loader=_immigration_legal_help,
    ),
    "detention-centers": _layer(
        "detention-centers",
        "ICE detention facilities",
        "Centros de detención de ICE",
        "Facilities holding people in ICE custody this fiscal year, with average "
        "daily population (ICE detention statistics). Find a detained relative "
        "with ICE's online detainee locator.",
        "help",
        loader=_detention_centers,
    ),
    "immigration-offices": _layer(
        "immigration-offices",
        "Immigration courts & ICE offices",
        "Cortes de inmigración y oficinas de ICE",
        "Immigration courts (DOJ EOIR) and ICE field offices, each from its official "
        "page. Check a court case at 1-800-898-7180.",
        "help",
        loader=_local_json(IMMIGRATION_OFFICES, immigration_offices),
    ),
    "health-centers": _layer(
        "health-centers",
        "Community health centers (sliding fee)",
        "Centros de salud comunitarios (pago según ingresos)",
        "HRSA-funded health centers: care regardless of ability to pay, with fees "
        "on a sliding scale by income (HRSA).",
        "places",
        loader=_home(HRSA_SITES, HEALTH_CENTER_FIELDS, HEALTH_CENTER_WHERE),
        view=View(
            HRSA_SITES,
            HEALTH_CENTER_FIELDS,
            "point",
            min_zoom=8,
            where=HEALTH_CENTER_WHERE,
            refresh_s=24 * 3600,
            home_complete=True,
        ),
    ),
    "head-start": _layer(
        "head-start",
        "Head Start (free preschool, ages 3-5)",
        "Head Start (preescolar gratuito, de 3 a 5 años)",
        "Free Head Start preschool centers for children 3 to 5 from families with "
        "low incomes, including migrant and seasonal programs (Office of Head Start).",
        "places",
        loader=_head_start_loader(early=False),
    ),
    "early-head-start": _layer(
        "early-head-start",
        "Early Head Start (babies & toddlers)",
        "Early Head Start (bebés y niños pequeños)",
        "Free Early Head Start programs for pregnant women, babies and toddlers up "
        "to age 3 from families with low incomes (Office of Head Start).",
        "places",
        loader=_head_start_loader(early=True),
    ),
    "job-centers": _layer(
        "job-centers",
        "American Job Centers (free job help)",
        "Centros de empleo (ayuda gratuita)",
        "Free help finding work, training and benefits, funded by the U.S. "
        "Department of Labor (CareerOneStop).",
        "civic",
        loader=_job_centers,
    ),
    "mental-health": _layer(
        "mental-health",
        "Mental health care",
        "Atención de salud mental",
        "Mental health treatment facilities, with Spanish and sliding-fee flags "
        "(SAMHSA FindTreatment.gov). In a crisis, call or text 988.",
        "places",
        loader=_treatment_loader(mental_health=True),
    ),
    "addiction-treatment": _layer(
        "addiction-treatment",
        "Addiction treatment",
        "Tratamiento de adicciones",
        "Substance use treatment facilities, with Spanish and sliding-fee flags "
        "(SAMHSA FindTreatment.gov).",
        "places",
        loader=_treatment_loader(mental_health=False),
    ),
    "housing-counseling": _layer(
        "housing-counseling",
        "HUD housing counselors (free)",
        "Asesores de vivienda de HUD (gratuitos)",
        "HUD-approved housing counseling agencies: renting, buying, avoiding "
        "foreclosure and homelessness (HUD).",
        "civic",
        loader=_home(HOUSING_COUNSELING, HOUSING_COUNSELING_FIELDS),
        view=View(
            HOUSING_COUNSELING,
            HOUSING_COUNSELING_FIELDS,
            "point",
            min_zoom=7,
            refresh_s=24 * 3600,
            home_complete=True,
        ),
    ),
    "public-housing": _layer(
        "public-housing",
        "Public housing authorities",
        "Autoridades de vivienda pública",
        "Where to apply for public housing and Section 8 vouchers (HUD).",
        "civic",
        loader=_home(PUBLIC_HOUSING, PUBLIC_HOUSING_FIELDS),
        view=View(
            PUBLIC_HOUSING,
            PUBLIC_HOUSING_FIELDS,
            "point",
            min_zoom=7,
            refresh_s=24 * 3600,
            home_complete=True,
        ),
    ),
    "colleges": _layer(
        "colleges",
        "Colleges & trade schools",
        "Universidades y escuelas técnicas",
        "Colleges, universities and trade schools, 2025-26 (NCES IPEDS).",
        "places",
        loader=_home(COLLEGES, COLLEGE_FIELDS),
        view=View(
            COLLEGES, COLLEGE_FIELDS, "point", min_zoom=8, refresh_s=24 * 3600, home_complete=True
        ),
    ),
    "va-facilities": _layer(
        "va-facilities",
        "VA health care & Vet Centers",
        "Atención médica del VA y Vet Centers",
        "VA medical centers, clinics and Vet Centers for veterans (VHA).",
        "places",
        loader=_home(VA_FACILITIES, VA_FIELDS),
        view=View(
            VA_FACILITIES, VA_FIELDS, "point", min_zoom=6, refresh_s=24 * 3600, home_complete=True
        ),
    ),
    "border-ports": _layer(
        "border-ports",
        "Land border crossings",
        "Cruces fronterizos terrestres",
        "U.S. land ports of entry on the Mexico and Canada borders (BTS / CBP).",
        "civic",
        view=View(BORDER_PORTS, BORDER_FIELDS, "point", min_zoom=3, refresh_s=7 * 24 * 3600),
    ),
    "summer-meals": _layer(
        "summer-meals",
        "Free summer meals for kids",
        "Comidas gratis de verano para niños",
        "Free meals for anyone 18 and under at summer sites, no paperwork (USDA). "
        "Seasonal: only sites open today are shown, so the map is empty outside "
        "summer.",
        "places",
        view=View(
            SUMMER_MEALS,
            SUMMER_MEALS_FIELDS,
            "point",
            min_zoom=10,
            where=SUMMER_MEALS_WHERE,
            refresh_s=6 * 3600,
            post="meals",
        ),
    ),
}

# Refreshed weekly by CI (scripts/refresh_live.py --weekly): the nationwide
# baked files and the Views' small home-county copies (the hand-kept offices
# list changes only by commit, so a bake picks it up).
HAND_KEPT = ("immigration-offices",)
WEEKLY = tuple(n for n, layer in LAYERS.items() if layer.loader and n not in HAND_KEPT)
