/** Mirrors the backend `Camera` schema (app/cameras/schemas.py). */
export interface Camera {
  id: string;
  name: string;
  county: string;
  nearby_place: string;
  route: string;
  direction: string;
  latitude: number;
  longitude: number;
  snapshot_url: string;
  stream_url: string;
  in_service: boolean;
  /** Key into CameraList.sources ("caltrans", "il", "ndbc", …). */
  source: string;
  /** US state postal code; "" offshore / unknown. */
  state: string;
  /** Extra stills from the same site (other directions). */
  views: string[];
}

/** Who publishes a camera feed (credit line + About page). */
export interface SourceInfo {
  name: string;
  state: string;
  url: string;
  credit: string;
  license: string;
  license_url: string;
}

export interface CameraList {
  count: number;
  source: string;
  sources: Record<string, SourceInfo>;
  cameras: Camera[];
}
