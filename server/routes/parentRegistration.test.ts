/**
 * POST /api/register/parent — the account, the child profile and the consent
 * row, before any payment. See docs/parent-registers-scoping.md.
 *
 * Storage, hashPassword and policyVersion are mocked so importing the route
 * does not pull in db.ts (throws at import with no DATABASE_URL) or run real
 * bcrypt — same pattern as organization.consent.test.ts and user.erasure.test.ts.
 * req.logIn is stubbed directly rather than mounting real passport, since
 * nothing here tests session establishment itself.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const getUserByEmail = vi.fn();
const createParentRegistration = vi.fn();
vi.mock("../storage", () => ({
  storage: { getUserByEmail: (...a: any[]) => getUserByEmail(...a), createParentRegistration: (...a: any[]) => createParentRegistration(...a) },
}));

vi.mock("../utils/passwordHash", () => ({
  hashPassword: async (p: string) => `hashed:${p}`,
}));

// Otherwise every test in this file shares one in-memory limiter instance
// keyed on the same loopback IP, and later tests start seeing 429s.
vi.mock("../middleware/rateLimiter.middleware", () => ({
  registerParentLimiter: (_req: any, _res: any, next: any) => next(),
}));

const getPolicyVersion = vi.fn();
vi.mock("../utils/policyVersion", () => ({
  getPolicyVersion: () => getPolicyVersion(),
  hashAttestationText: (t: string) => `hash:${t}`,
  // resolvePolicyLocale (organization.routes.ts, imported for real below) reads
  // this directly, so it has to survive the mock too.
  POLICY_LOCALES: ["en", "ar"],
}));

const { registerParentRegistrationRoutes } = await import("./parentRegistration.routes");

const VALID_BODY = {
  email: "Parent@Example.com",
  password: "Correct-horse-9",
  firstName: "Amina",
  lastName: "Rashid",
  child: {
    name: "Khaled",
    dateOfBirth: "2012-05-04",
    gender: "male",
    grade: "grade9",
    countryId: "country-ae",
    curriculum: "MOE National",
  },
  consentsToProcessing: true,
  attestsGuardianRelationship: true,
  attestationText: "I am Khaled's parent or legal guardian.\nI consent to Future Pathways processing Khaled's personal data...",
  locale: "en",
};

const POLICY = { version: "pv-1", lastUpdated: { en: "6 April 2026", ar: "٦ أبريل ٢٠٢٦" } };

beforeEach(() => {
  vi.clearAllMocks();
  getUserByEmail.mockResolvedValue(undefined);
  getPolicyVersion.mockReturnValue(POLICY);
  createParentRegistration.mockResolvedValue({
    user: { id: "u-1", email: "parent@example.com" },
    childProfile: { id: "cp-1", name: "Khaled" },
    consent: { id: "cc-1" },
  });
});

async function post(body: unknown): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  // Stub passport's req.logIn — nothing here tests session establishment.
  app.use((req: any, _res, next) => {
    req.logIn = (_user: any, cb: (err: any) => void) => cb(null);
    next();
  });
  registerParentRegistrationRoutes(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/register/parent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

describe("POST /api/register/parent", () => {
  it("creates the account, child profile and consent in one call, and logs the parent in", async () => {
    const { status, body } = await post(VALID_BODY);
    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      user: { id: "u-1", email: "parent@example.com" },
      child: { id: "cp-1", name: "Khaled" },
    });

    expect(createParentRegistration).toHaveBeenCalledTimes(1);
    const call = createParentRegistration.mock.calls[0][0];
    // Email lowercased before it ever reaches storage — the duplicate check
    // and the stored row must agree on case.
    expect(call.email).toBe("parent@example.com");
    expect(call.passwordHash).toBe("hashed:Correct-horse-9");
    expect(call.role).toBe("user");
    expect(call.child).toEqual(VALID_BODY.child);
    expect(call.consent).toMatchObject({
      consentsToProcessing: true,
      attestsGuardianRelationship: true,
      performedByName: "Amina Rashid",
      performedByEmail: "parent@example.com",
      policyVersion: "pv-1",
      policyLastUpdated: "6 April 2026",
      policyLocale: "en",
      attestationTextHash: `hash:${VALID_BODY.attestationText}`,
    });
  });

  it("rejects a partial consent — both claims or nothing, same as the school attestation", async () => {
    const { status, body } = await post({ ...VALID_BODY, attestsGuardianRelationship: false });
    expect(status).toBe(400);
    expect(createParentRegistration).not.toHaveBeenCalled();
    expect(body.message).toMatch(/guardian-relationship/);
  });

  it("rejects a weak password before touching storage", async () => {
    const { status } = await post({ ...VALID_BODY, password: "weak" });
    expect(status).toBe(400);
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects a missing attestationText — the exact wording shown to the parent", async () => {
    const { status, body } = await post({ ...VALID_BODY, attestationText: "" });
    expect(status).toBe(400);
    expect(body.message).toMatch(/attestationText/);
  });

  it("rejects a duplicate email without creating anything", async () => {
    getUserByEmail.mockResolvedValue({ id: "u-existing" });
    const { status } = await post(VALID_BODY);
    expect(status).toBe(400);
    expect(createParentRegistration).not.toHaveBeenCalled();
  });

  // FAIL CLOSED, same as /api/my-organization/consent: without readable legal
  // documents there is nothing to say consent was given against.
  it("refuses to record consent when the legal documents are unavailable", async () => {
    getPolicyVersion.mockReturnValue(null);
    const { status } = await post(VALID_BODY);
    expect(status).toBe(503);
    expect(createParentRegistration).not.toHaveBeenCalled();
  });

  it("logs the parent in as isLocal, matching /api/register's shape", async () => {
    let loggedIn: any = null;
    async function postWithCapture() {
      const app = express();
      app.use(express.json());
      app.use((req: any, _res, next) => {
        req.logIn = (user: any, cb: (err: any) => void) => { loggedIn = user; cb(null); };
        next();
      });
      registerParentRegistrationRoutes(app);
      const server = app.listen(0);
      await new Promise((r) => server.once("listening", r));
      const { port } = server.address() as AddressInfo;
      try {
        await fetch(`http://127.0.0.1:${port}/api/register/parent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(VALID_BODY),
        });
      } finally {
        server.close();
      }
    }
    await postWithCapture();
    expect(loggedIn).toEqual({ userId: "u-1", isLocal: true });
  });
});
