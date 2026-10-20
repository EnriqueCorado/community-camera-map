import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Camera, SourceInfo } from "../types";

type State =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; cameras: Camera[]; source: string; sources: Record<string, SourceInfo> };

/** Loads the camera inventory once on mount. */
export function useCameras(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .listCameras()
      .then((data) => {
        if (!cancelled) {
          setState({ status: "ready", cameras: data.cameras, source: data.source, sources: data.sources });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
