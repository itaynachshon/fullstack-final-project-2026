import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";

import {
  isTransientProviderFailure,
  ProviderTimeoutError,
  safeFailureMessage,
  TransientProviderError,
} from "./errors";

function apiError(options: {
  statusCode?: number;
  isRetryable?: boolean;
  responseBody?: string;
}): APICallError {
  return new APICallError({
    message: "provider call failed",
    url: "https://provider.example/v1",
    requestBodyValues: {},
    statusCode: options.statusCode,
    responseBody: options.responseBody,
    isRetryable: options.isRetryable ?? false,
  });
}

describe("isTransientProviderFailure", () => {
  it.each([
    ["429 rate limit", apiError({ statusCode: 429 })],
    ["503 capacity", apiError({ statusCode: 503 })],
    ["500 server error", apiError({ statusCode: 500 })],
    ["explicitly retryable", apiError({ statusCode: 200, isRetryable: true })],
    ["network failure", new TypeError("fetch failed")],
    ["socket reset", new Error("read ECONNRESET")],
    ["adapter empty output", new TransientProviderError("no usable output")],
    ["provider timeout", new ProviderTimeoutError("google", 1000)],
    [
      "SDK retries exhausted on a retryable error",
      new RetryError({
        message: "retries exhausted",
        reason: "maxRetriesExceeded",
        errors: [apiError({ statusCode: 429 })],
      }),
    ],
    [
      "wrapped network cause",
      Object.assign(new Error("request failed"), {
        cause: new Error("connect ETIMEDOUT"),
      }),
    ],
  ])("treats %s as transient", (_label, error) => {
    expect(isTransientProviderFailure(error)).toBe(true);
  });

  it.each([
    ["401 invalid key", apiError({ statusCode: 401 })],
    ["403 forbidden", apiError({ statusCode: 403 })],
    ["400 bad request", apiError({ statusCode: 400 })],
    ["404 unknown model", apiError({ statusCode: 404 })],
    ["application bug", new TypeError("Cannot read properties of undefined")],
    ["database error", new Error("duplicate key value violates constraint")],
    ["plain string", "boom"],
    ["null", null],
    [
      "SDK retries exhausted on a non-retryable error",
      new RetryError({
        message: "retries exhausted",
        reason: "errorNotRetryable",
        errors: [apiError({ statusCode: 401 })],
      }),
    ],
  ])("treats %s as fatal (no fallback)", (_label, error) => {
    expect(isTransientProviderFailure(error)).toBe(false);
  });
});

describe("safeFailureMessage", () => {
  it("reports only the HTTP status, never the response body", () => {
    const error = apiError({
      statusCode: 500,
      responseBody: JSON.stringify({ leaked: "sk-super-secret-key" }),
    });
    const message = safeFailureMessage(error);
    expect(message).toBe("HTTP 500");
    expect(message).not.toContain("sk-super-secret");
  });

  it("labels timeouts and unknown errors generically", () => {
    expect(safeFailureMessage(new ProviderTimeoutError("groq", 5))).toBe(
      "timed out",
    );
    expect(safeFailureMessage(new RangeError("boom"))).toBe("RangeError");
    expect(safeFailureMessage(undefined)).toBe("unknown error");
  });
});
