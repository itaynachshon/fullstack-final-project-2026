import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 network-boundary file. The design documents name this
 * `src/middleware.ts`; Next.js 16 renamed the convention to `proxy.ts`
 * (middleware.ts is deprecated in v16), so the file lives here with
 * identical behavior: refresh the Supabase session and gate routes on
 * every request.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on every request except static assets. `.wasm` matters: the ZXing
  // decoder binary is served from public/wasm/ (Wave 3 self-hosting) and a
  // session refresh on a static binary fetch would be pure overhead.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)",
  ],
};
