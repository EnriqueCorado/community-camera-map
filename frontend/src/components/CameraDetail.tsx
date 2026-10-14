import { useRef } from "react";
import type { Camera } from "../types";
import { HlsPlayer } from "./HlsPlayer";
import { useI18n, translateDirection } from "../i18n";
import { useDialog } from "../hooks/useDialog";

interface Props {
  camera: Camera;
  onClose: () => void;
}

export function CameraDetail({ camera, onClose }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  // Non-modal: the map stays usable behind it, but Escape closes and focus
  // returns to whatever opened it.
  useDialog(ref, onClose, { modal: false, fallbackFocus: ".maplibregl-canvas" });

  const meta = [camera.route, camera.direction && translateDirection(t, camera.direction), camera.nearby_place]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={ref}
      className="detail"
      role="dialog"
      aria-labelledby="detail-title"
      tabIndex={-1}
    >
      <div className="detail__bar">
        <div>
          <h2 id="detail-title">{camera.name}</h2>
          <p className="detail__meta">{meta}</p>
        </div>
        <button type="button" className="detail__close" onClick={onClose} aria-label={t("close")}>
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* Keyed by id so the player tears down/rebuilds when switching cameras.
          Poster uses the camera's own Caltrans image URL (works with or without
          the backend proxy). */}
      <HlsPlayer
        key={camera.id}
        src={camera.stream_url}
        poster={camera.snapshot_url}
        label={t("videoLabel", { name: camera.name })}
      />

      <dl className="detail__facts">
        <div>
          <dt>{t("latitude")}</dt>
          <dd>{camera.latitude.toFixed(5)}</dd>
        </div>
        <div>
          <dt>{t("longitude")}</dt>
          <dd>{camera.longitude.toFixed(5)}</dd>
        </div>
        <div>
          <dt>{t("county")}</dt>
          <dd>{camera.county}</dd>
        </div>
      </dl>
      <p className="detail__note">{t("cameraNote")}</p>
    </div>
  );
}
