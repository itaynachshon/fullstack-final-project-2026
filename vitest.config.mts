import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Wave 1 unit tests are pure (schemas, route helpers) — no DOM needed.
    // Wave 2 adds React Testing Library suites, which will switch per-file to jsdom.
    environment: "node",
    // F2: the Edge Function worker (supabase/functions/restock-reminders/)
    // keeps its pure scheduler/email logic in platform-neutral TS modules
    // with colocated Vitest suites.
    include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
