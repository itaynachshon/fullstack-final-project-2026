import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";

import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "@/lib/v2/types";

import { ProviderChainExhaustedError, ProviderFatalError } from "./errors";
import { runWithProviderFallback } from "./failover";
import { makeInventoryUnits, textMessage } from "./test-fixtures";

const RESPONSE: AICompletionResponse = {
  parts: [{ type: "text", text: "Here is a recipe." }],
};

function makeRequest(): AICompletionRequest {
  return {
    conversationId: "22222222-2222-4222-8222-222222222222",
    messages: [textMessage("user", "What can I cook?")],
    inventory: makeInventoryUnits(),
    userMessage: "What can I cook?",
  };
}

type CompleteFn = (
  request: AICompletionRequest,
  signal?: AbortSignal,
) => Promise<AICompletionResponse>;

function makeProvider(id: string, complete: CompleteFn) {
  const spy = vi.fn(complete);
  const provider: AIProvider = { id, displayName: id, complete: spy };
  return { provider, spy };
}

function rateLimit(): APICallError {
  return new APICallError({
    message: "rate limited",
    url: "https://provider.example",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
  });
}

describe("runWithProviderFallback", () => {
  it("uses only the primary provider when it succeeds (no warming)", async () => {
    const primary = makeProvider("google", async () => RESPONSE);
    const secondary = makeProvider("groq", async () => RESPONSE);

    const outcome = await runWithProviderFallback({
      providers: [primary.provider, secondary.provider],
      request: makeRequest(),
      timeoutMs: 1_000,
    });

    expect(outcome.providerId).toBe("google");
    expect(outcome.attempts).toEqual([]);
    expect(primary.spy).toHaveBeenCalledTimes(1);
    expect(secondary.spy).not.toHaveBeenCalled();
  });

  it("falls back on 429 and replays the SAME canonical context", async () => {
    const seen: AICompletionRequest[] = [];
    const primary = makeProvider("google", async (request) => {
      seen.push(request);
      throw rateLimit();
    });
    const secondary = makeProvider("groq", async (request) => {
      seen.push(request);
      return RESPONSE;
    });

    const request = makeRequest();
    const outcome = await runWithProviderFallback({
      providers: [primary.provider, secondary.provider],
      request,
      timeoutMs: 1_000,
    });

    expect(outcome.providerId).toBe("groq");
    expect(outcome.attempts).toEqual([
      { providerId: "google", transient: true, message: "HTTP 429" },
    ]);
    // Identical history across the provider switch: same object, same JSON.
    expect(seen[0]).toBe(request);
    expect(seen[1]).toBe(request);
    expect(JSON.stringify(seen[0].messages)).toBe(
      JSON.stringify(seen[1].messages),
    );
  });

  it("falls back when the primary exceeds its time budget", async () => {
    const primary = makeProvider(
      "google",
      (_request, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const secondary = makeProvider("groq", async () => RESPONSE);

    const outcome = await runWithProviderFallback({
      providers: [primary.provider, secondary.provider],
      request: makeRequest(),
      timeoutMs: 25,
    });

    expect(outcome.providerId).toBe("groq");
    expect(outcome.attempts).toEqual([
      { providerId: "google", transient: true, message: "timed out" },
    ]);
  });

  it("does NOT fall back on a non-transient application error", async () => {
    const primary = makeProvider("google", async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'x')");
    });
    const secondary = makeProvider("groq", async () => RESPONSE);

    await expect(
      runWithProviderFallback({
        providers: [primary.provider, secondary.provider],
        request: makeRequest(),
        timeoutMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(ProviderFatalError);
    expect(secondary.spy).not.toHaveBeenCalled();
  });

  it("falls back when the vendor rejects model-written tool args (tool_use_failed)", async () => {
    // Groq validates tool-call arguments server-side and reports the MODEL's
    // schema violation as HTTP 400 code "tool_use_failed" (seen live in F5).
    // Unusable model output is the documented transient class.
    const primary = makeProvider("google", async () => {
      throw new APICallError({
        message: "Tool call validation failed",
        url: "https://provider.example",
        requestBodyValues: {},
        statusCode: 400,
        isRetryable: false,
        data: { error: { code: "tool_use_failed" } },
      });
    });
    const secondary = makeProvider("groq", async () => RESPONSE);

    const outcome = await runWithProviderFallback({
      providers: [primary.provider, secondary.provider],
      request: makeRequest(),
      timeoutMs: 1_000,
    });
    expect(outcome.providerId).toBe("groq");
    expect(outcome.attempts).toHaveLength(1);
    expect(outcome.attempts[0].transient).toBe(true);
  });

  it("does NOT fall back on a plain 400 without a tool_use_failed code", async () => {
    const primary = makeProvider("google", async () => {
      throw new APICallError({
        message: "bad request",
        url: "https://provider.example",
        requestBodyValues: {},
        statusCode: 400,
        isRetryable: false,
      });
    });
    const secondary = makeProvider("groq", async () => RESPONSE);

    await expect(
      runWithProviderFallback({
        providers: [primary.provider, secondary.provider],
        request: makeRequest(),
        timeoutMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(ProviderFatalError);
    expect(secondary.spy).not.toHaveBeenCalled();
  });

  it("does NOT fall back on an invalid-credentials rejection", async () => {
    const primary = makeProvider("google", async () => {
      throw new APICallError({
        message: "unauthorized",
        url: "https://provider.example",
        requestBodyValues: {},
        statusCode: 401,
        isRetryable: false,
      });
    });
    const secondary = makeProvider("groq", async () => RESPONSE);

    await expect(
      runWithProviderFallback({
        providers: [primary.provider, secondary.provider],
        request: makeRequest(),
        timeoutMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(ProviderFatalError);
    expect(secondary.spy).not.toHaveBeenCalled();
  });

  it("reports exhaustion after every provider failed transiently", async () => {
    const primary = makeProvider("google", async () => {
      throw rateLimit();
    });
    const secondary = makeProvider("groq", async () => {
      throw new TypeError("fetch failed");
    });

    const error = await runWithProviderFallback({
      providers: [primary.provider, secondary.provider],
      request: makeRequest(),
      timeoutMs: 1_000,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderChainExhaustedError);
    expect((error as ProviderChainExhaustedError).attempts).toHaveLength(2);
  });

  it("fails fast when no provider is configured", async () => {
    await expect(
      runWithProviderFallback({
        providers: [],
        request: makeRequest(),
        timeoutMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(ProviderChainExhaustedError);
  });

  it("stops without falling back when the caller aborted", async () => {
    const controller = new AbortController();
    const primary = makeProvider("google", async (_request, signal) => {
      controller.abort(new Error("client disconnected"));
      throw signal?.reason ?? new Error("aborted");
    });
    const secondary = makeProvider("groq", async () => RESPONSE);

    await expect(
      runWithProviderFallback({
        providers: [primary.provider, secondary.provider],
        request: makeRequest(),
        timeoutMs: 1_000,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(secondary.spy).not.toHaveBeenCalled();
  });
});
