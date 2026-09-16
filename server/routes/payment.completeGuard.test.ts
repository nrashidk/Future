/**
 * POST /api/checkout/complete's studentCount === 1, not-logged-in branch —
 * closing the rate-limit asymmetry from docs/parent-registers-scoping.md:
 * /api/register/parent is limited to 5/15min and used to be the only door
 * that created an account with no child profile and no consent record;
 * /api/checkout/complete's own account-creation branch, reached only via a
 * deliberate mid-checkout logout after Phase F (see payment.createIntent.test.ts),
 * had no equivalent close at all. This is now refused outright rather than
 * rate-limited, since nothing legitimate reaches it any more — see the
 * comment at the guard itself for why.
 *
 * Stripe and req.isAuthenticated are stubbed the same way as
 * payment.createIntent.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

process.env.STRIPE_SECRET_KEY = "sk_test_stub";

const paymentIntentsRetrieve = vi.fn();
const paymentIntentsUpdate = vi.fn().mockResolvedValue({});
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = {
      create: vi.fn(),
      retrieve: (...a: any[]) => paymentIntentsRetrieve(...a),
      update: (...a: any[]) => paymentIntentsUpdate(...a),
    };
  },
}));

const getUser = vi.fn();
const updateUserFields = vi.fn();
vi.mock("../storage", () => ({
  storage: {
    getUser: (...a: any[]) => getUser(...a),
    getUserByEmail: vi.fn(),
    updateUserFields: (...a: any[]) => updateUserFields(...a),
    createGroupPurchaseTransaction: vi.fn(),
  },
}));
vi.mock("../services/premiumGrant", () => ({ grantIndividualPremium: vi.fn() }));
vi.mock("../middleware/rateLimiter.middleware", () => ({
  paymentLimiter: (_req: any, _res: any, next: any) => next(),
  stampBuyerLimiter: (_req: any, _res: any, next: any) => next(),
}));

const { registerPaymentRoutes } = await import("./payment.routes");

let authenticated = false;

const SUCCEEDED_INTENT = {
  id: "pi_1",
  status: "succeeded",
  amount: 1000,
  customer: null,
  metadata: { expectedAmount: "1000" },
};

async function post(body: unknown): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => authenticated;
    req.user = authenticated ? { userId: "u-1" } : undefined;
    next();
  });
  registerPaymentRoutes(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/checkout/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

const VALID_BODY = {
  paymentIntentId: "pi_1",
  firstName: "A",
  lastName: "B",
  email: "a@example.com",
  phone: "1234567890",
  studentCount: 1,
};

beforeEach(() => {
  authenticated = false;
  paymentIntentsRetrieve.mockReset().mockResolvedValue(SUCCEEDED_INTENT);
  paymentIntentsUpdate.mockClear();
  getUser.mockReset();
  updateUserFields.mockReset();
});

describe("POST /api/checkout/complete — studentCount === 1 not-logged-in guard", () => {
  it("refuses rather than creating an account, even with a genuinely succeeded payment", async () => {
    const { status, body } = await post(VALID_BODY);
    expect(status).toBe(401);
    expect(body.code).toBe("SESSION_REQUIRED");
    expect(body.paymentIntentId).toBe("pi_1");
  });

  it("still completes normally for an authenticated caller (wasLoggedIn branch, unaffected)", async () => {
    authenticated = true;
    getUser.mockResolvedValue({ id: "u-1", email: "a@example.com", username: "a" });
    updateUserFields.mockResolvedValue({ id: "u-1", email: "a@example.com", username: "a" });
    const { status, body } = await post(VALID_BODY);
    expect(status).toBe(200);
    expect(body.isNewUser).toBe(false);
    expect(body.wasLoggedIn).toBe(true);
  });
});
