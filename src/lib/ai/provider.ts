/**
 * Generic Vercel AI SDK adapter — implements the frozen `AIProvider`
 * interface for ANY AI SDK language model. Google/Groq (and later
 * OpenRouter & co.) differ only in the `model` instance the registry passes
 * in; conversation/business logic never touches vendor SDKs.
 *
 * One `complete()` call runs the full agentic turn: system prompt with the
 * inventory snapshot, bounded canonical history, provider-neutral tools,
 * multi-step tool loop, and assembly of the provider-neutral response parts.
 */

import { generateText, stepCountIs, type LanguageModel } from "ai";

import type {
  AICompletionRequest,
  AICompletionResponse,
  AIMessagePart,
  AIProvider,
} from "@/lib/v2/types";

import { AI_LIMITS } from "./config";
import { TransientProviderError } from "./errors";
import { extractHistoryRecipes, toBoundedModelMessages } from "./messages";
import { buildSystemPrompt } from "./prompt";
import {
  buildTurnInventory,
  hasProduct,
  serializeInventoryForModel,
} from "./snapshot";
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
      // Narrow the frozen fridge type to units that carry their product
      // embed (contract gap documented in src/lib/ai/types.ts).
      const units = request.fridge.filter(hasProduct);
      if (units.length !== request.fridge.length) {
        console.warn(
          `AI provider ${options.id}: ${request.fridge.length - units.length} ` +
            "fridge unit(s) without product embed were skipped.",
        );
      }

      const inventory = buildTurnInventory(units);
      const turn: TurnState = {
        inventory,
        historyRecipes: extractHistoryRecipes(request.messages),
        turnRecipes: [],
        parts: [],
        proposals: [],
      };

      const result = await generateText({
        model: options.model,
        system: buildSystemPrompt(serializeInventoryForModel(inventory)),
        messages: toBoundedModelMessages(request.messages, inventory),
        tools: createChatTools(turn),
        stopWhen: stepCountIs(AI_LIMITS.maxSteps),
        maxOutputTokens: options.maxOutputTokens,
        temperature: AI_LIMITS.temperature,
        abortSignal: signal,
        // The failover chain is the retry policy; per-provider retries would
        // stack latencies past the provider timeout budget.
        maxRetries: 0,
      });

      const parts: AIMessagePart[] = [...turn.parts];
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
