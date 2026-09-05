import { defineConfig } from "vitest/config";
import path from "path";

// Dedicated config for unit tests (node environment). Kept separate from
// vite.config.ts, which is client-focused (react plugin, client root).
//
// client/src is included for PURE modules only — serverErrorMessage and the like.
// The environment is still node, so anything touching the DOM or rendering a
// component needs jsdom and a deliberate decision about how this config splits.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "shared/**/*.test.ts",
      "client/src/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
