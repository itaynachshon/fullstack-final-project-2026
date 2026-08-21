/**
 * Lightweight per-user sliding-window rate limit for chat turns.
 *
 * Deliberately in-memory (docs/FEATURES_V2_PLAN.md forbids new infrastructure
 * like Redis for V2): on serverless each warm instance enforces the window
 * independently, so the global ceiling is `limit × instances`. That is
 * acceptable as an abuse brake for a per-user AI endpoint — the hard cost
 * controls are the provider timeout, maxOutputTokens, and message caps.
 */

import { AI_LIMITS } from "./config";

const hits = new Map<string, number[]>();

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkAIRateLimit(
  userId: string,
  now: number = Date.now(),
  options: { limit: number; windowMs: number } = AI_LIMITS.rateLimit,
): RateLimitDecision {
  const windowStart = now - options.windowMs;
  const recent = (hits.get(userId) ?? []).filter((at) => at > windowStart);

  if (recent.length >= options.limit) {
    hits.set(userId, recent);
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + options.windowMs - now) / 1000),
      ),
    };
  }

  recent.push(now);
  hits.set(userId, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test hook. */
export function resetAIRateLimit(): void {
  hits.clear();
}
