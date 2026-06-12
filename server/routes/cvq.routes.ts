import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";

/** Detect preferred language from Accept-Language or X-Language header */
function getRequestLanguage(req: any): string {
  const acceptLang = (req.headers["accept-language"] || "").toLowerCase();
  const xLang = (req.headers["x-language"] || "").toLowerCase();
  if (acceptLang.startsWith("ar") || xLang === "ar") return "ar";
  return "en";
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
      
      // Create CVQ result
      const result = await storage.createCvqResult({
        assessmentId,
        userId,
        rawScores,
        normalizedScores,
        topValues,
        itemResponses: responses,
        completionSeconds: durationSeconds || null,
        avgResponseVariance: variance,
        lowVariance,
        rushedCompletion: rushedCompletion || false,
      });
      
      res.status(201).json(result);
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

  app.get("/api/cvq/result/:assessmentId", isAuthenticated, async (req: any, res) => {
    try {
      const result = await storage.getCvqResultByAssessmentId(req.params.assessmentId);

      // IDOR protection (C3): assessmentId is caller-supplied via the path, so we
      // must verify ownership BEFORE returning the CVQ work-values profile.
      // Previously this route was UNAUTHENTICATED and ownership-free, letting
      // anyone read any student's values profile by replaying/guessing an
      // assessment ID. CVQ results are always tied to a registered user
      // (cvqResults.userId is NOT NULL and /submit requires auth), so the owner
      // is simply that user. Return an identical 404 for both the not-found and
      // not-owned cases so the two are indistinguishable — a 404-vs-200/403
      // difference would itself be an enumeration oracle confirming which
      // assessment IDs map to real students (mirrors the C2 gate).
      if (!result || result.userId !== req.user.userId) {
        return res.status(404).json({ message: "No CVQ result found for this assessment" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching CVQ result:", error);
      res.status(500).json({ message: "Failed to fetch CVQ result" });
    }
  });
}
