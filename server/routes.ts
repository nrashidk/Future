import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertAssessmentSchema } from "@shared/schema";
import { z } from "zod";
import PDFDocument from "pdfkit";

// Intelligent matching algorithm
function calculateCareerMatch(
  assessment: any,
  career: any,
  countryData: any,
  jobTrend: any
): {
  overallMatchScore: number;
  subjectMatchScore: number;
  interestMatchScore: number;
  countryVisionAlignment: number;
  futureMarketDemand: number;
  reasoning: string;
} {
  // Calculate subject match (0-100)
  const subjectOverlap = assessment.favoriteSubjects.filter((s: string) =>
    career.relatedSubjects.includes(s)
  ).length;
  const subjectMatchScore = Math.min(
    (subjectOverlap / Math.max(assessment.favoriteSubjects.length, 1)) * 100,
    100
  );

  // Calculate interest match (0-100)
  const interestKeywords: Record<string, string[]> = {
    Technology: ["Computer Science", "Engineering"],
    Creative: ["Art", "Music", "Design"],
    Helping: ["Healthcare", "Education", "Social Work"],
    "Problem Solving": ["Mathematics", "Physics", "Engineering"],
    Research: ["Biology", "Chemistry", "Science"],
    Business: ["Business", "Economics"],
    Leadership: ["Business", "Management"],
  };

  let interestScore = 0;
  for (const interest of assessment.interests) {
    const keywords = interestKeywords[interest] || [];
    if (keywords.some((k) => career.title.includes(k) || career.category.includes(k))) {
      interestScore += 20;
    }
  }
  const interestMatchScore = Math.min(interestScore, 100);

  // Country vision alignment - analyzes how well this career aligns with national priorities
  let visionAlignmentScore = jobTrend?.nationalPriorityAlignment || 50;
  
  // Enhance with direct mission/vision analysis
  if (countryData) {
    const prioritySectors = countryData.prioritySectors || [];
    const nationalGoals = countryData.nationalGoals || [];
    
    // Stop words to filter out generic matches
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
      "been", "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "should", "could", "may", "might", "must", "can"
    ]);
    
    // Tokenize career-related terms, filter stop words, keep meaningful words (3+ chars)
    const careerTerms = [
      career.title,
      career.category,
      ...career.relatedSubjects,
    ].join(" ").toLowerCase().split(/\s+/)
      .filter(term => term.length >= 3 && !stopWords.has(term));
    
    let sectorMatches = 0;
    let goalMatches = 0;
    
    // Check priority sector alignment with phrase-level matching
    for (const sector of prioritySectors) {
      const sectorPhrase = sector.toLowerCase();
      const sectorTokens = sector.toLowerCase().split(/\s+/)
        .filter(token => token.length >= 3 && !stopWords.has(token));
      
      // Prefer full phrase match
      if (careerTerms.some(term => sectorPhrase.includes(term) && term.length >= 4)) {
        sectorMatches++;
      } else {
        // Otherwise check for meaningful token overlap
        const overlap = sectorTokens.filter(token => 
          careerTerms.some(term => term.includes(token) || token.includes(term))
        ).length;
        if (overlap >= 1) {
          sectorMatches += 0.5; // Partial match
        }
      }
    }
    
    // Check national goals alignment similarly
    for (const goal of nationalGoals) {
      const goalPhrase = goal.toLowerCase();
      const goalTokens = goal.toLowerCase().split(/\s+/)
        .filter(token => token.length >= 3 && !stopWords.has(token));
      
      if (careerTerms.some(term => goalPhrase.includes(term) && term.length >= 4)) {
        goalMatches++;
      } else {
        const overlap = goalTokens.filter(token => 
          careerTerms.some(term => term.includes(token) || token.includes(term))
        ).length;
        if (overlap >= 1) {
          goalMatches += 0.5; // Partial match
        }
      }
    }
    
    // Calculate mission/vision adjustment (-10 to +10 for balanced scoring)
    let missionVisionAdjustment = 0;
    
    // Positive boost for matches (capped at +10)
    if (sectorMatches > 0 || goalMatches > 0) {
      missionVisionAdjustment = Math.min((sectorMatches * 4) + (goalMatches * 2), 10);
    } else {
      // Slight penalty if no alignment with any national priorities (-5)
      missionVisionAdjustment = -5;
    }
    
    // Blend with existing job trend alignment (80% trend, 20% mission/vision adjustment)
    visionAlignmentScore = visionAlignmentScore + (missionVisionAdjustment * 0.2);
    visionAlignmentScore = Math.min(Math.max(visionAlignmentScore, 0), 100);
  }
  
  const countryVisionAlignment = visionAlignmentScore;

  // Future market demand (uses job trend data)
  const futureMarketDemand = jobTrend?.demandScore || 60;

  // Overall weighted score
  const overallMatchScore =
    subjectMatchScore * 0.3 +
    interestMatchScore * 0.3 +
    countryVisionAlignment * 0.2 +
    futureMarketDemand * 0.2;

  // Generate reasoning
  const reasons: string[] = [];
  if (subjectMatchScore > 70) {
    reasons.push(`Your strong performance in ${assessment.favoriteSubjects.slice(0, 2).join(" and ")} aligns perfectly with this career`);
  }
  if (interestMatchScore > 60) {
    reasons.push(`Your interests in ${assessment.interests.slice(0, 2).join(" and ")} match the core activities of this role`);
  }
  if (countryVisionAlignment > 70) {
    reasons.push(`This career directly contributes to your country's priority sectors and national development goals`);
  }
  if (futureMarketDemand > 70) {
    reasons.push(`This field is experiencing high growth and strong demand in your country's job market`);
  }

  const reasoning = reasons.length > 0
    ? reasons.join(". ") + "."
    : "This career offers a balanced match with your profile and local opportunities.";

  return {
    overallMatchScore,
    subjectMatchScore,
    interestMatchScore,
    countryVisionAlignment,
    futureMarketDemand,
    reasoning,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Countries routes
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

  // Assessment routes
  app.post("/api/assessments", async (req: any, res) => {
    try {
      const validatedData = insertAssessmentSchema.parse(req.body);

      // Check if user is authenticated
      const userId = req.isAuthenticated() ? req.user.claims.sub : null;
      const isGuest = !userId;

      const assessment = await storage.createAssessment({
        ...validatedData,
        userId,
        isGuest,
        guestSessionId: isGuest ? req.sessionID : null,
      });

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

      const userId = req.user.claims.sub;
      const assessments = await storage.getAssessmentsByUser(userId);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ message: "Failed to fetch assessments" });
    }
  });

  app.patch("/api/assessments/:id", async (req: any, res) => {
    try {
      const assessment = await storage.updateAssessment(req.params.id, req.body);
      res.json(assessment);
    } catch (error) {
      console.error("Error updating assessment:", error);
      res.status(500).json({ message: "Failed to update assessment" });
    }
  });

  // Generate recommendations
  app.post("/api/recommendations/generate/:assessmentId", async (req, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      if (!assessment.countryId) {
        return res.status(400).json({ message: "Assessment missing country" });
      }

      const country = await storage.getCountryById(assessment.countryId);
      const allCareers = await storage.getAllCareers();

      const recommendations = [];

      for (const career of allCareers) {
        const jobTrend = await storage.getTrendByCareerAndCountry(career.id, assessment.countryId);

        const matchScores = calculateCareerMatch(assessment, career, country, jobTrend);

        // Only recommend careers with overall match > 40%
        if (matchScores.overallMatchScore > 40) {
          const actionSteps = [
            `Research ${career.title} programs at universities in your country`,
            `Connect with professionals in this field through networking events or LinkedIn`,
            `Build relevant skills through online courses or certifications`,
            `Seek internships or volunteer opportunities in related organizations`,
          ];

          const recommendation = await storage.createRecommendation({
            assessmentId: assessment.id,
            careerId: career.id,
            ...matchScores,
            actionSteps,
            requiredEducation: career.educationLevel,
          });

          recommendations.push(recommendation);
        }
      }

      // Sort by overall match score
      recommendations.sort((a, b) => b.overallMatchScore - a.overallMatchScore);

      // Return top 5
      res.json(recommendations.slice(0, 5));
    } catch (error) {
      console.error("Error generating recommendations:", error);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // Get recommendations with career details
  app.get("/api/recommendations", async (req: any, res) => {
    try {
      // For demo, get the latest assessment
      let assessmentId = req.query.assessmentId;

      if (!assessmentId) {
        if (req.isAuthenticated()) {
          const userAssessments = await storage.getAssessmentsByUser(req.user.claims.sub);
          if (userAssessments.length > 0) {
            assessmentId = userAssessments[0].id;
          }
        }
      }

      if (!assessmentId) {
        return res.json([]);
      }

      const recommendations = await storage.getRecommendationsByAssessment(assessmentId);

      // Enrich with career details
      const enriched = await Promise.all(
        recommendations.map(async (rec) => {
          const career = await storage.getCareerById(rec.careerId);
          return { ...rec, career };
        })
      );

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Careers routes
  app.get("/api/careers", async (_req, res) => {
    try {
      const careers = await storage.getAllCareers();
      res.json(careers);
    } catch (error) {
      console.error("Error fetching careers:", error);
      res.status(500).json({ message: "Failed to fetch careers" });
    }
  });

  // PDF Report Generation
  app.get("/api/recommendations/pdf/:assessmentId", async (req: any, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      // Authorization check: verify ownership
      // For registered users, verify authentication
      // For guest assessments, allow access (assessment IDs are UUIDs, hard to guess)
      if (assessment.userId && (!req.isAuthenticated() || req.user.claims.sub !== assessment.userId)) {
        return res.status(403).json({ message: "Unauthorized to access this report" });
      }

      const recommendations = await storage.getRecommendationsByAssessment(assessment.id);
      const country = assessment.countryId ? await storage.getCountryById(assessment.countryId) : null;

      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="career-report-${assessment.id}.pdf"`);

      // Pipe PDF to response
      doc.pipe(res);

      // Title
      doc.fontSize(24).fillColor("#6B46C1").text("Future Pathways", { align: "center" });
      doc.fontSize(16).fillColor("#374151").text("Career Guidance Report", { align: "center" });
      doc.moveDown(2);

      // Student Info
      doc.fontSize(14).fillColor("#1F2937").text("Student Profile", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#4B5563");
      doc.text(`Name: ${assessment.name || "Guest User"}`);
      doc.text(`Age: ${assessment.age}`);
      doc.text(`Education Level: ${assessment.educationLevel}`);
      doc.text(`Country: ${country?.name || "Not specified"}`);
      doc.moveDown();
      doc.text(`Favorite Subjects: ${assessment.favoriteSubjects.join(", ")}`);
      doc.text(`Interests: ${assessment.interests.join(", ")}`);
      doc.text(`Personality Traits: ${assessment.personalityTraits.join(", ")}`);
      doc.moveDown(2);

      // Recommendations
      doc.fontSize(14).fillColor("#1F2937").text("Top Career Recommendations", { underline: true });
      doc.moveDown(1);

      for (let i = 0; i < Math.min(recommendations.length, 5); i++) {
        const rec = recommendations[i];
        const career = await storage.getCareerById(rec.careerId);
        
        if (!career) continue;

        doc.fontSize(13).fillColor("#6B46C1").text(`${i + 1}. ${career.title}`, { underline: false });
        doc.moveDown(0.3);
        
        doc.fontSize(10).fillColor("#4B5563");
        doc.text(`Overall Match: ${Math.round(rec.overallMatchScore)}%`);
        doc.text(`Category: ${career.category}`);
        doc.text(`Education Required: ${career.educationLevel}`);
        doc.moveDown(0.3);
        
        doc.fontSize(9).fillColor("#6B7280");
        doc.text(career.description, { width: 500 });
        doc.moveDown(0.5);

        // Match Breakdown
        doc.fontSize(9).fillColor("#374151").text("Match Breakdown:");
        doc.fontSize(8).fillColor("#6B7280");
        doc.text(`  • Subject Alignment: ${Math.round(rec.subjectMatchScore)}%`);
        doc.text(`  • Interest Alignment: ${Math.round(rec.interestMatchScore)}%`);
        doc.text(`  • Country Vision Alignment: ${Math.round(rec.countryVisionAlignment)}%`);
        doc.text(`  • Future Market Demand: ${Math.round(rec.futureMarketDemand)}%`);
        doc.moveDown(0.5);

        // Action Steps
        doc.fontSize(9).fillColor("#374151").text("Next Steps:");
        doc.fontSize(8).fillColor("#6B7280");
        rec.actionSteps.forEach((step: string) => {
          doc.text(`  • ${step}`, { width: 500 });
        });
        
        if (i < recommendations.length - 1) {
          doc.moveDown(1.5);
        }
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).fillColor("#9CA3AF").text(
        `Generated on ${new Date().toLocaleDateString()} | Future Pathways Career Guidance System`,
        { align: "center" }
      );

      doc.end();
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  // Guest to Registered User Migration
  app.post("/api/assessments/migrate", isAuthenticated, async (req: any, res) => {
    try {
      const { guestAssessmentIds, guestSessionId } = req.body;
      const userId = req.user.claims.sub;

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

  // Analytics Endpoints
  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const analytics = await storage.getAnalyticsOverview();
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics overview:", error);
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  app.get("/api/analytics/countries", async (req, res) => {
    try {
      const analytics = await storage.getAnalyticsOverview();
      const countries = analytics.countriesBreakdown.map(c => ({
        countryId: c.countryId,
        countryName: c.countryName,
        studentCount: c.count
      }));
      res.json(countries);
    } catch (error) {
      console.error("Error fetching countries analytics:", error);
      res.status(500).json({ message: "Failed to fetch countries analytics" });
    }
  });

  app.get("/api/analytics/country/:id", async (req, res) => {
    try {
      const analytics = await storage.getCountryAnalytics(req.params.id);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching country analytics:", error);
      res.status(500).json({ message: "Failed to fetch country analytics" });
    }
  });

  app.get("/api/analytics/careers", async (req, res) => {
    try {
      const trends = await storage.getCareerTrends();
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/trends", async (req, res) => {
    try {
      const trends = await storage.getCareerTrends();
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/sectors", async (req, res) => {
    try {
      const pipeline = await storage.getSectorPipeline();
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching sector pipeline:", error);
      res.status(500).json({ message: "Failed to fetch sector pipeline" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
