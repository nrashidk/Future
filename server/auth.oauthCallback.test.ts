/**
 * The OAuth callback routes stopped using passport.authenticate(strategy,
 * { failureRedirect }) — that shorthand's failureRedirect is one static
 * string and can't vary by which failure fired, but google_no_account /
 * microsoft_no_account need a different destination than a genuine OAuth
 * failure. The replacement is a custom passport.authenticate(strategy,
 * callback) — and that form does NOT call req.logIn for you the way the
 * shorthand does. This file exists to check that isn't just assumed: a
 * successful callback must actually establish an authenticated session,
 * not merely redirect to the right URL.
 *
 * Storage and connect-pg-simple are mocked so importing ./auth does not
 * pull in db.ts (throws at import with no DATABASE_URL) or require a real
 * Postgres session store — same reasoning as
 * server/routes/parentRegistration.test.ts, one level lower (that file
 * stubs req.logIn away entirely because it isn't testing session
 * establishment; this file is, so it can't do that).
 *
 * The Google/Microsoft strategies themselves are replaced with fakes that
 * call this.success()/this.fail() directly — passport's own translation
 * from strategy success/fail into the authenticate() callback's
 * (err, user, info) is core passport behavior, identical regardless of
 * which strategy is registered under the name, so faking the strategy
 * exercises exactly the route-wrapper code in auth.ts without a real
 * OAuth handshake.
 */

import { describe, it, expect, vi } from "vitest";
import express from "express";
import session from "express-session";
import type { AddressInfo } from "net";

vi.mock("./storage", () => ({
  storage: {
    getUserByOAuthProvider: vi.fn(),
    getUserByEmail: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    upsertUser: vi.fn(),
    getUserByUsername: vi.fn(),
  },
}));

// Swap the real Postgres-backed store for express-session's built-in
// in-memory one — same Store interface, no DATABASE_URL required.
vi.mock("connect-pg-simple", () => ({
  default: (sessionModule: typeof session) => sessionModule.MemoryStore,
}));

process.env.SESSION_SECRET = "test-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
process.env.MICROSOFT_CLIENT_ID = "test-ms-id";
process.env.MICROSOFT_CLIENT_SECRET = "test-ms-secret";

const { setupAuth } = await import("./auth");
const passport = (await import("passport")).default;

type FakeResult =
  | { type: "success"; user: any }
  | { type: "fail"; info: any };

function fakeStrategy(name: string, getResult: () => FakeResult) {
  return {
    name,
    authenticate(this: any) {
      const result = getResult();
      if (result.type === "success") {
        this.success(result.user);
      } else {
        this.fail(result.info);
      }
    },
  };
}

async function withServer(
  strategyName: "google" | "microsoft",
  getResult: () => FakeResult,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  await setupAuth(app);
  passport.unuse(strategyName);
  passport.use(fakeStrategy(strategyName, getResult) as any);

  // Probe route: the one thing that proves req.logIn actually ran, as
  // opposed to just redirecting to the right place.
  app.get("/probe", (req: any, res) => {
    res.json({ authenticated: req.isAuthenticated(), user: req.user ?? null });
  });

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

function firstCookie(res: Response): string {
  const raw = res.headers.get("set-cookie");
  if (!raw) throw new Error("no Set-Cookie header on response");
  return raw.split(";")[0];
}

describe("GET /api/auth/google/callback", () => {
  it("on success, establishes an authenticated session before redirecting to /auth/callback", async () => {
    await withServer(
      "google",
      () => ({ type: "success", user: { userId: "u-1", provider: "google", emailVerified: true } }),
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/auth/google/callback`, { redirect: "manual" });
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/auth/callback");

        const cookie = firstCookie(res);
        const probe = await fetch(`${baseUrl}/probe`, { headers: { Cookie: cookie } });
        const body = await probe.json();
        expect(body.authenticated).toBe(true);
        expect(body.user).toEqual({ userId: "u-1", provider: "google", emailVerified: true });
      },
    );
  });

  it("on google_no_account, redirects to /login with that exact code, not the generic one", async () => {
    await withServer(
      "google",
      () => ({ type: "fail", info: { code: "google_no_account" } }),
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/auth/google/callback`, { redirect: "manual" });
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?error=google_no_account");
      },
    );
  });

  it("on a failure with no code, falls back to google_failed rather than dropping the query param", async () => {
    await withServer(
      "google",
      () => ({ type: "fail", info: {} }),
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/auth/google/callback`, { redirect: "manual" });
        expect(res.headers.get("location")).toBe("/login?error=google_failed");
      },
    );
  });
});

describe("GET /api/auth/microsoft/callback", () => {
  it("on microsoft_no_account, redirects to /login with that exact code", async () => {
    await withServer(
      "microsoft",
      () => ({ type: "fail", info: { code: "microsoft_no_account" } }),
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/auth/microsoft/callback`, { redirect: "manual" });
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?error=microsoft_no_account");
      },
    );
  });
});
