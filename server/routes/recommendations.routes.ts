import type { Express } from "express";
import { storage } from "../storage";
import { generateRecommendations } from "../services/matching";
import { syncWEFSkillsProfile } from "../services/wefOrchestrator";
import { recommendationsLimiter } from "../middleware/rateLimiter.middleware";
import { db } from "../db";
import { recommendations, assessments, organizationMembers } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  generateEnhancedReasoning,
  generateWorkStyleFit,
  generateStrengthsGrowth,
  generateEnhancedActionSteps,
} from "../services/premiumNarratives";
import { isPremiumAssessment } from "../utils/assessmentTier";

export function registerRecommendationsRoutes(app: Express) {
  // Generate recommendations using dynamic matching service
  app.post("/api/recommendations/generate/:assessmentId", recommendationsLimiter, async (req, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      // STRICT VALIDATION: Check all required components are complete
      // Use assessmentType to determine tier (not user.isPremium, as single assessments can be premium)
      const isPremium = isPremiumAssessment(assessment.assessmentType);

      const missingComponents: string[] = [];

      // Core fields required for both tiers
      if (!assessment.name) missingComponents.push("Name");
      if (!assessment.age) missingComponents.push("Age");
      if (!assessment.grade) missingComponents.push("Grade");
      if (!assessment.favoriteSubjects || (assessment.favoriteSubjects as string[]).length === 0) {
        missingComponents.push("Favorite Subjects");
      }
      if (!assessment.countryId) missingComponents.push("Country Selection");

      if (isPremium) {
        // Premium tier requirements
        if (assessment.quizScore === null || assessment.quizScore === undefined) {
          missingComponents.push("Subject Competency Quiz");
        }

        // Check Kolb assessment (stored as JSONB in assessments table)
        if (!assessment.kolbScores || Object.keys(assessment.kolbScores as object).length === 0) {
          missingComponents.push("Learning Style Assessment (Kolb)");
        }

        // Check RIASEC assessment (stored as JSONB in assessments table)
        if (!assessment.riasecScores || Object.keys(assessment.riasecScores as object).length === 0) {
          missingComponents.push("Interest Inventory (RIASEC)");
        }

        // Check CVQ assessment (stored in separate cvq_results table)
        const cvqResult = await storage.getCvqResultByAssessmentId(req.params.assessmentId);
        if (!cvqResult) {
          missingComponents.push("Work Values Assessment (CVQ)");
        }
      } else {
        // Free tier requirements
        if (!assessment.interests || (assessment.interests as string[]).length === 0) {
          missingComponents.push("Interests");
        }
        if (!assessment.personalityTraits || (assessment.personalityTraits as string[]).length === 0) {
          missingComponents.push("Personality Traits");
        }
        if (!assessment.careerAspirations) {
          missingComponents.push("Career Aspirations");
        }
      }

      if (missingComponents.length > 0) {
        return res.status(400).json({ 
          message: `Assessment incomplete. Missing: ${missingComponents.join(", ")}`,
          missingComponents,
          isPremium
        });
      }

      // Sync WEF Skills Profile for premium assessments (non-blocking)
      if (isPremium) {
        try {
          await syncWEFSkillsProfile(storage, assessment);
        } catch (error) {
          console.error("[WEF] Non-blocking sync error:", error);
        }
      }

      // Generate recommendations using dynamic matching service
      const careerMatches = await generateRecommendations(storage, req.params.assessmentId);

      // Use transaction to ensure atomic delete→create→update operations
      await db.transaction(async (tx) => {
        // Delete existing recommendations
        await tx.delete(recommendations).where(eq(recommendations.assessmentId, req.params.assessmentId));

        // Map CareerMatch format to database schema and save
        for (const match of careerMatches) {
          // Extract component scores to map to legacy schema fields
          const componentMap = new Map(match.componentScores.map(c => [c.key, c.score]));
          
          // ALWAYS store component-based reasoning for audit trail
          const componentReasoning = match.componentScores
            .map(c => `${c.displayName} (${c.weight}%): ${c.score.toFixed(1)}% - ${c.reasoning}`)
            .join(' | ');
          
          // Basic action steps (enhanced narratives generated on-demand at GET time)
          const basicActionSteps = [
            `Complete ${match.career.educationLevel}`,
            `Build skills in: ${match.career.requiredSkills.slice(0, 3).join(', ')}`
          ];
          
          await tx.insert(recommendations).values({
            assessmentId: req.params.assessmentId,
            careerId: match.career.id,
            overallMatchScore: match.overallScore,
            // Map available legacy fields (subjects, interests, vision)
            subjectMatchScore: componentMap.get('subjects') || 0,
            interestMatchScore: componentMap.get('interests') || 0,
            countryVisionAlignment: componentMap.get('vision') || 0,
            futureMarketDemand: 0, // Deprecated, always 0
            // Store component reasoning for audit trail (premium narratives generated dynamically)
            reasoning: componentReasoning,
            actionSteps: basicActionSteps,
            requiredEducation: match.career.educationLevel,
          });
        }

        // Mark assessment as completed
        const completedAt = new Date();
        await tx.update(assessments)
          .set({ isCompleted: true, completedAt })
          .where(eq(assessments.id, req.params.assessmentId));

        // Update organization member's completion status if user belongs to an organization
        if (assessment.userId) {
          await tx.update(organizationMembers)
            .set({ hasCompletedAssessment: true, assessmentCompletedAt: completedAt })
            .where(eq(organizationMembers.userId, assessment.userId));
        }
      });

      res.json({ 
        success: true, 
        count: careerMatches.length,
        recommendations: careerMatches // Return new format for immediate use
      });
    } catch (error) {
      console.error("Error generating recommendations:", error);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // Get recommendations for an assessment (or guest with guestToken)
  app.get("/api/recommendations", async (req: any, res) => {
    try {
      let assessmentId = req.query.assessmentId as string | undefined;
      // Support both query param (legacy) and httpOnly cookie (secure)
      const guestToken = (req.query.guestToken as string | undefined) || req.cookies?.guest_token;

      // If no assessmentId but guestToken provided, try to find guest assessment
      if (!assessmentId && guestToken) {
        if (guestToken.startsWith('guest_')) {
          const guestAssessment = await storage.getAssessmentByGuestToken(guestToken);
          if (guestAssessment) {
            assessmentId = guestAssessment.id;
          }
        }
      }

      if (!assessmentId) {
        return res.json([]);
      }

      const recommendations = await storage.getRecommendationsByAssessment(assessmentId);

      // Fetch assessment to check tier and generate premium narratives
      const assessment = await storage.getAssessmentById(assessmentId);
      const isPremium = isPremiumAssessment(assessment?.assessmentType);

      // Fetch CVQ result for premium users (needed for enhanced narratives)
      const cvqResult = isPremium && assessmentId ? await storage.getCvqResultByAssessmentId(assessmentId) : null;

      // Enrich with career details and generate premium narratives on-demand
      const enriched = await Promise.all(
        recommendations.map(async (rec) => {
          const career = await storage.getCareerById(rec.careerId);
          
          // Premium tier: Generate enhanced narratives dynamically (not stored in DB)
          if (isPremium && assessment && career) {
            // Defensive null guards before generating narratives
            const hasKolbData = assessment.kolbScores && typeof assessment.kolbScores === 'object' && 
              (assessment.kolbScores as any).learningStyle;
            const hasRiasecData = assessment.riasecScores && typeof assessment.riasecScores === 'object' &&
              typeof (assessment.riasecScores as any).R === 'number';
            const hasCvqData = cvqResult?.normalizedScores;

            // Only generate narratives if we have required data
            if (hasKolbData && hasRiasecData) {
              try {
                const narrativeContext = {
                  assessment,
                  career,
                  kolbScores: assessment.kolbScores as any,
                  riasecScores: assessment.riasecScores as any,
                  cvqScores: hasCvqData ? (cvqResult.normalizedScores as Record<string, any>) : undefined,
                  overallScore: rec.overallMatchScore,
                };

                // Generate premium content
                const enhancedReasoning = generateEnhancedReasoning(narrativeContext);
                const workStyleFit = generateWorkStyleFit(narrativeContext);
                const strengthsGrowth = generateStrengthsGrowth(narrativeContext);
                const enhancedActionSteps = generateEnhancedActionSteps(narrativeContext);

                // Return enriched recommendation with both component reasoning and premium narratives
                return {
                  ...rec,
                  career,
                  // Add premium fields (not stored in DB, generated on-demand)
                  premiumReasoning: enhancedReasoning,
                  workStyleFit,
                  strengthsGrowth,
                  premiumActionSteps: enhancedActionSteps,
                };
              } catch (error) {
                console.error('[Premium Narratives] Error generating for career:', career.id, error);
                // Fallback: return basic recommendation without premium narratives
                return { ...rec, career };
              }
            }
          }

          // Free tier or missing premium data: return basic recommendation
          return { ...rec, career };
        })
      );

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // PDF Report Generation using Puppeteer
  app.get("/api/recommendations/pdf/:assessmentId", async (req: any, res) => {
    let browser: any = null;
    try {
      const assessment = await storage.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      // Authorization check: verify ownership
      const userId = req.isAuthenticated() ? (req.user.userId) : null;
      if (assessment.userId && (!req.isAuthenticated() || userId !== assessment.userId)) {
        return res.status(403).json({ message: "Unauthorized to access this report" });
      }

      // Import Puppeteer
      const puppeteer = await import("puppeteer");
      const { execSync } = await import("child_process");

      // Find Chromium executable dynamically
      let chromiumPath: string;
      try {
        chromiumPath = execSync('which chromium').toString().trim();
      } catch {
        chromiumPath = 'chromium';
      }

      // Launch headless browser with system Chromium
      // Note: --no-sandbox is required in containerized environments like Replit
      // Security is maintained through strict URL validation below
      browser = await puppeteer.default.launch({
        headless: true,
        executablePath: chromiumPath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();

      // Navigate to print-optimized page
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? `https://${req.get('host')}`
        : `http://localhost:${process.env.PORT || 5000}`;
      
      // Include guest token if this is a guest assessment
      const guestTokenParam = assessment.guestSessionId ? `&guestToken=${assessment.guestSessionId}` : '';
      const printUrl = `${baseUrl}/print/results?assessmentId=${assessment.id}${guestTokenParam}`;
      
      // SECURITY: Comprehensive URL validation to prevent SSRF attacks
      try {
        const parsedUrl = new URL(printUrl);
        
        // Only allow http/https protocols (block file://, data://, javascript://, etc.)
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Only http/https protocols are allowed');
        }
        
        // Enforce port restriction to prevent port scanning
        const allowedPort = process.env.PORT || '5000';
        const urlPort = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
        // Allow our app port or standard https (443) for production Replit deployments
        const allowedPorts = [allowedPort, '443', '80', ''];
        if (!allowedPorts.includes(parsedUrl.port)) {
          throw new Error(`Port ${urlPort} is not allowed`);
        }
        
        // Build allowed hosts list
        const allowedHosts = ['localhost', '127.0.0.1'];
        const isReplitHost = parsedUrl.hostname.endsWith('.replit.app') || 
                             parsedUrl.hostname.endsWith('.repl.co') ||
                             parsedUrl.hostname.endsWith('.replit.dev');
        
        // In production, also allow the current host (for Replit deployments)
        const reqHost = req.get('host')?.split(':')[0];
        if (reqHost && (isReplitHost || reqHost === 'localhost' || reqHost === '127.0.0.1')) {
          allowedHosts.push(reqHost);
        }
        
        if (!allowedHosts.includes(parsedUrl.hostname) && !isReplitHost) {
          throw new Error('Host not in allowed list');
        }
        
        // Block attempts to use IP representation tricks
        const host = parsedUrl.hostname.toLowerCase();
        if (host.includes('0x') || host.includes('%') || host.includes('::')) {
          throw new Error('IP representation tricks are not allowed');
        }
        
        // Block private/internal IP ranges in numeric form
        const ipPatterns = [
          /^10\./,                    // 10.0.0.0/8
          /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
          /^192\.168\./,              // 192.168.0.0/16
          /^169\.254\./,              // Link-local
          /^0\./,                     // 0.0.0.0/8
        ];
        if (ipPatterns.some(pattern => pattern.test(parsedUrl.hostname))) {
          throw new Error('Private IP ranges are not allowed');
        }
      } catch (e) {
        console.error('URL validation failed:', e);
        return res.status(400).json({ message: "Invalid PDF URL" });
      }
      
      await page.goto(printUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      // Wait for report data to be fully loaded
      await page.waitForFunction(() => (window as any).__REPORT_READY__ === true, {
        timeout: 30000,
      });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });

      await browser.close();

      // Validate PDF buffer
      if (!pdfBuffer || pdfBuffer.length === 0) {
        console.error("PDF buffer is empty or invalid");
        return res.status(500).json({ message: "PDF generation failed - empty buffer" });
      }

      console.log(`PDF generated successfully: ${pdfBuffer.length} bytes`);

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="career-report-${assessment.id}.pdf"`);

      // Send PDF as binary buffer
      res.send(Buffer.from(pdfBuffer));
    } catch (error) {
      console.error("Error generating PDF:", error);
      // Make sure we close the browser even on error
      try {
        if (browser) await browser.close();
      } catch (closeError) {
        console.error("Error closing browser:", closeError);
      }
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  // Education Pathways - LLM-generated university/program recommendations
  // Protected with rate limiting to prevent LLM abuse
  app.get("/api/recommendations/:assessmentId/education-pathways/:careerId", recommendationsLimiter, async (req: any, res) => {
    try {
      const { assessmentId, careerId } = req.params;

      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      // AUTHORIZATION: Verify ownership - must be authenticated user OR valid guest token
      const guestToken = req.cookies?.guest_token || req.query.guestToken;
      let isAuthorized = false;

      if (assessment.userId) {
        // User-owned assessment: require proper authentication
        if (typeof req.isAuthenticated === 'function' && req.isAuthenticated() && req.user) {
          const userId = req.user.userId;
          if (userId && userId === assessment.userId) {
            isAuthorized = true;
          }
        }
      } else if (guestToken && typeof guestToken === 'string' && guestToken.startsWith('guest_')) {
        // Guest assessment: validate token format and lookup session
        const guestAssessment = await storage.getAssessmentByGuestToken(guestToken);
        if (guestAssessment && guestAssessment.id === assessmentId) {
          isAuthorized = true;
        }
      }

      // If neither authenticated user nor valid guest, require auth
      if (!isAuthorized) {
        // Determine appropriate error based on context
        if (assessment.userId) {
          return res.status(401).json({ message: "Authentication required to access this assessment" });
        }
        return res.status(403).json({ message: "Invalid session. Please complete the assessment first." });
      }

      // Only available for premium assessments
      if (!isPremiumAssessment(assessment.assessmentType)) {
        return res.status(403).json({ 
          message: "Education Pathways is a premium feature",
          isPremium: false
        });
      }

      const career = await storage.getCareerById(careerId);
      if (!career) {
        return res.status(404).json({ message: "Career not found" });
      }

      // Get the recommendation for this career
      const recommendations = await storage.getRecommendationsByAssessment(assessmentId);
      const recommendation = recommendations.find(r => r.careerId === careerId);
      if (!recommendation) {
        return res.status(404).json({ message: "Recommendation not found for this career" });
      }

      // Import LLM service
      const { generateEducationPathwaysNarrative, isLlmServiceAvailable } = await import("../services/llmNarrativeService");

      // Check if LLM service is available
      const llmAvailable = await isLlmServiceAvailable(storage);
      if (!llmAvailable) {
        return res.status(503).json({ 
          message: "AI service is not configured. Please contact the administrator.",
          llmConfigured: false
        });
      }

      // Generate education pathways narrative
      const result = await generateEducationPathwaysNarrative(
        storage,
        assessment,
        career,
        recommendation.overallMatchScore
      );

      if (!result.success) {
        console.error("[Education Pathways] LLM error:", result.error);
        return res.status(500).json({ 
          message: "Failed to generate education pathways",
          error: result.error
        });
      }

      res.json({
        success: true,
        careerId,
        careerTitle: career.title,
        educationPathways: result.narrative,
        model: result.model,
        tokensUsed: result.tokensUsed,
        caaLinks: {
          institutions: "https://caa.ae/Pages/Institutes/All.aspx",
          programs: "https://caa.ae/Pages/Programs/All.aspx"
        }
      });
    } catch (error) {
      console.error("Error generating education pathways:", error);
      res.status(500).json({ message: "Failed to generate education pathways" });
    }
  });
}
