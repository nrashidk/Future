/**
 * POST /api/create-payment-intent — the actual enforcement of "the self-pay
 * route is parent-registers-only" (docs/parent-registers-scoping.md), not
 * /api/checkout/complete: this runs BEFORE Stripe ever charges a card, so
 * refusing here costs nothing, unlike refusing after a successful charge.
 *
 * Stripe is mocked to a stub that never touches the network — the guard
 * under test runs before paymentIntents.create is ever called, but the
 * module-level `if (!stripe)` 503 guard requires stripe to be truthy to
 * reach it. req.isAuthenticated is stubbed directly rather than mounting
 * real passport, matching parentRegistration.test.ts's req.logIn stub.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

process.env.STRIPE_SECRET_KEY = "sk_test_stub";

const paymentIntentsCreate = vi.fn().mockResolvedValue({ client_secret: "secret_abc", id: "pi_1" });
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { create: (...a: any[]) => paymentIntentsCreate(...a), retrieve: vi.fn(), update: vi.fn() };
  },
}));

vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../services/premiumGrant", () => ({ grantIndividualPremium: vi.fn() }));
vi.mock("../middleware/rateLimiter.middleware", () => ({
  paymentLimiter: (_req: any, _res: any, next: any) => next(),
  stampBuyerLimiter: (_req: any, _res: any, next: any) => next(),
}));

const { registerPaymentRoutes } = await import("./payment.routes");

let authenticated = false;

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
    const res = await fetch(`http://127.0.0.1:${port}/api/create-payment-intent`, {
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
  authenticated = false;
  paymentIntentsCreate.mockClear();
});

describe("POST /api/create-payment-intent — parent-registers gate", () => {
  it("refuses an unauthenticated individual purchase before any charge exists", async () => {
    const { status, body } = await post({ studentCount: 1 });
    expect(status).toBe(401);
    expect(body.code).toBe("REGISTRATION_REQUIRED");
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("allows an authenticated individual purchase", async () => {
    authenticated = true;
    const { status, body } = await post({ studentCount: 1 });
    expect(status).toBe(200);
    expect(body.clientSecret).toBe("secret_abc");
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
  });

  // studentCount > 1 is the institutional/group-purchase path
  // (GroupPricing.tsx) — unauthenticated by design, never part of this
  // decision's scope.
  it("allows an unauthenticated group purchase — out of scope for this gate", async () => {
    const { status } = await post({ studentCount: 100 });
    expect(status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
  });
});
