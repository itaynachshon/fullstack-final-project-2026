import { NextResponse, type NextRequest } from "next/server";

import { AI_LIMITS } from "@/lib/ai/config";
import {
  ConversationFullError,
  ConversationNotFoundError,
  runChatTurn,
} from "@/lib/ai/orchestrator";
import { checkAIRateLimit } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { aiChatRequestSchema } from "@/lib/v2/schemas";
import type { V2ApiErrorBody } from "@/lib/v2/types";

/**
 * POST /api/ai/chat — F3 implementation of the frozen F0 contract.
 *
 *   401 unauthenticated · 400 invalid_request · 429 rate limited
 *   200 AIChatResponse — `ok`, or `failed` with `provider_unavailable`
 *   (failover chain exhausted) / `internal`. Vendor outages never surface
 *   as raw 5xx.
 *
 * No fridge mutation can occur on this path: the orchestrator only writes
 * chat rows and PENDING proposals; accepts live in src/lib/v2/actions/ai.ts.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const body: V2ApiErrorBody = {
      error: { code: "unauthenticated", message: "Authentication required." },
    };
    return NextResponse.json(body, { status: 401 });
  }

  // Cheap size gate before reading the body (Zod re-checks message length).
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > AI_LIMITS.maxRequestBytes) {
    const body: V2ApiErrorBody = {
      error: { code: "invalid_request", message: "Request body too large." },
    };
    return NextResponse.json(body, { status: 400 });
  }

  const rate = checkAIRateLimit(user.id);
  if (!rate.allowed) {
    // V2ApiErrorCode has no dedicated rate-limit code (F5 candidate);
    // 429 + Retry-After carries the semantics.
    const body: V2ApiErrorBody = {
      error: {
        code: "invalid_request",
        message: "Too many chat requests — wait a moment and try again.",
      },
    };
    return NextResponse.json(body, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    const body: V2ApiErrorBody = {
      error: {
        code: "invalid_request",
        message: "Request body must be JSON.",
      },
    };
    return NextResponse.json(body, { status: 400 });
  }

  const parsed = aiChatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const body: V2ApiErrorBody = {
      error: {
        code: "invalid_request",
        message: "Invalid chat request.",
      },
    };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    const response = await runChatTurn({
      db: supabase,
      userId: user.id,
      request: parsed.data,
      signal: request.signal,
    });
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (
      error instanceof ConversationNotFoundError ||
      error instanceof ConversationFullError
    ) {
      const body: V2ApiErrorBody = {
        error: { code: "invalid_request", message: error.message },
      };
      return NextResponse.json(body, { status: 400 });
    }
    console.error("POST /api/ai/chat failed:", error);
    const body: V2ApiErrorBody = {
      error: {
        code: "internal",
        message: "Something went wrong on our side — try again.",
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
