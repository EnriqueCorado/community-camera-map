import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type { Camera } from "../types";

// maplibre v6 adds `features` to the event only through the layer-listener
// overload; name that shape for our click handlers.
type LayerMouseEvent = MapMouseEvent & {
  features?: Array<{ properties: Record<string, unknown> | null; geometry: GeoJSON.Geometry }>;
};
import { api, type LayerInfo } from "../api/client";
import { useI18n, layerTitle, ordinal, translateDirection, type Key, type TFn, type Lang } from "../i18n";
import { prefersReducedMotion } from "../motion";
import {
  floodRiskKey,
  freshImage,
  isMissing,
  LEGAL_SITE_HOSTS,
  safeUrl,
  tidy,
  WEBCAM_IMAGE_HOSTS,
  WEBCAM_PAGE_HOSTS,
} from "../popup-logic";
import { attribute, BASIS_KEY, describe, formatRecordDate, type AlprAccess, type Attribution } from "../alpr-access";
import { deadReckon, flightCells, gibsSatelliteUrl, mergeFlights, RAINVIEWER_URL, radarFrames } from "../live";
import { auroraChance, isAirlineCallsign, parseRoute, type FlightRoute } from "../live-parsers";
import { LIVE_SOURCES, type LiveCtx } from "../live-sources";
import { liveSourceFor } from "../view-sources";
import { HOME_BBOX, within, wrapLon } from "../view-logic";
import { HISTORY_LAYERS } from "../history";
import { ALPR_TILE_ZOOM, alprCells, alprIndex, alprNear, alprTile, evictAlprTile, mergeTiles, type AlprIndex } from "../alpr-tiles";
import { VOTING_KEYS } from "../colors";
import { helpFor } from "../help/popup-help";
import { LEGAL_COST_KEYS, LEGAL_KIND_KEYS } from "../help/legal-kinds";
import type { LegalKind, LegalOffice } from "../help/legal-dir";
import type { HelpTarget } from "../help/target";
import {
  CAM, ALPR_CLUSTER, VENDOR_COLORS, OVERLAY_COLOR, CENSUS_STOPS, ENVIRO_STOPS, CENSUS_FIELD, PCT_STOPS,
  HEALTH_STOPS, DROUGHT_COLORS, RESERVOIR_STOPS, VOTING_COLORS, OUTAGE_COLORS, WVAL_COLORS, WVAL_KEYS,
  GROUNDWATER_STOPS, GAUGE_COLORS, FIREWX_COLORS, GAUGE_KEYS, GAUGE_OTHER, FIREWX_KEYS, STORM_KINDS, VOLCANO_COLORS, VOLCANO_KEYS, VOLCANO_ALERT_KEYS, DEV_STAGES,
} from "../colors";

export interface LayerState {
  cameras: boolean;
  alpr: boolean;
  alprVendors: Record<string, boolean>;
  overlays: Record<string, boolean>;
}

interface Props {
  cameras: Camera[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  layers: LayerState;
  overlayInfos: LayerInfo[];
  query: string;
  flyTo: { center: [number, number]; zoom: number } | null;
  /** A past day (YYYY-MM-DD) to show for the history layers; null = live. */
  historyDate?: string | null;
  /** "What's near an address?" pin. */
  nearPoint?: { center: [number, number]; label: string } | null;
  initialView: { center: [number, number]; zoom: number } | null;
  onView: (v: { center: [number, number]; zoom: number }) => void;
  coverage: { active: boolean; radiusM: number };
  onCoverageResult: (hits: number | null) => void;
  /** Incremented to run "what can see me?" at the map center (keyboard path). */
  coverageCenterTick: number;
  /** Open the sourced "who can search this plate reader?" panel. */
  onAlprAccess: (a: Attribution) => void;
  /** Open the free Help tools from a popup (e.g. a hospital's charity care). */
  onHelp: (t: HelpTarget) => void;
}

/** Shared camera text filter — keep in sync with the Sidebar list. */
export function matchCamera(c: Camera, q: string): boolean {
  if (!q) return true;
  return `${c.name} ${c.nearby_place} ${c.county} ${c.route}`.toLowerCase().includes(q);
}


// OpenFreeMap "liberty" — a free, keyless, unmetered vector basemap (no API key,
// no watermark; OSM's own tiles rate-limit and CARTO's free tiles are watermarked).
// Its glyphs also provide the cluster-count label fonts.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
// Font the basemap's glyph set provides (used for cluster-count labels).
const LABEL_FONT = ["Noto Sans Bold"];

const CA_CENTER: [number, number] = [-119.4, 37.2];

function toFeatureCollection(cameras: Camera[], query: string): GeoJSON.FeatureCollection {
  const q = query.trim().toLowerCase();
  return {
    type: "FeatureCollection",
    features: cameras
      .filter((c) => matchCamera(c, q))
      .map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
        properties: { id: c.id, name: c.name },
      })),
  };
}

export function MapView({
  cameras,
  selectedId,
  onSelect,
  layers,
  overlayInfos,
  query,
  flyTo,
  nearPoint,
  historyDate = null,
  initialView,
  onView,
  coverage,
  onCoverageResult,
  coverageCenterTick,
  onAlprAccess,
  onHelp,
}: Props) {
  const { t, lang, locale } = useI18n();
  const i18nRef = useRef<I18nState>({ t, lang, locale });
  i18nRef.current = { t, lang, locale };
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  // A state mirror of readyRef so effects that may settle before the map's
  // "load" fires (e.g. an overlay auto-activated from a shared URL) re-run once
  // the map is ready.
  const [ready, setReady] = useState(false);
  const alprLoadedRef = useRef(false);
  const overlaysLoadedRef = useRef<Set<string>>(new Set());
  // History layers currently showing a past day: name -> that day.
  const historyShownRef = useRef<Map<string, string>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const coverageRef = useRef(coverage);
  coverageRef.current = coverage;
  const onCoverageResultRef = useRef(onCoverageResult);
  onCoverageResultRef.current = onCoverageResult;
  const alprDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const alprIndexRef = useRef<AlprIndex | null>(null);
  // Running browser-live layers -> their stop() functions.
  const liveRef = useRef(new Map<string, () => void>());
  const onAlprAccessRef = useRef(onAlprAccess);
  onAlprAccessRef.current = onAlprAccess;
  POPUP_HELP.open = onHelp;
  // "Who can search it" profiles, for synchronous popup rendering.
  const alprAccessRef = useRef<AlprAccess | null>(null);
  const warmAlprAccess = () =>
    void api.alprAccess().then(
      (a) => (alprAccessRef.current = a),
      () => {}, // popups degrade to the basis line; the next click retries
    );
  const initialViewRef = useRef(initialView); // read once at map creation
  // MapLibre needs WebGL 2. Without it the Map constructor throws, and an
  // uncaught throw here would blank the whole app, so check first and show a
  // message in the map area instead (the sidebar keeps working).
  const [glUnsupported, setGlUnsupported] = useState(() => !hasWebGL2());

  // --- Create the map + all sources/layers once. ---
  useEffect(() => {
    if (!containerRef.current || glUnsupported) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE,
        center: initialViewRef.current?.center ?? CA_CENTER,
        zoom: initialViewRef.current?.zoom ?? 5.4,
        attributionControl: { compact: true },
      });
    } catch (err) {
      // e.g. a GPU blocklist or a context that fails to create despite the check.
      console.warn("Map could not start:", err instanceof Error ? err.message : err);
      queueMicrotask(() => setGlUnsupported(true));
      return;
    }
    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __map?: maplibregl.Map }).__map = map; // e2e test handle
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Keep the GL canvas sized to its container. Without this, a container that
    // resizes after init (sidebar layout, tab, split view) leaves the map
    // rendering at a stale size so pans/zooms appear not to update.
    // resize() clears the WebGL canvas and normally repaints on the NEXT frame,
    // so the page behind it showed through (a black flash in dark mode) while
    // the panel animated. redraw() paints synchronously in the same frame.
    // (Guard on the style, not loaded(): that's false while tiles stream in,
    // which is exactly when the panel animates.)
    const ro = new ResizeObserver(() => {
      map.resize();
      if (map.isStyleLoaded()) map.redraw();
    });
    ro.observe(containerRef.current);

    map.on("load", () => {
      // Camera source (clustered).
      map.addSource("cameras", {
        type: "geojson",
        data: toFeatureCollection(cameras, queryRef.current),
        cluster: true,
        clusterRadius: 44,
        // Dissolve clusters by city zoom so individual cameras (and the
        // selected-camera highlight) are visible/clickable when you zoom in.
        clusterMaxZoom: 11,
      });
      map.addLayer({
        id: "cam-clusters",
        type: "circle",
        source: "cameras",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": CAM,
          "circle-opacity": 0.85,
          "circle-radius": ["step", ["get", "point_count"], 14, 25, 20, 100, 28],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      map.addLayer({
        id: "cam-cluster-count",
        type: "symbol",
        source: "cameras",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": LABEL_FONT,
          "text-size": 12,
        },
        paint: { "text-color": "#06231a" },
      });
      map.addLayer({
        id: "cam-points",
        type: "circle",
        source: "cameras",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": CAM,
          "circle-radius": 6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
        },
      });
      // Selected-camera highlight ring (filtered to the selected id).
      map.addLayer({
        id: "cam-selected",
        type: "circle",
        source: "cameras",
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-color": "#ffd23f",
          "circle-radius": 9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#06231a",
        },
      });

      // Interactions.
      map.on("click", "cam-clusters", (e: LayerMouseEvent) => zoomCluster(map, "cameras", e));
      map.on("click", "cam-points", (e: LayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRef.current(id);
      });
      for (const l of ["cam-clusters", "cam-points"]) {
        map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
      }

      // Coverage ("what can see me?") layers, drawn on top. Empty until used.
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      map.addSource("cov-radius", { type: "geojson", data: empty });
      map.addLayer({
        id: "cov-radius-fill",
        type: "fill",
        source: "cov-radius",
        paint: { "fill-color": "#ffd23f", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "cov-radius-line",
        type: "line",
        source: "cov-radius",
        paint: { "line-color": "#ffd23f", "line-width": 2 },
      });
      map.addSource("cov-hits", { type: "geojson", data: empty });
      map.addLayer({
        id: "cov-hits-dot",
        type: "circle",
        source: "cov-hits",
        paint: {
          "circle-color": "#ffd23f",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#06231a",
        },
      });
      map.addSource("cov-pin", { type: "geojson", data: empty });
      map.addLayer({
        id: "cov-pin-dot",
        type: "circle",
        source: "cov-pin",
        paint: { "circle-color": "#06231a", "circle-radius": 5, "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });

      map.on("moveend", () => {
        const c = map.getCenter();
        onViewRef.current({ center: [c.lng, c.lat], zoom: map.getZoom() });
      });
      map.on("click", (e) => {
        if (coverageRef.current.active) void runCoverage(map, e.lngLat, alprDataRef, coverageRef.current.radiusM, onCoverageResultRef.current);
      });

      readyRef.current = true;
      setReady(true);
      applyVisibility(map, layersRef.current);
    });

    return () => {
      ro.disconnect();
      for (const p of [...OPEN_POPUPS]) p.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
      setReady(false);
      alprLoadedRef.current = false;
      overlaysLoadedRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep latest layer state + query for the load handler without re-creating the map.
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const queryRef = useRef(query);
  queryRef.current = query;

  // --- Push camera data updates into the source (also on filter change, so the
  // filter applies across the whole map and persists as you pan/zoom). ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("cameras") as GeoJSONSource | undefined;
    src?.setData(toFeatureCollection(cameras, query));
  }, [cameras, query]);

  // --- Lazy-load the ALPR layer the first time it's switched on. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    if (layers.alpr && !alprLoadedRef.current) {
      alprLoadedRef.current = true;
      warmAlprAccess();

      // Nationwide tiles when published (data/alpr/), else the California file.
      alprIndex()
        .then(async (index) => {
          alprIndexRef.current = index;
          if (alprIndexRef.current) return EMPTY_FC; // tiles load for the view below
          const r = await fetch(api.layerUrl("alpr"));
          if (!r.ok) throw new Error(String(r.status));
          return (await r.json()) as GeoJSON.FeatureCollection;
        })
        .then((data: GeoJSON.FeatureCollection) => {
          if (!mapRef.current) return;
          alprDataRef.current = data; // share with "what can see me?" to avoid a 2nd fetch
          map.addSource("alpr", {
            type: "geojson",
            data,
            cluster: true,
            clusterRadius: 50,
            clusterMaxZoom: 14,
          });
          // Insert ALPR beneath the camera layers so traffic-camera dots always
          // stay on top and clickable.
          const underCameras = map.getLayer("cam-clusters") ? "cam-clusters" : undefined;
          map.addLayer(
            {
              id: "alpr-clusters",
              type: "circle",
              source: "alpr",
              filter: ["has", "point_count"],
              paint: {
                "circle-color": ALPR_CLUSTER,
                "circle-opacity": 0.8,
                "circle-radius": ["step", ["get", "point_count"], 13, 50, 19, 500, 27],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#fff",
              },
            },
            underCameras,
          );
          map.addLayer(
            {
              id: "alpr-cluster-count",
              type: "symbol",
              source: "alpr",
              filter: ["has", "point_count"],
              layout: {
                "text-field": ["get", "point_count_abbreviated"],
                "text-font": LABEL_FONT,
                "text-size": 12,
              },
              paint: { "text-color": "#fff" },
            },
            underCameras,
          );
          map.addLayer(
            {
              id: "alpr-points",
              type: "circle",
              source: "alpr",
              filter: ["!", ["has", "point_count"]],
              paint: {
                "circle-color": [
                  "match",
                  ["get", "vendor"],
                  "Flock Safety", VENDOR_COLORS.flock,
                  "Motorola / Vigilant", VENDOR_COLORS.motorola,
                  VENDOR_COLORS.other,
                ],
                "circle-radius": 5,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#fff",
              },
            },
            underCameras,
          );
          map.on("click", "alpr-clusters", (e: LayerMouseEvent) => zoomCluster(map, "alpr", e));
          map.on("click", "alpr-points", (e: LayerMouseEvent) => {
            const p = e.features?.[0]?.properties ?? {};
            // Render from whatever's loaded — never wait on the network here.
            // If it isn't loaded yet (or failed), the section shows its basis
            // line and we retry in the background for the next click.
            const access = alprAccessRef.current;
            if (!access) warmAlprAccess();
            const attr = attribute(p, access);
            const { t: tt, lang: lng, locale: loc } = i18nRef.current;
            const vendor = String(p.vendor ?? "");
            const vendorColor =
              vendor === "Flock Safety"
                ? VENDOR_COLORS.flock
                : vendor === "Motorola / Vigilant"
                  ? VENDOR_COLORS.motorola
                  : VENDOR_COLORS.other;
            openPopup(
              map,
              e.lngLat,
              popupHtml({
                kind: tt("alprCamera"),
                color: vendorColor,
                title: vendor === "Other / unknown" || !vendor ? tt("vendorOtherUnknown") : vendor,
                rows: [
                  [tt("rowFacing"), facing(p.direction, tt)],
                  ["OpenStreetMap", p.osm_id != null ? `#${p.osm_id}` : ""],
                ],
                section: accessSection(attr, access, tt, lng, loc),
              }),
              tt,
              () => onAlprAccessRef.current(attr),
            );
          });
          for (const l of ["alpr-clusters", "alpr-points"]) {
            map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
          }
          if (alprIndexRef.current) addAlprTiles(map, alprIndexRef.current, alprDataRef, underCameras);
          applyVisibility(map, layersRef.current);
        })
        .catch(() => {
          alprLoadedRef.current = false; // allow a retry on next toggle
        });
    }
  }, [layers.alpr, ready]);

  // --- Apply visibility + ALPR vendor filter whenever toggles change. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    applyVisibility(map, layers);
  }, [layers]);

  // --- Overlay layers (boundaries / land use / census): lazy-load on first
  // toggle-on, then just flip visibility. Driven by the server's layer list. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    for (const info of overlayInfos) {
      if (info.name === "alpr") continue; // ALPR has its own clustered handling
      if (info.name === "rain-radar") continue; // animated: its own effect below
      if (historyDate && HISTORY_LAYERS.has(info.name)) {
        // A past day: stop any live loader and show that day's snapshot.
        const on = layers.overlays[info.name] ?? false;
        liveRef.current.get(info.name)?.();
        liveRef.current.delete(info.name);
        if (on && historyShownRef.current.get(info.name) !== historyDate) {
          const day = historyDate;
          historyShownRef.current.set(info.name, day);
          fetch(api.historyUrl(day, info.name))
            .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : EMPTY_FC)) // no snapshot that day
            .catch(() => EMPTY_FC)
            .then((data) => {
              if (!mapRef.current || historyShownRef.current.get(info.name) !== day) return;
              const s = map.getSource(`ov-${info.name}`) as GeoJSONSource | undefined;
              if (s) s.setData(data);
              else addOverlay(map, info, data, () => i18nRef.current);
              setOverlayVisible(map, info.name, layersRef.current.overlays[info.name] ?? false);
            });
        } else setOverlayVisible(map, info.name, on);
        continue;
      }
      if (historyShownRef.current.has(info.name)) {
        // Back to live: forget the snapshot and reload the current data.
        historyShownRef.current.delete(info.name);
        overlaysLoadedRef.current.delete(info.name);
        // Never show the old day as "live" while (or if) the reload runs.
        (map.getSource(`ov-${info.name}`) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
      }
      if (liveSourceFor(info)) {
        const on = layers.overlays[info.name] ?? false;
        const running = liveRef.current.get(info.name);
        if (on && !running && (info.available || info.view)) {
          liveRef.current.set(info.name, startLive(map, info, () => i18nRef.current));
        } else if (!on && running) {
          running();
          liveRef.current.delete(info.name);
          setOverlayVisible(map, info.name, false);
        }
        continue;
      }
      const on = layers.overlays[info.name] ?? false;
      const loaded = overlaysLoadedRef.current.has(info.name);

      if (on && !loaded && info.available && info.category === "raster") {
        overlaysLoadedRef.current.add(info.name);
        rasterSource(info.name)
          .then((r) => {
            if (!r || !mapRef.current) throw new Error("no tiles");
            addRaster(map, info.name, r);
            setOverlayVisible(map, info.name, layersRef.current.overlays[info.name] ?? false);
          })
          .catch(() => overlaysLoadedRef.current.delete(info.name));
      } else if (on && !loaded && info.available) {
        overlaysLoadedRef.current.add(info.name);
        fetch(api.layerUrl(info.same_data_as ?? info.name))
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((data: GeoJSON.FeatureCollection) => {
            if (!mapRef.current || historyShownRef.current.has(info.name)) return; // a past day took over
            const s = map.getSource(`ov-${info.name}`) as GeoJSONSource | undefined;
            if (s) s.setData(data); // reloading (e.g. back from a past day)
            else addOverlay(map, info, data, () => i18nRef.current);
            setOverlayVisible(map, info.name, layersRef.current.overlays[info.name] ?? false);
          })
          .catch(() => overlaysLoadedRef.current.delete(info.name));
      } else if (loaded) {
        setOverlayVisible(map, info.name, on);
      }
    }
  }, [layers.overlays, overlayInfos, ready, historyDate]);

  // --- Live flights: keep the dots moving while the layer is on. The dev API
  // refreshes every 15 s; the static site's file is rebuilt every 15 min. ---
  const flightsOn = layers.overlays["flights"] ?? false;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flightsOn) return;
    type FlightFC = Parameters<typeof deadReckon>[0];
    // One collection per relay area (overlapping cells are merged for display).
    let base: FlightFC[] = [];
    let fresh = false; // new data not yet drawn
    const render = () => {
      const src = map.getSource("ov-flights") as GeoJSONSource | undefined;
      if (!src || !base.length) return;
      const moved = base.map((fc) => deadReckon(fc, Date.now() / 1000));
      if (!fresh && moved.every((m, i) => m === base[i])) return; // stale data: nothing to move
      fresh = false;
      src.setData(mergeFlights(moved));
    };
    // Static site: the relay (real-time) when configured, else the 15-minute
    // snapshot file. If the relay fails, fall back to the snapshot.
    const relay = api.static ? api.flightsRelay : "";
    const snapshotUrl = () =>
      `${api.layerUrl("flights")}${api.static ? `?t=${Math.floor(Date.now() / 60_000)}` : ""}`; // Pages caches 10 min
    const getJSON = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    const isFC = (d: unknown): d is FlightFC => !!d && Array.isArray((d as FlightFC).features);
    /** Relay URLs for the view: the home area, or the US grid cells in view
     *  (zoomed too far out for cells: just the home area). */
    const relayUrls = (): string[] => {
      const b = map.getBounds();
      const w = wrapLon(b.getWest()), e = wrapLon(b.getEast());
      const bbox: [number, number, number, number] = [w, b.getSouth(), e < w ? 180 : e, b.getNorth()];
      const cells = within(bbox, HOME_BBOX) ? [] : flightCells(bbox, 4);
      return cells.length ? cells.map((c) => `${relay}?cell=${c}`) : [relay];
    };
    // Per-URL results, so panning only fetches cells that aren't fresh (the
    // relay's firewall allows ~60 requests/minute per visitor).
    const cellData = new Map<string, { fc: FlightFC; at: number }>();
    const inFlight = new Map<string, Promise<FlightFC | null>>(); // overlapping polls share these
    const abort = new AbortController();
    const getCell = (u: string): Promise<FlightFC | null> => {
      const have = cellData.get(u);
      if (have && Date.now() - have.at < 12_000) return Promise.resolve(have.fc);
      const pending = inFlight.get(u);
      if (pending) return pending;
      // A failed refresh may reuse the last result for a while (deadReckon
      // stops moving data older than 2 minutes anyway).
      const fallback = () => (have && Date.now() - have.at < 120_000 ? have.fc : null);
      const p = fetch(u, { signal: abort.signal })
        .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
        .then((d) => {
          if (!isFC(d)) return fallback();
          cellData.set(u, { fc: d, at: Date.now() });
          return d;
        })
        .catch(fallback)
        .finally(() => inFlight.delete(u));
      inFlight.set(u, p);
      return p;
    };
    let pollSeq = 0;
    // After a relay failure, use the snapshot (which changes every ~15 min)
    // and only try the relay again a minute later — no 15 s hammering.
    let relayDownUntil = 0;
    let lastSnapshotAt = 0;
    const load = async (): Promise<FlightFC[] | null> => {
      if (relay && Date.now() >= relayDownUntil) {
        const got = (await Promise.allSettled(relayUrls().map(getCell)))
          .map((r) => (r.status === "fulfilled" ? r.value : null))
          .filter(isFC);
        if (got.length) return got; // a cell or two failing just leaves gaps
        relayDownUntil = Date.now() + 60_000;
      }
      if (relay && Date.now() - lastSnapshotAt < 5 * 60_000) return null; // snapshot is recent enough
      lastSnapshotAt = Date.now();
      const snap: unknown = await getJSON(snapshotUrl());
      return isFC(snap) ? [snap] : null;
    };
    const poll = () => {
      if (document.hidden) return;
      const seq = ++pollSeq;
      load()
        .then((fcs) => {
          if (!fcs || seq !== pollSeq) return; // keep the last good positions; drop out-of-order results
          base = fcs;
          fresh = true;
          render();
        })
        .catch(() => {});
    };
    poll();
    // Relay: every 15 s (the relay itself refreshes at most every 10 s);
    // snapshot-only static site: every 5 min; dev API: every 15 s.
    const fetchId = window.setInterval(poll, api.static && !relay ? 5 * 60_000 : 15_000);
    const onVisible = () => !document.hidden && poll(); // catch up after a background tab
    document.addEventListener("visibilitychange", onVisible);
    // Moved somewhere else: load that area's cells (debounced).
    let moveDebounce: number | undefined;
    const onMove = () => {
      window.clearTimeout(moveDebounce);
      moveDebounce = window.setTimeout(poll, 800);
    };
    if (relay) map.on("moveend", onMove);
    // Glide dots along their heading between updates (fresh data only: the
    // 15-minute static snapshot isn't animated, the relay is).
    const moveId =
      prefersReducedMotion() || (api.static && !relay)
        ? undefined
        : window.setInterval(() => !document.hidden && render(), 1000);
    return () => {
      abort.abort();
      window.clearInterval(fetchId);
      window.clearTimeout(moveDebounce);
      document.removeEventListener("visibilitychange", onVisible);
      if (relay) map.off("moveend", onMove);
      if (moveId !== undefined) window.clearInterval(moveId);
    };
  }, [flightsOn, ready]);

  // --- Rain radar: loop the last hour of RainViewer frames; refresh every
  // 10 minutes so it stays current. Reduced motion shows only the latest. ---
  const rainOn = layers.overlays["rain-radar"] ?? false;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const frameIds = () => (map.getStyle().layers ?? []).map((l) => l.id).filter((id) => id.startsWith("ov-rain-radar-f"));
    const clear = () => {
      try {
        for (const id of frameIds()) {
          map.removeLayer(id);
          if (map.getSource(id)) map.removeSource(id);
        }
      } catch {
        /* map already torn down (unmount) */
      }
    };
    if (!rainOn) {
      clear();
      return;
    }
    let ids: string[] = [];
    let i = 0;
    let cancelled = false;
    const show = (k: number, on: boolean) => {
      const id = ids[k];
      if (id && map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", on ? 0.7 : 0);
    };
    const load = async () => {
      try {
        const r = await fetch(RAINVIEWER_URL);
        const frames = radarFrames(r.ok ? await r.json() : null, prefersReducedMotion() ? 1 : 7);
        if (cancelled || !frames.length || !mapRef.current) return;
        clear();
        const beforeId = map.getLayer("cam-clusters") ? "cam-clusters" : undefined;
        ids = frames.map((f, k) => {
          const id = `ov-rain-radar-f${k}`;
          map.addSource(id, {
            type: "raster",
            tiles: [f.tiles],
            tileSize: 256,
            maxzoom: 7, // free tier; MapLibre scales tiles up beyond this
            // Credit once (every frame source is "in use", so each would be listed).
            ...(k === frames.length - 1
              ? { attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a>' }
              : {}),
          });
          map.addLayer(
            { id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-fade-duration": 0 } },
            beforeId,
          );
          return id;
        });
        i = ids.length - 1;
        show(i, true);
      } catch {
        /* keep whatever frames we had */
      }
    };
    void load();
    const refreshId = window.setInterval(() => void load(), 10 * 60_000);
    const stepId = prefersReducedMotion()
      ? undefined
      : window.setInterval(() => {
          if (!ids.length || document.hidden) return;
          show(i, false);
          i = (i + 1) % ids.length;
          show(i, true);
        }, 700);
    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
      if (stepId !== undefined) window.clearInterval(stepId);
      clear();
    };
  }, [rainOn, ready]);

  // Language-dependent live layers (Wikipedia, iNaturalist) reload on switch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const info of overlayInfos) {
      const stop = liveRef.current.get(info.name);
      if (!stop || !LIVE_SOURCES[info.name]?.langSensitive) continue;
      stop();
      liveRef.current.set(info.name, startLive(map, info, () => i18nRef.current));
    }
    // Deliberately keyed on language only.
  }, [lang]);

  // Stop every browser-live layer on unmount.
  useEffect(() => {
    const live = liveRef.current;
    return () => {
      for (const stop of live.values()) stop();
      live.clear();
    };
  }, []);

  // --- Coverage mode: crosshair cursor on, and clear markers when switched off. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.getCanvas().style.cursor = coverage.active ? "crosshair" : "";
    if (!coverage.active) {
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      for (const s of ["cov-radius", "cov-hits", "cov-pin"]) {
        (map.getSource(s) as GeoJSONSource | undefined)?.setData(empty);
      }
      onCoverageResultRef.current(null);
    }
  }, [coverage.active]);

  // --- Selection highlight + recenter. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setFilter("cam-selected", ["==", ["get", "id"], selectedId ?? "__none__"]);
    if (selectedId) {
      const cam = cameras.find((c) => c.id === selectedId);
      if (cam) {
        map.easeTo({
          center: [cam.longitude, cam.latitude],
          zoom: Math.max(map.getZoom(), 13),
          ...(prefersReducedMotion() ? { duration: 0 } : {}),
        });
      }
    }
  }, [selectedId, cameras]);

  // --- Quick-jump (Oakdale / Modesto / statewide). ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({ center: flyTo.center, zoom: flyTo.zoom, duration: prefersReducedMotion() ? 0 : 900 });
  }, [flyTo]);

  // --- Smoke forecast: follow the clock (the tile URL names one hour). ---
  const smokeOn = layers.overlays["smoke-forecast"] ?? false;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !smokeOn) return;
    const update = () =>
      void rasterSource("smoke-forecast").then((r) => {
        const src = map.getSource("ov-smoke-forecast") as maplibregl.RasterTileSource | undefined;
        if (r && src) src.setTiles(r.tiles);
      });
    update(); // turned back on later: jump to the current hour
    const id = window.setInterval(update, 10 * 60_000);
    return () => window.clearInterval(id);
  }, [smokeOn, ready]);

  // --- "What's near an address?" pin ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !nearPoint) return;
    const el = document.createElement("div");
    el.className = "nearpin";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", `${i18nRef.current.t("nearPinLabel")}: ${nearPoint.label}`);
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(nearPoint.center).addTo(map);
    return () => void marker.remove();
  }, [nearPoint, ready, lang]);

  // --- Escape closes any open map popup (keyboard users can't "click away"). ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || OPEN_POPUPS.size === 0) return;
      for (const p of [...OPEN_POPUPS]) p.remove();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // --- Localize the map's accessible name and the zoom buttons. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().setAttribute("aria-label", t("mapLabel"));
    const label = (sel: string, text: string) => {
      const btn = containerRef.current?.querySelector<HTMLButtonElement>(sel);
      if (btn) {
        btn.title = text;
        btn.setAttribute("aria-label", text);
      }
    };
    label(".maplibregl-ctrl-zoom-in", t("zoomIn"));
    label(".maplibregl-ctrl-zoom-out", t("zoomOut"));
  }, [t, ready]);

  // --- Keyboard path for "what can see me?": run it at the map's center. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || coverageCenterTick === 0) return;
    void runCoverage(map, map.getCenter(), alprDataRef, coverageRef.current.radiusM, onCoverageResultRef.current);
  }, [coverageCenterTick, ready]);

  if (glUnsupported) {
    return (
      <div className="map map-unsupported" role="alert">
        <div className="map-unsupported-card">
          <h2>{t("mapUnsupportedTitle")}</h2>
          <p>{t("mapUnsupportedBody")}</p>
        </div>
      </div>
    );
  }
  return <div ref={containerRef} className="map" />;
}

/** True when the browser can create a WebGL 2 context (MapLibre's minimum). */
function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

// --- helpers ---

const ALPR_ATTRIBUTION =
  'Plate readers © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors (ODbL) via <a href="https://deflock.me" target="_blank" rel="noopener noreferrer">DeFlock</a>';

/** Nationwide readers: an overview (counts per 0.5° cell) when zoomed out,
 *  and the clustered points fed from the 5° tiles in view once zoomed in. */
function addAlprTiles(
  map: maplibregl.Map,
  index: AlprIndex,
  dataRef: { current: GeoJSON.FeatureCollection | null },
  beforeId: string | undefined,
) {
  for (const id of ["alpr-clusters", "alpr-cluster-count", "alpr-points"]) map.setLayerZoomRange(id, ALPR_TILE_ZOOM, 24);
  map.addSource("alpr-overview", { type: "geojson", data: "data/alpr/overview.geojson", attribution: ALPR_ATTRIBUTION });
  map.addLayer(
    {
      id: "alpr-overview",
      type: "circle",
      source: "alpr-overview",
      maxzoom: ALPR_TILE_ZOOM,
      paint: {
        "circle-color": ALPR_CLUSTER,
        "circle-opacity": 0.75,
        "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 4, 10, 10, 40, 22],
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff",
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "alpr-overview-count",
      type: "symbol",
      source: "alpr-overview",
      maxzoom: ALPR_TILE_ZOOM,
      filter: [">=", ["get", "count"], 25],
      layout: { "text-field": ["to-string", ["get", "count"]], "text-font": LABEL_FONT, "text-size": 10 },
      paint: { "text-color": "#fff" },
    },
    beforeId,
  );
  // Click a count: zoom in to see the readers there.
  map.on("click", "alpr-overview", (e: LayerMouseEvent) =>
    map.easeTo({ center: e.lngLat, zoom: ALPR_TILE_ZOOM + 1, ...(prefersReducedMotion() ? { duration: 0 } : {}) }),
  );
  map.on("mouseenter", "alpr-overview", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "alpr-overview", () => (map.getCanvas().style.cursor = ""));

  const tiles = new Map<string, GeoJSON.FeatureCollection>();
  const pending = new Set<string>();
  const load = () => {
    if (map.getZoom() < ALPR_TILE_ZOOM) return;
    const b = map.getBounds();
    const w = wrapLon(b.getWest()), e = wrapLon(b.getEast());
    // Across the antimeridian (western Aleutians): both sides of it.
    const want =
      e < w
        ? [...alprCells(index, [w, b.getSouth(), 180, b.getNorth()], 4), ...alprCells(index, [-180, b.getSouth(), e, b.getNorth()], 4)]
        : alprCells(index, [w, b.getSouth(), e, b.getNorth()]);
    const missing = want.filter((k) => !tiles.has(k) && !pending.has(k));
    if (!missing.length) return;
    missing.forEach((k) => pending.add(k));
    void Promise.all(
      missing.map((k) =>
        alprTile(k).then((fc) => {
          pending.delete(k);
          if (fc) tiles.set(k, fc);
        }),
      ),
    ).then(() => {
      // Keep memory bounded: drop far-away tiles once many are loaded.
      if (tiles.size > 8) {
        for (const k of [...tiles.keys()]) {
          if (want.includes(k)) continue;
          tiles.delete(k);
          evictAlprTile(k); // free it for real, not just from the map
        }
      }
      const data = mergeTiles(tiles.values());
      dataRef.current = data;
      (map.getSource("alpr") as GeoJSONSource | undefined)?.setData(data);
    });
  };
  map.on("moveend", load);
  load();
}

function applyVisibility(map: maplibregl.Map, layers: LayerState) {
  const set = (id: string, on: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  for (const id of ["cam-clusters", "cam-cluster-count", "cam-points", "cam-selected"]) {
    set(id, layers.cameras);
  }
  for (const id of ["alpr-clusters", "alpr-cluster-count", "alpr-points", "alpr-overview", "alpr-overview-count"]) {
    set(id, layers.alpr);
  }

  // Vendor filter on the unclustered ALPR points.
  if (map.getLayer("alpr-points")) {
    const on = Object.entries(layers.alprVendors)
      .filter(([, v]) => v)
      .map(([k]) => k);
    map.setFilter("alpr-points", [
      "all",
      ["!", ["has", "point_count"]],
      ["in", ["get", "vendor"], ["literal", on]],
    ]);
  }
}

// Add an overlay's source + layers, inserted beneath the camera points so dots
// stay on top. Polygons render as a faint fill + outline; census is a choropleth.
const OVERLAY_SUFFIXES = ["-fill", "-line", "-circle", "-arrow", "-label", "-raster"];

/** Heading arrow for moving things (flights): an SDF image, so it takes any
 *  color, drawn once per map. Points north; rotated by `track`. */
const ARROW_ICON = "heading-arrow";
function ensureArrowIcon(map: maplibregl.Map) {
  if (map.hasImage(ARROW_ICON)) return;
  const size = 48; // drawn at 2x for crisp edges (pixelRatio 2)
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return;
  g.fillStyle = "#fff";
  g.beginPath(); // a navigation arrow: tip at top, notched tail
  g.moveTo(size / 2, 3);
  g.lineTo(size - 7, size - 5);
  g.lineTo(size / 2, size - 15);
  g.lineTo(7, size - 5);
  g.closePath();
  g.fill();
  map.addImage(ARROW_ICON, g.getImageData(0, 0, size, size), { sdf: true, pixelRatio: 2 });
}
const HAS_TRACK: maplibregl.ExpressionSpecification = ["==", ["typeof", ["get", "track"]], "number"];

/** Categories always drawn as points, even when the data is momentarily empty. */
const POINT_CATEGORIES = new Set([
  "flight", "haze", "webcam", "space", "train", "nature", "wiki", "weather-now", "poi", "hotspot",
  "roadweather", "chain", "superfund", "power", "aqi", "voting", "outage", "crash", "reservoir", "quake", "bus",
  "wastewater", "groundwater", "gauge", "storm", "volcano", "dev", "legal",
]);
/** …and these as lines (lane closures can be momentarily empty). */
const LINE_CATEGORIES = new Set(["roadops", "fault"]);

/** Map text labels per category: which property (or expression), from which zoom. */
const LABELS: Record<string, { field: string | maplibregl.ExpressionSpecification; minzoom: number }> = {
  flight: { field: "callsign", minzoom: 9 },
  "weather-now": { field: "label", minzoom: 0 },
  aqi: { field: "label", minzoom: 0 },
  space: { field: "label", minzoom: 4 },
  train: { field: "label", minzoom: 8 },
  bus: { field: "label", minzoom: 11 },
  reservoir: { field: "label", minzoom: 7 },
  roadweather: {
    field: ["case", ["==", ["typeof", ["get", "temp_f"]], "number"], ["concat", ["to-string", ["get", "temp_f"]], "°"], ""],
    minzoom: 8,
  },
};

/** Chain-control requirement -> color (grey = none … red = all vehicles). */
const CHAIN_COLORS = ["R-0", "#16a34a", "R-1", "#ca8a04", "R-2", "#ea580c", "R-3", "#dc2626"];
/** EPA AQI category -> color (darkened where needed for contrast with labels). */
const AQI_COLORS = ["good", "#16a34a", "moderate", "#ca8a04", "usg", "#ea580c", "unhealthy", "#dc2626", "very", "#7e22ce", "hazardous", "#7f1d1d"];

/** Haze level -> dot color (green = clear … red = very hazy). */
const HAZE_COLORS: [string, string][] = [
  ["clear", "#16a34a"],
  ["slightly-hazy", "#ca8a04"],
  ["hazy", "#ea580c"],
  ["very-hazy", "#b91c1c"],
  ["night", "#475569"],
];

interface RasterSpec {
  tiles: string[];
  maxzoom: number;
  attribution: string;
  /** Satellite sits under the basemap's labels; radar sits over everything but cameras. */
  under: "labels" | "cameras";
  opacity: number;
}

/** Tile URL for a client-side raster layer (fetched from public tile servers). */
export async function rasterSource(name: string, now = new Date()): Promise<RasterSpec | null> {
  if (name === "smoke-forecast") {
    // NOAA's near-surface smoke model for the current hour, in NOAA's colors.
    const base = "https://mapservices.weather.noaa.gov/raster/rest/services/air_quality/ndgd_smoke_sfc_1hr_avg_time/ImageServer/exportImage";
    const q = new URLSearchParams({
      bboxSR: "3857",
      imageSR: "3857",
      size: "256,256",
      format: "png32",
      transparent: "true",
      f: "image",
      // Mid-hour, so it can't fall on the boundary between two hourly slices.
      time: String(Math.floor(now.getTime() / 3_600_000) * 3_600_000 + 1_800_000),
      renderingRule: JSON.stringify({ rasterFunction: "smoke_don_0921" }),
    });
    return {
      tiles: [`${base}?bbox={bbox-epsg-3857}&${q}`],
      maxzoom: 9,
      attribution: '<a href="https://www.weather.gov/" target="_blank" rel="noopener noreferrer">NOAA smoke forecast</a>',
      under: "labels",
      opacity: 0.7,
    };
  }
  if (name === "heat-risk") {
    // NWS HeatRisk image service, today's grid ("HeatRisk_1"), in its own colors.
    const base = "https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/exportImage";
    const q = new URLSearchParams({
      bboxSR: "3857",
      imageSR: "3857",
      size: "256,256",
      format: "png32",
      transparent: "true",
      f: "image",
      renderingRule: JSON.stringify({ rasterFunction: "heatrisk.rft" }),
      mosaicRule: JSON.stringify({ mosaicMethod: "esriMosaicAttribute", where: "name='HeatRisk_1_Mercator'" }),
    });
    return {
      tiles: [`${base}?bbox={bbox-epsg-3857}&${q}`],
      maxzoom: 10,
      attribution: '<a href="https://www.wpc.ncep.noaa.gov/heatrisk/" target="_blank" rel="noopener noreferrer">NWS HeatRisk</a>',
      under: "labels",
      opacity: 0.6,
    };
  }
  if (name === "satellite") {
    return {
      tiles: [gibsSatelliteUrl(now)],
      maxzoom: 9,
      attribution: '<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener noreferrer">NASA EOSDIS GIBS</a>',
      under: "labels",
      opacity: 1,
    };
  }
  return null;
}

function addRaster(map: maplibregl.Map, name: string, r: RasterSpec) {
  const src = `ov-${name}`;
  if (map.getSource(src)) return;
  map.addSource(src, { type: "raster", tiles: r.tiles, tileSize: 256, maxzoom: r.maxzoom, attribution: r.attribution });
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  const beforeId = r.under === "labels" ? firstSymbol : map.getLayer("cam-clusters") ? "cam-clusters" : undefined;
  map.addLayer(
    { id: `${src}-raster`, type: "raster", source: src, paint: { "raster-opacity": r.opacity }, layout: { visibility: "none" } },
    beforeId,
  );
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Run a browser-live layer: load now, refresh on its schedule (and when the
 *  map stops moving, for view-based sources), tick locally if it can. Returns
 *  stop(). Network failures keep the last good data. */
function startLive(map: maplibregl.Map, info: LayerInfo, getI18n: () => I18nState): () => void {
  const source = liveSourceFor(info)!;
  const src = `ov-${info.name}`;
  let ctrl: AbortController | null = null;
  let stopped = false;
  let lastOk = 0;
  let lastApplied: GeoJSON.FeatureCollection | null = null;
  // Re-enabled after being off: show what we had while the reload runs.
  if (map.getSource(src)) setOverlayVisible(map, info.name, true);
  const apply = (data: GeoJSON.FeatureCollection) => {
    if (stopped) return;
    if (data === lastApplied && map.getSource(src)) return setOverlayVisible(map, info.name, true); // same baked copy
    lastApplied = data;
    const s = map.getSource(src) as GeoJSONSource | undefined;
    if (s) s.setData(data);
    else addOverlay(map, info, data, getI18n);
    setOverlayVisible(map, info.name, true);
  };
  const run = async () => {
    if (document.hidden) return;
    ctrl?.abort();
    ctrl = new AbortController();
    const b = map.getBounds();
    const c = map.getCenter().wrap();
    // Round what we send to third parties (~100 m): enough for "what's here",
    // without sharing the visitor's exact view.
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    // Unwrapped longitudes (after panning across world copies) -> [-180, 180].
    const w = wrapLon(b.getWest()), e = b.getEast() - b.getWest() >= 360 ? 180 : wrapLon(b.getEast());
    const ctx: LiveCtx = {
      bbox: [r3(e < w ? -180 : w), r3(b.getSouth()), r3(e < w ? 180 : e), r3(b.getNorth())],
      center: [r3(c.lng), r3(c.lat)],
      zoom: map.getZoom(),
      lang: getI18n().lang,
      signal: ctrl.signal,
    };
    if (source.minZoom != null && ctx.zoom < source.minZoom) return apply(EMPTY_FC);
    try {
      const data = await source.load(ctx);
      if (ctx.signal.aborted) return; // the view moved on: a newer run owns the map
      apply(data);
      lastOk = Date.now();
    } catch {
      /* aborted or upstream hiccup: keep the last good data */
    }
  };
  void run();
  const timers = [window.setInterval(() => void run(), source.refreshMs)];
  if (source.tick && source.tickMs) {
    // Reduced motion: update less often rather than freezing (satellites move fast).
    const every = prefersReducedMotion() ? Math.max(30_000, source.tickMs) : source.tickMs;
    timers.push(
      window.setInterval(() => {
        const d = !document.hidden && source.tick!();
        if (d) apply(d);
      }, every),
    );
  }
  // Started (or left) in a background tab: catch up as soon as it's visible.
  const onVisible = () => {
    if (!document.hidden && Date.now() - lastOk > Math.min(source.refreshMs, 60_000)) void run();
  };
  document.addEventListener("visibilitychange", onVisible);
  let debounce: number | undefined;
  const onMove = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void run(), 800);
  };
  if (source.byView) map.on("moveend", onMove);
  return () => {
    stopped = true;
    ctrl?.abort();
    timers.forEach((id) => window.clearInterval(id));
    window.clearTimeout(debounce);
    document.removeEventListener("visibilitychange", onVisible);
    if (source.byView) map.off("moveend", onMove);
  };
}

const VIEW_GEOMETRY = { point: "Point", line: "LineString", polygon: "Polygon" } as const;

/** Geometry of the first feature; for empty data, the layer's declared
 *  geometry (nationwide views can start empty, e.g. while zoomed out). */
function firstGeometryType(data: GeoJSON.FeatureCollection, info?: LayerInfo): string {
  return (
    data.features.find((f) => f.geometry)?.geometry?.type ??
    (info?.view ? VIEW_GEOMETRY[info.view.geometry] : "Polygon")
  );
}

// Overlays render beneath camera points. Polygons -> fill + outline (census is a
// choropleth); point layers (parks, schools, wildfire, quakes) -> circles.
function addOverlay(
  map: maplibregl.Map,
  info: LayerInfo,
  data: GeoJSON.FeatureCollection,
  getI18n: () => I18nState,
) {
  const src = `ov-${info.name}`;
  if (map.getSource(src)) return;
  map.addSource(src, { type: "geojson", data });
  const beforeId = map.getLayer("cam-clusters") ? "cam-clusters" : undefined;
  const accent = OVERLAY_COLOR[info.name] ?? "#64748b";
  const geomType = firstGeometryType(data, info);
  // Live point layers can legitimately be empty (e.g. no flights right now).
  const isPoint = geomType.includes("Point") || POINT_CATEGORIES.has(info.category);

  const bindPopup = (layerId: string) => {
    map.on("click", layerId, (e: LayerMouseEvent) => {
      const i18n = getI18n();
      const feats = (e.features ?? []).map((f) => f.properties ?? {});
      const spec =
        info.category === "webcam"
          ? webcamPopup(info, feats, i18n)
          : info.category === "voting"
            ? votingPopup(info, feats, i18n)
            : overlayPopup(info, feats[0] ?? {}, i18n);
      const geom = e.features?.[0]?.geometry;
      const at = geom?.type === "Point" ? (geom.coordinates as [number, number]) : ([e.lngLat.lng, e.lngLat.lat] as [number, number]);
      const help = helpFor(info.name, feats[0] ?? {}, at);
      if (help) spec.section = helpSection(help, i18n.t);
      const popup = openPopup(map, e.lngLat, popupHtml(spec), i18n.t, help ? () => POPUP_HELP.open?.(help) : undefined);
      if (info.category === "flight") void addFlightRoute(popup, String(feats[0]?.callsign ?? ""), i18n.t);
    });
    map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
  };

  if (isPoint) {
    // Quakes scale by magnitude; everything else is a fixed dot.
    const radius: maplibregl.ExpressionSpecification | number =
      info.category === "quake"
        ? ["interpolate", ["linear"], ["coalesce", ["get", "mag"], 1], 1, 3, 6, 16]
        : info.name === "iss"
          ? 9
          : info.category === "hotspot"
            ? ["interpolate", ["linear"], ["coalesce", ["get", "frp_mw"], 1], 1, 4, 100, 12]
            : info.category === "weather-now" || info.category === "aqi"
              ? 10
              : info.category === "outage"
                ? ["interpolate", ["linear"], ["coalesce", ["get", "customers"], 1], 1, 4, 100, 7, 5000, 14]
                : info.category === "crash"
                  ? ["interpolate", ["linear"], ["coalesce", ["get", "fatalities"], 1], 1, 5, 4, 10]
                  : info.name === "ceqa-projects"
                    ? 8
                    : info.category === "dev"
                      ? ["interpolate", ["linear"], ["coalesce", ["get", "units"], 1], 1, 5, 20, 8, 100, 12, 500, 18]
                  : info.category === "voting" || info.category === "reservoir" || info.category === "wastewater" || info.category === "volcano"
                    ? 8
                    : 6;
    const color: maplibregl.ExpressionSpecification | string =
      info.category === "haze"
        ? (["match", ["get", "level"], ...HAZE_COLORS.flat(), "#94a3b8"] as unknown as maplibregl.ExpressionSpecification)
        : info.category === "flight"
          ? [
              "case",
              ["==", ["get", "on_ground"], true],
              "#94a3b8",
              ["interpolate", ["linear"], ["coalesce", ["get", "alt_ft"], 0], 0, "#06b6d4", 10000, "#3b82f6", 35000, "#7c3aed"],
            ]
          : info.category === "weather-now" || info.category === "roadweather"
            ? ["interpolate", ["linear"], ["coalesce", ["get", "temp_f"], 60], 30, "#2563eb", 60, "#16a34a", 80, "#eab308", 100, "#dc2626"]
            : info.category === "chain"
              ? (["match", ["get", "status"], ...CHAIN_COLORS, "#64748b"] as unknown as maplibregl.ExpressionSpecification)
              : info.category === "aqi"
                ? (["match", ["get", "category"], ...AQI_COLORS, "#64748b"] as unknown as maplibregl.ExpressionSpecification)
                : info.category === "voting"
                  ? (["match", ["get", "kind"], ...VOTING_COLORS.flat(), accent] as unknown as maplibregl.ExpressionSpecification)
                  : info.category === "wastewater"
                    ? (["match", ["get", "worst"], ...WVAL_COLORS.flat(), "#94a3b8"] as unknown as maplibregl.ExpressionSpecification)
                    : info.category === "volcano"
                      ? (["match", ["get", "color"], ...VOLCANO_COLORS.flat(), "#94a3b8"] as unknown as maplibregl.ExpressionSpecification)
                    : info.category === "dev"
                      ? (["match", ["get", "stage"], ...DEV_STAGES.flatMap(([s, c]) => [s, c]), "#94a3b8"] as unknown as maplibregl.ExpressionSpecification)
                    : info.category === "gauge"
                      ? (["match", ["get", "status"], ...GAUGE_COLORS.flat(), GAUGE_OTHER] as unknown as maplibregl.ExpressionSpecification)
                      : info.category === "storm"
                        ? ([
                            "case",
                            ...STORM_KINDS.flatMap(([kw, c]) => [["in", kw, ["coalesce", ["get", "kind"], ""]], c]),
                            "#64748b",
                          ] as unknown as maplibregl.ExpressionSpecification)
                    : info.category === "groundwater"
                      ? (["interpolate", ["linear"], ["coalesce", ["get", "depth_ft"], 0], ...GROUNDWATER_STOPS.flat()] as unknown as maplibregl.ExpressionSpecification)
                  : info.category === "outage"
                    ? (["match", ["get", "type"], ...OUTAGE_COLORS.flat(), "#64748b"] as unknown as maplibregl.ExpressionSpecification)
                    : info.category === "reservoir"
                      ? ([
                          "case",
                          ["==", ["typeof", ["get", "pct_full"]], "number"],
                          ["interpolate", ["linear"], ["get", "pct_full"], ...RESERVOIR_STOPS.flat()],
                          "#94a3b8",
                        ] as unknown as maplibregl.ExpressionSpecification)
                      : accent;
    // Moving things with a heading (planes, buses) are drawn as arrows.
    const hasHeading = info.category === "flight" || info.category === "bus";
    map.addLayer(
      {
        id: `${src}-circle`,
        type: "circle",
        source: src,
        // Things with a known heading are drawn as arrows instead (below).
        ...(hasHeading ? { filter: ["!", HAS_TRACK] as maplibregl.FilterSpecification } : {}),
        paint: {
          "circle-color": color,
          "circle-radius": radius,
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
        },
        layout: {
          visibility: "none",
          // Volcanoes: elevated alerts draw on top of normal ones.
          ...(info.category === "volcano"
            ? { "circle-sort-key": ["match", ["get", "color"], "RED", 4, "ORANGE", 3, "YELLOW", 2, 1] as maplibregl.ExpressionSpecification }
            : {}),
          // Development: big projects draw on top of single homes.
          ...(info.category === "dev"
            ? { "circle-sort-key": ["coalesce", ["get", "units"], ["get", "acres"], 0] as maplibregl.ExpressionSpecification }
            : {}),
        },
      },
      beforeId,
    );
    bindPopup(`${src}-circle`);
    if (hasHeading) {
      ensureArrowIcon(map);
      map.addLayer(
        {
          id: `${src}-arrow`,
          type: "symbol",
          source: src,
          filter: HAS_TRACK as maplibregl.FilterSpecification,
          layout: {
            visibility: "none",
            "icon-image": ARROW_ICON,
            "icon-rotate": ["get", "track"],
            "icon-rotation-alignment": "map", // the heading is a compass bearing
            "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.75, 10, 1.15],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-color": color, "icon-halo-color": "#fff", "icon-halo-width": 1.5 },
        },
        beforeId,
      );
      bindPopup(`${src}-arrow`);
    }
    const label = LABELS[info.category];
    if (label) {
      map.addLayer(
        {
          id: `${src}-label`,
          type: "symbol",
          source: src,
          minzoom: label.minzoom,
          layout: {
            visibility: "none",
            "text-field": typeof label.field === "string" ? ["get", label.field] : label.field,
            "text-font": LABEL_FONT,
            "text-size": 11,
            "text-offset": [0, 1.1],
            "text-anchor": "top",
          },
          paint: { "text-color": "#1e3a8a", "text-halo-color": "#fff", "text-halo-width": 1.5 },
        },
        beforeId,
      );
    }
    return;
  }

  if (geomType.includes("LineString") || LINE_CATEGORIES.has(info.category)) {
    map.addLayer(
      {
        id: `${src}-line`,
        type: "line",
        source: src,
        paint: {
          "line-color": accent,
          "line-width": info.category === "roadops" ? 3 : info.category === "fault" ? 1.5 : 2,
          "line-opacity": 0.9,
          ...(info.category === "roadops" ? { "line-dasharray": [2, 1.5] } : {}),
        },
        layout: { visibility: "none", "line-cap": "round" },
      },
      beforeId,
    );
    bindPopup(`${src}-line`);
    return;
  }

  const choropleth = (field: string, stops: [number, string][]) =>
    ({
      "fill-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", field], 0],
        ...stops.flat(),
      ] as unknown as maplibregl.ExpressionSpecification,
      "fill-opacity": 0.6,
    }) as const;

  const fillPaint =
    info.category === "census"
      ? CENSUS_FIELD[info.name]?.startsWith("pct_")
        ? choropleth(CENSUS_FIELD[info.name]!, PCT_STOPS)
        : choropleth("median_income", CENSUS_STOPS)
      : info.category === "enviroscreen"
        ? choropleth("CIscoreP", ENVIRO_STOPS)
        : info.category === "health"
          ? choropleth("pct", HEALTH_STOPS[info.name] ?? PCT_STOPS)
          : info.category === "firewx"
            ? ({
                "fill-color": ["match", ["get", "level"], ...FIREWX_COLORS.flat(), "#cccccc"] as unknown as maplibregl.ExpressionSpecification,
                "fill-opacity": 0.4,
              } as const)
          : info.category === "drought"
            ? ({
                "fill-color": ["match", ["get", "dm"], ...DROUGHT_COLORS.flat(), "#cccccc"] as unknown as maplibregl.ExpressionSpecification,
                "fill-opacity": 0.45,
              } as const)
            : {
            "fill-color": accent,
            "fill-opacity":
                info.category === "landuse" ? 0.22 : info.category === "perimeter" || info.category === "outage-area" ? 0.3 : info.category === "weather" || info.category === "park" ? 0.18 : 0.14,
            };
  const choroplethCat = ["census", "enviroscreen", "health", "drought", "firewx"].includes(info.category);

  map.addLayer(
    { id: `${src}-fill`, type: "fill", source: src, paint: fillPaint, layout: { visibility: "none" } },
    beforeId,
  );
  map.addLayer(
    {
      id: `${src}-line`,
      type: "line",
      source: src,
      paint: {
        "line-color": choroplethCat ? "#ffffff" : accent,
        "line-width": info.category === "boundary" ? 2 : 0.8,
        "line-opacity": 0.9,
      },
      layout: { visibility: "none" },
    },
    beforeId,
  );
  bindPopup(`${src}-fill`);
}

function setOverlayVisible(map: maplibregl.Map, name: string, on: boolean) {
  for (const suffix of OVERLAY_SUFFIXES) {
    const id = `ov-${name}${suffix}`;
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

interface I18nState {
  t: TFn;
  lang: Lang;
  locale: string;
}

/** Popups currently open, so Escape can close them. */
const OPEN_POPUPS = new Set<maplibregl.Popup>();
// Popups are plain HTML built outside React: their Help buttons call the
// current onHelp through this (the map is a single instance).
const POPUP_HELP: { open: ((t: HelpTarget) => void) | null } = { open: null };

/** Open a themed popup whose close button is labeled in the current language. */
function openPopup(
  map: maplibregl.Map,
  lngLat: maplibregl.LngLat,
  html: string,
  t: TFn,
  /** Called by the popup's action button (see PopupSpec.section.action). */
  onAction?: () => void,
) {
  const popup = new maplibregl.Popup({
    closeButton: true,
    maxWidth: "320px",
    offset: 14,
    className: "scm-popup",
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
  OPEN_POPUPS.add(popup);
  popup.on("close", () => OPEN_POPUPS.delete(popup));
  const close = popup.getElement()?.querySelector<HTMLButtonElement>(".maplibregl-popup-close-button");
  if (close) {
    close.setAttribute("aria-label", t("closePopup"));
    close.title = t("closePopup");
  }
  if (onAction) {
    popup.getElement()?.querySelector("[data-popup-action]")?.addEventListener("click", onAction);
  }
  return popup;
}

const ROUTES = new Map<string, Promise<FlightRoute | null>>();

/** Add "From → To" to an open flight popup (airline callsigns only — never
 *  private tail numbers). Text is set via textContent, never as HTML. */
async function addFlightRoute(popup: maplibregl.Popup, callsign: string, t: TFn) {
  const cs = callsign.trim().toUpperCase();
  if (!isAirlineCallsign(cs)) return;
  if (!ROUTES.has(cs)) {
    if (ROUTES.size > 300) ROUTES.clear();
    ROUTES.set(
      cs,
      fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(parseRoute)
        .catch(() => {
          ROUTES.delete(cs); // a network blip shouldn't disable this route for the session
          return null;
        }),
    );
  }
  const route = await ROUTES.get(cs);
  const rows = popup.getElement()?.querySelector(".popup__rows");
  if (!route || !rows || !popup.isOpen()) return;
  const add = (k: string, v: string) => {
    if (!v) return;
    const row = document.createElement("div");
    row.className = "popup__row";
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    row.append(dt, dd);
    rows.prepend(row);
  };
  add(t("rowRoute"), `${route.from} → ${route.to}`);
  add(t("rowAirline"), route.airline);
}

interface PopupSpec {
  /** What was clicked, e.g. "License plate reader" / layer name. */
  kind: string;
  /** Layer color for the header dot (from our own palette). */
  color?: string;
  title: string;
  /** [label, value] rows; empty values are dropped. */
  rows?: [string, string][];
  /** Public webcams at this spot: latest still + link to the operator's viewer.
   *  Both URLs are re-validated against the host allowlists when rendered. */
  cameras?: {
    name: string;
    src?: string;
    alt: string;
    credit: string;
    href?: string;
    linkLabel: string;
    /** Screen-reader note that the link opens a new tab. */
    newTab: string;
  }[];
  /** Link to the source's own page (re-validated against the allowlist, or
   *  against `hosts` for curated data that lists its own sites). */
  link?: { href: string; label: string; hosts?: readonly string[] };
  /** Extra block under the rows, e.g. "Who can search it". All plain text. */
  section?: {
    heading: string;
    label: string;
    name?: string;
    text?: string;
    foot?: string;
    /** Button label; the click is wired by openPopup's `onAction`. */
    action?: string;
  };
}


/** Render a popup. EVERY string is escaped here — callers pass plain text. */
function popupHtml(s: PopupSpec): string {
  const color = s.color && /^#[0-9a-f]{3,8}$/i.test(s.color) ? s.color : null;
  const rows = (s.rows ?? [])
    // Drop empty values and the placeholders government datasets use for "missing".
    .filter(([, v]) => !isMissing(v))
    .map(
      ([k, v]) =>
        `<div class="popup__row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`,
    )
    .join("");
  return (
    `<div class="popup">` +
    `<div class="popup__kind">${color ? `<span class="popup__dot" style="background:${color}"></span>` : ""}${escapeHtml(s.kind)}</div>` +
    `<div class="popup__title">${escapeHtml(s.title)}</div>` +
    (s.cameras ?? []).map(cameraHtml).join("") +
    (rows ? `<dl class="popup__rows">${rows}</dl>` : "") +
    linkHtml(s.link) +
    (s.section ? sectionHtml(s.section) : "") +
    `</div>`
  );
}

function linkHtml(link: PopupSpec["link"]): string {
  const href = link && safeUrl(link.href, link.hosts ?? WEBCAM_PAGE_HOSTS);
  if (!link || !href) return "";
  return (
    `<a class="popup__link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` +
    `${escapeHtml(link.label)} <span aria-hidden="true">↗</span></a>`
  );
}

function cameraHtml(c: NonNullable<PopupSpec["cameras"]>[number]): string {
  const src = safeUrl(c.src, WEBCAM_IMAGE_HOSTS);
  const href = safeUrl(c.href, WEBCAM_PAGE_HOSTS);
  return (
    `<div class="popup__cam">` +
    (src
      ? `<figure class="popup__image">` +
        `<img src="${escapeHtml(freshImage(src))}" alt="${escapeHtml(c.alt)}" loading="lazy" referrerpolicy="no-referrer" />` +
        `<figcaption>${escapeHtml(c.credit)}</figcaption>` +
        `</figure>`
      : "") +
    (href
      ? `<a class="popup__link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` +
        `${escapeHtml(c.linkLabel)} <span aria-hidden="true">↗</span>` +
        `<span class="sr-only"> ${escapeHtml(c.newTab)}</span></a>`
      : "") +
    `</div>`
  );
}

/** One popup for every webcam under the click (sites often have 2+ cameras
 *  at identical coordinates, which a single-feature popup would hide). */
function webcamPopup(info: LayerInfo, list: Record<string, unknown>[], i18n: I18nState): PopupSpec {
  const { t, lang } = i18n;
  const seen = new Set<string>();
  const cams = list.filter((p) => {
    const key = `${String(p.page ?? "")}|${String(p.name ?? "")}`;
    return !seen.has(key) && (seen.add(key), true);
  });
  const first = cams[0] ?? {};
  const network = String(first.network ?? "");
  const credit =
    network === "ALERTCalifornia"
      ? t("creditAlertCA")
      : network === "USGS"
        ? t("creditUSGS")
        : t("creditNetwork", { network });
  const nameOf = (p: Record<string, unknown>) => tidy(String(p.name ?? "")) || layerTitle(lang, info.name, info.title);
  const multi = cams.length > 1;
  return {
    kind: layerTitle(lang, info.name, info.title),
    color: OVERLAY_COLOR[info.name],
    // "Atlas Peak 1" + "Atlas Peak 2" -> "Atlas Peak"
    title: multi ? nameOf(first).replace(/\s+\d+$/, "") : nameOf(first),
    cameras: cams.map((p) => {
      const name = nameOf(p);
      return {
        name,
        src: typeof p.image === "string" ? p.image : undefined,
        alt: t("webcamAlt", { name }),
        credit: multi ? `${name} · ${credit}` : credit,
        href: typeof p.page === "string" ? p.page : undefined,
        // Distinct accessible names when there are several links.
        linkLabel: multi ? t("openLiveViewOf", { name }) : t("openLiveView"),
        newTab: t("opensNewTab"),
      };
    }),
    rows: [
      [t("rowNetwork"), network],
      [t("rowCounty"), tidy(String(first.county ?? ""))],
    ],
  };
}

function sectionHtml(x: NonNullable<PopupSpec["section"]>): string {
  const opt = (cls: string, v?: string, tag = "div") =>
    v ? `<${tag} class="${cls}">${escapeHtml(v)}</${tag}>` : "";
  return (
    `<section class="popup__section" aria-label="${escapeHtml(x.heading)}">` +
    `<div class="popup__heading">${escapeHtml(x.heading)}</div>` +
    opt("popup__basis", x.label) +
    opt("popup__name", x.name) +
    opt("popup__text", x.text, "p") +
    opt("popup__foot", x.foot) +
    (x.action
      ? `<button type="button" class="popup__action" data-popup-action>${escapeHtml(x.action)}</button>`
      : "") +
    `</section>`
  );
}

/** "Free or discounted care" / "Rent rules" block that opens the Help tools. */
function helpSection(h: HelpTarget, t: TFn): NonNullable<PopupSpec["section"]> {
  if (h.tab === "medical")
    return { heading: t("helpHospitalHeading"), label: "", text: t("helpHospitalText"), action: t("helpHospitalAction") };
  if (h.mobileHome)
    return { heading: t("helpMobileHeading"), label: "", text: t("helpMobileText"), action: t("helpMobileAction") };
  return { heading: t("helpLegalHeading"), label: "", text: t("helpLegalText"), action: t("helpLegalAction") };
}

/** "Who can search it" block for an ALPR popup. `access` may still be loading. */
function accessSection(
  a: Attribution,
  access: AlprAccess | null,
  t: TFn,
  lang: Lang,
  locale: string,
): NonNullable<PopupSpec["section"]> {
  const { name, summary } = describe(a, access, lang, t("accessNoRecords"));
  return {
    heading: t("whoCanSearch"),
    label: t(BASIS_KEY[a.basis]),
    name,
    text: summary,
    foot: access ? t("accessAsOf", { date: formatRecordDate(access.as_of, locale) }) : undefined,
    action: t("accessDetails"),
  };
}

function facing(dir: unknown, t: TFn): string {
  const d = String(dir ?? "").trim();
  if (!d) return "";
  // OSM direction can be "160", "130;310", or a compass word.
  return d
    .split(";")
    .map((x) => (/^\d+(\.\d+)?$/.test(x.trim()) ? `${Math.round(Number(x))}°` : translateDirection(t, x.trim())))
    .join(", ");
}

const POI_KEYS: Record<string, Parameters<TFn>[0]> = {
  aed: "poiAed",
  "drinking-water": "poiWater",
  restrooms: "poiToilets",
  "ev-chargers": "poiCharger",
  libraries: "poiLibrary",
  playgrounds: "poiPlayground",
  pharmacies: "poiPharmacy",
  "fire-stations": "poiFireStation",
  "free-wifi": "poiWifi",
  "food-banks": "poiFoodBank",
  clinics: "poiClinic",
  "community-centers": "poiCommunity",
  "farmers-markets": "poiMarket",
};

type InfoRow = [Parameters<TFn>[0], string];
/** Simple layers: which properties to show, in order. "_today" = today's hours. */
const INFO_FIELDS: Record<string, { rows: InfoRow[]; titleFrom?: string; link?: Parameters<TFn>[0] }> = {
  "cooling-centers": { rows: [["rowType", "kind"], ["rowStatus", "status"], ["rowHoursToday", "_today"], ["rowAddress", "address"], ["rowCity", "city"], ["rowPhone", "phone"]] },
  sandbags: { titleFrom: "city", rows: [["rowAddress", "address"], ["rowNotes", "notes"], ["rowPhone", "phone"]] },
  shelters: { rows: [["rowAddress", "address"], ["rowCity", "city"]] },
  bridges: { rows: [["rowRoad", "road"], ["rowCrosses", "crosses"], ["rowBuilt", "built"], ["rowStructure", "structure"]] },
  rivers: { rows: [] },
  railroads: { rows: [["rowType", "kind"]] },
  "historic-places": { rows: [["rowType", "kind"], ["rowAddress", "address"], ["rowCity", "city"], ["rowListed", "listed"]], link: "viewNara" },
  "historical-markers": { rows: [["rowSubtitle", "subtitle"], ["rowErected", "built"], ["rowErectedBy", "erected_by"], ["rowWhere", "where"]], link: "viewHmdb" },
  "mobile-home-parks": { rows: [["rowAddress", "address"], ["rowSpaces", "spaces"]] },
};
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** An alert's end time (ISO string or epoch ms) in the reader's locale. */
function untilText(v: unknown, locale: string): string {
  const d = typeof v === "number" ? new Date(v) : typeof v === "string" && v.trim() ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "";
}
/** "Tstm Wnd Gst" -> "Thunderstorm wind gust", etc.; unknown kinds as-is. */
const STORM_TITLES: Record<string, Parameters<TFn>[0]> = {
  "Tstm Wnd Gst": "stormTstmGust",
  "Tstm Wnd Dmg": "stormTstmDamage",
  "Non-Tstm Wnd Gst": "stormWindGust",
  "Non-Tstm Wnd Dmg": "stormWindDamage",
  "Marine Tstm Wind": "stormMarineWind",
  Hail: "stormHail",
  Tornado: "stormTornado",
  "Funnel Cloud": "stormFunnel",
  "Flash Flood": "stormFlashFlood",
  Flood: "stormFlood",
  "Heavy Rain": "stormHeavyRain",
  Snow: "stormSnow",
  "Heavy Snow": "stormHeavySnow",
};
function stormTitle(kind: string, t: TFn): string {
  return STORM_TITLES[kind] ? t(STORM_TITLES[kind]!) : kind;
}
const UTILITY_NAMES: Record<string, string> = { PGE: "PG&E", SCE: "SCE", SDGE: "SDG&E", SMUD: "SMUD" };
/** Spanish for the most common FARS light/weather values (else shown as-is). */
const FARS_ES: Record<string, string> = {
  Daylight: "De día",
  "Dark - Not Lighted": "De noche, sin alumbrado",
  "Dark - Lighted": "De noche, con alumbrado",
  "Dark - Unknown Lighting": "De noche, alumbrado desconocido",
  Dawn: "Amanecer",
  Dusk: "Anochecer",
  Clear: "Despejado",
  Cloudy: "Nublado",
  Rain: "Lluvia",
  "Fog, Smog, Smoke": "Niebla, smog o humo",
  Snow: "Nieve",
  "Severe Crosswinds": "Vientos cruzados fuertes",
  "Blowing Sand, Soil, Dirt": "Arena o tierra en el aire",
  "Freezing Rain or Drizzle": "Lluvia o llovizna helada",
  "Sleet or Hail": "Aguanieve o granizo",
  "Not Reported": "Sin dato",
  Unknown: "Desconocido",
  "Reported as Unknown": "Desconocido",
};

/** Voting hours text is English ("Mon-Fri 9:00 a.m.-7:00 p.m."); swap the words. */
function hoursEs(s: string): string {
  const words: [RegExp, string][] = [
    [/\bElection Day\b/g, "Día de las Elecciones"], [/\bDaily\b/g, "Todos los días"], [/\b24 hours\b/g, "24 horas"],
    [/\bfrom\b/g, "desde el"], [/\band\b/g, "y"], [/\bNov\b/g, "nov."], [/\bSat\b/g, "sáb"], [/\bSun\b/g, "dom"],
    [/\bMon\b/g, "lun"], [/\bTue\b/g, "mar"], [/\bWed\b/g, "mié"], [/\bThu\b/g, "jue"], [/\bFri\b/g, "vie"],
  ];
  return words.reduce((acc, [re, es]) => acc.replace(re, es), s);
}

/** Every voting location at the clicked spot (a library can be a vote center
 *  and a drop box): one title, then type + hours for each. */
function votingPopup(info: LayerInfo, feats: Record<string, unknown>[], i18n: I18nState): PopupSpec {
  const { t, lang, locale } = i18n;
  const s = (v: unknown) => (v == null ? "" : String(v).trim());
  const first = feats[0] ?? {};
  const rows: [string, string][] = [];
  // Overlapping dots can be different sites: only the clicked one's address.
  for (const p of feats.filter((x) => s(x.address) === s(first.address)).slice(0, 4)) {
    const opens = s(p.opens)
      ? `${t("rowOpens")} ${new Date(`${s(p.opens)}T12:00:00`).toLocaleDateString(locale, { month: "long", day: "numeric" })}. `
      : "";
    rows.push([t(VOTING_KEYS[s(p.kind)] ?? "votingDropBox"), opens + (lang === "es" ? hoursEs(s(p.hours)) : s(p.hours))]);
  }
  rows.push([t("rowAddress"), [s(first.address), s(first.city)].filter(Boolean).join(", ")]);
  return {
    kind: layerTitle(lang, info.name, info.title),
    color: OVERLAY_COLOR[info.name],
    title: s(first.name).replace(/\s*\(.*\)$/, "") || t("votingDropBox"),
    rows,
    link: { href: "https://www.stanvote.gov/", label: t("votingMore") },
  };
}
const DROUGHT_KEYS: Parameters<TFn>[0][] = ["droughtD0", "droughtD1", "droughtD2", "droughtD3", "droughtD4"];

const CHAIN_KEYS: Record<string, Parameters<TFn>[0]> = {
  "R-0": "chainR0",
  "R-1": "chainR1",
  "R-2": "chainR2",
  "R-3": "chainR3",
};

const AQI_KEYS: Record<string, Parameters<TFn>[0]> = {
  good: "aqiGood",
  moderate: "aqiModerate",
  usg: "aqiUsg",
  unhealthy: "aqiUnhealthy",
  very: "aqiVery",
  hazardous: "aqiHazardous",
};

/** EIA primary-fuel codes -> label keys. */
const FUEL_KEYS: Record<string, Parameters<TFn>[0]> = {
  WAT: "fuelHydro", NG: "fuelGas", SUN: "fuelSolar", WND: "fuelWind", GEO: "fuelGeo", NUC: "fuelNuclear",
  BIT: "fuelCoal", SUB: "fuelCoal", LIG: "fuelCoal", DFO: "fuelOil", RFO: "fuelOil", WDS: "fuelBio",
  LFG: "fuelBio", OBG: "fuelBio", AB: "fuelBio", MSW: "fuelBio", MWH: "fuelBattery",
};

const COMPASS_8: Record<Lang, string[]> = {
  en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  es: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
};

/** Degrees -> 8-point compass label ("from" direction for wind). */
function compass(deg: number | null, lang: Lang): string {
  if (deg == null) return "";
  return COMPASS_8[lang][Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

const HAZE_KEYS: Record<string, Parameters<TFn>[0]> = {
  clear: "hazeClear",
  "slightly-hazy": "hazeSlight",
  hazy: "hazeHazy",
  "very-hazy": "hazeVery",
  night: "hazeNight",
};

function overlayPopup(info: LayerInfo, p: Record<string, unknown>, i18n: I18nState): PopupSpec {
  const { t, lang, locale } = i18n;
  const kind = layerTitle(lang, info.name, info.title);
  const color = OVERLAY_COLOR[info.name];
  const str = (v: unknown) => (v == null ? "" : tidy(String(v)));
  const pick = (keys: string[]) => keys.map((k) => p[k]).find((v) => v != null && v !== "");
  // Numbers only — rejects null/""/booleans that Number() would coerce to 0/1.
  const num = (v: unknown): number | null =>
    (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v))
      ? Number(v)
      : null;
  const fmt = (v: unknown) => {
    const n = num(v);
    return n == null ? "" : n.toLocaleString(locale);
  };
  const base = { kind, color };

  // Live sources are already properly cased ("ISS (ZARYA)", species names):
  // show them as-is, unlike the ALL-CAPS GIS fields tidy() is for.
  const raw = (v: unknown) => (v == null ? "" : String(v).trim());
  const yn = (v: unknown) => (v === "yes" ? t("ynYes") : v === "no" ? t("ynNo") : raw(v));
  const kmMi = (km: unknown) => (num(km) != null ? t("kmMi", { km: fmt(km), mi: fmt(Math.round(num(km)! * 0.6214)) }) : "");
  switch (info.category) {
    case "space": {
      const isIss = info.name === "iss";
      const kp = num(p.kp);
      const aurora = auroraChance(kp);
      return {
        ...base,
        title: raw(p.name) || kind,
        rows: [
          [t("rowAltitude"), kmMi(p.alt_km)],
          [t("rowSpeed"), num(p.speed_kmh) != null ? t("kmhMph", { kmh: fmt(p.speed_kmh), mph: fmt(Math.round(num(p.speed_kmh)! * 0.6214)) }) : ""],
          [t("rowLight"), isIss ? t(p.sunlit === true ? "sunlit" : "inShadow") : ""],
          [t("rowKp"), kp != null ? t("kpValue", { n: kp.toFixed(1) }) : ""],
          [t("rowAurora"), aurora ? t(aurora === "possible" ? "auroraPossible" : aurora === "unlikely" ? "auroraUnlikely" : "auroraNone") : ""],
        ],
        link: isIss
          ? { href: "https://spotthestation.nasa.gov/", label: t("spotStation") }
          : num(p.norad) != null
            ? { href: `https://celestrak.org/satcat/table-satcat.php?CATNR=${num(p.norad)}`, label: t("satDetails") }
            : undefined,
      };
    }
    case "train":
      return {
        ...base,
        title: [raw(p.route), raw(p.number)].filter(Boolean).join(" ") || kind,
        rows: [
          [t("rowFromTo"), p.from && p.to ? `${raw(p.from)} → ${raw(p.to)}` : ""],
          [t("rowNextStop"), raw(p.next)],
          [t("rowSpeed"), num(p.speed_mph) != null ? t("mph", { n: fmt(p.speed_mph) }) : ""],
          [t("rowStatus"), raw(p.status)],
        ],
      };
    case "nature": {
      const name = raw(p.name) || kind;
      return {
        ...base,
        title: name,
        cameras: p.photo
          ? [{ name, src: String(p.photo), alt: name, credit: raw(p.photo_credit), linkLabel: "", newTab: t("opensNewTab") }]
          : undefined,
        rows: [
          [t("rowScientific"), raw(p.scientific) !== name ? raw(p.scientific) : ""],
          [t("rowObserved"), raw(p.observed)],
        ],
        link: p.page ? { href: String(p.page), label: t("viewINat") } : undefined,
      };
    }
    case "wiki":
      return {
        ...base,
        title: raw(p.name) || kind,
        rows: [[t("rowDistance"), num(p.dist_m) != null ? t("meters", { n: fmt(Math.round(num(p.dist_m)!)) }) : ""]],
        link: p.page ? { href: String(p.page), label: t("readWiki") } : undefined,
      };
    case "weather-now": {
      const mph = num(p.wind_mph);
      return {
        ...base,
        title: num(p.temp_f) != null ? t("tempF", { n: fmt(p.temp_f) }) : kind,
        rows: [
          [t("rowWind"), mph == null ? "" : mph < 1 ? t("calm") : t("windFrom", { mph: fmt(mph), dir: compass(num(p.wind_from), lang) })],
          [t("rowHumidity"), num(p.humidity) != null ? `${fmt(p.humidity)}%` : ""],
        ],
      };
    }
    case "poi":
      return {
        ...base,
        title: str(p.name) || t(POI_KEYS[info.name] ?? "unavailable"),
        rows: [
          [t("rowType"), p.name ? t(POI_KEYS[info.name] ?? "unavailable") : ""],
          [t("rowAddress"), str(p.address)],
          [t("rowAccess"), yn(p.access)],
          [t("rowHours"), raw(p.hours)],
          [t("rowFee"), yn(p.fee)],
          [t("rowWheelchair"), yn(p.wheelchair)],
          [t("rowIndoor"), p.indoor === true ? t("ynYes") : ""],
          [t("rowCapacity"), num(p.capacity) != null ? fmt(p.capacity) : ""],
          [t("rowSockets"), raw(p.sockets)],
        ],
        link: p.page ? { href: String(p.page), label: t("viewOSM") } : undefined,
      };
    case "hotspot": {
      const when = typeof p.acquired === "string" ? new Date(p.acquired) : null;
      const conf = raw(p.confidence);
      return {
        ...base,
        title: t("hotspotTitle"),
        rows: [
          [t("rowDetected"), when && !Number.isNaN(when.getTime()) ? when.toLocaleString(locale) : ""],
          [t("rowConfidence"), conf === "high" ? t("confHigh") : conf === "low" ? t("confLow") : conf ? t("confMedium") : ""],
          [t("rowPower"), num(p.frp_mw) != null ? t("mw", { n: fmt(p.frp_mw) }) : ""],
          [t("rowPass"), p.daynight === "night" ? t("passNight") : p.daynight === "day" ? t("passDay") : ""],
          [t("rowNote"), t("hotspotNote")],
        ],
      };
    }
    case "flight": {
      const onGround = p.on_ground === true;
      return {
        ...base,
        title: str(p.callsign) || t("unknownCallsign"),
        rows: [
          [t("rowType"), str(p.type)],
          [t("rowAltitude"), onGround ? t("onGround") : num(p.alt_ft) != null ? t("feet", { n: fmt(p.alt_ft) }) : ""],
          [t("rowSpeed"), num(p.speed_kt) != null ? t("knots", { n: fmt(p.speed_kt) }) : ""],
          [t("rowHeading"), num(p.track) != null ? `${fmt(p.track)}°` : ""],
        ],
      };
    }
    case "haze": {
      const name = str(p.name) || kind;
      const level = String(p.level ?? "unknown");
      const levelKey = HAZE_KEYS[level] ?? "hazeUnknown";
      return {
        ...base,
        title: name,
        cameras: [
          {
            name,
            src: typeof p.image === "string" ? p.image : undefined,
            alt: t("webcamAlt", { name }),
            credit: t("creditAlertCA"),
            href: typeof p.page === "string" ? p.page : undefined,
            linkLabel: t("openLiveView"),
            newTab: t("opensNewTab"),
          },
        ],
        rows: [
          [t("rowHaze"), t(levelKey)],
          [t("rowVisibility"), num(p.score) != null ? `${fmt(p.score)}/100` : ""],
          [t("rowNote"), t("hazeNote")],
        ],
      };
    }
    case "census":
      return {
        ...base,
        // "Census Tract 18; Stanislaus County; California" -> "Census Tract 18"
        // ACS names use ";" (Census API) or "," (Esri): keep "Census Tract 18".
        title: str(p.name).split(/[;,]/)[0]!.trim() || t("censusTract"),
        rows: [
          [t("medianIncome"), num(p.median_income) != null ? `$${fmt(p.median_income)}` : ""],
          [t("population"), fmt(p.population)],
          [t("rowSpanish"), num(p.pct_spanish) != null ? `${fmt(p.pct_spanish)}%` : ""],
          [t("rowForeignBorn"), num(p.pct_foreign_born) != null ? `${fmt(p.pct_foreign_born)}%` : ""],
          [t("rowPoverty"), num(p.pct_poverty) != null ? `${fmt(p.pct_poverty)}%` : ""],
          [t("rowRenters"), num(p.pct_renters) != null ? `${fmt(p.pct_renters)}%` : ""],
        ],
      };
    case "quake": {
      const mag = num(p.mag);
      const time = num(p.time);
      return {
        ...base,
        title: mag != null ? `M ${mag.toFixed(1)}` : t("earthquake"),
        rows: [
          [t("rowLocation"), str(p.place)],
          [t("rowTime"), time != null ? new Date(time).toLocaleString(locale) : ""],
        ],
      };
    }
    case "fire": {
      const acres = pick(["DailyAcres", "GISAcres", "IncidentSize"]);
      const pct = num(pick(["PercentContained", "poly_PercentContained"]));
      return {
        ...base,
        title: str(pick(["IncidentName", "poly_IncidentName", "name"])) || t("wildfire"),
        rows: [
          [t("rowSize"), num(acres) != null ? t("acres", { n: fmt(acres) }) : t("active")],
          [t("rowContained"), pct != null ? `${Math.round(pct)}%` : ""],
        ],
      };
    }
    case "volcano": {
      const c = raw(p.color);
      return {
        ...base,
        title: raw(p.name) || kind,
        rows: [
          [t("rowAviationCode"), VOLCANO_KEYS[c] ? t(VOLCANO_KEYS[c]!) : ""],
          [t("rowAlertLevel"), VOLCANO_ALERT_KEYS[raw(p.alert).toUpperCase()] ? t(VOLCANO_ALERT_KEYS[raw(p.alert).toUpperCase()]!) : raw(p.alert)],
          [t("rowObservatory"), raw(p.observatory)],
          [
            t("rowLastNotice"),
            /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw(p.since))
              ? new Date(`${raw(p.since).replace(" ", "T")}Z`).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
              : "",
          ],
        ],
        link: raw(p.page) ? { href: raw(p.page), label: t("volcanoMore") } : undefined,
      };
    }
    case "dev": {
      const stage = DEV_STAGES.find(([s]) => s === raw(p.stage));
      const day = (v: unknown) =>
        /^\d{4}-\d{2}-\d{2}$/.test(raw(v)) ? new Date(`${raw(v)}T12:00:00`).toLocaleDateString(locale, { dateStyle: "medium" }) : "";
      const units = num(p.units);
      if (info.name === "ceqa-projects") {
        return {
          ...base,
          title: raw(p.name) || kind,
          rows: [
            [t("rowDevStage"), stage ? t(stage[2]) : ""],
            [t("rowDocument"), raw(p.doc)],
            [t("rowLeadAgency"), raw(p.agency)],
            [t("rowFiled"), day(p.received)],
            [t("rowDevType"), raw(p.development)],
            [t("rowLocalAction"), raw(p.action)],
            [t("rowAcres"), num(p.acres) != null ? fmt(p.acres) : ""],
            [t("rowAbout"), raw(p.description)],
          ],
          link: raw(p.page) ? { href: raw(p.page), label: t("ceqaMore") } : undefined,
        };
      }
      if (p.grouped === true) {
        // Single homes / ADUs: counted per area, never pinned at an address.
        const count = (k: string) => (num(p[k]) ? fmt(p[k]) : "");
        return {
          ...base,
          title: info.name === "new-homes" ? t("devHomesHere", { city: raw(p.city) }) : t("devSmallHere", { city: raw(p.city) }),
          rows: [
            [t("rowDevStage"), stage ? t(stage[2]) : ""],
            [t("rowUnits"), units ? fmt(units) : ""],
            [t("rowProjects"), count("projects")],
            [t("devCompleted"), count("completed")],
            [t("devPermitted"), count("permitted")],
            [t("devApproved"), info.name === "new-homes" ? count("approved") : ""],
            [t("rowLatest"), day(p.date) || day(p.submitted)],
            [t("rowNote"), t("devGroupedNote")],
          ],
        };
      }
      return {
        ...base,
        title: raw(p.name) || raw(p.address) || kind,
        rows: [
          [t("rowDevStage"), stage ? t(stage[2]) : ""],
          [t("rowAddress"), [raw(p.address), raw(p.city)].filter(Boolean).join(", ")],
          [t("rowHousingType"), raw(p.kind)],
          [t("rowUnits"), units ? fmt(units) : ""],
          [t("rowApprovedUnits"), num(p.approved_units) ? fmt(p.approved_units) : ""],
          [t("rowFiled"), day(p.submitted)],
          [t("rowStageDate"), day(p.date)],
          [t("rowReportYear"), num(p.year) ? String(p.year) : ""],
        ],
      };
    }
    case "park":
      return {
        ...base,
        title: raw(p.name) || kind,
        rows: [
          [t("rowType"), raw(p.kind)],
          [t("rowState"), raw(p.state)],
        ],
      };
    case "gauge": {
      const st = raw(p.status);
      return {
        ...base,
        title: [raw(p.waterbody), raw(p.location)].filter(Boolean).join(" — ") || kind,
        rows: [
          [t("rowStatus"), GAUGE_KEYS[st] ? t(GAUGE_KEYS[st]!) : ""],
          [/cfs/i.test(raw(p.units)) ? t("rowFlow") : t("rowStage"), num(p.stage) != null ? `${fmt(p.stage)} ${raw(p.units)}` : ""],
          [t("rowFloodStage"), num(p.flood) != null ? `${fmt(p.flood)} ${raw(p.units)}` : ""],
          [
            t("rowTime"),
            /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw(p.observed_at))
              ? new Date(`${raw(p.observed_at).replace(" ", "T")}Z`).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
              : "",
          ],
        ],
        link: raw(p.page) ? { href: raw(p.page), label: t("gaugeMore") } : undefined,
      };
    }
    case "storm": {
      const tm = num(p.time);
      return {
        ...base,
        title: stormTitle(raw(p.kind), t) || kind,
        rows: [
          [t("rowMagnitude"), raw(p.magnitude) ? `${raw(p.magnitude)} ${raw(p.units)}` : ""],
          [t("rowWhere"), [raw(p.where), raw(p.state)].filter(Boolean).join(", ")],
          [t("rowTime"), tm != null ? new Date(tm).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : ""],
          [t("rowNotes"), raw(p.remarks)],
        ],
      };
    }
    case "firewx": {
      const lvl = num(p.level);
      const ex = raw(p.expires); // "202610171200" (UTC)
      const exDate = /^\d{12}$/.test(ex)
        ? new Date(Date.UTC(+ex.slice(0, 4), +ex.slice(4, 6) - 1, +ex.slice(6, 8), +ex.slice(8, 10), +ex.slice(10, 12)))
        : null;
      return {
        ...base,
        title: t(FIREWX_KEYS[lvl ?? 5] ?? "firewxElevated"),
        rows: [[t("rowUntil"), exDate ? exDate.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : ""]],
        link: { href: "https://www.spc.noaa.gov/products/fire_wx/", label: t("firewxMore") },
      };
    }
    case "groundwater": {
      const chg = num(p.change_ft);
      const day = (v: unknown) => (raw(v) ? new Date(`${raw(v)}T12:00:00`).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }) : "");
      return {
        ...base,
        title: num(p.depth_ft) != null ? t("gwDepth", { n: fmt(p.depth_ft) }) : kind,
        rows: [
          [t("rowMeasured"), day(p.date)],
          [
            t("gwChange", { since: day(p.since) }),
            chg == null ? "" : chg > 0 ? t("gwDeeper", { n: fmt(chg) }) : chg < 0 ? t("gwShallower", { n: fmt(-chg) }) : t("gwSame"),
          ],
          [t("rowWellUse"), raw(p.use)],
          [t("rowWellDepth"), num(p.well_depth_ft) != null ? `${fmt(p.well_depth_ft)} ft` : ""],
          [t("rowCounty"), raw(p.county)],
        ],
      };
    }
    case "wastewater": {
      const lvl = (v: unknown) => (WVAL_KEYS[raw(v)] ? t(WVAL_KEYS[raw(v)]!) : "");
      const wk = raw(p.week);
      return {
        ...base,
        title: raw(p.county) || kind,
        rows: [
          ["COVID-19", lvl(p.covid)],
          [t("rowFlu"), lvl(p.flu)],
          [t("rowRsv"), lvl(p.rsv)],
          [t("rowPlants"), fmt(p.sites)],
          [t("rowWeekOf"), wk ? new Date(`${wk}T12:00:00`).toLocaleDateString(locale, { month: "long", day: "numeric" }) : ""],
        ],
        link: { href: "https://www.cdc.gov/nwss/rv/", label: t("wastewaterMore") },
      };
    }
    case "bus": {
      const upd = num(p.updated);
      return {
        ...base,
        title: raw(p.route) ? t("busRoute", { route: raw(p.route) }) : kind,
        rows: [
          [t("rowSpeed"), num(p.speed_mph) != null ? t("mph", { n: fmt(p.speed_mph) }) : ""],
          [t("rowVehicle"), raw(p.vehicle)],
          [t("rowTime"), upd != null ? new Date(upd).toLocaleTimeString(locale, { timeStyle: "short" }) : ""],
        ],
        link: { href: "https://www.stanrta.org/", label: t("busSchedules") },
      };
    }
    case "outage":
    case "outage-area": {
      const when = (v: unknown) => (num(v) != null ? new Date(num(v)!).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "");
      const type = str(p.type).toLowerCase();
      return {
        ...base,
        title: t("outageTitle", { utility: UTILITY_NAMES[str(p.utility).toUpperCase()] ?? raw(p.utility) }),
        rows: [
          [t("rowCustomers"), fmt(p.customers)],
          [t("rowType"), type === "planned" ? t("outagePlanned") : type === "unplanned" ? t("outageUnplanned") : ""],
          [t("rowCause"), raw(p.cause)],
          [t("rowStarted"), when(p.started)],
          [t("rowRestoreEta"), when(p.restore_eta)],
        ],
      };
    }
    case "health":
      return {
        ...base,
        title: num(p.pct) != null ? t("pctOfAdults", { n: fmt(p.pct) }) : kind,
        rows: [
          [t("rowTract"), raw(p.tract)],
          [t("rowCounty"), raw(p.county)],
          [t("rowSource"), "CDC PLACES"],
        ],
      };
    case "crash": {
      const m = num(p.month), y = num(p.year);
      const es = lang === "es";
      return {
        ...base,
        title: num(p.fatalities) != null ? t("crashTitle", { n: fmt(p.fatalities) }) : kind,
        rows: [
          [t("rowWhen"), m != null && m >= 1 && m <= 12 && y != null ? new Date(y, m - 1, 15).toLocaleDateString(locale, { month: "long", year: "numeric" }) : ""],
          [t("rowTime"), raw(p.hour)],
          [t("rowRoad"), str(p.road)],
          [t("rowPedestrians"), num(p.pedestrians) ? fmt(p.pedestrians) : ""],
          [t("rowLight"), (es && FARS_ES[raw(p.light)]) || raw(p.light)],
          [t("rowWeather"), (es && FARS_ES[raw(p.weather)]) || raw(p.weather)],
        ],
      };
    }
    case "reservoir":
      return {
        ...base,
        title: tidy(raw(p.name)) || kind,
        rows: [
          [t("rowFull"), num(p.pct_full) != null ? `${fmt(p.pct_full)}%` : ""],
          [t("rowOfAverage"), num(p.pct_avg) != null ? `${fmt(p.pct_avg)}%` : ""],
          [t("rowStorage"), num(p.storage_af) != null ? t("acreFeet", { n: fmt(p.storage_af), cap: fmt(p.capacity_af) }) : ""],
          [t("rowOperator"), raw(p.operator)],
          [t("rowAsOf"), raw(p.as_of)],
        ],
      };
    case "drought":
      return {
        ...base,
        title: DROUGHT_KEYS[num(p.dm) ?? -1] ? t(DROUGHT_KEYS[num(p.dm)!]!) : kind,
        rows: [[t("rowSource"), "U.S. Drought Monitor"]],
        link: { href: "https://droughtmonitor.unl.edu/", label: t("droughtMore") },
      };
    case "weather":
      return {
        ...base,
        title: str(pick(["event", "headline"])) || t("alert"),
        rows: [
          [t("rowArea"), str(p.areaDesc)],
          [t("rowSeverity"), str(p.severity)],
          [t("rowUntil"), untilText(p.ends, locale)],
        ],
      };
    case "enviroscreen": {
      const pct = num(p.CIscoreP);
      return {
        ...base,
        title: pct != null ? t("enviroPct", { n: ordinal(lang, Math.round(pct)) }) : kind,
        rows: [[t("censusTract"), str(p.tract)]],
      };
    }
    case "hazard": {
      if (info.name === "flood") {
        const zone = String(p.FLD_ZONE ?? "").toUpperCase();
        const sub = String(p.ZONE_SUBTY ?? "");
        const risk = t(floodRiskKey(zone, sub));
        return { ...base, title: risk, rows: [[t("rowZone"), zone], [t("rowSubtype"), str(sub)]] };
      }
      const raw = String(p.FHSZ_Description ?? "").toLowerCase();
      const level = raw.includes("very")
        ? t("fireVeryHigh")
        : raw.includes("high")
          ? t("fireHigh")
          : raw.includes("moderate")
            ? t("fireModerate")
            : "";
      return { ...base, title: level ? t("fireLevel", { level }) : kind };
    }
    case "roadops":
      return {
        ...base,
        title: str(pick(["route"])) || kind,
        rows: [
          [t("rowType"), str(pick(["type"])) || t("closure")],
          [t("rowWork"), raw(p.work)],
          [t("rowLanes"), raw(p.lanes)],
        ],
      };
    case "legal": {
      const kinds = raw(p.kinds).split("|").map((k) => LEGAL_KIND_KEYS[k as LegalKind]).filter((k): k is Key => !!k);
      const cost = LEGAL_COST_KEYS[raw(p.cost) as LegalOffice["cost"]] ?? "costVaries";
      return {
        ...base,
        title: raw(p.name) || kind,
        rows: [
          [t("rowHelpsWith"), kinds.map((k) => t(k)).join(", ")],
          [t("rowCost"), t(cost) + (p.eoir === true ? ` · ${t("legalEoir")}` : "")],
          [t("rowAddress"), [raw(p.address), raw(p.city)].filter(Boolean).join(", ")],
          [t("rowPhone"), raw(p.phone)],
          [t("rowLanguages"), raw(p.languages).split("|").filter(Boolean).join(", ")],
        ],
        link: { href: raw(p.website), label: t("legalWebsite"), hosts: LEGAL_SITE_HOSTS },
      };
    }
    case "info": {
      const spec = INFO_FIELDS[info.name] ?? { rows: [] };
      const value = (prop: string) => (prop === "_today" ? str(p[DAY_KEYS[new Date().getDay()]!]) : str(p[prop]));
      return {
        ...base,
        title: str(p[spec.titleFrom ?? "name"]) || kind,
        rows: spec.rows.map(([k, prop]) => [t(k), value(prop)] as [string, string]),
        link: spec.link && p.page ? { href: String(p.page), label: t(spec.link) } : undefined,
      };
    }
    case "roadweather": {
      const wind = num(p.wind_mph), gust = num(p.gust_mph);
      return {
        ...base,
        title: raw(p.name) || kind,
        rows: [
          [t("rowTemp"), num(p.temp_f) != null ? t("tempF", { n: fmt(p.temp_f) }) : ""],
          [t("rowWind"), wind == null ? "" : gust != null && gust > wind ? t("windGust", { mph: fmt(wind), gust: fmt(gust) }) : t("mph", { n: fmt(wind) })],
          [t("rowHumidity"), num(p.humidity) != null ? `${fmt(p.humidity)}%` : ""],
          [t("rowElevation"), num(p.elevation_ft) != null ? t("feet", { n: fmt(p.elevation_ft) }) : ""],
        ],
      };
    }
    case "chain": {
      const code = raw(p.status);
      const key = CHAIN_KEYS[code];
      return {
        ...base,
        title: [raw(p.route), str(p.name)].filter(Boolean).join(" · ") || kind,
        rows: [
          [t("rowChains"), key ? t(key) : ""],
          [t("rowDetail"), raw(p.detail)],
        ],
      };
    }
    case "perimeter":
      return {
        ...base,
        title: str(p.name) || kind,
        rows: [
          [t("rowSize"), num(p.acres) != null ? t("acres", { n: fmt(Math.round(num(p.acres)!)) }) : ""],
          [t("rowContained"), num(p.contained) != null ? `${fmt(p.contained)}%` : ""],
        ],
      };
    case "fault":
      return {
        ...base,
        title: raw(p.name) && raw(p.name) !== "unnamed" ? str(p.name) : str(p.zone) || kind,
        rows: [
          [t("rowFaultZone"), str(p.zone)],
          [t("rowSection"), str(p.section)],
          [t("rowCertainty"), raw(p.certainty)],
        ],
      };
    case "superfund":
      return {
        ...base,
        title: raw(p.name) || kind,
        rows: [
          [t("rowCity"), raw(p.city)],
          [t("rowStatus"), raw(p.status)],
          [t("rowListed"), raw(p.listed)],
          [t("rowCleanupBuilt"), raw(p.cleanup_built)],
        ],
        link: p.page ? { href: String(p.page), label: t("viewEpa") } : undefined,
      };
    case "power": {
      const kv = num(p.max_kv);
      return {
        ...base,
        title: str(p.name) || kind,
        rows: [
          [t("rowOperator"), str(p.operator)],
          [t("rowFuel"), p.fuel ? t(FUEL_KEYS[raw(p.fuel)] ?? "fuelOther") : ""],
          [t("rowCapacityMw"), num(p.capacity_mw) != null ? t("mw", { n: fmt(p.capacity_mw) }) : ""],
          [t("rowVoltage"), kv != null && kv > 0 ? t("kv", { n: fmt(kv) }) : ""],
        ],
      };
    }
    case "aqi": {
      const cat = raw(p.category);
      return {
        ...base,
        title: num(p.aqi) != null ? t("aqi", { n: fmt(p.aqi) }) : kind,
        rows: [
          [t("rowSite"), raw(p.name)],
          [t("rowCategory"), AQI_KEYS[cat] ? t(AQI_KEYS[cat]!) : ""],
          [t("rowPm25"), num(p.pm2_5) != null ? t("ugm3", { n: fmt(p.pm2_5) }) : ""],
          [t("rowOzone"), num(p.ozone_ppb) != null ? t("ppb", { n: fmt(p.ozone_ppb) }) : num(p.ozone) != null ? t("ugm3", { n: fmt(p.ozone) }) : ""],
        ],
      };
    }
    default: {
      if (p.aqi != null) {
        return {
          ...base,
          title: t("aqi", { n: str(p.aqi) }),
          rows: [
            [t("rowCategory"), str(p.category)],
            [t("rowPollutant"), str(p.parameter)],
            [t("rowArea"), str(p.area)],
          ],
        };
      }
      if (p.streamflow_cfs != null || p.gage_height_ft != null) {
        return {
          ...base,
          title: str(p.name) || t("riverGauge"),
          rows: [
            [t("rowFlow"), num(p.streamflow_cfs) != null ? `${fmt(p.streamflow_cfs)} cfs` : ""],
            [t("rowGaugeHeight"), num(p.gage_height_ft) != null ? `${fmt(p.gage_height_ft)} ft` : ""],
          ],
        };
      }
      const title =
        str(
          pick([
            "name", "NAME", "stop_name", "GP_Descr", "GP", "Zone_Descr", "Zone_Label",
            "Name", "ARPT_NAME", "School", "SCHOOL", "school", "descr",
          ]),
        ) || kind;
      const address = str(pick(["ADDRESS", "Address", "address", "STREET", "street", "Situs_Address"]));
      const height = num(p.height_ft);
      return {
        ...base,
        title,
        rows: [
          // Some federal datasets put the facility name in ADDRESS — skip duplicates.
          [t("rowAddress"), address.toLowerCase() === title.toLowerCase() ? "" : address],
          [t("rowCity"), str(pick(["CITY", "City", "city", "Situs_City"]))],
          [t("rowType"), str(pick(["TYPE", "Type"]))],
          [t("rowPhone"), String(pick(["TELEPHONE", "Phone", "phone"]) ?? "")],
          [t("rowHeight"), height != null ? `${fmt(height)} ft` : ""],
        ],
      };
    }
  }
}

function zoomCluster(map: maplibregl.Map, source: string, e: LayerMouseEvent) {
  const feature = e.features?.[0];
  const clusterId = feature?.properties?.cluster_id;
  if (typeof clusterId !== "number") return;
  const src = map.getSource(source) as GeoJSONSource;
  src
    .getClusterExpansionZoom(clusterId)
    .then((zoom) => {
      const geom = feature?.geometry;
      if (geom?.type === "Point") {
        map.easeTo({ center: geom.coordinates as [number, number], zoom, ...(prefersReducedMotion() ? { duration: 0 } : {}) });
      }
    })
    .catch(() => {
      /* cluster expansion can fail if tiles aren't ready; ignore */
    });
}

// "What can see me?": find ALPR readers within `radiusM` of a dropped pin.
async function runCoverage(
  map: maplibregl.Map,
  lngLat: maplibregl.LngLat,
  dataRef: { current: GeoJSON.FeatureCollection | null },
  radiusM: number,
  onResult: (n: number | null) => void,
) {
  // Nationwide: the tiles around the pin, whatever the zoom or what's drawn.
  lngLat = lngLat.wrap(); // a click on a repeated copy of the world
  let near: GeoJSON.FeatureCollection | null;
  try {
    near = await alprNear(lngLat.lng, lngLat.lat, radiusM);
  } catch {
    onResult(null); // shows an error — never a false "nothing can see you"
    return;
  }
  if (near) dataRef = { current: near };
  else if (!dataRef.current) {
    try {
      const r = await fetch(api.layerUrl("alpr"));
      if (!r.ok) throw new Error(String(r.status));
      dataRef.current = await r.json();
    } catch {
      onResult(null);
      return;
    }
  }
  if (!mapRef_isAlive(map)) return;
  const hits: GeoJSON.Feature[] = [];
  for (const f of dataRef.current?.features ?? []) {
    if (f.geometry?.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    if (haversine(lngLat.lng, lngLat.lat, lon, lat) <= radiusM) hits.push(f);
  }
  const set = (id: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature) =>
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(data as GeoJSON.GeoJSON);
  set("cov-pin", { type: "Feature", geometry: { type: "Point", coordinates: [lngLat.lng, lngLat.lat] }, properties: {} });
  set("cov-radius", circlePolygon(lngLat.lng, lngLat.lat, radiusM));
  set("cov-hits", { type: "FeatureCollection", features: hits });
  onResult(hits.length);
}

function mapRef_isAlive(map: maplibregl.Map): boolean {
  try {
    return !!map.getStyle();
  } catch {
    return false;
  }
}

function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function circlePolygon(lng: number, lat: number, radiusM: number, points = 64): GeoJSON.Feature {
  const coords: [number, number][] = [];
  const latR = radiusM / 111320;
  const lonR = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 2 * Math.PI;
    coords.push([lng + lonR * Math.cos(t), lat + latR * Math.sin(t)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
