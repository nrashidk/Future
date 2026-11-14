/**
 * A school buys more licences: the request-invoice and pay-online doors.
 * Stripe and storage are mocked; the route logic is what is under test.
 * The grant itself (unique index, one transaction) is exercised against a
 * real database by testing/local/school-topup.mjs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { quotePrice } from "@shared/pricing";

process.env.STRIPE_SECRET_KEY = "sk_test_stub";

const piCreate = vi.fn();
const piRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { create: (...a: any[]) => piCreate(...a), retrieve: (...a: any[]) => piRetrieve(...a) };
  },
}));

const users: Record<string, any> = {
  admin: { id: "admin", accountType: "org_admin", firstName: "Sara", lastName: "Admin" },
  admin2: { id: "admin2", accountType: "org_admin", firstName: "Other", lastName: "Admin" },
  student: { id: "student", accountType: "org_student" },
  nocountry: { id: "nocountry", accountType: "org_admin" },
  unpriced: { id: "unpriced", accountType: "org_admin" },
};
const orgs: Record<string, any> = {
  admin: { id: "org-a", name: "School A", countryId: "uae", isUnlimitedLicenses: false, totalLicenses: 50 },
  admin2: { id: "org-b", name: "School B", countryId: "uae", isUnlimitedLicenses: false, totalLicenses: 10 },
  nocountry: { id: "org-c", name: "School C", countryId: null, isUnlimitedLicenses: false },
  unpriced: { id: "org-d", name: "School D", countryId: "xx", isUnlimitedLicenses: false },
};
let drafts: any[] = [];
const createInvoice = vi.fn(async (p: any) => ({ number: "FP-2026-0099", totalMinor: quotePrice({ studentCount: p.studentCount, unitPriceMinor: p.unitPriceMinor, currency: p.currency }).totalMinor, currency: p.currency, ...p }));
const applySchoolTopUpPayment = vi.fn(async () => ({ ok: true, granted: true }));
const sendLicenceRequestToSuperadmins = vi.fn(async () => undefined);

vi.mock("../storage", () => ({
  storage: {
    getUser: async (id: string) => users[id],
    getOrganizationByAdminUserId: async (id: string) => orgs[id],
    getOrganizationById: async (id: string) => Object.values(orgs).find((o) => o.id === id),
    getCountryById: async (id: string) =>
      id === "uae" ? { id: "uae", licensePriceMinor: 4000, licenseCurrency: "AED" } : id === "xx" ? { id: "xx", licensePriceMinor: null, licenseCurrency: null } : undefined,
    listInvoices: async () => drafts,
    createInvoice: (p: any) => createInvoice(p),
    applySchoolTopUpPayment: (p: any) => applySchoolTopUpPayment(p),
    getSuperadminNotificationAddresses: async () => ["owner@example.test"],
  },
}));
vi.mock("../services/email", () => ({ sendLicenceRequestToSuperadmins: (p: any) => sendLicenceRequestToSuperadmins(p) }));
vi.mock("../middleware/rateLimiter.middleware", () => ({ paymentLimiter: (_q: any, _s: any, n: any) => n() }));

const { registerSchoolTopUpRoutes, grantTopUpFromPaymentIntent } = await import("./schoolTopUp.routes");

let who: string | null = "admin";
async function call(method: string, path: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _r, next) => {
    req.isAuthenticated = () => !!who;
    req.user = who ? { userId: who } : undefined;
    next();
  });
  registerSchoolTopUpRoutes(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

const UAE50 = quotePrice({ studentCount: 50, unitPriceMinor: 4000, currency: "AED" });

beforeEach(() => {
  who = "admin";
  drafts = [];
  piCreate.mockReset().mockResolvedValue({ id: "pi_new", client_secret: "cs" });
  piRetrieve.mockReset();
  createInvoice.mockClear();
  applySchoolTopUpPayment.mockClear();
  sendLicenceRequestToSuperadmins.mockClear();
});

describe("quote", () => {
  it("prices the top-up quantity alone, in the school's own currency", async () => {
    const r = await call("GET", "/api/my-organization/licences/quote?count=50");
    expect(r.status).toBe(200);
    expect(r.body.currency).toBe("AED");
    expect(r.body.totalMinor).toBe(UAE50.totalMinor);
    expect(r.body.discountPercent).toBe(UAE50.discountPercent);
  });
  it("refuses a student, and a count out of range", async () => {
    who = "student";
    expect((await call("GET", "/api/my-organization/licences/quote?count=5")).status).toBe(403);
    who = "admin";
    expect((await call("GET", "/api/my-organization/licences/quote?count=0")).status).toBe(400);
    expect((await call("GET", "/api/my-organization/licences/quote?count=2.5")).status).toBe(400);
  });
  it("refuses a school with no country rather than quoting dollars", async () => {
    who = "nocountry";
    const r = await call("GET", "/api/my-organization/licences/quote?count=5");
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("COUNTRY_NOT_SET");
  });
});

describe("unpriced country", () => {
  it("is refused, never quoted the US-dollar fallback", async () => {
    who = "unpriced";
    const q = await call("GET", "/api/my-organization/licences/quote?count=5");
    expect(q.status).toBe(409);
    expect(q.body.code).toBe("COUNTRY_NOT_PRICED");
    const r = await call("POST", "/api/my-organization/licences/payment-intent", { count: 5 });
    expect(r.status).toBe(409);
    expect(piCreate).not.toHaveBeenCalled();
  });
});

describe("request invoice", () => {
  it("creates a DRAFT for the requester's own school at the quoted price and emails the superadmin", async () => {
    const r = await call("POST", "/api/my-organization/licences/request", { count: 50, purchaseOrderRef: " PO-77 " });
    expect(r.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(1);
    const p = createInvoice.mock.calls[0][0];
    expect(p.organizationId).toBe("org-a");
    expect(p.studentCount).toBe(50);
    expect(p.unitPriceMinor).toBe(4000);
    expect(p.currency).toBe("AED");
    expect(p.purchaseOrderRef).toBe("PO-77");
    expect(p.vatRateBp).toBe(0);
    expect(p.supplierTrn).toBeNull();
    expect(sendLicenceRequestToSuperadmins).toHaveBeenCalledTimes(1);
    expect((sendLicenceRequestToSuperadmins.mock.calls[0] as any)[0].schoolName).toBe("School A");
  });
  it("refuses a second request while a draft is waiting (control: nothing created)", async () => {
    drafts = [{ id: "d1" }];
    const r = await call("POST", "/api/my-organization/licences/request", { count: 5 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("REQUEST_PENDING");
    expect(createInvoice).not.toHaveBeenCalled();
  });
  it("refuses a student", async () => {
    who = "student";
    expect((await call("POST", "/api/my-organization/licences/request", { count: 5 })).status).toBe(403);
    expect(createInvoice).not.toHaveBeenCalled();
  });
});

describe("pay online", () => {
  it("creates the intent with server-derived school, count and amount", async () => {
    const r = await call("POST", "/api/my-organization/licences/payment-intent", { count: 50, organizationId: "org-b" });
    expect(r.status).toBe(200);
    const args = piCreate.mock.calls[0][0];
    expect(args.amount).toBe(UAE50.totalMinor);
    expect(args.currency).toBe("aed");
    expect(args.metadata.kind).toBe("school_topup");
    expect(args.metadata.organizationId).toBe("org-a"); // never the body's org-b
    expect(args.metadata.studentCount).toBe("50");
    expect(args.metadata.expectedAmount).toBe(String(UAE50.totalMinor));
  });

  const paid = (over: any = {}) => ({
    id: "pi_ok",
    status: "succeeded",
    amount: UAE50.totalMinor,
    currency: "aed",
    metadata: { kind: "school_topup", organizationId: "org-a", userId: "admin", studentCount: "50", expectedAmount: String(UAE50.totalMinor), currency: "AED" },
    ...over,
  });

  it("confirm grants for the school's own paid intent", async () => {
    piRetrieve.mockResolvedValue(paid());
    const r = await call("POST", "/api/my-organization/licences/confirm", { paymentIntentId: "pi_ok" });
    expect(r.status).toBe(200);
    expect(applySchoolTopUpPayment).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", licences: 50, stripePaymentId: "pi_ok", amountMinor: UAE50.totalMinor }));
  });
  it("confirm refuses ANOTHER school's payment, answered like a missing one", async () => {
    who = "admin2";
    piRetrieve.mockResolvedValue(paid());
    const r = await call("POST", "/api/my-organization/licences/confirm", { paymentIntentId: "pi_ok" });
    expect(r.status).toBe(404);
    expect(applySchoolTopUpPayment).not.toHaveBeenCalled();
  });
  it("confirm grants nothing for an unpaid intent", async () => {
    piRetrieve.mockResolvedValue(paid({ status: "requires_payment_method" }));
    const r = await call("POST", "/api/my-organization/licences/confirm", { paymentIntentId: "pi_ok" });
    expect(r.status).toBe(409);
    expect(applySchoolTopUpPayment).not.toHaveBeenCalled();
  });
});

describe("grantTopUpFromPaymentIntent (shared by webhook and confirm)", () => {
  const base: any = {
    id: "pi_x", status: "succeeded", amount: 1000, currency: "aed",
    metadata: { kind: "school_topup", organizationId: "org-a", studentCount: "1", expectedAmount: "1000", currency: "AED" },
  };
  it("refuses an amount that is not the one the server priced", async () => {
    const r = await grantTopUpFromPaymentIntent({ ...base, amount: 1 });
    expect(r).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(applySchoolTopUpPayment).not.toHaveBeenCalled();
  });
  it("ignores an intent that is not a top-up", async () => {
    const r = await grantTopUpFromPaymentIntent({ ...base, metadata: { ...base.metadata, kind: undefined } });
    expect(r).toEqual({ ok: false, reason: "not_a_topup" });
  });
  it("grants a valid one (control)", async () => {
    const r = await grantTopUpFromPaymentIntent(base);
    expect(r).toEqual({ ok: true, granted: true });
  });
});
