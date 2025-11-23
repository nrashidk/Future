import type { Express } from "express";
import { storage } from "../storage";

export function registerPublicRoutes(app: Express) {
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
