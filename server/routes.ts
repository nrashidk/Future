import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./replitAuth";
import { validateCsrf } from "./middleware/csrf.middleware";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerUserRoutes } from "./routes/user.routes";
import { registerPasswordResetRoutes } from "./routes/password-reset.routes";
import { registerCountriesRoutes } from "./routes/countries.routes";
import { registerAssessmentRoutes } from "./routes/assessment.routes";
import { registerQuizRoutes } from "./routes/quiz.routes";
import { registerCvqRoutes } from "./routes/cvq.routes";
import { registerRecommendationsRoutes } from "./routes/recommendations.routes";
import { registerCareersRoutes } from "./routes/careers.routes";
import { registerAnalyticsRoutes } from "./routes/analytics.routes";
import { registerOrganizationRoutes } from "./routes/organization.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerSuperadminRoutes } from "./routes/superadmin.routes";
import { registerPaymentRoutes } from "./routes/payment.routes";
import { registerPublicRoutes } from "./routes/public.routes";
import { registerFilesRoutes } from "./routes/files.routes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication first (must be before CSRF validation)
  await setupAuth(app);

  // CSRF validation runs after auth setup so req.isAuthenticated() is available
  app.use(validateCsrf);

  // Register all route modules
  registerPublicRoutes(app); // Public routes (no auth required)
  registerAuthRoutes(app);
  registerUserRoutes(app); // GDPR compliance: data export and deletion
  registerPasswordResetRoutes(app); // Password reset flow
  registerCountriesRoutes(app);
  registerAssessmentRoutes(app);
  registerQuizRoutes(app);
  registerCvqRoutes(app);
  registerRecommendationsRoutes(app);
  registerCareersRoutes(app);
  registerAnalyticsRoutes(app);
  registerOrganizationRoutes(app);
  registerAdminRoutes(app);
  registerSuperadminRoutes(app);
  registerPaymentRoutes(app);
  registerFilesRoutes(app);

  // Create and return HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
