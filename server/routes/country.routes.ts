/**
 * Country Management Routes
 * 
 * Allows superadmins to add, update, and delete countries with LLM auto-population.
 */

import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { researchCountryData, generateCountryQuizQuestions, generateSectorWefMappings } from "../services/llmCountryService";
import rateLimit from "express-rate-limit";

const getSuperadminEmails = (): string[] => {
  return (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim())
    .filter(e => e.length > 0);
};

const checkSuperadmin = async (req: any): Promise<boolean> => {
  const userId = req.user?.isLocal ? req.user.userId : req.user?.claims?.sub;
  if (!userId) return false;
  
  const user = await storage.getUser(userId);
  if (!user) return false;
  
  const superadminEmails = getSuperadminEmails();
  return (!req.user?.isLocal && user.email && superadminEmails.includes(user.email)) || user.role === "superadmin";
};

const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: "Too many LLM requests. Please try again later." },
});

export function registerCountryRoutes(app: Express) {
  app.get("/api/admin/countries", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Superadmin access required" });
      }

      const countries = await storage.getAllCountries();
      res.json(countries);
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  app.post("/api/admin/countries", isAuthenticated, llmLimiter, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Superadmin access required" });
      }

      const { 
        id, 
        name, 
        code, 
        abbreviation,
        autoPopulate = false 
      } = req.body;

      if (!id || !name || !code) {
        return res.status(400).json({ message: "ID, name, and code are required" });
      }

      const existing = await storage.getCountryById(id);
      if (existing) {
        return res.status(409).json({ message: "Country with this ID already exists" });
      }

      let countryData: any = {
        id,
        name,
        code: code.toUpperCase(),
        abbreviation: abbreviation || null,
        mission: "",
        vision: "",
        visionPlan: null,
        prioritySectors: [],
        nationalGoals: [],
        targets: null,
        flag: null,
        educationSystem: null,
        universitiesLink: null,
        universitiesLinkLabel: null,
        curricula: [],
        subjects: [],
        gradeLevels: ["8", "9", "10", "11", "12"],
        logoUrl: null,
        reportTheme: null,
        isActive: true,
        llmPopulated: false,
      };

      if (autoPopulate) {
        console.log(`[Country] Auto-populating data for ${name} using LLM...`);
        const result = await researchCountryData(storage, name, code);
        
        if (result.success && result.data) {
          countryData = {
            ...countryData,
            mission: result.data.mission,
            vision: result.data.vision,
            visionPlan: result.data.visionPlan,
            prioritySectors: result.data.prioritySectors,
            nationalGoals: result.data.nationalGoals,
            targets: result.data.targets,
            educationSystem: result.data.educationSystem,
            universitiesLink: result.data.universitiesLink,
            universitiesLinkLabel: result.data.universitiesLinkLabel,
            curricula: result.data.curricula,
            subjects: result.data.subjects,
            gradeLevels: result.data.gradeLevels,
            llmPopulated: true,
          };
          console.log(`[Country] LLM auto-population successful for ${name}`);
        } else {
          console.error(`[Country] LLM auto-population failed:`, result.error);
        }
      }

      const country = await storage.createCountry(countryData);

      if (autoPopulate && countryData.prioritySectors.length > 0) {
        console.log(`[Country] Generating sector-WEF mappings for ${name}...`);
        const sectorResult = await generateSectorWefMappings(
          storage, 
          name, 
          countryData.prioritySectors
        );
        if (sectorResult.success && sectorResult.mappings) {
          for (let i = 0; i < sectorResult.mappings.length; i++) {
            const mapping = sectorResult.mappings[i];
            try {
              await storage.createOrUpdateCountryPrioritySector(
                id,
                mapping.sector,
                i + 1,
                `Priority sector for ${name}'s national development`
              );
            } catch (e) {
              console.log(`Sector ${mapping.sector} may already exist, skipping`);
            }
          }
          console.log(`[Country] Created ${sectorResult.mappings.length} sector mappings`);
        }
      }

      res.status(201).json({
        success: true,
        country,
        autoPopulated: autoPopulate && countryData.llmPopulated,
      });
    } catch (error) {
      console.error("Error creating country:", error);
      res.status(500).json({ message: "Failed to create country" });
    }
  });

  app.put("/api/admin/countries/:id", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Superadmin access required" });
      }

      const { id } = req.params;
      const updates = req.body;

      const existing = await storage.getCountryById(id);
      if (!existing) {
        return res.status(404).json({ message: "Country not found" });
      }

      const country = await storage.updateCountry(id, updates);
      res.json(country);
    } catch (error) {
      console.error("Error updating country:", error);
      res.status(500).json({ message: "Failed to update country" });
    }
  });

  app.delete("/api/admin/countries/:id", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Superadmin access required" });
      }

      const { id } = req.params;

      if (id === "uae") {
        return res.status(400).json({ message: "Cannot delete the default UAE country" });
      }

      const deleted = await storage.deleteCountry(id);
      if (!deleted) {
        return res.status(404).json({ message: "Country not found" });
      }

      res.json({ success: true, message: "Country deleted successfully" });
    } catch (error) {
      console.error("Error deleting country:", error);
      res.status(500).json({ message: "Failed to delete country" });
    }
  });

  app.post("/api/admin/countries/:id/generate-questions", isAuthenticated, llmLimiter, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Superadmin access required" });
      }

      const { id } = req.params;
      const { subject, grade, curriculum, count = 10 } = req.body;

      if (!subject || !grade) {
        return res.status(400).json({ message: "Subject and grade are required" });
      }

      const country = await storage.getCountryById(id);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }

      console.log(`[Country] Generating ${count} questions for ${country.name} - ${subject} Grade ${grade}`);

      const result = await generateCountryQuizQuestions(
        storage,
        id,
        country.name,
        subject,
        grade,
        curriculum || "National",
        count
      );

      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to generate questions" });
      }

      let created = 0;
      for (const q of result.questions || []) {
        try {
          const gradeBand = grade >= 10 ? "10-12" : "8-9";
          
          await storage.createQuizQuestion({
            question: q.question,
            questionType: q.questionType,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            subject: q.subject,
            gradeBand,
            grade: q.grade,
            countryId: id,
            curriculum: q.curriculum,
            topic: q.topic,
            difficulty: q.difficulty,
            cognitiveLevel: q.cognitiveLevel,
            isLlmGenerated: true,
            llmModel: "gpt-4o",
          });
          created++;
        } catch (e) {
          console.error("Error creating question:", e);
        }
      }

      console.log(`[Country] Created ${created}/${result.questions?.length || 0} questions for ${country.name}`);

      res.json({
        success: true,
        questionsGenerated: result.questions?.length || 0,
        questionsCreated: created,
        tokensUsed: result.tokensUsed,
      });
    } catch (error) {
      console.error("Error generating questions:", error);
      res.status(500).json({ message: "Failed to generate questions" });
    }
  });

  app.post("/api/admin/countries/:id/repopulate", isAuthenticated, llmLimiter, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Superadmin access required" });
      }

      const { id } = req.params;

      const country = await storage.getCountryById(id);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }

      console.log(`[Country] Re-populating data for ${country.name} using LLM...`);
      const result = await researchCountryData(storage, country.name, country.code);

      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to research country data" });
      }

      const updatedCountry = await storage.updateCountry(id, {
        mission: result.data!.mission,
        vision: result.data!.vision,
        visionPlan: result.data!.visionPlan,
        prioritySectors: result.data!.prioritySectors,
        nationalGoals: result.data!.nationalGoals,
        targets: result.data!.targets,
        educationSystem: result.data!.educationSystem,
        universitiesLink: result.data!.universitiesLink,
        universitiesLinkLabel: result.data!.universitiesLinkLabel,
        curricula: result.data!.curricula,
        subjects: result.data!.subjects,
        gradeLevels: result.data!.gradeLevels,
        llmPopulated: true,
      });

      res.json({
        success: true,
        country: updatedCountry,
        tokensUsed: result.tokensUsed,
      });
    } catch (error) {
      console.error("Error repopulating country:", error);
      res.status(500).json({ message: "Failed to repopulate country data" });
    }
  });
}
