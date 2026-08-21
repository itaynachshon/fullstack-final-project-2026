/**
 * Failure taxonomy for the provider chain.
 *
 * The failover contract (docs/FEATURES_V2_PLAN.md §6.3): fall back to the
 * next provider ONLY on transient/provider failures — rate limits, capacity,
 * 5xx, network errors, timeouts, unusable provider output. Application bugs
 * (invalid tool schemas, database errors, malformed internal data) must NOT
 * be masked by retrying another vendor.
 *
 * Error messages surfaced to callers are generic on purpose: provider
 * responses can echo request details, so raw bodies/keys never leave the
 * server logs.
 */

import {
  APICallError,
  EmptyResponseBodyError,
  InvalidResponseDataError,
  JSONParseError,
  NoContentGeneratedError,
  NoOutputGeneratedError,
  RetryError,
} from "ai";

/** Misconfiguration (bad AI_PROVIDER_ORDER, …). Fatal, never retried. */
export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigError";
  }
}

/**
 * Thrown by the provider adapter when a vendor answered but produced no
 * usable output (empty completion, unusable content). Counts as a provider
 * failure → the chain may try the next vendor.
 */
export class TransientProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientProviderError";
  }
}

/** Used as the AbortController reason for the per-provider time budget. */
export class ProviderTimeoutError extends Error {
  constructor(providerId: string, timeoutMs: number) {
    super(`AI provider "${providerId}" timed out after ${timeoutMs}ms.`);
    this.name = "ProviderTimeoutError";
  }
}

/** One failed attempt in the chain — diagnostic only, safe to log. */
export interface ProviderAttemptFailure {
  providerId: string;
  transient: boolean;
  message: string;
}

/** Every configured provider failed transiently (or none is configured). */
export class ProviderChainExhaustedError extends Error {
  readonly attempts: ProviderAttemptFailure[];

  constructor(attempts: ProviderAttemptFailure[], message?: string) {
    super(
      message ??
        `All AI providers failed (${attempts
          .map((attempt) => `${attempt.providerId}: ${attempt.message}`)
          .join("; ")}).`,
    );
    this.name = "ProviderChainExhaustedError";
    this.attempts = attempts;
  }
}

/**
 * A provider failed in a way that indicates an application bug (or a
 * non-retryable vendor rejection such as invalid credentials). The chain
 * stops immediately instead of hiding it behind the next vendor.
 */
export class ProviderFatalError extends Error {
  readonly providerId: string;
  readonly cause: unknown;

  constructor(providerId: string, cause: unknown) {
    super(
      `AI provider "${providerId}" failed non-transiently: ` +
        safeFailureMessage(cause),
    );
    this.name = "ProviderFatalError";
    this.providerId = providerId;
    this.cause = cause;
  }
}

/** HTTP statuses treated as retryable when a vendor reports them. */
const TRANSIENT_STATUS = new Set([408, 409, 429]);

/** Heuristics for undici/fetch network-layer failures. */
const NETWORK_ERROR_PATTERN =
  /fetch failed|network|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|UND_ERR/i;

/**
 * Classifies an error thrown while calling one provider.
 * Anything not positively identified as a provider-side transient failure is
 * fatal by default — the conservative direction required by the spec.
 */
export function isTransientProviderFailure(error: unknown, depth = 0): boolean {
  if (depth > 3 || error == null) return false;

  if (
    error instanceof TransientProviderError ||
    error instanceof ProviderTimeoutError
  ) {
    return true;
  }

  // Vendor HTTP failures: rate limit / capacity / 5xx / explicit retryable.
  if (APICallError.isInstance(error)) {
    if (error.isRetryable) return true;
    const status = error.statusCode;
    if (status === undefined) return false;
    // Groq validates tool-call arguments server-side and reports a
    // MODEL-generated schema violation as HTTP 400 code "tool_use_failed"
    // (seen live in F5). That is unusable model output — the documented
    // transient class — not an application bug, so the next vendor may try.
    if (status === 400 && vendorErrorCode(error) === "tool_use_failed") {
      return true;
    }
    return status >= 500 || TRANSIENT_STATUS.has(status);
  }

  // The SDK exhausted its own retries — transient iff the last error was.
  if (RetryError.isInstance(error)) {
    return isTransientProviderFailure(error.lastError, depth + 1);
  }

  // Provider answered with unusable bytes — try the next vendor.
  if (
    JSONParseError.isInstance(error) ||
    InvalidResponseDataError.isInstance(error) ||
    EmptyResponseBodyError.isInstance(error) ||
    NoContentGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error)
  ) {
    return true;
  }

  // Network layer (undici wraps the root cause).
  if (error instanceof Error) {
    if (NETWORK_ERROR_PATTERN.test(error.message)) return true;
    if (error.cause) return isTransientProviderFailure(error.cause, depth + 1);
  }

  return false;
}

/** OpenAI-compatible error code from a vendor 4xx body, if present. */
function vendorErrorCode(error: InstanceType<typeof APICallError>): string {
  const data = error.data as { error?: { code?: unknown } } | undefined;
  return typeof data?.error?.code === "string" ? data.error.code : "";
}

/**
 * A short label safe to log and embed in wrapper errors: never includes
 * provider response bodies, request payloads, or credentials.
 */
export function safeFailureMessage(error: unknown): string {
  if (error instanceof ProviderTimeoutError) return "timed out";
  if (APICallError.isInstance(error)) {
    return error.statusCode === undefined
      ? "API call failed"
      : `HTTP ${error.statusCode}`;
  }
  if (RetryError.isInstance(error)) {
    return `retries exhausted (${safeFailureMessage(error.lastError)})`;
  }
  if (error instanceof Error) return error.name;
  return "unknown error";
}
