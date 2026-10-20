"""Nationwide planning, boundary, land, transportation and civic-infrastructure
layers. Almost all are browser views of federal ArcGIS services (no baked
copy); land cover and crops are raster tiles (see MapView.tsx rasterSource);
building permits are baked from the Census Building Permits Survey."""

from __future__ import annotations

import asyncio
import csv
import datetime as dt
import io
import json

import httpx

from ...core.config import Settings
from ...core.http import fetch_capped
from .. import arcgis
from ..service import Layer, Metric, View

TW = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb"
NTAD = "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services"
RAPT = "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services"
ESRI = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services"
PADUS = "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/PADUS_Public_Access/FeatureServer/0"
TRAILS = "https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/37"
HPMS = f"{NTAD}/HPMS_National_2024_FullJoin_FHWA/FeatureServer/0"
NBI = f"{NTAD}/NTAD_National_Bridge_Inventory/FeatureServer/0"

DAY = 24 * 3600
WEEK = 7 * DAY


def _layer(
    name: str,
    title: str,
    title_es: str,
    description: str,
    category: str,
    group: str,
    view: View | None = None,
    **kw,
) -> Layer:
    return Layer(
        name=name,
        title=title,
        title_es=title_es,
        description=description,
        category=category,
        group=group,
        coverage="usa",
        view=view,
        **kw,
    )


def _boundary(
    name: str, title: str, title_es: str, description: str, url: str, fields: dict, min_zoom: float
) -> Layer:
    return _layer(
        name,
        title,
        title_es,
        description,
        "boundary",
        "planning",
        View(
            url,
            fields,
            "polygon",
            min_zoom=min_zoom,
            max_features=1500,
            simplify=True,
            refresh_s=DAY,
        ),
    )


# --- Census Building Permits Survey (annual, by permit-issuing place) ---------

BPS_URL = "https://www2.census.gov/econ/bps/Place/{region}%20Region/{abbr}{year}a.txt"
BPS_REGIONS = (("West", "we"), ("Midwest", "mw"), ("Northeast", "ne"), ("South", "so"))
# Where to pin each permit office: incorporated places, towns/townships (MCDs)
# and, for unincorporated county balances, the county's interior point.
BPS_PINS = (
    ("place", f"{TW}/Places_CouSub_ConCity_SubMCD/MapServer/4"),
    ("mcd", f"{TW}/Places_CouSub_ConCity_SubMCD/MapServer/1"),
    ("county", f"{TW}/State_County/MapServer/1"),
)


def _int(v: str) -> int:
    try:
        return int(v.strip() or 0)
    except ValueError:
        return 0


def building_permits(text: str, pins: dict[str, dict[str, tuple[float, float]]]) -> list[dict]:
    """One BPS annual place file -> point features (places with >= 1 unit).

    Columns (2 header lines): 0 year, 1 state, 3 county, 5 FIPS place,
    6 FIPS MCD, 16 name, then bldgs/units/value for 1, 2, 3-4 and 5+ units."""
    out = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 29 or not row[0].strip().isdigit():
            continue  # header / blank lines
        st, county, place, mcd = (row[i].strip() for i in (1, 3, 5, 6))
        units = [_int(row[i]) for i in (18, 21, 24, 27)]  # 1, 2, 3-4, 5+ unit buildings
        total = sum(units)
        if total <= 0:
            continue
        pin = None
        if place not in ("", "00000", "99990"):
            pin = pins["place"].get(st + place)
        if pin is None and mcd not in ("", "00000"):
            pin = pins["mcd"].get(st + county + mcd)
        if pin is None:
            pin = pins["county"].get(st + county)
        if pin is None:
            continue
        out.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [pin[1], pin[0]]},
                "properties": {
                    "name": row[16].strip(),
                    "stage": "permitted",
                    "units": total,
                    "units_1": units[0],
                    "units_2_4": units[1] + units[2],
                    "units_5plus": units[3],
                    "year": _int(row[0]),
                },
            }
        )
    return out


async def _pins(client: httpx.AsyncClient, url: str) -> dict[str, tuple[float, float]]:
    """GEOID -> (lat, lon) interior point, from one TIGERweb layer (attributes only)."""
    body, _ = await fetch_capped(
        client,
        f"{url}/query",
        max_bytes=arcgis.MAX_BYTES,
        params={
            "where": "1=1",
            "outFields": "GEOID,INTPTLAT,INTPTLON",
            "returnGeometry": "false",
            "f": "json",
        },
    )
    out = {}
    for f in json.loads(body).get("features", []):
        a = f.get("attributes") or {}
        try:
            out[str(a["GEOID"])] = (round(float(a["INTPTLAT"]), 4), round(float(a["INTPTLON"]), 4))
        except (KeyError, TypeError, ValueError):
            continue
    if not out:
        raise ValueError(f"no interior points from {url}")
    return out


async def load_building_permits(client: httpx.AsyncClient, _s: Settings) -> dict:
    """The newest annual BPS place files (last year's, else the year before)."""
    pins = dict(
        zip(
            (k for k, _ in BPS_PINS),
            await asyncio.gather(*(_pins(client, u) for _, u in BPS_PINS)),
            strict=True,
        )
    )
    this_year = dt.date.today().year
    for year in (this_year - 1, this_year - 2):
        try:
            texts = await asyncio.gather(
                *(
                    fetch_capped(
                        client,
                        BPS_URL.format(region=r, abbr=a, year=year),
                        max_bytes=8 * 1024 * 1024,
                    )
                    for r, a in BPS_REGIONS
                )
            )
        except httpx.HTTPStatusError:
            continue  # not published yet
        feats = [f for body, _ in texts for f in building_permits(body.decode("latin-1"), pins)]
        if feats:
            return {"type": "FeatureCollection", "features": feats}
    raise ValueError("no Building Permits Survey place files")


# --- Field allowlists -----------------------------------------------------------

NBI_POOR_FIELDS = {
    "FACILITY_CARRIED_007": "road",
    "FEATURES_DESC_006A": "crosses",
    "YEAR_BUILT_027": "built",
    "ADT_029": "daily_traffic",
    "LOWEST_RATING": "lowest_rating",
    "DECK_COND_058": "deck",
    "SUPERSTRUCTURE_COND_059": "superstructure",
    "SUBSTRUCTURE_COND_060": "substructure",
    "STRUCTURE_NUMBER_008": "structure",
}
CROSSING_FIELDS = {
    "CrossingID": "id",
    "STREET": "street",
    "RailroadCode": "railroad",
    "WDCODE": "warning",
    "TotalDaylightThruTrains": "day_trains",
    "TotalNighttimeThruTrains": "night_trains",
    "MaximumTimetableSpeed": "max_mph",
}
ALT_FUEL_FIELDS = {
    "station_name": "name",
    "fuel_type_code": "fuel",
    "street_address": "address",
    "city": "city",
    "ev_network": "network",
    "ev_dc_fast_num": "dc_fast",
    "ev_level2_evse_num": "level2",
    "access_days_time": "hours",
}

LAYERS: dict[str, Layer] = {
    # --- Boundaries ---
    "state-senate": _boundary(
        "state-senate",
        "State senate districts",
        "Distritos del senado estatal",
        "State legislative districts, upper chamber (Census TIGERweb, 2026).",
        f"{TW}/Legislative/MapServer/1",
        {"NAME": "name", "SLDU": "district", "STATE": "state", "GEOID": "GEOID"},
        6,
    ),
    "state-house": _boundary(
        "state-house",
        "State assembly / house districts",
        "Distritos de la asamblea estatal",
        "State legislative districts, lower chamber (Census TIGERweb, 2026).",
        f"{TW}/Legislative/MapServer/2",
        {"NAME": "name", "SLDL": "district", "STATE": "state", "GEOID": "GEOID"},
        7,
    ),
    "counties": _boundary(
        "counties",
        "Counties",
        "Condados",
        "County boundaries (Census TIGERweb).",
        f"{TW}/State_County/MapServer/1",
        {"NAME": "name", "GEOID": "GEOID", "STATE": "state"},
        6,
    ),
    "county-subdivisions": _boundary(
        "county-subdivisions",
        "Towns & townships",
        "Municipios y subdivisiones del condado",
        "County subdivisions: towns, townships and census county divisions (Census TIGERweb).",
        f"{TW}/Places_CouSub_ConCity_SubMCD/MapServer/1",
        {"NAME": "name", "GEOID": "GEOID", "FUNCSTAT": "status"},
        8,
    ),
    "census-places": _boundary(
        "census-places",
        "Unincorporated communities",
        "Comunidades no incorporadas",
        "Census Designated Places: named unincorporated communities (Census TIGERweb).",
        f"{TW}/Places_CouSub_ConCity_SubMCD/MapServer/5",
        {"NAME": "name", "GEOID": "GEOID"},
        9,
    ),
    "tribal-lands": _boundary(
        "tribal-lands",
        "Tribal lands",
        "Tierras tribales",
        "American Indian, Alaska Native and Native Hawaiian areas (Census TIGERweb).",
        f"{TW}/AIANNHA/MapServer/47",
        {"NAME": "name", "GEOID": "GEOID", "AIANNHCOMP": "kind"},
        5,
    ),
    "voting-districts": _boundary(
        "voting-districts",
        "Voting districts (2020)",
        "Distritos electorales (2020)",
        "2020 Census voting districts (precinct-like). California and a few other "
        "states did not take part, so there are none there.",
        f"{TW}/Legislative/MapServer/15",
        {"NAME": "name", "GEOID": "GEOID", "COUNTY": "county", "STATE": "state"},
        11,
    ),
    # --- Land & water ---
    "public-lands": _layer(
        "public-lands",
        "Parks & public lands",
        "Parques y tierras públicas",
        "Publicly accessible parks, forests, refuges and open space (USGS PAD-US).",
        "info",
        "nature",
        View(
            PADUS,
            {
                "Unit_Nm": "name",
                "DesTp_Desc": "kind",
                "MngNm_Desc": "manager",
                "MngTp_Desc": "manager_type",
                "Pub_Access": "access",
                "GIS_Acres": "acres",
            },
            "polygon",
            min_zoom=11,
            # Fee = owned land; easements/designations mostly overlap it.
            where="Pub_Access IN ('OA','RA') AND Category = 'Fee'",
            max_features=1000,
            simplify=True,
            refresh_s=WEEK,
            post="padus",
        ),
    ),
    "rivers-usa": _layer(
        "rivers-usa",
        "Major rivers",
        "Ríos principales",
        "Major rivers and streams (USGS National Atlas, via Esri).",
        "info",
        "nature",
        View(
            f"{ESRI}/USA_Rivers_and_Streams/FeatureServer/0",
            {"Name": "name", "Feature": "kind"},
            "line",
            min_zoom=8,
            # Named, year-round rivers and canals (most rows are small creeks).
            where="Name <> ' ' AND Name IS NOT NULL AND Feature <> 'Stream Intermittent'",
            max_features=3000,
            simplify=True,
            refresh_s=WEEK,
        ),
    ),
    "streams": _layer(
        "streams",
        "Streams & canals",
        "Arroyos y canales",
        "Named streams, rivers and canals (USGS NHD, via Esri).",
        "info",
        "nature",
        View(
            f"{ESRI}/USA_Detailed_Streams/FeatureServer/0",
            {"NAME": "name", "FTYPE": "kind"},
            "line",
            min_zoom=11,
            where="NAME <> ' '",
            max_features=1000,
            simplify=True,
            refresh_s=WEEK,
        ),
    ),
    "water-bodies": _layer(
        "water-bodies",
        "Lakes & reservoirs",
        "Lagos y embalses",
        "Lakes, reservoirs and ponds (USGS NHD, via Esri).",
        "info",
        "nature",
        View(
            f"{ESRI}/USA_Detailed_Water_Bodies/FeatureServer/0",
            {"NAME": "name", "FTYPE": "kind", "SQKM": "sqkm"},
            "polygon",
            min_zoom=11,
            max_features=1000,
            simplify=True,
            refresh_s=WEEK,
        ),
    ),
    "trails": _layer(
        "trails",
        "Trails",
        "Senderos",
        "Hiking, biking and multi-use trails (USGS National Digital Trails).",
        "info",
        "nature",
        View(
            TRAILS,
            {
                "name": "name",
                "trailtype": "kind",
                "hikerpedestrian": "hike",
                "bicycle": "bike",
                "primarytrailmaintainer": "maintainer",
                "lengthmiles": "miles",
            },
            "line",
            min_zoom=12,
            # Named trails: unnamed connector segments are most of the rows.
            where="name IS NOT NULL",
            max_features=2000,
            simplify=True,
            refresh_s=WEEK,
            post="trails",
        ),
    ),
    "land-cover": _layer(
        "land-cover",
        "Land cover",
        "Cobertura del suelo",
        "What covers the ground: cities, farms, forest, wetlands, water (USGS NLCD 2021, "
        "lower 48 states).",
        "raster",
        "planning",
        client_side=True,
    ),
    "crops": _layer(
        "crops",
        "Crops",
        "Cultivos",
        "Which crop was grown in each field last season (USDA NASS Cropland Data Layer 2025).",
        "raster",
        "planning",
        client_side=True,
    ),
    "mobile-home-parks-usa": _layer(
        "mobile-home-parks-usa",
        "Mobile home parks (US)",
        "Parques de casas móviles (EE. UU.)",
        "Mobile home parks nationwide, with number of spaces (ORNL / DHS HIFLD, via FEMA).",
        "info",
        "planning",
        View(
            f"{RAPT}/Mobile_Home_Parks_RAPT/FeatureServer/2",
            {
                "NAME": "name",
                "ADDRESS": "address",
                "CITY": "city",
                "STATE": "state",
                "UNITS": "spaces",
                "STATUS": "status",
            },
            "point",
            min_zoom=9,
            where="STATUS <> 'CLOSED'",
            refresh_s=WEEK,
        ),
    ),
    # --- Growth ---
    "building-permits": _layer(
        "building-permits",
        "New homes permitted (by city)",
        "Viviendas nuevas con permiso (por ciudad)",
        "New homes each city, town or county authorized last year, by building size "
        "(Census Building Permits Survey, annual).",
        "dev",
        "growth",
        loader=load_building_permits,
        ttl=WEEK,
    ),
    # --- Roads & transportation ---
    "transit-stops-usa": _layer(
        "transit-stops-usa",
        "Transit stops (US)",
        "Paradas de transporte público (EE. UU.)",
        "Bus, rail and ferry stops from every agency's GTFS feed (BTS National Transit Map, "
        "CC BY 3.0 US).",
        "info",
        "roads",
        View(
            f"{NTAD}/NTAD_National_Transit_Map_Stops/FeatureServer/0",
            {
                "stop_name": "name",
                "stop_code": "code",
                "stop_type_text": "kind",
                "wheelchair_boarding": "wheelchair",
            },
            "point",
            min_zoom=14,
            refresh_s=WEEK,
            post="ntm",
        ),
    ),
    "transit-routes-usa": _layer(
        "transit-routes-usa",
        "Transit routes (US)",
        "Rutas de transporte público (EE. UU.)",
        "Bus, rail and ferry routes from every agency's GTFS feed (BTS National Transit Map, "
        "CC BY 3.0 US).",
        "info",
        "roads",
        View(
            f"{NTAD}/NTAD_National_Transit_Map_Routes/FeatureServer/0",
            {
                "route_short_name": "route",
                "route_long_name": "name",
                "route_type_text": "kind",
            },
            "line",
            min_zoom=13,
            max_features=300,
            simplify=True,
            refresh_s=WEEK,
            post="ntm",
        ),
    ),
    "rail-crossings": _layer(
        "rail-crossings",
        "Railroad crossings",
        "Cruces de ferrocarril",
        "Public at-grade road-rail crossings, their warning devices and train traffic "
        "(FRA, via BTS NTAD).",
        "info",
        "roads",
        View(
            f"{NTAD}/NTAD_Railroad_Grade_Crossings/FeatureServer/0",
            CROSSING_FIELDS,
            "point",
            min_zoom=11,
            where="CrossingPosition='At Grade' AND CrossingType='Public'",
            refresh_s=WEEK,
        ),
    ),
    "traffic-counts": _layer(
        "traffic-counts",
        "Traffic (vehicles per day)",
        "Tráfico (vehículos por día)",
        "Annual average daily traffic on freeways and major roads (FHWA HPMS 2024).",
        "line",
        "roads",
        View(
            HPMS,
            {"RouteName": "name", "RouteNumber": "route", "F_SYSTEM": "class", "AADT": "aadt"},
            "line",
            min_zoom=13,
            where="F_SYSTEM <= 3 AND AADT > 0",
            max_features=4000,
            simplify=True,
            refresh_s=WEEK,
        ),
        metric=Metric("aadt", "count", (5000, 20000, 50000, 100000, 200000), "traffic"),
    ),
    "pavement": _layer(
        "pavement",
        "Pavement roughness",
        "Estado del pavimento",
        "How rough major roads are (International Roughness Index, inches per mile; "
        "over 170 is poor). FHWA HPMS 2024.",
        "line",
        "roads",
        View(
            HPMS,
            {"RouteName": "name", "F_SYSTEM": "class", "IRI": "iri"},
            "line",
            min_zoom=13,
            where="F_SYSTEM <= 3 AND IRI > 0",
            max_features=4000,
            simplify=True,
            refresh_s=WEEK,
        ),
        metric=Metric("iri", "count", (60, 95, 120, 170, 220), "traffic"),
    ),
    "alt-fuel": _layer(
        "alt-fuel",
        "Alternative fuel stations",
        "Estaciones de combustible alternativo",
        "Public EV chargers and CNG, propane, hydrogen and biofuel stations "
        "(DOE AFDC, via BTS NTAD; updated daily).",
        "info",
        "roads",
        View(
            f"{NTAD}/Alternative_Fueling_Stations/FeatureServer/0",
            ALT_FUEL_FIELDS,
            "point",
            min_zoom=10,
            where="status_code='E' AND access_code='public'",
            refresh_s=DAY,
        ),
    ),
    "truck-parking": _layer(
        "truck-parking",
        "Truck parking (2019)",
        "Estacionamiento para camiones (2019)",
        "Interstate rest areas with truck parking and their number of spaces (FHWA, 2019).",
        "info",
        "roads",
        View(
            f"{NTAD}/NTAD_Truck_Stop_Parking/FeatureServer/0",
            {
                "nhs_rest_stop": "name",
                "highway_route": "highway",
                "mile_post": "milepost",
                "municipality": "city",
                "state": "state",
                "number_of_spots": "spaces",
            },
            "point",
            min_zoom=6,
            refresh_s=WEEK,
        ),
    ),
    # --- Infrastructure ---
    "poor-bridges": _layer(
        "poor-bridges",
        "Bridges in poor condition",
        "Puentes en mal estado",
        "Bridges rated Poor in the National Bridge Inventory, with deck and structure "
        "ratings (0-9, 4 or less is poor) and daily traffic (FHWA, via BTS NTAD).",
        "info",
        "infra",
        View(
            NBI,
            NBI_POOR_FIELDS,
            "point",
            min_zoom=8,
            where="BRIDGE_CONDITION='P'",
            refresh_s=DAY,
            post="nbi",
        ),
    ),
    "ports": _layer(
        "ports",
        "Major ports",
        "Puertos principales",
        "The 150 principal U.S. ports ranked by tonnage handled (USACE, via FEMA).",
        "info",
        "infra",
        View(
            f"{RAPT}/Principal_Ports_RAPT/FeatureServer/14",
            {
                "PORTNAME": "name",
                "RANK": "rank",
                "TOTAL": "tons",
                "IMPORTS": "imports",
                "EXPORTS": "exports",
            },
            "polygon",
            min_zoom=4,
            simplify=True,
            refresh_s=WEEK,
        ),
    ),
}

# Public source line for each layer (merged into the catalog's `source`).
SOURCES = {
    "state-senate": "U.S. Census Bureau TIGERweb (2026 state legislative districts)",
    "state-house": "U.S. Census Bureau TIGERweb (2026 state legislative districts)",
    "counties": "U.S. Census Bureau TIGERweb",
    "county-subdivisions": "U.S. Census Bureau TIGERweb",
    "census-places": "U.S. Census Bureau TIGERweb (Census Designated Places)",
    "tribal-lands": "U.S. Census Bureau TIGERweb (AIANNH areas)",
    "voting-districts": "U.S. Census Bureau TIGERweb (2020 voting districts)",
    "public-lands": "USGS Protected Areas Database of the United States (PAD-US)",
    "rivers-usa": "USGS National Atlas, via Esri Living Atlas",
    "streams": "USGS National Hydrography Dataset, via Esri Living Atlas",
    "water-bodies": "USGS National Hydrography Dataset, via Esri Living Atlas",
    "trails": "USGS National Digital Trails (The National Map)",
    "land-cover": "USGS / MRLC National Land Cover Database 2021",
    "crops": "USDA NASS Cropland Data Layer (USDA SCINet copy)",
    "mobile-home-parks-usa": "ORNL / DHS HIFLD Mobile Home Parks, via FEMA RAPT",
    "building-permits": "U.S. Census Bureau Building Permits Survey (annual, by place)",
    "transit-stops-usa": "BTS National Transit Map (CC BY 3.0 US)",
    "transit-routes-usa": "BTS National Transit Map (CC BY 3.0 US)",
    "rail-crossings": "FRA Highway-Rail Crossing Inventory, via BTS NTAD",
    "traffic-counts": "FHWA Highway Performance Monitoring System 2024, via BTS NTAD",
    "pavement": "FHWA Highway Performance Monitoring System 2024, via BTS NTAD",
    "alt-fuel": "DOE Alternative Fuels Data Center, via BTS NTAD",
    "truck-parking": "FHWA truck stop parking (2019), via BTS NTAD",
    "poor-bridges": "FHWA National Bridge Inventory, via BTS NTAD",
    "ports": "USACE Principal Ports, via FEMA RAPT",
}
