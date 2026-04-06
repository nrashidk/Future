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

  // Conditional validation: warn if Stripe key is configured without the webhook secret
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn("⚠️  STRIPE_WEBHOOK_SECRET is not set.");
    console.warn("   Stripe webhook endpoints will reject all incoming events until this is configured.");
    console.warn("   Set STRIPE_WEBHOOK_SECRET in your deployment secrets to enable webhook processing.");
  }

  // Success message
  console.log("✅ Environment variables validated successfully");
}
