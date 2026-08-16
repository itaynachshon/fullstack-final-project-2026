import { BottomNav } from "@/components/app-shell/BottomNav";
import { ToastProvider } from "@/components/app-shell/Toaster";
import { TopBar } from "@/components/app-shell/TopBar";

/**
 * Authenticated app shell (docs/UI_DESIGN.md §5): no global chrome on phones
 * beyond the thumb-reachable bottom bar (page headers carry per-page
 * actions); a top header bar replaces it from md up. Route protection
 * happens in src/proxy.ts and again inside each page (defense in depth);
 * RLS is the final authority.
 *
 * Pages own their max-widths (§10); the shell provides gutters and bottom-nav
 * clearance (pb-24) so the last card is never hidden behind the bar.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <TopBar />
        <main className="w-full flex-1 px-4 pb-24 md:px-6 md:pb-12">
          {children}
        </main>
        <footer className="hidden pb-6 md:block">
          <p className="mx-auto w-full max-w-5xl px-6 text-xs text-muted-foreground">
            Product data: our catalog + Open Food Facts (ODbL).
          </p>
        </footer>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
