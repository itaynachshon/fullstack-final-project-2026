/**
 * Pure scanner state controller — no React, no browser APIs, no camera.
 *
 * The BarcodeScanner component wires library/browser events into this
 * controller; every behavioral rule (state transitions, duplicate-scan
 * suppression, error classification) lives here so it can be unit-tested
 * in the project's node-environment Vitest setup without mocking a camera.
 *
 * Contract reminder (docs/TECHNICAL_DESIGN.md §5, frozen): the scanner emits
 * the RAW detected string exactly once per armed scan via `onDetected` and
 * owns no normalization, validation, or lookup logic.
 */

/**
 * UI states from docs/UI_DESIGN.md §6.4.1:
 * - `idle`        state 1  (pre-permission; camera only starts from a user gesture)
 * - `requesting`  state 2  (permission prompt / camera warming up)
 * - `scanning`    state 3  (live video, detection armed)
 * - `detected`    state 4  (frozen preview, detection locked, callback fired)
 * - `denied`      state 11 (permission denied)
 * - `unavailable` state 11 (no camera / unsupported browser / insecure context)
 * - `error`       §9 doctrine (recoverable camera failure with a retry path)
 */
export type ScannerStatus =
  | "idle"
  | "requesting"
  | "scanning"
  | "detected"
  | "denied"
  | "unavailable"
  | "error";

export interface ScannerState {
  status: ScannerStatus;
  /** Raw barcode that fired the most recent `onDetected` callback, if any. */
  lastDetected: string | null;
}

export const INITIAL_SCANNER_STATE: ScannerState = Object.freeze({
  status: "idle",
  lastDetected: null,
});

/**
 * Grocery/product symbologies only (assignment scope): EAN-13, EAN-8, UPC-A,
 * UPC-E. Values are `barcode-detector` format names; the component validates
 * them against the installed library types with `satisfies`.
 */
export const SCANNER_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

export type ScannerEvent =
  /** User gesture: "Enable camera" (state 1) or "Try again" (denied/error). */
  | { type: "enable" }
  /** The video element is actually playing frames. */
  | { type: "camera-ready" }
  /**
   * One decoder result batch (one `onScan` call from the library).
   * `paused` is the externally-controlled `BarcodeScannerProps.paused` flag
   * at the moment the frame arrived.
   */
  | { type: "detections"; rawValues: readonly string[]; paused: boolean }
  /** Camera/decoder failure; `kind` is the library's ScannerErrorKind. */
  | { type: "camera-error"; kind: string }
  /** Explicit re-arm: in-viewport "Scan another" or `paused` true → false. */
  | { type: "scan-again" };

export interface ScannerTransition {
  state: ScannerState;
  /**
   * Non-null exactly when this event must fire `onDetected` — the single
   * place in the codebase allowed to emit the callback.
   */
  detected: string | null;
}

/** Buckets the library's ScannerErrorKind values into UI states. */
export function mapScannerErrorKind(
  kind: string,
): "denied" | "unavailable" | "error" {
  if (kind === "permission-denied") return "denied";
  if (
    kind === "no-camera" ||
    kind === "unsupported" ||
    kind === "insecure-context"
  ) {
    return "unavailable";
  }
  // in-use, overconstrained, aborted, security, type-error, unknown, …
  return "error";
}

function firstNonEmpty(rawValues: readonly string[]): string | null {
  for (const value of rawValues) {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

/**
 * Pure transition function. Returns the SAME state object when an event is
 * ignored, so callers can use identity to skip redundant re-renders.
 *
 * Duplicate-scan suppression: `detections` only produces a callback while
 * `status === "scanning"` and the component is not externally paused. The
 * first accepted detection moves the machine to `detected`, where every
 * further decoder frame is ignored until an explicit `scan-again` re-arms it.
 */
export function reduceScanner(
  state: ScannerState,
  event: ScannerEvent,
): ScannerTransition {
  switch (event.type) {
    case "enable": {
      if (
        state.status === "idle" ||
        state.status === "denied" ||
        state.status === "unavailable" ||
        state.status === "error"
      ) {
        return {
          state: { ...state, status: "requesting" },
          detected: null,
        };
      }
      return { state, detected: null };
    }
    case "camera-ready": {
      if (state.status === "requesting") {
        return { state: { ...state, status: "scanning" }, detected: null };
      }
      return { state, detected: null };
    }
    case "detections": {
      if (state.status !== "scanning" || event.paused) {
        return { state, detected: null };
      }
      const raw = firstNonEmpty(event.rawValues);
      if (raw === null) {
        return { state, detected: null };
      }
      return {
        state: { status: "detected", lastDetected: raw },
        detected: raw,
      };
    }
    case "camera-error": {
      // Only live camera phases can fail; late/stray errors (e.g. teardown
      // noise after a detection already froze the preview) are ignored.
      if (state.status !== "requesting" && state.status !== "scanning") {
        return { state, detected: null };
      }
      return {
        state: { ...state, status: mapScannerErrorKind(event.kind) },
        detected: null,
      };
    }
    case "scan-again": {
      if (state.status === "detected") {
        return { state: { ...state, status: "scanning" }, detected: null };
      }
      return { state, detected: null };
    }
  }
}

export interface ScannerControllerCallbacks {
  /** The frozen-contract callback. Receives the RAW detected string. */
  onDetected: (raw: string) => void;
  /** Fired only when the state object actually changed. */
  onStateChange?: (state: ScannerState) => void;
  /** Success feedback hook (vibration/visual); fired once per detection. */
  onFeedback?: () => void;
}

export interface ScannerController {
  readonly state: ScannerState;
  dispatch: (event: ScannerEvent) => ScannerTransition;
}

/**
 * Event-loop glue shared by the component and the tests: holds the current
 * state, applies the reducer synchronously per event (decoder callbacks
 * arrive sequentially on the main thread, so the exactly-once guarantee
 * holds even for same-tick bursts), and routes effects.
 */
export function createScannerController(
  callbacks: ScannerControllerCallbacks,
): ScannerController {
  let state: ScannerState = INITIAL_SCANNER_STATE;
  return {
    get state() {
      return state;
    },
    dispatch(event: ScannerEvent) {
      const transition = reduceScanner(state, event);
      const changed = transition.state !== state;
      state = transition.state;
      if (changed) {
        callbacks.onStateChange?.(state);
      }
      if (transition.detected !== null) {
        callbacks.onFeedback?.();
        callbacks.onDetected(transition.detected);
      }
      return transition;
    },
  };
}

/**
 * Structural subset of MediaStreamTrack, kept loose for node-env tests.
 * The return type is `object` because TypeScript's MediaTrackCapabilities
 * doesn't model the non-standard `torch` capability.
 */
export interface TorchCapableTrack {
  getCapabilities?: () => object | undefined;
}

/**
 * True only when the live camera track advertises torch support.
 * `getCapabilities` is missing on some browsers (e.g. Firefox) and the
 * `torch` capability is absent on most front cameras and desktop webcams —
 * in every uncertain case the answer is "no torch button".
 */
export function trackSupportsTorch(
  track: TorchCapableTrack | null | undefined,
): boolean {
  const getCapabilities = track?.getCapabilities;
  if (typeof getCapabilities !== "function") return false;
  try {
    const capabilities = getCapabilities.call(track);
    if (typeof capabilities !== "object" || capabilities === null) {
      return false;
    }
    return (capabilities as { torch?: unknown }).torch === true;
  } catch {
    return false;
  }
}
