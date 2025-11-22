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
  RECOMMENDATIONS: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 20,
    MESSAGE: "Too many recommendation requests. Please try again later.",
  },
} as const;

export const ASSESSMENT_LIMITS = {
  MAX_QUIZ_QUESTIONS: 20,
  MIN_PASSING_SCORE: 50,
  KOLB_QUESTION_COUNT: 24,
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
  ],
  OPTIONAL: [
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "NODE_ENV",
  ],
} as const;
