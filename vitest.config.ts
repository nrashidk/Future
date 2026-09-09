import { defineConfig } from "vitest/config";
import path from "path";

// Dedicated config for unit tests (node environment). Kept separate from
// vite.config.ts, which is client-focused (react plugin, client root).
//
// client/src is included for PURE modules only — serverErrorMessage and the like.
// The environment is still node, so anything touching the DOM or rendering a
// component needs jsdom and a deliberate decision about how this config splits.
//
// THAT OPEN QUESTION HAS NOW COST SOMETHING, which is worth recording next to it
// rather than only in a doc. The exactly-three quiz shortfall
// (docs/quiz-priority-subjects-shortfall-recon.md) was a stale React closure: a
// step wrote state and advanced in the same handler, so the save it triggered
// sent the previous value and every free-tier student picking three subjects got
// a 6-question quiz instead of 12. Every unit here passed throughout —
// calculateQuizDistribution is correct, the validators are correct, the route
// ordering is correct. The defect lived only in the seam between a component's
// event handler and its parent's, which is exactly what a node-only suite cannot
// reach: there is no render, so there is no stale render to catch.
//
// So the gap is not "we lack component coverage" in the abstract; it is that
// this whole BUG CLASS — write-and-advance in one handler — is invisible to
// every test we can currently write. Deciding the jsdom split is what makes a
// regression test for it possible. Deliberately not bundled into the fix commit.
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
