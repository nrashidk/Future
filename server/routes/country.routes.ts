/**
 * Country Management Routes
 * 
 * Allows superadmins to add, update, and delete countries with LLM auto-population.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { researchCountryData, generateCountryQuizQuestions, generateSectorWefMappings } from "../services/llmCountryService";
import rateLimit from "express-rate-limit";

const createCountrySchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(100),
  code: z.string().length(3).regex(/^[A-Z]+$/, "Code must be 3 uppercase letters"),
  abbreviation: z.string().max(10).optional().nullable(),
  autoPopulate: z.boolean().optional().default(false),
});

const updateCountrySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().length(3).regex(/^[A-Z]+$/).optional(),
  abbreviation: z.string().max(10).nullable().optional(),
  mission: z.string().max(2000).optional(),
  vision: z.string().max(2000).optional(),
  visionPlan: z.string().max(100).nullable().optional(),
  prioritySectors: z.array(z.string()).optional(),
  nationalGoals: z.array(z.string()).optional(),
  educationSystem: z.string().max(1000).nullable().optional(),
  universitiesLink: z.string().url().nullable().optional().or(z.literal("")),
  universitiesLinkLabel: z.string().max(100).nullable().optional(),
  curricula: z.array(z.string()).nullable().optional(),
  subjects: z.array(z.string()).nullable().optional(),
  gradeLevels: z.array(z.string()).nullable().optional(),
  isActive: z.boolean().optional(),
});

const generateQuestionsSchema = z.object({
  subject: z.string().min(1).max(50),
  grade: z.number().min(8).max(12),
  curriculum: z.string().min(1).max(50),
  count: z.number().min(1).max(50).default(10),
});

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

      const parseResult = createCountrySchema.safeParse({
        ...req.body,
        code: req.body.code?.toUpperCase(),
      });
      
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(", ");
        return res.status(400).json({ message: `Validation error: ${errors}` });
      }
      
      const { id, name, code, abbreviation, autoPopulate } = parseResult.data;

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
      
      const parseResult = updateCountrySchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(", ");
        return res.status(400).json({ message: `Validation error: ${errors}` });
      }

      const existing = await storage.getCountryById(id);
      if (!existing) {
        return res.status(404).json({ message: "Country not found" });
      }

      const updates = parseResult.data;
      if (updates.universitiesLink === "") {
        updates.universitiesLink = null;
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
      
      const parseResult = generateQuestionsSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(", ");
        return res.status(400).json({ message: `Validation error: ${errors}` });
      }
      
      const { subject, grade, curriculum, count } = parseResult.data;

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
