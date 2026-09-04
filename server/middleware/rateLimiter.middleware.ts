import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RATE_LIMITS } from "../config/constants";
import { printTokenAuthorizes } from "../utils/printToken";

/**
 * Shared 429 handler: log the rejection server-side, then reproduce
 * express-rate-limit's default response exactly (same status, same body).
 *
 * Limiter rejections were previously logged nowhere, so a throttled request
 * was indistinguishable from a successful one in the server logs — that is
 * how the PDF renderer silently losing its LLM narratives went unnoticed.
 */
function makeLoggingHandler(label: string, message: string) {
  return (req: Request, res: Response) => {
    const info = (req as any).rateLimit as
      | { limit: number; used: number; key: string }
      | undefined;
    console.warn(
      `[rateLimit:${label}] 429 ${req.method} ${req.originalUrl} ` +
        `key=${info?.key ?? "unknown"} used=${info?.used ?? "?"}/${info?.limit ?? "?"}`,
    );
    res.status(429);
    // Mirrors express-rate-limit's default handler, including its guard.
    if (!res.writableEnded) {
      res.send(message);
    }
  };
}

/**
 * Rate limiting for payment endpoints
 * Prevents abuse of payment API
 */
export const paymentLimiter = rateLimit({
  windowMs: RATE_LIMITS.PAYMENT.WINDOW_MS,
  max: RATE_LIMITS.PAYMENT.MAX_REQUESTS,
  message: RATE_LIMITS.PAYMENT.MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Light abuse guard for buyer-identity stamping
 * Not the payment budget - this only updates metadata on an existing intent,
 * but it still costs a Stripe API round-trip, so it must not be unthrottled
 */
export const stampBuyerLimiter = rateLimit({
  windowMs: RATE_LIMITS.STAMP_BUYER.WINDOW_MS,
  max: RATE_LIMITS.STAMP_BUYER.MAX_REQUESTS,
  message: RATE_LIMITS.STAMP_BUYER.MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for expensive recommendation generation
 * Prevents DoS attacks on compute-intensive endpoints
 */
const recommendationsLimiterOptions = {
  windowMs: RATE_LIMITS.RECOMMENDATIONS.WINDOW_MS,
  max: RATE_LIMITS.RECOMMENDATIONS.MAX_REQUESTS,
  message: RATE_LIMITS.RECOMMENDATIONS.MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
} as const;

export const recommendationsLimiter = rateLimit({
  ...recommendationsLimiterOptions,
  handler: makeLoggingHandler(
    "recommendations",
    RATE_LIMITS.RECOMMENDATIONS.MESSAGE,
  ),
});

/**
 * Same budget as recommendationsLimiter, but exempt from it when the request
 * carries a valid print token for the assessment being read.
 *
 * Only for the read-only narrative endpoints the server-side PDF render fetches.
 * That render pulls one LLM narrative per recommendation (5 on a premium report)
 * from the app's own headless browser; those requests leave the container and
 * re-enter through the edge proxy, so they all key to the instance's single
 * egress IP — one shared bucket for every PDF on the service. A print token is
 * an unforgeable 60s HMAC scoped to a single assessment, minted only after
 * ownership was already verified, so exempting it is a strictly narrower grant
 * than the request it accompanies.
 *
 * Deliberately NOT applied to POST /generate/:assessmentId — that endpoint does
 * real work, and a token replayed within its 60s life should not buy extra
 * generation budget. Generation keeps the plain IP-keyed limiter.
 */
export const printableRecommendationsLimiter = rateLimit({
  ...recommendationsLimiterOptions,
  skip: (req: Request) => {
    // req.params is empty when this runs as app-level middleware; without an
    // assessment id the token cannot be scope-checked, so never skip.
    const assessmentId = req.params?.assessmentId;
    if (!assessmentId) {
      return false;
    }
    // Safe on every input a client can send: printTokenAuthorizes returns false
    // for undefined/empty/malformed tokens rather than throwing.
    return printTokenAuthorizes(req.query.printToken, assessmentId);
  },
  handler: makeLoggingHandler(
    "recommendations:printable",
    RATE_LIMITS.RECOMMENDATIONS.MESSAGE,
  ),
});

/**
 * Rate limiting for PDF report generation
 *
 * Keyed per assessment, NOT per IP. Deliberate: this endpoint spawns a headless
 * Chrome, and the abuse we care about is one report being re-rendered in a loop.
 * A per-assessment key measures exactly that and is independent of proxy
 * topology — no dependence on `trust proxy` being tuned to the real hop count.
 * Falls back to the default IP key only if no assessment id is present.
 */
export const pdfLimiter = rateLimit({
  windowMs: RATE_LIMITS.PDF_REPORT.WINDOW_MS,
  max: RATE_LIMITS.PDF_REPORT.MAX_REQUESTS,
  message: RATE_LIMITS.PDF_REPORT.MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const assessmentId = req.params?.assessmentId;
    if (assessmentId) {
      return `assessment:${assessmentId}`;
    }
    return ipKeyGenerator(req.ip ?? "unknown");
  },
  handler: makeLoggingHandler("pdf", RATE_LIMITS.PDF_REPORT.MESSAGE),
});

/**
 * Rate limiting for data export endpoints
 * Prevents abuse of resource-intensive export operations
 */
export const dataExportLimiter = rateLimit({
  windowMs: RATE_LIMITS.DATA_EXPORT.WINDOW_MS,
  max: RATE_LIMITS.DATA_EXPORT.MAX_REQUESTS,
  message: RATE_LIMITS.DATA_EXPORT.MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for organization creation
 * Prevents spam organization creation
 */
export const orgCreationLimiter = rateLimit({
  windowMs: RATE_LIMITS.ORG_CREATION.WINDOW_MS,
  max: RATE_LIMITS.ORG_CREATION.MAX_REQUESTS,
  message: RATE_LIMITS.ORG_CREATION.MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
});
