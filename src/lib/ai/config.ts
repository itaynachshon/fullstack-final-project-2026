/**
 * AI runtime configuration — the single place where provider/model choices
 * live (docs/FEATURES_V2_PLAN.md §8.3). Conversation/business logic never
 * hardcodes a vendor: it consumes `AIRuntimeConfig.providerOrder`, and the
 * registry (src/lib/ai/registry.ts) turns ids into adapters.
 *
 * API keys are read only inside the registry and are deliberately NOT part
 * of the resolved config object, so config values can be logged safely.
 * All variables are server-side only — never NEXT_PUBLIC_.
 */

import { AIConfigError } from "./errors";

/** Vendors wired in src/lib/ai/registry.ts. Add new ids there + here only. */
export const AI_PROVIDER_IDS = ["google", "groq"] as const;

export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AIRuntimeConfig {
  /** Failover order; first entry is the primary provider. */
  providerOrder: AIProviderId[];
  googleModel: string;
  groqModel: string;
  /** Hard per-provider wall clock budget for one chat turn. */
  providerTimeoutMs: number;
  /** Upper bound on generated tokens per turn (cost/abuse control). */
  maxOutputTokens: number;
}

export const AI_DEFAULTS = {
  providerOrder: "google,groq",
  googleModel: "gemini-2.5-flash",
  groqModel: "llama-3.3-70b-versatile",
  providerTimeoutMs: 30_000,
  maxOutputTokens: 2_048,
} as const;

/**
 * Non-env operational limits. Constants (not env) on purpose: they encode
 * product/safety decisions, not deployment concerns.
 */
export const AI_LIMITS = {
  /** Max model↔tool round trips per turn (generateText stopWhen). */
  maxSteps: 8,
  temperature: 0.4,
  /** Bounded recent-context window sent to providers (history stays in DB). */
  maxContextMessages: 30,
  maxContextChars: 16_000,
  /** A conversation refuses new turns beyond this; history is never deleted. */
  maxConversationMessages: 200,
  /** Request body ceiling for POST /api/ai/chat (bytes). */
  maxRequestBytes: 32_768,
  /** Lightweight per-user rate limit for chat turns. */
  rateLimit: { limit: 10, windowMs: 60_000 },
  /** Caps on what one assistant turn may stash (keeps parts ≤ frozen max 32). */
  maxStashedPartsPerTurn: 8,
  maxProposalsPerTurn: 5,
} as const;

const TIMEOUT_BOUNDS = { min: 1_000, max: 120_000 };
const TOKEN_BOUNDS = { min: 256, max: 8_192 };

type EnvSource = Record<string, string | undefined>;

/**
 * Resolves configuration from the environment. Unknown provider ids fail
 * loudly (config typos must not silently reorder the failover chain).
 */
export function resolveAIConfig(env: EnvSource = process.env): AIRuntimeConfig {
  const rawOrder = env.AI_PROVIDER_ORDER?.trim() || AI_DEFAULTS.providerOrder;
  const order = rawOrder
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id.length > 0);

  if (order.length === 0) {
    throw new AIConfigError("AI_PROVIDER_ORDER resolved to an empty list.");
  }

  const providerOrder: AIProviderId[] = [];
  for (const id of order) {
    if (!(AI_PROVIDER_IDS as readonly string[]).includes(id)) {
      throw new AIConfigError(
        `Unknown AI provider id "${id}" in AI_PROVIDER_ORDER. ` +
          `Known ids: ${AI_PROVIDER_IDS.join(", ")}.`,
      );
    }
    if (!providerOrder.includes(id as AIProviderId)) {
      providerOrder.push(id as AIProviderId);
    }
  }

  return {
    providerOrder,
    googleModel: env.AI_GOOGLE_MODEL?.trim() || AI_DEFAULTS.googleModel,
    groqModel: env.AI_GROQ_MODEL?.trim() || AI_DEFAULTS.groqModel,
    providerTimeoutMs: boundedInt(
      env.AI_PROVIDER_TIMEOUT_MS,
      AI_DEFAULTS.providerTimeoutMs,
      TIMEOUT_BOUNDS,
    ),
    maxOutputTokens: boundedInt(
      env.AI_MAX_OUTPUT_TOKENS,
      AI_DEFAULTS.maxOutputTokens,
      TOKEN_BOUNDS,
    ),
  };
}

function boundedInt(
  raw: string | undefined,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}
