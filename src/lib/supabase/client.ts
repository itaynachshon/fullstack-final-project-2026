"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Per the approved design it is used only by the
 * auth forms (sign up / log in / sign out) — all page data is fetched on the
 * server and all mutations go through server actions.
 *
 * The anon key is public by design: Row Level Security is the authorization
 * boundary (docs/ARCHITECTURE.md §7, §10).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
