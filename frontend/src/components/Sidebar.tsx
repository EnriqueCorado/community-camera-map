import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Camera } from "../types";
import { api, type LayerInfo } from "../api/client";
import { ago } from "../freshness";
import type { LayerState } from "./MapView";
import { matchCamera } from "../camera-data";
import {
  CAM, VENDOR_COLORS, VENDOR_SWATCH, OVERLAY_COLOR, CENSUS_STOPS, ENVIRO_STOPS, CENSUS_FIELD, PCT_STOPS,
  HEALTH_STOPS, metricStops, fmtMetric, DROUGHT_COLORS, HEAT_COLORS, LAND_COVER_CLASSES, CROP_CLASSES, RESERVOIR_STOPS, VOTING_COLORS, OUTAGE_COLORS, VOTING_KEYS, WVAL_COLORS,
  WVAL_KEYS, GROUNDWATER_STOPS, GAUGE_COLORS, FIREWX_COLORS, GAUGE_KEYS, GAUGE_OTHER, FIREWX_KEYS, STORM_KINDS,
  VOLCANO_COLORS, VOLCANO_KEYS, DEV_STAGES,
} from "../colors";
import { downloadLayer, downloadCameras } from "../download";
import { LIVE_SOURCES } from "../live-sources";
import { covers, stateName, statesAt } from "../view-logic";
import { OSM_MIN_ZOOM } from "../osm-sources";
import { NearMe, type NearPoint } from "./NearMe";
import { HistoryPicker } from "./HistoryPicker";
import { PRESETS, activePreset, applyPreset } from "../presets";
import { HISTORY_LAYERS } from "../history";
import { useI18n, layerTitle, type Key } from "../i18n";

export interface Coverage {
  active: boolean;
  radiusM: number;
}

export interface Place {
  /** Proper-noun label, or an i18n key for generic labels. */
  label: string;
  labelKey?: Key;
  center: [number, number];
  zoom: number;
}

export const PLACES: Place[] = [
  { label: "Oakdale", center: [-120.847, 37.766], zoom: 13 },
  { label: "Modesto", center: [-120.997, 37.639], zoom: 12 },
  { label: "Stanislaus", center: [-120.95, 37.6], zoom: 10 },
  { label: "All of California", labelKey: "allOfCA", center: [-119.4, 37.2], zoom: 5.4 },
  { label: "All of the US", labelKey: "allOfUS", center: [-98.6, 39.5], zoom: 3.3 },
];

// Which sidebar sections the viewer collapsed (per-browser convenience only).
const COLLAPSED_KEY = "scm-collapsed";

function readCollapsed(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** A sidebar panel whose heading is a disclosure button (WAI-ARIA pattern). */
function Section({
  id,
  title,
  as: Tag = "section",
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  as?: "section" | "nav";
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Tag className="panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="panel__title">
        <button
          type="button"
          className="panel__toggle"
          aria-expanded={!collapsed}
          aria-controls={`${id}-body`}
          onClick={onToggle}
        >
          <span className="panel__chev" aria-hidden="true" />
          {title}
        </button>
      </h2>
      <div id={`${id}-body`} className="panel__body" hidden={collapsed}>
        {children}
      </div>
    </Tag>
  );
}

type Group = "cameras" | "live" | "state" | "civic" | "help" | "people" | "housing" | "growth" | "weather" | "hazards" | "roads" | "places" | "nature" | "planning" | "infra" | "other";

const GROUP_ORDER: Group[] = ["cameras", "live", "state", "civic", "help", "people", "housing", "growth", "weather", "hazards", "roads", "places", "nature", "planning", "infra", "other"];

const GROUP_KEYS: Record<Group, Key> = {
  cameras: "groupCameras",
  live: "groupLive",
  weather: "groupWeather",
  hazards: "groupHazards",
  roads: "groupRoads",
  places: "groupPlaces",
  nature: "groupNature",
  planning: "groupPlanning",
  infra: "groupInfra",
  civic: "groupCivic",
  state: "groupState",
  help: "groupHelp",
  people: "groupPeople",
  housing: "groupHousing",
  growth: "groupGrowth",
  other: "groupOther",
};

/** Which theme each layer sits under (anything unlisted goes to "More"). */
const LAYER_GROUP: Record<string, Group> = Object.fromEntries(
  (
    [
      ["cameras", ["fire-cameras", "river-cameras", "windy-webcams"]],
      ["live", ["flights", "buses", "iss", "satellites", "trains"]],
      ["weather", ["weather-now", "air-now", "rain-radar", "satellite", "weather-alerts", "air-quality", "road-weather", "smoke-haze"]],
      ["hazards", ["heat-risk", "fire-weather", "smoke-forecast", "storm-reports", "river-gauges", "drought", "reservoirs", "groundwater", "volcanoes", "fatal-crashes", "wildfire", "wildfire-perimeters", "fire-hotspots", "fire-hazard", "flood", "quakes", "faults", "dams", "superfund", "enviroscreen"]],
      ["roads", ["lane-closures", "message-signs", "chain-controls", "transit-routes", "transit-stops", "amtrak", "airports", "railroads"]],
      ["places", ["cooling-centers", "shelters", "sandbags", "mobile-home-parks", "mobile-home-parks-usa", "food-banks", "clinics", "hospitals", "pharmacies", "community-centers", "libraries", "farmers-markets", "law-enforcement", "fire-stations", "schools", "parks", "playgrounds", "aed", "drinking-water", "restrooms", "ev-chargers", "free-wifi"]],
      ["help", ["legal-help"]],
      ["nature", ["national-parks", "wildlife", "wikipedia", "historic-places", "historical-markers", "rivers", "streamflow"]],
      ["planning", ["city-limits", "county-islands", "general-plan", "zoning", "supervisor-districts", "elementary-districts", "high-school-districts", "fire-districts", "mosquito-districts", "zip-codes", "congressional-districts"]],
      ["infra", ["power-plants", "substations", "bridges", "power-outages", "outage-areas"]],
      ["growth", ["housing-proposals", "new-homes", "ceqa-projects", "annexations"]],
      ["people", ["census", "census-spanish", "census-foreign-born", "census-poverty", "census-renters", "health-asthma", "health-diabetes", "health-uninsured", "food-insecurity"]],
      ["civic", ["voting", "wastewater", "snap-stores"]],
    ] as [Group, string[]][]
  ).flatMap(([g, names]) => names.map((n) => [n, g])),
);

/** A layer's theme: the list above, else the group its catalog entry names. */
const groupOf = (l: LayerInfo): Group =>
  stateName(l.coverage)
    ? "state" // one state's own layers: listed under "This state" when you're there
    : (LAYER_GROUP[l.name] ?? (l.group && l.group in GROUP_KEYS ? (l.group as Group) : "other"));

/** Vendor id -> label (brand names stay as-is; generic labels are translated). */
const VENDORS: { id: string; label?: string; labelKey?: Key }[] = [
  { id: "Flock Safety", label: "Flock" },
  { id: "Motorola / Vigilant", label: "Motorola / Vigilant" },
  { id: "Other / unknown", labelKey: "vendorOther" },
];

const MAX_LIST = 200;

interface Props {
  cameras: Camera[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  layers: LayerState;
  onLayersChange: (next: LayerState) => void;
  overlayInfos: LayerInfo[];
  query: string;
  onQueryChange: (q: string) => void;
  onJump: (place: Place) => void;
  coverage: Coverage;
  onCoverageChange: (c: Coverage) => void;
  onCoverageCenter: () => void;
  coverageHits: number | null;
  bakedAt: string | null;
  liveAt: string | null;
  onAbout: () => void;
  /** Opens the free Help tools (medical bills, renters, legal help). */
  onHelp: () => void;
  /** Whether the panel is shown; hidden panels stay mounted (scroll, state). */
  open: boolean;
  onHide: () => void;
  /** Current map zoom (for "zoom in to see" hints). */
  zoom: number;
  /** Map center [lon, lat], for "no data here" notes. */
  center: [number, number];
  /** The "What's near an address?" point, if any. */
  nearPoint: NearPoint | null;
  onNearPoint: (p: NearPoint | null) => void;
  /** Past day shown for the history layers (null = live). */
  historyDate: string | null;
  onHistoryDate: (day: string | null) => void;
}

/** A titled color legend: [color, label] items. */
function Legend({ id, title, items }: { id: string; title: string; items: [string, string][] }) {
  return (
    <div className="subfilter">
      <span className="panel__note" id={id}>
        {title}
      </span>
      <ul className="legend" aria-labelledby={id}>
        {items.map(([c, label]) => (
          <li key={c} className="legend__item">
            <span className="legend__swatch" style={{ background: c }} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "No data here" note per coverage. */
const ONLY_KEY: Record<string, Key> = {
  stanislaus: "onlyStanislaus",
  california: "onlyCalifornia",
  usa: "onlyUSA",
};

export function Sidebar({
  cameras,
  selectedId,
  onSelect,
  layers,
  onLayersChange,
  overlayInfos,
  query,
  onQueryChange,
  onJump,
  coverage,
  onCoverageChange,
  onCoverageCenter,
  coverageHits,
  bakedAt,
  liveAt,
  onAbout,
  onHelp,
  open,
  onHide,
  zoom,
  center,
  nearPoint,
  onNearPoint,
  historyDate,
  onHistoryDate,
}: Props) {
  const { lang, setLang, t, locale } = useI18n();
  // The sticky header's height (it wraps with the language and camera count)
  // drives the sidebar's scroll padding, so focus never lands under it.
  const headRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const head = headRef.current;
    const bar = head?.closest<HTMLElement>(".sidebar");
    if (!head || !bar) return;
    const sync = () => bar.style.setProperty("--head-h", `${Math.ceil(head.getBoundingClientRect().height)}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);
  // When each server-fetched layer was last refreshed (re-read every 5 min).
  const [times, setTimes] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    const load = () => void api.layerTimes().then((t) => alive && setTimes(t));
    load();
    const id = window.setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  // Outside the home county (and zoomed in), nationwide layers come straight
  // from the national source, not the baked copy the labels below describe.
  const minZoomOf = (l: LayerInfo) => l.view?.min_zoom ?? (l.osm ? OSM_MIN_ZOOM : null);
  const fromSource = (l: LayerInfo) =>
    minZoomOf(l) != null && !covers("stanislaus", center) && zoom >= minZoomOf(l)!;
  // Flights cover the US only through the relay (the snapshot is home-only).
  const coverageOf = (l: LayerInfo) =>
    l.name === "flights" && !(api.static && api.flightsRelay) ? "stanislaus" : l.coverage;
  const freshness = (l: LayerInfo): string | null => {
    if (historyDate && HISTORY_LAYERS.has(l.name)) {
      return t("historyShown", { day: new Date(`${historyDate}T12:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric" }) });
    }
    if (LIVE_SOURCES[l.name] || (l.name === "flights" && (!api.static || api.flightsRelay))) return t("live");
    if (fromSource(l)) return null;
    const at = times[l.same_data_as ?? l.name];
    return at ? t("updatedAgo", { when: ago(at, locale) }) : null;
  };
  const fmt = (n: number) => n.toLocaleString(locale);
  // A minimized panel slides away but stays mounted (keeps scroll/state);
  // `inert` takes it out of the tab order and the accessibility tree.
  const asideRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (asideRef.current) asideRef.current.inert = !open; // before paint
  }, [open]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (!next.delete(id)) next.add(id);
    setCollapsed(next);
    // Collapsing "What can see me?" also ends that mode, so it's never active
    // with its results (and their live-region announcements) hidden. Its start
    // button lives inside the section, so it can't be re-activated while collapsed.
    if (id === "coverage" && next.has(id) && coverage.active) {
      onCoverageChange({ ...coverage, active: false });
    }
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      /* storage blocked (private mode): just don't remember */
    }
  };
  const section = (id: string) => ({ id, collapsed: collapsed.has(id), onToggle: () => toggle(id) });

  const allMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return cameras.filter((c) => matchCamera(c, q));
  }, [cameras, query]);
  const matches = allMatches.slice(0, MAX_LIST);
  const agencyCount = useMemo(() => new Set(cameras.map((c) => c.source)).size, [cameras]);

  const setLayer = (patch: Partial<LayerState>) => onLayersChange({ ...layers, ...patch });
  // Only layers that can actually be switched on (a checkbox may be disabled).
  const presetable = overlayInfos.filter((l) => l.available || l.view).map((l) => l.name);
  const current = activePreset(layers.overlays, presetable);
  const anyOverlayOn = Object.values(layers.overlays).some(Boolean);
  const setVendor = (vendor: string, on: boolean) =>
    setLayer({ alprVendors: { ...layers.alprVendors, [vendor]: on } });
  const setOverlay = (name: string, on: boolean) =>
    setLayer({ overlays: { ...layers.overlays, [name]: on } });

  const title = (l: LayerInfo) => layerTitle(lang, l.name, l.title);
  const alprInfo = overlayInfos.find((l) => l.name === "alpr");
  const otherOverlays = overlayInfos.filter((l) => l.name !== "alpr");
  const censusOn = layers.overlays["census"] ?? false;
  const pctOn = Object.keys(CENSUS_FIELD).some((n) => n !== "census" && (layers.overlays[n] ?? false));
  const enviroOn = layers.overlays["enviroscreen"] ?? false;
  // The first health layer that's on picks the legend (they share a style).
  const healthOn = Object.keys(HEALTH_STOPS).find((n) => layers.overlays[n]);
  // The first catalog-described choropleth that's on picks the legend.
  const metricOn = overlayInfos.find((l) => l.metric && layers.overlays[l.name]);
  const droughtOn = layers.overlays["drought"] ?? false;
  const heatOn = layers.overlays["heat-risk"] ?? false;
  const landCoverOn = layers.overlays["land-cover"] ?? false;
  const cropsOn = layers.overlays["crops"] ?? false;
  const reservoirsOn = layers.overlays["reservoirs"] ?? false;
  const votingOn = layers.overlays["voting"] ?? false;
  const wastewaterOn = layers.overlays["wastewater"] ?? false;
  const groundwaterOn = layers.overlays["groundwater"] ?? false;
  const gaugesOn = layers.overlays["river-gauges"] ?? false;
  const firewxOn = layers.overlays["fire-weather"] ?? false;
  const stormsOn = layers.overlays["storm-reports"] ?? false;
  const devOn = ["housing-proposals", "new-homes", "ceqa-projects"].some((n) => layers.overlays[n]);
  const volcanoesOn = layers.overlays["volcanoes"] ?? false;
  const outagesOn = layers.overlays["power-outages"] ?? false;
  const other = lang === "en" ? "es" : "en";

  // Layers grouped by theme, filterable by name (in the current language).
  const [layerQuery, setLayerQuery] = useState("");
  const lq = layerQuery.trim().toLowerCase();
  const matchesQuery = (label: string) => !lq || label.toLowerCase().includes(lq);
  const showTraffic = matchesQuery(t("trafficCameras"));
  const showAlpr = !!alprInfo && matchesQuery(title(alprInfo));
  // "This state": the layers of the state(s) under the map center, plus any
  // still switched on elsewhere (so they can be turned off after panning away).
  const here = statesAt(center);
  const inView = (l: LayerInfo) => groupOf(l) !== "state" || here.includes(l.coverage!) || !!layers.overlays[l.name];
  const groups = GROUP_ORDER.map(
    (key) =>
      [key, otherOverlays.filter((l) => groupOf(l) === key && inView(l) && matchesQuery(title(l)))] as const,
  );
  const stateTitle = () => {
    const names = here.filter((c) => otherOverlays.some((l) => l.coverage === c)).map((c) => stateName(c)!);
    return t("groupState", { states: names.join(" · ") || t("groupStateNone") });
  };
  const anyLayerMatch = showTraffic || showAlpr || groups.some(([, items]) => items.length > 0);

  const overlayRow = (l: LayerInfo) => (
          <div key={l.name} className="layerrow">
            <label className={`toggle ${l.available ? "" : "toggle--disabled"}`}>
              <input
                type="checkbox"
                disabled={!l.available && !l.view}
                checked={layers.overlays[l.name] ?? false}
                onChange={(e) => setOverlay(l.name, e.target.checked)}
              />
              <span
                className="toggle__dot"
                style={{ background: OVERLAY_COLOR[l.name] ?? "#64748b" }}
                aria-hidden="true"
              />
              <span>
                <span>{title(l)}</span>
                {!l.available && (
                  <span className="panel__note"> — {l.requires_key ? t("needsKey") : t("unavailable")}</span>
                )}
                {l.available && l.count === 0 && !fromSource(l) && (
                  <span className="panel__note"> — {t("noneMappedYet")}</span>
                )}
                {l.available && (layers.overlays[l.name] ?? false) && zoom < (LIVE_SOURCES[l.name]?.minZoom ?? 0) && (
                  <span className="panel__note"> — {t("zoomInToSee")}</span>
                )}
                {(layers.overlays[l.name] ?? false) && minZoomOf(l) != null && !covers("stanislaus", center) && zoom < minZoomOf(l)! && (
                  <span className="panel__note"> — {t("zoomInToSee")}</span>
                )}
                {(layers.overlays[l.name] ?? false) && !covers(coverageOf(l), center) && (
                  <span className="panel__note">
                    {" "}— {stateName(coverageOf(l)) ? t("onlyState", { state: stateName(coverageOf(l))! }) : t(ONLY_KEY[coverageOf(l) ?? ""] ?? "onlyStanislaus")}
                  </span>
                )}
                {l.available && (layers.overlays[l.name] ?? false) && freshness(l) && (
                  <span className="panel__note freshness"> · {freshness(l)}</span>
                )}
              </span>
            </label>
            {(layers.overlays[l.name] ?? false) && l.category !== "raster" && !LIVE_SOURCES[l.name] && !fromSource(l) && (
              <button
                type="button"
                className="dl"
                title={t("downloadLayer", { layer: title(l) })}
                aria-label={t("downloadLayer", { layer: title(l) })}
                onClick={() => void downloadLayer(l.same_data_as ?? l.name)}
              >
                <span aria-hidden="true">⬇</span>
              </button>
            )}
          </div>
  );

  return (
    <aside className="sidebar" id="sidebar" ref={asideRef}>
      <div className="sidebar__head" ref={headRef}>
        <div className="sidebar__titlerow">
          <h1>
            {t("titleA")} <span>{t("titleB")}</span>
          </h1>
          <div className="sidebar__actions">
            <button
              type="button"
              className="langbtn"
              lang={other}
              aria-label={t("langSwitchLabel")}
              onClick={() => setLang(other)}
            >
              {t("langSwitch")}
            </button>
            <button
              type="button"
              id="panel-hide"
              className="iconbtn"
              aria-label={t("hidePanel")}
              title={t("hidePanel")}
              aria-controls="sidebar"
              aria-expanded="true"
              onClick={onHide}
            >
              <span aria-hidden="true">«</span>
            </button>
          </div>
        </div>
        <p className="sidebar__sub">{t("camerasCount", { n: fmt(cameras.length), k: fmt(agencyCount) })}</p>
        <div className="sidebar__meta">
          <button type="button" className="linkbtn" onClick={onAbout}>
            {t("about")}
          </button>
          <span className="sidebar__asof">
            {bakedAt && liveAt
              ? t("liveAsOf", {
                  time: new Date(liveAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }),
                })
              : bakedAt
              ? t("dataAsOf", { date: new Date(bakedAt).toLocaleDateString(locale) })
              : t("dataLive")}
          </span>
        </div>
      </div>
      {/* Outside the sticky header, so the header stays short. */}
      <div className="helpbtn__wrap">
        <button type="button" className="helpbtn" onClick={onHelp} aria-haspopup="dialog">
          <span className="helpbtn__icon" aria-hidden="true">🤝</span>
          <span className="helpbtn__text">
            <span className="helpbtn__title">{t("helpOpen")}</span>
            <span className="helpbtn__sub">{t("helpOpenSub")}</span>
          </span>
        </button>
      </div>

      <Section {...section("jump")} as="nav" title={t("jumpTo")}>
        <div className="chips">
          {PLACES.map((p) => (
            <button key={p.label} type="button" className="chip" onClick={() => onJump(p)}>
              {p.labelKey ? t(p.labelKey) : p.label}
            </button>
          ))}
        </div>
      </Section>

      <Section {...section("presets")} title={t("presetsTitle")}>
        <div className="chips" role="group" aria-label={t("presetsTitle")}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip ${current === p.id ? "chip--on" : ""}`}
              aria-pressed={current === p.id}
              disabled={presetable.length === 0} // the layer list hasn't loaded yet
              // Pressing the active view again turns it off.
              onClick={() => setLayer({ overlays: current === p.id ? {} : applyPreset(p, presetable) })}
            >
              {t(p.label)}
            </button>
          ))}
          {/* Stays mounted (disabled when nothing is on) so keyboard focus isn't lost. */}
          <button type="button" className="chip" disabled={!anyOverlayOn} onClick={() => setLayer({ overlays: {} })}>
            {t("presetClear")}
          </button>
        </div>
      </Section>

      <Section {...section("near")} title={t("nearTitle")}>
        <NearMe point={nearPoint} onPoint={onNearPoint} />
      </Section>

      <Section {...section("layers")} title={t("layers")}>
        <input
          type="search"
          className="search search--sm"
          placeholder={t("findLayer")}
          aria-label={t("findLayerLabel")}
          value={layerQuery}
          onChange={(e) => setLayerQuery(e.target.value)}
        />
        {groups.map(([key, items]) =>
          items.length || (key === "cameras" && (showTraffic || showAlpr)) ? (
            <div key={key} className="layergroup" role="group" aria-labelledby={`lg-${key}`}>
              <h3 id={`lg-${key}`} className="layergroup__title">
                {key === "state" ? stateTitle() : t(GROUP_KEYS[key])}
              </h3>
              {key === "cameras" && (
                <>
                  {showTraffic && (
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={layers.cameras}
                        onChange={(e) => setLayer({ cameras: e.target.checked })}
                      />
                      <span className="toggle__dot" style={{ background: CAM }} aria-hidden="true" />
                      <span>{t("trafficCameras")}</span>
                    </label>
                  )}
                  {alprInfo && showAlpr && (
                    <>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={layers.alpr}
                          onChange={(e) => setLayer({ alpr: e.target.checked })}
                        />
                        <span className="toggle__dot" style={{ background: VENDOR_COLORS.flock }} aria-hidden="true" />
                        <span>{title(alprInfo)}</span>
                      </label>
                      {layers.alpr && (
                        <fieldset className="subfilter" aria-label={title(alprInfo)}>
                          {VENDORS.map((v) => (
                            <label key={v.id} className="toggle toggle--sm">
                              <input
                                type="checkbox"
                                checked={layers.alprVendors[v.id] ?? true}
                                onChange={(e) => setVendor(v.id, e.target.checked)}
                              />
                              <span className="toggle__dot" style={{ background: VENDOR_SWATCH[v.id] }} aria-hidden="true" />
                              <span>{v.labelKey ? t(v.labelKey) : v.label}</span>
                            </label>
                          ))}
                          <p className="panel__note">{t("alprNote")}</p>
                        </fieldset>
                      )}
                    </>
                  )}
                </>
              )}
              {items.map(overlayRow)}
            </div>
          ) : null,
        )}
        {!anyLayerMatch && <p className="panel__note">{t("noLayerMatch")}</p>}

        {censusOn && (
          <div className="subfilter">
            <span className="panel__note" id="income-legend">
              {t("incomeLegend")}
            </span>
            <ul className="legend" aria-labelledby="income-legend">
              {CENSUS_STOPS.map(([v, c], i) => (
                <li key={c} className="legend__item">
                  <span className="legend__swatch" style={{ background: c }} aria-hidden="true" />
                  {i === 0 ? "<$50k" : i === CENSUS_STOPS.length - 1 ? "$150k+" : `$${v / 1000}k`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {pctOn && (
          <div className="subfilter">
            <span className="panel__note" id="pct-legend">
              {t("pctLegend")}
            </span>
            <ul className="legend" aria-labelledby="pct-legend">
              {PCT_STOPS.map(([v, c], i) => (
                <li key={c} className="legend__item">
                  <span className="legend__swatch" style={{ background: c }} aria-hidden="true" />
                  {i === PCT_STOPS.length - 1 ? `${v}%+` : `${v}%`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {enviroOn && (
          <div className="subfilter">
            <span className="panel__note" id="enviro-legend">
              {t("enviroLegend")}
            </span>
            <ul className="legend" aria-labelledby="enviro-legend">
              {ENVIRO_STOPS.map(([v, c]) => (
                <li key={c} className="legend__item">
                  <span className="legend__swatch" style={{ background: c }} aria-hidden="true" />
                  {v}
                </li>
              ))}
            </ul>
          </div>
        )}

        {metricOn?.metric && (
          <Legend
            id="metric-legend"
            title={title(metricOn)}
            items={metricStops(metricOn.metric).map(([v, c], i, all) => [
              c,
              `${fmtMetric(v, metricOn.metric!.fmt, locale, true)}${i === all.length - 1 ? "+" : ""}`,
            ])}
          />
        )}
        {healthOn && (
          <Legend
            id="health-legend"
            title={t("healthLegend")}
            items={(HEALTH_STOPS[healthOn] ?? []).map(([v, c], i, all) => [c, i === all.length - 1 ? `${v}%+` : `${v}%`])}
          />
        )}
        {droughtOn && (
          <Legend id="drought-legend" title={t("droughtLegend")} items={DROUGHT_COLORS.map(([v, c]) => [c, `D${v}`])} />
        )}
        {landCoverOn && (
          <Legend
            id="land-cover-legend"
            title={layerTitle(lang, "land-cover", "Land cover")}
            items={LAND_COVER_CLASSES.map(([c, en, es]) => [c, lang === "es" ? es : en])}
          />
        )}
        {cropsOn && (
          <Legend
            id="crops-legend"
            title={layerTitle(lang, "crops", "Crops")}
            items={CROP_CLASSES.map(([c, en, es]) => [c, lang === "es" ? es : en])}
          />
        )}
        {heatOn && (
          <Legend id="heat-legend" title={t("heatLegend")} items={HEAT_COLORS.map(([v, c]) => [c, t(`heat${v}` as Key)])} />
        )}
        {gaugesOn && (
          <Legend
            id="gauge-legend"
            title={t("gaugeLegend")}
            items={[...GAUGE_COLORS.map(([k, c]): [string, string] => [c, t(GAUGE_KEYS[k]!)]), [GAUGE_OTHER, t("gaugeNotDefined")]]}
          />
        )}
        {firewxOn && (
          <Legend
            id="firewx-legend"
            title={t("firewxLegend")}
            items={FIREWX_COLORS.map(([k, c]) => [c, t(FIREWX_KEYS[k]!)])}
          />
        )}
        {devOn && (
          <Legend id="dev-legend" title={t("devLegend")} items={DEV_STAGES.map(([, c, key]) => [c, t(key)])} />
        )}
        {volcanoesOn && (
          <Legend
            id="volcano-legend"
            title={t("volcanoLegend")}
            items={VOLCANO_COLORS.map(([k, c]) => [c, t(VOLCANO_KEYS[k]!)])}
          />
        )}
        {stormsOn && (
          <Legend
            id="storm-legend"
            title={t("stormLegend")}
            items={[
              ...STORM_KINDS.filter(([kw]) => kw !== "Wnd").map(([, c, key]): [string, string] => [c, t(key)]),
              ["#64748b", t("stormOther")],
            ]}
          />
        )}
        {groundwaterOn && (
          <Legend
            id="gw-legend"
            title={t("gwLegend")}
            items={GROUNDWATER_STOPS.map(([v, c], i, all) => [c, i === all.length - 1 ? `${v}+ ft` : `${v} ft`])}
          />
        )}
        {wastewaterOn && (
          <Legend
            id="wval-legend"
            title={t("wvalLegend")}
            items={WVAL_COLORS.map(([k, c]) => [c, t(WVAL_KEYS[k]!)])}
          />
        )}
        {votingOn && (
          <Legend
            id="voting-legend"
            title={t("votingLegend")}
            items={VOTING_COLORS.map(([k, c]) => [c, t(VOTING_KEYS[k]!)])}
          />
        )}
        {outagesOn && (
          <Legend
            id="outage-legend"
            title={t("outageLegend")}
            items={OUTAGE_COLORS.map(([k, c]) => [c, t(k === "planned" ? "outagePlanned" : "outageUnplanned")])}
          />
        )}
        {reservoirsOn && (
          <Legend
            id="reservoir-legend"
            title={t("reservoirLegend")}
            items={RESERVOIR_STOPS.map(([v, c], i) => [c, i === 0 ? `≤${v}%` : `${v}%+`])}
          />
        )}
      </Section>

      <Section {...section("history")} title={t("historyTitle")}>
        <HistoryPicker value={historyDate} onChange={onHistoryDate} overlayInfos={overlayInfos} />
      </Section>

      <Section {...section("coverage")} title={t("whatCanSeeMe")}>
        <button
          type="button"
          className={`chip ${coverage.active ? "chip--on" : ""}`}
          aria-pressed={coverage.active}
          onClick={() => onCoverageChange({ ...coverage, active: !coverage.active })}
        >
          {coverage.active ? t("coverageActive") : t("coverageStart")}
        </button>
        {coverage.active && (
          // Keyboard / screen-reader alternative to clicking the map.
          <button type="button" className="chip" onClick={onCoverageCenter}>
            {t("coverageUseCenter")}
          </button>
        )}
        <label className="range">
          <span className="panel__note">{t("radius", { m: fmt(coverage.radiusM) })}</span>
          <input
            type="range"
            min={100}
            max={2000}
            step={100}
            value={coverage.radiusM}
            aria-valuetext={t("radius", { m: fmt(coverage.radiusM) })}
            onChange={(e) => onCoverageChange({ ...coverage, radiusM: Number(e.target.value) })}
          />
        </label>
        <div role="status" aria-live="polite">
          {coverageHits != null && (
            <p className="coverage-result">
              <b>{fmt(coverageHits)}</b>{" "}
              {t(coverageHits === 1 ? "plateReaderOne" : "plateReaderMany", { m: fmt(coverage.radiusM) })}
            </p>
          )}
        </div>
        <p className="panel__note">{t("coverageNote")}</p>
      </Section>

      <section className="panel panel--grow" aria-labelledby="find-title">
        <div className="panel__titlerow">
          <h2 id="find-title" className="panel__title">
            {t("findCamera")}
          </h2>
          <button
            type="button"
            className="dl"
            title={t("downloadCameras")}
            aria-label={t("downloadCameras")}
            onClick={() => downloadCameras(cameras)}
          >
            <span aria-hidden="true">⬇</span>
          </button>
        </div>
        <input
          id="camera-search"
          type="search"
          className="search"
          placeholder={t("filterPlaceholder")}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label={t("filterLabel")}
          aria-describedby="search-status"
        />
        <p id="search-status" className="sr-only" role="status" aria-live="polite">
          {query
            ? allMatches.length === 1
              ? t("resultsCountOne")
              : allMatches.length
                ? t("resultsCount", { n: fmt(allMatches.length) })
                : t("noMatch")
            : ""}
        </p>
        {query && (
          <p className="panel__note search-note">{t("searchNote", { n: fmt(cameras.length) })}</p>
        )}
        {/* Scrollable list: focusable so keyboard users can scroll it (WCAG 2.1.1). */}
        <ul className="camlist" tabIndex={0} aria-label={t("cameraList")}>
          {matches.map((cam) => (
            <li key={cam.id}>
              <button
                type="button"
                className={`camlist__item ${cam.id === selectedId ? "camlist__item--on" : ""}`}
                aria-current={cam.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(cam.id)}
              >
                <span className="camlist__name">{cam.name}</span>
                <span className="camlist__meta">
                  {[cam.route, cam.nearby_place, cam.county, cam.state].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
          {query && matches.length === 0 && <li className="camlist__empty">{t("noMatch")}</li>}
          {!query && <li className="camlist__empty">{t("typeToSearch")}</li>}
          {allMatches.length > MAX_LIST && (
            <li className="camlist__empty">{t("showingFirst", { n: MAX_LIST })}</li>
          )}
        </ul>
      </section>
    </aside>
  );
}
