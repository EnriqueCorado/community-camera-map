import { useEffect, useRef, useState } from "react";
import type { Camera, SourceInfo } from "../types";
import { HlsPlayer } from "./HlsPlayer";
import { useI18n, translateDirection } from "../i18n";
import { useDialog } from "../hooks/useDialog";
import { freshImage, safeCameraUrl } from "../popup-logic";

interface Props {
  camera: Camera;
  /** Who publishes this camera (credit line); missing = generic note. */
  source?: SourceInfo;
  onClose: () => void;
}

const REFRESH_MS = 60_000; // stills update upstream every 1–5 min

/** A still image that re-fetches itself every minute (cache-busted). */
function Still({ src, alt }: { src: string; alt: string }) {
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const { t } = useI18n();
  useEffect(() => {
    setFailed(false);
    // Each tick retries, so one upstream hiccup doesn't stick.
    const id = window.setInterval(() => {
      setFailed(false);
      setNow(Date.now());
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [src]);
  if (failed) {
    return (
      <div className="player player--error" role="status">
        {t("imageUnavailable")}
      </div>
    );
  }
  return (
    <img
      className="player player--still"
      src={freshImage(src, now)}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

const https = (u: string) => (u.startsWith("https://") ? u : "");

export function CameraDetail({ camera, source, onClose }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  // Non-modal: the map stays usable behind it, but Escape closes and focus
  // returns to whatever opened it.
  useDialog(ref, onClose, { modal: false, fallbackFocus: ".maplibregl-canvas" });

  // Re-check every data-supplied URL against the media allowlist.
  const stream = safeCameraUrl(camera.stream_url);
  const stills = [camera.snapshot_url, ...camera.views].map(safeCameraUrl).filter(Boolean);
  // App keys this panel by camera id, so the view index starts at 0 per camera.
  const [view, setView] = useState(0);
  const still = stills[Math.min(view, stills.length - 1)] ?? "";

  const meta = [
    camera.route,
    camera.direction && translateDirection(t, camera.direction),
    camera.nearby_place,
  ]
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
          Video where the agency's stream allows browser playback; otherwise
          the still image, refreshed every minute. */}
      {stream ? (
        <HlsPlayer
          key={camera.id}
          src={stream}
          poster={stills[0]}
          label={t("videoLabel", { name: camera.name })}
        />
      ) : still ? (
        <Still key={`${camera.id}-${view}`} src={still} alt={t("stillLabel", { name: camera.name })} />
      ) : (
        <div className="player player--error" role="status">
          {t("imageUnavailable")}
        </div>
      )}

      {!stream && stills.length > 1 && (
        <div className="chips detail__views" role="group" aria-label={t("cameraViews")}>
          {stills.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`chip ${i === view ? "chip--on" : ""}`}
              aria-pressed={i === view}
              onClick={() => setView(i)}
            >
              {t("viewN", { n: i + 1 })}
            </button>
          ))}
        </div>
      )}

      <dl className="detail__facts">
        <div>
          <dt>{t("latitude")}</dt>
          <dd>{camera.latitude.toFixed(5)}</dd>
        </div>
        <div>
          <dt>{t("longitude")}</dt>
          <dd>{camera.longitude.toFixed(5)}</dd>
        </div>
        {camera.county && (
          <div>
            <dt>{t("county")}</dt>
            <dd>{camera.county}</dd>
          </div>
        )}
        {camera.state && (
          <div>
            <dt>{t("state")}</dt>
            <dd>{camera.state}</dd>
          </div>
        )}
      </dl>
      <p className="detail__note">
        {source ? (
          <>
            {t("cameraCredit")}{" "}
            {https(source.url) ? (
              <a href={https(source.url)} target="_blank" rel="noopener noreferrer">
                {source.credit}
              </a>
            ) : (
              source.credit
            )}
            {source.license && https(source.license_url) && (
              <>
                {" "}
                (
                <a href={https(source.license_url)} target="_blank" rel="noopener noreferrer license">
                  {source.license}
                </a>
                )
              </>
            )}
            . {t("cameraNote")}
          </>
        ) : (
          t("cameraNote")
        )}
      </p>
    </div>
  );
}
