import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import path from "path";
import { validateEnvironmentVariables } from "./utils/env-validation";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { csrfProtection, validateCsrf, csrfTokenEndpoint } from "./middleware/csrf.middleware";

// Validate environment variables before starting the application
validateEnvironmentVariables();

const app = express();

// Security headers with helmet
const isProduction = app.get("env") === "production";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        ...(isProduction ? [] : ["'unsafe-inline'"]), // Only allow inline scripts in development
        "https://js.stripe.com", // Stripe.js
        "https://m.stripe.network", // Stripe fraud detection
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for inline styles in components
        "https://fonts.googleapis.com", // Google Fonts stylesheet
      ],
      imgSrc: [
        "'self'",
        "data:", // For inline images
        "https:", // Allow HTTPS images
      ],
      connectSrc: [
        "'self'",
        "https://api.stripe.com", // Stripe API
        "https://m.stripe.network", // Stripe analytics
      ],
      frameSrc: [
        "https://js.stripe.com", // Stripe iframe
        "https://hooks.stripe.com", // Stripe webhooks
      ],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"], // Google Fonts files
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  // Only enable HSTS in production to avoid breaking development environments
  hsts: isProduction ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: false, // Set to false to avoid permanent browser caching issues
  } : false,
  // Use 'sameorigin' to allow OAuth popups and Stripe checkout
  frameguard: {
    action: 'sameorigin', // Allows same-origin framing (OAuth, Stripe)
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  // Prevent MIME type sniffing
  noSniff: true,
  // Cross-origin policies for enhanced security
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // Allow OAuth popups
  crossOriginResourcePolicy: { policy: "same-origin" },
}));

// Permissions Policy header (replaces Feature-Policy)
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(self \"https://js.stripe.com\")"
  );
  next();
});

// Response compression middleware
app.use(compression());

// Prevent sensitive API responses from being cached by browsers, CDNs, or proxies
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// OWASP #140: Prevent browser caching of HTML pages that may contain sensitive user data
app.use((req, res, next) => {
  if (!req.path.startsWith('/api') && (req.headers.accept?.includes('text/html') || req.path === '/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// Request logging middleware (only in development)
if (app.get("env") === "development") {
  app.use(morgan('dev'));
} else {
  // Minimal logging in production
  app.use(morgan('combined'));
}

declare module 'http' {
  interface IncomingMessage {
    rawBody: Buffer
  }
}

// Stripe webhook requires raw body for signature verification
// Must be registered BEFORE express.json() to capture unparsed body
app.use("/api/webhook/stripe", express.raw({ type: "application/json" }));

// Standard JSON parser for all other routes EXCEPT Stripe webhook
// Stripe webhook must receive raw body for signature verification
// Increased limit to 10MB to support bulk quiz question imports
app.use((req, res, next) => {
  // Skip JSON parsing for Stripe webhook paths - they need raw body
  // Use startsWith to handle trailing slashes, query params, etc.
  if (req.path.startsWith("/api/webhook/stripe")) {
    return next();
  }
  
  // Apply JSON parser with raw body capture for other routes
  // Use a 512kb default; allow 10mb only for bulk quiz question import routes
  const jsonLimit = req.path.startsWith("/api/admin/questions/bulk") ? '10mb' : '512kb';
  express.json({
    limit: jsonLimit,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })(req, res, next);
});

// URL-encoded parser for all routes EXCEPT Stripe webhook
app.use((req, res, next) => {
  // Skip URL-encoded parsing for Stripe webhook paths - they need raw body
  if (req.path.startsWith("/api/webhook/stripe")) {
    return next();
  }
  express.urlencoded({ extended: false })(req, res, next);
});
app.use(cookieParser());

// Serve ONLY public asset uploads (e.g. organization logos), which are written
// to uploads/public. Private uploads (CSV/JSON/Excel data and any file
// containing minors' personal data) live in uploads/private and are reachable
// only through the authenticated /api/files routes — never statically. This
// directory-level split is what enforces the ownership/share-token controls in
// files.routes.ts (C1).
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads', 'public')));

// CSRF cookie is set early (just sets a cookie, doesn't validate)
app.use(csrfProtection);

// CSRF token endpoint must be available before authentication for initial token fetch
app.get("/api/csrf-token", csrfTokenEndpoint);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Validate tier weight configuration before starting server
  const { validateTierWeights } = await import("./services/tierWeights");
  try {
    validateTierWeights();
    console.log("✓ Tier weight configuration validated successfully");
  } catch (error) {
    console.error("❌ Tier weight validation failed:", error);
    process.exit(1); // Fail fast if config is invalid
  }
  
  const server = await registerRoutes(app);
  
  // Run SQL migrations before seeding — failures are fatal
  {
    console.log("\n🗄️  Running database migrations...");
    const { runMigrations } = await import("./migrations/runner");
    await runMigrations();
  }

  // Seed database on startup (all environments - seed is idempotent)
  {
    const { seedDatabase } = await import("./seed");
    await seedDatabase().catch(console.error);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message =
      isProduction && status >= 500
        ? "Internal Server Error"
        : err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
