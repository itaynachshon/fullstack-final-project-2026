import { BottomNav } from "@/components/app-shell/BottomNav";
import { SignOutButton } from "@/components/auth/SignOutButton";

/**
 * Authenticated app shell: small header + thumb-reachable bottom navigation
 * (docs/TECHNICAL_DESIGN.md §9.1). Route protection happens in src/proxy.ts
 * and again inside each page (defense in depth); RLS is the final authority.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
          <span className="text-base font-semibold tracking-tight">
            Fridge Tracker
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-6 pb-24">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
