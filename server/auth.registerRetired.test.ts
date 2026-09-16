/**
 * POST /api/register used to create a plain free account. The free tier is
 * retired (docs/free-tier-retirement-recon.md §2) — this checks the route
 * refuses unconditionally rather than merely being unreachable from the
 * client, since the client-side interstitial (Register.tsx) is a courtesy,
 * not the actual door. A direct call (a cached bundle, curl) must not still
 * be able to create an account.
 *
 * Storage and connect-pg-simple are mocked purely so importing ./auth does
 * not pull in db.ts (throws at import with no DATABASE_URL) — same pattern
 * as auth.oauthCallback.test.ts.
 */

import { describe, it, expect, vi } from "vitest";
import express from "express";
import session from "express-session";
import type { AddressInfo } from "net";

const upsertUser = vi.fn();
const getUserByEmail = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    getUserByOAuthProvider: vi.fn(),
    getUserByEmail: (...a: any[]) => getUserByEmail(...a),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    upsertUser: (...a: any[]) => upsertUser(...a),
    getUserByUsername: vi.fn(),
  },
}));

vi.mock("connect-pg-simple", () => ({
  default: (sessionModule: typeof session) => sessionModule.MemoryStore,
}));

process.env.SESSION_SECRET = "test-secret";

const { setupAuth } = await import("./auth");

async function post(body: unknown): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  await setupAuth(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

describe("POST /api/register", () => {
  it("refuses with 410 and points at /register/parent, without touching storage", async () => {
    const { status, body } = await post({
      email: "new@example.com",
      password: "Correct-horse-9",
      firstName: "Amina",
      lastName: "Rashid",
    });

    expect(status).toBe(410);
    expect(body.code).toBe("FREE_TIER_RETIRED");
    expect(body.message).toMatch(/register\/parent/);
    expect(upsertUser).not.toHaveBeenCalled();
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("refuses the same way even with no body at all", async () => {
    const { status, body } = await post({});
    expect(status).toBe(410);
    expect(body.code).toBe("FREE_TIER_RETIRED");
  });
});
