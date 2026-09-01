/**
 * Country Management Routes
 * 
 * Allows superadmins to add, update, and delete countries with LLM auto-population.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import {
  researchCountryData,
  generateCountryQuizQuestions,
  generateSectorWefMappings,
  skillKey,
  type GeneratedSector,
} from "../services/llmCountryService";
import rateLimit from "express-rate-limit";
import { getSuperadminEmails } from "../middleware/auth.middleware";

const createCountrySchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(100),
  code: z.string().min(2).max(3).regex(/^[A-Z]+$/, "Code must be 2-3 uppercase letters"),
  abbreviation: z.string().max(10).optional().nullable(),
  autoPopulate: z.boolean().optional().default(false),
});

const updateCountrySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  nameAr: z.string().max(200).nullable().optional(),
  code: z.string().min(2).max(3).regex(/^[A-Z]+$/).optional(),
  abbreviation: z.string().max(10).nullable().optional(),
  flag: z.string().max(10).nullable().optional(),
  mission: z.string().max(2000).optional(),
  missionAr: z.string().max(2000).nullable().optional(),
  vision: z.string().max(2000).optional(),
  visionAr: z.string().max(2000).nullable().optional(),
  visionPlan: z.string().max(100).nullable().optional(),
  prioritySectors: z.array(z.string()).optional(),
  prioritySectorsAr: z.array(z.string()).nullable().optional(),
  nationalGoals: z.array(z.string()).optional(),
  nationalGoalsAr: z.array(z.string()).nullable().optional(),
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

const checkSuperadmin = async (req: any): Promise<boolean> => {
  const userId = req.user?.userId;
  if (!userId) return false;
  
  const user = await storage.getUser(userId);
  if (!user) return false;
  
  const superadminEmails = getSuperadminEmails();
  return (user.email && superadminEmails.includes(user.email.toLowerCase())) || user.role === "superadmin";
};

const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: "Too many LLM requests. Please try again later." },
});

/**
 * The storage surface persistGeneratedSectors needs. Narrow on purpose: it makes
 * the writer unit-testable without a database, and it documents that generating
 * a country touches exactly three tables.
 */
export interface SectorPersistenceStore {
  createOrUpdateCountryPrioritySector(
    countryId: string,
    name: string,
    displayOrder: number,
    description?: string,
  ): Promise<{ id: string }>;
  createOrUpdateCountrySectorWefSkill(
    sectorId: string,
    wefSkillId: string,
    importance: number,
  ): Promise<unknown>;
  createOrUpdateSectorCategoryRule(
    sectorId: string,
    careerCategory: string,
    relevance: number,
    notes?: string,
  ): Promise<unknown>;
}

export interface SectorPersistenceResult {
  sectorsWritten: number;
  skillRowsWritten: number;
  categoryRowsWritten: number;
  errors: string[];
}

/**
 * Write a generated country's scoring configuration.
 *
 * THREE tables, not one. The previous version called
 * createOrUpdateCountryPrioritySector and stopped, so an LLM country got sector
 * NAMES and nothing else: country_sector_wef_skills was never written (the
 * generated skill mappings were computed and discarded) and
 * country_sector_categories was never written at all, which makes
 * calculateVisionScore return VISION_FLOOR for every career — a uniformly inert
 * vision component. See docs/priority-alignment-plan.md section 7.
 *
 * displayOrder is 1-based and follows the accepted order, because it drives
 * rankFactor in server/services/matching.ts and therefore has to encode real
 * national priority.
 *
 * A sector whose sector row fails is skipped whole rather than half-written: a
 * sector with skills but no category rules scores nothing, and one with
 * category rules but no skills silently degrades to category-only relevance.
 */
export async function persistGeneratedSectors(
  store: SectorPersistenceStore,
  countryId: string,
  countryName: string,
  mappings: GeneratedSector[],
  wefSkillIdsByName: Map<string, string>,
): Promise<SectorPersistenceResult> {
  const result: SectorPersistenceResult = {
    sectorsWritten: 0,
    skillRowsWritten: 0,
    categoryRowsWritten: 0,
    errors: [],
  };

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    // Provenance lives in the category rules' notes (schema.ts calls that field
    // out as the place for it); the sector description carries the same URLs so
    // the sector row is auditable on its own.
    const description = mapping.sources.length > 0
      ? `Priority sector for ${countryName}. Sources: ${mapping.sources.join(", ")}`
      : `Priority sector for ${countryName}'s national development`;

    let sectorId: string;
    try {
      const sector = await store.createOrUpdateCountryPrioritySector(
        countryId,
        mapping.sector,
        i + 1,
        description,
      );
      sectorId = sector.id;
      result.sectorsWritten++;
    } catch (error) {
      result.errors.push(
        `${mapping.sector}: sector row failed (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }

    for (const skill of mapping.skills) {
      const wefSkillId = wefSkillIdsByName.get(skillKey(skill.skill));
      if (!wefSkillId) {
        result.errors.push(`${mapping.sector}: WEF skill "${skill.skill}" is not seeded in wef_skills`);
        continue;
      }
      try {
        await store.createOrUpdateCountrySectorWefSkill(sectorId, wefSkillId, skill.importance);
        result.skillRowsWritten++;
      } catch (error) {
        result.errors.push(
          `${mapping.sector} / ${skill.skill}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    for (const rule of mapping.categoryRules) {
      try {
        await store.createOrUpdateSectorCategoryRule(
          sectorId,
          rule.category,
          rule.relevance,
          rule.notes,
        );
        result.categoryRowsWritten++;
      } catch (error) {
        result.errors.push(
          `${mapping.sector} / ${rule.category}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return result;
}

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

      let sectorGeneration: Record<string, unknown> | undefined;

      if (autoPopulate && countryData.prioritySectors.length > 0) {
        console.log(`[Country] Generating sector scoring configuration for ${name}...`);

        // The generator needs the live catalog: category rules may only name
        // categories that exist, and the coverage gate rejects a sector that no
        // career serves.
        const [careers, wefSkills] = await Promise.all([
          storage.getAllCareers(),
          storage.getAllWefSkills(),
        ]);

        const sectorResult = await generateSectorWefMappings(
          storage,
          name,
          countryData.prioritySectors,
          {
            careerCatalog: careers,
            skillNames: wefSkills.map(s => s.name),
          },
        );

        for (const rejection of sectorResult.rejected ?? []) {
          console.warn(`[Country] Rejected sector "${rejection.sector}" (${rejection.gate} gate): ${rejection.reason}`);
        }
        for (const warning of sectorResult.warnings ?? []) {
          console.warn(`[Country] ${warning}`);
        }

        if (!sectorResult.success || !sectorResult.mappings) {
          console.error(`[Country] Sector generation failed: ${sectorResult.error}`);
          sectorGeneration = {
            persisted: false,
            error: sectorResult.error,
            sourcedLive: sectorResult.sourcedLive ?? false,
            rejected: sectorResult.rejected ?? [],
            warnings: sectorResult.warnings ?? [],
          };
        } else {
          const wefSkillIdsByName = new Map(wefSkills.map(s => [skillKey(s.name), s.id]));
          const written = await persistGeneratedSectors(
            storage,
            id,
            name,
            sectorResult.mappings,
            wefSkillIdsByName,
          );

          // Keep countries.prioritySectors aligned with what was actually
          // seeded. A gated-out sector left in the array is an empty label:
          // it shows in the UI, it is positionally paired with
          // prioritySectorsAr, and no career can ever be attributed to it.
          const acceptedNames = sectorResult.mappings.map(m => m.sector);
          if (acceptedNames.length !== countryData.prioritySectors.length) {
            await storage.updateCountry(id, { prioritySectors: acceptedNames });
            countryData.prioritySectors = acceptedNames;
          }

          for (const failure of written.errors) {
            console.error(`[Country] ${failure}`);
          }
          console.log(
            `[Country] Seeded ${written.sectorsWritten} sectors, ${written.skillRowsWritten} skill rows, ${written.categoryRowsWritten} category rules for ${name}`,
          );

          sectorGeneration = {
            persisted: true,
            sourcedLive: sectorResult.sourcedLive ?? false,
            ...written,
            rejected: sectorResult.rejected ?? [],
            warnings: sectorResult.warnings ?? [],
          };
        }
      }

      res.status(201).json({
        success: true,
        country: sectorGeneration?.persisted ? await storage.getCountryById(id) : country,
        autoPopulated: autoPopulate && countryData.llmPopulated,
        ...(sectorGeneration ? { sectorGeneration } : {}),
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
    } catch (error: any) {
      const pgCode = error?.cause?.code ?? error?.code;
      if (pgCode === "23503") {
        return res.status(409).json({ message: "Cannot delete this country because it is still referenced by users, schools, assessments, or questions. Remove those references first." });
      }
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
          await storage.createQuizQuestion({
            question: q.question,
            questionType: q.questionType,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            subject: q.subject,
            grade: q.grade, // Individual grade (8-12) - primary field
            countryId: id,
            curriculum: q.curriculum,
            topic: q.topic,
            difficulty: q.difficulty,
            cognitiveLevel: q.cognitiveLevel,
            isLlmGenerated: true,
            llmModel: "claude-sonnet-4-6",
          });
          created++;
        } catch (e) {
          console.error("Error creating question:", e);
        }
      }

      console.log(`[Country] Created ${created}/${result.questions?.length || 0} questions for ${country.name}`);

      // Auto-create subject entry if it doesn't exist yet
      const existingSubject = await storage.getSubjectByCode(id, curriculum, subject.toLowerCase().replace(/\s+/g, "_"));
      if (!existingSubject && created > 0) {
        try {
          const subjectCode = subject.toLowerCase().replace(/\s+/g, "_");
          const displayName = subject
            .split(/[\s_]+/)
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          await storage.createSubject({
            name: displayName,
            code: subjectCode,
            countryId: id,
            curriculum: curriculum || "National",
            isActive: true,
            displayOrder: 0,
          });
          console.log(`[Country] Auto-created subject "${displayName}" for ${country.name}`);
        } catch (subjectError: any) {
          // If duplicate, that's fine — another request may have created it
          if (!subjectError?.message?.includes("unique") && !subjectError?.cause?.code?.includes("23505")) {
            console.warn(`[Country] Could not auto-create subject: ${subjectError.message}`);
          }
        }
      }

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
