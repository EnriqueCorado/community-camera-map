# California Camera Map

An interactive map of **legally-accessible public traffic cameras across
California**, with toggleable overlay layers. Cameras come from all 12 Caltrans
district CCTV feeds — ~3,400 in-service cameras statewide, each with a live HLS
video stream and a still image. An overlay layer maps ~22,000 crowdsourced
automated license plate readers (ALPR) from OpenStreetMap / DeFlock.

> Scope note: the camera feeds are **public roadway cameras published by the
> State of California**, and the ALPR layer is **public location data from
> OpenStreetMap**. This project does not access the private or law-enforcement
> ALPR *systems* themselves (Flock, Vigilant) — only their publicly-mapped
> locations. The camera *video* is Caltrans' own public stream.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **FastAPI** (Python 3.11+), httpx, pydantic | Async API; Python is the natural home for the planned image-recognition work |
| Frontend | **React + TypeScript + Vite** | Fast, strict, modern DX |
| Map | **MapLibre GL** + OpenStreetMap tiles | Open-source, no API key; native clustering keeps ~25k points smooth |
| Video | **hls.js** | Plays Caltrans `.m3u8` streams in every browser |

Monorepo: `backend/` and `frontend/` are independent and deploy separately.

**Performance:** both the camera (~3,400) and ALPR (~22,000) datasets render as
clustered MapLibre GeoJSON sources, not DOM markers. The ALPR layer is fetched
lazily the first time it's toggled on, so initial load stays light.

## Run it locally

Two terminals.

**1. Backend** (http://localhost:8000, docs at `/docs`):
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

**2. Frontend** (http://localhost:5173):
```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` → `localhost:8000`, so the browser uses a
single origin (no CORS) and the snapshot proxy is same-origin.

## Quality gates

```bash
# backend
cd backend && uv run ruff check . && uv run pytest -q
# frontend
cd frontend && npm run lint && npm run build
```

## API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{"status":"ok"}` |
| GET | `/api/cameras` | all cameras `{count, source, cameras[]}` |
| GET | `/api/cameras/{id}` | one camera |
| GET | `/api/cameras/{id}/snapshot` | proxied JPEG still (the future ML frame-grab hook) |

## Architecture

```
backend/app/
  core/config.py        env-driven settings (counties, TTL, CORS)
  cameras/
    caltrans.py         fetch + normalize the raw feed  (pure, unit-tested)
    schemas.py          public API models (decoupled from upstream JSON)
    service.py          TTL cache + county filter  ← the data-source SEAM
    router.py           thin HTTP layer
frontend/src/
  api/client.ts         typed fetch wrapper
  hooks/useCameras.ts   load inventory
  components/           MapView, Sidebar, CameraDetail, HlsPlayer
```

## Roadmap (the future states you asked for)

### 1. Database
`CameraService` is the only seam that needs to change.
- Add `database_url` to `core/config.py` (a stub is already noted there) and a
  `core/db.py` with an async SQLAlchemy engine/session.
- Add `cameras/models.py` (SQLAlchemy) + Alembic migrations.
- In `service._load()`, **upsert** normalized cameras into the DB instead of (or
  as well as) the in-memory dict; read queries then hit the DB.
- This lets you persist history: camera up/down status, relocation, and a log of
  snapshots over time.

Suggested first use of the DB: a `snapshots` table (camera_id, captured_at,
image path/blob) populated by a scheduled job hitting `fetch_snapshot`.

### 2. Image recognition
The snapshot proxy (`/api/cameras/{id}/snapshot`) is the integration point.
- Add a worker (FastAPI `BackgroundTasks`, or a separate process / Celery / arq)
  that periodically grabs frames via `CameraService.fetch_snapshot`.
- Run inference (e.g. OpenCV + a YOLO model via `ultralytics`) for vehicle or
  congestion counts. Keep the model in a `detection/` module behind an interface
  so it can run out-of-process or on a GPU box.
- Store results in the DB and expose a `/api/cameras/{id}/detections` endpoint;
  the frontend can then badge markers with live counts.

Keep inference **off the request path** — serve cached results, compute async.

## Data source & attribution

Caltrans District 10 CCTV: `https://cwwp2.dot.ca.gov/data/d10/cctv/cctvStatusD10.json`.
Map tiles © OpenStreetMap contributors. Camera imagery courtesy of Caltrans.

## Overlay catalog (verified endpoints, ready to wire)

Each becomes a toggleable layer. Add a static dataset by dropping a `.geojson`
in `backend/app/cameras/data/` and registering it in `app/layers/router.py`
(the frontend's layer panel is driven by `GET /api/layers`). Live/remote feeds
get a proxied/cached route in that same router; CORS-open ones can be fetched
straight from the browser.

### Shipped
- **Traffic cameras** — Caltrans CCTV, all 12 districts. Live.
- **License plate readers (ALPR)** — OSM/DeFlock, 22,051 pts, vendor filter (Flock / Motorola-Vigilant / Other). Refresh via Overpass `surveillance:type=ALPR` over `area["name"="California"]` (use the `maps.mail.ru` mirror; send a User-Agent).

### Caltrans (same host/pattern as CCTV; keyless, CORS `*`)
- Changeable Message Signs — `.../data/d{dir}/cms/cmsStatusD{NN}.json`
- Lane Closure System — `.../data/d{dir}/lcs/lcsStatusD{NN}.json` (begin/end segments)
- Chain Control — `.../data/d{dir}/cc/ccStatusD{NN}.json`

### Live / environmental (keyless, GeoJSON, CORS `*` → browser-direct)
- NWS weather alerts — `https://api.weather.gov/alerts/active?area=CA` (needs User-Agent)
- Wildfire incidents — `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query?where=POOState='US-CA'&outFields=*&f=geojson`
- Wildfire perimeters — `.../WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?...&f=geojson`
- USGS earthquakes — `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
- Transit (Modesto Area Express) — `https://max.availtec.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition` (GTFS-RT protobuf)

### Needs backend proxy (no CORS)
- CAL FIRE active incidents — `https://incidents.fire.ca.gov/umbraco/api/IncidentApi/List?inactive=false`
- CHP CAD incidents — `https://cad.chp.ca.gov/` (per comm-center POST; Stanislaus = Stockton center)

### Stanislaus County GIS (ArcGIS org `EeYBJFxLdUojipYa`; keyless, `f=geojson`, CORS `*`)
Base: `https://services.arcgis.com/EeYBJFxLdUojipYa/arcgis/rest/services`
- City Limits — `/City_Limits_AGOL/FeatureServer/0`
- General Plan land use — `/General_Plan/FeatureServer/0`
- Zoning — `/Zoning_AGOL/FeatureServer/0`
- Supervisorial Districts — `/Supervisorial_Districts_AGOL/FeatureServer/8`
- Parks — `/Parks_Hosted/FeatureServer/0` · Schools (NCES) — `/Public_School_by_NCES/FeatureServer/0`
- Sphere of Influence — `/Sphere_of_Influence/FeatureServer/4` · Annexations (growth/LAFCO) — `/Annexations/FeatureServer/6`
- Assessor Parcels — `/Public_Assessor_Parcels/FeatureServer/0` (168k polygons — query by viewport bbox, never bulk-load)

### Census / demographics (choropleth)
- ACS 5-yr — `https://api.census.gov/data/2023/acs/acs5?get=NAME,B01003_001E,B19013_001E,B01002_001E&for=tract:*&in=state:06&in=county:099&key=KEY`
  - **Requires an API key since 2026-05-12** → proxy via backend to hide the key.
  - Oakdale place FIPS `0652694`; Stanislaus county `099`.
- Geometry to join — TIGERweb `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0` (`f=geojson`, join on GEOID)

> Permits/development: Stanislaus + Oakdale + Ceres share one Accela portal with
> no public data feed; the mappable proxy for growth is the **Annexations** layer.

## Overlay catalog — round 2 (verified 2026-10-13, ready to wire)

All keyless + CORS + `f=geojson` unless noted. ArcGIS: append
`/query?where=1=1&outFields=*&outSR=4326&f=geojson` (bbox-filter + page the big ones).

### Hazards & public safety
- FEMA flood zones (NFHL): `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28` (bbox-filter)
- CAL FIRE Fire Hazard Severity Zones — SRA: `https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/FHSZSRA_23_3/FeatureServer/0` ; LRA 2025: `.../FHSALRA25_v1_All/FeatureServer/0`
- CalEnviroScreen 4.0 (pollution burden, tracts): `https://services1.arcgis.com/PCHfdHz4GlDNAhBb/arcgis/rest/services/CalEnviroScreen_4_0_Results_/FeatureServer/0`
- CGS Quaternary faults: `https://gis.conservation.ca.gov/server/rest/services/CGS/FAM_QFaults/FeatureServer/0`
- EPA Superfund NPL: `https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Superfund_National_Priorities_List_(NPL)_Sites_with_Status_Information/FeatureServer/0`
- EPA ECHO facilities: 2-step (`echo_rest_services.get_facilities?p_st=CA&p_co=Stanislaus` → qid → `get_facility_info?output=GEOJSON&qid=`)
- DSOD dam-failure inundation (2020 snapshot): `https://gispublic.waterboards.ca.gov/portalserver/rest/services/Hosted/DamFailure_InnundationBoundaries_20200701/FeatureServer/0`
- USGS NWIS real-time streamflow (flood sentinel): `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=11290000&parameterCd=00060,00065` (Tuolumne R @ Modesto; WaterML-JSON, point sites)
- Caltrans D10 live ops (same pattern as CCTV): lane closures `/data/d10/lcs/lcsStatusD10.json`, message signs `/data/d10/cms/cmsStatusD10.json`, chain control `/data/d10/cc/ccStatusD10.json`

### Infrastructure & amenities (HIFLD / BTS / TIGERweb)
- Hospitals: `https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Hospitals_hifld/FeatureServer/0` (`where=COUNTY='STANISLAUS' AND STATE='CA'`)
- Law enforcement: `.../Local_Law_Enforcement_Locations_RAPT/FeatureServer/0`
- Cell towers: `.../Cellular_Towers_2026/FeatureServer/0` (`loccounty='STANISLAUS'`); substations `.../Electric_Substations/FeatureServer/0`; power plants `.../Power_Plants/FeatureServer/0`
- Airports (FAA/NTAD): `https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Aviation_Facilities/FeatureServer/0` (`COUNTY_NAME='STANISLAUS'`)
- Amtrak stations: `https://services2.arcgis.com/aIrBD8yn1TDTEXoz/ArcGIS/rest/services/Amtrak/FeatureServer/0` (`State='CA'`)
- Boundaries (TIGERweb): ZCTA `.../TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11`; congressional/legislative `.../TIGERweb/Legislative/MapServer/{0,1,2}`
- USACE National Inventory of Dams: `https://nid.sec.usace.army.mil/api/query?sy=@stateKey:CA` (JSON w/ lat/lon, not geojson)

### Needs a key → backend proxy (same pattern as Census)
AirNow, OpenAQ v3, EPA AQS, PurpleAir (air quality); FCC Broadband Map; NREL EV chargers (keyed, and egress-blocked from the research sandbox — verify from a normal network).

### No public API (manual / not map-ready)
- Traffic collisions (UC Berkeley TIMS/SWITRS): free GeoJSON export but **web UI only, no REST** — pull per-year extracts, host as a static layer.
- Local crime (Modesto PD / Sheriff): only via vendor portals (CrimeMapping/Community Crime Map) whose ToS forbids scraping. FBI Crime Data Explorer API is annual aggregates, not points.
- CHP CAD incidents: HTML only, no sanctioned JSON API.

## Deploying (free, static — GitHub Pages)

The public site is a **static build with no backend**: `backend/scripts/bake.py`
runs the same camera/layer services once and writes everything the map needs to
`frontend/public/data/` (`cameras.json`, `layers.json`, `layers/<name>.geojson`,
`meta.json`). The frontend built with `VITE_STATIC=1` reads those files instead of
`/api/...`. API keys (Census, AirNow) are used **only at bake time** and never ship.

Refresh the data and redeploy:
```bash
cd backend && uv run python scripts/bake.py      # re-bake data (uses backend/.env keys)
cd .. && git add frontend/public/data && git commit -m "Refresh data" && git push
```
Pushing to `main` triggers `.github/workflows/pages.yml`, which builds with
`VITE_STATIC=1 VITE_BASE=/stanislaus-cam-map/` and publishes to GitHub Pages.

Static-site smoke tests (against any served build):
```bash
cd e2e && STATIC_URL=https://<user>.github.io/stanislaus-cam-map npx playwright test tests/static-smoke.spec.ts
```

Notes:
- Live layers (weather, quakes, wildfire, river gauges, lane closures) are **as of the
  last bake** on the static site; the "Data as of" stamp in the sidebar shows when.
  Run the local backend for truly live data.
- maplibre v6's web worker is wired explicitly via `setWorkerUrl` in `src/main.tsx`
  (its default resolution 404s in production builds).
