import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  isAuthPagePath,
  isProtectedApiPath,
  isProtectedPagePath,
  ROUTES,
} from "@/lib/routes";
import type { ApiErrorBody } from "@/lib/types";

/**
 * Session-refresh + route-gating helper invoked by src/proxy.ts on every
 * request (the Next.js 16 network boundary, formerly middleware).
 *
 * Responsibilities:
 *  1. Refresh the Supabase session cookie (token refresh must be able to
 *     write cookies — only the proxy/route handlers can do that).
 *  2. Gate routes optimistically:
 *       - unauthenticated /api/*            → 401 JSON (ApiErrorBody shape)
 *       - unauthenticated protected pages   → redirect to /login
 *       - authenticated /login, /signup     → redirect to /fridge
 *
 * The proxy is a router, not the trust boundary: pages, actions, and
 * handlers still check auth themselves, and RLS is the final authority.
 */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run other logic between creating the client and calling
  // auth.getUser() — this call performs the token refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user && isProtectedApiPath(pathname)) {
    const body: ApiErrorBody = {
      error: { code: "unauthenticated", message: "Authentication required." },
    };
    return withSessionCookies(
      NextResponse.json(body, { status: 401 }),
      supabaseResponse,
    );
  }

  if (!user && isProtectedPagePath(pathname)) {
    return withSessionCookies(
      NextResponse.redirect(buildUrl(request, ROUTES.login)),
      supabaseResponse,
    );
  }

  if (user && isAuthPagePath(pathname)) {
    return withSessionCookies(
      NextResponse.redirect(buildUrl(request, ROUTES.fridge)),
      supabaseResponse,
    );
  }

  // Return the response carrying any refreshed session cookies as-is.
  return supabaseResponse;
}

function buildUrl(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return url;
}

/**
 * When replacing the default response (redirect / 401), the refreshed session
 * cookies must be copied over — otherwise the browser and server sessions
 * desynchronize and users get randomly logged out.
 */
function withSessionCookies(
  response: NextResponse,
  supabaseResponse: NextResponse,
): NextResponse {
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}
