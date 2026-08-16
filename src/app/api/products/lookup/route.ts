import { NextResponse, type NextRequest } from "next/server";

import { lookupProduct } from "@/lib/products/lookup";
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
 *   500 → ApiErrorBody code 'internal' (OUR infrastructure only)
 *   Open Food Facts failures NEVER produce 5xx (degrade to not_found).
 *
 * Thin wrapper: auth + shape validation live here; the resolution chain
 * (classify → catalog → Open Food Facts → cache) lives in
 * src/lib/products/lookup.ts and runs under the caller's JWT.
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

  try {
    const response: LookupResponse = await lookupProduct(
      supabase,
      user.id,
      parsed.data.barcode,
    );
    return NextResponse.json(response);
  } catch (error) {
    // Only our own DB failing lands here (OFF failures degrade inside the
    // service). Details stay server-side (docs/TECHNICAL_DESIGN.md §11.1).
    console.error("[api/products/lookup]", error);
    const body: ApiErrorBody = {
      error: {
        code: "internal",
        message: "Something went wrong. Please try again.",
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
