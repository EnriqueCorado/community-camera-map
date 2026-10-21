// Client-side downloads (this is a local app, so <a download> works).
import { api } from "./api/client";
import type { Camera } from "./types";

export function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download an overlay layer's GeoJSON straight from the API. */
export async function downloadLayer(name: string): Promise<void> {
  const res = await fetch(api.layerUrl(name));
  if (!res.ok) throw new Error(`${res.status}`);
  triggerDownload(`${name}.geojson`, await res.blob());
}

/** Download the (optionally filtered) cameras as GeoJSON. */
export function downloadCameras(cameras: Camera[]): void {
  const fc = {
    type: "FeatureCollection",
    features: cameras.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
      properties: {
        id: c.id,
        name: c.name,
        county: c.county,
        route: c.route,
        stream_url: c.stream_url,
        snapshot_url: c.snapshot_url,
      },
    })),
  };
  triggerDownload("cameras.geojson", new Blob([JSON.stringify(fc)], { type: "application/geo+json" }));
}
