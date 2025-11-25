import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
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
        "'unsafe-inline'", // Required for Vite in development
        "https://js.stripe.com", // Stripe.js
        "https://m.stripe.network", // Stripe fraud detection
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for inline styles in components
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
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  // Only enable HSTS in production to avoid breaking development environments
  hsts: isProduction ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: false, // Set to false to avoid permanent browser caching issues
  } : false,
  // Use 'sameorigin' to allow Replit auth iframe and Stripe checkout
  frameguard: {
    action: 'sameorigin', // Allows same-origin framing (Replit auth, Stripe)
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
}));

// Response compression middleware
app.use(compression());

// Request logging middleware (only in development)
if (app.get("env") === "development") {
  app.use(morgan('dev'));
} else {
  // Minimal logging in production
  app.use(morgan('combined'));
}

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

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
  
  // Seed database on startup (only in development)
  if (app.get("env") === "development") {
    const { seedDatabase } = await import("./seed");
    await seedDatabase().catch(console.error);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
