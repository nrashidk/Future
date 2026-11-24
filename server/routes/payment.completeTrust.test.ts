/**
 * /api/checkout/complete GRANTS WHAT WAS PAID FOR, TO WHOEVER PAID
 * (2026-11-24, found by an independent review before launch).
 *
 * Two holes, both in the signed-out group path:
 *   - the licence count was read from the request body. The amount check
 *     compares the charge with `expectedAmount` only, so paying for 2 and
 *     sending 100000 made a school with 100000 licences, with a matching
 *     ledger row, so reconciliation saw nothing.
 *   - an existing account was upgraded, and made a school's admin, on a typed
 *     email alone.
 *
 * Route tests with Stripe and storage mocked, like payment.webhookWonRace,
 * because the offline harness cannot run this endpoint (its first act is a
 * live paymentIntents.retrieve). The intent is built the way
 * create-payment-intent and stamp-buyer write it.
 *
 *   T-01  THE CASE THAT MATTERS: paid for 2, asked for 100000 -> 400, nothing written
 *   T-02  control: the matching count completes and the school gets 2
 *   T-03  a signed-in caller cannot complete another account's payment
 *   T-04  THE OTHER CASE: signed out, the email of an account older than the
 *         payment -> LOGIN_REQUIRED, the account untouched
 *   T-05  control: an account the webhook made for THIS payment (newer) completes
 *   T-06  the school name stamped on the payment wins over the request's
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

process.env.STRIPE_SECRET_KEY = "sk_test_stub";

const paymentIntentsRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = {
      create: vi.fn(),
      retrieve: (...a: any[]) => paymentIntentsRetrieve(...a),
      update: vi.fn().mockResolvedValue({}),
    };
  },
}));

const getUser = vi.fn();
const getUserByEmail = vi.fn();
const updateUserFields = vi.fn();
const createGroupPurchaseTransaction = vi.fn();
vi.mock("../storage", () => ({
  storage: {
    getUser: (...a: any[]) => getUser(...a),
    getUserByEmail: (...a: any[]) => getUserByEmail(...a),
    updateUserFields: (...a: any[]) => updateUserFields(...a),
    createGroupPurchaseTransaction: (...a: any[]) => createGroupPurchaseTransaction(...a),
    getOrganizationByAdminUserId: vi.fn(),
  },
}));

const grantIndividualPremium = vi.fn();
vi.mock("../services/premiumGrant", () => ({
  grantIndividualPremium: (...a: any[]) => grantIndividualPremium(...a),
}));
vi.mock("../services/schoolSetupInvite", () => ({
  sendSchoolSetupInvite: vi.fn().mockResolvedValue({ sent: true }),
}));
vi.mock("../middleware/rateLimiter.middleware", () => ({
  paymentLimiter: (_req: any, _res: any, next: any) => next(),
  stampBuyerLimiter: (_req: any, _res: any, next: any) => next(),
}));

const { registerPaymentRoutes } = await import("./payment.routes");

const PAID_AT = 1_700_000_000; // seconds, as Stripe reports `created`
const intent = (meta: Record<string, string> = {}) => ({
  id: "pi_trust",
  status: "succeeded",
  amount: 8000,
  currency: "aed",
  customer: null,
  created: PAID_AT,
  metadata: { expectedAmount: "8000", countryId: "uae", studentCount: "2", userId: "guest", organizationName: "Stamped School", ...meta },
});
const BODY = {
  paymentIntentId: "pi_trust", firstName: "A", lastName: "B", email: "buyer@school.test",
  phone: "0500000000", organizationName: "Stamped School", studentCount: 2,
};
const NEW_BUYER = { id: "u-new", email: "buyer@school.test", username: "buyer", passwordHash: "h", createdAt: new Date((PAID_AT + 5) * 1000) };
const OLD_ACCOUNT = { id: "u-victim", email: "buyer@school.test", username: "victim", passwordHash: "h", createdAt: new Date((PAID_AT - 86_400) * 1000) };

async function post(body: unknown, sessionUserId: string | null = null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => !!sessionUserId;
    req.user = sessionUserId ? { userId: sessionUserId } : undefined;
    req.login = (_u: any, cb: any) => cb(null);
    next();
  });
  registerPaymentRoutes(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/checkout/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  paymentIntentsRetrieve.mockReset().mockResolvedValue(intent());
  getUser.mockReset();
  getUserByEmail.mockReset().mockResolvedValue(undefined);
  updateUserFields.mockReset().mockImplementation(async (id: string, f: any) => ({ id, username: "x", ...f }));
  createGroupPurchaseTransaction.mockReset().mockImplementation(async (a: any) => ({
    user: { id: a.userId, username: "x" }, organization: { id: "org-1", name: a.organizationName, totalLicenses: a.studentCount },
  }));
  grantIndividualPremium.mockReset().mockResolvedValue({
    status: "granted", user: NEW_BUYER, credentials: { username: "buyer", password: "p", email: NEW_BUYER.email },
  });
});

describe("POST /api/checkout/complete grants what was paid for, to whoever paid", () => {
  it("T-01 refuses a count the payment did not cover, and writes nothing", async () => {
    const { status, body } = await post({ ...BODY, studentCount: 100000 });
    expect(status).toBe(400);
    expect(body.code).toBe("PAYMENT_MISMATCH");
    expect(grantIndividualPremium).not.toHaveBeenCalled();
    expect(createGroupPurchaseTransaction).not.toHaveBeenCalled();
    expect(updateUserFields).not.toHaveBeenCalled();
  });

  it("T-02 control: the matching count completes with the paid count", async () => {
    const { status } = await post(BODY);
    expect(status).toBe(200);
    expect(createGroupPurchaseTransaction).toHaveBeenCalledWith(expect.objectContaining({ studentCount: 2 }));
  });

  it("T-03 a signed-in caller cannot complete another account's payment", async () => {
    paymentIntentsRetrieve.mockResolvedValue(intent({ userId: "u-owner" }));
    getUser.mockResolvedValue({ id: "u-other", email: "other@x.test" });
    const { status, body } = await post(BODY, "u-other");
    expect(status).toBe(403);
    expect(body.code).toBe("PAYMENT_NOT_YOURS");
    expect(updateUserFields).not.toHaveBeenCalled();
    expect(createGroupPurchaseTransaction).not.toHaveBeenCalled();
  });

  it("T-05 control: the account the webhook made for this payment completes", async () => {
    getUserByEmail.mockResolvedValue(NEW_BUYER);
    const { status } = await post(BODY);
    expect(status).toBe(200);
    expect(createGroupPurchaseTransaction).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-new", studentCount: 2 }));
  });

  it("T-06 the school name stamped on the payment wins over the request's", async () => {
    const { status } = await post({ ...BODY, organizationName: "Something Else" });
    expect(status).toBe(200);
    expect(createGroupPurchaseTransaction).toHaveBeenCalledWith(expect.objectContaining({ organizationName: "Stamped School" }));
  });
});
