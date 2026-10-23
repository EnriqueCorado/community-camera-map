import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
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

    // hls.js (~185 KB gzipped) loads only when a stream is first opened, not
    // with the map.
    let cancelled = false;
    let hls: Hls | null = null;
    import("hls.js").then(
      ({ default: HlsJs }) => {
        if (cancelled) return;
        if (!HlsJs.isSupported()) {
          setError("hlsUnsupported");
          return;
        }
        const h = new HlsJs({ enableWorker: true, lowLatencyMode: true });
        hls = h;
        h.loadSource(src);
        h.attachMedia(video);
        h.on(HlsJs.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            // Tear the instance down now; the effect cleanup won't fire on this
            // re-render (src is unchanged), so without this it keeps fetching
            // segments against a detached <video>.
            h.destroy();
            hls = null;
            setError("streamUnavailable");
          }
        });
      },
      (err: unknown) => {
        // e.g. offline: the player's code didn't load.
        if (cancelled) return;
        console.warn("Video player could not load:", err instanceof Error ? err.message : err);
        setError("streamUnavailable");
      },
    );

    return () => {
      cancelled = true;
      hls?.destroy();
    };
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
