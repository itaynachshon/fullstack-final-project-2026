/**
 * Sequential provider failover.
 *
 * Providers are attempted strictly IN ORDER — never in parallel, never
 * "warmed". Each attempt gets a bounded wall-clock budget via its own
 * AbortController. The SAME canonical request object is replayed to the next
 * provider, so the user's conversation context survives a failover intact.
 *
 * Fallback happens ONLY for transient/provider failures (429, capacity, 5xx,
 * network, timeout, unusable output — see errors.ts). Anything else aborts
 * the chain immediately as ProviderFatalError so application bugs are not
 * hidden behind vendor retries.
 */

import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "@/lib/v2/types";

import {
  isTransientProviderFailure,
  ProviderChainExhaustedError,
  ProviderFatalError,
  ProviderTimeoutError,
  safeFailureMessage,
  type ProviderAttemptFailure,
} from "./errors";

export interface FallbackRunOptions {
  providers: AIProvider[];
  request: AICompletionRequest;
  /** Per-provider budget in milliseconds. */
  timeoutMs: number;
  /** Outer signal (e.g. HTTP request aborted). Never triggers a fallback. */
  signal?: AbortSignal;
}

export interface FallbackOutcome {
  response: AICompletionResponse;
  /** Diagnostic only — must not leak into the persisted message format. */
  providerId: string;
  /** Failed attempts that preceded the successful one. */
  attempts: ProviderAttemptFailure[];
}

export async function runWithProviderFallback(
  options: FallbackRunOptions,
): Promise<FallbackOutcome> {
  const { providers, request, timeoutMs, signal } = options;

  if (providers.length === 0) {
    throw new ProviderChainExhaustedError(
      [],
      "No AI provider is configured (missing API keys or empty AI_PROVIDER_ORDER).",
    );
  }

  const attempts: ProviderAttemptFailure[] = [];

  for (const provider of providers) {
    signal?.throwIfAborted();

    const timeoutError = new ProviderTimeoutError(provider.id, timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
    const forwardOuterAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forwardOuterAbort, { once: true });

    try {
      const response = await provider.complete(request, controller.signal);
      return { response, providerId: provider.id, attempts };
    } catch (error) {
      // The caller went away — stop entirely; this is not a provider failure.
      if (signal?.aborted) throw error;

      const timedOut = controller.signal.aborted;
      const transient = timedOut || isTransientProviderFailure(error);
      const failure: ProviderAttemptFailure = {
        providerId: provider.id,
        transient,
        message: safeFailureMessage(timedOut ? timeoutError : error),
      };
      attempts.push(failure);

      if (!transient) {
        throw new ProviderFatalError(provider.id, error);
      }
      console.warn(
        `AI provider "${provider.id}" failed transiently (${failure.message}) — trying next provider.`,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forwardOuterAbort);
    }
  }

  throw new ProviderChainExhaustedError(attempts);
}
