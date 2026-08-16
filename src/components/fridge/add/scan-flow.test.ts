import { describe, expect, it } from "vitest";

import { createScannerController } from "@/components/scanner/scanner-state";
import type { LookupResponse, Product } from "@/lib/types";

import { decideScan, outcomeOf } from "./scan-flow";

/**
 * Wave 3 integration tests for the scan → lookup flow. These exercise the
 * exact decision module ScanPanel ships plus the exact scanner controller
 * BarcodeScanner ships, wired together the way the component wires them —
 * everything except the camera and the DOM.
 */

const PRODUCT: Product = {
  id: "5d3f9b52-1111-4222-8333-abcdefabcdef",
  barcode: "7290000066318",
  name: "במבה אסם",
  brand: "אסם",
  packageSize: "80 g",
  category: "Snacks",
  imageUrl: null,
  source: "catalog",
};

describe("decideScan — classification gate before any network call", () => {
  it("routes a valid EAN-13 to lookup with the canonical form", () => {
    expect(decideScan("7290000066318")).toEqual({
      action: "lookup",
      canonical: "7290000066318",
    });
  });

  it("canonicalizes before lookup — UPC-A is looked up zero-padded to 13", () => {
    expect(decideScan("036000291452")).toEqual({
      action: "lookup",
      canonical: "0036000291452",
    });
  });

  it("rejects an invalid code — the lookup API must never be called", () => {
    const decision = decideScan("7290000066319"); // corrupted check digit
    expect(decision.action).toBe("reject");
  });

  it("rejects garbage input", () => {
    expect(decideScan("hello world").action).toBe("reject");
  });

  it("routes a store-internal (RCN) code to manual — never to lookup/OFF", () => {
    expect(decideScan("2000000000008")).toEqual({ action: "rcn" });
  });
});

describe("outcomeOf — lookup responses drive the sheet states", () => {
  it("found → confirmation state with the product", () => {
    const body: LookupResponse = {
      status: "found",
      product: PRODUCT,
      source: "db",
    };
    expect(outcomeOf(body)).toEqual({ kind: "found", product: PRODUCT });
  });

  it("not_found → manual fallback carrying the canonical barcode prefill", () => {
    const body: LookupResponse = {
      status: "not_found",
      barcode: "7290000066318",
    };
    expect(outcomeOf(body)).toEqual({
      kind: "not_found",
      barcode: "7290000066318",
    });
  });

  it("OFF-degraded not_found (fallbackUsed) routes to the same manual path", () => {
    const body: LookupResponse = {
      status: "not_found",
      barcode: "7290000066318",
      fallbackUsed: true,
    };
    expect(outcomeOf(body)).toEqual({
      kind: "not_found",
      barcode: "7290000066318",
    });
  });

  it("server-side rcn → the RCN sheet", () => {
    const body: LookupResponse = { status: "rcn", reason: "store-internal" };
    expect(outcomeOf(body)).toEqual({ kind: "rcn" });
  });

  it("server-side invalid → the misread path", () => {
    const body: LookupResponse = { status: "invalid", reason: "bad code" };
    expect(outcomeOf(body)).toEqual({ kind: "invalid" });
  });
});

describe("scanner → add-flow wiring (controller + decision module together)", () => {
  /** Mirrors ScanPanel: every emitted raw code goes through decideScan. */
  function integrationHarness() {
    const lookups: string[] = [];
    let handled = 0;
    const controller = createScannerController({
      onDetected: (raw) => {
        handled += 1;
        const decision = decideScan(raw);
        if (decision.action === "lookup") lookups.push(decision.canonical);
      },
    });
    controller.dispatch({ type: "enable" });
    controller.dispatch({ type: "camera-ready" });
    return {
      controller,
      lookups,
      handledCount: () => handled,
    };
  }

  it("passes the scanner's raw code into the add-flow handler", () => {
    const { controller, lookups } = integrationHarness();
    controller.dispatch({
      type: "detections",
      rawValues: ["7290000066318"],
      paused: false,
    });
    expect(lookups).toEqual(["7290000066318"]);
  });

  it("duplicate decoder frames cannot trigger a second lookup/add", () => {
    const { controller, lookups, handledCount } = integrationHarness();
    // The library keeps reporting the same code on consecutive frames while
    // the user holds the phone still — only the first armed frame may emit.
    for (let frame = 0; frame < 5; frame += 1) {
      controller.dispatch({
        type: "detections",
        rawValues: ["7290000066318"],
        paused: false,
      });
    }
    expect(handledCount()).toBe(1);
    expect(lookups).toEqual(["7290000066318"]);
  });

  it("while the parent handles a detection (paused), nothing else emits", () => {
    const { controller, handledCount } = integrationHarness();
    controller.dispatch({
      type: "detections",
      rawValues: ["7290000066318"],
      paused: false,
    });
    // Sheet open → ScanPanel sets paused; frames that race in are dropped.
    controller.dispatch({
      type: "detections",
      rawValues: ["7290004127329"],
      paused: true,
    });
    expect(handledCount()).toBe(1);
  });

  it("the paused false-edge re-arms exactly one more scan (scan-add-scan loop)", () => {
    const { controller, lookups } = integrationHarness();
    controller.dispatch({
      type: "detections",
      rawValues: ["7290000066318"],
      paused: false,
    });
    // ScanPanel returning to idle flips paused true → false, which the
    // component turns into a scan-again dispatch.
    controller.dispatch({ type: "scan-again" });
    controller.dispatch({
      type: "detections",
      rawValues: ["7290004127329"],
      paused: false,
    });
    controller.dispatch({
      type: "detections",
      rawValues: ["7290004127329"],
      paused: false,
    });
    expect(lookups).toEqual(["7290000066318", "7290004127329"]);
  });

  it("an invalid scan is handled without any lookup and can be retried", () => {
    const { controller, lookups, handledCount } = integrationHarness();
    controller.dispatch({
      type: "detections",
      rawValues: ["7290000066319"], // misread: corrupted check digit
      paused: false,
    });
    expect(handledCount()).toBe(1);
    expect(lookups).toEqual([]); // invalid never reaches the API
    // Misread pill timeout → re-arm → the corrected read goes through.
    controller.dispatch({ type: "scan-again" });
    controller.dispatch({
      type: "detections",
      rawValues: ["7290000066318"],
      paused: false,
    });
    expect(lookups).toEqual(["7290000066318"]);
  });

  it("an RCN scan is handled without any lookup (OFF never called)", () => {
    const { controller, lookups, handledCount } = integrationHarness();
    controller.dispatch({
      type: "detections",
      rawValues: ["2000000000008"],
      paused: false,
    });
    expect(handledCount()).toBe(1);
    expect(lookups).toEqual([]);
  });
});
