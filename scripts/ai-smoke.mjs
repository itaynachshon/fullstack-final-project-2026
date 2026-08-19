/**
 * OPT-IN manual smoke test for the real AI provider keys — NEVER run in CI.
 *
 *   node scripts/ai-smoke.mjs             # every configured provider
 *   node scripts/ai-smoke.mjs google      # one provider only
 *
 * Reads GOOGLE_GENERATIVE_AI_API_KEY / GROQ_API_KEY (and the optional
 * AI_* overrides) from .env.local or the environment, then sends ONE tiny
 * real completion per provider to verify key + model id + connectivity.
 * Normal unit tests mock providers; this script is the only place a real
 * vendor call happens outside production.
 *
 * Exit code 0 = every attempted provider answered; 1 = at least one failed
 * or none was configured.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Fine — rely on already-exported environment variables.
}

const TIMEOUT_MS = Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? "30000");

const VENDORS = {
  google: {
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    model: process.env.AI_GOOGLE_MODEL?.trim() || "gemini-2.5-flash",
    build: (apiKey, model) => createGoogleGenerativeAI({ apiKey })(model),
  },
  groq: {
    envKey: "GROQ_API_KEY",
    model: process.env.AI_GROQ_MODEL?.trim() || "llama-3.3-70b-versatile",
    build: (apiKey, model) => createGroq({ apiKey })(model),
  },
};

const order = (process.env.AI_PROVIDER_ORDER?.trim() || "google,groq")
  .split(",")
  .map((id) => id.trim().toLowerCase())
  .filter(Boolean);

const only = process.argv[2]?.toLowerCase();
const targets = only ? order.filter((id) => id === only) : order;

if (only && targets.length === 0) {
  console.error(
    `Unknown/unordered provider "${only}". Order: ${order.join(", ")}`,
  );
  process.exit(1);
}

let attempted = 0;
let failed = 0;

for (const id of targets) {
  const vendor = VENDORS[id];
  if (!vendor) {
    console.error(
      `✗ ${id}: unknown provider id (known: ${Object.keys(VENDORS).join(", ")})`,
    );
    failed += 1;
    continue;
  }
  const apiKey = process.env[vendor.envKey]?.trim();
  if (!apiKey) {
    console.log(`- ${id}: skipped (${vendor.envKey} not set)`);
    continue;
  }

  attempted += 1;
  const startedAt = Date.now();
  try {
    const result = await generateText({
      model: vendor.build(apiKey, vendor.model),
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 1000,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - startedAt;
    console.log(
      `✓ ${id} (${vendor.model}): "${result.text.trim().slice(0, 40)}" in ${ms}ms`,
    );
  } catch (error) {
    failed += 1;
    const ms = Date.now() - startedAt;
    // Log status/name only — never response bodies (they can echo secrets).
    const label =
      error && typeof error === "object" && "statusCode" in error
        ? `HTTP ${error.statusCode}`
        : (error?.name ?? "error");
    console.error(`✗ ${id} (${vendor.model}): ${label} after ${ms}ms`);
  }
}

if (attempted === 0) {
  console.error(
    "No provider keys configured — set GOOGLE_GENERATIVE_AI_API_KEY and/or GROQ_API_KEY in .env.local.",
  );
  process.exit(1);
}
process.exit(failed > 0 ? 1 : 0);
