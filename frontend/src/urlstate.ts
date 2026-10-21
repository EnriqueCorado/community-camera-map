// Serialize the map's shareable state to/from the URL hash so a view can be
// linked: active overlays, ALPR + disabled vendors, the search filter, and the
// camera viewport. Kept tiny and defensive — bad hashes decode to defaults.
import type { LayerState } from "./components/MapView";
import type { Lang } from "./i18n";
import { isHelpTab, type HelpTab } from "./help/target";

export interface ShareState {
  layers: LayerState;
  query: string;
  view: { center: [number, number]; zoom: number } | null;
  /** UI language; only non-default ("es") is written to the URL. */
  lang?: Lang;
  /** Open Help tab (never anything typed into it). */
  help?: HelpTab;
}

export function encodeState(s: ShareState): string {
  const p = new URLSearchParams();
  if (s.lang === "es") p.set("lang", "es");
  const overlays = Object.entries(s.layers.overlays)
    .filter(([, on]) => on)
    .map(([k]) => k);
  if (s.layers.cameras === false) p.set("cam", "0");
  if (s.layers.alpr) p.set("alpr", "1");
  const offVendors = Object.entries(s.layers.alprVendors)
    .filter(([, on]) => !on)
    .map(([k]) => k);
  if (offVendors.length) p.set("voff", offVendors.join("~"));
  if (overlays.length) p.set("ov", overlays.join("~"));
  if (s.query.trim()) p.set("q", s.query.trim());
  if (s.help) p.set("help", s.help);
  if (s.view) p.set("v", `${s.view.center[0].toFixed(4)},${s.view.center[1].toFixed(4)},${s.view.zoom.toFixed(2)}`);
  return p.toString();
}

export function decodeState(hash: string, defaults: LayerState): ShareState {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const overlays: Record<string, boolean> = {};
  for (const name of (p.get("ov") ?? "").split("~").filter(Boolean)) overlays[name] = true;
  const alprVendors = { ...defaults.alprVendors };
  for (const v of (p.get("voff") ?? "").split("~").filter(Boolean)) {
    if (v in alprVendors) alprVendors[v] = false;
  }
  let view: ShareState["view"] = null;
  const v = p.get("v");
  if (v) {
    const [lng, lat, z] = v.split(",").map(Number);
    if ([lng, lat, z].every((n) => Number.isFinite(n))) {
      view = { center: [lng!, lat!], zoom: z! };
    }
  }
  const help = p.get("help");
  return {
    layers: {
      cameras: p.get("cam") !== "0",
      alpr: p.get("alpr") === "1",
      alprVendors,
      overlays,
    },
    query: p.get("q") ?? "",
    view,
    help: isHelpTab(help) ? help : undefined,
  };
}
