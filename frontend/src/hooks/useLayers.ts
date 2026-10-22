import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type LayerInfo } from "../api/client";
import { registerLayerTitles } from "../i18n";

/** Loads the overlay-layer catalog: the national layers once, then each
 *  state's layers when `ensureStates` first asks for that state (the static
 *  site splits them out; the dev API lists everything up front). Non-fatal:
 *  on error the map just has fewer overlays. A failed state is asked for
 *  again the next time the set of states on screen changes. */
export function useLayers(): { layers: LayerInfo[]; ensureStates: (codes: string[]) => void } {
  const [base, setBase] = useState<LayerInfo[]>([]);
  const [ready, setReady] = useState(false);
  const [byState, setByState] = useState<Record<string, LayerInfo[]>>({});
  const whole = useRef(false);
  const asked = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    api
      .listLayers()
      .then(({ layers, whole: all }) => {
        registerLayerTitles(layers);
        whole.current = all;
        if (cancelled) return;
        setBase(layers);
        setReady(true); // ensureStates changes, so the caller asks again
      })
      .catch(() => {
        /* overlays are optional; map still works without them */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureStates = useCallback(
    (codes: string[]) => {
      if (!ready || whole.current) return;
      for (const code of codes) {
        if (asked.current.has(code)) continue;
        asked.current.add(code);
        api
          .listStateLayers(code)
          .then((data) => {
            registerLayerTitles(data);
            setByState((s) => ({ ...s, [code]: data }));
          })
          .catch(() => {
            asked.current.delete(code);
          });
      }
    },
    [ready],
  );

  const layers = useMemo(() => {
    // By name: files cached from two deploys could briefly overlap.
    const all = new Map<string, LayerInfo>();
    for (const l of [...base, ...Object.values(byState).flat()]) if (!all.has(l.name)) all.set(l.name, l);
    return [...all.values()];
  }, [base, byState]);
  return { layers, ensureStates };
}
