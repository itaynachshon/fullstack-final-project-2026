import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { aiChatRequestSchema } from "@/lib/v2/schemas";
import type { V2ApiErrorBody } from "@/lib/v2/types";

/**
 * POST /api/ai/chat — F3 contract (stub).
 *
 * Auth + Zod are frozen here. F3 replaces the 501 with provider orchestration
 * that persists provider-neutral messages and pending proposals. No fridge
 * mutation may occur in this handler.
 *
 *   400 invalid_request · 401 unauthenticated · 501 not_implemented
 *   F3: 200 AIChatResponse (ok | failed after failover is exhausted)
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

  const body: V2ApiErrorBody = {
    error: {
      code: "not_implemented",
      message: "Recipe AI chat is not implemented yet.",
    },
  };
  return NextResponse.json(body, { status: 501 });
}
