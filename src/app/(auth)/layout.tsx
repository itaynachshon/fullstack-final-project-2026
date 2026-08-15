/** Minimal centered card shell for the public auth pages. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold tracking-tight">
          Fridge Tracker
        </h1>
        <p className="mb-8 text-center text-sm text-zinc-500">
          Know what is in your fridge — and what to buy again.
        </p>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
