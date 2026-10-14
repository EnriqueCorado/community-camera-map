import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";
import App from "./App";
import { I18nProvider, detectLang } from "./i18n";

// maplibre v6 resolves its worker via a runtime string that bundlers can't see,
// so it 404s in a production build. Point it at the worker Vite bundles for us
// (works in dev and build alike).
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <I18nProvider initial={detectLang(window.location.hash)}>
      <App />
    </I18nProvider>
  </StrictMode>,
);
