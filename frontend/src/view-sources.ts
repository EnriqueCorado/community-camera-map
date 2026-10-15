// Nationwide layers: each catalog entry with a `view` spec (from the backend
// registry) loads the area on screen straight from a national ArcGIS service
// (all verified to send CORS headers). Inside the home county — and when
// zoomed out past the spec's min_zoom — the baked copy is used instead, so
// the home view stays fast and works even if a federal server is down.
import { api, type LayerInfo, type ViewSpec } from "./api/client";
import { LIVE_SOURCES, type LiveSource } from "./live-sources";
import { applyFields, arcgisQueryUrl, chooseSource } from "./view-logic";

type FC = GeoJSON.FeatureCollection;

// One baked-file fetch per file (the census layers all share census.geojson).
const homeFiles = new Map<string, Promise<FC>>();
function home(file: string): Promise<FC> {
  let p = homeFiles.get(file);
  if (!p) {
    p = fetch(api.layerUrl(file))
      .then((r) => (r.ok ? (r.json() as Promise<FC>) : Promise.reject(new Error(String(r.status)))))
      .catch((err: unknown) => {
        homeFiles.delete(file); // retry next time
        throw err;
      });
    homeFiles.set(file, p);
  }
  return p;
}

function viewSource(info: LayerInfo, spec: ViewSpec): LiveSource {
  return {
    refreshMs: spec.refresh_s * 1000,
    byView: true,
    async load({ bbox, zoom, signal }) {
      const choice = chooseSource(spec, info.available, bbox, zoom);
      if (choice === "empty") return EMPTY;
      if (choice === "home") {
        try {
          return await home(info.same_data_as ?? info.name);
        } catch (err) {
          if (zoom < spec.min_zoom) throw err;
        }
      }
      const r = await fetch(arcgisQueryUrl(spec, bbox, zoom), { signal });
      if (!r.ok) throw new Error(String(r.status));
      return applyFields(await r.json(), spec);
    },
  };
}

const EMPTY: FC = { type: "FeatureCollection", features: [] };

/** Hosts a catalog `view` may query (defense in depth: the catalog is ours). */
const VIEW_HOSTS = /^https:\/\/(services\d*\.arcgis\.com|tigerweb\.geo\.census\.gov|hazards\.fema\.gov|mapservices\.nps\.gov)\//;

const viewCache = new Map<string, LiveSource>();

/** The browser-side loader for a layer, if it has one: a hand-written live
 *  source (ISS, trains, …) or a nationwide view. Undefined = baked file only. */
export function liveSourceFor(info: LayerInfo): LiveSource | undefined {
  const hand = LIVE_SOURCES[info.name];
  if (hand) return hand;
  if (!info.view || !VIEW_HOSTS.test(info.view.url)) return undefined;
  let s = viewCache.get(info.name);
  if (!s) viewCache.set(info.name, (s = viewSource(info, info.view)));
  return s;
}
