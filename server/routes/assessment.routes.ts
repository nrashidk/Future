import type { Express } from "express";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { insertAssessmentSchema } from "@shared/schema";
import { z } from "zod";
import { calculateRiasecScores } from "../questionBanks/riasec";
import { normalizeSubjects } from "../utils/subjects";
import { validatePromptInputFields } from "../utils/assessmentValidation";
import { sanitizeRequestBody } from "../utils/sanitize";
import { printTokenAuthorizes } from "../utils/printToken";

/**
 * Normalize assessment payload before validation
 * - Promotes educationLevel → grade for backwards compatibility
 * - Normalizes favorite subjects to canonical quiz subjects
 * - Returns { normalized: data } on success or { error: message } on validation failure
 */
function normalizeAssessmentPayload(body: any): { normalized?: any; error?: string } {
  const normalized = { ...body };
  
  // Handle educationLevel → grade migration with coercion and conflict detection
  if (normalized.educationLevel && !normalized.grade) {
    console.log(`[Normalization] Promoting educationLevel → grade: ${normalized.educationLevel}`);
    normalized.grade = String(normalized.educationLevel).trim();
    delete normalized.educationLevel;
  } else if (normalized.educationLevel && normalized.grade) {
    // Both fields present - coerce to strings and compare
    const educationLevelNorm = String(normalized.educationLevel).trim();
    const gradeNorm = String(normalized.grade).trim();
    
    if (educationLevelNorm !== gradeNorm) {
      return {
        error: `Conflicting grade fields: educationLevel (${normalized.educationLevel}) does not match grade (${normalized.grade}). Please provide only one.`
      };
    }
    console.log(`[Normalization] Removing duplicate educationLevel field (matches grade: ${normalized.grade})`);
    delete normalized.educationLevel;
  }
  
  // Normalize favorite subjects to canonical quiz subjects
  if (normalized.favoriteSubjects && Array.isArray(normalized.favoriteSubjects)) {
    const originalSubjects = [...normalized.favoriteSubjects];
    normalized.favoriteSubjects = normalizeSubjects(normalized.favoriteSubjects);
    
    // Log normalization for debugging
    if (JSON.stringify(originalSubjects) !== JSON.stringify(normalized.favoriteSubjects)) {
      console.log(`[Normalization] Subjects normalized: ${originalSubjects.join(', ')} → ${normalized.favoriteSubjects.join(', ')}`);
    }
  }
  
  return { normalized };
}

/**
 * The five assessment fields a school states on its students' behalf.
 *
 * `age` is deliberately absent. organization_members.student_age is nullable,
 * excluded from the demographics CHECK, and NULL on every row — migration
 * 014:29-38 records why: no form has ever collected it and there is no DOB column
 * to derive it from. There is no school-side value to lock to, and inventing one
 * would put a fabricated age in a minor's record. It stays student-supplied.
 */
export const SCHOOL_OWNED_ASSESSMENT_FIELDS = ['name', 'grade', 'gender', 'countryId', 'curriculum'] as const;

type SchoolOwnedField = typeof SCHOOL_OWNED_ASSESSMENT_FIELDS[number];

/**
 * Decide what a school's rows say about the fields this PATCH is touching.
 *
 * Pure so the rule can be tested without a database or a mounted route; the
 * caller owns the lookups and the response. Returns the values to write and the
 * fields the school could not supply.
 *
 * FAILS CLOSED. A field the school owns but has no value for is reported in
 * `missing`, never left as the student's own input — the previous behaviour let
 * the student's value win precisely when the school's was unavailable.
 *
 * `organization` may be null when the payload touches none of the two fields it
 * owns; countryId/curriculum are only ever reported missing if the payload
 * actually names them, so passing null to save a query cannot manufacture a
 * failure.
 */
export function resolveSchoolOwnedFields(
  updateData: Record<string, unknown>,
  member: { studentName?: string | null; studentGender?: string | null; grade?: string | null },
  organization: { countryId?: string | null; curriculum?: string | null } | null | undefined,
): { overrides: Partial<Record<SchoolOwnedField, unknown>>; missing: SchoolOwnedField[] } {
  const schoolValues: Record<SchoolOwnedField, unknown> = {
    name: member.studentName,
    grade: member.grade,
    gender: member.studentGender,
    countryId: organization?.countryId,
    curriculum: organization?.curriculum,
  };

  const overrides: Partial<Record<SchoolOwnedField, unknown>> = {};
  const missing: SchoolOwnedField[] = [];

  for (const field of SCHOOL_OWNED_ASSESSMENT_FIELDS) {
    if (updateData[field] === undefined) continue;
    const value = schoolValues[field];
    // An empty string is as unusable as null here: it satisfies a NOT NULL while
    // still failing every downstream `!assessment.grade` check.
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      missing.push(field);
    } else {
      overrides[field] = value;
    }
  }

  return { overrides, missing };
}

export function registerAssessmentRoutes(app: Express) {
  app.post("/api/assessments", async (req: any, res) => {
    try {
      // Sanitize user input to prevent XSS
      const sanitizedBody = sanitizeRequestBody(req.body);

      // Bound/whitelist the free-text fields that reach the LLM prompt
      // (favoriteSubjects, careerAspirations) before anything is persisted.
      const promptFieldError = await validatePromptInputFields(sanitizedBody);
      if (promptFieldError) {
        return res.status(400).json({ message: promptFieldError });
      }

      // Normalize payload before validation
      const normalizationResult = normalizeAssessmentPayload(sanitizedBody);
      if (normalizationResult.error) {
        return res.status(400).json({ message: normalizationResult.error });
      }
      const validatedData = insertAssessmentSchema.parse(normalizationResult.normalized);

      // Check if user is authenticated and get userId
      const userId = req.isAuthenticated() 
        ? (req.user.userId) 
        : null;
      const isGuest = !userId;

      // For guest users, generate a cryptographically secure unique guest token
      const guestToken = isGuest ? `guest_${Date.now()}_${randomBytes(16).toString('hex')}` : null;

      // Calculate RIASEC scores if responses provided (premium users)
      let riasecScores = null;
      let assessmentType = 'basic';
      
      if (validatedData.riasecResponses) {
        try {
          riasecScores = calculateRiasecScores(validatedData.riasecResponses);
          assessmentType = 'premium';
        } catch (error) {
          console.error("Error calculating RIASEC scores:", error);
        }
      }

      if (validatedData.cvqResponses) {
        assessmentType = 'premium';
      }

      // For organization students, inherit curriculum from their organization
      let assessmentCurriculum = validatedData.curriculum;
      
      if (userId) {
        // MEMBERSHIP COMES FROM THE MEMBER ROW, NOT users.accountType — the last
        // of the five sites to move (14459a4, e9f8d81, 15203ec, 6fd8946).
        // organizationMembers.userId is .unique() (schema.ts:151), so the row
        // both proves membership and names the school in one query; accountType
        // is a bare text column with eight write sites, only one of which shares
        // a transaction with the member insert, and auth.ts:353 already writes a
        // value outside its own documented set.
        //
        // role === 'student', not merely "has a member row": school admins share
        // this table (schema.ts:159) and are not students of their own school.
        //
        // This also removes a query. The old code fetched the user only to read
        // accountType off it, then fetched the member row anyway.
        const orgMember = await storage.getOrganizationMemberByUserId(userId);

        if (orgMember?.role === 'student') {
          // LICENSE GUARD (school students only): a school license grants a
          // student a limited number of assessment allocations. Block creation
          // when the student has no unused allocation left.
          //
          // Framed as "does the student have an available (unused) allocation?"
          // rather than "have they ever completed one." Today the license grants a
          // single lifetime allocation, so a consumed allocation == one completed
          // assessment (hasCompletedAssessment === true). Keeping the check
          // allocation-shaped lets PD2 relax it without rewriting the guard.
          //
          // PD2: when per-period re-assessment is added, an allocated new period
          // grants a fresh allocation here — compute unused allocations for the
          // active period instead of reading the single hasCompletedAssessment flag.
          //
          // The old "fail-open on a missing orgMember row" caveat is gone with
          // the accountType test that created it: the row IS the membership test
          // now, so its absence means "not a school student" rather than "a
          // school student we failed to look up". The state it was hedging
          // against — a committed org_student users row with no membership —
          // was 8c07e25's orphan bug, and is unreachable since that insert
          // became transactional.
          if (orgMember.hasCompletedAssessment) {
            return res.status(403).json({
              message: "Assessment already completed for this allocation",
            });
          }

          // FAILS CLOSED, matching the PATCH lock (14459a4). This previously
          // fell through to validatedData.curriculum — the student's own pick
          // silently won precisely when the school's value was unavailable,
          // which is the one case the inheritance exists for. 549cd43 refuses to
          // enrol a student into a school with no curriculum, so reaching this
          // means an invariant has already broken; it is logged as a server
          // error even though the response is a 4xx.
          //
          // Same known population as the PATCH guard: a student enrolled BEFORE
          // 549cd43 into a school missing country or curriculum. That guard is
          // runtime, not a backfill, so nothing proves the set is empty — see
          // docs/v2-phase4-step3-recon.md §2. Such a student is blocked here
          // rather than starting an assessment drawn from the wrong quiz bank.
          const organization = await storage.getOrganizationById(orgMember.organizationId);
          if (!organization?.curriculum) {
            console.error(
              `[assessment POST] curriculum unavailable for member ${orgMember.id} ` +
                `(org ${orgMember.organizationId})`,
            );
            return res.status(400).json({
              message:
                "School setup incomplete: your school has no curriculum on record, so an " +
                "assessment cannot be started. Ask your school administrator to complete " +
                "the school's setup.",
            });
          }

          // Override curriculum with organization's curriculum for org students
          assessmentCurriculum = organization.curriculum;
        }
      }

      const assessment = await storage.createAssessment({
        ...validatedData,
        userId,
        isGuest,
        guestSessionId: guestToken,
        assessmentType,
        riasecScores,
        curriculum: assessmentCurriculum,
      });

      // Set guest token in httpOnly cookie for security (prevents XSS token theft)
      if (isGuest && guestToken) {
        res.cookie("guest_token", guestToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
      }

      // Return assessment without exposing guest token in response body
      res.json(assessment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating assessment:", error);
      res.status(500).json({ message: "Failed to create assessment" });
    }
  });

  app.get("/api/assessments/my", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = req.user.userId;
      const assessments = await storage.getAssessmentsByUser(userId);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ message: "Failed to fetch assessments" });
    }
  });

  // Get a single assessment by ID (supports guest token auth)
  app.get("/api/assessments/:id", async (req: any, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.id);
      if (!assessment) {
        // Anti-enumeration: return the same 403 as the not-owned case below so a
        // missing ID is indistinguishable from one the caller doesn't own.
        return res.status(403).json({ message: "Unauthorized to access this assessment" });
      }

      // Server-side PDF render: a print token scoped to THIS assessment
      // authorizes the read (the headless browser carries no session cookie or
      // guest token). Scoped to req.params.id exactly — a token minted for
      // assessment A can never read B (see printTokenAuthorizes). This route
      // supplies the basic-info fields the report needs, so it must accept it.
      const isPrintTokenOwner = printTokenAuthorizes(req.query.printToken, req.params.id);

      // Ownership check: authenticated user must own it, or guest token must match
      if (assessment.userId) {
        if (!isPrintTokenOwner && (!req.isAuthenticated() || req.user.userId !== assessment.userId)) {
          return res.status(403).json({ message: "Unauthorized to access this assessment" });
        }
      } else {
        // Guest assessment: verify via cookie or query param
        const guestToken = req.cookies?.guest_token || req.query.guestToken;
        if (!isPrintTokenOwner && (!guestToken || guestToken !== assessment.guestSessionId)) {
          return res.status(403).json({ message: "Unauthorized to access this assessment" });
        }
      }

      res.json(assessment);
    } catch (error) {
      console.error("Error fetching assessment:", error);
      res.status(500).json({ message: "Failed to fetch assessment" });
    }
  });

  // Alias endpoint for backward compatibility
  app.get("/api/assessments", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = req.user.userId;
      const assessments = await storage.getAssessmentsByUser(userId);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ message: "Failed to fetch assessments" });
    }
  });

  app.patch("/api/assessments/:id", async (req: any, res) => {
    try {
      // Validation: Ensure request body is an object
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ message: "Request body must be an object" });
      }

      // Ownership verification — fetch assessment first, then check caller has rights
      const existingAssessment = await storage.getAssessmentById(req.params.id);
      if (!existingAssessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      if (existingAssessment.userId) {
        // Authenticated user assessment — caller must be that user
        if (!req.isAuthenticated || !req.isAuthenticated() || req.user?.userId !== existingAssessment.userId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      } else if (existingAssessment.guestSessionId) {
        // Guest assessment — verify via guest_token cookie
        const guestToken = req.cookies?.guest_token;
        if (!guestToken || guestToken !== existingAssessment.guestSessionId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      } else {
        // Neither owner column set. The chain was `if / else if` with no else, so
        // such a row reached the update having had NO ownership check at all and
        // was writable by any unauthenticated caller. GET on this same resource
        // already fails closed on the identical shape (:212-218 uses a plain
        // else, and a NULL guestSessionId can never match a presented token), so
        // this closes an asymmetry rather than inventing a rule.
        //
        // Defensive: prod and staging both return zero rows with both columns
        // NULL. It is unreachable through any create path — POST always sets one
        // or the other (:80-82) — but it is one line and the alternative is an
        // unauthenticated write.
        return res.status(403).json({ message: "Forbidden" });
      }

      // Sanitize user input to prevent XSS
      const sanitizedBody = sanitizeRequestBody(req.body);
      
      // Define allowed fields for assessment updates.
      // SECURITY (M1): server-derived fields are intentionally NOT client-writable.
      // assessmentType (the free/premium flag), quizScore, isCompleted, riasecScores
      // and cvqScores are computed server-side — letting the client PATCH them allowed
      // a free user to self-upgrade to premium (assessmentType: 'premium') and to forge
      // scores/completion. assessmentType and riasecScores are still derived below from
      // the client-supplied *Responses, so the legitimate premium upgrade path is intact.
      //
      // 'curriculum' IS client-writable, and has to be: the student picks it in
      // CountryStep alongside the country, and the quiz filters its question
      // pool on {countryId, grade, curriculum}. It was missing from this list,
      // so every PATCH silently dropped it (POST already accepted it) and the
      // column stayed NULL for any assessment saved through the update path —
      // which is all of them after the first save. The org-student override
      // below mirrors POST so a school's curriculum still wins.
      const allowedFields = [
        'name', 'age', 'grade', 'gender', 'countryId', 'curriculum', 'favoriteSubjects',
        'prioritySubjects', 'interests', 'personalityTraits', 'careerAspirations',
        'strengths', 'workPreferences', 'riasecResponses', 'cvqResponses',
        'subjectCompetencies',
        'currentStep', 'completedAt',
        // NOT a column on assessments, and unlike educationLevel below there is
        // no shim that consumes it: nothing in client/src, server or shared
        // reads or writes currentStepMetadata. It reached updateAssessment and
        // was silently discarded by drizzle, whose buildUpdateSet iterates the
        // TABLE's columns and emits only those present in the set object. Dead,
        // inert, removed.
        //
        // educationLevel IS load-bearing and stays. It is not a column either,
        // but normalizeAssessmentPayload (:19-52) promotes it to `grade` and
        // deletes it — and this filter runs BEFORE that normalization, so
        // dropping it from the allowlist would strip the field before the shim
        // could see it, silently breaking any client still sending the legacy
        // name.
        'educationLevel'
      ];
      
      // Mass-assignment defense (M1): silently drop any field not on the allowlist
      // (e.g. the server-derived assessmentType/scores) and process only the allowed
      // ones, instead of rejecting the whole request. This keeps legit clients that
      // still send a now-disallowed field working, while preventing premium/score
      // escalation via unexpected fields.
      const filteredBody: Record<string, any> = {};
      for (const field of allowedFields) {
        if (sanitizedBody[field] !== undefined) {
          filteredBody[field] = sanitizedBody[field];
        }
      }

      // Same prompt-field bounds/whitelist as POST. PATCH runs no zod, so this
      // is the only guard here. Partial-update safe: fields absent from the
      // payload are skipped, so a PATCH that doesn't touch subjects/aspirations
      // is never rejected for them.
      const promptFieldError = await validatePromptInputFields(filteredBody);
      if (promptFieldError) {
        return res.status(400).json({ message: promptFieldError });
      }

      // Normalize payload before processing
      const normalizationResult = normalizeAssessmentPayload(filteredBody);
      if (normalizationResult.error) {
        return res.status(400).json({ message: normalizationResult.error });
      }
      const updateData = { ...normalizationResult.normalized };

      // Calculate RIASEC scores if responses provided
      if (updateData.riasecResponses) {
        try {
          updateData.riasecScores = calculateRiasecScores(updateData.riasecResponses);
          updateData.assessmentType = 'premium';
          console.log("RIASEC scores calculated on update:", updateData.riasecScores);
        } catch (error) {
          console.error("Error calculating RIASEC scores:", error);
        }
      }

      if (updateData.cvqResponses) {
        updateData.assessmentType = 'premium';
      }

      // SCHOOL-OWNED FIELDS. A school enrols its students and records their name,
      // gender and grade on their behalf, and picks the country and curriculum the
      // whole school sits under. Those five are the school's to state, not the
      // student's to edit — the quiz bank is selected on {countryId, grade,
      // curriculum}, and the analytics rollups group on the school's copy, so a
      // student who edits them here detaches their own results from both.
      //
      // Previously only `curriculum` was overridden, so name, grade, gender and
      // countryId were freely writable by any student with the endpoint. The
      // field list and the resolution rule live at SCHOOL_OWNED_ASSESSMENT_FIELDS
      // / resolveSchoolOwnedFields above, including why `age` is not among them.
      //
      // MEMBERSHIP COMES FROM THE MEMBER ROW, NOT users.accountType.
      // organizationMembers.userId is .unique() (schema.ts:151), so the row both
      // proves membership and names the school in one query. accountType is a
      // bare text column with eight write sites, only one of which
      // (storage.ts:2817) is in the same transaction as the member insert, and
      // auth.ts:353 already writes a fourth value ("public") outside its own
      // documented set. Keying on it means a student whose flag is wrong keeps a
      // member row, a school and CHECK-constrained demographics while escaping
      // this lock entirely.
      //
      // role === 'student' is the test, not merely "has a member row": this table
      // holds school admins too (schema.ts:159), and an admin taking the
      // assessment personally is not a student of their school.
      const touchesSchoolOwned = SCHOOL_OWNED_ASSESSMENT_FIELDS.some((f) => updateData[f] !== undefined);

      if (touchesSchoolOwned && existingAssessment.userId) {
        const orgMember = await storage.getOrganizationMemberByUserId(existingAssessment.userId);

        if (orgMember?.role === 'student') {
          // The organization row is only needed for the two fields it owns, so a
          // Demographics-step save (name/age/grade/gender, no country) costs one
          // query rather than two. Combined with the touchesSchoolOwned gate
          // above, a save that touches none of the five — every step after
          // Country, which is most autosaves — costs none at all. The old gate
          // could not carry over: it tested `curriculum !== undefined`, and these
          // fields are present on most demographics saves.
          const needsOrganization =
            updateData.countryId !== undefined || updateData.curriculum !== undefined;
          const organization = needsOrganization
            ? await storage.getOrganizationById(orgMember.organizationId)
            : null;

          const { overrides, missing } = resolveSchoolOwnedFields(updateData, orgMember, organization);

          // FAIL CLOSED. The old block returned the student's own value whenever
          // a lookup came up short — the student's input silently won precisely
          // when the school's was unavailable. Every one of these five is
          // supposed to be guaranteed: name/gender/grade by the CHECK
          // (schema.ts:188-191), countryId/curriculum by the enrolment guard
          // (549cd43), which refuses to enrol into a school missing either.
          // Reaching this branch therefore means an invariant has already broken,
          // so it is logged as a server error even though the response is a 4xx.
          //
          // Known population at risk: a student enrolled BEFORE 549cd43 into a
          // school with no country or curriculum. That guard is runtime, not a
          // backfill, so nothing proves the set is empty — see
          // docs/v2-phase4-step3-recon.md §2. Such a student is blocked here
          // rather than quietly writing their own value.
          if (missing.length > 0) {
            console.error(
              `[assessment PATCH] school-owned field(s) unavailable for member ${orgMember.id} ` +
                `(org ${orgMember.organizationId}): ${missing.join(', ')}`,
            );
            return res.status(400).json({
              message:
                `School setup incomplete: your school has no ${missing.join(' and ')} on record, ` +
                `so ${missing.length > 1 ? 'those fields cannot' : 'that field cannot'} be saved. ` +
                `Ask your school administrator to complete the school's setup.`,
            });
          }

          // Silently overwrite rather than reject. The next commit disables these
          // fields in the Demographics and Country steps, so a mismatch here means
          // a stale form or a direct API call — neither of which gives the student
          // anything to act on, and a 400 would strand a mid-assessment autosave.
          Object.assign(updateData, overrides);
        }
      }

      const assessment = await storage.updateAssessment(req.params.id, updateData);
      res.json(assessment);
    } catch (error) {
      console.error("Error updating assessment:", error);
      res.status(500).json({ message: "Failed to update assessment" });
    }
  });

  app.post("/api/assessments/migrate", isAuthenticated, async (req: any, res) => {
    try {
      const { guestAssessmentIds, guestSessionId } = req.body;
      const userId = req.user.userId;

      if (!Array.isArray(guestAssessmentIds) || guestAssessmentIds.length === 0) {
        return res.status(400).json({ message: "No assessments to migrate" });
      }

      if (!guestSessionId) {
        return res.status(400).json({ message: "Guest session ID required for migration" });
      }

      const migratedCount = await storage.migrateGuestAssessments(guestAssessmentIds, userId, guestSessionId);

      res.json({ 
        success: true, 
        migratedCount,
        message: `Successfully migrated ${migratedCount} assessment(s) to your account` 
      });
    } catch (error) {
      console.error("Error migrating assessments:", error);
      res.status(500).json({ message: "Failed to migrate assessments" });
    }
  });
}
