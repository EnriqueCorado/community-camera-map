import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface Props {
  src: string;
  poster?: string;
}

/**
 * Plays an HLS (.m3u8) stream. Safari plays HLS natively; everywhere else we
 * use hls.js. The element is muted + autoplay so browsers allow it to start.
 */
export function HlsPlayer({ src, poster }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError("HLS is not supported in this browser.");
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
        setError("Stream unavailable. Caltrans feeds drop out intermittently.");
      }
    });

    return () => hls.destroy();
  }, [src]);

  if (error) {
    return <div className="player player--error">{error}</div>;
  }

  return (
    <video
      ref={videoRef}
      className="player"
      poster={poster}
      muted
      autoPlay
      playsInline
      controls
    />
  );
}
