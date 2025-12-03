import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerPublicRoutes(app: Express) {
  // Health check endpoint for monitoring and load balancers
  app.get("/health", async (req, res) => {
    try {
      // Check database connectivity
      const dbCheck = await db.execute(sql`SELECT 1`);
      const dbStatus = dbCheck ? "healthy" : "unhealthy";
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          database: dbStatus,
          server: "healthy"
        },
        version: process.env.npm_package_version || "1.0.0"
      });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        services: {
          database: "unhealthy",
          server: "healthy"
        },
        error: "Database connection failed"
      });
    }
  });

  // Get total completed assessments count for live counter on landing page
  app.get("/api/public/student-count", async (req, res) => {
    try {
      const analytics = await storage.getAnalyticsOverview();
      res.json({ totalStudents: analytics.totalStudents });
    } catch (error) {
      console.error("Error fetching student count:", error);
      res.status(500).json({ message: "Failed to fetch student count" });
    }
  });

  // Get organizations with logos for public display on landing page
  app.get("/api/public/organizations", async (req, res) => {
    try {
      const organizations = await storage.getOrganizationsWithLogos();
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });
}
