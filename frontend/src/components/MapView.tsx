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
import { floodRiskKey, isMissing, tidy } from "../popup-logic";
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
            const { t: tt } = i18nRef.current;
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
                  [tt("operator"), p.operator ? String(p.operator) : tt("notTagged")],
                  [tt("rowFacing"), facing(p.direction, tt)],
                  ["OpenStreetMap", p.osm_id != null ? `#${p.osm_id}` : ""],
                ],
              }),
              tt,
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
      const on = layers.overlays[info.name] ?? false;
      const loaded = overlaysLoadedRef.current.has(info.name);

      if (on && !loaded && info.available) {
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
const OVERLAY_SUFFIXES = ["-fill", "-line", "-circle"];

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
  const isPoint = geomType.includes("Point");

  const bindPopup = (layerId: string) => {
    map.on("click", layerId, (e: LayerMouseEvent) => {
      const i18n = getI18n();
      openPopup(
        map,
        e.lngLat,
        popupHtml(overlayPopup(info, e.features?.[0]?.properties ?? {}, i18n)),
        i18n.t,
      );
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
    map.addLayer(
      {
        id: `${src}-circle`,
        type: "circle",
        source: src,
        paint: {
          "circle-color": accent,
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
function openPopup(map: maplibregl.Map, lngLat: maplibregl.LngLat, html: string, t: TFn) {
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
}

interface PopupSpec {
  /** What was clicked, e.g. "License plate reader" / layer name. */
  kind: string;
  /** Layer color for the header dot (from our own palette). */
  color?: string;
  title: string;
  /** [label, value] rows; empty values are dropped. */
  rows?: [string, string][];
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
    (rows ? `<dl class="popup__rows">${rows}</dl>` : "") +
    `</div>`
  );
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
