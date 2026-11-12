"use client";

import { Html5Qrcode, Html5QrcodeSupportedFormats, type CameraDevice } from "html5-qrcode";
import { Camera, CheckCircle2, ImagePlus, LoaderCircle, RotateCw, Square, Zap } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEFAULT_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.UPC_A,
];

const IN_APP_BROWSER = /WhatsApp|Instagram|FBAN|FBAV|Telegram|Snapchat/i;
const REAR_CAMERA = /back|rear|environment|world/i;
const FRONT_CAMERA = /front|user|selfie|facetime/i;
const SECURE_CONTEXT_MESSAGE = "Camera needs a secure (https) connection. Open the live site.";

type ScanStatus = "idle" | "starting" | "scanning" | "success" | "error";

export type ScannerProps = {
  onScan: (text: string) => string | void | Promise<string | void>;
  onError?: (message: string) => void;
  formats?: Html5QrcodeSupportedFormats[];
};

function errorName(error: unknown) {
  return error && typeof error === "object" && "name" in error ? String(error.name) : "";
}

function cameraErrorMessage(error: unknown) {
  const name = errorName(error);
  const detail = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/NotAllowedError|PermissionDeniedError/i.test(`${name} ${detail}`)) {
    return "Camera access is blocked. On iPhone: tap aA in the address bar, then Website Settings, then Camera, then Allow.";
  }
  if (/NotFoundError|NotFoundException/i.test(`${name} ${detail}`)) {
    return "No camera found on this device. Use the manual entry below.";
  }
  if (/NotReadableError|TrackStartError/i.test(`${name} ${detail}`)) {
    return "Another app is using the camera. Close it and try again.";
  }
  return "Could not start the camera. Check browser permissions or use manual entry below.";
}

export default function Scanner({ onScan, onError, formats = DEFAULT_FORMATS }: ScannerProps) {
  const generatedId = useId();
  const readerId = `student-scanner-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const readerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(false);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const stopRequestedRef = useRef(false);
  const scanLockedRef = useRef(false);
  const lastResultRef = useRef({ text: "", at: 0 });
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const formatsRef = useRef(formats);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [message, setMessage] = useState("Ready to scan a student ID or enter it below.");
  const [manualValue, setManualValue] = useState("");
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState("");
  const [activeFacingMode, setActiveFacingMode] = useState<"environment" | "user" | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  onScanRef.current = onScan;
  onErrorRef.current = onError;
  formatsRef.current = formats;

  useEffect(() => {
    const reader = new Html5Qrcode(readerId, {
      verbose: false,
      formatsToSupport: formatsRef.current,
      useBarCodeDetectorIfSupported: false,
    });
    readerRef.current = reader;
    mountedRef.current = true;

    const stopWhenHidden = () => {
      if (!document.hidden) return;
      stopRequestedRef.current = true;
      if (mountedRef.current) {
        setStatus("idle");
        setMessage("Camera paused because this tab is hidden.");
      }
      if (reader.isScanning) {
        void reader
          .stop()
          .then(() => {
            if (mountedRef.current) setTorchOn(false);
          })
          .catch((error: unknown) => console.error("Could not stop the hidden scanner", error));
      }
    };

    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      mountedRef.current = false;
      stopRequestedRef.current = true;
      document.removeEventListener("visibilitychange", stopWhenHidden);
      if (readerRef.current === reader) readerRef.current = null;
      if (!reader.isScanning) {
        reader.clear();
        return;
      }
      void reader
        .stop()
        .then(() => reader.clear())
        .catch((error: unknown) => {
          console.error("Could not clean up the scanner", error);
        });
    };
  }, [readerId]);

  const setFailure = (friendlyMessage: string, error?: unknown) => {
    if (error !== undefined) console.error("Scanner error", error);
    if (mountedRef.current) {
      setStatus("error");
      setMessage(friendlyMessage);
    }
    if (mountedRef.current) onErrorRef.current?.(friendlyMessage);
  };

  const stopCamera = async (resetStatus = true) => {
    stopRequestedRef.current = true;
    if (stopPromiseRef.current) return stopPromiseRef.current;
    const reader = readerRef.current;
    if (!reader?.isScanning) {
      if (resetStatus && mountedRef.current) setStatus("idle");
      return;
    }

    const stopping = reader
      .stop()
      .then(() => {
        if (mountedRef.current) {
          setTorchOn(false);
          setTorchAvailable(false);
          if (resetStatus) setStatus("idle");
        }
      })
      .catch((error: unknown) => {
        console.error("Could not stop the scanner", error);
      })
      .finally(() => {
        stopPromiseRef.current = null;
      });
    stopPromiseRef.current = stopping;
    return stopping;
  };

  const deliverResult = async (rawText: string) => {
    const text = rawText.trim();
    const now = Date.now();
    if (
      !text ||
      scanLockedRef.current ||
      (lastResultRef.current.text === text && now - lastResultRef.current.at < 2000)
    ) {
      return;
    }

    scanLockedRef.current = true;
    lastResultRef.current = { text, at: now };
    await stopCamera(false);
    if (mountedRef.current) {
      setStatus("starting");
      setMessage("Code detected. Checking the student record…");
    }

    try {
      const studentName = await onScanRef.current(text);
      if (mountedRef.current) {
        setStatus("success");
        setMessage(
          studentName
            ? `${studentName} found. Attendance updated.`
            : "Student verified and attendance updated.",
        );
        setManualValue("");
      }
    } catch (error) {
      const friendlyMessage =
        error instanceof Error
          ? error.message
          : "Could not verify this student. Check the ID and try again.";
      setFailure(friendlyMessage, error);
    } finally {
      window.setTimeout(() => {
        scanLockedRef.current = false;
      }, 2000);
    }
  };

  const startCamera = async (
    camera: string | MediaTrackConstraints = { facingMode: "environment" },
  ) => {
    const reader = readerRef.current;
    if (!reader || startPromiseRef.current || reader.isScanning) return;

    const startOperation = (async () => {
      stopRequestedRef.current = false;
      setStatus("starting");
      setMessage("Starting camera…");

      if (IN_APP_BROWSER.test(navigator.userAgent)) {
        setFailure("Open this page in Safari or Chrome to use the camera.");
        return;
      }
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setFailure(SECURE_CONTEXT_MESSAGE);
        return;
      }

      try {
        await reader.start(
          camera,
          {
            fps: 10,
            qrbox: (width, height) => {
              const side = Math.floor(Math.min(width, height) * 0.7);
              return { width: side, height: side };
            },
          },
          (text) => void deliverResult(text),
          () => undefined,
        );

        if (!mountedRef.current || stopRequestedRef.current) {
          if (reader.isScanning) await reader.stop();
          return;
        }

        setStatus("scanning");
        setMessage("Point the camera at a student QR code or barcode.");
        try {
          const foundCameras = await Html5Qrcode.getCameras();
          const settings = reader.getRunningTrackSettings();
          const rearCamera = foundCameras.find((device) => REAR_CAMERA.test(device.label));
          const frontCamera = foundCameras.find((device) => FRONT_CAMERA.test(device.label));
          const trackFacingMode = settings.facingMode;
          const inferredCamera =
            trackFacingMode === "environment"
              ? rearCamera
              : trackFacingMode === "user"
                ? frontCamera
                : undefined;
          const currentId =
            settings.deviceId ||
            (typeof camera === "string" ? camera : "") ||
            inferredCamera?.id ||
            "";
          const currentCamera = foundCameras.find((device) => device.id === currentId);
          const currentLabel = currentCamera?.label ?? "";
          const facingMode = REAR_CAMERA.test(currentLabel)
            ? "environment"
            : FRONT_CAMERA.test(currentLabel)
              ? "user"
              : trackFacingMode === "environment" || trackFacingMode === "user"
                ? trackFacingMode
                : null;
          const capabilities = reader.getRunningTrackCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
          };
          if (mountedRef.current) {
            setCameras(foundCameras);
            setActiveCameraId(currentId);
            setActiveFacingMode(facingMode);
            setTorchAvailable(capabilities.torch === true);
            setMessage(
              facingMode === "environment"
                ? "Back camera active. Point it at a student QR code or barcode."
                : facingMode === "user"
                  ? "Front camera active. Point it at a student QR code or barcode."
                  : "Point the camera at a student QR code or barcode.",
            );
          }
        } catch (error) {
          console.error("Could not inspect scanner camera capabilities", error);
        }
      } catch (error) {
        setFailure(cameraErrorMessage(error), error);
        if (reader.isScanning) {
          try {
            await reader.stop();
          } catch (stopError) {
            console.error("Could not stop the failed scanner", stopError);
          }
        }
      }
    })();

    startPromiseRef.current = startOperation;
    try {
      await startOperation;
    } finally {
      if (startPromiseRef.current === startOperation) startPromiseRef.current = null;
    }
  };

  const switchCamera = async () => {
    const rearCamera = cameras.find((camera) => REAR_CAMERA.test(camera.label));
    const frontCamera = cameras.find((camera) => FRONT_CAMERA.test(camera.label));
    const currentCamera = cameras.find((camera) => camera.id === activeCameraId);
    let nextCamera: CameraDevice | undefined;
    let nextFacingMode: "environment" | "user" | null = null;

    if (rearCamera && frontCamera) {
      const currentIsRear =
        currentCamera?.id === rearCamera.id ||
        (!currentCamera && activeFacingMode === "environment");
      nextCamera = currentIsRear ? frontCamera : rearCamera;
      nextFacingMode = currentIsRear ? "user" : "environment";
    } else if (activeFacingMode) {
      nextFacingMode = activeFacingMode === "environment" ? "user" : "environment";
      nextCamera = nextFacingMode === "environment" ? rearCamera : frontCamera;
    } else if (activeCameraId) {
      nextCamera = cameras.find((camera) => camera.id !== activeCameraId);
    } else {
      nextCamera = rearCamera ?? cameras[0];
    }

    nextCamera ??= cameras.find((camera) => camera.id !== activeCameraId) ?? cameras[0];
    if (!nextCamera) return;
    await stopCamera(false);
    await startCamera(nextFacingMode ? { facingMode: nextFacingMode } : nextCamera.id);
  };

  const toggleTorch = async () => {
    const reader = readerRef.current;
    if (!reader || !torchAvailable) return;
    try {
      const next = !torchOn;
      await reader.applyVideoConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet & { torch: boolean }],
      });
      setTorchOn(next);
    } catch (error) {
      setFailure("This camera could not change its torch setting.", error);
    }
  };

  const scanPhoto = async (file?: File) => {
    const reader = readerRef.current;
    if (!reader || !file) return;
    if (reader.isScanning) await stopCamera(false);
    setStatus("starting");
    setMessage("Reading the uploaded image…");
    try {
      const text = await reader.scanFile(file, false);
      await deliverResult(text);
    } catch (error) {
      console.error("Could not scan uploaded image", error);
      setFailure(
        "Could not find a QR code or barcode in that photo. Try another image or enter the ID manually.",
      );
    } finally {
      try {
        reader.clear();
      } catch (error) {
        console.error("Could not clear the uploaded scan preview", error);
      }
    }
  };

  const statusLabel: Record<ScanStatus, string> = {
    idle: "Ready",
    starting: "Starting",
    scanning: "Scanning",
    success: "Success",
    error: "Error",
  };
  const activeCameraLabel = cameras.find((camera) => camera.id === activeCameraId)?.label ?? "";
  const isRearCamera = activeFacingMode === "environment" || REAR_CAMERA.test(activeCameraLabel);
  const isFrontCamera = activeFacingMode === "user" || FRONT_CAMERA.test(activeCameraLabel);
  const cameraSwitchLabel = isRearCamera
    ? "Use front camera"
    : isFrontCamera
      ? "Use back camera"
      : "Switch camera";

  return (
    <section className="clay-card hairline-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-5">
      <div className="scanner-frame relative aspect-[4/3] min-h-56 overflow-hidden rounded-xl bg-shell text-shell-foreground">
        <div id={readerId} className="scanner-reader size-full" />
        {status === "scanning" ? (
          <div className="scanner-radar pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="scanner-radar-sweep" />
          </div>
        ) : null}
        {status !== "scanning" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-5 text-center">
            {status === "starting" ? (
              <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
            ) : status === "success" ? (
              <CheckCircle2 className="clay-success-pop size-9 text-success" aria-hidden="true" />
            ) : (
              <Camera className="size-9 text-gold" aria-hidden="true" />
            )}
            <span className="sr-only">{message}</span>
          </div>
        ) : null}
        <div
          className={`scanner-frame-overlay pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-dashed border-gold/75 ${status === "scanning" ? "scanner-frame-pulse" : ""}`}
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`clay-chip ${status}`} role="status" aria-live="polite">
          {statusLabel[status]}
        </span>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{message}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {status === "scanning" ? (
          <Button className="clay-btn min-h-11 gap-2" onClick={() => void stopCamera()}>
            <Square className="size-4" /> Stop scanning
          </Button>
        ) : (
          <Button
            className="clay-btn min-h-11 gap-2"
            onClick={() => void startCamera()}
            disabled={status === "starting"}
          >
            <Camera className="size-4" /> Start scanning
          </Button>
        )}
        {status === "scanning" && cameras.length > 1 ? (
          <Button
            variant="outline"
            className="clay-btn min-h-11 gap-2"
            onClick={() => void switchCamera()}
          >
            <RotateCw className="size-4" /> {cameraSwitchLabel}
          </Button>
        ) : null}
        {status === "scanning" && torchAvailable ? (
          <Button
            variant="outline"
            className="clay-btn min-h-11 gap-2"
            onClick={() => void toggleTorch()}
            aria-pressed={torchOn}
          >
            <Zap className="size-4" /> {torchOn ? "Turn torch off" : "Turn torch on"}
          </Button>
        ) : null}
      </div>

      <form
        className="grid min-w-0 gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void deliverResult(manualValue);
        }}
      >
        <Input
          aria-label="Admission number or student ID"
          autoComplete="off"
          className="min-w-0 min-h-11"
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          placeholder="Admission number or ID"
        />
        <Button className="clay-btn min-h-11" type="submit" disabled={!manualValue.trim()}>
          Submit ID
        </Button>
        <input
          accept="image/*"
          className="sr-only"
          id={`${readerId}-photo`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            void scanPhoto(file);
            event.currentTarget.value = "";
          }}
          type="file"
        />
        <Button
          className="clay-btn min-h-11 gap-2 sm:col-span-3 sm:justify-self-start"
          onClick={() => document.getElementById(`${readerId}-photo`)?.click()}
          type="button"
        >
          <ImagePlus className="size-4" /> Upload a photo
        </Button>
      </form>
    </section>
  );
}
