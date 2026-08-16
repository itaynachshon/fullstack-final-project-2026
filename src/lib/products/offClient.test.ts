import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOffProduct,
  OFF_TIMEOUT_MS,
  type OffLookupResult,
} from "@/lib/products/offClient";

const BAMBA = "7290000066318";
const OFF_IMAGE =
  "https://images.openfoodfacts.org/images/products/729/000/006/6318/front_he.4.400.jpg";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetchOnce(response: Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchOffProduct — request mechanics", () => {
  it("calls the v2 barcode-read endpoint with field selection, User-Agent and an abort signal", async () => {
    const fetchMock = stubFetchOnce(
      jsonResponse({ status: 1, product: { product_name: "Bamba" } }),
    );

    await fetchOffProduct(BAMBA);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://world.openfoodfacts.org/api/v2/product/${BAMBA}?fields=code,product_name,product_name_he,brands,quantity,image_front_url`,
    );
    expect(new Headers(init.headers).get("User-Agent")).toMatch(
      /FridgeTracker/,
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.cache).toBe("no-store");
  });
});

describe("fetchOffProduct — mapping found products", () => {
  it("prefers the Hebrew name and maps brand, quantity and image", async () => {
    stubFetchOnce(
      jsonResponse({
        status: 1,
        product: {
          product_name: "Bamba peanut snack",
          product_name_he: "במבה",
          brands: "Osem, אסם",
          quantity: "80 g",
          image_front_url: OFF_IMAGE,
        },
      }),
    );

    expect(await fetchOffProduct(BAMBA)).toEqual({
      outcome: "found",
      product: {
        name: "במבה",
        brand: "Osem", // first entry of the comma-separated list
        packageSize: "80 g",
        imageUrl: OFF_IMAGE,
      },
    } satisfies OffLookupResult);
  });

  it("falls back to the generic name when no Hebrew name exists, and nulls missing fields", async () => {
    stubFetchOnce(
      jsonResponse({
        status: 1,
        product: { product_name: "  Yotvata Choco  " },
      }),
    );

    expect(await fetchOffProduct(BAMBA)).toEqual({
      outcome: "found",
      product: {
        name: "Yotvata Choco",
        brand: null,
        packageSize: null,
        imageUrl: null,
      },
    });
  });

  it("truncates absurdly long crowdsourced names to 120 characters", async () => {
    stubFetchOnce(
      jsonResponse({ status: 1, product: { product_name: "x".repeat(500) } }),
    );

    const result = await fetchOffProduct(BAMBA);
    expect(result.outcome).toBe("found");
    if (result.outcome !== "found") return;
    expect(result.product.name).toHaveLength(120);
  });

  it.each([
    ["a non-OFF image host", "https://evil.example.com/image.jpg"],
    ["a non-https OFF url", "http://images.openfoodfacts.org/image.jpg"],
    ["a malformed url", "not a url"],
  ])("drops %s instead of storing it", async (_label, imageUrl) => {
    stubFetchOnce(
      jsonResponse({
        status: 1,
        product: { product_name: "Bamba", image_front_url: imageUrl },
      }),
    );

    const result = await fetchOffProduct(BAMBA);
    expect(result.outcome).toBe("found");
    if (result.outcome !== "found") return;
    expect(result.product.imageUrl).toBeNull();
  });
});

describe("fetchOffProduct — miss and failure semantics", () => {
  it("maps HTTP 404 to a definitive not_found", async () => {
    stubFetchOnce(
      jsonResponse({ status: 0, status_verbose: "product not found" }, 404),
    );
    expect(await fetchOffProduct(BAMBA)).toEqual({ outcome: "not_found" });
  });

  it("maps 200 with status 0 to not_found", async () => {
    stubFetchOnce(jsonResponse({ status: 0 }));
    expect(await fetchOffProduct(BAMBA)).toEqual({ outcome: "not_found" });
  });

  it("maps upstream 5xx to an upstream failure", async () => {
    stubFetchOnce(new Response("Service Unavailable", { status: 503 }));
    expect(await fetchOffProduct(BAMBA)).toEqual({
      outcome: "failure",
      reason: "upstream",
    });
  });

  it("maps a network error to a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await fetchOffProduct(BAMBA)).toEqual({
      outcome: "failure",
      reason: "network",
    });
  });

  it(`aborts after ~${OFF_TIMEOUT_MS}ms and reports a timeout`, async () => {
    vi.useFakeTimers();
    // A fetch that never resolves but honors its AbortSignal, like a stalled
    // upstream. Node rejects aborts with a DOMException (name AbortError).
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(
                Object.assign(new Error("This operation was aborted"), {
                  name: "AbortError",
                }),
              ),
            );
          }),
      ),
    );

    const pending = fetchOffProduct(BAMBA);
    await vi.advanceTimersByTimeAsync(OFF_TIMEOUT_MS);

    expect(await pending).toEqual({ outcome: "failure", reason: "timeout" });
  });

  it("maps unparseable JSON to an invalid_response failure", async () => {
    stubFetchOnce(
      new Response("<html>definitely not json</html>", { status: 200 }),
    );
    expect(await fetchOffProduct(BAMBA)).toEqual({
      outcome: "failure",
      reason: "invalid_response",
    });
  });

  it("maps a payload that violates the expected envelope to invalid_response", async () => {
    stubFetchOnce(jsonResponse({ status: 1, product: "surprise, a string" }));
    expect(await fetchOffProduct(BAMBA)).toEqual({
      outcome: "failure",
      reason: "invalid_response",
    });
  });

  it("maps a found product with no derivable name to invalid_response", async () => {
    stubFetchOnce(
      jsonResponse({
        status: 1,
        product: { product_name: "   ", product_name_he: "" },
      }),
    );
    expect(await fetchOffProduct(BAMBA)).toEqual({
      outcome: "failure",
      reason: "invalid_response",
    });
  });
});
