import { useEffect, useState } from "react";
import { api, type LayerInfo } from "../api/client";

/** Loads the overlay-layer catalog once. Non-fatal: on error, returns []. */
export function useLayers(): LayerInfo[] {
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .listLayers()
      .then((data) => {
        if (!cancelled) setLayers(data);
      })
      .catch(() => {
        /* overlays are optional; map still works without them */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return layers;
}
