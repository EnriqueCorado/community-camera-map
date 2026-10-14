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
import { useI18n, layerTitle, ordinal, translateDirection, type TFn, type Lang } from "../i18n";
import { prefersReducedMotion } from "../motion";
import {
  floodRiskKey,
  freshImage,
  isMissing,
  safeUrl,
  tidy,
  WEBCAM_IMAGE_HOSTS,
  WEBCAM_PAGE_HOSTS,
} from "../popup-logic";
import { attribute, BASIS_KEY, describe, formatRecordDate, type AlprAccess, type Attribution } from "../alpr-access";
import { deadReckon, gibsSatelliteUrl, RAINVIEWER_URL, radarFrames } from "../live";
import { CAM, ALPR_CLUSTER, VENDOR_COLORS, OVERLAY_COLOR, CENSUS_STOPS, ENVIRO_STOPS } from "../colors";

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
  initialView: { center: [number, number]; zoom: number } | null;
  onView: (v: { center: [number, number]; zoom: number }) => void;
  coverage: { active: boolean; radiusM: number };
  onCoverageResult: (hits: number | null) => void;
  /** Incremented to run "what can see me?" at the map center (keyboard path). */
  coverageCenterTick: number;
  /** Open the sourced "who can search this plate reader?" panel. */
  onAlprAccess: (a: Attribution) => void;
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
  initialView,
  onView,
  coverage,
  onCoverageResult,
  coverageCenterTick,
  onAlprAccess,
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
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const coverageRef = useRef(coverage);
  coverageRef.current = coverage;
  const onCoverageResultRef = useRef(onCoverageResult);
  onCoverageResultRef.current = onCoverageResult;
  const alprDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const onAlprAccessRef = useRef(onAlprAccess);
  onAlprAccessRef.current = onAlprAccess;
  // "Who can search it" profiles, for synchronous popup rendering.
  const alprAccessRef = useRef<AlprAccess | null>(null);
  const warmAlprAccess = () =>
    void api.alprAccess().then(
      (a) => (alprAccessRef.current = a),
      () => {}, // popups degrade to the basis line; the next click retries
    );
  const initialViewRef = useRef(initialView); // read once at map creation

  // --- Create the map + all sources/layers once. ---
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: initialViewRef.current?.center ?? CA_CENTER,
      zoom: initialViewRef.current?.zoom ?? 5.4,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __map?: maplibregl.Map }).__map = map; // e2e test handle
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Keep the GL canvas sized to its container. Without this, a container that
    // resizes after init (sidebar layout, tab, split view) leaves the map
    // rendering at a stale size so pans/zooms appear not to update.
    const ro = new ResizeObserver(() => map.resize());
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

      fetch(api.layerUrl("alpr"))
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
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
        fetch(api.layerUrl(info.name))
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((data: GeoJSON.FeatureCollection) => {
            if (mapRef.current) addOverlay(map, info, data, () => i18nRef.current);
            setOverlayVisible(map, info.name, layersRef.current.overlays[info.name] ?? false);
          })
          .catch(() => overlaysLoadedRef.current.delete(info.name));
      } else if (loaded) {
        setOverlayVisible(map, info.name, on);
      }
    }
  }, [layers.overlays, overlayInfos, ready]);

  // --- Live flights: keep the dots moving while the layer is on. The dev API
  // refreshes every 15 s; the static site's file is rebuilt every 15 min. ---
  const flightsOn = layers.overlays["flights"] ?? false;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flightsOn) return;
    let base: Parameters<typeof deadReckon>[0] | null = null;
    const poll = () => {
      if (document.hidden) return;
      // Cache-bust in static mode: GitHub Pages serves data with a 10-minute max-age.
      const url = `${api.layerUrl("flights")}${api.static ? `?t=${Math.floor(Date.now() / 60_000)}` : ""}`;
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data: Parameters<typeof deadReckon>[0]) => {
          base = data;
          (map.getSource("ov-flights") as GeoJSONSource | undefined)?.setData(deadReckon(data, Date.now() / 1000));
        })
        .catch(() => {}); // keep the last good positions
    };
    poll();
    const fetchId = window.setInterval(poll, api.static ? 5 * 60_000 : 15_000);
    const onVisible = () => !document.hidden && poll(); // catch up after a background tab
    document.addEventListener("visibilitychange", onVisible);
    // Glide dots along their heading between updates (fresh data only; the
    // static snapshot is minutes old, so it isn't animated).
    const moveId =
      prefersReducedMotion() || api.static
        ? undefined
        : window.setInterval(() => {
            const src = map.getSource("ov-flights") as GeoJSONSource | undefined;
            if (!base || !src || document.hidden) return;
            const next = deadReckon(base, Date.now() / 1000);
            if (next !== base) src.setData(next);
          }, 1000);
    return () => {
      window.clearInterval(fetchId);
      document.removeEventListener("visibilitychange", onVisible);
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

  return <div ref={containerRef} className="map" />;
}

// --- helpers ---

function applyVisibility(map: maplibregl.Map, layers: LayerState) {
  const set = (id: string, on: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  for (const id of ["cam-clusters", "cam-cluster-count", "cam-points", "cam-selected"]) {
    set(id, layers.cameras);
  }
  for (const id of ["alpr-clusters", "alpr-cluster-count", "alpr-points"]) set(id, layers.alpr);

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
const OVERLAY_SUFFIXES = ["-fill", "-line", "-circle", "-label", "-raster"];

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

function firstGeometryType(data: GeoJSON.FeatureCollection): string {
  return data.features.find((f) => f.geometry)?.geometry?.type ?? "Polygon";
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
  const geomType = firstGeometryType(data);
  // Live point layers can legitimately be empty (e.g. no flights right now).
  const isPoint = geomType.includes("Point") || ["flight", "haze", "webcam"].includes(info.category);

  const bindPopup = (layerId: string) => {
    map.on("click", layerId, (e: LayerMouseEvent) => {
      const i18n = getI18n();
      const feats = (e.features ?? []).map((f) => f.properties ?? {});
      const spec =
        info.category === "webcam" ? webcamPopup(info, feats, i18n) : overlayPopup(info, feats[0] ?? {}, i18n);
      openPopup(map, e.lngLat, popupHtml(spec), i18n.t);
    });
    map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
  };

  if (isPoint) {
    // Quakes scale by magnitude; everything else is a fixed dot.
    const radius: maplibregl.ExpressionSpecification | number =
      info.category === "quake"
        ? ["interpolate", ["linear"], ["coalesce", ["get", "mag"], 1], 1, 3, 6, 16]
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
          : accent;
    map.addLayer(
      {
        id: `${src}-circle`,
        type: "circle",
        source: src,
        paint: {
          "circle-color": color,
          "circle-radius": radius,
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
        },
        layout: { visibility: "none" },
      },
      beforeId,
    );
    bindPopup(`${src}-circle`);
    if (info.category === "flight") {
      map.addLayer(
        {
          id: `${src}-label`,
          type: "symbol",
          source: src,
          minzoom: 9,
          layout: {
            visibility: "none",
            "text-field": ["get", "callsign"],
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

  if (geomType.includes("LineString")) {
    map.addLayer(
      {
        id: `${src}-line`,
        type: "line",
        source: src,
        paint: {
          "line-color": accent,
          "line-width": info.category === "roadops" ? 3 : 2,
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
      ? choropleth("median_income", CENSUS_STOPS)
      : info.category === "enviroscreen"
        ? choropleth("CIscoreP", ENVIRO_STOPS)
        : {
            "fill-color": accent,
            "fill-opacity":
              info.category === "landuse" ? 0.22 : info.category === "weather" ? 0.18 : 0.14,
          };
  const choroplethCat = info.category === "census" || info.category === "enviroscreen";

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
    (s.section ? sectionHtml(s.section) : "") +
    `</div>`
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

  switch (info.category) {
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
        title: str(p.name).split(";")[0]!.trim() || t("censusTract"),
        rows: [
          [t("medianIncome"), num(p.median_income) != null ? `$${fmt(p.median_income)}` : ""],
          [t("population"), fmt(p.population)],
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
    case "weather":
      return {
        ...base,
        title: str(pick(["event", "headline"])) || t("alert"),
        rows: [
          [t("rowArea"), str(p.areaDesc)],
          [t("rowSeverity"), str(p.severity)],
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
        rows: [[t("rowType"), str(pick(["type"])) || t("closure")]],
      };
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
  if (!dataRef.current) {
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
