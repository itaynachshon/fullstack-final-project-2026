import Link from "next/link";

import { ROUTES } from "@/lib/routes";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-zinc-500">
        This page does not exist. Head back to your fridge.
      </p>
      <Link
        href={ROUTES.fridge}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Go to my fridge
      </Link>
    </main>
  );
}
