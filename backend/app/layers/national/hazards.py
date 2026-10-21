"""Nationwide hazards, environment, utilities and water layers.

Every vector layer here loads in the browser straight from a national ArcGIS
service (`View`, all checked for CORS + f=geojson + an envelope query with
these exact fields, Houston and Denver). The raster ones are client-side
tiles drawn by the frontend's `rasterSource()` (MapView.tsx). Nothing here is
baked, so the home county uses the same national sources as everywhere else.

`post` names a browser-side cleanup in frontend/src/view-logic.ts:
  fmt     - "<k>_date"/"<k>_utc" epoch ms -> readable date in <k>;
            "<k>_mi|_kt|_lbs|_sqmi|_count" numbers -> "N unit" in <k>; http -> https
            for `page` (the popup still only links to allowlisted hosts)
  pctl    - CDC 0-1 percentiles (`*_pctl`) -> 0-100; -999 no-data -> null
  radon   - USGS radon zone (1 high .. 3 low) -> level 3 high .. 1 low
  hotspot - Esri VIIRS hotspots -> the fields the hotspot popup reads
  hms     - NOAA HMS "YYYYDDD HHMM" times -> readable UTC
  drc     - FEMA recovery-center hours -> per-day "08:00-16:00"
"""

from __future__ import annotations

from ..service import Layer, Metric, View

WEEK = 7 * 24 * 3600
DAY = 24 * 3600

# --- Sources (one constant each: federal hosting moves) ---
EJI = "https://onemap.cdc.gov/OneMapServices/rest/services/EJI/EJI_2024_Data_Service/MapServer/0"
SVI = (
    "https://services3.arcgis.com/ZvidGQkLaDJxRSJ2/arcgis/rest/services/"
    "CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer"
)
QFAULTS = (
    "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/"
    "USGS_Quaternary_Fault_and_Fold_Database/FeatureServer/5"
)
VIIRS = (
    "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/"
    "Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0"
)
HMS_FIRE = (
    "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/"
    "NOAA_Satellite_Fire_Detections_(v1)/FeatureServer/0"
)
HMS_SMOKE = (
    "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/"
    "NOAA_Satellite_Smoke_Detection_(v1)/FeatureServer/0"
)
NSS = "https://gis.fema.gov/arcgis/rest/services/NSS"
DRC = "https://gis.fema.gov/arcgis/rest/services/FEMA/DRC/FeatureServer/0"
DECLARATIONS = "https://gis.fema.gov/arcgis/rest/services/FEMA/DECS_ALL/FeatureServer/0"
LANDSLIDES = (
    "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/"
    "US_Landslide_poly_v2/FeatureServer/12"
)
HURRICANES = "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer"
RADON = (
    "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/"
    "Geologic_Radon_Potential_Map_of_the_United_States/FeatureServer/0"
)
ECHO = (
    "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/"
    "ECHO_All_Media_Facilities/FeatureServer/0"
)
WATER_SYSTEMS = (
    "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/"
    "Water_System_Boundaries/FeatureServer/0"
)
CLEANUPS = (
    "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/"
    "Cleanups_in_my_Community_Sites/FeatureServer/0"
)
GAS_PIPELINES = (
    "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/"
    "Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0"
)
POWER_PLANTS = (
    "https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Power_Plants/FeatureServer/0"
)
NPP_RINGS = (
    "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/"
    "NPP_Distance_Range_Rings/FeatureServer/80"
)
LEVEES = "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/NLD2_PUBLIC_v1/FeatureServer"

# Attribution shown in the About page (merged into scripts/bake.py SOURCES).
SOURCES: dict[str, str] = {}

LAYERS: dict[str, Layer] = {}


def _add(source: str, **kw) -> None:
    kw.setdefault("coverage", "usa")
    layer = Layer(**kw)
    LAYERS[layer.name] = layer
    SOURCES[layer.name] = source


# --- Raster layers (tiles drawn in the browser; see MapView.tsx rasterSource) ---
_add(
    "USDA Forest Service, Wildfire Hazard Potential 2023 (RMRS Fire Modeling Institute)",
    name="wildfire-hazard-potential",
    title="Wildfire hazard potential",
    title_es="Potencial de peligro de incendio forestal",
    description=(
        "USDA Forest Service Wildfire Hazard Potential (2023): how hard a wildfire would be "
        "to contain, very low to very high, lower 48 states. A modeled index, not a legal zone."
    ),
    category="raster",
    client_side=True,
    group="hazards",
)
_add(
    "USGS national landslide susceptibility (Mirus et al.)",
    name="landslide-susceptibility",
    title="Landslide susceptibility",
    title_es="Susceptibilidad a deslizamientos",
    description="USGS map of where slopes are prone to landslides, lower 48 states.",
    category="raster",
    client_side=True,
    group="hazards",
)
_add(
    "NOAA Office for Coastal Management, Sea Level Rise Viewer (3 ft scenario)",
    name="sea-level-rise",
    title="Sea-level rise: 3 ft",
    title_es="Aumento del nivel del mar: 3 pies (0.9 m)",
    description=(
        "NOAA: coastal land that would be under water at high tide with 3 feet of "
        "sea-level rise (all US coasts)."
    ),
    category="raster",
    client_side=True,
    group="hazards",
)
_add(
    "NOAA National Hurricane Center, storm surge risk maps (Category 3)",
    name="storm-surge",
    title="Storm surge risk: Category 3",
    title_es="Riesgo de marejada ciclónica: categoría 3",
    description=(
        "NOAA National Hurricane Center: how deep storm-surge flooding could get in a "
        "Category 3 hurricane (Atlantic and Gulf coasts, Puerto Rico, Hawaii)."
    ),
    category="raster",
    client_side=True,
    group="hazards",
)

# --- Environment & health burden (CDC/ATSDR; tracts, -999 = no data) ---
_add(
    "CDC/ATSDR Environmental Justice Index 2024",
    name="environmental-justice",
    title="Environmental justice index",
    title_es="Índice de justicia ambiental",
    description=(
        "CDC/ATSDR Environmental Justice Index 2024: combined environmental, social and "
        "health burden, as a national percentile by census tract (zoom in to see tracts)."
    ),
    category="census",
    view=View(
        EJI,
        {
            "LOCATION": "name",
            "RPL_EJI": "eji_pctl",
        },
        "polygon",
        min_zoom=9,
        max_features=1500,
        where="RPL_EJI >= 0",
        simplify=True,
        refresh_s=WEEK,
        post="pctl",
    ),
    group="hazards",
    metric=Metric("eji_pctl", "pct", (10, 30, 50, 70, 90), "red"),
)
_add(
    "CDC/ATSDR Environmental Justice Index 2024 (extreme heat days)",
    name="extreme-heat-days",
    title="Extreme heat days per year",
    title_es="Días de calor extremo al año",
    description=(
        "Average days a year above the local 95th-percentile high temperature, by census "
        "tract (CDC/ATSDR Environmental Justice Index 2024)."
    ),
    category="census",
    view=View(
        EJI,
        {"LOCATION": "name", "E_NEHD": "heat_days"},
        "polygon",
        min_zoom=9,
        max_features=1500,
        where="E_NEHD >= 0",
        simplify=True,
        refresh_s=WEEK,
    ),
    group="weather",
    metric=Metric("heat_days", "count", (5, 10, 15, 20, 25), "orange"),
)
_add(
    "CDC/ATSDR Social Vulnerability Index 2022",
    name="social-vulnerability",
    title="Social vulnerability index",
    title_es="Índice de vulnerabilidad social",
    description=(
        "CDC/ATSDR Social Vulnerability Index 2022: how hard it may be for a community to "
        "prepare for and recover from a disaster, as a national percentile (tracts; counties "
        "when zoomed out)."
    ),
    category="census",
    view=View(
        f"{SVI}/2",
        {"LOCATION": "name", "RPL_THEMES": "svi_pctl"},
        "polygon",
        min_zoom=9,
        max_features=1500,
        where="RPL_THEMES >= 0",
        simplify=True,
        refresh_s=WEEK,
        post="pctl",
        # counties from z5: below that the service ignores generalization (~7 MB)
        levels=((5, f"{SVI}/1"),),
    ),
    group="people",
    metric=Metric("svi_pctl", "pct", (10, 30, 50, 70, 90), "purple"),
)
_add(
    "USGS / EPA Geologic Radon Potential of the United States (2025)",
    name="radon",
    title="Radon potential (1 low - 3 high)",
    title_es="Potencial de radón (1 bajo - 3 alto)",
    description=(
        "USGS/EPA geologic radon potential by geologic province: 3 = high (test your home), "
        "2 = moderate, 1 = low. Any home can have high radon; only a test tells."
    ),
    category="census",
    view=View(
        RADON,
        {"AREANAME": "name", "GRP": "zone", "STATE": "state"},
        "polygon",
        min_zoom=4,
        simplify=True,
        refresh_s=WEEK,
        post="radon",
    ),
    group="hazards",
    metric=Metric("level", "count", (1, 2, 3), "red"),
)

# --- Earth hazards ---
_add(
    "USGS Quaternary Fault and Fold Database",
    name="faults-usa",
    title="Earthquake faults (US)",
    title_es="Fallas sísmicas (EE. UU.)",
    description=(
        "USGS Quaternary Fault and Fold Database: faults active in the last 1.6 million years."
    ),
    category="fault",
    view=View(
        QFAULTS,
        {"fault_name": "name", "section_name": "section", "mapped_certainty": "certainty"},
        "line",
        min_zoom=8,
        simplify=True,
        refresh_s=WEEK,
    ),
    group="hazards",
)
_add(
    "USGS U.S. Landslide Inventory",
    name="landslides",
    title="Mapped landslides",
    title_es="Deslizamientos registrados",
    description="USGS U.S. Landslide Inventory: landslides mapped by federal and state surveys.",
    category="info",
    view=View(
        LANDSLIDES,
        {"LS_Type": "kind", "Inventory": "source"},
        "polygon",
        min_zoom=11,
        simplify=True,
        refresh_s=WEEK,
    ),
    group="hazards",
)

# --- Fire & smoke (satellites) ---
_add(
    "NASA FIRMS VIIRS active fires, via Esri Living Atlas",
    name="fire-hotspots-usa",
    title="Satellite fire detections, US (24h)",
    title_es="Incendios detectados por satélite, EE. UU. (24 h)",
    description=(
        "NASA VIIRS heat detections in the last 24 hours, nationwide. Refineries and flares "
        "can show up as steady hotspots."
    ),
    category="hotspot",
    view=View(
        VIIRS,
        {
            "frp": "frp_mw",
            "confidence": "confidence",
            "acq_time": "acquired",
            "daynight": "daynight",
        },
        "point",
        min_zoom=5,
        where="hours_old <= 24",
        max_features=4000,
        refresh_s=1800,
        post="hotspot",
    ),
    group="hazards",
)
_add(
    "NOAA NESDIS Hazard Mapping System (fire detections)",
    name="hms-fires",
    title="Fire detections (NOAA HMS, today)",
    title_es="Incendios detectados (NOAA HMS, hoy)",
    description=(
        "Fires spotted today by NOAA analysts on GOES and polar-orbiting satellite images "
        "(Hazard Mapping System)."
    ),
    category="hotspot",
    view=View(
        HMS_FIRE,
        {"YearDay": "_yearday", "Time": "_time", "FRP": "frp_mw"},
        "point",
        min_zoom=6,
        refresh_s=1800,
        post="hms",
    ),
    group="hazards",
)
_add(
    "NOAA NESDIS Hazard Mapping System (smoke)",
    name="smoke-plumes",
    title="Smoke plumes (satellite, today)",
    title_es="Columnas de humo (satélite, hoy)",
    description=(
        "Smoke drawn by NOAA analysts from satellite images today: light, medium or heavy. "
        "It's smoke anywhere in the air column, not necessarily at ground level."
    ),
    category="info",
    view=View(
        HMS_SMOKE,
        {"Density": "density", "Satellite": "satellite", "Start": "start", "End_": "end"},
        "polygon",
        min_zoom=3,
        max_features=1000,
        simplify=True,
        refresh_s=1800,
        post="hms",
    ),
    group="hazards",
)

# --- Storms, disasters, shelters ---
_add(
    "NOAA National Hurricane Center, via Esri Living Atlas (Active Hurricanes)",
    name="hurricanes",
    title="Hurricane forecast cones",
    title_es="Conos de pronóstico de huracanes",
    description="Where active tropical storms and hurricanes may track (NHC forecast cones).",
    category="info",
    view=View(
        f"{HURRICANES}/4",
        {
            "STORMNAME": "name",
            "STORMTYPE": "kind",
            "MAX_WIND": "wind_kt",
            "ADVDATE": "issued_utc",
        },
        "polygon",
        min_zoom=2,
        simplify=True,
        refresh_s=1800,
        post="fmt",
    ),
    group="weather",
)
_add(
    "FEMA disaster declarations (DECS), last 365 days",
    name="disaster-declarations",
    title="Disaster declarations (past year)",
    title_es="Declaraciones de desastre (último año)",
    description=(
        "Counties in a federal major-disaster declaration posted in the last year (FEMA). "
        "Overlapping shading means more than one."
    ),
    category="info",
    view=View(
        DECLARATIONS,
        {
            "name": "name",
            "state_name": "state",
            "dec_number": "declaration",
            "designate": "programs",
            "fema_postdate": "posted_date",
        },
        "polygon",
        min_zoom=3,
        where="fema_postdate >= CURRENT_DATE - 365",
        simplify=True,
        refresh_s=6 * 3600,
        post="fmt",
    ),
    group="hazards",
)
_add(
    "FEMA National Shelter System (open shelters)",
    name="open-shelters",
    title="Open emergency shelters",
    title_es="Refugios de emergencia abiertos",
    description=(
        "Emergency shelters open right now (FEMA / American Red Cross National Shelter System)."
    ),
    category="info",
    view=View(
        f"{NSS}/OpenShelters/MapServer/0",
        {
            "shelter_name": "name",
            "address": "address",
            "city": "city",
            "state": "state",
            "shelter_status": "status",
            "evacuation_capacity": "capacity",
        },
        "point",
        min_zoom=2,
        refresh_s=900,
    ),
    group="hazards",
)
_add(
    "FEMA Disaster Recovery Centers",
    name="recovery-centers",
    title="Disaster recovery centers",
    title_es="Centros de recuperación de desastres",
    description="FEMA Disaster Recovery Centers open now, where survivors can get help in person.",
    category="info",
    view=View(
        DRC,
        {
            "drc_name": "name",
            "street_1": "address",
            "city": "city",
            "state": "state",
            "status": "status",
            "actual_open_date": "opened_date",
            **{
                f"{day}_{edge}_tm": f"_{day[:3]}_{edge}"
                for day in (
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                )
                for edge in ("open", "close")
            },
        },
        "point",
        min_zoom=2,
        refresh_s=3600,
        post="drc",
    ),
    group="hazards",
)

# --- Pollution & EPA facilities (ECHO: one layer, four filters) ---
_ECHO_BASE = {"fac_name": "name", "fac_city": "city", "fac_state": "state", "dfr_url": "page"}
_add(
    "US EPA ECHO (Enforcement and Compliance History Online)",
    name="epa-violations",
    title="EPA-regulated sites in violation",
    title_es="Sitios regulados por la EPA con infracciones",
    description=(
        "Facilities EPA lists as currently in violation of air, water or waste permits (ECHO). "
        "Click for the EPA facility report."
    ),
    category="info",
    view=View(
        ECHO,
        {**_ECHO_BASE, "fac_compliance_status": "status"},
        "point",
        min_zoom=9,
        where=(
            "fac_compliance_status IN "
            "('Significant Violation','Violation','Violation Identified')"
        ),
        refresh_s=DAY,
        post="fmt",
    ),
    group="hazards",
)
_add(
    "US EPA Toxics Release Inventory, via ECHO",
    name="toxic-releases",
    title="Toxic release sites (TRI)",
    title_es="Sitios con emisiones tóxicas (TRI)",
    description=(
        "Facilities that report toxic chemical releases to EPA's Toxics Release Inventory, "
        "with pounds released on site."
    ),
    category="info",
    view=View(
        ECHO,
        {**_ECHO_BASE, "tri_on_site_releases": "releases_lbs"},
        "point",
        min_zoom=7,
        where="tri_flag = 'Y'",
        refresh_s=WEEK,
        post="fmt",
    ),
    group="hazards",
)
_add(
    "US EPA Risk Management Program facilities, via ECHO (location only)",
    name="chemical-plants",
    title="Chemical risk plan facilities",
    title_es="Instalaciones con plan de riesgo químico",
    description=(
        "Facilities that store enough hazardous chemicals to file an EPA Risk Management "
        "Plan (location only; the plans themselves are not public online)."
    ),
    category="info",
    view=View(
        ECHO,
        _ECHO_BASE,
        "point",
        min_zoom=7,
        where="rmp_ids IS NOT NULL",
        refresh_s=WEEK,
        post="fmt",
    ),
    group="hazards",
)
_add(
    "US EPA Safe Drinking Water Information System, via ECHO",
    name="drinking-water-violations",
    title="Drinking water violations",
    title_es="Infracciones del agua potable",
    description=(
        "Public water systems EPA lists with a current Safe Drinking Water Act violation "
        "(dots mark the system's office, not its service area)."
    ),
    category="info",
    view=View(
        ECHO,
        {**_ECHO_BASE, "sdwa_system_types": "kind", "sdwa_compliance_status": "status"},
        "point",
        min_zoom=7,
        where=(
            "sdwis_flag = 'Y' AND sdwa_compliance_status IN "
            "('Violation Identified','Enforcement Priority')"
        ),
        refresh_s=DAY,
        post="fmt",
    ),
    group="infra",
)
_add(
    "US EPA Community Water System Service Area Boundaries",
    name="water-systems",
    title="Water system service areas",
    title_es="Áreas de servicio de agua potable",
    description=(
        "Which community water system serves an area (EPA). Many boundaries are modeled "
        "estimates; the popup says which."
    ),
    category="info",
    view=View(
        WATER_SYSTEMS,
        {
            "PWS_Name": "name",
            "PWSID": "pwsid",
            "Population_Served_Count": "pop_count",
            "Symbology_Field": "method",
            "Detailed_Facility_Report": "page",
        },
        "polygon",
        min_zoom=9,
        max_features=1500,
        simplify=True,
        refresh_s=WEEK,
        post="fmt",
    ),
    group="infra",
)
_add(
    "US EPA Cleanups in My Community (Brownfields)",
    name="brownfields",
    title="Brownfields",
    title_es="Terrenos contaminados (brownfields)",
    description="Brownfield properties (possibly contaminated land) in EPA's cleanup programs.",
    category="info",
    view=View(
        CLEANUPS,
        {"PRIMARY_NAME": "name", "CITY_NAME": "city", "STATE_CODE": "state", "URL": "page"},
        "point",
        min_zoom=9,
        where="BF_PROPERTY_ID IS NOT NULL",
        refresh_s=WEEK,
        post="fmt",
    ),
    group="hazards",
)

# --- Energy & flood infrastructure ---
_add(
    "US EIA natural gas pipelines (HIFLD copy, Esri federal data)",
    name="gas-pipelines",
    title="Natural gas pipelines",
    title_es="Gasoductos",
    description="Interstate and intrastate natural gas pipelines (US EIA, about 1:250,000 detail).",
    category="info",
    view=View(
        GAS_PIPELINES,
        {"Operator": "operator", "TYPEPIPE": "kind", "Status": "status"},
        "line",
        min_zoom=6,
        simplify=True,
        refresh_s=WEEK,
    ),
    group="infra",
)
_add(
    "HIFLD / US EIA power plants (nuclear)",
    name="nuclear-plants",
    title="Nuclear power plants",
    title_es="Centrales nucleares",
    description="Operating nuclear power plants (HIFLD / US EIA).",
    category="power",
    view=View(
        POWER_PLANTS,
        {"NAME": "name", "OPERATOR": "operator", "PRIMARY_FU": "fuel", "OPER_CAP": "capacity_mw"},
        "point",
        min_zoom=2,
        where="PRIMARY_FU = 'NUC'",
        refresh_s=WEEK,
    ),
    group="infra",
)
_add(
    "HIFLD nuclear power plant distance rings",
    name="nuclear-plant-rings",
    title="Nuclear plant 10 and 50 mile rings",
    title_es="Anillos de 10 y 50 millas de centrales nucleares",
    description=(
        "Distance rings around nuclear plants. The 10-mile ring is the emergency planning "
        "zone for evacuation; the 50-mile ring is for food and water protection."
    ),
    category="info",
    view=View(
        NPP_RINGS,
        {"PLANT_NAME": "name", "BUFF_DIST": "radius_mi"},
        "line",
        min_zoom=5,
        where="BUFF_DIST IN (10, 50)",
        simplify=True,
        refresh_s=WEEK,
        post="fmt",
    ),
    group="infra",
)
_add(
    "USACE National Levee Database",
    name="levees",
    title="Levees",
    title_es="Diques",
    description="Levee systems from the USACE National Levee Database, with FEMA accreditation.",
    category="info",
    view=View(
        f"{LEVEES}/14",
        {
            "SYSTEM_NAME": "name",
            "SPONSORS": "sponsor",
            "FEMA_ACCREDITATION_RATING": "fema_rating",
            "FLOOD_SOURCES": "river",
        },
        "line",
        min_zoom=8,
        max_features=1000,
        simplify=True,
        refresh_s=WEEK,
    ),
    group="infra",
)
_add(
    "USACE National Levee Database (leveed areas)",
    name="leveed-areas",
    title="Areas behind levees",
    title_es="Zonas protegidas por diques",
    description=(
        "Land a levee system protects (USACE). Levees lower the risk of flooding; they "
        "don't remove it."
    ),
    category="info",
    view=View(
        f"{LEVEES}/16",
        {
            "SYSTEM_NAME": "name",
            "FEMA_ACCREDITATION_RATING": "fema_rating",
            "LEVEED_AREA_SQ_MI": "area_sqmi",
        },
        "polygon",
        min_zoom=8,
        max_features=1000,
        simplify=True,
        refresh_s=WEEK,
        post="fmt",
    ),
    group="hazards",
)
