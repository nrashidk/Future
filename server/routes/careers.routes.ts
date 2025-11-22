import type { Express } from "express";
import { storage } from "../storage";

export function registerCareersRoutes(app: Express) {
  app.get("/api/careers", async (_req, res) => {
    try {
      const careers = await storage.getAllCareers();
      res.json(careers);
    } catch (error) {
      console.error("Error fetching careers:", error);
      res.status(500).json({ message: "Failed to fetch careers" });
    }
  });
}
