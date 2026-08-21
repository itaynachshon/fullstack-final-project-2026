import { describe, expect, it } from "vitest";

import { AI_DEFAULTS, resolveAIConfig } from "./config";
import { AIConfigError } from "./errors";

describe("resolveAIConfig", () => {
  it("applies documented defaults when the environment is empty", () => {
    const config = resolveAIConfig({});
    expect(config).toEqual({
      providerOrder: ["google", "groq"],
      googleModel: AI_DEFAULTS.googleModel,
      groqModel: AI_DEFAULTS.groqModel,
      providerTimeoutMs: AI_DEFAULTS.providerTimeoutMs,
      maxOutputTokens: AI_DEFAULTS.maxOutputTokens,
    });
  });

  it("honours order, model ids, and numeric overrides", () => {
    const config = resolveAIConfig({
      AI_PROVIDER_ORDER: " groq , google ",
      AI_GOOGLE_MODEL: "gemini-3-flash-preview",
      AI_GROQ_MODEL: "llama-3.1-8b-instant",
      AI_PROVIDER_TIMEOUT_MS: "12000",
      AI_MAX_OUTPUT_TOKENS: "1024",
    });
    expect(config.providerOrder).toEqual(["groq", "google"]);
    expect(config.googleModel).toBe("gemini-3-flash-preview");
    expect(config.groqModel).toBe("llama-3.1-8b-instant");
    expect(config.providerTimeoutMs).toBe(12_000);
    expect(config.maxOutputTokens).toBe(1_024);
  });

  it("rejects unknown provider ids instead of silently skipping them", () => {
    expect(() =>
      resolveAIConfig({ AI_PROVIDER_ORDER: "google,openai" }),
    ).toThrow(AIConfigError);
  });

  it("dedupes repeated ids and clamps out-of-range numbers", () => {
    const config = resolveAIConfig({
      AI_PROVIDER_ORDER: "groq,groq,google",
      AI_PROVIDER_TIMEOUT_MS: "999999999",
      AI_MAX_OUTPUT_TOKENS: "1",
    });
    expect(config.providerOrder).toEqual(["groq", "google"]);
    expect(config.providerTimeoutMs).toBe(120_000);
    expect(config.maxOutputTokens).toBe(256);
  });

  it("falls back to defaults on non-numeric numbers", () => {
    const config = resolveAIConfig({ AI_PROVIDER_TIMEOUT_MS: "soon" });
    expect(config.providerTimeoutMs).toBe(AI_DEFAULTS.providerTimeoutMs);
  });
});
