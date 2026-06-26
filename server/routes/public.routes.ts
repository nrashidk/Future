import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import path from "path";
import fs from "fs";

export function registerPublicRoutes(app: Express) {
  // Lightweight liveness probe for external uptime monitoring (e.g. HetrixTools).
  // Intentionally touches NO database or downstream service, so frequent polling
  // does not keep the serverless DB awake. Always executed, never cached.
  app.get("/api/health", (req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.type("text/plain").status(200).send("ok");
  });

  // Health check endpoint for monitoring and load balancers
  // Returns minimal public response; internal details are not disclosed
  app.get("/health", async (req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({ status: "unhealthy" });
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

  // Public download for the Future Pathways white paper (no authentication required)
  app.get("/api/public/whitepaper/download", (req, res) => {
    const filePath = path.resolve(process.cwd(), "docs", "future-pathways-white-paper-2026.docx");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "White paper not found" });
    }
    res.download(filePath, "Future-Pathways-White-Paper-2026.docx");
  });
}
