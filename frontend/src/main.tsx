import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";
import App from "./App";
import { hasWebGL2 } from "./components/MapView";
import { I18nProvider, detectLang } from "./i18n";
import { applyDisplay, readTextSize, readTheme } from "./display";

// maplibre v6 resolves its worker via a runtime string that bundlers can't see,
// so it 404s in a production build. Point it at the worker Vite bundles for us
// (works in dev and build alike).
maplibregl.setWorkerUrl(maplibreWorkerUrl);
// Start downloading the map's worker now rather than when the map is created
// (after the camera index arrives): on slow mobile data that's seconds sooner.
if (hasWebGL2()) maplibregl.prewarm();

// Saved theme / text size before the first paint (no flash of the wrong theme).
applyDisplay(readTheme(), readTextSize());

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <I18nProvider initial={detectLang(window.location.hash)}>
      <App />
    </I18nProvider>
  </StrictMode>,
);
