/**
 * Country Management Routes
 * 
 * Allows superadmins to add, update, and delete countries with LLM auto-population.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage, SubjectNotInCatalogueError } from "../storage";
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
  /**
   * The curricula this country offers, optional.
   *
   * Creation previously had no way to accept these -- a country was always
   * written with an empty list, and the only route to giving it any was a
   * second PUT. Supplying them here lets a country be created complete in one
   * call, and it is what makes the subject seeding below run at creation
   * rather than on a later update.
   */
  curricula: z.array(z.string().min(1).max(100)).max(20).optional(),
  /**
   * The Arabic name, optional.
   *
   * Creation had no way to accept one, so every new country started with a
   * null Arabic name and the only routes to filling it were auto-population
   * or a later edit -- in a product that is bilingual throughout, including
   * the PDF. The picker supplies it from the ISO list, where the Arabic names
   * are maintained rather than typed by whoever happened to add the country.
   */
  nameAr: z.string().min(1).max(200).optional().nullable(),
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
 * vision component.
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

      /**
       * READINESS ON THE LIST ITSELF, not behind a click.
       *
       * A country that cannot produce a usable report looked identical to one
       * that could: same row, same name, nothing to distinguish them. The gaps
       * that cause it are all silent at the point they are created and
       * permanent afterwards -- a missing sector map makes every career score
       * the same for national-vision alignment, and a curriculum with fewer
       * than three subjects cannot be got past the first step of the
       * assessment at all.
       *
       * So the summary travels with the list. A superadmin who adds a country
       * and walks away sees the problem on the screen they are already on,
       * rather than when a school in that country reports a broken report
       * months later.
       */
      const withReadiness = await Promise.all(
        countries.map(async (c: any) => {
          const readiness = await storage.getCountryReadiness(c.id);
          return {
            ...c,
            readiness: readiness
              ? {
                  ready: readiness.ready,
                  blockerCount: readiness.blockers.length,
                  warningCount: readiness.warnings.length,
                  blockers: readiness.blockers,
                  warnings: readiness.warnings,
                }
              : null,
          };
        }),
      );

      res.json(withReadiness);
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  /**
   * The same gap table a school sees, for a superadmin, for any curriculum.
   *
   * Two populations fill the question bank -- generation and school
   * contributions -- and until now they were aimed independently, which is how
   * a bank ends up lopsided. Both now read the same table, so generating is
   * directed at the cells schools have not covered rather than at whatever was
   * typed into the form.
   */
  app.get("/api/admin/countries/:id/question-gaps", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Superadmin access required" });
      }

      const country = await storage.getCountryById(req.params.id);
      if (!country) return res.status(404).json({ message: "Country not found" });

      // Every curriculum the country offers, not one named by the caller: a
      // superadmin deciding where to generate needs to see the whole country,
      // and a curriculum missing from such a list is how it stays empty.
      const perCurriculum = [];
      for (const curriculum of country.curricula ?? []) {
        const gaps = await storage.getQuestionGaps(req.params.id, curriculum);
        if (gaps) perCurriculum.push(gaps);
      }

      res.json({ countryId: req.params.id, curricula: perCurriculum });
    } catch (error) {
      console.error("Error reading question gaps:", error);
      res.status(500).json({ message: "Failed to read question gaps" });
    }
  });

  /**
   * The full readiness breakdown for one country -- per-curriculum subject and
   * question counts, and the sector-map row count behind the summary above.
   */
  app.get("/api/admin/countries/:id/readiness", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Superadmin access required" });
      }

      const readiness = await storage.getCountryReadiness(req.params.id);
      if (!readiness) {
        return res.status(404).json({ message: "Country not found" });
      }
      res.json(readiness);
    } catch (error) {
      console.error("Error checking country readiness:", error);
      res.status(500).json({ message: "Failed to check country readiness" });
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
      const parsed = parseResult.data;

      const existing = await storage.getCountryById(id);
      if (existing) {
        return res.status(409).json({ message: "Country with this ID already exists" });
      }

      let countryData: any = {
        id,
        name,
        nameAr: parsed.nameAr ?? null,
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
        // Supplied by the caller, or filled in by auto-population further down.
        // Either way the subject seeding after createCountry sees them, so a
        // country created with its curricula is never a dead end.
        curricula: parsed.curricula ?? [],
        subjects: [],
        gradeLevels: ["8", "9", "10", "11", "12"],
        logoUrl: null,
        reportTheme: null,
        isActive: true,
        llmPopulated: false,
      };

      // Curricula the model reports as taught in the country but which the
      // country is deliberately NOT created with -- see the note on `curricula`
      // below.
      let suggestedCurricula: string[] = [];

      if (autoPopulate) {
        console.log(`[Country] Auto-populating data for ${name} using LLM...`);
        const result = await researchCountryData(storage, name, code);
        
        if (result.success && result.data) {
          suggestedCurricula = (result.data.curricula ?? []).filter(
            (c) => c !== result.data!.nationalCurriculum,
          );
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
            /**
             * THE NATIONAL CURRICULUM ONLY.
             *
             * This used to take the model's whole list, so a country arrived
             * offering four curricula at once -- and every curriculum offered
             * is a commitment to fill, because it needs its own questions for
             * each subject and grade or the quiz silently borrows another
             * country's. The UAE shipped exactly that way: four offered, one
             * with content.
             *
             * The national curriculum is also the right one to lead with for
             * a platform sold to ministries, and it is the one the question
             * bank will actually cover. The others come back as suggestions
             * (suggestedCurricula in the response) for a superadmin to add
             * deliberately, once there is content behind them.
             *
             * Falls back to the model's first entry if it did not name a
             * national curriculum, and to nothing at all if it named none --
             * an empty list is recoverable and the readiness check reports it,
             * whereas a wrong curriculum name becomes a key schools match on.
             */
            curricula: result.data.nationalCurriculum
              ? [result.data.nationalCurriculum]
              : (result.data.curricula ?? []).slice(0, 1),
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

      /**
       * EVERY CURRICULUM GETS ITS SUBJECT ROWS, IMMEDIATELY.
       *
       * Creating a country wrote its curricula list and nothing else, so a new
       * country offered curricula with no subjects behind them. Because the
       * assessment makes a student choose three subjects, each of those was a
       * dead end at the first step -- an empty list, nothing having refused the
       * choice, discovered only by a student sitting in front of it. UAE
       * shipped that way for three of its four curricula.
       *
       * Done here rather than left to the model. The research prompt does
       * return a list of subject names, but the student-facing vocabulary is
       * six fixed subjects that career matching is hard-coded to, so a
       * generated seventh would silently score every career as a non-match.
       * storage.ensureCurriculumSubjects explains that in full; what varies
       * between curricula is naming, which lives in aliases.
       */
      const subjectSeeding: Array<{ curriculum: string; created: number }> = [];
      for (const curriculum of countryData.curricula ?? []) {
        try {
          const { created } = await storage.ensureCurriculumSubjects(country.id, curriculum);
          subjectSeeding.push({ curriculum, created });
        } catch (e) {
          // A country with no subjects is recoverable -- the readiness check
          // reports it as a blocker and Repopulate fixes it -- so this must not
          // fail the creation that already succeeded.
          console.error(`[Country] Failed to seed subjects for ${curriculum}:`, e);
        }
      }
      console.log(`[Country] Seeded subjects:`, JSON.stringify(subjectSeeding));

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
        // Which curricula the model found but the country was NOT created with
        // -- offered to the superadmin to add deliberately, once there is
        // question content to back them. Adding one creates its subjects.
        ...(suggestedCurricula.length ? { suggestedCurricula } : {}),
        // Subject rows created per curriculum, so the caller can see the
        // country is usable rather than having to go and look.
        subjectSeeding,
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

      /**
       * A CURRICULUM GETS ITS SUBJECTS THE MOMENT IT IS OFFERED.
       *
       * This is where curricula are actually set for a country added by hand:
       * the create route hardcodes an empty list and only auto-population
       * fills it in, so a human clicking through the screens arrives here. Add
       * a curriculum and, until now, it appeared in the dropdown with nothing
       * behind it -- and because the assessment makes a student pick three
       * subjects, choosing it was a dead end at the first step. UAE shipped
       * that way for three of its four curricula.
       *
       * Seeding on the write that offers the curriculum is what makes the dead
       * end unreachable rather than merely reported. The readiness check still
       * exists to catch a curriculum whose subjects were removed afterwards.
       *
       * Idempotent, and it skips any subject name a curator already added, so
       * repeated saves and hand-curated curricula are both safe. It never
       * fails the update that already succeeded.
       */
      if (updates.curricula && updates.curricula.length > 0) {
        for (const curriculum of updates.curricula) {
          try {
            await storage.ensureCurriculumSubjects(id, curriculum);
          } catch (e) {
            console.error(`[Country] Failed to seed subjects for ${curriculum}:`, e);
          }
        }
      }

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

      // RESOLVE THE SUBJECT THE CALLER NAMED, BEFORE GENERATING ANYTHING.
      //
      // This endpoint used to store `q.subject` — the model's echo of the string
      // interpolated into its own prompt (llmCountryService.ts:403). Nothing
      // enforced the echo: safeParseJSON is JSON.parse plus an `as T` cast, and
      // GeneratedQuestion is an interface, erased at runtime. A drift as small as
      // "Math" for "Mathematics" produced a row no student's quiz could ever
      // contain, with no error on any path.
      //
      // The model has no business naming the subject: the caller already did. So
      // the caller's string is resolved against the catalogue here, and that one
      // resolved name is written on every row below.
      let subjectName: string;
      try {
        subjectName = await storage.resolveSubjectName(id, curriculum, subject);
      } catch (e) {
        if (e instanceof SubjectNotInCatalogueError) {
          return res.status(e.status).json({ message: e.message });
        }
        throw e;
      }

      console.log(`[Country] Generating ${count} questions for ${country.name} - ${subjectName} Grade ${grade}`);

      const result = await generateCountryQuizQuestions(
        storage,
        id,
        country.name,
        subjectName,
        grade,
        curriculum,
        count
      );

      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to generate questions" });
      }

      // A caller who asked for 10 and got 7 must be able to see WHICH three and
      // WHY. This loop used to console.error and move on, so the only signal was
      // a number that did not match the one requested.
      let created = 0;
      const failures: Array<{ index: number; question: string; reason: string }> = [];
      const generated = result.questions || [];

      for (const [index, q] of generated.entries()) {
        try {
          await storage.createQuizQuestion({
            question: q.question,
            questionType: q.questionType,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            subject: subjectName, // NOT q.subject — see the resolve above
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
          const reason = e instanceof Error ? e.message : String(e);
          const preview = typeof q?.question === "string" && q.question.trim()
            ? q.question.slice(0, 80)
            : "(no question text returned)";
          console.error(`[Country] Question ${index} not stored: ${reason}`, e);
          failures.push({ index, question: preview, reason });
        }
      }

      console.log(`[Country] Created ${created}/${generated.length} questions for ${country.name}`);

      // THE AUTO-CREATE BLOCK THAT STOOD HERE IS GONE, and its removal is the
      // point rather than a side effect. It manufactured a catalogue row AFTER
      // the writes, deriving code and name from the REQUEST string while the rows
      // carried the MODEL's string — two values that need not agree — so a drift
      // left every row pointing at a subject that still did not exist. Resolving
      // up front means a subject that is not in the catalogue is now a 400 before
      // any tokens are spent, and this block could never fire again.
      //
      // WORKFLOW CHANGE, deliberate: a superadmin generating for a brand-new
      // subject must create it in the subject catalogue first. Previously the
      // catalogue bent to whatever was typed, which is how the second vocabulary
      // got into quiz_questions.subject in the first place.

      res.json({
        success: true,
        subject: subjectName,
        questionsGenerated: generated.length,
        questionsCreated: created,
        failures,
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
        /**
         * REPOPULATE MUST NOT WIDEN WHAT A COUNTRY OFFERS.
         *
         * This took the model's whole curricula list, so refreshing a country
         * could ADD curricula -- each one offered with no questions behind it.
         * A refresh is for correcting the country's own data, not for taking
         * on new content commitments.
         *
         * So existing curricula are kept as they are, and the national one is
         * added only if it is somehow missing. Adding an international
         * curriculum stays a deliberate act.
         */
        curricula: (() => {
          const current = country.curricula ?? [];
          const national = result.data!.nationalCurriculum;
          if (national && !current.includes(national)) return [national, ...current];
          return current;
        })(),
        subjects: result.data!.subjects,
        gradeLevels: result.data!.gradeLevels,
        llmPopulated: true,
      });

      /**
       * AND BACKFILL THE SUBJECT ROWS, which is what makes this route able to
       * repair an existing country rather than only refresh its prose.
       *
       * Repopulate rewrote the curricula list without touching subjects, so a
       * country could come out of it offering MORE curricula than before and
       * every new one a dead end. Idempotent, so a country that already has
       * its rows is unaffected.
       */
      // Seeded against what the country NOW OFFERS, not against the model's
      // list -- those are deliberately different since repopulate stopped
      // widening the offer, and seeding from the model's list would create
      // subject rows for curricula the country does not offer.
      const subjectSeeding: Array<{ curriculum: string; created: number }> = [];
      for (const curriculum of updatedCountry.curricula ?? []) {
        try {
          const { created } = await storage.ensureCurriculumSubjects(req.params.id, curriculum);
          subjectSeeding.push({ curriculum, created });
        } catch (e) {
          console.error(`[Country] Failed to seed subjects for ${curriculum}:`, e);
        }
      }

      /**
       * REGENERATE THE SECTOR MAPS TOO -- this is the whole point of the
       * route, and it used not to happen.
       *
       * repopulate updated mission, vision, prioritySectors, curricula and
       * subjects and stopped there. But calculateVisionScore reads
       * country_sector_categories, and without those rows every career scores
       * VISION_FLOOR, so the vision component -- 30% of a basic report, 20%
       * of premium -- becomes a constant that cannot tell one career from
       * another. The report still renders and looks correct; the only trace
       * is a SCORING WARNING in the server log.
       *
       * Those rows are written in exactly one place, persistGeneratedSectors,
       * and it was reachable only from the autoPopulate branch of country
       * creation. So a country created manually, or one whose sector
       * generation failed at creation, was stranded for good: no route and no
       * screen could ever fill the map, and repopulate -- the obvious thing
       * to reach for -- rewrote everything EXCEPT the part that was missing.
       *
       * Sector generation failing must not fail the whole call: the country
       * data above is already saved, and reporting the failure is more useful
       * than rolling back a good update. The outcome is returned so the
       * caller can see whether the map was actually written.
       */
      let sectorGeneration: Record<string, unknown> = { attempted: false };
      const sectors = result.data!.prioritySectors ?? [];
      if (sectors.length > 0) {
        try {
          const [careers, wefSkills] = await Promise.all([
            storage.getAllCareers(),
            storage.getAllWefSkills(),
          ]);
          const sectorResult = await generateSectorWefMappings(
            storage,
            country.name,
            sectors,
            { careerCatalog: careers, skillNames: wefSkills.map(s => s.name) },
          );
          for (const rejection of sectorResult.rejected ?? []) {
            console.warn(`[Country] Rejected sector "${rejection.sector}" (${rejection.gate} gate): ${rejection.reason}`);
          }
          for (const warning of sectorResult.warnings ?? []) {
            console.warn(`[Country] ${warning}`);
          }

          if (!sectorResult.success || !sectorResult.mappings) {
            console.error(`[Country] Sector regeneration failed: ${sectorResult.error}`);
            sectorGeneration = { attempted: true, persisted: false, error: sectorResult.error };
          } else {
            const wefSkillIdsByName = new Map(wefSkills.map(s => [skillKey(s.name), s.id]));
            const written = await persistGeneratedSectors(
              storage,
              id,
              country.name,
              sectorResult.mappings,
              wefSkillIdsByName,
            );
            sectorGeneration = {
              attempted: true,
              persisted: true,
              sectorsWritten: written.sectorsWritten,
              skillRowsWritten: written.skillRowsWritten,
              categoryRowsWritten: written.categoryRowsWritten,
              errors: written.errors,
            };
          }
        } catch (sectorError) {
          console.error("[Country] Sector regeneration threw:", sectorError);
          sectorGeneration = {
            attempted: true,
            persisted: false,
            error: sectorError instanceof Error ? sectorError.message : String(sectorError),
          };
        }
      }

      res.json({
        success: true,
        country: updatedCountry,
        tokensUsed: result.tokensUsed,
        sectorGeneration,
      });
    } catch (error) {
      console.error("Error repopulating country:", error);
      res.status(500).json({ message: "Failed to repopulate country data" });
    }
  });
}
