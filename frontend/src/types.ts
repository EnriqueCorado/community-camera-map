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
}

export interface CameraList {
  count: number;
  source: string;
  cameras: Camera[];
}
