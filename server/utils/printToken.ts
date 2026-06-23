import crypto from 'crypto';

// Short-lived, single-assessment signed token used to authorize the server-side
// Puppeteer PDF render. The PDF route launches a fresh headless browser with no
// session cookie, so the print page's data fetches would otherwise hit the
// ownership checks unauthenticated and get back empty/403 responses (a blank
// PDF). We mint a token here scoped to ONE assessmentId, append it to the print
// URL, and accept it on the data routes as proof of ownership for THAT
// assessment only — a token for assessment A can never read assessment B.
//
// Signed with HMAC-SHA256 over the existing SESSION_SECRET (already validated at
// startup), so there is no new env var and no JWT dependency. The token is a
// compact `base64url(payload).base64url(mac)` MAC, not a full JWT.

const TOKEN_TTL_MS = 60_000; // ~60s — the render takes seconds; no reason to live longer

interface PrintTokenPayload {
  aid: string; // the single assessment this token authorizes
  exp: number; // absolute expiry, epoch ms
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // SESSION_SECRET is required for the session store too; fail loudly rather
    // than mint forgeable tokens against an empty key.
    throw new Error('SESSION_SECRET environment variable is not set');
  }
  return secret;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

/**
 * Mint a print token scoped to a single assessmentId, valid for ~60s.
 */
export function mintPrintToken(assessmentId: string): string {
  const payload: PrintTokenPayload = { aid: assessmentId, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/**
 * Verify a print token. Returns the embedded assessmentId on success, or null
 * if the token is malformed, tampered, or expired. Constant-time MAC compare.
 */
export function verifyPrintToken(token: unknown): { aid: string } | null {
  if (typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const [body, mac] = token.split('.');
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

  let payload: PrintTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload?.aid !== 'string' || typeof payload?.exp !== 'number') {
    return null;
  }
  if (payload.exp < Date.now()) {
    return null;
  }

  return { aid: payload.aid };
}

/**
 * The scoping primitive the data routes use: true iff `token` is a valid,
 * unexpired print token scoped to EXACTLY `assessmentId`. A token minted for
 * assessment A authorizes ONLY A — passing A's token while requesting B returns
 * false, so the PDF render can never read across assessments.
 */
export function printTokenAuthorizes(token: unknown, assessmentId: string | undefined): boolean {
  if (!assessmentId) {
    return false;
  }
  const result = verifyPrintToken(token);
  return result !== null && result.aid === assessmentId;
}
