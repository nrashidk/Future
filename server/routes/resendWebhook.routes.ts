import type { Express, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { storage } from "../storage";
import { statusFromProviderEvent } from "@shared/emailDelivery";

/**
 * WHAT HAPPENED TO THE SETUP MAIL AFTER RESEND TOOK IT.
 *
 * `sent_at` means Resend accepted the message. A hard bounce, a spam folder,
 * a gateway that dropped it and an inbox nobody opened were one
 * indistinguishable null, and they need opposite actions from a superadmin —
 * correct the address, or resend and telephone. This route is the only writer
 * of the delivery columns 036 added.
 *
 * MOUNTED UNDER /api/webhook/ ON PURPOSE. csrf.middleware exempts that prefix
 * because webhooks carry their own signature instead, and `express.json`'s
 * verify hook captures `req.rawBody` for every route that is not the Stripe
 * one — which is what signature verification needs, since Svix signs the exact
 * bytes and a re-serialised body does not reproduce them.
 *
 * FAILS CLOSED WITHOUT A SECRET. An unconfigured webhook answering 200 would
 * accept anything that reached it, and anyone can POST here. 503 instead:
 * Svix retries it, so events are not lost if the variable is set later.
 *
 * NOT A MONEY PATH, and that decides the error codes. A dropped delivery event
 * costs one row of reporting accuracy; the Stripe webhook's rules about never
 * returning non-2xx do not apply with the same force, so an unverifiable
 * request is refused outright rather than absorbed.
 */

/** Svix tolerates five minutes of clock skew; so do we. */
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifies a Svix signature by hand rather than adding the `svix` package.
 * Twenty lines against a new production dependency in a service that already
 * carries nine high advisories from one dependency chain, for an algorithm
 * that is a documented HMAC over a documented string.
 */
function verifySvixSignature(args: {
  secret: string;
  id: string;
  timestamp: string;
  signatureHeader: string;
  body: string;
}): { ok: true } | { ok: false; reason: string } {
  const ts = Number(args.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "BAD_TIMESTAMP" };
  const skew = Math.abs(Date.now() / 1000 - ts);
  // A replayed event is already harmless here — the forward-only rule in
  // storage makes a repeat a no-op — but an unbounded window would let a
  // captured request be replayed for ever, and the check costs nothing.
  if (skew > TIMESTAMP_TOLERANCE_SECONDS) return { ok: false, reason: "TIMESTAMP_OUT_OF_TOLERANCE" };

  // The secret is distributed as whsec_<base64>. The prefix is a label, not
  // part of the key; signing with the prefix included produces a signature
  // that never matches and an error that says nothing about why.
  const rawSecret = args.secret.startsWith("whsec_") ? args.secret.slice(6) : args.secret;
  let key: Buffer;
  try {
    key = Buffer.from(rawSecret, "base64");
  } catch {
    return { ok: false, reason: "MALFORMED_SECRET" };
  }
  if (key.length === 0) return { ok: false, reason: "MALFORMED_SECRET" };

  const signed = `${args.id}.${args.timestamp}.${args.body}`;
  const expected = createHmac("sha256", key).update(signed).digest();

  // The header carries a space-separated list so a secret can be rotated with
  // both keys live. Any one matching is a pass.
  const candidates = args.signatureHeader.split(" ").filter(Boolean);
  for (const candidate of candidates) {
    const [version, value] = candidate.split(",");
    if (version !== "v1" || !value) continue;
    let supplied: Buffer;
    try {
      supplied = Buffer.from(value, "base64");
    } catch {
      continue;
    }
    // timingSafeEqual throws on a length mismatch rather than returning false,
    // so the length is checked first — and a mismatch is a fail, not an error.
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "NO_MATCHING_SIGNATURE" };
}

/**
 * Resend puts the message id on `data.email_id` for delivery events. Older
 * payloads and some event types use `data.id`. Both are read because getting
 * this wrong produces the quietest possible failure: every event matches no
 * row, every response is 200, and the column stays null for ever — which
 * looks exactly like "the webhook is not configured".
 */
function messageIdFrom(data: any): string | null {
  const id = data?.email_id ?? data?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** A bounce's reason, for the superadmin surface. Shape varies by event. */
function detailFrom(data: any): string | null {
  const bounce = data?.bounce;
  const parts = [bounce?.type, bounce?.subType, bounce?.message, data?.reason]
    .filter((p: any) => typeof p === "string" && p.length > 0);
  if (parts.length === 0) return null;
  // The column is a VARCHAR on a reporting surface, not a log.
  return parts.join(" — ").slice(0, 500);
}

export function registerResendWebhookRoutes(app: Express) {
  app.post("/api/webhook/resend", async (req: Request, res: Response) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      console.error(
        "[ResendWebhook] RESEND_WEBHOOK_SECRET is not set. Refusing the event rather than " +
        "accepting an unverified one. Delivery status will stay null until this is configured.",
      );
      return res.status(503).json({ code: "WEBHOOK_NOT_CONFIGURED" });
    }

    const raw = (req as any).rawBody as Buffer | undefined;
    if (!raw) {
      // Would mean express.json's verify hook did not run for this path, which
      // is a wiring fault rather than a bad request. Loud, and 500 so it is
      // retried after the wiring is fixed.
      console.error("[ResendWebhook] No rawBody on the request; signature cannot be verified.");
      return res.status(500).json({ code: "RAW_BODY_UNAVAILABLE" });
    }

    const id = String(req.headers["svix-id"] ?? "");
    const timestamp = String(req.headers["svix-timestamp"] ?? "");
    const signature = String(req.headers["svix-signature"] ?? "");
    if (!id || !timestamp || !signature) {
      return res.status(401).json({ code: "SIGNATURE_HEADERS_MISSING" });
    }

    const verified = verifySvixSignature({
      secret, id, timestamp, signatureHeader: signature, body: raw.toString("utf8"),
    });
    if (!verified.ok) {
      console.warn(`[ResendWebhook] Rejected an event: ${verified.reason}`);
      return res.status(401).json({ code: verified.reason });
    }

    // Only parsed AFTER the signature passes: an unverified payload is not
    // something to reason about. express.json has already parsed it, so this
    // is a read, not a second parse.
    const event = req.body ?? {};
    const status = statusFromProviderEvent(String(event?.type ?? ""));
    if (!status) {
      // An event type we do not act on (opened, clicked) or one Resend added
      // after this was written. 200: a non-2xx has Svix retry for ever, and
      // there is nothing to retry.
      return res.status(200).json({ ignored: "event_type" });
    }

    const messageId = messageIdFrom(event?.data);
    if (!messageId) {
      console.warn(`[ResendWebhook] ${event?.type} carried no message id; nothing to match.`);
      return res.status(200).json({ ignored: "no_message_id" });
    }

    // `created_at` is when the event happened; now() is when we heard about
    // it, which can be minutes later after a Svix retry.
    const at = (() => {
      const parsed = new Date(event?.created_at ?? event?.data?.created_at ?? NaN);
      return Number.isFinite(parsed.getTime()) ? parsed : new Date();
    })();

    try {
      const moved = await storage.recordSetupEmailDelivery({
        providerMessageId: messageId,
        status,
        at,
        detail: detailFrom(event?.data),
      });
      if (moved && (status === "bounced" || status === "complained")) {
        // The one case a human must act on, and the reason this route exists.
        console.error(
          `[ResendWebhook] A school setup invite was ${status} (message ${messageId}). ` +
          `The buyer has paid and cannot sign in; the address needs checking before any resend.`,
        );
      }
      // `moved: false` is ordinary, not an error: the id belongs to a password
      // reset or another mail, or the event is stale under the forward-only
      // rule. Either way there is nothing to retry.
      return res.status(200).json({ applied: moved });
    } catch (error: any) {
      // A storage failure IS worth retrying, so this one is a 500.
      console.error(`[ResendWebhook] Failed to record ${status} for ${messageId}:`, error?.message ?? error);
      return res.status(500).json({ code: "RECORD_FAILED" });
    }
  });
}
