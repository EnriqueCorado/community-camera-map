// Nationwide layers: each catalog entry with a `view` spec (from the backend
// registry) loads the area on screen straight from a national ArcGIS service
// (all verified to send CORS headers). Inside the home county — and when
// zoomed out past the spec's min_zoom — the baked copy is used instead, so
// the home view stays fast and works even if a federal server is down.
import type { LayerInfo, ViewSpec } from "./api/client";
import { LIVE_SOURCES, type LiveSource } from "./live-sources";
import { chooseSource, loadPages } from "./view-logic";
import { home } from "./baked";
import { osmSource } from "./osm-sources";
import STATE_HOST_LIST from "./state-hosts.json";

type FC = GeoJSON.FeatureCollection;

function viewSource(info: LayerInfo, spec: ViewSpec): LiveSource {
  return {
    refreshMs: spec.refresh_s * 1000,
    byView: true,
    async load({ bbox, zoom, signal, partial }) {
      const choice = chooseSource(spec, info.available && spec.baked !== false, bbox, zoom);
      if (choice === "empty") return EMPTY;
      if (choice === "home") {
        try {
          return await home(info.same_data_as ?? info.name);
        } catch (err) {
          if (zoom < spec.min_zoom) throw err;
        }
      }
      return loadPages(spec, bbox, zoom, { signal, partial, fetchJson });
    },
  };
}

const EMPTY: FC = { type: "FeatureCollection", features: [] };

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Hosts a catalog `view` may query (defense in depth: the catalog is ours). */
const VIEW_HOSTS =
  /^https:\/\/(services\d*\.arcgis\.com|tigerweb\.geo\.census\.gov|hazards\.fema\.gov|mapservices\.nps\.gov|gisportal\.hrsa\.gov|mapservices\.weather\.noaa\.gov|onemap\.cdc\.gov|gis\.fema\.gov|gisportal\.ers\.usda\.gov|carto\.nationalmap\.gov)\//;

/** Exact hosts the state packs' official services live on (generated from the
 *  verified specs by backend scripts/sync_state_specs.py). */
const STATE_HOSTS = new Set<string>(STATE_HOST_LIST as string[]);
const allowedView = (url: string) => {
  if (VIEW_HOSTS.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password && (u.port === "" || u.port === "443") && STATE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
};

const viewCache = new Map<string, LiveSource>();

/** The browser-side loader for a layer, if it has one: a hand-written live
 *  source (ISS, trains, …) or a nationwide view. Undefined = baked file only. */
export function liveSourceFor(info: LayerInfo): LiveSource | undefined {
  const hand = LIVE_SOURCES[info.name];
  if (hand) return hand;
  // A national official list beats public Overpass servers when there is one.
  // Every URL a view can query (its zoomed-out levels too) must be allowlisted.
  const urls = info.view ? [info.view.url, ...(info.view.levels ?? []).map((l) => l.url)] : [];
  if (!info.view || !urls.every(allowedView)) return info.osm ? osmSource(info) : undefined;
  let s = viewCache.get(info.name);
  if (!s) viewCache.set(info.name, (s = viewSource(info, info.view)));
  return s;
}
