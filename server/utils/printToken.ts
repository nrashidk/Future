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

/**
 * The Puppeteer render budget this file's token TTL is derived from — the
 * single source for both `page.goto` and `page.waitForFunction` timeouts on
 * both PDF render paths (recommendations.routes.ts single-report,
 * admin.routes.ts bulk export). Both routes import these two constants for
 * their own calls rather than hardcoding 30000 a second and third time, so
 * the token TTL below cannot silently drift out of sync with the render
 * timeouts it exists to outlive — the exact failure this replaces: TTL and
 * render budget were two independently-chosen 60s/60s constants that
 * happened to coincide, with zero margin (see FOLLOWUP.md, "Print-token TTL
 * is 60s but the render budget is also 60s").
 */
export const PDF_GOTO_TIMEOUT_MS = 30_000;
export const PDF_WAIT_FOR_READY_TIMEOUT_MS = 30_000;

/**
 * Margin added on top of the render's own worst-case SEQUENTIAL timeout
 * budget (goto then waitForFunction, not raced) before the token expires.
 * printTokenAuthorizes is checked once, at request entry, before any LLM
 * call runs (see server/services/llmNarrativeService.ts — that call has no
 * timeout of its own, filed separately in FOLLOWUP.md), so this margin only
 * needs to cover DISPATCH/network jitter for a narrative fetch sent late in
 * a slow render, not the LLM round-trip itself.
 *
 * PROVISIONAL. Chosen without real client-dispatch-timing telemetry — there
 * is currently no instrumentation recording when ResultsPrint.tsx actually
 * fires its data fetches relative to page load, so this is a conservative
 * placeholder, not a measured value. Tighten once that data exists; see
 * FOLLOWUP.md for the same "measure, don't guess" note.
 */
export const PRINT_TOKEN_MARGIN_MS = 20_000;

/**
 * DERIVED, not a separately chosen number: render budget + margin. Renamed
 * from a flat 60s so this can never again be "60s, coincidentally the same
 * as the render timeout" — it is now provably >= the render's own ceiling.
 */
const TOKEN_TTL_MS = PDF_GOTO_TIMEOUT_MS + PDF_WAIT_FOR_READY_TIMEOUT_MS + PRINT_TOKEN_MARGIN_MS; // 80s

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
 * Mint a token scoped to a single assessmentId, valid until the given
 * expiry — the same signed token TYPE as mintPrintToken (identical payload
 * shape, identical signing), not a second mechanism, but a distinct mint
 * function because the caller supplies its OWN expiry rather than the fixed
 * ~60s render window.
 *
 * BUILT FOR ONE CALLER: the guest report-recovery email
 * (server/routes/assessment.routes.ts, POST /api/assessments/:id/
 * send-recovery-email). Its token must live exactly as long as the report
 * itself does, so callers pass shared/guestAssessmentExpiry.ts's
 * guestAssessmentExpiresAt(assessment.completedAt) — never a flat duration —
 * so the link can never claim to work past the moment the sweep deletes the
 * row it points to.
 *
 * VERIFIED BY THE SAME printTokenAuthorizes AS A PRINT TOKEN. See that
 * function's doc comment for why callers must still carry this under its
 * own, distinctly-named query param rather than `printToken`.
 */
export function mintGuestRecoveryToken(assessmentId: string, expiresAt: Date): string {
  const payload: PrintTokenPayload = { aid: assessmentId, exp: expiresAt.getTime() };
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
 * unexpired token (print OR guest-recovery — see mintGuestRecoveryToken)
 * scoped to EXACTLY `assessmentId`. A token minted for assessment A
 * authorizes ONLY A — passing A's token while requesting B returns false, so
 * neither the PDF render nor a recovery email link can ever read across
 * assessments.
 *
 * ONE VERIFIER, TWO NAMED TOKENS AT THE CALL SITE — KEEP THEM SEPARATE.
 * Every data route that checks this also checks it against a second,
 * distinctly-named query param (`recoveryToken`, never folded into
 * `printToken`), even though both go through this same function. A single
 * param name serving both purposes — a ~60s server-only token and an
 * up-to-72-hour, user-facing emailed one — is how the next reader concludes
 * one of them IS the other, and starts reasoning about its TTL or its
 * audience from the wrong one.
 */
export function printTokenAuthorizes(token: unknown, assessmentId: string | undefined): boolean {
  if (!assessmentId) {
    return false;
  }
  const result = verifyPrintToken(token);
  return result !== null && result.aid === assessmentId;
}
