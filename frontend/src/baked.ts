// The baked (pre-built) copy of a layer, fetched once per file and shared:
// nationwide layers use it at home and when zoomed out, and the
// "What's near an address?" report reads home-county lists from it.
import { api } from "./api/client";

type FC = GeoJSON.FeatureCollection;

// One baked-file fetch per file (the census layers all share census.geojson).
const homeFiles = new Map<string, Promise<FC>>();
export function home(file: string): Promise<FC> {
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
