/**
 * Generic Vercel AI SDK adapter — implements the `AIProvider` interface for
 * ANY AI SDK language model. Google/Groq (and later OpenRouter & co.)
 * differ only in the `model` instance the registry passes in;
 * conversation/business logic never touches vendor SDKs.
 *
 * The adapter works entirely inside the privacy boundary: the request's
 * `inventory` is the safe ref-based snapshot (no database ids exist in this
 * layer), and everything it returns is a ref-based draft that the
 * orchestrator resolves before persistence.
 *
 * One `complete()` call runs the full agentic turn: system prompt with the
 * inventory snapshot, bounded canonical history, provider-neutral tools,
 * multi-step tool loop, and assembly of the provider-neutral response parts.
 */

import { generateText, stepCountIs, type LanguageModel } from "ai";

import type {
  AICompletionPart,
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "@/lib/v2/types";

import { AI_LIMITS } from "./config";
import { TransientProviderError } from "./errors";
import { extractHistoryRecipeDrafts, toBoundedModelMessages } from "./messages";
import { buildSystemPrompt } from "./prompt";
import { buildProviderInventory, serializeInventoryForModel } from "./snapshot";
import { createChatTools } from "./tools";
import type { TurnState } from "./types";

/** Frozen part schema allows text up to 8000 chars. */
const MAX_TEXT_PART_CHARS = 8_000;

export interface VercelProviderOptions {
  id: string;
  displayName: string;
  model: LanguageModel;
  maxOutputTokens: number;
}

export function createVercelAIProvider(
  options: VercelProviderOptions,
): AIProvider {
  return {
    id: options.id,
    displayName: options.displayName,

    async complete(
      request: AICompletionRequest,
      signal?: AbortSignal,
    ): Promise<AICompletionResponse> {
      const turn: TurnState = {
        inventory: buildProviderInventory(request.inventory),
        historyRecipes: extractHistoryRecipeDrafts(request.messages),
        turnRecipes: [],
        parts: [],
        proposals: [],
      };

      const result = await generateText({
        model: options.model,
        system: buildSystemPrompt(
          serializeInventoryForModel(request.inventory),
        ),
        messages: toBoundedModelMessages(request.messages),
        tools: createChatTools(turn),
        stopWhen: stepCountIs(AI_LIMITS.maxSteps),
        maxOutputTokens: options.maxOutputTokens,
        temperature: AI_LIMITS.temperature,
        abortSignal: signal,
        // The failover chain is the retry policy; per-provider retries would
        // stack latencies past the provider timeout budget.
        maxRetries: 0,
      });

      const parts: AICompletionPart[] = [...turn.parts];
      const text = result.text.trim();
      if (text.length > 0) {
        parts.push({ type: "text", text: text.slice(0, MAX_TEXT_PART_CHARS) });
      }

      if (parts.length === 0 && turn.proposals.length === 0) {
        throw new TransientProviderError(
          `Provider ${options.id} returned no usable output.`,
        );
      }
      if (parts.length === 0) {
        // Proposals need a visible carrier message for the UI.
        parts.push({
          type: "text",
          text: "I prepared a suggestion for you to confirm below.",
        });
      }

      return { parts, proposals: turn.proposals };
    },
  };
}
