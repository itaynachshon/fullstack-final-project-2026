import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests are pure (schemas, route helpers, state stores) — no DOM
    // needed. F4's .tsx suites render static markup via react-dom/server,
    // which also runs fine in node (no Testing Library dependency).
    environment: "node",
    // F2: the Edge Function worker (supabase/functions/restock-reminders/)
    // keeps its pure scheduler/email logic in platform-neutral TS modules
    // with colocated Vitest suites.
    include: ["src/**/*.test.{ts,tsx}", "supabase/functions/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
