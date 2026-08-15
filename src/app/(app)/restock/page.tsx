import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Restock",
};

/**
 * Restock route (frozen route map). The running-low / finished-recently /
 * recent-activity lists are Wave 2 work (Agent B) — this page is a protected
 * placeholder only.
 */
export default async function RestockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Restock</h1>
      <p className="max-w-xs text-sm text-zinc-500">
        Running-low and finished-recently lists are coming in the next
        milestone.
      </p>
    </section>
  );
}
