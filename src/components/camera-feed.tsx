import { CameraOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CameraFeed({
  name,
  location,
  status,
  streamUrl,
  onView,
}: {
  name: string;
  location: string;
  status: string;
  streamUrl: string | null;
  onView?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewLogged = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const canPlay = status === "online" && Boolean(streamUrl);
  const isHls = Boolean(streamUrl && /\.m3u8(?:$|[?#])/i.test(streamUrl));

  useEffect(() => {
    viewLogged.current = false;
    setPlaying(false);
    setError("");
  }, [streamUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canPlay || !streamUrl || !isHls) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      return;
    }
    let cancelled = false;
    let destroyPlayer: (() => void) | undefined;
    void import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setError("This browser cannot play the configured HLS stream.");
          return;
        }

        const hls = new Hls({ lowLatencyMode: true });
        destroyPlayer = () => hls.destroy();
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal)
            setError("The live stream could not be loaded. Check the camera gateway.");
        });
      })
      .catch(() => setError("The HLS player could not be loaded."));
    return () => {
      cancelled = true;
      destroyPlayer?.();
    };
  }, [canPlay, isHls, streamUrl]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black">
      <div className="relative aspect-video">
        {canPlay ? (
          <video
            ref={videoRef}
            src={isHls ? undefined : (streamUrl ?? undefined)}
            controls
            playsInline
            autoPlay
            muted
            preload="none"
            onPlaying={() => {
              if (!viewLogged.current) {
                viewLogged.current = true;
                onView?.();
              }
              setPlaying(true);
            }}
            onPause={() => setPlaying(false)}
            onError={() => setError("The camera stream is unavailable.")}
            className="size-full object-contain"
            aria-label={`${name} live camera at ${location}`}
          />
        ) : (
          <div className="grid size-full place-items-center px-5 text-center text-sm text-white/75">
            <span>
              <CameraOff className="mx-auto mb-2 size-6" aria-hidden="true" />
              {status === "offline"
                ? "This camera is offline."
                : status === "maintenance"
                  ? "This camera is under maintenance."
                  : "No live stream is configured."}
            </span>
          </div>
        )}
        {playing && !error ? (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-sm bg-black/75 px-2 py-1 text-xs font-semibold text-white">
            <span className="size-2 rounded-full bg-danger" /> LIVE
          </span>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="absolute inset-x-3 bottom-3 bg-black/80 p-2 text-xs text-white"
          >
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/15 px-3 py-2 text-sm text-white">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-white/65">{location}</span>
      </div>
    </div>
  );
}
