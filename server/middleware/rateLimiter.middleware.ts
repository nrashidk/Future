import rateLimit from "express-rate-limit";
import { RATE_LIMITS } from "../config/constants";

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
 * Rate limiting for expensive recommendation generation
 * Prevents DoS attacks on compute-intensive endpoints
 */
export const recommendationsLimiter = rateLimit({
  windowMs: RATE_LIMITS.RECOMMENDATIONS.WINDOW_MS,
  max: RATE_LIMITS.RECOMMENDATIONS.MAX_REQUESTS,
  message: RATE_LIMITS.RECOMMENDATIONS.MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
});
