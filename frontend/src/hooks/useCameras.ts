import { useEffect, useState } from "react";
import { api } from "../api/client";
import { CameraStore } from "../camera-store";
import type { CameraPoints, CameraText } from "../camera-data";

type State =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; store: CameraStore; points: CameraPoints; search: CameraText[] | null };

/** Opens the camera list once on mount: on the static site just its small
 *  index (positions + counts; search and full records load on demand), from
 *  the dev API the whole list. Re-renders when the store swaps in a newer index
 *  or the search rows arrive. */
export function useCameras(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    (api.static ? CameraStore.fromFiles(api.cameraFiles) : api.listCameras().then(CameraStore.fromList))
      .then((store) => {
        if (cancelled) return;
        const update = () => setState({ status: "ready", store, points: store.points, search: store.search });
        unsubscribe = store.subscribe(update);
        update();
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
