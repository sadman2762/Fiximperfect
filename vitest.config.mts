import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve("src"),
      "server-only": path.resolve("tests/support/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["tests/support/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Integration/e2e suites share one database; run files sequentially.
    fileParallelism: false,
  },
});
