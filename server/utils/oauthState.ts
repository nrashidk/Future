import crypto from 'crypto';

// Short-lived signed carrier for the OAuth `state` parameter, used to survive a
// post-payment re-authentication round trip.
//
// WHY A STATE PARAM AND NOT req.session: the session cookie is
// sameSite:'strict' in production (auth.ts). The OAuth callback is a cross-site
// top-level navigation from the provider, so the browser withholds fp_session
// and `req.session` in the callback is a fresh, empty session — anything stashed
// there before the redirect is gone. The `state` parameter travels in the URL
// and is therefore unaffected by SameSite. It would also have failed ONLY in
// production (dev is sameSite:'lax', which does send the cookie on top-level
// GET), so the cookie route fails in exactly the environment we cannot test in.
//
// Signed with HMAC-SHA256 over the existing SESSION_SECRET (already validated at
// startup), matching the printToken.ts convention: no new env var, no JWT
// dependency, and a compact `base64url(payload).base64url(mac)` MAC.
//
// This module is a standalone utility. It is deliberately NOT wired into any
// route yet.

const STATE_TTL_MS = 15 * 60 * 1000; // 15 min — one OAuth round trip, no longer

interface PaymentStatePayload {
  pi: string; // the single PaymentIntent this state authorizes
  exp: number; // absolute expiry, epoch ms
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // SESSION_SECRET is required for the session store too; fail loudly rather
    // than mint forgeable state against an empty key.
    throw new Error('SESSION_SECRET environment variable is not set');
  }
  return secret;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

/**
 * Mint a signed state token bound to a single paymentIntentId, valid for 15 min.
 *
 * base64url throughout, so the result is safe to place in an OAuth `state` query
 * parameter with no escaping (no `+`, `/` or `=`).
 */
export function signPaymentState(paymentIntentId: string): string {
  const payload: PaymentStatePayload = {
    pi: paymentIntentId,
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/**
 * Verify a state token. Returns the embedded paymentIntentId on success, or null
 * if it is malformed, tampered, signed with a different secret, or expired.
 * Never throws for bad input — callers get null and treat it as "no pending
 * payment", which is the safe default for the 99% of logins carrying no state.
 * Constant-time MAC compare.
 */
export function verifyPaymentState(state: unknown): { paymentIntentId: string } | null {
  if (typeof state !== 'string' || !state.includes('.')) {
    return null;
  }
  const [body, mac] = state.split('.');
  if (!body || !mac) {
    return null;
  }

  // Recompute the MAC and compare in constant time. timingSafeEqual throws on
  // length mismatch, so guard with a length check first.
  const expectedMac = sign(body);
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expectedMac);
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return null;
  }

  let payload: PaymentStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload?.pi !== 'string' || !payload.pi || typeof payload?.exp !== 'number') {
    return null;
  }
  if (payload.exp < Date.now()) {
    return null;
  }

  return { paymentIntentId: payload.pi };
}
