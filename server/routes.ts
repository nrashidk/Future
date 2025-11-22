import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./replitAuth";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerCountriesRoutes } from "./routes/countries.routes";
import { registerAssessmentRoutes } from "./routes/assessment.routes";
import { registerQuizRoutes } from "./routes/quiz.routes";
import { registerCvqRoutes } from "./routes/cvq.routes";
import { registerRecommendationsRoutes } from "./routes/recommendations.routes";
import { registerCareersRoutes } from "./routes/careers.routes";
import { registerAnalyticsRoutes } from "./routes/analytics.routes";
import { registerOrganizationRoutes } from "./routes/organization.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerPaymentRoutes } from "./routes/payment.routes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication first
  await setupAuth(app);

  // Register all route modules
  registerAuthRoutes(app);
  registerCountriesRoutes(app);
  registerAssessmentRoutes(app);
  registerQuizRoutes(app);
  registerCvqRoutes(app);
  registerRecommendationsRoutes(app);
  registerCareersRoutes(app);
  registerAnalyticsRoutes(app);
  registerOrganizationRoutes(app);
  registerAdminRoutes(app);
  registerPaymentRoutes(app);

  // Create and return HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
