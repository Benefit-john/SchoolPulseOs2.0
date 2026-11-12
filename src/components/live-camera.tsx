import { Camera, CameraOff, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type CameraState = "idle" | "starting" | "live" | "error";

export function LiveCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [message, setMessage] = useState("Camera access starts only when you choose to go live.");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
    setMessage("Camera is off.");
  };

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setMessage("This browser does not support camera access.");
      return;
    }

    setState("starting");
    setMessage("Waiting for camera permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("live");
      setMessage("Live camera");
    } catch {
      setState("error");
      setMessage("Camera access was blocked. Allow camera permission, then try again.");
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-camera">
      <div className="relative grid aspect-video min-h-64 place-items-center overflow-hidden">
        <video
          ref={videoRef}
          className={`absolute inset-0 size-full object-cover ${state === "live" ? "block" : "hidden"}`}
          muted
          playsInline
          aria-label="Live CCTV camera"
        />
        {state !== "live" ? (
          <div className="relative z-10 max-w-sm px-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full border border-camera-foreground/20 bg-camera-foreground/10 text-camera-foreground">
              {state === "starting" ? (
                <LoaderCircle className="size-5 animate-spin" aria-hidden />
              ) : state === "error" ? (
                <CameraOff className="size-5" aria-hidden />
              ) : (
                <Camera className="size-5" aria-hidden />
              )}
            </span>
            <p className="mt-4 text-sm text-camera-foreground">{message}</p>
          </div>
        ) : null}
        {state === "live" ? (
          <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-camera/80 px-3 py-1 text-xs font-semibold text-camera-foreground backdrop-blur">
            <span className="size-2 rounded-full bg-danger" /> LIVE
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border bg-card p-4">
        <p className="min-w-0 truncate text-sm text-muted-foreground">Main Gate · Device camera</p>
        {state === "live" ? (
          <Button variant="outline" size="sm" onClick={stopCamera}>Stop camera</Button>
        ) : (
          <Button size="sm" onClick={startCamera} disabled={state === "starting"}>
            {state === "starting" ? "Starting…" : "Go live"}
          </Button>
        )}
      </div>
    </div>
  );
}