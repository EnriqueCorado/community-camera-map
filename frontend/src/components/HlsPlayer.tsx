import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useI18n, type Key } from "../i18n";
import { prefersReducedMotion } from "../motion";

interface Props {
  src: string;
  poster?: string;
  /** Accessible name for the video element. */
  label: string;
}


/**
 * Plays an HLS (.m3u8) stream. Safari plays HLS natively; everywhere else we
 * use hls.js. Muted so browsers allow autoplay — but no autoplay for users who
 * ask for reduced motion (they can press play).
 */
export function HlsPlayer({ src, poster, label }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Store a message *key* so the text follows the current language.
  const [error, setError] = useState<Key | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);

    // Native HLS (Safari / iOS).
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    if (!Hls.isSupported()) {
      setError("hlsUnsupported");
      return;
    }

    const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (data.fatal) {
        // Tear the instance down now; the effect cleanup won't fire on this
        // re-render (src is unchanged), so without this it keeps fetching
        // segments against a detached <video>.
        hls.destroy();
        setError("streamUnavailable");
      }
    });

    return () => hls.destroy();
  }, [src]);

  if (error) {
    return (
      <div className="player player--error" role="status">
        {t(error)}
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="player"
      poster={poster}
      aria-label={label}
      muted
      autoPlay={!prefersReducedMotion()}
      playsInline
      controls
    />
  );
}
