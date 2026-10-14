import { useEffect, useMemo, useState, useDeferredValue } from "react";
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

export default function App() {
  const { t, lang } = useI18n();
  const state = useCameras();
  const overlayInfos = useLayers();

  // Decode shareable state from the URL hash once, at startup.
  const initial = useMemo(() => decodeState(window.location.hash, INITIAL_LAYERS), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerState>(initial.layers);
  const [query, setQuery] = useState(initial.query);
  const deferredQuery = useDeferredValue(query);
  const [view, setView] = useState<View>(initial.view);
  const [flyTo, setFlyTo] = useState<View>(null);
  const [coverage, setCoverage] = useState({ active: false, radiusM: 300 });
  const [coverageHits, setCoverageHits] = useState<number | null>(null);
  // Bumped to ask the map to run "what can see me?" at its center (keyboard path).
  const [coverageCenterTick, setCoverageCenterTick] = useState(0);
  const [showAbout, setShowAbout] = useState(false);
  const [accessFor, setAccessFor] = useState<Attribution | null>(null);
  const [bakedAt, setBakedAt] = useState<string | null>(null);

  useEffect(() => {
    api.meta().then((m) => setBakedAt(m.baked_at ?? null));
  }, []);

  // Keep the URL hash in sync so the current view is shareable.
  useEffect(() => {
    const hash = encodeState({ layers, query, view, lang });
    const next = hash ? `#${hash}` : "";
    if (next !== window.location.hash) {
      window.history.replaceState(null, "", next || window.location.pathname);
    }
  }, [layers, query, view, lang]);

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

  const selected = state.cameras.find((c) => c.id === selectedId) ?? null;
  const jump = (p: Place) => setFlyTo({ center: p.center, zoom: p.zoom });

  return (
    <div className="app">
      {/* Moves focus without touching location.hash (which holds the shareable view). */}
      <a
        className="skip-link"
        href="#camera-search"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("camera-search")?.focus();
        }}
      >
        {t("skipToSearch")}
      </a>
      <Sidebar
        cameras={state.cameras}
        selectedId={selectedId}
        onSelect={setSelectedId}
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
        onAbout={() => setShowAbout(true)}
      />
      <main className="stage">
        <MapView
          cameras={state.cameras}
          selectedId={selectedId}
          onSelect={setSelectedId}
          layers={layers}
          overlayInfos={overlayInfos}
          query={deferredQuery}
          flyTo={flyTo}
          initialView={initial.view}
          onView={setView}
          coverage={coverage}
          onCoverageResult={setCoverageHits}
          coverageCenterTick={coverageCenterTick}
          onAlprAccess={setAccessFor}
        />
        {selected && <CameraDetail camera={selected} onClose={() => setSelectedId(null)} />}
        {accessFor && <AlprAccessPanel attribution={accessFor} onClose={() => setAccessFor(null)} />}
        {showAbout && (
          <About layers={overlayInfos} bakedAt={bakedAt} onClose={() => setShowAbout(false)} />
        )}
      </main>
    </div>
  );
}
