import type { Express } from "express";
import { storage } from "../storage";

export function registerCountriesRoutes(app: Express) {
  app.get("/api/countries", async (_req, res) => {
    try {
      const countries = await storage.getAllCountries();
      res.json(countries);
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  app.get("/api/countries/:id", async (req, res) => {
    try {
      const country = await storage.getCountryById(req.params.id);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }
      res.json(country);
    } catch (error) {
      console.error("Error fetching country:", error);
      res.status(500).json({ message: "Failed to fetch country" });
    }
  });

  // Get subjects for a specific country and curriculum (public endpoint)
  app.get("/api/countries/:countryId/curricula/:curriculum/subjects", async (req, res) => {
    try {
      const { countryId, curriculum } = req.params;
      
      // Verify country exists
      const country = await storage.getCountryById(countryId);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }
      
      const subjects = await storage.getSubjectsByCurriculum(countryId, curriculum);
      res.json(subjects);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ message: "Failed to fetch subjects" });
    }
  });

  // Get all subjects for a country (across all curricula) - only active subjects
  app.get("/api/countries/:countryId/subjects", async (req, res) => {
    try {
      const { countryId } = req.params;
      
      // Verify country exists
      const country = await storage.getCountryById(countryId);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }
      
      // Get all subjects for the country and filter to active only for public endpoint
      const allSubjects = await storage.getSubjectsByCountry(countryId);
      const activeSubjects = allSubjects.filter(s => s.isActive);
      res.json(activeSubjects);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ message: "Failed to fetch subjects" });
    }
  });
}
