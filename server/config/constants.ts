export const RATE_LIMITS = {
  LOGIN: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5,
    MESSAGE: "Too many login attempts. Please try again later.",
  },
  PAYMENT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 10,
    MESSAGE: "Too many payment attempts. Please try again later.",
  },
  STAMP_BUYER: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 60,
    MESSAGE: "Too many requests. Please try again later.",
  },
  RECOMMENDATIONS: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 20,
    MESSAGE: "Too many recommendation requests. Please try again later.",
  },
  // Budget for the Puppeteer PDF render itself. Keyed per assessment rather
  // than per IP (see pdfLimiter), so it is independent of proxy topology and
  // one student can never exhaust another's budget. The ceiling is generous
  // because the bucket is cheap: re-rendering the same assessment hits the
  // LLM narrative cache, so repeats cost a headless Chrome and no LLM spend.
  PDF_REPORT: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 20,
    MESSAGE: "Too many report downloads. Please try again later.",
  },
  DATA_EXPORT: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 5,
    MESSAGE: "Too many export requests. Please try again later.",
  },
  ORG_CREATION: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 10,
    MESSAGE: "Too many organization creation requests. Please try again later.",
  },
} as const;

export const ASSESSMENT_LIMITS = {
  MAX_QUIZ_QUESTIONS: 20,
  MIN_PASSING_SCORE: 50,
  RIASEC_QUESTION_COUNT: 30,
  CVQ_ITEM_COUNT: 21,
} as const;

export const ORGANIZATION_LIMITS = {
  MAX_BULK_MEMBERS: 500,
  MIN_PASSWORD_LENGTH: 8,
  USERNAME_PREFIX: "student",
} as const;

export const CAREER_MATCHING = {
  TOP_CAREERS_COUNT: 5,
  MIN_MATCH_SCORE: 0,
  MAX_MATCH_SCORE: 100,
} as const;

export const PDF_GENERATION = {
  TIMEOUT_MS: 30000,
  DEFAULT_FORMAT: "A4" as const,
  DEFAULT_MARGIN: { top: "40px", right: "40px", bottom: "40px", left: "40px" },
} as const;

export const ENV_VARS = {
  REQUIRED: [
    "DATABASE_URL",
    "SESSION_SECRET",
    "SUPERADMIN_EMAILS",
    "DB_ENCRYPTION_KEY", // Required for LLM credential encryption (64 hex chars)
    // DigitalOcean Spaces object storage. The file routes no longer write to
    // local disk, so an unset value is an outage, not a degradation: fail at
    // boot rather than at the first upload or download.
    "SPACES_KEY",
    "SPACES_SECRET",
    "SPACES_ENDPOINT", // Regional endpoint, e.g. https://fra1.digitaloceanspaces.com
    "SPACES_BUCKET", // Private bucket — student data. Never public-read.
    "SPACES_PUBLIC_BUCKET", // Public bucket — organization logos only.
    "SPACES_REGION", // e.g. fra1 — must match the region in SPACES_ENDPOINT
  ],
  OPTIONAL: [
    "STRIPE_SECRET_KEY",
    "VITE_STRIPE_PUBLIC_KEY", // Build-time Vite variable — must be set at build time for checkout to work
    "STRIPE_WEBHOOK_SECRET", // Required for secure webhook verification
    "RESEND_API_KEY", // Required for email delivery
    "APP_URL", // Used in email links
    "BASE_URL", // Required for OAuth callbacks (Google/Microsoft); falls back to Replit URL if absent
    "NODE_ENV",
  ],
} as const;
