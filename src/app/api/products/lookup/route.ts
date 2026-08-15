import { NextResponse, type NextRequest } from "next/server";

import { lookupQuerySchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import type { ApiErrorBody, LookupResponse } from "@/lib/types";

/**
 * GET /api/products/lookup?barcode=…
 *
 * FROZEN external contract (docs/TECHNICAL_DESIGN.md §6.2):
 *   200 → LookupResponse (found | not_found | invalid | rcn)
 *   400 → ApiErrorBody code 'invalid_request' (missing/oversized param)
 *   401 → ApiErrorBody code 'unauthenticated'
 *   Open Food Facts failures NEVER produce 5xx (degrade to not_found).
 *
 * Wave 1 stub: auth + validation are real; the resolution chain
 * (classify → catalog → Open Food Facts → cache) is implemented in Wave 2 by
 * Agent A inside src/lib/barcode/ and src/lib/products/ WITHOUT changing this
 * external contract. Until then every well-formed barcode reports not_found.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const body: ApiErrorBody = {
      error: { code: "unauthenticated", message: "Authentication required." },
    };
    return NextResponse.json(body, { status: 401 });
  }

  const parsed = lookupQuerySchema.safeParse({
    barcode: request.nextUrl.searchParams.get("barcode") ?? undefined,
  });

  if (!parsed.success) {
    const body: ApiErrorBody = {
      error: {
        code: "invalid_request",
        message: "Query parameter 'barcode' must be 1-20 characters.",
      },
    };
    return NextResponse.json(body, { status: 400 });
  }

  const response: LookupResponse = {
    status: "not_found",
    barcode: parsed.data.barcode,
  };
  return NextResponse.json(response);
}
