/**
 * THE WEBHOOK CREATED THE SCHOOL FIRST — THAT IS A SUCCESS, NOT A 409.
 *
 * Reproduces a production defect from 2026-11-11, hit on the first real group
 * purchase anyone ever put through futurepath.ae.
 *
 * Stripe calls the webhook the instant the card clears while the browser still
 * has to round-trip, so the webhook usually wins. Two commits on 2026-11-09
 * each fixed one half of what that implies and, between them, opened this:
 *
 *   - the race fix made `grantIndividualPremium` treat a webhook-created
 *     ACCOUNT as success, and fall through to the group block to create the
 *     school. Its comment explained that this was safe "because the webhook's
 *     grantIndividualPremium is individual-only and makes no organization".
 *   - the group backstop, hours later, made the webhook run that same group
 *     block — so the webhook now creates the SCHOOL too, and that sentence
 *     became false without anyone editing it.
 *
 * The browser then arrived second, found a school already there, and
 * `createGroupPurchaseTransaction` threw "already has an organization" — which
 * the route turned into **409 "This account already manages a school."** for a
 * purchase in which the card had cleared, the school existed, the licences
 * were granted and the setup invite had been emailed. Nothing was broken
 * except the answer, and the wrong answer is the one that invites a second
 * purchase. The buyer did try again.
 *
 * THE DISTINGUISHER IS THE PAYMENT, NOT THE TIMING, which is what R-02 and
 * R-03 exist to separate: a buyer who already runs a school and is buying a
 * second must still be refused.
 *
 * These are route tests with Stripe and storage mocked, in the same shape as
 * payment.completeGuard.test.ts, because the offline harness cannot run this
 * endpoint at all — its first act is a live `paymentIntents.retrieve`, and the
 * harness has no network (CLAUDE.md). Mocking is not a convenience here; it is
 * the only way to exercise the branch.
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

const getUserByEmail = vi.fn();
const createGroupPurchaseTransaction = vi.fn();
const getOrganizationByAdminUserId = vi.fn();
vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn(),
    getUserByEmail: (...a: any[]) => getUserByEmail(...a),
    updateUserFields: vi.fn(),
    createGroupPurchaseTransaction: (...a: any[]) => createGroupPurchaseTransaction(...a),
    getOrganizationByAdminUserId: (...a: any[]) => getOrganizationByAdminUserId(...a),
  },
}));

const grantIndividualPremium = vi.fn();
vi.mock("../services/premiumGrant", () => ({
  grantIndividualPremium: (...a: any[]) => grantIndividualPremium(...a),
}));

/**
 * Spied, not merely stubbed. The 409 returned BEFORE this ran, so a buyer on
 * the broken path got no setup link from here at all — R-01 asserts the
 * recovered path reaches it, because that is what makes the two paths produce
 * the same outcome rather than merely the same status code.
 */
const sendSchoolSetupInvite = vi.fn().mockResolvedValue({ sent: true });
vi.mock("../services/schoolSetupInvite", () => ({
  sendSchoolSetupInvite: (...a: any[]) => sendSchoolSetupInvite(...a),
}));

vi.mock("../middleware/rateLimiter.middleware", () => ({
  paymentLimiter: (_req: any, _res: any, next: any) => next(),
  stampBuyerLimiter: (_req: any, _res: any, next: any) => next(),
}));

const { registerPaymentRoutes } = await import("./payment.routes");

const PI_ID = "pi_group_race";

/** AED 1,800.00 for 5 licences — the shape of the production purchase. */
const SUCCEEDED_INTENT = {
  id: PI_ID,
  status: "succeeded",
  amount: 180000,
  currency: "aed",
  customer: null,
  metadata: { expectedAmount: "180000", countryId: "uae" },
};

const BUYER = { id: "u-buyer", email: "buyer@school.test", username: "buyer", firstName: "A" };

const GROUP_BODY = {
  paymentIntentId: PI_ID,
  firstName: "A",
  lastName: "B",
  email: BUYER.email,
  phone: "0500000000",
  organizationName: "AD School",
  studentCount: 5,
};

async function post(body: unknown): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => false;
    req.user = undefined;
    // The recovered path has isNewUser false, so req.login is never reached;
    // present so a regression that DID call it fails loudly rather than
    // crashing the server with an unhelpful stack.
    req.login = (_u: any, cb: any) => cb(null);
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

beforeEach(() => {
  paymentIntentsRetrieve.mockReset().mockResolvedValue(SUCCEEDED_INTENT);
  paymentIntentsUpdate.mockClear();
  getUserByEmail.mockReset().mockResolvedValue(undefined);
  createGroupPurchaseTransaction.mockReset();
  getOrganizationByAdminUserId.mockReset();
  grantIndividualPremium.mockReset();
  sendSchoolSetupInvite.mockClear();
});

describe("POST /api/checkout/complete — the webhook created the school first", () => {
  /**
   * R-01 IS THE PRODUCTION DEFECT. Before the fix this was a 409 carrying
   * "This account already manages a school", shown to a buyer whose purchase
   * had entirely succeeded.
   */
  it("adopts the school this payment already created, instead of answering 409", async () => {
    grantIndividualPremium.mockResolvedValue({ status: "already_premium", user: BUYER });
    createGroupPurchaseTransaction.mockRejectedValue(
      new Error("User already has an organization: AD School. Cannot create multiple organizations."),
    );
    getOrganizationByAdminUserId.mockResolvedValue({
      id: "org-1", name: "AD School", stripePaymentId: PI_ID, totalLicenses: 5,
    });

    const { status, body } = await post(GROUP_BODY);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // The buyer's account was made by the webhook with a password shown to
    // nobody, so password reset is their only door and the answer must say so.
    expect(body.requiresPasswordSetup).toBe(true);
    expect(body.message).toContain("AD School");

    // NOT re-run. The winner already granted the full studentCount, and the
    // licence ledger row carries this payment id uniquely — a second
    // transaction would double what the school is entitled to.
    expect(createGroupPurchaseTransaction).toHaveBeenCalledTimes(1);

    // The 409 returned before this. Reaching it is what makes the recovered
    // path produce the same outcome as the winning one, rather than just the
    // same status.
    expect(sendSchoolSetupInvite).toHaveBeenCalledTimes(1);
    expect(sendSchoolSetupInvite.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
      organizationName: "AD School",
      licenseCount: 5,
    });
  });

  /**
   * R-02 IS THE CONTROL. Without it R-01 passes against a route that has
   * simply stopped refusing anything, and a school could buy a second
   * organization its own account cannot hold.
   */
  it("still refuses when the existing school came from a DIFFERENT payment", async () => {
    grantIndividualPremium.mockResolvedValue({ status: "already_premium", user: BUYER });
    createGroupPurchaseTransaction.mockRejectedValue(
      new Error("User already has an organization: Older School. Cannot create multiple organizations."),
    );
    getOrganizationByAdminUserId.mockResolvedValue({
      id: "org-old", name: "Older School", stripePaymentId: "pi_last_year", totalLicenses: 50,
    });

    const { status, body } = await post(GROUP_BODY);

    expect(status).toBe(409);
    expect(body.message).toContain("already has an organization");
    expect(sendSchoolSetupInvite).not.toHaveBeenCalled();
  });

  /**
   * A school with no payment id at all — a superadmin-created one, or a comp.
   * Null must never equal the incoming id by accident, or a bank-transfer
   * school would be silently adopted by the next card payment that touched it.
   */
  it("refuses when the existing school carries no payment id", async () => {
    grantIndividualPremium.mockResolvedValue({ status: "already_premium", user: BUYER });
    createGroupPurchaseTransaction.mockRejectedValue(
      new Error("User already has an organization: Comped School. Cannot create multiple organizations."),
    );
    getOrganizationByAdminUserId.mockResolvedValue({
      id: "org-comp", name: "Comped School", stripePaymentId: null, totalLicenses: 20,
    });

    const { status } = await post(GROUP_BODY);
    expect(status).toBe(409);
    expect(sendSchoolSetupInvite).not.toHaveBeenCalled();
  });

  /** Nothing to adopt is a refusal, not a crash on a null. */
  it("refuses when no school can be found at all", async () => {
    grantIndividualPremium.mockResolvedValue({ status: "already_premium", user: BUYER });
    createGroupPurchaseTransaction.mockRejectedValue(
      new Error("User already has an organization: Ghost. Cannot create multiple organizations."),
    );
    getOrganizationByAdminUserId.mockResolvedValue(undefined);

    const { status } = await post(GROUP_BODY);
    expect(status).toBe(409);
  });

  /**
   * THE POSITIVE CONTROL. Without it every case above would pass against a
   * route that can no longer complete an ordinary purchase at all.
   */
  it("completes normally when the browser wins and creates the school itself", async () => {
    grantIndividualPremium.mockResolvedValue({
      status: "granted",
      user: BUYER,
      credentials: { username: "buyer", password: "generated" },
    });
    createGroupPurchaseTransaction.mockResolvedValue({
      user: BUYER,
      organization: { id: "org-new", name: "AD School", stripePaymentId: PI_ID },
    });

    const { status, body } = await post(GROUP_BODY);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // Not a raced buyer: these credentials were generated here and shown.
    expect(body.requiresPasswordSetup).toBe(false);
    // The recovery lookup must not run on the happy path.
    expect(getOrganizationByAdminUserId).not.toHaveBeenCalled();
    expect(sendSchoolSetupInvite).toHaveBeenCalledTimes(1);
  });

  /**
   * An unrelated failure must still surface. Narrowing the recovery by message
   * is only safe if everything else still throws.
   */
  it("does not swallow an unrelated transaction failure", async () => {
    grantIndividualPremium.mockResolvedValue({ status: "already_premium", user: BUYER });
    createGroupPurchaseTransaction.mockRejectedValue(new Error("connection terminated unexpectedly"));

    const { status } = await post(GROUP_BODY);
    expect(status).toBe(500);
    expect(getOrganizationByAdminUserId).not.toHaveBeenCalled();
  });
});
