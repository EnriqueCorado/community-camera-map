// Nationwide layers: each catalog entry with a `view` spec (from the backend
// registry) loads the area on screen straight from a national ArcGIS service
// (all verified to send CORS headers). Inside the home county — and when
// zoomed out past the spec's min_zoom — the baked copy is used instead, so
// the home view stays fast and works even if a federal server is down.
import type { LayerInfo, ViewSpec } from "./api/client";
import { LIVE_SOURCES, type LiveSource } from "./live-sources";
import { applyFields, arcgisQueryUrl, chooseSource, exceededLimit, viewCap } from "./view-logic";
import { home } from "./baked";
import { osmSource } from "./osm-sources";

type FC = GeoJSON.FeatureCollection;

function viewSource(info: LayerInfo, spec: ViewSpec): LiveSource {
  return {
    refreshMs: spec.refresh_s * 1000,
    byView: true,
    async load({ bbox, zoom, signal }) {
      const choice = chooseSource(spec, info.available && spec.baked !== false, bbox, zoom);
      if (choice === "empty") return EMPTY;
      if (choice === "home") {
        try {
          return await home(info.same_data_as ?? info.name);
        } catch (err) {
          if (zoom < spec.min_zoom) throw err;
        }
      }
      // Servers cap a page (often at 1,000): follow pages up to the cap.
      const cap = viewCap(spec, zoom);
      const features: GeoJSON.Feature[] = [];
      for (let page = 0, offset = 0; page < MAX_PAGES; page++) {
        const r = await fetch(arcgisQueryUrl(spec, bbox, zoom, offset), { signal });
        if (!r.ok) throw new Error(String(r.status));
        const json = await r.json();
        features.push(...applyFields(json, spec, zoom).features);
        const got = (json as { features: unknown[] }).features.length;
        if (!exceededLimit(json) || got === 0 || features.length >= cap) break;
        offset += got;
      }
      return { type: "FeatureCollection", features };
    },
  };
}

const EMPTY: FC = { type: "FeatureCollection", features: [] };
const MAX_PAGES = 5;

/** Hosts a catalog `view` may query (defense in depth: the catalog is ours). */
const VIEW_HOSTS =
  /^https:\/\/(services\d*\.arcgis\.com|tigerweb\.geo\.census\.gov|hazards\.fema\.gov|mapservices\.nps\.gov|gisportal\.hrsa\.gov|mapservices\.weather\.noaa\.gov|onemap\.cdc\.gov|gis\.fema\.gov|gisportal\.ers\.usda\.gov)\//;

const viewCache = new Map<string, LiveSource>();

/** The browser-side loader for a layer, if it has one: a hand-written live
 *  source (ISS, trains, …) or a nationwide view. Undefined = baked file only. */
export function liveSourceFor(info: LayerInfo): LiveSource | undefined {
  const hand = LIVE_SOURCES[info.name];
  if (hand) return hand;
  // A national official list beats public Overpass servers when there is one.
  // Every URL a view can query (its zoomed-out levels too) must be allowlisted.
  const urls = info.view ? [info.view.url, ...(info.view.levels ?? []).map((l) => l.url)] : [];
  if (!info.view || !urls.every((u) => VIEW_HOSTS.test(u))) return info.osm ? osmSource(info) : undefined;
  let s = viewCache.get(info.name);
  if (!s) viewCache.set(info.name, (s = viewSource(info, info.view)));
  return s;
}
