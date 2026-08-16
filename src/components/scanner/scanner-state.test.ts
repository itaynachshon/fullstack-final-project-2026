/**
 * Behavior tests for the scanner controller (Wave 2 Agent C).
 *
 * The physical camera obviously can't run in CI, so these tests drive the
 * exact controller the component ships (createScannerController) with
 * simulated library/browser events — the same boundary the real
 * @yudiel/react-qr-scanner callbacks feed. The camera itself is covered by
 * the manual device checklists in the Agent C handoff.
 */

import { describe, expect, it, vi } from "vitest";

import {
  createScannerController,
  INITIAL_SCANNER_STATE,
  mapScannerErrorKind,
  reduceScanner,
  SCANNER_FORMATS,
  trackSupportsTorch,
  type ScannerState,
} from "./scanner-state";

/** Drives a controller to the live-scanning state. */
function armedController(onDetected = vi.fn()) {
  const controller = createScannerController({ onDetected });
  controller.dispatch({ type: "enable" });
  controller.dispatch({ type: "camera-ready" });
  return { controller, onDetected };
}

function frame(rawValues: string[], paused = false) {
  return { type: "detections", rawValues, paused } as const;
}

describe("scanner start-up flow", () => {
  it("starts idle — the camera must never start on mount", () => {
    expect(INITIAL_SCANNER_STATE.status).toBe("idle");
    expect(INITIAL_SCANNER_STATE.lastDetected).toBeNull();
  });

  it("walks enable → requesting → camera-ready → scanning", () => {
    const { controller } = armedController();
    expect(controller.state.status).toBe("scanning");
  });

  it("ignores camera-ready before an enable gesture", () => {
    const controller = createScannerController({ onDetected: vi.fn() });
    controller.dispatch({ type: "camera-ready" });
    expect(controller.state.status).toBe("idle");
  });

  it("ignores decoder frames before scanning starts", () => {
    const onDetected = vi.fn();
    const controller = createScannerController({ onDetected });
    controller.dispatch(frame(["7290000066318"]));
    controller.dispatch({ type: "enable" });
    controller.dispatch(frame(["7290000066318"]));
    expect(onDetected).not.toHaveBeenCalled();
    expect(controller.state.status).toBe("requesting");
  });
});

describe("detection callback", () => {
  it("emits the raw detected string exactly once", () => {
    const { controller, onDetected } = armedController();
    controller.dispatch(frame(["7290000066318"]));
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith("7290000066318");
    expect(controller.state).toEqual<ScannerState>({
      status: "detected",
      lastDetected: "7290000066318",
    });
  });

  it("suppresses repeated frames of the same scan (no double callback)", () => {
    const { controller, onDetected } = armedController();
    for (let i = 0; i < 25; i += 1) {
      controller.dispatch(frame(["7290000066318"]));
    }
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it("suppresses different codes too while locked — re-arm is explicit", () => {
    const { controller, onDetected } = armedController();
    controller.dispatch(frame(["7290000066318"]));
    controller.dispatch(frame(["4902505139734"]));
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(controller.state.lastDetected).toBe("7290000066318");
  });

  it("takes the first non-empty value from a multi-code frame", () => {
    const { controller, onDetected } = armedController();
    controller.dispatch(frame(["", "  ", "7290111560032", "7290000066318"]));
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith("7290111560032");
  });

  it("ignores frames with no usable value", () => {
    const { controller, onDetected } = armedController();
    controller.dispatch(frame([]));
    controller.dispatch(frame(["", "   "]));
    expect(onDetected).not.toHaveBeenCalled();
    expect(controller.state.status).toBe("scanning");
  });

  it("fires success feedback once per accepted detection", () => {
    const onFeedback = vi.fn();
    const controller = createScannerController({
      onDetected: vi.fn(),
      onFeedback,
    });
    controller.dispatch({ type: "enable" });
    controller.dispatch({ type: "camera-ready" });
    controller.dispatch(frame(["7290000066318"]));
    controller.dispatch(frame(["7290000066318"]));
    expect(onFeedback).toHaveBeenCalledTimes(1);
  });
});

describe("external paused prop", () => {
  it("ignores detections while the parent holds paused=true", () => {
    const { controller, onDetected } = armedController();
    controller.dispatch(frame(["7290000066318"], true));
    expect(onDetected).not.toHaveBeenCalled();
    expect(controller.state.status).toBe("scanning");
  });

  it("re-arms on the paused true → false edge (scan-again event)", () => {
    const { controller, onDetected } = armedController();
    controller.dispatch(frame(["7290000066318"]));
    // Parent (test page / Wave 3 add flow) sets paused=true, later false —
    // the component dispatches scan-again on that edge.
    controller.dispatch({ type: "scan-again" });
    expect(controller.state.status).toBe("scanning");
    controller.dispatch(frame(["4902505139734"]));
    expect(onDetected).toHaveBeenCalledTimes(2);
    expect(onDetected).toHaveBeenLastCalledWith("4902505139734");
  });
});

describe("reset / new scan", () => {
  it("a second intentional scan triggers a second callback", () => {
    const { controller, onDetected } = armedController();
    controller.dispatch(frame(["7290000066318"]));
    controller.dispatch({ type: "scan-again" });
    controller.dispatch(frame(["7290000066318"]));
    expect(onDetected).toHaveBeenCalledTimes(2);
  });

  it("scan-again is a no-op unless a detection locked the scanner", () => {
    const { controller } = armedController();
    const before = controller.state;
    controller.dispatch({ type: "scan-again" });
    expect(controller.state).toBe(before);
  });
});

describe("error, permission, and unavailable states", () => {
  it("maps permission-denied to the denied panel", () => {
    const { controller } = armedController();
    controller.dispatch({ type: "camera-error", kind: "permission-denied" });
    expect(controller.state.status).toBe("denied");
  });

  it("maps missing-camera kinds to the unavailable panel", () => {
    for (const kind of ["no-camera", "unsupported", "insecure-context"]) {
      const { controller } = armedController();
      controller.dispatch({ type: "camera-error", kind });
      expect(controller.state.status).toBe("unavailable");
    }
  });

  it("maps remaining kinds to the retryable error panel", () => {
    for (const kind of [
      "in-use",
      "overconstrained",
      "aborted",
      "security",
      "type-error",
      "unknown",
    ]) {
      expect(mapScannerErrorKind(kind)).toBe("error");
    }
  });

  it("accepts failures during the permission request too", () => {
    const controller = createScannerController({ onDetected: vi.fn() });
    controller.dispatch({ type: "enable" });
    controller.dispatch({ type: "camera-error", kind: "permission-denied" });
    expect(controller.state.status).toBe("denied");
  });

  it("ignores stray errors after a detection froze the preview", () => {
    const { controller } = armedController();
    controller.dispatch(frame(["7290000066318"]));
    controller.dispatch({ type: "camera-error", kind: "unknown" });
    expect(controller.state.status).toBe("detected");
  });

  it("stops emitting detections after a failure", () => {
    const { controller, onDetected } = armedController();
    controller.dispatch({ type: "camera-error", kind: "in-use" });
    controller.dispatch(frame(["7290000066318"]));
    expect(onDetected).not.toHaveBeenCalled();
  });

  it("can retry from denied, unavailable, and error states", () => {
    for (const kind of ["permission-denied", "no-camera", "unknown"]) {
      const { controller, onDetected } = armedController();
      controller.dispatch({ type: "camera-error", kind });
      controller.dispatch({ type: "enable" });
      expect(controller.state.status).toBe("requesting");
      controller.dispatch({ type: "camera-ready" });
      controller.dispatch(frame(["7290000066318"]));
      expect(onDetected).toHaveBeenCalledTimes(1);
    }
  });
});

describe("state-change notifications", () => {
  it("notifies only when the state actually changes", () => {
    const onStateChange = vi.fn();
    const controller = createScannerController({
      onDetected: vi.fn(),
      onStateChange,
    });
    controller.dispatch({ type: "scan-again" }); // ignored in idle
    controller.dispatch({ type: "enable" });
    controller.dispatch({ type: "enable" }); // ignored in requesting
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith({
      status: "requesting",
      lastDetected: null,
    });
  });

  it("returns the identical state object for ignored events", () => {
    const state: ScannerState = { status: "scanning", lastDetected: null };
    expect(reduceScanner(state, frame([], false)).state).toBe(state);
    expect(reduceScanner(state, { type: "enable" }).state).toBe(state);
  });
});

describe("configured formats", () => {
  it("targets exactly the grocery symbologies from the plan", () => {
    expect([...SCANNER_FORMATS]).toEqual(["ean_13", "ean_8", "upc_a", "upc_e"]);
  });
});

describe("torch capability probe", () => {
  it("requires an explicit torch=true capability", () => {
    expect(trackSupportsTorch(null)).toBe(false);
    expect(trackSupportsTorch(undefined)).toBe(false);
    expect(trackSupportsTorch({})).toBe(false);
    expect(trackSupportsTorch({ getCapabilities: () => undefined })).toBe(
      false,
    );
    expect(trackSupportsTorch({ getCapabilities: () => ({}) })).toBe(false);
    expect(
      trackSupportsTorch({ getCapabilities: () => ({ torch: false }) }),
    ).toBe(false);
    expect(
      trackSupportsTorch({ getCapabilities: () => ({ torch: true }) }),
    ).toBe(true);
  });

  it("treats a throwing getCapabilities as no torch", () => {
    expect(
      trackSupportsTorch({
        getCapabilities: () => {
          throw new Error("not ready");
        },
      }),
    ).toBe(false);
  });
});
