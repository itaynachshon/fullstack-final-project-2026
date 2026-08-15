import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Fridge",
};

/**
 * Home: the fridge inventory. Wave 1 ships the protected empty shell; the
 * grouped inventory, consume control, and filters arrive in Wave 2 (Agent B).
 */
export default async function FridgePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Your fridge is empty</h1>
      <p className="max-w-xs text-sm text-zinc-500">
        After your next shopping trip, add products by scanning their barcode,
        searching the catalog, or entering them manually.
      </p>
      <Link
        href={ROUTES.add}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
      >
        Add products
      </Link>
    </section>
  );
}
