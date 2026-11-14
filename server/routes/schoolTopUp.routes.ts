import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { paymentLimiter } from "../middleware/rateLimiter.middleware";
import { countryPricing, quotePrice, minimumChargeMinor, formatMoney } from "@shared/pricing";
import { sendLicenceRequestToSuperadmins } from "../services/email";

/**
 * A SCHOOL BUYS MORE LICENCES (owner, 2026-11-14): two doors, one price.
 *
 *   - "Request invoice" creates a DRAFT invoice at the quoted price and emails
 *     the superadmin. Nothing reaches the school until a superadmin issues it,
 *     so the existing issue / send / mark-paid flow does the rest, and marking
 *     it paid is what grants the licences (storage.markInvoicePaid).
 *   - "Pay online" takes a card and grants on success, through the webhook or
 *     the browser's confirm call, whichever arrives first.
 *
 * THE PRICE IS THE TOP-UP ALONE (owner's decision): 50 more licences are
 * priced as an order of 50, whatever the school bought before.
 *
 * THE COUNTRY COMES FROM THE SCHOOL, never the request. This is the first
 * purchase path where the buyer is signed in, so the client-selected-country
 * gap described in CLAUDE.md does not exist here. A school with no country is
 * refused rather than charged the dollar fallback, the same rule as
 * COUNTRY_REQUIRED on the public checkout.
 *
 * SCHOOL ADMIN ONLY, and the school is derived from the session.
 */

let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-10-29.clover" });
}

export const TOP_UP_MAX = 10000;
const countSchema = z.number().int().min(1).max(TOP_UP_MAX);

type TopUpContext =
  | { ok: true; userId: string; adminName: string; org: any; quote: ReturnType<typeof quotePrice> }
  | { ok: false; status: number; body: { message: string; code: string } };

async function resolveTopUp(req: Request, licences: number): Promise<TopUpContext> {
  const userId = (req.user as any)?.userId;
  const user = userId ? await storage.getUser(userId) : undefined;
  if (!user || user.accountType !== "org_admin") {
    return { ok: false, status: 403, body: { message: "Only a school administrator can buy licences for a school.", code: "SCHOOL_ADMIN_ONLY" } };
  }
  const org = await storage.getOrganizationByAdminUserId(userId);
  if (!org) {
    return { ok: false, status: 404, body: { message: "School not found", code: "ORGANIZATION_NOT_FOUND" } };
  }
  if (org.isUnlimitedLicenses) {
    return { ok: false, status: 409, body: { message: "Your school has unlimited licences.", code: "UNLIMITED" } };
  }
  const country = org.countryId ? await storage.getCountryById(org.countryId) : null;
  if (!country) {
    return { ok: false, status: 409, body: { message: "Your school has no country set yet. Please contact support@futurepath.ae.", code: "COUNTRY_NOT_SET" } };
  }
  const pricing = countryPricing(country);
  // An unpriced country would fall back to the US-dollar default: a UAE school
  // quoted in dollars, about 8% under its own price. Refused, as an absent
  // country is on the public checkout (COUNTRY_REQUIRED).
  if (pricing.usedFallback) {
    return { ok: false, status: 409, body: { message: "Your school's country has no licence price yet. Please contact support@futurepath.ae.", code: "COUNTRY_NOT_PRICED" } };
  }
  const quote = quotePrice({ studentCount: licences, unitPriceMinor: pricing.unitPriceMinor, currency: pricing.currency });
  const adminName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.email || "School admin";
  return { ok: true, userId, adminName, org, quote };
}

function readCount(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  const parsed = countSchema.safeParse(n);
  return parsed.success ? parsed.data : null;
}

const INVALID_COUNT = {
  message: `Please choose between 1 and ${TOP_UP_MAX.toLocaleString("en")} licences.`,
  code: "INVALID_COUNT",
};

/**
 * Grants one paid top-up, from a PaymentIntent the caller has already
 * retrieved or received. Shared by the webhook and the confirm route so the
 * two cannot disagree about what a valid top-up payment is.
 *
 * Every check reads the intent Stripe holds, never anything the browser sent:
 * the kind, the school, the licence count and the amount were all written by
 * the server when the intent was created.
 */
export async function grantTopUpFromPaymentIntent(
  pi: Stripe.PaymentIntent,
): Promise<{ ok: true; granted: boolean } | { ok: false; reason: string }> {
  const md = pi.metadata ?? {};
  if (md.kind !== "school_topup") return { ok: false, reason: "not_a_topup" };
  if (pi.status !== "succeeded") return { ok: false, reason: "not_succeeded" };
  const licences = Number(md.studentCount);
  const expected = Number(md.expectedAmount);
  if (!md.organizationId || !Number.isInteger(licences) || licences < 1) {
    return { ok: false, reason: "bad_metadata" };
  }
  if (!Number.isFinite(expected) || pi.amount !== expected) {
    console.error(`[TopUp] Amount mismatch on ${pi.id}: expected ${md.expectedAmount}, got ${pi.amount}`);
    return { ok: false, reason: "amount_mismatch" };
  }
  const result = await storage.applySchoolTopUpPayment({
    organizationId: md.organizationId,
    licences,
    amountMinor: pi.amount,
    currency: (md.currency || pi.currency || "").toUpperCase(),
    stripePaymentId: pi.id,
    performedBy: md.userId || null,
  });
  if (!result.ok) {
    console.error(`[TopUp] Payment ${pi.id} not granted: ${result.reason}. Needs manual attention.`);
    return { ok: false, reason: result.reason };
  }
  return result;
}

export function registerSchoolTopUpRoutes(app: Express) {
  /** The price of N more licences for THIS school. Reads only. */
  app.get("/api/my-organization/licences/quote", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const licences = readCount(req.query.count);
      if (licences == null) return res.status(400).json(INVALID_COUNT);
      const ctx = await resolveTopUp(req, licences);
      if (!ctx.ok) return res.status(ctx.status).json(ctx.body);
      const q = ctx.quote;
      return res.json({
        licences,
        currency: q.currency,
        perStudentMinor: q.perStudentMinor,
        discountPercent: q.discountPercent,
        totalMinor: q.totalMinor,
        totalLabel: formatMoney(q.totalMinor, q.currency),
        perStudentLabel: formatMoney(q.perStudentMinor, q.currency),
        // So the button can say "test mode" without the client guessing.
        cardPaymentsAvailable: !!stripe,
      });
    } catch (error) {
      console.error("[TopUp] quote failed:", error);
      return res.status(500).json({ message: "Could not price that order." });
    }
  });

  /**
   * REQUEST AN INVOICE. One open request at a time: a school with a draft
   * already waiting is told so rather than given a second draft, which would
   * leave the superadmin with two bills for one order.
   */
  app.post("/api/my-organization/licences/request", isAuthenticated, paymentLimiter, async (req: Request, res: Response) => {
    try {
      const licences = readCount(req.body?.count);
      if (licences == null) return res.status(400).json(INVALID_COUNT);
      const poRaw = typeof req.body?.purchaseOrderRef === "string" ? req.body.purchaseOrderRef.trim() : "";
      if (poRaw.length > 100) {
        return res.status(400).json({ message: "The PO reference is too long (100 characters at most).", code: "PO_TOO_LONG" });
      }
      const ctx = await resolveTopUp(req, licences);
      if (!ctx.ok) return res.status(ctx.status).json(ctx.body);

      const drafts = await storage.listInvoices({ organizationId: ctx.org.id, status: "draft" });
      if (drafts.length > 0) {
        return res.status(409).json({
          message: "You already have a request waiting. We will email your invoice shortly.",
          code: "REQUEST_PENDING",
        });
      }

      const invoice = await storage.createInvoice({
        organizationId: ctx.org.id,
        billToName: ctx.org.name,
        billToEmail: null,
        billToAddress: null,
        studentCount: licences,
        unitPriceMinor: ctx.quote.unitPriceMinor,
        currency: ctx.quote.currency,
        vatRateBp: 0,
        supplierTrn: null,
        dueAt: null,
        notes: `Requested by the school (${ctx.adminName}).`,
        purchaseOrderRef: poRaw || null,
        createdBy: ctx.userId,
      });

      await sendLicenceRequestToSuperadmins({
        to: await storage.getSuperadminNotificationAddresses(),
        schoolName: ctx.org.name,
        requestedBy: ctx.adminName,
        licences,
        amountLabel: formatMoney(invoice.totalMinor, invoice.currency),
        invoiceNumber: invoice.number,
        purchaseOrderRef: poRaw || null,
      });

      // The draft's number is not returned: a draft is not the school's
      // document until it is issued (the school's invoice list hides drafts).
      return res.status(201).json({ requested: true, licences });
    } catch (error) {
      console.error("[TopUp] request failed:", error);
      return res.status(500).json({ message: "Could not send your request. Please try again." });
    }
  });

  /** PAY ONLINE: creates the PaymentIntent. Nothing is granted here. */
  app.post("/api/my-organization/licences/payment-intent", isAuthenticated, paymentLimiter, async (req: Request, res: Response) => {
    if (!stripe) {
      return res.status(503).json({ message: "Online payment is not available. Please request an invoice instead.", code: "PAYMENTS_UNAVAILABLE" });
    }
    try {
      const licences = readCount(req.body?.count);
      if (licences == null) return res.status(400).json(INVALID_COUNT);
      const ctx = await resolveTopUp(req, licences);
      if (!ctx.ok) return res.status(ctx.status).json(ctx.body);
      const amount = ctx.quote.totalMinor;
      if (amount < minimumChargeMinor(ctx.quote.currency)) {
        return res.status(400).json({ message: "That order is below the minimum card payment.", code: "BELOW_MINIMUM" });
      }
      const pi = await stripe.paymentIntents.create({
        amount,
        currency: ctx.quote.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          // `kind` is what routes this away from the first-purchase handler,
          // which would otherwise read `userId` and treat it as an individual.
          kind: "school_topup",
          organizationId: ctx.org.id,
          userId: ctx.userId,
          studentCount: String(licences),
          expectedAmount: String(amount),
          currency: ctx.quote.currency,
        },
      });
      return res.json({
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        totalMinor: amount,
        currency: ctx.quote.currency,
        totalLabel: formatMoney(amount, ctx.quote.currency),
      });
    } catch (error) {
      console.error("[TopUp] payment intent failed:", error);
      return res.status(500).json({ message: "Payment could not be started. Please try again." });
    }
  });

  /**
   * THE BROWSER'S HALF of the grant, called after the card clears. The
   * webhook does the same; the unique index decides which one adds the
   * licences, and the other adds nothing.
   */
  app.post("/api/my-organization/licences/confirm", isAuthenticated, paymentLimiter, async (req: Request, res: Response) => {
    if (!stripe) return res.status(503).json({ message: "Online payment is not available.", code: "PAYMENTS_UNAVAILABLE" });
    try {
      const id = typeof req.body?.paymentIntentId === "string" ? req.body.paymentIntentId : "";
      if (!/^pi_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ message: "Invalid payment", code: "INVALID_PAYMENT" });
      const userId = (req.user as any)?.userId;
      const user = userId ? await storage.getUser(userId) : undefined;
      if (!user || user.accountType !== "org_admin") {
        return res.status(403).json({ message: "Access denied: School admin only", code: "SCHOOL_ADMIN_ONLY" });
      }
      const org = await storage.getOrganizationByAdminUserId(userId);
      if (!org) return res.status(404).json({ message: "School not found", code: "ORGANIZATION_NOT_FOUND" });

      const pi = await stripe.paymentIntents.retrieve(id);
      // Another school's payment answers like a missing one.
      if (pi.metadata?.kind !== "school_topup" || pi.metadata?.organizationId !== org.id) {
        return res.status(404).json({ message: "Payment not found", code: "PAYMENT_NOT_FOUND" });
      }
      const result = await grantTopUpFromPaymentIntent(pi);
      if (!result.ok) {
        const status = result.reason === "not_succeeded" ? 409 : 500;
        return res.status(status).json({ message: "Payment not completed", code: result.reason.toUpperCase() });
      }
      const fresh = await storage.getOrganizationById(org.id);
      return res.json({ ok: true, licences: Number(pi.metadata.studentCount), totalLicenses: fresh?.totalLicenses ?? null });
    } catch (error) {
      console.error("[TopUp] confirm failed:", error);
      return res.status(500).json({ message: "We could not confirm the payment. If you were charged, your licences will appear shortly." });
    }
  });
}
