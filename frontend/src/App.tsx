import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import type { NearPoint } from "./components/NearMe";
import { useCameras } from "./hooks/useCameras";
import { useLayers } from "./hooks/useLayers";
import { Sidebar, type Place } from "./components/Sidebar";
import { MapView, type LayerState } from "./components/MapView";
import { CameraDetail } from "./components/CameraDetail";
import { About } from "./components/About";
import { AlprAccessPanel } from "./components/AlprAccessPanel";
import type { Attribution } from "./alpr-access";
import { api } from "./api/client";
import { decodeState, encodeState } from "./urlstate";
import { useI18n } from "./i18n";
import type { HelpTarget } from "./help/target";
import type { Camera } from "./types";
import { downloadCameras } from "./download";
import { pointAt, pointRef, type PointRef } from "./camera-data";

// The Help tools (forms, letters, long copy) load only when first opened.
const HelpPanel = lazy(() => import("./components/help/HelpPanel"));

const INITIAL_LAYERS: LayerState = {
  cameras: true,
  alpr: false,
  alprVendors: {
    "Flock Safety": true,
    "Motorola / Vigilant": true,
    "Other / unknown": true,
  },
  overlays: {},
};

type View = { center: [number, number]; zoom: number } | null;

// Whether the left panel is shown (per-browser convenience; default open).
const PANEL_KEY = "scm-panel";
function readPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== "closed";
  } catch {
    return true;
  }
}

export default function App() {
  const { t, lang, locale } = useI18n();
  const state = useCameras();
  const overlayInfos = useLayers();

  // Decode shareable state from the URL hash once, at startup.
  const initial = useMemo(() => decodeState(window.location.hash, INITIAL_LAYERS), []);
  // The selected camera: its point index (map highlight, list) and, once its
  // cell's records have loaded, the full camera (detail drawer).
  const [selectedPos, setSelectedPos] = useState<PointRef | null>(null);
  const [selected, setSelected] = useState<Camera | null>(null);
  const [layers, setLayers] = useState<LayerState>(initial.layers);
  const [query, setQuery] = useState(initial.query);
  const deferredQuery = useDeferredValue(query);
  const [view, setView] = useState<View>(initial.view);
  const [flyTo, setFlyTo] = useState<View>(null);
  const [nearPoint, setNearPoint] = useState<NearPoint | null>(null);
  const [historyDate, setHistoryDate] = useState<string | null>(null);
  // The view before an address search: while a searched place is shown, the
  // URL keeps this one, so a shared link never carries someone's address.
  const preNearView = useRef<View>(null);
  const pickNear = (p: NearPoint | null) => {
    if (p && !nearPoint) preNearView.current = view;
    setNearPoint(p);
    if (p) setFlyTo({ center: p.center, zoom: 14 });
    else if (preNearView.current) {
      // "Clear": go back, and treat that as the current view right away so the
      // link can't pick up the searched area while the map flies back.
      setView(preNearView.current);
      setFlyTo(preNearView.current);
    }
  };
  const [panelOpen, setPanelOpen] = useState(readPanelOpen);
  const panelToggled = useRef(false);
  const togglePanel = (open: boolean) => {
    panelToggled.current = true;
    setPanelOpen(open);
    try {
      localStorage.setItem(PANEL_KEY, open ? "open" : "closed");
    } catch {
      /* storage blocked: just don't remember */
    }
  };
  // Keep keyboard focus on the control that brings the panel back (or hides it).
  useEffect(() => {
    if (!panelToggled.current) return;
    document.getElementById(panelOpen ? "panel-hide" : "panel-show")?.focus();
  }, [panelOpen]);
  const [coverage, setCoverage] = useState({ active: false, radiusM: 300 });
  const [coverageHits, setCoverageHits] = useState<number | null>(null);
  // Bumped to ask the map to run "what can see me?" at its center (keyboard path).
  const [coverageCenterTick, setCoverageCenterTick] = useState(0);
  const [showAbout, setShowAbout] = useState(false);
  const [help, setHelp] = useState<HelpTarget | null>(initial.help ?? null);
  const [accessFor, setAccessFor] = useState<Attribution | null>(null);
  const [bakedAt, setBakedAt] = useState<string | null>(null);
  const [liveAt, setLiveAt] = useState<string | null>(null);

  useEffect(() => {
    api.meta().then((m) => {
      setBakedAt(m.baked_at ?? null);
      setLiveAt(m.live_at ?? null);
    });
  }, []);

  // Keep the URL hash in sync so the current view is shareable.
  useEffect(() => {
    const hash = encodeState({ layers, query, view: nearPoint ? preNearView.current : view, lang, help: help ?? undefined });
    const next = hash ? `#${hash}` : "";
    if (next !== window.location.hash) {
      window.history.replaceState(null, "", next || window.location.pathname);
    }
  }, [layers, query, view, lang, nearPoint, help]);

  const store = state.status === "ready" ? state.store : null;
  const points = state.status === "ready" ? state.points : null;
  const selectedRef = useRef<PointRef | null>(null);
  const select = useCallback(
    (i: number | null) => {
      const ref = i === null || !store ? null : pointRef(store.points, i);
      selectedRef.current = ref;
      setSelectedPos(ref);
      if (!ref || i === null || !store) return setSelected(null);
      store.camera(i).then(
        // Ignore a slow answer for a camera that's no longer the selected one.
        (cam) => selectedRef.current === ref && setSelected(cam),
        () => selectedRef.current === ref && setSelected(null),
      );
    },
    [store],
  );
  // The selection is kept as a position, so a newer index (hourly redeploy,
  // which renumbers the points) still finds the same camera.
  const selectedId = useMemo(() => (points && selectedPos ? pointAt(points, selectedPos) : null), [points, selectedPos]);
  const wantSearch = useCallback(() => {
    store?.loadSearch().catch(() => {});
  }, [store]);
  const prefetch = useCallback(
    (w: number, s: number, e: number, n: number) => store?.prefetch(w, s, e, n),
    [store],
  );

  if (state.status === "loading") {
    return (
      <div className="screen" role="status">
        {t("loading")}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="screen screen--error" role="alert">
        <p>{t("apiError")}</p>
        <code>{state.error}</code>
        <p className="screen__hint">{t("apiHint")}</p>
      </div>
    );
  }

  const jump = (p: Place) => setFlyTo({ center: p.center, zoom: p.zoom });

  return (
    <div className={`app${panelOpen ? "" : " app--panel-closed"}`}>
      {/* Moves focus without touching location.hash (which holds the shareable view). */}
      <a
        className="skip-link"
        href="#camera-search"
        onClick={(e) => {
          e.preventDefault();
          if (!panelOpen) {
            panelToggled.current = false; // focus goes to the search box instead
            setPanelOpen(true);
            window.setTimeout(() => document.getElementById("camera-search")?.focus(), 0);
            return;
          }
          document.getElementById("camera-search")?.focus();
        }}
      >
        {t("skipToSearch")}
      </a>
      <Sidebar
        cameraCount={state.points.count}
        agencyCount={state.points.agencies}
        search={state.search}
        onSearchWanted={wantSearch}
        onDownloadCameras={() => {
          state.store.all().then(downloadCameras, (err: unknown) => console.error("camera export failed", err));
        }}
        selectedId={selectedId}
        onSelect={select}
        layers={layers}
        onLayersChange={setLayers}
        overlayInfos={overlayInfos}
        query={query}
        onQueryChange={setQuery}
        onJump={jump}
        coverage={coverage}
        onCoverageChange={setCoverage}
        onCoverageCenter={() => setCoverageCenterTick((n) => n + 1)}
        coverageHits={coverageHits}
        bakedAt={bakedAt}
        liveAt={liveAt}
        onAbout={() => setShowAbout(true)}
        onHelp={() => setHelp({ tab: "medical" })}
        open={panelOpen}
        zoom={view?.zoom ?? initial.view?.zoom ?? 5.4}
        center={view?.center ?? initial.view?.center ?? [-120.99, 37.64]}
        nearPoint={nearPoint}
        onNearPoint={pickNear}
        historyDate={historyDate}
        onHistoryDate={setHistoryDate}
        onHide={() => togglePanel(false)}
      />
      <main className="stage">
        {historyDate && (
          <div className="historybanner" role="status">
            {t("historyBanner", {
              day: new Date(`${historyDate}T12:00:00`).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
            })}
            <button type="button" className="chip" onClick={() => setHistoryDate(null)}>
              {t("historyBack")}
            </button>
          </div>
        )}
        {!panelOpen && (
          <button
            type="button"
            id="panel-show"
            className="panel-show"
            aria-controls="sidebar"
            aria-expanded="false"
            onClick={() => togglePanel(true)}
          >
            <span aria-hidden="true">☰</span> {t("showPanel")}
          </button>
        )}
        <MapView
          points={state.points}
          search={state.search}
          selectedId={selectedId}
          onSelect={select}
          onPrefetch={prefetch}
          layers={layers}
          overlayInfos={overlayInfos}
          query={deferredQuery}
          flyTo={flyTo}
          nearPoint={nearPoint}
          historyDate={historyDate}
          initialView={initial.view}
          onView={setView}
          coverage={coverage}
          onCoverageResult={setCoverageHits}
          coverageCenterTick={coverageCenterTick}
          onAlprAccess={setAccessFor}
          onHelp={setHelp}
        />
        {selected && (
          <CameraDetail key={selected.id} camera={selected} source={state.points.sources[selected.source]} onClose={() => select(null)} />
        )}
        {accessFor && <AlprAccessPanel attribution={accessFor} onClose={() => setAccessFor(null)} />}
        {showAbout && (
          <About
            layers={overlayInfos}
            cameraSources={state.points.sources}
            bakedAt={bakedAt}
            onClose={() => setShowAbout(false)}
          />
        )}
        {help && (
          <Suspense fallback={null}>
            <HelpPanel
              target={help}
              onTarget={setHelp}
              onClose={() => setHelp(null)}
              onShowOnMap={(layer, center) => {
                setLayers((l) => ({ ...l, overlays: { ...l.overlays, [layer]: true } }));
                if (center) setFlyTo({ center, zoom: 15 });
                setHelp(null);
              }}
            />
          </Suspense>
        )}
      </main>
    </div>
  );
}
