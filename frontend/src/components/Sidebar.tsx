import { useMemo } from "react";
import type { Camera } from "../types";
import type { LayerInfo } from "../api/client";
import { matchCamera, type LayerState } from "./MapView";
import { CAM, VENDOR_COLORS, VENDOR_SWATCH, OVERLAY_COLOR, CENSUS_STOPS, ENVIRO_STOPS } from "../colors";
import { downloadLayer, downloadCameras } from "../download";

export interface Coverage {
  active: boolean;
  radiusM: number;
}

export interface Place {
  label: string;
  center: [number, number];
  zoom: number;
}

export const PLACES: Place[] = [
  { label: "Oakdale", center: [-120.847, 37.766], zoom: 13 },
  { label: "Modesto", center: [-120.997, 37.639], zoom: 12 },
  { label: "Stanislaus", center: [-120.95, 37.6], zoom: 10 },
  { label: "All of CA", center: [-119.4, 37.2], zoom: 5.4 },
];

const VENDOR_LABELS: Record<string, string> = {
  "Flock Safety": "Flock",
  "Motorola / Vigilant": "Motorola / Vigilant",
  "Other / unknown": "Other",
};

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
  coverageHits,
  bakedAt,
  onAbout,
}: Props) {
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return cameras.filter((c) => matchCamera(c, q)).slice(0, MAX_LIST);
  }, [cameras, query]);

  const setLayer = (patch: Partial<LayerState>) => onLayersChange({ ...layers, ...patch });
  const setVendor = (vendor: string, on: boolean) =>
    setLayer({ alprVendors: { ...layers.alprVendors, [vendor]: on } });
  const setOverlay = (name: string, on: boolean) =>
    setLayer({ overlays: { ...layers.overlays, [name]: on } });

  const alprInfo = overlayInfos.find((l) => l.name === "alpr");
  const otherOverlays = overlayInfos.filter((l) => l.name !== "alpr");
  const censusOn = layers.overlays["census"] ?? false;
  const enviroOn = layers.overlays["enviroscreen"] ?? false;

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <h1>
          California <span>Camera Map</span>
        </h1>
        <p className="sidebar__sub">
          {cameras.length.toLocaleString()} public Caltrans traffic cameras statewide
        </p>
        <div className="sidebar__meta">
          <button type="button" className="linkbtn" onClick={onAbout}>
            About &amp; sources
          </button>
          <span className="sidebar__asof">
            Data as of {bakedAt ? new Date(bakedAt).toLocaleDateString() : "live"}
          </span>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel__title">Jump to</h2>
        <div className="chips">
          {PLACES.map((p) => (
            <button key={p.label} type="button" className="chip" onClick={() => onJump(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2 className="panel__title">Layers</h2>

        <label className="toggle">
          <input
            type="checkbox"
            checked={layers.cameras}
            onChange={(e) => setLayer({ cameras: e.target.checked })}
          />
          <span className="toggle__dot" style={{ background: CAM }} />
          <span>Traffic cameras</span>
        </label>

        {alprInfo && (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={layers.alpr}
                onChange={(e) => setLayer({ alpr: e.target.checked })}
              />
              <span className="toggle__dot" style={{ background: VENDOR_COLORS.flock }} />
              <span>{alprInfo.title}</span>
            </label>
            {layers.alpr && (
              <div className="subfilter">
                {Object.keys(VENDOR_LABELS).map((v) => (
                  <label key={v} className="toggle toggle--sm">
                    <input
                      type="checkbox"
                      checked={layers.alprVendors[v] ?? true}
                      onChange={(e) => setVendor(v, e.target.checked)}
                    />
                    <span className="toggle__dot" style={{ background: VENDOR_SWATCH[v] }} />
                    <span>{VENDOR_LABELS[v]}</span>
                  </label>
                ))}
                <p className="panel__note">
                  ALPR locations are crowdsourced (OpenStreetMap / DeFlock) and not exhaustive.
                </p>
              </div>
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
              <span className="toggle__dot" style={{ background: OVERLAY_COLOR[l.name] ?? "#64748b" }} />
              <span>
                {l.title}
                {!l.available && (
                  <span className="panel__note">
                    {l.requires_key ? " — needs API key" : " — unavailable"}
                  </span>
                )}
              </span>
            </label>
            {(layers.overlays[l.name] ?? false) && (
              <button
                type="button"
                className="dl"
                title={`Download ${l.title} as GeoJSON`}
                aria-label={`Download ${l.title}`}
                onClick={() => void downloadLayer(l.name)}
              >
                ⬇
              </button>
            )}
          </div>
        ))}

        {censusOn && (
          <div className="subfilter">
            <span className="panel__note">Median household income</span>
            <div className="legend">
              {CENSUS_STOPS.map(([v, c], i) => (
                <span key={c} className="legend__item">
                  <span className="legend__swatch" style={{ background: c }} />
                  {i === 0 ? "<$50k" : i === CENSUS_STOPS.length - 1 ? "$150k+" : `$${v / 1000}k`}
                </span>
              ))}
            </div>
          </div>
        )}

        {enviroOn && (
          <div className="subfilter">
            <span className="panel__note">Pollution burden (CalEnviroScreen %ile)</span>
            <div className="legend">
              {ENVIRO_STOPS.map(([v, c]) => (
                <span key={c} className="legend__item">
                  <span className="legend__swatch" style={{ background: c }} />
                  {v}th
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2 className="panel__title">What can see me?</h2>
        <button
          type="button"
          className={`chip ${coverage.active ? "chip--on" : ""}`}
          aria-pressed={coverage.active}
          onClick={() => onCoverageChange({ ...coverage, active: !coverage.active })}
        >
          {coverage.active ? "Click the map to drop a pin" : "Find plate readers near a point"}
        </button>
        <label className="range">
          <span className="panel__note">Radius: {coverage.radiusM} m</span>
          <input
            type="range"
            min={100}
            max={2000}
            step={100}
            value={coverage.radiusM}
            onChange={(e) => onCoverageChange({ ...coverage, radiusM: Number(e.target.value) })}
          />
        </label>
        {coverageHits != null && (
          <p className="coverage-result">
            <b>{coverageHits}</b> plate reader{coverageHits === 1 ? "" : "s"} within {coverage.radiusM} m
          </p>
        )}
        <p className="panel__note">Crowdsourced ALPR locations (OSM/DeFlock) — a floor, not a full count.</p>
      </div>

      <div className="panel panel--grow">
        <div className="panel__titlerow">
          <h2 className="panel__title">Find a camera</h2>
          <button
            type="button"
            className="dl"
            title="Download cameras as GeoJSON"
            aria-label="Download cameras as GeoJSON"
            onClick={() => downloadCameras(cameras)}
          >
            ⬇
          </button>
        </div>
        <input
          type="search"
          className="search"
          placeholder="Filter cameras by place, county, or road…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Filter cameras"
        />
        {query && (
          <p className="panel__note search-note">
            Map shows matching cameras only — clear the box to see all {cameras.length.toLocaleString()}.
          </p>
        )}
        <ul className="camlist">
          {matches.map((cam) => (
            <li key={cam.id}>
              <button
                type="button"
                className={`camlist__item ${cam.id === selectedId ? "camlist__item--on" : ""}`}
                onClick={() => onSelect(cam.id)}
              >
                <span className="camlist__name">{cam.name}</span>
                <span className="camlist__meta">
                  {[cam.route, cam.nearby_place, cam.county].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
          {query && matches.length === 0 && <li className="camlist__empty">No cameras match.</li>}
          {!query && <li className="camlist__empty">Type to search, or tap a dot on the map.</li>}
          {matches.length === MAX_LIST && (
            <li className="camlist__empty">Showing first {MAX_LIST} — refine your search.</li>
          )}
        </ul>
      </div>
    </aside>
  );
}
