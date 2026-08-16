/**
 * Standalone scanner test surface (Wave 2 Agent C, per IMPLEMENTATION_PLAN
 * §Wave 2C). Deliberately outside the (app) route group: no app shell, no
 * bottom navigation, and — matching src/proxy.ts, which only gates /fridge,
 * /add, /restock and /api — no sign-in requirement, so the scanner can be
 * exercised on a phone straight from a deploy preview URL.
 *
 * Development/testing tool only: it never calls the product APIs and never
 * writes to the database.
 */

import type { Metadata } from "next";

import { ScanTestPanel } from "@/components/scanner/ScanTestPanel";

export const metadata: Metadata = {
  title: "Scanner test",
  description: "Standalone test page for the barcode scanner component.",
  robots: { index: false, follow: false },
};

export default function ScanTestPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 md:px-6">
      <ScanTestPanel />
    </main>
  );
}
