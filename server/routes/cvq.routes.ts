import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { isUniqueViolation } from "../utils/pgErrors";
import { isAuthenticated } from "../auth";
import { printTokenAuthorizes } from "../utils/printToken";

/**
 * Auth gate for the read-only CVQ result route. Passes when the caller is a
 * logged-in user OR presents a print token scoped to EXACTLY :assessmentId
 * (the server-side PDF render carries no session cookie). This does NOT weaken
 * auth: the token branch is still scoped — a token minted for assessment A can
 * never unlock B — and the handler re-checks ownership before returning data.
 */
const isAuthenticatedOrPrintToken: RequestHandler = (req: any, res, next) => {
  if (req.isAuthenticated() || printTokenAuthorizes(req.query.printToken, req.params.assessmentId)) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

/** Detect preferred language from Accept-Language or X-Language header */
function getRequestLanguage(req: any): string {
  const acceptLang = (req.headers["accept-language"] || "").toLowerCase();
  const xLang = (req.headers["x-language"] || "").toLowerCase();
  if (acceptLang.startsWith("ar") || xLang === "ar") return "ar";
  return "en";
}

/**
 * CREATE THE CVQ RESULT, OR CONVERGE ON THE ONE ALREADY THERE.
 *
 * cvq_results.assessment_id is UNIQUE (schema.ts:935) and this insert has no
 * ON CONFLICT and — unlike the quiz's generate route — no pre-check of any
 * kind. So a second submission for the same assessment raised 23505, fell into
 * the route's generic catch, and returned 500 "Failed to submit CVQ" for work
 * that had in fact been saved. It does not take a race: a plain network retry
 * on a slow connection is enough, and the student is told their submission
 * failed with no way to learn that it did not.
 *
 * HOW THIS GOT HERE IS WORTH NAMING, because it is the same shape as the quiz
 * case (a1a8878). The IDOR note in the route above reasons carefully about this
 * exact unique constraint — it is what lets one user squat another's single
 * canonical result slot. The constraint was considered; the error path it
 * creates was not. A constraint is a behaviour, not only a guarantee: something
 * has to answer the caller who hits it.
 *
 * RETURNS THE EXISTING RESULT RATHER THAN AN ERROR CODE. The quiz's
 * QUIZ_ALREADY_SUBMITTED exists to REFUSE a write that would overwrite a scored
 * quiz — a refusal the student must see. Nothing is refused here: the stored
 * result already satisfies the request. CVQStep discards the response body and
 * needs only success to advance (CVQStep.tsx:146-152), so a distinct code would
 * require a new client branch to reach the outcome a 200 reaches with none.
 *
 * NOT AN OVERWRITE. The stored result stands; a resubmission cannot replace it,
 * which is what "one canonical result per assessment" means and what the IDOR
 * note depends on.
 *
 * Extracted from the handler so it can be tested without an Express app —
 * following selectPartialAnswerUpdates in quiz.routes.ts.
 */
export async function persistCvqResult(
  assessmentId: string,
  userId: string,
  computed: {
    rawScores: Record<string, number>;
    normalizedScores: Record<string, number>;
    topValues: string[];
    itemResponses: unknown;
    completionSeconds: number | null;
    avgResponseVariance: number;
    lowVariance: boolean;
    rushedCompletion: boolean;
  },
): Promise<{ result: any; created: boolean }> {
  let result;
  let created = true;

  try {
    result = await storage.createCvqResult({ assessmentId, userId, ...computed } as any);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const existing = await storage.getCvqResultByAssessmentId(assessmentId);
    if (!existing) {
      // The constraint fired, so a row was there when the insert ran. Gone now
      // means something deleted it in between — exceptional, and not something
      // to paper over with a second insert attempt.
      throw error;
    }

    console.log(`[cvq] duplicate submit for assessment ${assessmentId}; converging on result ${existing.id}`);
    result = existing;
    created = false;
  }

  // Persist the server-computed CVQ scores onto the assessment (M1).
  // assessment.cvqScores is no longer client-writable via PATCH /api/assessments,
  // so this is now its authoritative writer. The value is derived ONLY from
  // server-computed scores (never from client input) and is shaped to match what
  // the values dimension of career matching expects (matching.ts:707): per-domain
  // 0-100 scores plus a top3 array.
  //
  // ON THE CONVERGED PATH IT IS WRITTEN FROM THE STORED ROW, not from the
  // responses just posted — the stored result is the canonical one, so the
  // assessment must agree with IT rather than with a submission that lost. It is
  // not skipped: a first attempt that inserted the row and then died before this
  // write leaves cvqScores null, and matching reads that field rather than the
  // cvq_results table. Repeating it is idempotent and self-heals that gap.
  await storage.updateAssessment(assessmentId, {
    cvqScores: created
      ? { ...computed.normalizedScores, top3: computed.topValues }
      : { ...(result.normalizedScores as Record<string, number>), top3: result.topValues },
  });

  return { result, created };
}

export function registerCvqRoutes(app: Express) {
  app.get("/api/cvq/items", async (req: any, res) => {
    try {
      const version = req.query.version as string | undefined;
      const items = await storage.getCvqItems(version);
      const lang = getRequestLanguage(req);
      // When Arabic is requested, surface textAr as the display text field
      const shapedItems = lang === "ar"
        ? items.map((item: any) => ({
            ...item,
            text: item.textAr || item.text,
          }))
        : items;
      res.json({ items: shapedItems });
    } catch (error) {
      console.error("Error fetching CVQ items:", error);
      res.status(500).json({ message: "Failed to fetch CVQ items" });
    }
  });

  app.post("/api/cvq/submit", isAuthenticated, async (req: any, res) => {
    try {
      const { assessmentId, responses, durationSeconds } = req.body;
      
      if (!assessmentId || typeof assessmentId !== 'string') {
        return res.status(400).json({ message: "Assessment ID is required" });
      }
      
      if (!responses || typeof responses !== 'object') {
        return res.status(400).json({ message: "Invalid responses data" });
      }
      
      // Get userId from authenticated request
      const userId = req.user.userId;

      // IDOR protection (C7): assessmentId is caller-supplied in the body. Without
      // an ownership check an authenticated user could attribute a CVQ result to
      // ANOTHER student's assessment — and because cvq_results.assessment_id is
      // UNIQUE, this also lets one user squat/hijack the single canonical result
      // slot for a victim's assessment. Verify the assessment exists and belongs
      // to this user BEFORE creating any result. CVQ is registered-user-only, so
      // the owner is assessment.userId; fail closed with 403 for everyone else
      // (mirrors the C4 write gate).
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment || assessment.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Get CVQ items to map responses to domains
      const cvqItems = await storage.getCvqItems();
      
      // Calculate domain scores
      const domainScores: Record<string, number[]> = {};
      for (const item of cvqItems) {
        if (responses[item.id] !== undefined) {
          if (!domainScores[item.domain]) {
            domainScores[item.domain] = [];
          }
          domainScores[item.domain].push(responses[item.id]);
        }
      }
      
      // Calculate raw scores (sum per domain)
      const rawScores: Record<string, number> = {};
      for (const [domain, scores] of Object.entries(domainScores)) {
        rawScores[domain] = scores.reduce((sum, score) => sum + score, 0);
      }
      
      // Normalize scores to 0-100 scale
      // CVQ uses 1-5 scale, with 3 items per domain, so max is 15, min is 3
      const normalizedScores: Record<string, number> = {};
      for (const [domain, rawScore] of Object.entries(rawScores)) {
        const itemCount = domainScores[domain].length;
        const minScore = itemCount * 1;
        const maxScore = itemCount * 5;
        normalizedScores[domain] = Math.round(((rawScore - minScore) / (maxScore - minScore)) * 100);
      }
      
      // Get top 3 values (highest normalized scores)
      const topValues = Object.entries(normalizedScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([domain]) => domain);
      
      // Calculate quality metrics
      const allResponses = Object.values(responses) as number[];
      const avgResponse = allResponses.reduce((sum, val) => sum + val, 0) / allResponses.length;
      const variance = allResponses.reduce((sum, val) => sum + Math.pow(val - avgResponse, 2), 0) / allResponses.length;
      const lowVariance = variance < 0.5; // More than 80% same response
      const rushedCompletion = durationSeconds && durationSeconds < (cvqItems.length * 2.5);
      
      const { result, created } = await persistCvqResult(assessmentId, userId, {
        rawScores,
        normalizedScores,
        topValues,
        itemResponses: responses,
        completionSeconds: durationSeconds || null,
        avgResponseVariance: variance,
        lowVariance,
        rushedCompletion: rushedCompletion || false,
      });

      // 200 rather than 201 when nothing was created — the row is not new, and
      // the status is the only place that distinction is visible to a caller
      // that wants it.
      res.status(created ? 201 : 200).json(result);
    } catch (error) {
      console.error("Error submitting CVQ:", error);
      res.status(500).json({ message: "Failed to submit CVQ" });
    }
  });

  app.get("/api/cvq/result/latest", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      const result = await storage.getCvqResultByUserId(userId);
      
      if (!result) {
        return res.status(404).json({ message: "No CVQ result found" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching CVQ result:", error);
      res.status(500).json({ message: "Failed to fetch CVQ result" });
    }
  });

  app.get("/api/cvq/result/:assessmentId", isAuthenticatedOrPrintToken, async (req: any, res) => {
    try {
      const result = await storage.getCvqResultByAssessmentId(req.params.assessmentId);

      // IDOR protection (C3): assessmentId is caller-supplied via the path, so we
      // must verify ownership BEFORE returning the CVQ work-values profile.
      // Previously this route was UNAUTHENTICATED and ownership-free, letting
      // anyone read any student's values profile by replaying/guessing an
      // assessment ID. CVQ results are always tied to a registered user
      // (cvqResults.userId is NOT NULL and /submit requires auth), so the owner
      // is simply that user. The server-side PDF render carries no session
      // cookie, so a print token scoped to EXACTLY this assessmentId also
      // authorizes the read (req.user is undefined on that path — guard before
      // dereferencing it). Return an identical 404 for both the not-found and
      // not-owned cases so the two are indistinguishable — a 404-vs-200/403
      // difference would itself be an enumeration oracle confirming which
      // assessment IDs map to real students (mirrors the C2 gate).
      const isOwner = req.isAuthenticated() && !!result && result.userId === req.user.userId;
      const isPrintTokenOwner = printTokenAuthorizes(req.query.printToken, req.params.assessmentId);
      if (!result || (!isOwner && !isPrintTokenOwner)) {
        return res.status(404).json({ message: "No CVQ result found for this assessment" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching CVQ result:", error);
      res.status(500).json({ message: "Failed to fetch CVQ result" });
    }
  });
}
