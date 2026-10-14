import type { Camera } from "../types";
import { HlsPlayer } from "./HlsPlayer";

interface Props {
  camera: Camera;
  onClose: () => void;
}

export function CameraDetail({ camera, onClose }: Props) {
  return (
    <div className="detail" role="dialog" aria-label={`Live camera: ${camera.name}`}>
      <div className="detail__bar">
        <div>
          <h2>{camera.name}</h2>
          <p className="detail__meta">
            {[camera.route, camera.direction, camera.nearby_place].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" className="detail__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {/* Keyed by id so the player tears down/rebuilds when switching cameras.
          Poster uses the camera's own Caltrans image URL (works with or without
          the backend proxy). */}
      <HlsPlayer key={camera.id} src={camera.stream_url} poster={camera.snapshot_url} />

      <dl className="detail__facts">
        <div>
          <dt>Latitude</dt>
          <dd>{camera.latitude.toFixed(5)}</dd>
        </div>
        <div>
          <dt>Longitude</dt>
          <dd>{camera.longitude.toFixed(5)}</dd>
        </div>
        <div>
          <dt>County</dt>
          <dd>{camera.county}</dd>
        </div>
      </dl>
      <p className="detail__note">
        Live feed and still image courtesy of Caltrans. Streams drop out intermittently; reopen if
        the video stalls.
      </p>
    </div>
  );
}
