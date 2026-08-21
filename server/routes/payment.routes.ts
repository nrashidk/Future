import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { paymentLimiter, stampBuyerLimiter } from "../middleware/rateLimiter.middleware";
import { grantIndividualPremium } from "../services/premiumGrant";
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
      // SECURITY FIX: Ignore client-provided amount, calculate server-side
      const { studentCount = 1 } = req.body;

      // Validate student count
      if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > 100000) {
        return res.status(400).json({ message: "Invalid student count. Must be between 1 and 100,000" });
      }

      // SERVER-SIDE PRICING CALCULATION
      const basePrice = 10.00; // $10 per student
      let discount = 0;
      
      if (studentCount >= 1000) {
        discount = 0.20; // 20% off for 1000+
      } else if (studentCount >= 500) {
        discount = 0.15; // 15% off for 500+
      } else if (studentCount >= 100) {
        discount = 0.10; // 10% off for 100+
      }

      const total = basePrice * studentCount * (1 - discount);
      const amountInCents = Math.round(total * 100);

      // Minimum payment validation
      if (amountInCents < 50) {
        return res.status(400).json({ message: "Invalid amount. Minimum is $0.50 USD" });
      }

      // Get userId - works for both OAuth and local users
      const userId = req.isAuthenticated() 
        ? (req.user.userId) 
        : "guest";

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          userId,
          studentCount: studentCount.toString(),
          expectedAmount: amountInCents.toString(),
          assessmentType: "premium"
        }
      });

      // Return server-calculated total for UI display
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        amount: total, // Server-calculated amount in dollars
        studentCount
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
  app.post("/api/checkout/stamp-buyer", stampBuyerLimiter, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({
        message: "Payment system not configured. Please add STRIPE_SECRET_KEY to your environment."
      });
    }

    try {
      const { paymentIntentId, buyerEmail, buyerName, buyerPhone } = req.body || {};

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
      if (email) stamped.buyerEmail = email;
      if (name) stamped.buyerName = name;
      if (phone) stamped.buyerPhone = phone;

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
        return res.json({ success: true, user: existingUser, message: "Already premium" });
      }

      // Update user to premium
      const updatedUser = await storage.updateUserPremiumStatus(
        userId,
        paymentIntent.customer as string || null
      );

      res.json({ success: true, user: updatedUser });
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
      } else {
        // User not logged in - check if email already exists
        const existingUser = await storage.getUserByEmail(email);
        
        if (!existingUser) {
          // New buyer - grant via the shared helper so this path and the webhook
          // backstop create accounts identically
          const grant = await grantIndividualPremium({
            email,
            firstName,
            lastName,
            phone,
            studentCount,
            stripeCustomerId: paymentIntent.customer as string || null
          });

          // A brand-new email must come back as "granted" with credentials.
          // Anything else means our view of the account changed underneath us -
          // fail loudly rather than continue with undefined credentials.
          if (grant.status !== "granted" || !grant.credentials) {
            throw new Error(`Unexpected grant result for new buyer: ${grant.status}`);
          }

          user = grant.user;
          username = grant.credentials.username;
          password = grant.credentials.password; // Only set for new users
          isNewUser = true;
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
          const result = await storage.createGroupPurchaseTransaction({
            userId: user.id,
            organizationName,
            studentCount,
            paymentIntentId: paymentIntent.id,
            amountPaid: paymentIntent.amount / 100 // Convert cents to dollars
          });
          user = result.user;
          organization = result.organization;
        } catch (error: any) {
          console.error("Group purchase transaction failed:", error);
          if (error.message.includes("already has an organization")) {
            return res.status(409).json({ message: error.message });
          }
          throw error;
        }
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
        message: isNewUser
          ? (organization 
              ? `Organization "${organizationName}" created! Your login credentials are below.`
              : "Premium account created! Your login credentials are below.")
          : wasLoggedIn
            ? (organization
                ? `Organization "${organizationName}" created! Your account has been upgraded.`
                : "Premium licenses added to your account!")
            : (organization
                ? `Organization "${organizationName}" created! Please login to manage your students.`
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
