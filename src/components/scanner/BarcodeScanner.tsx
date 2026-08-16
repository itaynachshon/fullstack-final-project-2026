"use client";

/**
 * BarcodeScanner — Wave 2 Agent C.
 *
 * Implements the frozen contract from src/lib/types.ts:
 *
 *   <BarcodeScanner onDetected={(raw) => …} paused={…} />
 *
 * Responsibility: camera → detect grocery barcode (EAN-13/EAN-8/UPC-A/UPC-E)
 * → emit the RAW detected string exactly once per armed scan. Normalization,
 * check digits, RCN classification, and product lookup are Agent A's domain
 * and happen in the parent (Wave 3 integration); nothing here touches the
 * network, Supabase, or src/lib/{products,barcode}.
 *
 * Detection stack: @yudiel/react-qr-scanner → barcode-detector ponyfill →
 * zxing-wasm (WASM fetched from jsDelivr by default; self-hosting is a
 * Wave 3 task — see the Wave 2 Agent C handoff notes).
 *
 * Duplicate suppression: after the first accepted detection the state
 * machine (scanner-state.ts) locks in `detected` and the library is paused
 * (frozen preview, camera stopped). Re-arm happens only via the in-viewport
 * "Scan another" button or the external `paused` prop flipping true → false.
 *
 * Lifecycle: the camera never starts on mount — only from the "Enable
 * camera" gesture (iOS-predictable, UI_DESIGN §6.4.1 state 1). The library
 * owns getUserMedia/track cleanup on pause and unmount; the heavy scanner
 * chunk is lazy-loaded so pages pay for it only after that gesture.
 */

import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  IDetectedBarcode,
  IScannerError,
  IScannerHandle,
  IScannerProps,
} from "@yudiel/react-qr-scanner";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import type { BarcodeScannerProps } from "@/lib/types";

import {
  CameraIcon,
  CameraOffIcon,
  CircleCheckIcon,
  FlashlightIcon,
  FlashlightOffIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "./scanner-icons";
import {
  createScannerController,
  INITIAL_SCANNER_STATE,
  SCANNER_FORMATS,
  trackSupportsTorch,
  type ScannerController,
  type ScannerEvent,
  type ScannerState,
  type ScannerStatus,
} from "./scanner-state";
import animations from "./scanner.module.css";

/**
 * A fresh lazy wrapper per enable attempt lets "Try again" retry a failed
 * chunk download (React caches a rejected lazy factory forever).
 */
function createLazyScanner() {
  return lazy(async () => ({
    default: (await import("@yudiel/react-qr-scanner")).Scanner,
  }));
}

/** Grocery formats only — validated against the installed library's types. */
const FORMATS = [...SCANNER_FORMATS] satisfies NonNullable<
  IScannerProps["formats"]
>;

/**
 * Rear camera preferred, 720p-class stream (wide enough for 1D bars).
 * `ideal`-only values so devices without a rear camera (laptops) fall back
 * to whatever exists instead of throwing OverconstrainedError.
 * Module-level constant: the library restarts the camera when the
 * constraints object identity changes.
 */
const CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

const SCANNER_STYLES: IScannerProps["styles"] = {
  container: { width: "100%", height: "100%" },
  video: { width: "100%", height: "100%", objectFit: "cover" },
};

/** Built-in UI off — the overlay and torch button below follow UI_DESIGN. */
const SCANNER_COMPONENTS: IScannerProps["components"] = {
  finder: false,
  torch: false,
};

/** Screen-reader status line (visible states carry their own text). */
const STATUS_MESSAGES: Record<ScannerStatus, string> = {
  idle: "Camera is off.",
  requesting: "Waiting for camera permission.",
  scanning: "Camera is on — point it at a barcode.",
  detected: "Barcode detected.",
  denied: "Camera permission is off. You can type the barcode instead.",
  unavailable: "No usable camera found. You can type the barcode instead.",
  error: "The camera ran into a problem. Try again or type the barcode.",
};

const BRACKET_CORNERS = [
  "left-0 top-0 rounded-tl-lg border-l-2 border-t-2",
  "right-0 top-0 rounded-tr-lg border-r-2 border-t-2",
  "bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2",
  "bottom-0 right-0 rounded-br-lg border-b-2 border-r-2",
] as const;

export function BarcodeScanner({
  onDetected,
  paused = false,
}: BarcodeScannerProps) {
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  // Recreated on every enable attempt so a failed chunk download can be
  // retried (React caches a rejected lazy factory forever); the id keys the
  // error boundary so it resets alongside it.
  const [scannerModule, setScannerModule] = useState(() => ({
    id: 0,
    LazyScanner: createLazyScanner(),
  }));

  const scannerRef = useRef<IScannerHandle | null>(null);
  const onDetectedRef = useRef(onDetected);
  const pausedRef = useRef(paused);

  const [state, setState] = useState<ScannerState>(INITIAL_SCANNER_STATE);

  // The behavioral core lives in the pure controller (scanner-state.ts);
  // this component only renders it and feeds it library/browser events
  // through this stable dispatcher. The controller is created lazily on the
  // first event (never during render, per the react-hooks/refs rule); its
  // callbacks push controller state into React and reset the torch whenever
  // the live-scanning phase ends (stopping the track physically turns the
  // torch off anyway).
  const controllerRef = useRef<ScannerController | null>(null);
  const dispatch = useCallback((event: ScannerEvent) => {
    controllerRef.current ??= createScannerController({
      onDetected: (raw) => onDetectedRef.current(raw),
      onStateChange: (next) => {
        setState(next);
        if (next.status !== "scanning") {
          setTorchOn(false);
        }
      },
      onFeedback: () => {
        try {
          // Subtle success haptic where supported (Android Chrome; iOS
          // Safari has no vibrate API — scanning never depends on it).
          navigator.vibrate?.(50);
        } catch {
          // Ignore — feedback is best-effort by design.
        }
      },
    });
    controllerRef.current.dispatch(event);
  }, []);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  // Frozen-contract `paused` semantics: while true, detections are ignored
  // (controller checks pausedRef per frame); the true → false edge re-arms
  // a locked scanner so Wave 3 can auto-resume after its confirm sheet.
  useEffect(() => {
    const wasPaused = pausedRef.current;
    pausedRef.current = paused;
    if (wasPaused && !paused) {
      dispatch({ type: "scan-again" });
    }
  }, [paused, dispatch]);

  // "Requesting" → "scanning" once the video element actually plays frames.
  // Polling beats event wiring here: the video element belongs to the
  // lazy-loaded library and may not exist yet when this effect first runs.
  useEffect(() => {
    if (state.status !== "requesting") return;
    const timer = window.setInterval(() => {
      const video = scannerRef.current?.getVideoElement();
      if (
        video &&
        video.readyState >= video.HAVE_CURRENT_DATA &&
        !video.paused
      ) {
        dispatch({ type: "camera-ready" });
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [state.status, dispatch]);

  // While scanning: probe the live track for torch support (capabilities
  // settle ~500ms after play) and watch for mid-session track loss
  // (permission revoked, camera detached) so the UI never freezes silently.
  useEffect(() => {
    if (state.status !== "scanning") return;
    let watchedTrack: MediaStreamTrack | null = null;
    const handleEnded = () => {
      dispatch({ type: "camera-error", kind: "unknown" });
    };
    const inspectTrack = () => {
      const track =
        scannerRef.current?.getStream()?.getVideoTracks()[0] ?? null;
      if (track && watchedTrack === null) {
        watchedTrack = track;
        track.addEventListener("ended", handleEnded);
      }
      if (trackSupportsTorch(track)) {
        setTorchSupported(true);
      }
    };
    const probeEarly = window.setTimeout(inspectTrack, 650);
    const probeLate = window.setTimeout(inspectTrack, 2000);
    return () => {
      window.clearTimeout(probeEarly);
      window.clearTimeout(probeLate);
      watchedTrack?.removeEventListener("ended", handleEnded);
    };
  }, [state.status, dispatch]);

  const handleScan = useCallback(
    (codes: IDetectedBarcode[]) => {
      dispatch({
        type: "detections",
        rawValues: codes.map((code) => code.rawValue),
        paused: pausedRef.current,
      });
    },
    [dispatch],
  );

  const handleError = useCallback(
    (error: IScannerError) => {
      dispatch({ type: "camera-error", kind: error.kind });
    },
    [dispatch],
  );

  const handleEnable = useCallback(() => {
    setScannerModule((previous) => ({
      id: previous.id + 1,
      LazyScanner: createLazyScanner(),
    }));
    dispatch({ type: "enable" });
  }, [dispatch]);

  const handleScanAgain = useCallback(() => {
    dispatch({ type: "scan-again" });
  }, [dispatch]);

  const handleTorchToggle = useCallback(async () => {
    const track = scannerRef.current?.getStream()?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // Torch failure is non-fatal — scanning continues without it.
    }
  }, [torchOn]);

  const { LazyScanner } = scannerModule;
  const { status } = state;
  const cameraMounted =
    status === "requesting" || status === "scanning" || status === "detected";
  const overlayVisible = status === "scanning" || status === "detected";
  // External pause OR internal post-detection lock → library freezes the
  // last frame and stops the camera/decoder (its own cleanup).
  const scannerPaused = paused || status === "detected";

  return (
    <section aria-label="Barcode scanner" className="w-full">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted md:max-h-[420px]">
        {cameraMounted ? (
          <div
            className={cn(
              "absolute inset-0",
              status === "requesting" && "invisible",
            )}
          >
            <ScannerChunkBoundary key={scannerModule.id} onError={handleError}>
              <Suspense fallback={null}>
                <LazyScanner
                  ref={scannerRef}
                  onScan={handleScan}
                  onError={handleError}
                  formats={FORMATS}
                  constraints={CAMERA_CONSTRAINTS}
                  paused={scannerPaused}
                  components={SCANNER_COMPONENTS}
                  styles={SCANNER_STYLES}
                  sound={false}
                />
              </Suspense>
            </ScannerChunkBoundary>
          </div>
        ) : null}

        {overlayVisible ? (
          <>
            {/* Dim layer with a clear wide window — EAN-13 is wide, not
                square, so the target is 78% width at 2.4:1 (§6.4.1). */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 grid place-items-center"
            >
              <div
                className="relative w-[78%] rounded-lg shadow-[0_0_0_9999px_rgb(0_0_0/0.4)]"
                style={{ aspectRatio: "2.4 / 1" }}
              >
                {BRACKET_CORNERS.map((corner) => (
                  <span
                    key={corner}
                    className={cn(
                      "absolute h-4 w-6",
                      corner,
                      status === "detected"
                        ? "border-primary"
                        : cn("border-white/90", animations.breathe),
                    )}
                  />
                ))}
                {status === "detected" ? (
                  <CircleCheckIcon
                    className={cn(
                      "absolute inset-0 m-auto size-12 text-white",
                      animations.pop,
                    )}
                  />
                ) : null}
              </div>
            </div>

            {status === "scanning" ? (
              <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs whitespace-nowrap text-white">
                Point at the barcode
              </p>
            ) : null}

            {/* Parent-paused (Wave 3 sheet open) → the parent owns resume;
                otherwise offer the explicit re-arm affordance. */}
            {status === "detected" && !paused ? (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                <Button variant="secondary" onClick={handleScanAgain}>
                  Scan another
                </Button>
              </div>
            ) : null}

            {status === "scanning" && torchSupported ? (
              <button
                type="button"
                onClick={handleTorchToggle}
                aria-label={
                  torchOn ? "Turn flashlight off" : "Turn flashlight on"
                }
                aria-pressed={torchOn}
                className={cn(
                  "absolute right-3 bottom-3 grid size-11 place-items-center rounded-full bg-black/50 text-white transition-colors duration-150 outline-none hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  torchOn && "ring-2 ring-ring",
                )}
              >
                {torchOn ? (
                  <FlashlightOffIcon className="size-6" />
                ) : (
                  <FlashlightIcon className="size-6" />
                )}
              </button>
            ) : null}
          </>
        ) : null}

        {status === "idle" || status === "requesting" ? (
          <Panel>
            <CameraIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="mt-3 text-base font-semibold">
              Scan barcodes with your camera
            </h3>
            <p className="text-xs text-muted-foreground">
              The camera is used for scanning only — nothing is recorded.
            </p>
            {status === "idle" ? (
              <Button className="mt-4" onClick={handleEnable}>
                Enable camera
              </Button>
            ) : (
              <>
                <Button className="mt-4" disabled>
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                  Waiting for permission…
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose “Allow” in the browser prompt.
                </p>
              </>
            )}
          </Panel>
        ) : null}

        {status === "denied" ? (
          <Panel>
            <CameraOffIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="mt-3 text-base font-semibold">Camera is off</h3>
            <p className="text-sm text-muted-foreground">
              No problem — type the code printed under the barcode lines. Same
              result.
            </p>
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
                How to turn the camera back on
              </summary>
              <p className="mx-auto mt-2 max-w-60">
                In your browser’s settings for this site, allow Camera access.
                Then come back and tap “Try again”.
              </p>
              <Button variant="ghost" className="mt-2" onClick={handleEnable}>
                Try again
              </Button>
            </details>
          </Panel>
        ) : null}

        {status === "unavailable" ? (
          <Panel>
            <CameraOffIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="mt-3 text-base font-semibold">Camera is off</h3>
            <p className="text-sm text-muted-foreground">
              No problem — type the code printed under the barcode lines. Same
              result.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This device or browser doesn’t offer a camera this page can use.
            </p>
          </Panel>
        ) : null}

        {status === "error" ? (
          <Panel>
            <TriangleAlertIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="mt-3 text-base font-semibold">
              Something went wrong with the camera
            </h3>
            <p className="text-sm text-muted-foreground">
              You can try again — or type the code printed under the barcode
              lines.
            </p>
            <Button variant="secondary" className="mt-4" onClick={handleEnable}>
              Try again
            </Button>
          </Panel>
        ) : null}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {STATUS_MESSAGES[status]}
      </div>
    </section>
  );
}

/** Calm muted panel filling the viewport (idle/denied/unavailable/error). */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted px-6 text-center">
      {children}
    </div>
  );
}

/**
 * Catches lazy-chunk load failures (offline/flaky mobile networks) and
 * routes them into the scanner's normal error state instead of crashing
 * the page. Remounted (fresh `key`) on every enable attempt.
 */
class ScannerChunkBoundary extends Component<
  { onError: (error: IScannerError) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError({
      kind: "unknown",
      message: "Scanner failed to load",
      cause: error,
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
