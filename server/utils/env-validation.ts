import { ENV_VARS } from "../config/constants";

/**
 * Validate that all required environment variables are set
 * Exits the process with error if validation fails
 */
export function validateEnvironmentVariables(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables
  for (const varName of ENV_VARS.REQUIRED) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Check optional environment variables and warn if missing
  for (const varName of ENV_VARS.OPTIONAL) {
    if (!process.env[varName]) {
      warnings.push(varName);
    }
  }

  // Report missing required variables
  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    console.error("\nPlease set these environment variables and restart the application.");
    process.exit(1);
  }

  // Report warnings for missing optional variables
  if (warnings.length > 0) {
    console.warn("⚠️  Optional environment variables not set:");
    warnings.forEach(varName => {
      console.warn(`  - ${varName}`);
    });
    console.warn("Some features may be unavailable.\n");
  }

  // Conditional validation: Stripe webhook secret is required if Stripe key is configured in production
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error("❌ STRIPE_WEBHOOK_SECRET must be set when STRIPE_SECRET_KEY is configured.");
      console.error("   Without it, Stripe webhook signatures cannot be verified and payment events are unprotected.");
      process.exit(1);
    } else {
      console.warn("⚠️  STRIPE_WEBHOOK_SECRET is not set. Stripe webhook signature verification will be skipped.");
      console.warn("   This is a security risk in production.");
    }
  }

  // Success message
  console.log("✅ Environment variables validated successfully");
}
