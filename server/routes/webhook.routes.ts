import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { storage } from "../storage";

// Initialize Stripe only if keys are configured
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-10-29.clover",
  });
}

/**
 * Stripe Webhook Handler
 * 
 * SECURITY: All webhook events are cryptographically verified using
 * the STRIPE_WEBHOOK_SECRET before processing. This prevents attackers
 * from forging payment success events.
 * 
 * Setup Required:
 * 1. Get webhook secret from Stripe Dashboard > Developers > Webhooks
 * 2. Add STRIPE_WEBHOOK_SECRET to environment variables
 * 3. Configure webhook URL: https://yourdomain.com/api/webhook/stripe
 * 4. Enable events: payment_intent.succeeded, checkout.session.completed
 */
export function registerWebhookRoutes(app: Express) {
  /**
   * POST /api/webhook/stripe
   * Stripe webhook endpoint for payment events
   * 
   * IMPORTANT: This route must receive raw body for signature verification
   * The express.raw() middleware is applied in index.ts specifically for this route
   */
  app.post("/api/webhook/stripe", async (req: Request, res: Response) => {
    if (!stripe) {
      console.error("[Webhook] Stripe not configured");
      return res.status(503).json({ error: "Payment system not configured" });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      // SECURITY: In production, webhooks MUST be verified
      console.error("[Webhook] STRIPE_WEBHOOK_SECRET not configured - rejecting webhook");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    const sig = req.headers["stripe-signature"];
    
    if (!sig) {
      console.error("[Webhook] Missing stripe-signature header");
      return res.status(400).json({ error: "Missing signature" });
    }

    let event: Stripe.Event;

    try {
      // SECURITY: Verify webhook signature to prevent forged events
      // express.raw() middleware puts the raw Buffer directly in req.body
      // This preserves the exact payload for signature verification
      if (!req.body || !Buffer.isBuffer(req.body)) {
        console.error("[Webhook] Raw body not available for signature verification");
        return res.status(400).json({ error: "Raw body not available" });
      }
      
      event = stripe.webhooks.constructEvent(
        req.body, // Raw Buffer from express.raw()
        sig,
        webhookSecret
      );
    } catch (err: any) {
      console.error(`[Webhook] Signature verification failed: ${err.message}`);
      return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    // Log event type for debugging (never log sensitive data)
    console.log(`[Webhook] Received event: ${event.type}, ID: ${event.id}`);

    try {
      switch (event.type) {
        case "payment_intent.succeeded":
          await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;
          
        case "checkout.session.completed":
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;
          
        case "payment_intent.payment_failed":
          await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;
          
        default:
          // Log unhandled event types for monitoring
          console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }

      // Acknowledge receipt of the event
      res.json({ received: true, eventId: event.id });
    } catch (error: any) {
      console.error(`[Webhook] Error processing event ${event.id}:`, error);
      // Return 500 so Stripe will retry the webhook
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });
}

/**
 * Handle successful payment intent
 * This is the primary handler for individual premium upgrades
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { userId, studentCount, expectedAmount, assessmentType } = paymentIntent.metadata;
  
  console.log(`[Webhook] Payment succeeded: ${paymentIntent.id}, User: ${userId}, Amount: ${paymentIntent.amount}`);

  // Validate metadata exists
  if (!userId) {
    console.error(`[Webhook] Payment ${paymentIntent.id} missing userId in metadata`);
    return;
  }

  // Validate amount matches expected (prevent manipulation)
  if (expectedAmount && paymentIntent.amount !== parseInt(expectedAmount)) {
    console.error(`[Webhook] Amount mismatch for ${paymentIntent.id}: expected ${expectedAmount}, got ${paymentIntent.amount}`);
    return;
  }

  // Skip guest payments - they're handled via checkout flow
  if (userId === "guest") {
    console.log(`[Webhook] Skipping guest payment ${paymentIntent.id} - handled via checkout`);
    return;
  }

  try {
    // Check if user exists
    const user = await storage.getUser(userId);
    if (!user) {
      console.error(`[Webhook] User ${userId} not found for payment ${paymentIntent.id}`);
      return;
    }

    // Check if already processed (idempotency)
    if (user.isPremium) {
      console.log(`[Webhook] User ${userId} already premium, skipping`);
      return;
    }

    // Grant premium status
    await storage.updateUserPremiumStatus(
      userId,
      paymentIntent.customer as string || null
    );

    console.log(`[Webhook] Successfully upgraded user ${userId} to premium`);
  } catch (error) {
    console.error(`[Webhook] Failed to upgrade user ${userId}:`, error);
    throw error; // Re-throw to trigger retry
  }
}

/**
 * Handle completed checkout session
 * Used for more complex checkout flows
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log(`[Webhook] Checkout session completed: ${session.id}`);
  
  // Checkout sessions are typically handled client-side for this app
  // but we log for monitoring purposes
  if (session.payment_status === "paid") {
    console.log(`[Webhook] Checkout ${session.id} payment confirmed`);
  }
}

/**
 * Handle failed payment
 * Log for monitoring and potential user notification
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const { userId } = paymentIntent.metadata;
  
  console.log(`[Webhook] Payment failed: ${paymentIntent.id}, User: ${userId}`);
  
  // Could add user notification here in the future
  // For now, just log for monitoring
  if (paymentIntent.last_payment_error) {
    console.log(`[Webhook] Failure reason: ${paymentIntent.last_payment_error.message}`);
  }
}
