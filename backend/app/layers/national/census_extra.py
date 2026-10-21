"""Nationwide social, health, housing and food layers beyond the ACS (CDC
PLACES, FCC broadband, USDA food deserts, FEMA risk, HUD, CEJST).

Every layer here is view-only: the browser queries the national ArcGIS
service for the area on screen (coarser levels when zoomed out), so there is
nothing to bake. All sources were checked live (fields, f=geojson bbox
queries, CORS for the Pages origin) on 2026-10-19.

Areas are named by the `place` post (frontend view-logic.ts): `_geoid` (an
11/12-digit tract/block-group id), `_county` and `_state` become one `name`
("Tract 4324.01, Harris County, TX") for the popup title. No-data values are
dropped with `where` clauses, since the choropleth paints a missing value
like the lowest band.
"""

from __future__ import annotations

from ..service import PLACES_COUNTIES, PLACES_TRACTS, Layer, Metric, View

DAY = 24 * 3600

# --- FCC Broadband Data Collection (Esri Living Atlas copy): 0 states,
# 1 counties, 2 tracts, 3 block groups. Counties and below share fields.
FCC_BDC = (
    "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/"
    "FCC_Broadband_Data_Collection_December_2024_View/FeatureServer"
)
FCC_FIELDS = {
    "GEOID": "_geoid",
    "CountyName": "_county",
    "StateAbbr": "_state",
    "TotalBSLs": "_den",
    "ServedBSLs": "_served",
}
FCC_STATE_FIELDS = {"StateName": "_state", "TotalBSLs": "_den", "ServedBSLs": "_served"}

# --- USDA ERS Food Access Research Atlas 2025 (driving distance), all tracts
# with 0/1 flags: layer 12 = low income + low access at 1 mi urban / 10 mi rural.
FOOD_DESERTS = (
    "https://gisportal.ers.usda.gov/server/rest/services/"
    "FARA/FARA_2025_DrivingDistance/MapServer/12"
)

# --- FEMA National Risk Index (two services; tract adds TRACTFIPS)
NRI = "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services"
NRI_TRACTS = f"{NRI}/National_Risk_Index_Census_Tracts/FeatureServer/0"
NRI_COUNTIES = f"{NRI}/National_Risk_Index_Counties/FeatureServer/0"
NRI_COUNTY_FIELDS = {"COUNTY": "_county", "STATEABBRV": "_state", "RISK_SCORE": "risk_score"}

# --- HUD eGIS
HUD = "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services"
CEJST = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/usa_november_2022/FeatureServer/0"


def _metric_layer(
    name: str,
    title: str,
    title_es: str,
    description: str,
    view: View,
    metric: Metric,
    group: str,
    category: str = "census",
) -> Layer:
    return Layer(
        name=name,
        title=title,
        description=description,
        category=category,
        coverage="usa",
        view=view,
        title_es=title_es,
        group=group,
        metric=metric,
    )


def _flag_layer(
    name: str, title: str, title_es: str, description: str, view: View, group: str
) -> Layer:
    """Polygons that are simply 'in' a designation: one fill color, no legend."""
    return Layer(
        name=name,
        title=title,
        description=description,
        category="landuse",  # plain tinted fill + the generic name popup
        coverage="usa",
        view=view,
        title_es=title_es,
        group=group,
    )


def _point_layer(
    name: str, title: str, title_es: str, description: str, view: View, group: str
) -> Layer:
    """Points whose NAME/ADDRESS/CITY read in the generic popup."""
    return Layer(
        name=name,
        title=title,
        description=description,
        category="point",
        coverage="usa",
        view=view,
        title_es=title_es,
        group=group,
    )


# name, title, Spanish title, what it measures, PLACES measure, legend breaks
# (% of adults, national tract spread), ramp
_PLACES: tuple[tuple[str, str, str, str, str, tuple[float, ...], str], ...] = (
    ("health-depression", "Depression (adults)", "Depresión (adultos)",
     "adults ever told they have depression", "DEPRESSION", (17, 19, 22, 25, 27), "purple"),
    ("health-mental-distress", "Frequent mental distress", "Angustia mental frecuente",
     "adults with 14+ poor mental health days a month", "MHLTH", (13, 15, 17, 19, 21), "purple"),
    ("health-obesity", "Obesity (adults)", "Obesidad (adultos)",
     "adults with obesity", "OBESITY", (24, 29, 34, 39, 43), "orange"),
    ("health-high-bp", "High blood pressure", "Presión arterial alta",
     "adults with high blood pressure", "BPHIGH", (27, 30, 34, 39, 44), "red"),
    ("health-smoking", "Smoking (adults)", "Fumadores (adultos)",
     "adults who currently smoke", "CSMOKING", (8, 10, 13, 16, 20), "orange"),
    ("health-checkup", "Routine checkup in past year", "Chequeo médico en el último año",
     "adults with a routine checkup in the past year", "CHECKUP", (70, 74, 78, 80, 82), "green"),
    ("health-dental", "Dental visit in past year", "Visita al dentista en el último año",
     "adults who visited a dentist in the past year", "DENTAL", (45, 54, 62, 69, 74), "green"),
    ("health-disability", "Any disability (adults)", "Alguna discapacidad (adultos)",
     "adults with any disability", "DISABILITY", (22, 26, 31, 36, 42), "teal"),
    ("health-no-transport", "Lacked reliable transportation", "Sin transporte confiable",
     "adults who lacked reliable transportation in the past year", "LACKTRPT",
     (5, 6, 8, 12, 17), "red"),
    ("health-housing-insecure", "Housing insecurity", "Inseguridad de vivienda",
     "adults who experienced housing insecurity in the past year", "HOUSINSECU",
     (7, 9, 12, 18, 26), "red"),
    ("health-utility-shutoff", "Utility shut-off threat", "Amenaza de corte de servicios",
     "adults threatened with a utility shut-off in the past year", "SHUTUTILITY",
     (4, 5, 7, 11, 17), "red"),
    ("health-isolation", "Social isolation", "Aislamiento social",
     "adults who feel socially isolated", "ISOLATION", (29, 31, 34, 37, 41), "blue"),
    ("health-snap", "Received SNAP (food stamps)", "Reciben SNAP (cupones de alimentos)",
     "adults who received SNAP in the past year", "FOODSTAMP", (5, 7, 12, 19, 31), "orange"),
)  # fmt: skip


# Social-needs survey questions not asked everywhere: verified 2026-10-19,
# no data in CO, FL, KY, OR, PA, SD, TN, TX, VT, WA, WY (left blank there).
SOCIAL_NEEDS = {"LACKTRPT", "HOUSINSECU", "SHUTUTILITY", "ISOLATION", "FOODSTAMP"}


def _places_layer(row: tuple) -> Layer:
    name, title, title_es, what, measure, breaks, ramp = row
    value = f"{measure}_CrudePrev"
    gaps = (
        " Not measured in every state (none for TX, FL, PA and 8 others)."
        if measure in SOCIAL_NEEDS
        else ""
    )
    return _metric_layer(
        name,
        title,
        title_es,
        f"CDC PLACES model estimate (2025 release): {what}, by census tract "
        f"(county when zoomed out).{gaps}",
        View(
            PLACES_TRACTS,
            {"TractFIPS": "_geoid", "CountyName": "_county", "StateAbbr": "_state", value: "pct"},
            "polygon",
            min_zoom=9,
            where=f"{value} IS NOT NULL",
            max_features=2000,
            simplify=True,
            refresh_s=DAY,
            post="place",
            levels=(
                (
                    0,
                    PLACES_COUNTIES,
                    {"CountyName": "_county", "StateAbbr": "_state", value: "pct"},
                ),
            ),
        ),
        Metric("pct", "pct", breaks, ramp),
        group="people",
        category="health",
    )


LAYERS: dict[str, Layer] = {
    **{row[0]: _places_layer(row) for row in _PLACES},
    "broadband-unserved": _metric_layer(
        "broadband-unserved",
        "No high-speed internet available",
        "Sin internet de alta velocidad disponible",
        "Share of homes and businesses where no provider offers 100/20 Mbps "
        "service (FCC 'unserved' plus 'underserved' locations), by block group "
        "(tract, county and state when zoomed out). Latest FCC Broadband Data "
        "Collection, via Esri.",
        View(
            f"{FCC_BDC}/3",
            FCC_FIELDS,
            "polygon",
            min_zoom=11,
            where="TotalBSLs > 0",
            max_features=2000,
            simplify=True,
            refresh_s=DAY,
            post="bdc",
            levels=(
                (0, f"{FCC_BDC}/0", FCC_STATE_FIELDS),
                (5, f"{FCC_BDC}/1"),
                (9, f"{FCC_BDC}/2"),
            ),
        ),
        Metric("pct", "pct", (1, 5, 10, 25, 50), "orange"),
        group="housing",
    ),
    "food-deserts": _flag_layer(
        "food-deserts",
        "Food deserts (low income, low access)",
        "Desiertos alimentarios (bajos ingresos, poco acceso)",
        "Low-income census tracts where many residents live more than 1 mile "
        "(urban) or 10 miles (rural) by road from a SNAP-authorized grocery "
        "store. USDA ERS Food Access Research Atlas, 2025 edition.",
        View(
            FOOD_DESERTS,
            {"CensusTract20": "_geoid", "County24": "_county", "State": "_state"},
            "polygon",
            min_zoom=4,  # ~6,300 tracts nationally: the whole US fits in 4 pages
            where="DD_SRAM_LILATracts_1And10=1",
            max_features=7000,
            simplify=True,
            refresh_s=DAY,
            post="place",
        ),
        group="civic",
    ),
    "nri-risk": _metric_layer(
        "nri-risk",
        "Natural hazard risk (FEMA)",
        "Riesgo de desastres naturales (FEMA)",
        "FEMA National Risk Index composite risk score (national percentile, "
        "0-100: expected losses from 18 hazards, social vulnerability and "
        "resilience), by census tract (county when zoomed out). Dec 2025 release.",
        View(
            NRI_TRACTS,
            {"TRACTFIPS": "_geoid", **NRI_COUNTY_FIELDS},
            "polygon",
            min_zoom=9,
            where="RISK_SCORE IS NOT NULL",
            max_features=2000,
            simplify=True,
            refresh_s=DAY,
            post="place",
            # heavy shapes: counties only from z5 (~1,000 counties, ~600 KB)
            levels=((5, NRI_COUNTIES, NRI_COUNTY_FIELDS),),
        ),
        Metric("risk_score", "score", (20, 40, 60, 80, 95), "red"),
        group="hazards",
    ),
    "hud-lihtc": _point_layer(
        "hud-lihtc",
        "Tax-credit affordable housing (LIHTC)",
        "Vivienda asequible con crédito fiscal (LIHTC)",
        "Rental properties built or rehabilitated with Low-Income Housing Tax "
        "Credits (HUD LIHTC database, updated Dec 2024).",
        View(
            f"{HUD}/LIHTC/FeatureServer/0",
            {"PROJECT": "NAME", "PROJ_ADD": "ADDRESS", "PROJ_CTY": "CITY"},
            "point",
            min_zoom=10,
            max_features=2000,
            refresh_s=DAY,
        ),
        group="housing",
    ),
    "hud-public-housing": _point_layer(
        "hud-public-housing",
        "Public housing developments",
        "Desarrollos de vivienda pública",
        "Public housing developments run by local housing authorities (HUD).",
        View(
            f"{HUD}/Public_Housing_Developments/FeatureServer/0",
            {"PROJECT_NAME": "NAME", "STD_ADDR": "ADDRESS", "STD_CITY": "CITY"},
            "point",
            min_zoom=10,
            max_features=2000,
            refresh_s=DAY,
        ),
        group="housing",
    ),
    "hud-vouchers": _metric_layer(
        "hud-vouchers",
        "Housing Choice Vouchers (Section 8)",
        "Vales de vivienda (Sección 8)",
        "Housing Choice Vouchers in use as a share of renter-occupied homes, by "
        "census tract (HUD). Tracts with too few vouchers to report are blank.",
        View(
            f"{HUD}/Housing_Choice_Vouchers_by_Tract/FeatureServer/0",
            {"GEOID": "_geoid", "HCV_PUBLIC_PCT": "pct_vouchers"},
            "polygon",
            min_zoom=9,
            where="HCV_PUBLIC_PCT IS NOT NULL",  # null = suppressed
            max_features=4000,
            simplify=True,
            refresh_s=DAY,
            post="place",
        ),
        Metric("pct_vouchers", "pct", (2, 3.5, 6, 10, 16), "purple"),
        group="housing",
    ),
    "hud-fmr": _metric_layer(
        "hud-fmr",
        "Fair Market Rent (2-bedroom)",
        "Renta justa de mercado (2 recámaras)",
        "HUD Fair Market Rent for a 2-bedroom home (rent plus basic utilities), "
        "by FMR area (metro area or county). Latest published year in HUD's "
        "service (its notes say FY2024 but it was updated Sept 2025).",
        View(
            f"{HUD}/Fair_Market_Rents/FeatureServer/0",
            {"FMR_AREANAME": "name", "FMR_2BDR": "fmr_2br"},
            "polygon",
            min_zoom=6,  # 2,622 areas nationally; heavy shapes, one page
            where="FMR_2BDR > 0",
            max_features=1000,
            simplify=True,
            refresh_s=DAY,
        ),
        Metric("fmr_2br", "usd", (900, 1000, 1200, 1500, 2000), "blue"),
        group="housing",
    ),
    "opportunity-zones": _flag_layer(
        "opportunity-zones",
        "Opportunity Zones",
        "Zonas de Oportunidad",
        "Census tracts designated as Qualified Opportunity Zones in 2018 (2010 "
        "tracts; HUD / CDFI Fund).",
        View(
            f"{HUD}/Opportunity_Zones/FeatureServer/13",
            {"GEOID10": "_geoid", "STATE_NAME": "_state"},
            "polygon",
            min_zoom=6,
            max_features=4000,
            simplify=True,
            refresh_s=DAY,
            post="place",
        ),
        group="housing",
    ),
    "opportunity-zones-2": _flag_layer(
        "opportunity-zones-2",
        "Opportunity Zones 2.0 (eligible)",
        "Zonas de Oportunidad 2.0 (elegibles)",
        "Census tracts eligible to be nominated for the 2027-2036 Opportunity "
        "Zones under the 2025 law (HUD, April 2026). Eligible is not designated.",
        View(
            f"{HUD}/Opportunity_Zones_2/FeatureServer/0",
            {"GEOID": "_geoid", "OZ_ELIGIBLE": "TYPE"},  # "OZ Eligible - Rural"
            "polygon",
            min_zoom=8,  # ~25,000 eligible tracts
            where="OZ_ON_LIST=1",
            max_features=4000,
            simplify=True,
            refresh_s=DAY,
            post="place",
        ),
        group="housing",
    ),
    "cejst-disadvantaged": _flag_layer(
        "cejst-disadvantaged",
        "Disadvantaged communities (CEJST, archived)",
        "Comunidades desfavorecidas (CEJST, archivo)",
        "Census tracts the former Climate & Economic Justice Screening Tool "
        "identified as disadvantaged: archived 2022 v1.0 (2010 tracts), as "
        "re-hosted by Esri. The tool itself is no longer online.",
        View(
            CEJST,
            {"GEOID10": "_geoid", "CF": "_county", "SF": "_state"},
            "polygon",
            min_zoom=8,  # ~27,000 tracts
            where="SN_C=1",
            max_features=4000,
            simplify=True,
            refresh_s=DAY,
            post="place",
        ),
        group="people",
    ),
    "new-homes-permits": _metric_layer(
        "new-homes-permits",
        "New homes permitted (2022)",
        "Viviendas nuevas con permiso (2022)",
        "Housing units authorized by building permits in 2022, by county "
        "(Census Building Permits Survey via HUD; this service runs through 2022).",
        View(
            f"{HUD}/Residential_Construction_Permits_by_County/FeatureServer/24",
            {"NAME": "_county", "STUSAB": "_state", "ALL_PERMITS_2022": "permits_2022"},
            "polygon",
            min_zoom=4,  # ~3,100 counties at 1,000 a page
            where="ALL_PERMITS_2022 IS NOT NULL",
            max_features=3300,
            simplify=True,
            refresh_s=DAY,
            post="place",
        ),
        Metric("permits_2022", "count", (20, 80, 300, 1400, 5000), "green"),
        group="housing",
    ),
}

# Attribution shown in the layer's "source" line (merged by scripts/bake.py).
SOURCES: dict[str, str] = {
    **{
        name: "CDC PLACES (local estimates from BRFSS), tract and county"
        for name in LAYERS
        if name.startswith("health-")
    },
    "broadband-unserved": "FCC Broadband Data Collection (National Broadband Map), via Esri",
    "food-deserts": "USDA ERS Food Access Research Atlas (2025)",
    "nri-risk": "FEMA National Risk Index",
    "hud-lihtc": "HUD Low-Income Housing Tax Credit database",
    "hud-public-housing": "HUD public housing developments",
    "hud-vouchers": "HUD Housing Choice Vouchers by tract",
    "hud-fmr": "HUD Fair Market Rents (latest published)",
    "opportunity-zones": "HUD / U.S. Treasury Opportunity Zones",
    "opportunity-zones-2": "HUD Opportunity Zones 2.0 eligible tracts",
    "cejst-disadvantaged": "CEQ Climate and Economic Justice Screening Tool v1.0 (archived 2022)",
    "new-homes-permits": "U.S. Census Bureau Building Permits Survey via HUD (through 2022)",
}
