import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";

export function registerCvqRoutes(app: Express) {
  app.get("/api/cvq/items", async (req, res) => {
    try {
      const version = req.query.version as string | undefined;
      const items = await storage.getCvqItems(version);
      res.json({ items });
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
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      
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
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
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

  app.get("/api/cvq/result/:assessmentId", async (req, res) => {
    try {
      const result = await storage.getCvqResultByAssessmentId(req.params.assessmentId);
      
      if (!result) {
        return res.status(404).json({ message: "No CVQ result found for this assessment" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching CVQ result:", error);
      res.status(500).json({ message: "Failed to fetch CVQ result" });
    }
  });
}
