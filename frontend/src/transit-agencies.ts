// Transit agencies whose official real-time vehicle positions are keyless AND
// readable from a browser on another site (CORS), so the `transit-vehicles`
// layer can poll them directly. Only the agencies whose service area overlaps
// the view are polled, each no faster than its own minimum interval, with
// back-off on errors (see live-sources.ts). Pure data + helpers: unit-tested.
//
// Vehicle positions only: nothing about riders (no occupancy, no plates).
// Checked 2026-10-21 from the MobilityData catalog (no-auth "vp" feeds) plus
// each agency's developer page. Feeds that are keyless but send no CORS header
// are listed in TRANSIT_NEEDS_RELAY (not polled; a relay isn't built).
import { decodeVehicles, type Feed } from "./gtfs-rt";

/** gtfs-rt: GTFS-realtime protobuf. mbta-v3: MBTA's JSON:API /vehicles.
 *  socrata-blob: a data.texas.gov file whose download redirect has no CORS
 *  header, so the current file id is read from the dataset metadata first. */
export type TransitFormat = "gtfs-rt" | "mbta-v3" | "socrata-blob";
type BBox = [number, number, number, number];

export interface TransitAgency {
  id: string;
  name: string;
  /** Service area [west, south, east, north] (padded a little). */
  bbox: BBox;
  url: string;
  format: TransitFormat;
  /** What most of its vehicles are; MBTA is refined per route. */
  mode: "bus" | "rail";
  /** Rider-facing website (popup link); its host is allow-listed for links. */
  site: string;
  attribution: string;
  /** Never poll faster than this (the agency's update rate / rate limit). */
  minIntervalS: number;
  /** false: the feed's route ids are internal numbers riders don't see. */
  routeIds?: boolean;
}

const PASSIO = (slug: string) => `https://passio3.com/${slug}/passioTransit/gtfs/realtime/vehiclePositions`;

export const TRANSIT_AGENCIES: TransitAgency[] = [
  {
    id: "mbta", name: "MBTA (Boston)", bbox: [-71.9, 41.55, -70.25, 42.85],
    // JSON:API; keyless use is allowed at 20 requests/min per client.
    url: "https://api-v3.mbta.com/vehicles?fields%5Bvehicle%5D=latitude,longitude,bearing,speed,label,updated_at",
    format: "mbta-v3", mode: "bus", site: "https://www.mbta.com/",
    attribution: "MBTA V3 API (Massachusetts Bay Transportation Authority; not endorsed by the MBTA)", minIntervalS: 30,
  },
  {
    id: "mta-lirr", name: "MTA Long Island Rail Road", bbox: [-74.05, 40.54, -71.9, 41.15],
    url: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr",
    format: "gtfs-rt", mode: "rail", site: "https://www.mta.info/",
    attribution: "MTA GTFS-realtime feeds (Metropolitan Transportation Authority)", minIntervalS: 30, routeIds: false,
  },
  {
    id: "mta-mnr", name: "MTA Metro-North Railroad", bbox: [-74.75, 40.7, -72.85, 41.85],
    url: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr",
    format: "gtfs-rt", mode: "rail", site: "https://www.mta.info/",
    attribution: "MTA GTFS-realtime feeds (Metropolitan Transportation Authority)", minIntervalS: 30, routeIds: false,
  },
  {
    id: "capmetro", name: "CapMetro (Austin)", bbox: [-98.04, 30.1, -97.32, 30.68],
    url: "https://data.texas.gov/api/views/eiei-9rpf.json",
    format: "socrata-blob", mode: "bus", site: "https://www.capmetro.org/",
    attribution: "CapMetro GTFS-realtime vehicle positions (Capital Metropolitan Transportation Authority, via data.texas.gov)", minIntervalS: 30,
  },
  {
    id: "metro-transit", name: "Metro Transit (Twin Cities)", bbox: [-94.16, 44.72, -92.8, 45.56],
    url: "https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb",
    format: "gtfs-rt", mode: "bus", site: "https://www.metrotransit.org/",
    attribution: "Metro Transit GTFS-realtime (Metropolitan Council, Minnesota)", minIntervalS: 20,
  },
  {
    id: "tarc", name: "TARC (Louisville)", bbox: [-85.95, 38.0, -85.45, 38.43],
    url: "https://tarc.rideralerts.com/InfoPoint/GTFS-realtime.ashx?Type=VehiclePosition",
    format: "gtfs-rt", mode: "bus", site: "https://www.ridetarc.org/",
    attribution: "TARC real-time feed (Transit Authority of River City)", minIntervalS: 20,
  },
  {
    id: "cobblinc", name: "CobbLinc (Cobb County, GA)", bbox: [-84.75, 33.7, -84.35, 34.1],
    url: "https://cobb.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition",
    format: "gtfs-rt", mode: "bus", site: "https://www.cobbcounty.gov/transportation/cobb-transit-service-cobblinc",
    attribution: "CobbLinc real-time feed (Cobb County Department of Transportation)", minIntervalS: 20,
  },
  {
    id: "montebello", name: "Montebello Bus Lines", bbox: [-118.32, 33.84, -117.95, 34.16],
    url: "https://mbl.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition",
    format: "gtfs-rt", mode: "bus", site: "https://www.montebellobus.com/",
    attribution: "Montebello Bus Lines real-time feed (City of Montebello)", minIntervalS: 20,
  },
  {
    id: "intercity", name: "Intercity Transit (Olympia)", bbox: [-123.03, 46.88, -122.43, 47.21],
    url: "https://its.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition",
    format: "gtfs-rt", mode: "bus", site: "https://www.intercitytransit.com/",
    attribution: "Intercity Transit real-time feed (Thurston County, WA)", minIntervalS: 20,
  },
  {
    id: "tcat", name: "TCAT (Ithaca)", bbox: [-76.73, 42.28, -76.23, 42.64],
    url: "https://realtimetcatbus.availtec.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition&serverid=0",
    format: "gtfs-rt", mode: "bus", site: "https://tcatbus.com/",
    attribution: "TCAT real-time feed (Tompkins Consolidated Area Transit)", minIntervalS: 20,
  },
  {
    id: "mcta", name: "Pocono Pony (Monroe County, PA)", bbox: [-75.48, 40.93, -75.1, 41.27],
    url: "https://ponytracker.availtec.com/InfoPoint/gtfs-realtime.ashx?type=vehicleposition",
    format: "gtfs-rt", mode: "bus", site: "https://www.gomcta.com/",
    attribution: "Monroe County Transportation Authority real-time feed", minIntervalS: 20,
  },
  {
    id: "votran", name: "Votran (Volusia County, FL)", bbox: [-81.56, 28.8, -80.8, 29.44],
    url: "https://realtimevotran.availtec.com/infopoint/GTFS-Realtime.ashx?Type=VehiclePosition",
    format: "gtfs-rt", mode: "bus", site: "https://www.votran.org/",
    attribution: "Votran real-time feed (County of Volusia)", minIntervalS: 20,
  },
  {
    id: "clovis", name: "Clovis Transit", bbox: [-119.82, 36.74, -119.58, 36.92],
    url: PASSIO("clovis"), format: "gtfs-rt", mode: "bus", site: "https://www.clovisca.gov/",
    attribution: "Clovis Transit real-time feed (City of Clovis, via Passio)", minIntervalS: 20, routeIds: false,
  },
  {
    id: "via-boulder", name: "Via Mobility (Boulder)", bbox: [-105.65, 39.88, -105.12, 40.11],
    url: PASSIO("viaboulder"), format: "gtfs-rt", mode: "bus", site: "https://viacolorado.org/",
    attribution: "Via Mobility Services real-time feed (via Passio)", minIntervalS: 20, routeIds: false,
  },
  {
    id: "towson", name: "Towson Loop", bbox: [-76.68, 39.34, -76.47, 39.46],
    url: PASSIO("towson"), format: "gtfs-rt", mode: "bus", site: "https://www.baltimorecountymd.gov/",
    attribution: "Towson Loop real-time feed (Baltimore County, via Passio)", minIntervalS: 20, routeIds: false,
  },
  {
    id: "cecil", name: "Cecil Transit", bbox: [-76.13, 39.5, -75.69, 39.73],
    url: PASSIO("cecil"), format: "gtfs-rt", mode: "bus", site: "https://www.cecilcountymd.gov/",
    attribution: "Cecil Transit real-time feed (Cecil County, MD, via Passio)", minIntervalS: 20, routeIds: false,
  },
  {
    id: "frederick", name: "TransIT (Frederick County, MD)", bbox: [-77.72, 39.22, -77.26, 39.76],
    url: PASSIO("frederick"), format: "gtfs-rt", mode: "bus", site: "https://www.frederickcountymd.gov/105/Transit-Services",
    attribution: "Frederick County TransIT real-time feed (via Passio)", minIntervalS: 20, routeIds: false,
  },
  {
    id: "transpo", name: "Transpo (South Bend)", bbox: [-86.45, 41.58, -86.05, 41.78],
    url: PASSIO("transpo"), format: "gtfs-rt", mode: "bus", site: "https://www.sbtranspo.com/",
    attribution: "South Bend Public Transportation Corporation real-time feed (via Passio)", minIntervalS: 20, routeIds: false,
  },
  {
    id: "sandy", name: "Sandy Area Metro", bbox: [-122.48, 45.23, -121.65, 45.56],
    url: PASSIO("sandyor"), format: "gtfs-rt", mode: "bus", site: "https://www.ci.sandy.or.us/",
    attribution: "Sandy Area Metro real-time feed (City of Sandy, OR, via Passio)", minIntervalS: 20, routeIds: false,
  },
  {
    id: "clackco", name: "Clackamas County Connects", bbox: [-122.75, 45.2, -122.3, 45.5],
    url: PASSIO("clackamas"), format: "gtfs-rt", mode: "bus", site: "https://www.clackamas.us/",
    attribution: "Clackamas County Connects real-time feed (via Passio)", minIntervalS: 20, routeIds: false,
  },
  {
    id: "spirit-bus", name: "Spirit Bus (Monterey Park)", bbox: [-118.22, 33.99, -118.06, 34.12],
    url: PASSIO("montereyp"), format: "gtfs-rt", mode: "bus", site: "https://www.montereypark.ca.gov/",
    attribution: "Spirit Bus real-time feed (City of Monterey Park, via Passio)", minIntervalS: 20, routeIds: false,
  },
];

/** Keyless official feeds that send no CORS header (a browser on our site
 *  can't read them): they'd need a relay, which isn't built. Checked 2026-10-21. */
export const TRANSIT_NEEDS_RELAY: { name: string; url: string }[] = [
  { name: "MBTA GTFS-realtime (protobuf; the V3 JSON API above is used instead)", url: "https://cdn.mbta.com/realtime/VehiclePositions.pb" },
  { name: "RTD Denver", url: "https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.pb" },
  { name: "King County Metro", url: "https://s3.amazonaws.com/kcm-alerts-realtime-prod/vehiclepositions.pb" },
  { name: "Community Transit (Snohomish County)", url: "https://s3.amazonaws.com/commtrans-realtime-prod/vehiclepositions.pb" },
  { name: "MARTA (Atlanta)", url: "https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb" },
  { name: "Pittsburgh Regional Transit", url: "https://truetime.portauthority.org/gtfsrt-bus/vehicles" },
  { name: "Greater Cleveland RTA", url: "https://gtfs-rt.gcrta.vontascloud.com/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb" },
  { name: "Cincinnati Metro", url: "https://tmgtfsprd.sorttrpcloud.com/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb" },
  { name: "WeGo (Nashville)", url: "http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb" },
  { name: "Metro St. Louis", url: "https://www.metrostlouis.org/RealTimeData/StlRealTimeVehicles.pb" },
  { name: "Milwaukee County Transit System", url: "https://realtime.ridemcts.com/gtfsrt/vehicles" },
  { name: "Metro Transit (Madison)", url: "https://metromap.cityofmadison.com/gtfsrt/vehicles" },
  { name: "CTtransit", url: "https://cttprdtmgtfs.ctttrpcloud.com/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb" },
  { name: "Broward County Transit", url: "https://myride2.broward.org/gtfsrealtime/api/vehiclepositions" },
  { name: "SacRT (Sacramento)", url: "https://bustime.sacrt.com/gtfsrt/vehicles" },
  { name: "Riverside Transit Agency", url: "https://rtabus.com/gtfsrt/vehicles" },
  { name: "Big Blue Bus (Santa Monica)", url: "http://gtfs.bigbluebus.com/vehiclepositions.bin" },
  { name: "DART (Des Moines)", url: "https://www.ridedart.com/gtfs/real-time/vehicle-positions" },
  { name: "Duluth Transit", url: "https://duluthtransit.com/gtfsrt/Vehicle/VehiclePositions.pb" },
  { name: "Ben Franklin Transit", url: "https://myride.bft.org/Realtime/GTFS_VehiclePositions.pb" },
  { name: "Everett Transit", url: "https://everett.mapstrat.com/current/gtfrealtime_VehiclePositions.bin" },
  { name: "Valley Regional Transit (Boise)", url: "https://s3.amazonaws.com/etatransit.gtfs/valleyregionaltransit.etaspot.net/position_updates.pb" },
  { name: "MARC (Maryland Transit Administration)", url: "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc.pb" },
  { name: "Greater Portland Metro (Maine)", url: "https://gtfsrt.gptd.cadavl.com/ProfilGtfsRt2_0RSProducer-GPTD/VehiclePosition.pb" },
  { name: "Rogue Valley Transportation District", url: "https://gtfsrt.rvtd.cadavl.com/ProfilGtfsRt2_0RSProducer-RVTD/VehiclePosition.pb" },
  { name: "Emery Go-Round", url: "https://emerygoround.tripshot.com/v1/gtfs/realtime/feed/egr?types=VehiclePosition" },
  { name: "MVgo (Mountain View)", url: "https://mtma.tripshot.com/v1/gtfs/realtime/feed/mvgo?types=VehiclePosition" },
  { name: "Capital Area Transportation Authority (Lansing; http only)", url: "http://developers.cata.org/gtfsrt/vehicle/vehiclepositions.pb" },
  { name: "Springfield Mass Transit District (IL)", url: "https://ride.smtd.org/gtfsrt/vehicles" },
  { name: "NY Waterway", url: "https://nywaterway.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/vehicleposition" },
];

/** Hosts the transit popup may link to (each agency's own website). */
export const TRANSIT_SITE_HOSTS: string[] = [...new Set(TRANSIT_AGENCIES.map((a) => new URL(a.site).hostname))];

const intersects = (a: BBox, b: BBox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** The agencies whose service area overlaps the view, nearest first, at most
 *  `max` (a zoomed-in view rarely touches more than two or three). */
export function agenciesInView(view: BBox, list: TransitAgency[] = TRANSIT_AGENCIES, max = 6): TransitAgency[] {
  const cx = (view[0] + view[2]) / 2, cy = (view[1] + view[3]) / 2;
  const dist = (a: TransitAgency) => Math.hypot((a.bbox[0] + a.bbox[2]) / 2 - cx, (a.bbox[1] + a.bbox[3]) / 2 - cy);
  return list
    .filter((a) => intersects(view, a.bbox))
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, max);
}

export interface PollState {
  /** When the last request (good or bad) was made, ms. */
  at: number;
  /** Don't ask again before this time (rate limit / error back-off), ms. */
  until: number;
  failures: number;
  data: GeoJSON.Feature<GeoJSON.Point>[] | null;
  /** When `data` was fetched, ms. */
  dataAt: number;
}

/** Is a new request to this agency allowed now? */
export function shouldPoll(a: TransitAgency, s: PollState | undefined, now: number): boolean {
  // 1 s of slack so timer jitter doesn't push a 30 s agency to the next check.
  return !s || (now >= s.until && now - s.at >= a.minIntervalS * 1000 - 1000);
}

/** Back-off after a failed request: honor Retry-After (seconds) when given,
 *  else 1, 2, 4… minutes for 429/5xx (30 s for other failures), capped at 15. */
export function backoffUntil(now: number, failures: number, status: number | null, retryAfterS: number | null): number {
  const exp = Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, failures - 1));
  const base = status === 429 || (status != null && status >= 500) ? exp : Math.min(exp, 30_000 * failures);
  return now + Math.max(base, retryAfterS != null && retryAfterS > 0 ? Math.min(retryAfterS, 3600) * 1000 : 0);
}

/** Retry-After header -> seconds (number or HTTP date), or null. */
export function retryAfterSeconds(h: string | null, now = Date.now()): number | null {
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n)) return n;
  const t = Date.parse(h);
  return Number.isFinite(t) ? Math.max(0, (t - now) / 1000) : null;
}

/** data.texas.gov dataset metadata -> the current file's download URL. */
export function socrataBlobUrl(metaUrl: string, meta: unknown): string {
  const id = (meta as { blobId?: unknown } | null)?.blobId;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("no blob id");
  return metaUrl.replace(/\.json$/, `/files/${id}`);
}

const MBTA_RAIL = /^(Red|Orange|Blue|Green-[A-E]|Mattapan|CR-.+)$/;

/** Vehicles older than this (relative to the newest in the feed) are dropped:
 *  trains parked overnight can sit in a feed for hours. */
export const STALE_S = 10 * 60;
/** The largest US fleets run ~5,000 vehicles; more is a broken feed. */
export const MAX_VEHICLES = 5000;

/** MBTA V3 /vehicles JSON:API -> the same Vehicle shape as GTFS-realtime. */
export function parseMbtaVehicles(json: unknown): Feed {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error("unexpected MBTA feed format");
  const vehicles: Feed["vehicles"] = [];
  for (const d of data as Record<string, unknown>[]) {
    const a = (d?.attributes ?? {}) as Record<string, unknown>;
    const route = ((d?.relationships as { route?: { data?: { id?: unknown } } } | undefined)?.route?.data?.id) ?? "";
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const t = typeof a.updated_at === "string" ? Date.parse(a.updated_at) : NaN;
    vehicles.push({
      id: typeof d?.id === "string" ? d.id.slice(0, 64) : "",
      label: typeof a.label === "string" ? a.label.slice(0, 64) : "",
      route: typeof route === "string" ? route.slice(0, 64) : "",
      lat: n(a.latitude) ?? NaN,
      lon: n(a.longitude) ?? NaN,
      bearing: n(a.bearing),
      speed: n(a.speed),
      timestamp: Number.isFinite(t) ? Math.round(t / 1000) : null,
    });
  }
  return { timestamp: null, vehicles };
}

/** A whole feed frozen this long (an AVL outage serving its last snapshot)
 *  is dropped too; generous, so a visitor's skewed clock doesn't hide it. */
export const FROZEN_S = 30 * 60;

/** Decoded feed -> map points for one agency (positions only; stale, missing
 *  and 0,0 positions dropped). */
export function transitFeatures(feed: Feed, a: TransitAgency, nowS = Date.now() / 1000): GeoJSON.Feature<GeoJSON.Point>[] {
  let newest = feed.timestamp ?? 0;
  for (const v of feed.vehicles) newest = Math.max(newest, v.timestamp ?? 0);
  const out: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const v of feed.vehicles) {
    if (out.length >= MAX_VEHICLES) break;
    const { lat, lon } = v;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;
    if (v.timestamp != null && (newest - v.timestamp > STALE_S || nowS - v.timestamp > FROZEN_S)) continue;
    const route = a.routeIds === false ? "" : v.route;
    const mode = a.format === "mbta-v3" ? (MBTA_RAIL.test(v.route) ? "rail" : "bus") : a.mode;
    const vehicle = v.label || v.id;
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5] },
      properties: {
        agency_id: a.id,
        mode,
        route: route.replace(/^CR-/, ""),
        vehicle,
        track: v.bearing != null && v.bearing >= 0 && v.bearing <= 360 ? Math.round(v.bearing) : null,
        speed_mph: v.speed != null && v.speed >= 0 && v.speed < 100 ? Math.round(v.speed * 2.237) : null,
        updated: v.timestamp != null ? v.timestamp * 1000 : null,
        label: route.replace(/^CR-/, "") || (mode === "rail" ? vehicle : ""),
      },
    });
  }
  return out;
}

/** Bytes -> features for a protobuf agency. */
export const gtfsFeatures = (buf: Uint8Array, a: TransitAgency) => transitFeatures(decodeVehicles(buf), a);
