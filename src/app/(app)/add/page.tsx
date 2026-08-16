import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AddFlow, type AddMode } from "@/components/fridge/add/AddFlow";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Add a product",
};

/**
 * Add Product (docs/UI_DESIGN.md §6.4): Scan / Search / Manual in one
 * client flow, max-w-lg. URL params form the Wave 3 entry point for the
 * unknown-scan fallback (?mode=manual&barcode=…) without a rewrite.
 */
export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const params = await searchParams;
  const rawMode = typeof params.mode === "string" ? params.mode : undefined;
  const mode: AddMode | undefined =
    rawMode === "scan" || rawMode === "search" || rawMode === "manual"
      ? rawMode
      : undefined;
  const barcode =
    typeof params.barcode === "string" && params.barcode.length > 0
      ? params.barcode
      : undefined;

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="pt-4 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Add a product</h1>
      </header>
      <div className="mt-2">
        <AddFlow
          initialMode={mode ?? (barcode ? "manual" : "scan")}
          initialBarcode={barcode}
        />
      </div>
    </div>
  );
}
