/**
 * Regression guard: an unconfigured mail service must fail VISIBLY everywhere
 * except local development.
 *
 * The old form gated the strict branch on `NODE_ENV === "production"`, in two
 * places that had to agree — the 503 gate on POST /api/password-reset/request
 * and sendPasswordResetEmail's own `if (!resend)` branch. Any NODE_ENV that was
 * not exactly "production" took the lenient path, and the lenient path returns
 * `{ success: true, messageId: "dev-mode-no-email" }`. The route sees no
 * failure, returns its generic 200, and the caller is shown "Check Your Email"
 * for mail that was never sent — a silent lockout, since password reset is the
 * only account recovery a user with an email address has.
 *
 * RESEND_API_KEY is unset in production today, so that lenient path was one
 * changed start command away from being the live behaviour.
 *
 * The assertions that matter are "unset" and "staging": absence must be strict.
 * A test asserting only that development is lenient and production is strict
 * would have passed against the old code too.
 */

import { describe, it, expect, afterEach } from "vitest";

// No mocks needed: the predicate reads process.env and nothing else, and
// importing this module does not reach db.ts.
const { isLogOnlyMailEnvironment } = await import("./email");

const original = process.env.NODE_ENV;
afterEach(() => {
  if (original === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = original;
});

describe("isLogOnlyMailEnvironment", () => {
  it("is strict when NODE_ENV is unset — the regression", () => {
    // A start command changed from `npm start` (which sets NODE_ENV=production)
    // to `node dist/index.js` lands here. Under the old check this returned the
    // lenient branch and reported unsent mail as sent.
    delete process.env.NODE_ENV;
    expect(isLogOnlyMailEnvironment()).toBe(false);
  });

  it("is strict for any environment that is not development", () => {
    for (const env of ["staging", "test", "preview", ""]) {
      process.env.NODE_ENV = env;
      expect(isLogOnlyMailEnvironment()).toBe(false);
    }
  });

  it("is strict in production", () => {
    process.env.NODE_ENV = "production";
    expect(isLogOnlyMailEnvironment()).toBe(false);
  });

  it("allows the log-only path only in development", () => {
    // What `npm run dev` sets. The local workflow — no RESEND_API_KEY, reset
    // URL logged to the console — must keep working.
    process.env.NODE_ENV = "development";
    expect(isLogOnlyMailEnvironment()).toBe(true);
  });

  it("does not accept a near-miss spelling", () => {
    // Exact match, not a prefix or a case-insensitive one: "Development" is
    // someone's dashboard typo, and a typo must not unlock the lenient path.
    for (const env of ["Development", "DEVELOPMENT", "dev", "development "]) {
      process.env.NODE_ENV = env;
      expect(isLogOnlyMailEnvironment()).toBe(false);
    }
  });
});
