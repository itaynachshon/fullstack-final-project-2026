/**
 * Vendor wiring — the ONLY module that imports provider SDKs and reads API
 * keys. Adding a vendor later (e.g. OpenRouter via @openrouter/ai-sdk-
 * provider) means: add its id to AI_PROVIDER_IDS, add a factory case here,
 * document its env vars. Nothing else changes.
 *
 * Keys are server-side env only (never NEXT_PUBLIC_) and never leave this
 * module: adapters receive a constructed model instance, not credentials.
 *
 * Building the chain performs NO network I/O — providers are only contacted
 * when the failover runner actually calls them, in order.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";

import type { AIProvider } from "@/lib/v2/types";

import type { AIProviderId, AIRuntimeConfig } from "./config";
import { createVercelAIProvider } from "./provider";

type EnvSource = Record<string, string | undefined>;

interface VendorWiring {
  displayName: string;
  envKey: string;
  build: (
    apiKey: string,
    config: AIRuntimeConfig,
  ) => ReturnType<typeof createVercelAIProvider>;
}

const VENDORS: Record<AIProviderId, VendorWiring> = {
  google: {
    displayName: "Google Gemini",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    build: (apiKey, config) =>
      createVercelAIProvider({
        id: "google",
        displayName: "Google Gemini",
        model: createGoogleGenerativeAI({ apiKey })(config.googleModel),
        maxOutputTokens: config.maxOutputTokens,
      }),
  },
  groq: {
    displayName: "Groq",
    envKey: "GROQ_API_KEY",
    build: (apiKey, config) =>
      createVercelAIProvider({
        id: "groq",
        displayName: "Groq",
        model: createGroq({ apiKey })(config.groqModel),
        maxOutputTokens: config.maxOutputTokens,
      }),
  },
};

/**
 * Builds the ordered provider chain from config. Providers whose key is not
 * set are skipped with a warning, so a deployment with a single key still
 * works; an empty result is handled by the caller as "not configured".
 */
export function buildProviderChain(
  config: AIRuntimeConfig,
  env: EnvSource = process.env,
): AIProvider[] {
  const providers: AIProvider[] = [];
  for (const id of config.providerOrder) {
    const vendor = VENDORS[id];
    const apiKey = env[vendor.envKey]?.trim();
    if (!apiKey) {
      console.warn(`AI provider "${id}" skipped: ${vendor.envKey} is not set.`);
      continue;
    }
    providers.push(vendor.build(apiKey, config));
  }
  return providers;
}
