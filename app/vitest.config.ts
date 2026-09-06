import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Deliberately minimal: this project has no test suite before Self
 * Service Phase 1 (no local Supabase/Postgres in the dev environment
 * either, so RLS/uniqueness/publish-flow behavior can't be exercised
 * against a real database here - see the Phase 1 report's Testing
 * section for what that means and what's covered instead). This config
 * only needs to run plain TypeScript unit tests for pure logic
 * (src/lib/slug.ts today), so no jsdom/browser environment is configured.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
