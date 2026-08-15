import { NextResponse, type NextRequest } from "next/server";

import { searchQuerySchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import type { ApiErrorBody, SearchResponse } from "@/lib/types";

/**
 * GET /api/products/search?q=…&page=…
 *
 * FROZEN external contract (docs/TECHNICAL_DESIGN.md §6.3):
 *   200 → SearchResponse { items, page, hasMore } (page size 20)
 *   400 → ApiErrorBody code 'invalid_request' (bad q/page)
 *   401 → ApiErrorBody code 'unauthenticated'
 *
 * Wave 1 stub: auth + validation are real; the trigram catalog search is
 * implemented in Wave 2 by Agent A inside src/lib/products/ WITHOUT changing
 * this external contract. Until then every query returns an empty page.
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

  const searchParams = request.nextUrl.searchParams;
  const parsed = searchQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });

  if (!parsed.success) {
    const body: ApiErrorBody = {
      error: {
        code: "invalid_request",
        message:
          "Query parameter 'q' must be 1-60 characters and 'page' a positive integer.",
      },
    };
    return NextResponse.json(body, { status: 400 });
  }

  const response: SearchResponse = {
    items: [],
    page: parsed.data.page,
    hasMore: false,
  };
  return NextResponse.json(response);
}
