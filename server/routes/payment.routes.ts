import type { Express } from "express";
import { storage, emailIsReserved } from "../storage";
import { isAuthenticated } from "../auth";
import { paymentLimiter, stampBuyerLimiter } from "../middleware/rateLimiter.middleware";
import { grantIndividualPremium } from "../services/premiumGrant";
import { sendSchoolSetupInvite } from "../services/schoolSetupInvite";
import { toPublicUser } from "@shared/userPublic";
import { quotePrice, minimumChargeMinor, formatMoney, toMajor, countryPricing } from "@shared/pricing";
import Stripe from "stripe";

// Initialize Stripe only if keys are configured
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-10-29.clover",
  });
}

export function registerPaymentRoutes(app: Express) {
  // Create payment intent for premium assessment
  app.post("/api/create-payment-intent", paymentLimiter, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ 
        message: "Payment system not configured. Please add STRIPE_SECRET_KEY to your environment." 
      });
    }

    try {
      // SECURITY FIX: Ignore client-provided amount, calculate server-side.
      // The COUNTRY is accepted — a group buyer has no account yet, so there
      // is nothing on the server to derive it from — but it only ever selects
      // a row; the price itself is never taken from the request.
      const { studentCount = 1, countryId } = req.body;

      // Validate student count
      if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > 100000) {
        return res.status(400).json({ message: "Invalid student count. Must be between 1 and 100,000" });
      }

      /**
       * THE ACTUAL ENFORCEMENT OF "the self-pay route is parent-registers-only"
       * (docs/parent-registers-scoping.md) — HERE, not in /api/checkout/complete.
       * That endpoint runs AFTER Stripe has already charged the card; refusing
       * there would take a customer's money and hand back neither an account
       * nor a refund. This runs BEFORE any charge exists, so refusing here
       * costs nothing — no PaymentIntent is created, so there is nothing for
       * /api/checkout/complete or the webhook backstop to ever complete.
       *
       * studentCount === 1 ONLY. studentCount > 1 is the institutional/
       * group-purchase path (GroupPricing.tsx) — unauthenticated by design,
       * and never part of this decision's scope; it still creates its
       * account-then-organization the old way, unchanged.
       *
       * Client-side, Checkout.tsx redirects to /register/parent before ever
       * reaching this call, for the normal navigation case. This guard is
       * what makes that non-optional: a direct POST here, or a saved
       * /checkout?students=1 bookmark from before this shipped, is refused
       * identically.
       */
      if (studentCount === 1 && !req.isAuthenticated()) {
        return res.status(401).json({
          message: "Please register first to create your account before paying.",
          code: "REGISTRATION_REQUIRED",
        });
      }

      /**
       * SERVER-SIDE PRICING, from shared/pricing.ts.
       *
       * The tiers used to be written out here AND again by hand in
       * client/src/pages/GroupPricing.tsx. They agreed, which is the dangerous
       * state rather than the safe one: the page quotes one price, this charges
       * another, and nothing fails. Both now read the same module.
       */
      /**
       * THE PRICE COMES FROM THE COUNTRY ROW, never from the request.
       *
       * The buyer names a country; the server reads that country's price. A
       * client that sends a price, a currency or an amount is ignored.
       *
       * An UNKNOWN country is refused rather than quietly charged in dollars.
       * Silently falling back would mean a typo in a country id sells a UAE
       * school a dollar licence and tells nobody — the
       * accepted-at-creation-broken-for-ever shape. A country that simply has
       * no price set is different and DOES fall back, because refusing there
       * would block every sale in a country nobody has priced yet.
       */
      let country = null;
      if (countryId) {
        country = await storage.getCountryById(String(countryId));
        if (!country) {
          return res.status(400).json({
            message: "Unknown country. Please choose your country again.",
            code: "UNKNOWN_COUNTRY",
          });
        }
      }

      const { unitPriceMinor, currency, usedFallback } = countryPricing(country);
      if (usedFallback && country) {
        // Visible rather than silent: a live country transacting in dollars is
        // otherwise only discovered by reading a receipt.
        console.warn(
          `[Pricing] Country ${country.id} has no licence price set; charging the ${currency} default.`,
        );
      }

      const quote = quotePrice({ studentCount, unitPriceMinor, currency });
      const amountInMinor = quote.totalMinor;

      /**
       * The minimum is PER CURRENCY. The old check was `< 50` with the message
       * "Minimum is $0.50 USD", which against a dirham price is 0.50 AED — an
       * amount this would pass and Stripe would then refuse, turning a clear
       * message into a payment-provider error after the card was filled in.
       */
      if (amountInMinor < minimumChargeMinor(quote.currency)) {
        return res.status(400).json({
          message: `Invalid amount. Minimum is ${formatMoney(minimumChargeMinor(quote.currency), quote.currency)}`,
        });
      }

      // Get userId - works for both OAuth and local users
      const userId = req.isAuthenticated() 
        ? (req.user.userId) 
        : "guest";

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInMinor,
        // Lower case: Stripe wants the code lower cased, while everything
        // stored and reported uses upper case.
        currency: quote.currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          userId,
          studentCount: studentCount.toString(),
          expectedAmount: amountInMinor.toString(),
          // The currency is stamped too. Without it, a later backstop reading
          // this metadata has an amount and no idea what money it is in.
          currency: quote.currency,
          // Stamped so a backstop completing from metadata alone knows which
          // country's price was paid, not just how much.
          countryId: country?.id ?? "",
          assessmentType: "premium"
        }
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        // Kept in MAJOR units under the same name the client already reads, so
        // this change does not move the displayed figure.
        amount: toMajor(amountInMinor, quote.currency),
        // New, so the client can stop assuming dollars.
        amountMinor: amountInMinor,
        currency: quote.currency,
        studentCount,
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Payment processing failed. Please try again." });
    }
  });

  // Stamp buyer identity into the PaymentIntent metadata before confirmation.
  // If /api/checkout/complete never runs (tab closed, network drop), a later
  // backstop can still complete the grant from metadata alone.
  // Deliberately NOT under paymentLimiter: this is a metadata update on an
  // already-created intent, not a money operation. Sharing the payment budget
  // would let repeated card declines exhaust it and reject a real
  // /api/checkout/complete after the card was already charged.
  // stampBuyerLimiter is a light abuse guard only - it keeps this unauthenticated
  // endpoint from being used to burn Stripe API quota.
  /**
   * ELIGIBILITY, DECIDED BEFORE THE CARD IS CHARGED.
   *
   * /api/checkout/complete has two refusals that only run once Stripe has
   * already taken the money:
   *
   *   1. an email belonging to an OAuth account with no password -> 400
   *      "login first" (the `!existingUser.passwordHash` branch below)
   *   2. a buyer who already owns a school -> 409, because
   *      createGroupPurchaseTransaction refuses to give one user a second
   *      organization
   *
   * Both are correct refusals at the wrong moment. The charge has succeeded by
   * the time either fires — PaymentIntent status and amount are verified at the
   * top of /complete — so the buyer is charged, granted nothing, and told to go
   * away. For a group purchase that is a school-sized amount of money.
   *
   * This is the same mistake, and the same fix, as the studentCount === 1 guard
   * in /api/create-payment-intent above, which says it outright: refusing after
   * the charge "would take a customer's money and hand back neither an account
   * nor a refund". That one had no email to check at intent-creation time. This
   * one does, because the client has the form filled in before it confirms.
   *
   * SCOPE: this refuses exactly what /complete refuses and NOTHING more. An
   * existing local account without an organization still buys without logging
   * in, because /complete still serves it. Widening this into "any known email
   * must log in" would be a new product rule, not a bug fix.
   *
   * NOT A SECURITY CONTROL. The client can skip this call and confirm the card
   * anyway, so the refusals in /complete stay exactly where they are as the
   * backstop. This spares an honest buyer a charge they cannot use; it is not
   * load-bearing against an attacker.
   *
   * It deliberately calls no Stripe API: there is no PaymentIntent to consult
   * yet, and keeping it to database reads is what makes it testable offline.
   * It writes nothing.
   *
   * DISCLOSURE ACCEPTED: answering this to an unauthenticated caller confirms
   * an account exists for an email, and distinguishes an SSO account from a
   * local one. Existence is already free to discover — parent registration
   * answers "An account with this email already exists" to anyone
   * (parentRegistration.routes.ts) — so this adds the auth method and nothing
   * else, which is worth a school not being charged for nothing.
   */
  app.post("/api/checkout/preflight", stampBuyerLimiter, async (req: any, res) => {
    try {
      const { email, studentCount } = req.body || {};

      const normalizedEmail =
        typeof email === "string" ? email.trim().toLowerCase() : "";
      if (!normalizedEmail) {
        return res.status(400).json({ message: "Invalid request" });
      }

      // Floor, never round: this only ever selects a branch, but a fractional
      // count must not read as a group purchase by rounding up.
      const rawCount = Number(studentCount);
      const count = Number.isFinite(rawCount)
        ? Math.max(0, Math.floor(rawCount))
        : 0;
      const isGroupPurchase = count > 1;

      /**
       * An authenticated buyer is NOT exempt. /complete's logged-in branch
       * skips the OAuth refusal — it never looks at passwordHash — but it still
       * calls createGroupPurchaseTransaction, so a school owner buying a second
       * time is charged and then met with the 409 like anybody else. Their own
       * id is the right thing to check here; the typed email is not necessarily
       * theirs.
       */
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        const userId = (req.user as any).userId;
        if (isGroupPurchase) {
          const owned = await storage.getOrganizationOwnedByUser(userId);
          if (owned) {
            return res.json({
              ok: false,
              code: "ORG_EXISTS",
              organizationName: owned.name,
            });
          }
        }
        return res.json({ ok: true });
      }

      const existingUser = await storage.getUserByEmail(normalizedEmail);

      // A reserved address held by nobody: /complete would create the account
      // and storage refuses to (assertEmailNotReserved) -- after the card had
      // cleared. Stopped here, before any charge, with the answer that sends
      // the buyer to sign in.
      if (!existingUser && emailIsReserved(normalizedEmail)) {
        return res.json({ ok: false, code: "LOGIN_REQUIRED" });
      }

      // A brand-new email is the path /complete handles best — it creates the
      // account. Nothing to refuse.
      if (!existingUser) {
        return res.json({ ok: true });
      }

      // Mirrors /complete's `!existingUser.passwordHash` branch. An account
      // created through Google or Microsoft has no password to check, so
      // self-service checkout cannot verify the buyer is its owner.
      if (!existingUser.passwordHash) {
        return res.json({ ok: false, code: "LOGIN_REQUIRED" });
      }

      if (isGroupPurchase) {
        const owned = await storage.getOrganizationOwnedByUser(existingUser.id);
        if (owned) {
          return res.json({
            ok: false,
            code: "ORG_EXISTS",
            organizationName: owned.name,
          });
        }
      }

      res.json({ ok: true });
    } catch (error: any) {
      console.error("Checkout preflight failed:", error);
      /**
       * FAILS OPEN, ON PURPOSE. This endpoint only ever spares a buyer a
       * useless charge; it guards nothing. If it breaks, the right outcome is
       * the behaviour we have today — the buyer proceeds and /complete decides
       * — not a blocked checkout for everyone because a database read failed.
       */
      res.status(503).json({ message: "Eligibility check unavailable" });
    }
  });

  app.post("/api/checkout/stamp-buyer", stampBuyerLimiter, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({
        message: "Payment system not configured. Please add STRIPE_SECRET_KEY to your environment."
      });
    }

    try {
      const { paymentIntentId, buyerEmail, buyerName, buyerPhone, organizationName } = req.body || {};

      if (typeof paymentIntentId !== "string" || !paymentIntentId) {
        return res.status(400).json({ message: "Invalid request" });
      }

      // Reuse the existing intent - never create a new one here
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      // Buyer identity is immutable once the payment landed or the grant ran
      if (paymentIntent.status === "succeeded" || paymentIntent.metadata?.processed === "true") {
        return res.status(409).json({ message: "Payment already completed" });
      }

      // Guest-safe: no auth required. But a logged-in user may only stamp their
      // own intent, or one created while they were browsing as a guest.
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        const userId = (req.user as any).userId;
        const intentUserId = paymentIntent.metadata?.userId;
        if (intentUserId !== userId && intentUserId !== "guest") {
          return res.status(403).json({ message: "Payment does not belong to this user" });
        }
      }

      // Drop empty values, cap each at 500 chars (Stripe metadata value limit)
      const clean = (value: unknown) =>
        typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;

      const stamped: Record<string, string> = {};
      const email = clean(buyerEmail);
      const name = clean(buyerName);
      const phone = clean(buyerPhone);
      // Group purchases only. This CANNOT be stamped at intent creation: the
      // intent is created on page mount from the ?students=N URL param alone,
      // before the form renders, so the buyer has not typed an organisation
      // name yet. It reaches the server for the first time at
      // /api/checkout/complete - too late to help if that call never lands.
      // Stamping it here (after the field is filled, before confirmation) is
      // what makes a dropped group checkout reconcilable at all: without it,
      // metadata carries studentCount > 1 with no way to rebuild the org.
      const orgName = clean(organizationName);
      if (email) stamped.buyerEmail = email;
      if (name) stamped.buyerName = name;
      if (phone) stamped.buyerPhone = phone;
      if (orgName) stamped.organizationName = orgName;

      if (Object.keys(stamped).length === 0) {
        return res.status(400).json({ message: "No buyer details provided" });
      }

      // MERGE, do not clobber: existing metadata first so userId, assessmentType,
      // studentCount, expectedAmount and processed all survive the update.
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: { ...paymentIntent.metadata, ...stamped }
      });

      // This endpoint records identity only - it grants nothing.
      res.json({ success: true, stamped: Object.keys(stamped) });
    } catch (error: any) {
      console.error("Error stamping buyer identity:", error);
      res.status(500).json({ message: "Failed to record buyer details" });
    }
  });

  // Mark user as premium after successful payment
  app.post("/api/upgrade-to-premium", isAuthenticated, paymentLimiter, async (req: any, res) => {

    try {
      const { paymentIntentId } = req.body;

      if (!stripe || !paymentIntentId) {
        return res.status(400).json({ message: "Invalid request" });
      }

      // SECURITY FIX: Verify payment was successful AND amount is correct
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({ message: "Payment not completed" });
      }

      // Get userId - works for both OAuth and local users
      const userId = req.user.userId;
      
      // Verify user matches the payment metadata
      if (paymentIntent.metadata.userId !== userId) {
        return res.status(403).json({ message: "Payment does not belong to this user" });
      }

      // Validate payment amount matches expected amount
      const expectedAmount = paymentIntent.metadata.expectedAmount;
      if (!expectedAmount || paymentIntent.amount !== parseInt(expectedAmount)) {
        console.error(`Payment amount mismatch: expected ${expectedAmount}, got ${paymentIntent.amount}`);
        return res.status(400).json({ message: "Payment amount verification failed" });
      }

      // Prevent duplicate premium upgrades
      const existingUser = await storage.getUser(userId);
      if (existingUser && existingUser.isPremium) {
        return res.json({ success: true, user: toPublicUser(existingUser), message: "Already premium" });
      }

      // Update user to premium
      const updatedUser = await storage.updateUserPremiumStatus(
        userId,
        paymentIntent.customer as string || null
      );

      res.json({ success: true, user: toPublicUser(updatedUser) });
    } catch (error: any) {
      console.error("Error upgrading user:", error);
      res.status(500).json({ message: "Failed to upgrade account" });
    }
  });

  // Complete self-service checkout: Create account + allocate licenses
  app.post("/api/checkout/complete", paymentLimiter, async (req: any, res) => {
    try {
      const { paymentIntentId, firstName, lastName, email, phone, organizationName, studentCount } = req.body;

      if (!stripe || !paymentIntentId || !firstName || !lastName || !email || !phone || !studentCount) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Verify payment with Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({ message: "Payment not completed" });
      }

      // Validate payment amount matches expected amount
      const expectedAmount = paymentIntent.metadata.expectedAmount;
      if (!expectedAmount || paymentIntent.amount !== parseInt(expectedAmount)) {
        console.error(`Payment amount mismatch: expected ${expectedAmount}, got ${paymentIntent.amount}`);
        return res.status(400).json({ message: "Payment amount verification failed" });
      }

      // IDEMPOTENCY CHECK: Prevent double-processing of same payment
      if (paymentIntent.metadata.processed === "true") {
        console.log(`Payment ${paymentIntentId} already processed, returning success`);
        return res.status(200).json({
          success: true,
          message: "Payment already processed",
          alreadyProcessed: true
        });
      }

      // PRIORITY: Check if user is already logged in - upgrade their account
      let user: any;
      let password: string | null = null;
      let username: string;
      let isNewUser = false;
      /**
       * True when the Stripe webhook created this buyer's account before
       * /api/checkout/complete could. The purchase succeeded, but the password
       * was generated by the webhook and shown to nobody, so "please log in" is
       * a door this buyer has no key to — they must use password reset.
       */
      let racedWithBackstop = false;
      let wasLoggedIn = false;
      
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        wasLoggedIn = true;
        // User is logged in - upgrade their existing account
        const loggedInUserId = (req.user as any).userId;
        user = await storage.getUser(loggedInUserId);
        
        if (!user) {
          return res.status(400).json({ message: "Logged in user not found" });
        }
        
        // Update logged-in user's account
        user = await storage.updateUserFields(user.id, {
          phone,
          isPremium: true,
          purchasedLicenses: studentCount,
          stripeCustomerId: paymentIntent.customer as string || user.stripeCustomerId
        });
        username = user.username || user.email || 'user';
        isNewUser = false;
      } else if (studentCount === 1) {
        /**
         * REFUSED, NOT RATE-LIMITED. This branch used to create a brand-new
         * account here via grantIndividualPremium — the exact behaviour
         * docs/parent-registers-scoping.md's decision replaces. It is no
         * longer needed, not just discouraged: /api/create-payment-intent
         * now refuses to create a PaymentIntent for studentCount === 1
         * unless the caller was already authenticated, so a valid,
         * succeeded intent with studentCount === 1 cannot exist unless this
         * caller was logged in when it was created. Reaching here
         * unauthenticated means the session that created it is gone —
         * a deliberate logout mid-checkout, cleared cookies, or a switch of
         * device — not a flow this product has, and creating (or silently
         * upgrading) an account here would recreate the exact bypass this
         * guard exists to close: an individual account with no child
         * profile and no consent record, indistinguishable from the
         * pre-decision self-pay path.
         *
         * The payment has very likely already succeeded by the time this
         * runs (Stripe confirmation already happened client-side), so this
         * is refused rather than silently retried as a new purchase: telling
         * the caller to log back in is the honest next step for someone who
         * is still that same authenticated party, and anyone who is not
         * needs a human, not another silent account.
         */
        return res.status(401).json({
          message: "Your session ended before this purchase could be completed. Please log in and try again; if you were charged, contact support with this payment reference.",
          code: "SESSION_REQUIRED",
          paymentIntentId,
        });
      } else {
        // User not logged in - check if email already exists
        const existingUser = await storage.getUserByEmail(email);

        if (!existingUser) {
          // New buyer - grant via the shared helper so this path and the webhook
          // backstop create accounts identically. studentCount > 1 only, now
          // that studentCount === 1 is refused above — this is the
          // institutional/group-purchase path (GroupPricing.tsx),
          // unauthenticated by design and never part of the parent-registers
          // decision's scope.
          const grant = await grantIndividualPremium({
            email,
            firstName,
            lastName,
            phone,
            studentCount,
            stripeCustomerId: paymentIntent.customer as string || null
          });

          if (grant.status === "granted" && grant.credentials) {
            user = grant.user;
            username = grant.credentials.username;
            password = grant.credentials.password; // Only set for new users
            isNewUser = true;
          } else if (grant.status === "already_premium") {
            /**
             * THE WEBHOOK GOT HERE FIRST, and that is a SUCCESS, not a
             * conflict. This threw until 2026-11-09, and the throw became a
             * 500 telling a buyer whose card had been charged that checkout
             * had failed — inviting a retry that would charge them again.
             *
             * Stripe calls the webhook the moment the card clears while the
             * browser still has to round-trip, so the webhook usually wins. It
             * already created the account and granted the full studentCount.
             *
             * Nothing is granted again here. The licence figure is deliberately
             * NOT touched: the winner set it, and the existing-user branch
             * below increments, so routing a raced buyer through it would hand
             * out double what they paid for.
             *
             * Execution continues to the group block, which then either creates
             * the school or ADOPTS the one the webhook's own group backstop
             * already created for this payment. An earlier version of this
             * comment said the webhook "is individual-only and makes no
             * organization" — true when written, made false hours later by the
             * backstop commit, and that stale sentence is why the group block
             * below answered a succeeded purchase with a 409. See the note
             * there.
             */
            user = grant.user;
            username = grant.user.username || grant.user.email || "user";
            isNewUser = false;
            racedWithBackstop = true;
          } else if (grant.status === "skipped_oauth") {
            // An OAuth account appeared under this email mid-flight. Answer the
            // same way as the OAuth branch below rather than throwing a 500 —
            // the preflight refuses these before the charge, so reaching here
            // means the account was created during checkout.
            return res.status(400).json({
              message: "This email is already registered. Please login first, then purchase from your account dashboard.",
              code: "LOGIN_REQUIRED",
              paymentIntentId,
            });
          } else {
            throw new Error(`Unexpected grant result for new buyer: ${grant.status}`);
          }
        } else {
          // Existing user - check if they're OAuth or local
          if (!existingUser.passwordHash) {
            // OAuth user - cannot use self-service checkout without login
            return res.status(400).json({
              message: "This email is already registered. Please login first, then purchase from your account dashboard."
            });
          }

          // Update existing local user (increment licenses)
          user = await storage.updateUserFields(existingUser.id, {
            phone,
            isPremium: true,
            purchasedLicenses: studentCount, // This will be incremented
            stripeCustomerId: paymentIntent.customer as string || existingUser.stripeCustomerId
          });
          username = existingUser.username!;
          isNewUser = false;
        }
      }

      // Handle group purchases: Atomically promote user and create organization
      let organization = null;
      if (studentCount > 1 && organizationName) {
        try {
          /**
           * THE CURRENCY AND COUNTRY COME FROM THE PAYMENTINTENT, which is
           * Stripe's own record of what was charged — not from this request.
           * The client cannot restate what it paid.
           *
           * `/ 100` was hardcoded here. That is right for dollars and dirhams
           * and wrong for every three-decimal Gulf currency: a 36.730 KWD
           * charge would have been recorded as 367.30. toMajor uses the
           * currency's real exponent.
           */
          const paidCurrency = (paymentIntent.currency ?? "usd").toUpperCase();
          const result = await storage.createGroupPurchaseTransaction({
            userId: user.id,
            organizationName,
            studentCount,
            paymentIntentId: paymentIntent.id,
            amountPaid: toMajor(paymentIntent.amount, paidCurrency),
            currency: paidCurrency,
            countryId: paymentIntent.metadata?.countryId || null,
          });
          user = result.user;
          organization = result.organization;
        } catch (error: any) {
          console.error("Group purchase transaction failed:", error);
          if (error.message.includes("already has an organization")) {
            /**
             * THE WEBHOOK GOT HERE FIRST AGAIN — and so did this, in production
             * on 2026-11-11, on the very first real group purchase anyone ever
             * put through the site.
             *
             * The 2026-11-09 work fixed HALF of this race. `already_premium`
             * above correctly treats a webhook-created ACCOUNT as success and
             * falls through to here, and its comment says it must, "because the
             * webhook's grantIndividualPremium is individual-only and makes no
             * organization". That was true when it was written. The
             * webhook-group-backstop commit, hours later, made the webhook run
             * this same group block — so the webhook now creates the SCHOOL
             * too, and the browser arriving second found one already there and
             * was answered 409 "This account already manages a school".
             *
             * Everything had in fact worked: school created, licences granted,
             * setup invite sent. Only the answer was wrong — and it is the same
             * wrong answer that invites a second purchase, which is precisely
             * what the 11-09 fix existed to stop. The buyer DID try again.
             *
             * THE DISTINGUISHER IS THE PAYMENT, NOT THE TIMING. A user who
             * already runs a school and is buying a second one must still be
             * refused; a user whose school was created BY THIS PAYMENT seconds
             * ago has succeeded. `organizations.stripe_payment_id` is written
             * by createGroupPurchaseTransaction and settles it with no
             * guesswork — narrowed by OUTCOME, exactly as the 23505 recovery in
             * grantIndividualPremium is.
             *
             * Nothing is granted again. The winner wrote the full studentCount
             * and the licence ledger row carries this payment id uniquely, so
             * re-running the transaction would double the entitlement. This
             * only adopts what is already there and carries on — to
             * sendSchoolSetupInvite, which is idempotent on the token and so
             * sends nothing when the webhook has already mailed the link.
             */
            const existing = await storage.getOrganizationByAdminUserId(user.id);
            if (existing && existing.stripePaymentId === paymentIntent.id) {
              console.log(
                `[Checkout] ${paymentIntent.id}: the webhook created "${existing.name}" first. ` +
                `Adopting it rather than answering 409 for a purchase that succeeded.`,
              );
              organization = existing;
            } else {
              // A genuine second purchase: a different payment, or a school
              // this payment did not create. The preflight normally catches
              // this before any charge.
              return res.status(409).json({ message: error.message });
            }
          } else {
            throw error;
          }
        }
      }

      /**
       * THE SAME SETUP LINK THE WEBHOOK SENDS.
       *
       * Sent here too, not only from the webhook, because whichever path runs
       * first must produce the same outcome — that is the whole lesson of the
       * 2026-11-09 race. The helper is idempotent on the TOKEN, not on a flag:
       * if the webhook already issued and sent one, this finds the live token
       * and sends nothing, so one purchase is one link in one inbox.
       *
       * Deliberately sent even though this branch may have just auto-logged
       * the buyer in below. The session is in one browser on one device; the
       * email is what gets them back in tomorrow, and a raced buyer
       * (racedWithBackstop) has no password at all.
       */
      if (studentCount > 1 && organizationName && user?.email) {
        await sendSchoolSetupInvite({
          userId: user.id,
          email: user.email,
          username: username || user.email,
          firstName: user.firstName,
          organizationId: organization?.id ?? null,
          organizationName,
          licenseCount: studentCount,
          amountMinor: paymentIntent.amount,
          currency: paymentIntent.currency,
          language: user.preferredLanguage,
        });
      }

      // Auto-login for new local users only
      if (isNewUser) {
        await new Promise<void>((resolve, reject) => {
          req.login({ userId: user!.id, username: username, isLocal: true }, (err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Mark payment as processed to prevent double-processing
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: { ...paymentIntent.metadata, processed: "true" }
      });

      // Return success response
      // requiresLogin is only true if existing user was NOT already logged in
      const requiresLogin = !isNewUser && !wasLoggedIn;

      res.json({ 
        success: true, 
        /**
         * A raced buyer owns an account whose generated password was never
         * displayed, so they cannot simply log in. Password reset is their
         * only route, and it works: RESEND_API_KEY is live and delivering.
         */
        requiresPasswordSetup: racedWithBackstop,
        message: racedWithBackstop
          ? (organizationName
              ? `Payment received and "${organizationName}" was created. We have emailed you a link to set your password and finish setting up.`
              : `Payment received. Use "Forgot password" with this email to set your password and sign in.`)
          : isNewUser
          ? (organization 
              ? `School "${organizationName}" created! Your login credentials are below.`
              : "Premium account created! Your login credentials are below.")
          : wasLoggedIn
            ? (organization
                ? `School "${organizationName}" created! Your account has been upgraded.`
                : "Premium licenses added to your account!")
            : (organization
                ? `School "${organizationName}" created! Please login to manage your students.`
                : "Premium licenses added to your account! Please login to access them."),
        isNewUser,
        wasLoggedIn,
        requiresLogin,
        credentials: isNewUser ? {
          username,
          password,
          email: user!.email
        } : undefined,
        organization
      });
    } catch (error: any) {
      console.error("Error completing checkout:", error);
      res.status(500).json({ message: "Checkout failed. Please try again." });
    }
  });
}
