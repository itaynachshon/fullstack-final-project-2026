import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cookie-bound Supabase client for the server runtime: server components,
 * server actions, and route handlers. Uses only the public anon key — every
 * query runs with the calling user's JWT and Row Level Security decides row
 * access. No runtime code path uses the service-role key.
 *
 * Create a new client per request (do not cache it in a module variable).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: src/proxy.ts refreshes the session on every
            // request and persists the updated tokens.
          }
        },
      },
    },
  );
}
