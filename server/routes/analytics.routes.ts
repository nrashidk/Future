import type { Express } from "express";
import { storage } from "../storage";

export function registerAnalyticsRoutes(app: Express) {
  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const countryId = req.query.countryId as string | undefined;
      const analytics = await storage.getAnalyticsOverview(countryId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics overview:", error);
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  app.get("/api/analytics/countries", async (req, res) => {
    try {
      // Get all countries with completed assessments (no filter)
      const analytics = await storage.getAnalyticsOverview();
      const countries = analytics.countriesBreakdown.map(c => ({
        countryId: c.countryId,
        countryName: c.countryName,
        studentCount: c.count
      }));
      res.json(countries);
    } catch (error) {
      console.error("Error fetching countries analytics:", error);
      res.status(500).json({ message: "Failed to fetch countries analytics" });
    }
  });

  app.get("/api/analytics/country/:id", async (req, res) => {
    try {
      const analytics = await storage.getCountryAnalytics(req.params.id);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching country analytics:", error);
      res.status(500).json({ message: "Failed to fetch country analytics" });
    }
  });

  app.get("/api/analytics/careers", async (req, res) => {
    try {
      const countryId = req.query.countryId as string | undefined;
      const trends = await storage.getCareerTrends(countryId);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/trends", async (req, res) => {
    try {
      const countryId = req.query.countryId as string | undefined;
      const trends = await storage.getCareerTrends(countryId);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/sectors", async (req, res) => {
    try {
      const countryId = req.query.countryId as string | undefined;
      const pipeline = await storage.getSectorPipeline(countryId);
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching sector pipeline:", error);
      res.status(500).json({ message: "Failed to fetch sector pipeline" });
    }
  });
}
