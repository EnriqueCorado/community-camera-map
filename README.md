# Stanislaus Camera Map

**Live: https://enriquecorado.github.io/community-camera-map/** · English / Español

A free, public map of the cameras and civic data around Stanislaus County,
California, built so anyone can see what's watching the roads and what's
happening in their neighborhood:

- **Public cameras:** ~15,800 public cameras nationwide: ~3,400 Caltrans
  cameras statewide plus 15 other state DOTs, USGS volcano webcams and NOAA buoy
  cams (live video where the agency allows browser playback, stills elsewhere),
  plus ALERTCalifornia wildfire cameras and ~1,100 USGS river cameras across the US.
- **License-plate readers:** crowdsourced ALPR locations from OpenStreetMap /
  DeFlock (about 145,000 nationwide), with "what can see me?" coverage and, for
  Modesto, who can search the data (from public-records releases).
- **105 overlay layers:** flood and fire hazard zones, air quality, wildfire
  perimeters, river gauges, schools, transit, cooling centers, housing
  proposals, census data and more, refreshed throughout the day by GitHub
  Actions.

> Scope note: the camera feeds are **public roadway cameras published by the
> State of California**, and the ALPR layer is **public location data from
> OpenStreetMap**. This project does not access the private or law-enforcement
> ALPR *systems* themselves (Flock, Vigilant), only their publicly-mapped
> locations. No personal data is collected; the site is static and has no
> accounts or tracking (the free-help pages keep only anonymous per-page monthly
> counts; see "Usage counter").

## Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **FastAPI** (Python 3.11+), httpx, pydantic | Async API; Python is the natural home for the planned image-recognition work |
| Frontend | **React + TypeScript + Vite** | Fast, strict, modern DX |
| Map | **MapLibre GL** + OpenStreetMap tiles | Open-source, no API key; native clustering keeps ~25k points smooth |
| Video | **hls.js** | Plays Caltrans `.m3u8` streams in every browser |

Monorepo: `backend/` and `frontend/` are independent and deploy separately.

**Performance:** both the camera (~3,400) and ALPR (California: ~22,000; nationwide tiles: ~145,000) datasets render as
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
    national.py         other state DOTs, USGS, NOAA, keyed 511 states: one
                        fetch + pure parse_* per source, each isolated
    schemas.py          public API models (decoupled from upstream JSON)
    service.py          TTL cache + county filter  ← the data-source SEAM
    router.py           thin HTTP layer
frontend/src/
  api/client.ts         typed fetch wrapper
  hooks/useCameras.ts   load inventory
  components/           MapView, Sidebar, CameraDetail, HlsPlayer
```

## Roadmap

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

Caltrans CCTV, all 12 districts: `https://cwwp2.dot.ca.gov/data/d{1..12}/cctv/cctvStatusD{01..12}.json`.
Map tiles © OpenStreetMap contributors. Camera imagery courtesy of Caltrans.

### Camera sources (outside Caltrans)

All in `backend/app/cameras/national.py`, fetched concurrently with Caltrans; one
source failing never blanks the others (only the exception type is logged). Every
image/stream URL must be https on that source's own hosts (mirrored in
`frontend/src/popup-logic.ts` `CAMERA_MEDIA_HOSTS`; a test fails on drift). Video
plays in the browser only where the stream host sends `Access-Control-Allow-Origin: *`
(checked 2026-10-19); every other camera shows its still, refreshed each minute.
Counts are from the 2026-10-19 bake.

| Source | Endpoint | Cameras | Media |
|---|---|---|---|
| Illinois DOT (CC BY-SA 2.0, credit "Illinois DOT") | ArcGIS `TrafficCamerasTM_Public` | 3,726 | stills (incl. Lake County PASSAGE) |
| WSDOT | ArcGIS `TravelInfoCamerasWeather` | 1,631 | stills (ODOT-hosted border cams dropped) |
| OHGO / Ohio DOT (key) | `publicapi.ohgo.com/api/v1/cameras` | 1,116 | stills |
| DriveNC / NCDOT (Iteris key) | `/api/v2/get/cameras` | 1,025 | stills |
| SCDOT 511SC | Iteris ATIS CDN GeoJSON | 792 | still + HLS |
| MDOT MiDrive | `mdotjboss.state.mi.us/MiDrive/camera/list` (HTML in fields, parsed defensively) | 776 | stills |
| NVRoads / Nevada DOT (Iteris key) | `/api/v2/get/cameras` | 652 | stills |
| ALDOT ALGO Traffic | `api.algotraffic.com/v4.0/Cameras` (public cameras only) | 603 | still + HLS |
| MDOT SHA CHART | `getCameraMapDataJSON.do` | 486 | HLS |
| MoDOT Traveler | `StreamingCams2.json` (MoDOT stream hosts only) | 390 | HLS |
| DelDOT | `tmc.deldot.gov/json/videocamera.json` | 358 | HLS |
| KYTC | ArcGIS `trafficCamerasCur_Prd` (https stills only) | 242 | stills |
| SDDOT SD511 / MDT 511MT | Iteris ATIS CDN cameras + road-weather GeoJSON | 180 / 155 | stills, several views per site |
| 511 Alaska (Iteris key) | `/api/v2/get/cameras` | 129 | stills, several views per site |
| USGS volcano webcams | AVO ashcam API (frame within 7 days; FAA-owned cams skipped) | 91 | stills |
| NOAA NDBC BuoyCAMs | `www.ndbc.noaa.gov/buoycams.php` | 90 | stills |
| FL511 / Florida DOT, via FDEM (no license stated) | ArcGIS `FL511_Traffic_Cameras` (FDEM's republish) | 3,992 | stills (FDOT DIVAS) |
| ODOT TripCheck, via Oregon Emergency Management ("Public") | ArcGIS `TripCheck_Cameras` (OEM's daily republish) | 1,040 | stills, several views per site |
| Iowa DOT (CC BY 4.0) | ArcGIS `Traffic_Cameras_View` | 847 | stills, several views per site (HLS is on port 8888, so not used) |
| MnDOT (no license stated; MnDOT disclaimer) | IRIS `data.dot.state.mn.us/iris/camera_pub` (documented public JSON; published cameras only) | 1,539 | still + HLS (1,254); road-weather sites as several views |
| City of Austin TX (Public Domain) | Socrata `b4k4-adkb` (cameras turned on) | 823 | stills |
| City of Arlington TX (no license stated) | ArcGIS `Traffic_Camera_Updates_view` (retired dropped, offline hidden) | 79 | stills |
| City of Lawrence KS (city public-record disclaimer) | ArcGIS `Traffic_Cameras/FeatureServer/4` (in service) | 74 | stills |

The last seven (Iowa, FL, OR: 2026-10-21 bake; MN and the three cities:
2026-10-23) give way to an earlier source's camera at the same spot (coordinates
rounded to 4 decimals), so a camera is never listed twice. CDOT's ArcGIS cameras
were removed (that server is labelled "development and testing"). Skipped on
purpose: TripCheck's own `cctvinventory.js` and NYC DOT's
`webcams.nyctmc.org/api/cameras` (undocumented web-app endpoints; the official
TripCheck and 511NY APIs need keys), and NDDOT's `cameras.json` (its Web Map
Services page says the files are "not to be consumed directly in any
public-facing application" and bars compiling them without written consent).

Researched 2026-10-23 and not added (need a key, an account or permission):
511NY, PennDOT/511PA, VDOT SmarterRoads, TDOT, COtrip, Castle Rock CARS feeds
(Indiana, Nebraska, Kansas), CTDOT (written consent), MassDOT and DDOT (both via
TrafficLand), MDOT Mississippi and IDrive Arkansas (terms forbid it). New England
Compass (NH/VT/ME) is keyless and allows redistribution, but its stills come as
base64 inside the XML, with no image URL to show.

USGS HIVIS river cameras (~1,140, nationwide) stay a separate overlay layer
(`river-cameras`). The static site's camera list (`frontend/public/data/cameras/`,
`backend/app/cameras/static_split.py`) is split so a visit loads little: every
visit loads only `index.json` (each camera's position to ~10 m, delta-coded and
grouped into 2-degree grid cells: ~190 kB, ~78 kB gzipped for 26.7k cameras,
vs ~6 MB / ~0.86 MB for the old one-file list), enough to cluster every camera
and show the counts; `search.json` (names, places, roads, states: ~270 kB
gzipped) loads when a search starts; `cells/<lat>_<lon>.json` (full records,
short keys, defaults dropped) loads when a camera there is opened or the cell is
in view up close (Modesto's cell: ~23 kB gzipped). All three carry a layout
version so files from two hourly deploys are never mixed up
(`frontend/src/camera-store.ts`). The dev API still serves the whole list at
`/api/cameras`. Rebuild just the list with `cd backend && uv run python scripts/bake.py --cameras-only`
(the Pages workflow's hourly `cameras` job does this with the keys below).

**Keyed sources.** Free per-state keys, used only server-side / at bake time
(see `backend/.env.example`; GitHub secrets `ITERIS_KEY_<ST>` and `OHGO_API_KEY`):
Iteris 511 for GA, WI, NV, NC, UT, AK, LA, ID, AZ (`CAM_ITERIS_KEY_<ST>`, one call per
state per hourly bake: the limit is 10 calls / 60 s per key; only the documented
`/api/v2/get/cameras` is used, never the robots-disallowed `/map/map*/` internals)
and OHGO (`CAM_OHGO_API_KEY`, sent as an `Authorization` header). A state whose key
is missing or still pending approval is skipped quietly and starts working once
approved (as of 2026-10-19: NV, NC, AK and OH live; GA, WI, UT, LA, ID, AZ pending).

**TODO (not implemented, by design):**
- Not available: PennDOT 511PA and FL511 (no key path for us), CT (no camera
  endpoint), New England 511 (separate ne-compass portal).
- Free keys still to request: ODOT TripCheck (OR), 511NY, NPS webcams (link-out layer).
- Ask permission first (undocumented site internals): Castle Rock CARS 511 states
  (MN, IA, IN, KS, NE, MA), TxDOT ITS, NMDOT, ALERTWest western fire cameras,
  TDOT SmartWay.
- Hotlink-gated, don't use without written permission: FAA WeatherCams, ALERTWildfire.
- The site has no Content-Security-Policy yet; camera media is limited by the
  code allowlists above (one shared list in the browser; the snapshot proxy checks
  each camera's own source hosts and refuses non-public addresses). A CSP with
  `img-src` / `media-src` / `connect-src` from `CAMERA_MEDIA_HOSTS` is a follow-up.
- North Dakota DOT: the camera layer on `gis.dot.nd.gov` is blocked for all
  crawlers by its robots.txt (`Disallow: /`), so it's skipped. Lexington, KY
  (streams on an explicit `:1935` port) is skipped too.

Public webcams (popups load images straight from the operator's servers, so those servers see
the viewer's IP when a popup opens):

- **Wildfire cameras**: ALERTCalifornia | UC San Diego (live frames free for non-commercial
  use *with credit*; never crop the info bar, so images are letterboxed) and ALERTWildfire
  (link only, since its image host is http). The camera list comes from Cal OES's consolidated
  webcam layer.
- **River cameras**: USGS HIVIS (public domain), via `api.waterdata.usgs.gov/nims/cameras`.

Live & imagery layers:

- **Flights overhead**: ADS-B positions from [adsb.fi](https://adsb.fi) open data (non-commercial).
  We keep only callsign, type, altitude, speed and heading. Owner and registration are dropped.
- **Smoke & haze (experimental)**: `backend/app/layers/haze.py` scores how washed-out each
  ALERTCalifornia frame within 70 km of Modesto is (contrast in the frame's middle band). It
  can't tell smoke from fog or dust. It's refreshed hourly and gentle on their servers (one
  camera per site, at most 30).
- **Rain radar** ([RainViewer](https://www.rainviewer.com), free tier, tiles at zoom 7 and
  below) and **Satellite** (NASA GIBS VIIRS true color, previous day) are tiles the browser
  loads directly (`client_side` layers). There's no GeoJSON to bake.
- **Windy webcams** need a free key (see below). Free-tier image links expire after 10 min, so
  popups link to Windy's live view instead of showing a stale still.

**Browser-live layers** (`frontend/src/live-sources.ts`). These fetch straight from public,
CORS-enabled APIs in the visitor's browser, so they're real-time even on the static site:

| Layer | Source | Refresh |
|---|---|---|
| Space station (ISS), plus Kp and aurora odds | wheretheiss.at, NOAA SWPC | 5 s |
| Satellites overhead (about 150 brightest) | CelesTrak orbits, computed in the browser with satellite.js (SGP4, lazy-loaded) | positions every 2 s |
| Amtrak trains | Amtraker v3 | 60 s |
| Wildlife sightings | iNaturalist (open geoprivacy only; photos only when CC-licensed, with credit) | on map move, zoom 9 and in |
| Wikipedia places | MediaWiki geosearch (EN/ES) | on map move, zoom 10 and in |
| Temperature & wind (5×5 grid) | Open-Meteo | on map move |
| Air quality (US AQI, PM2.5, ozone; 5×5 grid) | Open-Meteo air-quality API | on map move |

Flight popups add **airline, origin and destination** from adsbdb.com, but only for airline
callsigns (e.g. `UAL366`). Private tail numbers are never looked up. **Satellite fire
detections** come from NASA FIRMS's public 24-hour VIIRS file and are refreshed hourly by CI.
Popups say plainly that a detection is not a confirmed fire.

**OpenStreetMap places** (defibrillators, drinking fountains, restrooms, EV chargers, libraries,
playgrounds, pharmacies, fire stations, free Wi-Fi, food banks, clinics, community centers, markets)
are fetched **server-side** for the Stanislaus region, falling back across three Overpass mirrors,
and refreshed daily in CI. Public Overpass servers rate-limit hard (about 2 requests per IP) and
only one allows browsers, so visitors never query Overpass directly. This also keeps their map view
private.

**More layers:**
- **Caltrans, statewide (12 districts):** road weather stations, chain controls, lane closures in
  effect now (scheduled ones are filtered out), and message signs. Caltrans' RWIS feed is invalid
  JSON with missing commas, so `parse_caltrans_json` repairs it.
- **Fire, hazards and infrastructure:** NIFC wildfire perimeters, CGS faults, EPA Superfund sites,
  and HIFLD power plants and substations.
- **Stanislaus County GIS:** cooling and warming centers (with today's hours), sandbag sites,
  emergency shelters, fire / elementary / high-school / mosquito districts, county islands, bridges,
  rivers and railroads.
- **Places and history:** NPS National Register historic places, HMdb historical markers (via
  Cal OES), and HCD mobile home parks.
- **Census (ACS 5-year), per tract:** % Spanish spoken at home, % born outside the US, % below the
  poverty line and % renters. These are extra choropleths that share the one Census download
  (`same_data_as`).

Checked and skipped: county evacuation zones (empty or stale; stale evacuation data could do harm),
the county "weather webcams" (they're Caltrans re-lists), the sheriff-flights layer (last updated
11 months ago), and crop fields (274k polygons).

**Nationwide.** 47 layers work anywhere in the US. Each nationwide layer has a `View` spec in
the backend registry (a national ArcGIS service, a field allowlist and a minimum zoom), published
in `layers.json`. The browser loads the area on screen straight from that service
(`frontend/src/view-sources.ts`). Inside the home county, and when zoomed out, it uses the
baked copy. Other nationwide sources:
- **OpenStreetMap places:** one union query to public Overpass servers per view, at city zoom
  (`osm-sources.ts`, best effort). EV chargers, libraries and clinics use official national lists
  instead.
- **Plate readers:** 145k readers from DeFlock's OpenStreetMap export, cut into 5° tiles plus an
  overview by `backend/scripts/build_alpr_usa.py`. The build runs daily in CI, is carried in the
  Actions cache (not committed) and refuses partial downloads.
- **Flights:** the relay's 3° grid cells.

Other live and daily sources added in this round:
- **StanRTA buses:** live, from StanRTA's real-time feed.
- **Wastewater virus levels:** CDC NWSS, placed at county centers, daily.
- **Weather alerts:** nationwide, from NOAA's watch, warning and advisory map.
- **Groundwater depth:** California DWR wells, read through the CNRA open-data SQL API, daily.
- **NOAA layers:** river gauges with flood status, storm reports from the last 24 hours, the SPC
  fire-weather outlook and the hourly smoke forecast. All are nationwide.
- **EPA AirNow monitors:** from EPA's public ArcGIS service, so the AirNow key is no longer needed.
- **USGS volcano alerts:** aviation color codes, refreshed hourly.
- **National Park Service unit boundaries.**
- **Quick views:** one-tap layer sets for wildfire, flooding, heat, health, commute and election
  day.

**Hazards, environment and water pack** (`backend/app/layers/national/hazards.py`, 28 layers,
all nationwide, nothing baked): USFS wildfire hazard potential, USGS landslide susceptibility,
NOAA sea-level rise (3 ft) and NHC storm surge (Category 3) as raster tiles; CDC/ATSDR
Environmental Justice Index, extreme heat days and Social Vulnerability Index; USGS/EPA radon
potential; USGS faults and landslide inventory; satellite fires (VIIRS, NOAA HMS) and HMS smoke
plumes; hurricane cones; FEMA disaster declarations, open shelters and recovery centers; EPA
ECHO violations, toxic releases, risk-plan chemical facilities and drinking-water violations; EPA
water-system service areas and brownfields; gas pipelines, nuclear plants and their 10/50-mile
rings; USACE levees and leveed areas. Streamflow, dams and shelters also load nationwide now
(USGS gauges, the NID, FEMA's shelter list). Browser cleanups for these live in
`frontend/src/view-posts-hazards.ts`.

Not yet nationwide, and why: **work zones** (USDOT WZDx: 26 keyless state feeds, most without
CORS, so it needs a CI bake; deferred), **reservoir storage** and **groundwater** (USBR RISE /
USACE CWMS and the USGS OGC API need a bake or a new loader kind), **power outages**, **road
weather / chain controls / message signs**, **cooling centers, sandbags, mosquito and fire
districts**, and **tsunami zones** (no public national source).

The plate-reader seed lives on the `alpr-data` branch. Reseed it from a machine that DeFlock's CDN
allows, by running `build_alpr_usa.py` and committing the output there.

Layers without a national source show "California only" or "Stanislaus County only" when you
look elsewhere.

**What's near an address?** Searches with OpenStreetMap Nominatim (cached, at most 1 request a
second), then asks the national services about that point: city, ZIP, districts, flood and fire
zones, drought, heat risk, tract income, poverty and health, and the nearest services. Each
service gets only the precision its question needs, and the address is never put in the page link.

**History.** A daily job snapshots quakes, fires, smoke, outages and alerts to the `history`
branch (90 days; flights are never archived). The job that writes to the repo runs no project
code. Every build copies the branch in for the History slider.

**Real-time flights on the public site** come from `relay/`, a small Vercel Function (free Hobby
plan), because GitHub Pages can't call adsb.fi directly (no CORS). `GET /api/flights` returns
privacy-filtered GeoJSON: the same filter as the backend (no FAA LADD or PIA aircraft, no owner or
registration). Sources are adsb.fi, then adsb.lol. It runs on Vercel's Node.js runtime in `sfo1`
(AWS): both feeds refuse Cloudflare's network, which rules out Cloudflare Workers and Vercel's Edge
runtime. It protects the upstream:
- Vercel's CDN caches each good response for 10 s (`s-maxage`), so most requests never run the
  function;
- behind that, each instance reuses a result for 10 s and shares one in-flight request;
- a provider that answers 429 is skipped until its `Retry-After` passes; if every provider fails,
  the relay backs off and serves the last good data for up to 5 minutes;
- any query string, and anything but GET, is refused, so the cache can't be bypassed;
- CORS allows only this site (so a local `vite preview` build with `VITE_FLIGHTS_URL` set falls
  back to the snapshot).

The map polls the relay every 15 s and glides planes between updates. If the relay is down, it
falls back to the 15-minute snapshot. Visitors' browsers contact Vercel for this.

```bash
cd relay && npm ci && vercel login && npm run deploy   # project: stanislaus-flights
gh variable set FLIGHTS_RELAY_URL --body "https://stanislaus-flights.vercel.app/api/flights"
```

**Corrections mail** (`relay/src/inbound.ts`, `relay/api/inbound.ts`): the "See something wrong? Tell
us" links (`help/report.ts`) and the partners page write to the corrections address. Resend receives
mail for the domain and POSTs a signed `email.received` notice to `/api/inbound`; the relay checks the
Svix signature (5-minute window), fetches the message from Resend and sends a copy to the volunteer
(`FORWARD_TO`, kept only in the Vercel project's environment) with Reply-To set to the sender.
The relay stores nothing and logs only error messages; Resend itself keeps the received messages and
attachments (Emails → Receiving). Mail whose sender fails DMARC is marked `[UNVERIFIED SENDER]`, sent as
text only and without Reply-To; auto-replies aren't forwarded. Optional `FORWARD_FOR` limits it to listed
addresses. Replying from the forwarded copy reveals the volunteer's own address to the sender.
Environment (Production): `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `FORWARD_TO`, `FORWARD_FROM`.

**Usage counter** (`relay/src/counter.ts`, `relay/api/count.ts`; browser side in `help/count.ts` and
`landing/client.js`): how many times each free-help page or tool was opened, per month, for partners
and grant applications. It counts uses, not people.
- *Stored:* one number per event per UTC month, in Upstash Redis (hash `count:<YYYY-MM>`, field
  `page:<tool id>:<lang>` or `app:<tab>/<view>:<lang>`). Nothing else: no IP address, user agent,
  referrer, cookie, ID or exact time. Our code reads only the event, Origin, DNT, Sec-GPC and
  User-Agent (to drop bots and our own headless test runs) and logs only storage errors.
- *Sent:* `POST /api/count` with the event as a short text body (never in the URL, which request
  logs keep), `credentials: "omit"` and no referrer, once per page view or tool (per page load),
  never retried. It's a CORS "simple" request (no preflight), so browsers send the real Origin. Browsers with Do Not Track or Global Privacy
  Control send nothing, and the server ignores those headers' requests too.
- *Fixed list:* the server accepts only the events in `EVENTS`, so nothing else can ride along.
  `e2e/tests/unit-counter.spec.ts` fails when a new tool or view isn't in the list: add it there and
  redeploy the relay.
- *Vercel* (which runs it) keeps its own request logs, with IP address and browser, for 1 hour on the
  Hobby plan, the same as for the flights relay. They show only `POST /api/count`, not which tool.
  **Never add a log drain to this project**, and keep the plan's log retention short.
- *Abuse:* the counts are unverified (anyone can send allowed events); say so wherever totals are
  shown. The firewall rule below limits each visitor; a per-instance cap (600 a minute) is only a
  backstop. The pages and the panel say counting happens, in
  English and Spanish, only when it's on.
- *Totals:* `GET /api/count` returns the last 24 months as JSON (cached 1 hour), e.g. for the partners
  page. To show a number there without a visitor request, read it at build time.
- *Off by default:* with no `COUNTER_URL` repo variable the build has no counter, and the pages' CSP
  allows no connections at all.
- *On since 2026-10-22:* storage is the free Upstash Redis store `community-counter` (sfo1), connected
  to `stanislaus-flights` in Production; `COUNTER_URL` = `https://stanislaus-flights.vercel.app/api/count`.
  To turn it off: `gh variable delete COUNTER_URL`, then rebuild.

Set it up (once):
1. Vercel dashboard → project `stanislaus-flights` → Storage → Create Database → Upstash for Redis,
   **Free** plan (500K commands a month; going over stops counting instead of billing), region
   closest to `sfo1`, connected to Production. That adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`
   (or `UPSTASH_REDIS_REST_*`; either works).
2. Vercel → Firewall → rate-limit rule: path equals `/api/count`, 20 requests per 60 s, key IP,
   action Deny (the platform applies it; our code never sees IPs). Hobby allows **one** rate-limit
   rule per project: if the flights relay already has one, add `/api/count` to it as a second
   condition group (OR) rather than replacing it.
3. Deploy and point the site at it:
```bash
cd relay && npm ci && vercel login && npm run deploy   # project: stanislaus-flights
gh variable set COUNTER_URL --body "https://stanislaus-flights.vercel.app/api/count"
```
4. Check: `curl -s https://stanislaus-flights.vercel.app/api/count` (totals JSON) after the next
   Pages build. To turn it off, delete the `COUNTER_URL` variable (pages stop counting on the next build).

**Keeping the public site live:** `.github/workflows/pages.yml` runs every 15 minutes. It calls
`backend/scripts/refresh_live.py`, which re-fetches the keyless live layers (flights, fires,
quakes, alerts, closures, signs, gauges; plus haze and webcam lists hourly) and then rebuilds
and deploys. A layer whose fetch fails keeps its last committed file. Nothing is committed back.

**Windy key (optional):** create a free account and key at https://api.windy.com/keys (choose
"Webcams API"). Then:

```bash
echo 'CAM_WINDY_API_KEY=<key>' >> backend/.env          # local dev
gh secret set WINDY_API_KEY                             # public site (prompts for the value)
```

Sources checked and **not** usable: Modesto's ~50 city traffic cameras (police real-time crime
center only), red-light cameras, FAA WeatherCams (API needs credentials), Windy webcams (needs a
key; its Modesto entries mirror Caltrans). Unsecured private IP cameras (Shodan/Insecam-style)
are deliberately excluded: viewing a camera its owner didn't publish isn't "public".

## Who can search each plate reader

Each plate-reader popup has a **Who can search it** section, and a *Sources & details* panel
with dated, linked public records. Two rules keep it honest:

- **Every claim has a source.** Profiles live in `backend/app/cameras/data/alpr_access.json`
  (EN/ES), and each fact carries a date and a source link. The data-integrity tests fail if
  a fact has no source.
- **Uncertainty is labeled.** `backend/app/layers/alpr_access.py` attributes each camera
  conservatively. It returns `tagged` when the OSM operator names it (this rule applies
  statewide), `inferred` when it's in Stanislaus County and both the vendor and the
  jurisdiction match a documented agency system (shown as "possible", not confirmed), and
  `network` for the shared county Epic iO network. Anything else stays **unknown**: we don't
  guess.

Regenerating:

```bash
cd backend
# 1. Profiles. Inputs are the spreadsheets from Modesto records request 26-1053
#    (cityofmodestoca.nextrequest.com/requests/26-1053). Keep them OUT of the repo:
#    the query audit lists officers' usernames and IPs. Only agency-level counts are kept.
uv run --with openpyxl python scripts/build_alpr_access.py \
    <sharing.xlsx> <external-queries.xlsx> app/cameras/data/alpr_access.json
# 2. Tag the ALPR layer (Overpass + county city limits). Re-run after refreshing alpr_ca.geojson.
uv run python scripts/enrich_alpr.py
# 3. Re-bake the static site (copies alpr_access.json to frontend/public/data/).
uv run python scripts/bake.py
```

## Free help tools (medical bills, renters, legal help)

A bilingual Help panel (sidebar "Free help", popups on hospital / mobile home park / legal-help
pins, or `#help=medical|rent|legal`). **Nothing typed is stored or sent:** the tools are pure
functions in `frontend/src/help/` running in the browser, nothing goes to localStorage or the URL
(only the open tab and tool do), and the only request is the static parcel file named after the street's
first two letters. `e2e/tests/help.spec.ts` checks this.

| Tool | Logic | Facts & sources |
|---|---|---|
| Hospital charity care | `help/fpl.ts` (`careResult`) | `help/hospitals.ts` (each policy as filed with HCAI), `MEDICAL_FACTS` |
| Rent cap, notice, coverage | `help/rent-cap.ts` | `RENT_FACTS` (Civ. Code §1947.12, §827; DIR CPI; AG chart) |
| "When was it built?" | `help/parcels.ts` | `frontend/public/data/parcels/` (county assessor roll) |
| Repair / deposit / hospital letters | `help/letters.ts` | cited inline |
| Legal help directory + layer | `help/legal-dir.ts` | `backend/app/layers/data/legal_help.json` |
| Unpaid wages (Work tab) | `help/wages.ts` | `help/wages-facts.ts` (Labor Code, IWC orders, DIR) |
| Heat at work (Work tab) | `help/heat.ts`, `heat-forecast.ts` | `help/heat-facts.ts` (8 CCR §3395/§3396); Open-Meteo for a fixed city list |
| Eviction-notice deadlines (Renters) | `help/court-days.ts`, `eviction.ts` | `help/eviction-facts.ts` (CCP §1161/§1167, 2026–27 court holidays) |
| Benefits screener | `help/benefits.ts` | `help/benefits-facts.ts` (CalFresh, WIC, Medi-Cal, CARE, MID/TID, LIHEAP, LifeLine, CalEITC…) |
| Medi-Cal work rules (2027), Benefits tab | `help/medi-cal-work.ts` | `help/medi-cal-work-facts.ts` (Pub. L. 119-21 §71119 / SSA §1902(xx), CMS-2454-IFC, DHCS ACWDL 25-30, SB 164, Stanislaus CSA) |
| Know your rights (Immigration tab) | `components/help/RightsTool.tsx` | `help/rights-facts.ts`, generated from the research archive by `~/dev/outreach-help-2026-10/make_rights.py` (ILRC, ACLU, CA Attorney General, courts, ice.gov; sources' own Spanish) |
| Citizenship test practice (Immigration tab) | `help/civics.ts` (stop rule 12 right / 9 wrong; 65/20: 6 / 5) | `help/civics-questions.ts`: USCIS 2025 list (M-1778), generated by `make_civics.py`, with official and unofficial-study Spanish; `help/civics-facts.ts` |
| DACA renewal timing (Immigration tab) | `help/daca.ts` (USCIS window 150–120 days before expiry; one-year rule after) | `help/daca-facts.ts`: USCIS DACA page, I-821D/I-765 instructions, DACA FAQ, G-1055 (10/16/26), I-131 advance parole alert; re-check monthly |
| Immigration court guide (Immigration tab, view `court`) | `help/court.ts` (`parseANumber`: 8 or 9 digits, any dashes; the number never leaves the device) | `help/court-facts.ts`: EOIR court list and notices (San Francisco closed Sept 4, 2026; Sacramento, Concord), EOIR self-help guides (EOIR-33, in absentia), USCIS AR-11, ILRC/AILA on expedited removal; reused reviewed rights facts by id; re-check monthly |
| Gas and electric bills (Benefits tab) | `help/benefits.ts` (`screenUtilities`: the screener's CARE, FERA, MID/TID CARES and LIHEAP rules) | `help/utilities-facts.ts`: PG&E Electric Rule 11 (Dec 2025), CPUC, AMP, Medical Baseline, MID, TID, CSD provider list (CVOC); re-check by `UTIL_RECHECK` |
| Free and low-cost clinics (Health care tab, view `clinics`) | `help/clinics.ts` (filter by town and need; closest 3 when a town has none) | `help/clinics-facts.ts`: HRSA health-center sites (Stanislaus), gvhc.org and lumirahealthcare.com location/payment pages, 42 CFR 51c.303, 45 CFR 92.201, Covered California, Stanislaus HSA/BHRS; re-check sites every 6 months |

Each tool opens directly with `#help=<tab>&hv=<tool>` (e.g. `#lang=es&help=rent&hv=eviction`).

**Public pages and flyers** (`frontend/src/landing/`): plain static pages, one per tool in English
(`/help/…`) and Spanish (`/ayuda/…`), plus bilingual printable flyers with QR codes
(`/help/flyers/…`, letter size). `npm run build` renders them after the app build
(`scripts/prerender.mjs`, React on the server) from the same facts files, so they never drift from
the tools. No scripts beyond the saved theme, the Print button and the page script, and no requests
beyond the page itself (and, when the usage counter is on, one anonymous count; the CSP allows
nothing else). `e2e/tests/help-pages.spec.ts` (run against `vite preview` or the live site) checks links,
hreflang, WCAG, phone width, that each QR code decodes to the live page, and that each flyer prints
on one page. Flyers avoid figures that change yearly, so printed copies stay correct.

**Other languages** (`landing/languages.ts`, `LangPages.tsx`, facts in `help/languages-facts.ts`): a page and a
flyer in **Punjabi** (`/help/punjabi/`) and **Dari** (`/help/dari/`, right to left), chosen from ACS and
school English-learner data (`~/dev/outreach-help-2026-10/research/languages.md`). They explain each tool and
link to its English and Spanish page, list only phone lines whose own sites state interpreter help, and link
ILRC's red cards in those languages. The legal facts themselves aren't translated. The pages are written with
AI help and say so, with a corrections email, until a native speaker reviews them (upkeep `languages-review`).
A tool added later shows its English name there until it is translated. Tests: `unit-languages`, `help-languages`.

**Offline and read aloud** (`frontend/src/landing/sw.js`, `client.js`):
- *Offline is opt-in.* Nothing is stored until someone taps "Save all pages" on `/help/` or `/ayuda/`. That
  registers a service worker for that folder only (never the map app). "Remove saved pages" deletes the copies and
  unregisters it.
- The worker is network-first. A saved copy is shown only offline, on a 5xx, or after 4 s, and with a "saved copy
  from <date>" banner. It is shown only if its bytes match the hash of the published page, which prerender embeds
  in `sw.js`, so a stale or planted copy is never served.
- *Shared files:* every page loads one stylesheet and one script, written per build as
  `help-assets/site.<hash>.css|js` (content-hashed names, Subresource Integrity). Saving stores them once per
  folder, verified by hash like the pages and served from the device first. That keeps "Save all" at about
  120 KB per folder instead of re-downloading about 8 KB of CSS and JS with every page. A visit after an update
  quietly re-saves the new pages and files.
- *Kill switch:* to turn offline off for everyone, publish `help/sw.js` and `ayuda/sw.js` containing only
  `self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.map(n => caches.delete(n)))).then(() => self.registration.unregister())));`.
- *Read aloud* uses only voices the browser reports as on-device (`localService`), so page text isn't sent to a
  cloud voice. If there's none, the button never appears.

**Yearly upkeep** (tests in `e2e/tests/unit-help.spec.ts` fail when these go stale):
- **By Aug 1:** add the next rent-cap period to `RENT_FACTS.periods` from DIR's April California
  CPI (published ~mid-June) and check it against https://oag.ca.gov/rentcaps ("All other counties").
- **Each January:** update `MEDICAL_FACTS.fpl` from the HHS poverty guidelines.
- Re-check hospital policies (HCAI), office phone numbers, and the Modesto/Riverbank mobile home rules.
- **Each January:** minimum wage (`MIN_WAGE`), court holidays for the next year (`court-days.ts`; dates past the
  table answer "call now"), tax-credit limits; on 2027-01-01 re-read Labor Code §226.7 (`LAB_226_7_RECHECK`) and
  the unlawful-detainer service rules (AB 747).
- **Medi-Cal work rules** (new; still settling): by `MCW_RECHECK` (2026-12-15) check the states' lawsuit
  (*Massachusetts v. Oz*), new DHCS county letters and when current members are first checked; by
  `MCW_IMMIGRANT_RECHECK` (2027-06-01) the state-funded Medi-Cal premium and the July 2027 changes. Research archive:
  `~/dev/outreach-help-2026-10/research/medi-cal-work.{json,md}` (local, not in git).
- **Know your rights**: re-check monthly (`RIGHTS_RECHECK`). Several items are in court (ICE's I-205 home-entry memo,
  SB 627/SB 805, AB 450 for private employers, the ICE locator). Confirm the Valley Watch hotline still answers.
  Edit `make_rights.py`, never `rights-facts.ts`; the research's "things NOT to say" list is in its header.
- **DACA**: re-check monthly (`DACA_RECHECK`): renewals/initial requests on uscis.gov/DACA, Judge Hanen's order in
  Texas v. United States, the June 2026 work-permit proposed rule (RIN 1615-AC98), G-1055 fees, the advance parole alert.
- **Citizenship test**: by `CIVICS_OFFICIALS_RECHECK` (2027-01-04) update today's officials (governor, Speaker, the new
  congressional districts) and USCIS's official Spanish name lists, then regenerate with `make_civics.py`.
- **Other languages**: by `LANGUAGES_REVIEW_BY` get a native-speaker review of the Punjabi and Dari pages (reviewers
  in the research note); re-check the interpreter lines and red-card links yearly.
- **Benefits tables** carry their own effective dates (CalFresh Oct 1, WIC Jul 1, CARE/LifeLine Jun 1, …); the
  unit tests fail when one lapses. Public charge rules changed 2026-09-18; keep that note current.
- A weekly GitHub Action (`help-links.yml`) checks every cited link and the AG rent-cap page and opens an issue.
- **Upkeep calendar:** `help/upkeep.ts` gathers every dated fact above (from the facts files themselves) into one
  list. `e2e/tests/unit-upkeep.spec.ts` fails when one is overdue, and the same weekly Action opens a checklist
  issue ("Help tools: facts to update soon") 45 days before anything is due. Run
  `UPKEEP_WINDOW=365 npx playwright test tests/unit-upkeep.spec.ts --reporter=line` to see the year ahead.
- Display settings (theme, larger text) live in `display.ts`; accessibility tests (`help*.spec.ts`) run axe
  WCAG 2.2 AA in light and dark, English and Spanish, plus keyboard-only, 320px and forced-colors checks.

```bash
cd backend && uv run python scripts/build_parcel_years.py    # re-bake year-built lookups
cd backend && uv run python scripts/refresh_live.py --only legal-help   # after editing legal_help.json
```

Not legal advice; the panel says so. Spanish was written alongside the English; a native-speaker
review is still welcome.

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
`frontend/public/data/` (`cameras/`, `layers.json`, `layers/<name>.geojson`,
`meta.json`). The frontend built with `VITE_STATIC=1` reads those files instead of
`/api/...`. API keys (Census) are used **only at bake time** and never ship.

Refresh the data and redeploy:
```bash
cd backend && uv run python scripts/bake.py      # re-bake data (uses backend/.env keys)
cd .. && git add frontend/public/data && git commit -m "Refresh data" && git push
```
Pushing to `main` triggers `.github/workflows/pages.yml`, which builds with
`VITE_STATIC=1 VITE_BASE=/community-camera-map/` and publishes to GitHub Pages.

Static-site smoke tests (against any served build):
```bash
cd e2e && STATIC_URL=https://<user>.github.io/community-camera-map npx playwright test tests/static-smoke.spec.ts
```

Notes:
- Live layers (weather, quakes, wildfire, river gauges, lane closures) are **as of the
  last bake** on the static site; the "Data as of" stamp in the sidebar shows when.
  Run the local backend for truly live data.
- maplibre v6's web worker is wired explicitly via `setWorkerUrl` in `src/main.tsx`
  (its default resolution 404s in production builds).

## License

Code: [MIT](LICENSE). Data belongs to its publishers and keeps their terms,
including: OpenStreetMap / DeFlock data is © OpenStreetMap contributors under the
[ODbL](https://opendatacommons.org/licenses/odbl/); ALERTCalifornia images are
free for non-commercial use with credit to "ALERTCalifornia | UC San Diego";
adsb.fi flight data is for non-commercial use; Illinois DOT camera data is
[CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) (credit "Illinois
DOT"; our reformatted copy in `data/cameras/` is shared under the same license);
Caltrans, USGS, NOAA, NWS, FEMA, EPA and Census data are U.S. or California public data. See "Data source &
attribution" above for the full list.
