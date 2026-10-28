"""Consulates in the U.S. of the countries most immigrant families come from.

A hand-kept, nationwide list (backend/app/layers/data/consulates.json): each
office's street address and main public line come from that country's own
government pages (foreign ministry, embassy or consulate site), cross-checked
against the U.S. State Department's per-country consular contact list
(travel.state.gov "Contact Info for Foreign Embassies & Consulates", which
lists the offices and their notification lines but no street addresses). No
open, machine-readable national list exists: the State Department's old
"Foreign Consular Offices in the United States" publication is no longer
online, and every country publishes its directory as ordinary web pages.

Rebuild or update the file with scripts/build_consulates.py (it normalizes
rows, drops links outside each country's official government hosts and
geocodes new addresses with the U.S. Census batch geocoder). The file changes
only by commit, so a bake picks it up. tests/test_consulates.py fails once its
retrieval date is a year old (the re-check reminder); no CI workflow runs
pytest, so it fires when the backend tests run locally.

Privacy: offices only. No consul's or staff member's name, no email, no
personal number; honorary consuls (private people at their own home or
business) are left out entirely.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from ..service import Layer, _local_json
from . import _services_parse as sp
from .services import DATA, WEEK

CONSULATES = DATA / "consulates.json"

KINDS = ("consulate-general", "consulate", "consular-section", "consular-agency")
KIND_EN = {
    "consulate-general": "Consulate General",
    "consulate": "Consulate",
    "consular-section": "Embassy consular section",
    "consular-agency": "Consular office",
}

# The U.S. State Department's consular contact pages (the cross-check roster):
# travel.state.gov/content/travel/en/consularnotification/
# ConsularNotificationandAccess/<slug>.html, one per country.
STATE_DEPT_HOSTS = ("travel.state.gov", "adoptions.state.gov", "www.state.gov")
ROSTER_SLUGS: dict[str, str] = {
    "AF": "Afghanistan",
    "BR": "Brazil",
    "CN": "China",
    "CO": "Colombia",
    "CU": "Cuba",
    "DO": "DominicanRepublic",
    "EC": "Ecuador",
    "GT": "Guatemala",
    "HN": "Honduras",
    "HT": "Haiti",
    "IN": "India",
    "KR": "KoreaRepublicof",
    "MX": "Mexico",
    "NI": "Nicaragua",
    "PE": "Peru",
    "PH": "Philippines",
    "SV": "ElSalvador",
    "UA": "Ukraine",
    "VE": "VenezuelaBolivarianRepublicof",
    "VN": "VietNam",
}

# English names as they read after "Consulate General of ..." (the popup
# builds its own title per language; this one is the search/fallback name).
NAME_EN = {"DO": "the Dominican Republic", "PH": "the Philippines", "KR": "the Republic of Korea"}

# Exact hosts each country's links may use: its own government domains only,
# reviewed by hand (frontend/src/services-pack.ts CONSULATE_HOSTS mirrors this;
# backend/tests/test_consulates.py fails if the two drift). An embassy site on
# a generic .org/.com domain is not here: its popup links to the State
# Department's page for that country instead.
_CO = ("atlanta", "boston", "chicago", "houston", "losangeles", "miami", "newark", "nuevayork")
_CO += ("orlando", "sanfrancisco", "sanjuan", "washington")
OFFICIAL_HOSTS: dict[str, tuple[str, ...]] = {
    "CO": (*(f"{c}.consulado.gov.co" for c in _CO), "tramites.cancilleria.gov.co"),
    "CU": ("misiones.cubaminrex.cu",),
    "DO": ("usa.mirex.gob.do", "consultas.mirex.gob.do"),
    "GT": ("www.embaguateusa.gob.gt",),
    "HN": ("sreci.gob.hn",),
    "HT": (
        "ambetatsunis.gouv.ht",
        "cgatlanta.gouv.ht",
        "cgboston.gouv.ht",
        "cgchicago.gouv.ht",
        "cgmiami.gouv.ht",
        "cgnewyork.gouv.ht",
        "conorlando.gouv.ht",
        "mae.gouv.ht",
    ),
    "SV": ("rree.gob.sv", "www.rree.gob.sv"),
    "CN": (
        "us.china-embassy.gov.cn",
        "newyork.china-consulate.gov.cn",
        "sanfrancisco.china-consulate.gov.cn",
        "losangeles.china-consulate.gov.cn",
        "chicago.china-consulate.gov.cn",
    ),
    "IN": (
        "indianembassyusa.gov.in",
        "www.indiainnewyork.gov.in",
        "www.cgisf.gov.in",
        "www.cgichicago.gov.in",
        "www.cgihouston.gov.in",
        "indiainatlanta.gov.in",
        "indiainseattle.gov.in",
        "www.indiainla.gov.in",
    ),
    "KR": ("overseas.mofa.go.kr",),
    "MX": ("consulmex.sre.gob.mx", "citas.sre.gob.mx", "www.gob.mx"),
    "PH": ("honolulupcg.dfa.gov.ph", "houstonpcg.dfa.gov.ph"),
    "BR": ("www.gov.br", "econsular.itamaraty.gov.br"),
    "EC": ("www.cancilleria.gob.ec", "citas.cancilleria.gob.ec"),
    "PE": ("www.gob.pe",),
    "UA": (
        "mfa.gov.ua",
        "usa.mfa.gov.ua",
        "ny.mfa.gov.ua",
        "chicago.mfa.gov.ua",
        "san-francisco.mfa.gov.ua",
        "houston.mfa.gov.ua",
        "online.mfa.gov.ua",
    ),
}
# Each country's government domain: every OFFICIAL_HOSTS entry must be it or
# a subdomain of it (tests/test_consulates.py).
GOV_DOMAINS: dict[str, tuple[str, ...]] = {
    "CO": ("gov.co",),  # Colombia: consulado.gov.co, cancilleria.gov.co
    "CU": ("cubaminrex.cu",),  # Cuba's foreign ministry (MINREX)
    "DO": ("gob.do",),  # mirex.gob.do: Dominican foreign ministry
    "GT": ("gob.gt",),  # embaguateusa.gob.gt: Guatemala's embassy
    "HN": ("gob.hn",),  # sreci.gob.hn: Honduran foreign ministry
    "HT": ("gouv.ht",),  # Haitian government missions
    "SV": ("gob.sv",),  # rree.gob.sv: Salvadoran foreign ministry
    "CN": ("gov.cn",),  # Chinese embassy and consulates
    "IN": ("gov.in",),  # Indian embassy and consulates
    "KR": ("go.kr",),  # mofa.go.kr: Korean foreign ministry
    "MX": ("gob.mx",),  # sre.gob.mx: Mexican foreign ministry (SRE)
    "PH": ("gov.ph",),  # dfa.gov.ph: Philippine foreign affairs department
    "UA": ("gov.ua",),  # mfa.gov.ua: Ukrainian foreign ministry
    "BR": ("gov.br",),  # gov.br/mre, itamaraty.gov.br: Brazilian foreign ministry
    "EC": ("gob.ec",),  # cancilleria.gob.ec: Ecuadorian foreign ministry
    "PE": ("gob.pe",),  # gob.pe: Peruvian state portal (each consulate has a page)
}
# Official embassy/consulate sites on generic domains (.org, .com): accepted
# as the page a row was read from, never linked from the map.
SOURCE_ONLY_HOSTS: dict[str, tuple[str, ...]] = {
    "HN": ("hondurasemb.org", "www.hondurasemb.org"),  # Embassy of Honduras
    "PH": (  # the embassy's and posts' own sites
        "philippineembassy-dc.org",
        "www.aganapcg.info",
        "chicagopcg.com",
        "pcghouston.org",
        "losangelespcg.org",
        "newyorkpcg.org",
        "pcgsanfrancisco.org",
    ),
    "VN": ("vietnamembassy-usa.org", "vietnamconsulate-sf.org", "www.vietnamconsulate-ny.org"),
}


def _host(url: object) -> str:
    try:
        parts = urlsplit(str(url or ""))
    except ValueError:
        return ""
    if parts.scheme != "https" or parts.username or parts.password:
        return ""
    return (parts.hostname or "").lower()


def official(url: object, country: str) -> str:
    """`url` when it is https on one of the country's official hosts, else ''."""
    return str(url) if _host(url) in OFFICIAL_HOSTS.get(country, ()) else ""


def sourced(url: object, country: str) -> bool:
    """A page a row may cite: the country's official or source-only hosts, or
    the State Department."""
    host = _host(url)
    return bool(
        official(url, country)
        or host in SOURCE_ONLY_HOSTS.get(country, ())
        or host in STATE_DEPT_HOSTS
    )


def office_name(country_en: str, kind: str, place: str) -> str:
    if kind == "consular-section":
        return f"Embassy of {country_en}: consular section"
    return f"{KIND_EN[kind]} of {country_en} in {place}"


def consulates(doc: object) -> dict:
    """The hand-kept list as points. A row needs a known country and kind,
    coordinates, and an official source page (the country's government
    hosts or the State Department); links off those hosts are dropped."""
    countries = doc.get("countries", {}) if isinstance(doc, dict) else {}
    feats = []
    for r in doc.get("offices", []) if isinstance(doc, dict) else []:
        if not isinstance(r, dict):
            continue
        cc, kind = str(r.get("country", "")), str(r.get("kind", ""))
        info = countries.get(cc)
        if not isinstance(info, dict) or kind not in KINDS:
            continue
        src = str(r.get("source", ""))
        if not sourced(src, cc):
            continue  # every row must cite an official page
        place = sp.clean(r.get("place"))
        if not place:
            continue  # the popup title names the place
        help_line = info.get("help_line")
        props = {
            "n": office_name(NAME_EN.get(cc) or sp.clean(info.get("en")), kind, place),
            "cc": cc,
            "t": kind,
            "pl": place,
            "a": sp.clean(r.get("address")),
            "c": sp.clean(r.get("city")),
            "s": sp.clean(r.get("state")).upper(),
            "p": sp.phone(r.get("phone")),
            "web": official(r.get("web"), cc),
            "ap": official(info.get("appointments"), cc),
            "dl": official(info.get("directory"), cc),
            "hl": sp.phone(help_line.get("phone")) if isinstance(help_line, dict) else "",
            "x": 1 if r.get("located") == "zip" else 0,
        }
        feats.append(sp.point(r.get("lon"), r.get("lat"), props))
    return sp.fc(feats)


LAYERS: dict[str, Layer] = {
    "consulates": Layer(
        name="consulates",
        title="Consulates (passports, consular ID)",
        title_es="Consulados (pasaportes, matrícula consular)",
        description=(
            "Consulates and embassy consular sections in the U.S. of Mexico, Guatemala, El "
            "Salvador, Honduras, the Dominican Republic, Cuba, Haiti, Colombia, Ecuador, Peru, "
            "Brazil, the Philippines, India, China, Vietnam, South Korea and Ukraine, each from "
            "that government's own pages and checked against the U.S. State Department's "
            "consular contact list. Consulates issue passports and ID documents to their "
            "citizens and can help citizens who are detained. Honorary consuls are not shown. "
            "Not on the map: Venezuela (no consulate confirmed open in October 2026), "
            "Nicaragua (no official address list could be reached) and Afghanistan (no "
            "embassy or consulate in the U.S.)."
        ),
        description_es=(
            "Consulados y secciones consulares de embajadas en EE. UU. de México, Guatemala, "
            "El Salvador, Honduras, República Dominicana, Cuba, Haití, Colombia, Ecuador, Perú, "
            "Brasil, Filipinas, India, China, Vietnam, Corea del Sur y Ucrania, cada uno según "
            "las páginas oficiales de su gobierno y revisado con la lista de contactos "
            "consulares del Departamento de Estado de EE. UU. Los consulados emiten pasaportes "
            "y documentos de identidad a sus ciudadanos y pueden ayudar a los que están "
            "detenidos. No se muestran los cónsules honorarios. No aparecen en el mapa: "
            "Venezuela (ningún consulado confirmado abierto en octubre de 2026), Nicaragua (no "
            "se pudo abrir una lista oficial de direcciones) y Afganistán (no tiene embajada ni "
            "consulado en EE. UU.)."
        ),
        category="service",
        group="help",
        coverage="usa",
        ttl=WEEK,
        loader=_local_json(CONSULATES, consulates),
    ),
}

SOURCES: dict[str, str] = {
    "consulates": (
        "Each country's official consulate directory and consulate pages (foreign "
        "ministries, embassies), cross-checked against the U.S. State Department's "
        "consular contact list (travel.state.gov); hand-kept, one official source per "
        "row, honorary consuls left out; geocoded with the U.S. Census Geocoder"
    ),
}

# Hand-kept: changes only by commit (no weekly network refresh).
WEEKLY: tuple[str, ...] = ()
