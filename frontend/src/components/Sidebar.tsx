import { useMemo } from "react";
import type { Camera } from "../types";
import type { LayerInfo } from "../api/client";
import { matchCamera, type LayerState } from "./MapView";
import { CAM, VENDOR_COLORS, VENDOR_SWATCH, OVERLAY_COLOR, CENSUS_STOPS, ENVIRO_STOPS } from "../colors";
import { downloadLayer, downloadCameras } from "../download";
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
];

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
  onAbout: () => void;
}

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
  onAbout,
}: Props) {
  const { lang, setLang, t, locale } = useI18n();
  const fmt = (n: number) => n.toLocaleString(locale);

  const allMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return cameras.filter((c) => matchCamera(c, q));
  }, [cameras, query]);
  const matches = allMatches.slice(0, MAX_LIST);

  const setLayer = (patch: Partial<LayerState>) => onLayersChange({ ...layers, ...patch });
  const setVendor = (vendor: string, on: boolean) =>
    setLayer({ alprVendors: { ...layers.alprVendors, [vendor]: on } });
  const setOverlay = (name: string, on: boolean) =>
    setLayer({ overlays: { ...layers.overlays, [name]: on } });

  const title = (l: LayerInfo) => layerTitle(lang, l.name, l.title);
  const alprInfo = overlayInfos.find((l) => l.name === "alpr");
  const otherOverlays = overlayInfos.filter((l) => l.name !== "alpr");
  const censusOn = layers.overlays["census"] ?? false;
  const enviroOn = layers.overlays["enviroscreen"] ?? false;
  const other = lang === "en" ? "es" : "en";

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <div className="sidebar__titlerow">
          <h1>
            {t("titleA")} <span>{t("titleB")}</span>
          </h1>
          <button
            type="button"
            className="langbtn"
            lang={other}
            aria-label={t("langSwitchLabel")}
            onClick={() => setLang(other)}
          >
            {t("langSwitch")}
          </button>
        </div>
        <p className="sidebar__sub">{t("camerasStatewide", { n: fmt(cameras.length) })}</p>
        <div className="sidebar__meta">
          <button type="button" className="linkbtn" onClick={onAbout}>
            {t("about")}
          </button>
          <span className="sidebar__asof">
            {bakedAt
              ? t("dataAsOf", { date: new Date(bakedAt).toLocaleDateString(locale) })
              : t("dataLive")}
          </span>
        </div>
      </div>

      <nav className="panel" aria-labelledby="jump-title">
        <h2 id="jump-title" className="panel__title">
          {t("jumpTo")}
        </h2>
        <div className="chips">
          {PLACES.map((p) => (
            <button key={p.label} type="button" className="chip" onClick={() => onJump(p)}>
              {p.labelKey ? t(p.labelKey) : p.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="panel" aria-labelledby="layers-title">
        <h2 id="layers-title" className="panel__title">
          {t("layers")}
        </h2>

        <label className="toggle">
          <input
            type="checkbox"
            checked={layers.cameras}
            onChange={(e) => setLayer({ cameras: e.target.checked })}
          />
          <span className="toggle__dot" style={{ background: CAM }} aria-hidden="true" />
          <span>{t("trafficCameras")}</span>
        </label>

        {alprInfo && (
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

        {otherOverlays.map((l) => (
          <div key={l.name} className="layerrow">
            <label className={`toggle ${l.available ? "" : "toggle--disabled"}`}>
              <input
                type="checkbox"
                disabled={!l.available}
                checked={layers.overlays[l.name] ?? false}
                onChange={(e) => setOverlay(l.name, e.target.checked)}
              />
              <span
                className="toggle__dot"
                style={{ background: OVERLAY_COLOR[l.name] ?? "#64748b" }}
                aria-hidden="true"
              />
              <span>
                {title(l)}
                {!l.available && (
                  <span className="panel__note"> — {l.requires_key ? t("needsKey") : t("unavailable")}</span>
                )}
              </span>
            </label>
            {(layers.overlays[l.name] ?? false) && (
              <button
                type="button"
                className="dl"
                title={t("downloadLayer", { layer: title(l) })}
                aria-label={t("downloadLayer", { layer: title(l) })}
                onClick={() => void downloadLayer(l.name)}
              >
                <span aria-hidden="true">⬇</span>
              </button>
            )}
          </div>
        ))}

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
      </section>

      <section className="panel" aria-labelledby="coverage-title">
        <h2 id="coverage-title" className="panel__title">
          {t("whatCanSeeMe")}
        </h2>
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
      </section>

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
                  {[cam.route, cam.nearby_place, cam.county].filter(Boolean).join(" · ")}
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
