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
import { formatFreeReasoning } from "../services/freeNarrative";
import { collectMissingComponents } from "../utils/assessmentCompleteness";
import { mintPrintToken, printTokenAuthorizes } from "../utils/printToken";
import type { Career } from "@shared/schema";

/** Escape regex metacharacters so user-supplied strings are treated as literals. */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * When the client requests lang=ar, merge Arabic fields over English equivalents
 * so both the raw AR fields AND the primary fields carry localised content.
 */
function localizeCareer(career: Career | undefined, isArabic: boolean): Career | undefined {
  if (!career || !isArabic) return career;
  return {
    ...career,
    title: career.titleAr || career.title,
    description: career.descriptionAr || career.description,
    requiredSkills: (career.requiredSkillsAr && career.requiredSkillsAr.length > 0)
      ? career.requiredSkillsAr
      : career.requiredSkills,
    educationLevel: career.educationLevelAr || career.educationLevel,
  };
}

export function registerRecommendationsRoutes(app: Express) {
  // Generate recommendations using dynamic matching service
  app.post("/api/recommendations/generate/:assessmentId", recommendationsLimiter, async (req, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        // Anti-enumeration: same 403 as the not-owned case below so a missing
        // assessment is indistinguishable from one the caller doesn't own.
        return res.status(403).json({ message: "Forbidden" });
      }

      // IDOR protection (C4): fail closed. The previous guard returned 403 only
      // when req.isAuthenticated() was true, so an UNAUTHENTICATED caller sailed
      // straight through and could trigger paid LLM recommendation generation on
      // any student's assessment just by guessing/replaying its ID — an
      // unauthenticated data-exposure + cost-abuse hole.
      //
      // Require positive proof of ownership: a registered-user assessment may be
      // accessed only by that authenticated user; a guest assessment only by the
      // caller presenting the matching guest token. Anyone else — unauthenticated,
      // authenticated non-owner, or guest without the token — is denied. Mirrors
      // the C2 ownership gate on GET /api/recommendations.
      const guestToken = (req.query.guestToken as string | undefined) || (req as any).cookies?.guest_token;
      let owns = false;
      if (assessment.userId) {
        owns = req.isAuthenticated() && (req.user as any)?.userId === assessment.userId;
      } else {
        owns = !!guestToken && guestToken === assessment.guestSessionId;
      }
      if (!owns) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // STRICT VALIDATION: Check all required components are complete
      // Use assessmentType to determine tier (not user.isPremium, as single assessments can be premium)
      const isPremium = isPremiumAssessment(assessment.assessmentType);

      // CVQ lives in its own table, so resolve it here and let the pure gate
      // decide. Only premium requires it, so skip the query for free.
      const hasCvqResult = isPremium
        ? !!(await storage.getCvqResultByAssessmentId(req.params.assessmentId))
        : false;

      const missingComponents = collectMissingComponents(assessment, { isPremium, hasCvqResult });

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

      // Invalidate any cached LLM narratives for this assessment so a fresh
      // run always generates new narratives with the latest data.
      try {
        await storage.invalidateLlmNarrativeCacheForAssessment(req.params.assessmentId);
      } catch (cacheErr) {
        console.warn("[LLM Cache] Failed to invalidate on re-run:", cacheErr);
      }

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
            // Structured per-career breakdown: faithfully stores ALL components the
            // scorer produced for this tier (subjects/interests/vision/riasec/cvq/wef_skills),
            // so the render can show the true tier-aware component set. reasoning omitted
            // (already lives in the reasoning text blob below).
            componentBreakdown: match.componentScores.map(c => ({
              key: c.key,
              displayName: c.displayName,
              score: c.score,
              weight: c.weight,
            })),
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
  // Accepts optional ?lang=ar (or Accept-Language: ar) to promote Arabic career fields
  app.get("/api/recommendations", async (req: any, res) => {
    try {
      let assessmentId = req.query.assessmentId as string | undefined;
      // Support both query param (legacy) and httpOnly cookie (secure)
      const guestToken = (req.query.guestToken as string | undefined) || req.cookies?.guest_token;
      // Resolve requested language: query param takes priority over Accept-Language header
      const langParam = (req.query.lang as string | undefined) || '';
      const acceptLang = (req.headers['accept-language'] || '').toLowerCase();
      const isArabic = langParam === 'ar' || (!langParam && acceptLang.startsWith('ar'));

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

      // IDOR protection (C2): assessmentId is caller-supplied via query param, so we
      // must verify ownership BEFORE returning any of this assessment's data —
      // otherwise any user (or an unauthenticated client) could read another
      // student's recommendations, scores and narratives by replaying/guessing an
      // assessment ID.
      //
      // We return an empty list (NOT 403) for both the not-found and not-owned
      // cases so the two are indistinguishable. On a minors' platform, a 403-vs-[]
      // difference would let an attacker confirm which assessment IDs map to real
      // students — an enumeration oracle that is itself a leak. So we close it here
      // rather than mirroring GET /api/assessments/:id, which still returns 404/403
      // (logged as a follow-up finding to fix later).
      const assessment = await storage.getAssessmentById(assessmentId);
      let owns = false;
      if (assessment) {
        if (assessment.userId) {
          // Registered-user assessment — caller must be that authenticated user
          owns = req.isAuthenticated() && req.user?.userId === assessment.userId;
        } else {
          // Guest assessment — caller must present the matching guest token
          owns = !!guestToken && guestToken === assessment.guestSessionId;
        }
        // Server-side PDF render: a print token scoped to THIS assessment
        // authorizes the read. The headless browser carries no session cookie;
        // the token (minted only after an ownership check in the PDF route)
        // stands in as proof of ownership for this one assessmentId only.
        if (!owns && printTokenAuthorizes(req.query.printToken, assessmentId)) {
          owns = true;
        }
      }
      if (!assessment || !owns) {
        return res.json([]);
      }

      const recommendations = await storage.getRecommendationsByAssessment(assessmentId);

      // Tier check / premium narratives (assessment already fetched above for the
      // ownership gate, so we reuse it rather than querying again).
      const isPremium = isPremiumAssessment(assessment?.assessmentType);

      // Fetch CVQ result for premium users (needed for enhanced narratives)
      const cvqResult = isPremium && assessmentId ? await storage.getCvqResultByAssessmentId(assessmentId) : null;

      // Resolve narrative language: an explicit ?lang= query param takes
      // priority (used by the PDF renderer so the report language matches the
      // download language), falling back to the user's stored preference.
      const langOverride = typeof req.query.lang === 'string' ? req.query.lang : null;
      let narrativeLanguage = (langOverride === 'ar' || langOverride === 'en') ? langOverride : "en";
      if (!langOverride && assessment?.userId) {
        const narrativeUser = await storage.getUser(assessment.userId);
        narrativeLanguage = narrativeUser?.preferredLanguage || "en";
      }

      // Build English→Arabic sector name map so reasoning text shows Arabic sector
      // labels when the client requests Arabic output (lang=ar / Accept-Language: ar).
      // The reasoning field is stored with English sector names; we substitute them
      // at serve-time so the PDF (and web view) shows the correct localised label.
      // countryNameEn/Ar capture the country name pair for the same substitution.
      let sectorArMap: Map<string, string> | null = null;
      let countryNameEn: string | null = null;
      let countryNameAr: string | null = null;
      if (isArabic && assessment?.countryId) {
        const country = await storage.getCountryById(assessment.countryId);
        const sectorsEn = country?.prioritySectors as string[] | undefined;
        const sectorsAr = country?.prioritySectorsAr as string[] | undefined;
        if (sectorsEn && sectorsAr && sectorsAr.length > 0) {
          sectorArMap = new Map<string, string>();
          sectorsEn.forEach((en, i) => {
            const ar = sectorsAr[i];
            if (ar) sectorArMap!.set(en, ar);
          });
        }
        if (country?.name && country?.nameAr) {
          countryNameEn = country.name;
          countryNameAr = country.nameAr;
        }
      }

      // Check LLM availability once for the whole request (avoids per-career round trips)
      let llmAvailable = false;
      let llmNarrativeModule: typeof import("../services/llmNarrativeService") | null = null;
      if (isPremium) {
        try {
          llmNarrativeModule = await import("../services/llmNarrativeService");
          llmAvailable = await llmNarrativeModule.isLlmServiceAvailable(storage);
        } catch {
          llmAvailable = false;
        }
      }

      // Bulk-fetch WEF skill tags for all careers (one query, JOIN with wef_skills for nameAr)
      const careerIds = recommendations.map(r => r.careerId);
      const allWefSkills = await storage.getWefSkillsForCareers(careerIds);
      // Group by careerId, top 5 per career sorted by affinityScore desc
      const wefSkillsByCareer = new Map<string, Array<{ name: string; nameAr: string | null; description: string; descriptionAr: string | null }>>();
      for (const row of allWefSkills) {
        const list = wefSkillsByCareer.get(row.careerId) ?? [];
        list.push({ name: row.name, nameAr: row.nameAr, description: row.description, descriptionAr: row.descriptionAr });
        wefSkillsByCareer.set(row.careerId, list);
      }
      // allWefSkills is ordered by affinityScore asc from the query; reverse to get desc, keep top 5
      Array.from(wefSkillsByCareer.keys()).forEach((cid) => {
        const list = wefSkillsByCareer.get(cid)!;
        wefSkillsByCareer.set(cid, list.reverse().slice(0, 5));
      });

      // Enrich with career details and generate premium narratives on-demand
      const enriched = await Promise.all(
        recommendations.map(async (rec) => {
          const career = await storage.getCareerById(rec.careerId);
          const wefSkillTags = wefSkillsByCareer.get(rec.careerId) ?? [];
          
          // Premium tier: Generate enhanced narratives dynamically (not stored in DB)
          if (isPremium && assessment && career) {
            // Defensive null guards before generating narratives
            const hasRiasecData = assessment.riasecScores && typeof assessment.riasecScores === 'object' &&
              typeof (assessment.riasecScores as any).R === 'number';
            const hasCvqData = cvqResult?.normalizedScores;

            // Only generate narratives if we have required data
            if (hasRiasecData) {
              try {
                const narrativeContext = {
                  assessment,
                  career,
                  riasecScores: assessment.riasecScores as any,
                  cvqScores: hasCvqData ? (cvqResult.normalizedScores as Record<string, any>) : undefined,
                  overallScore: rec.overallMatchScore,
                  language: narrativeLanguage,
                };

                // Generate "Why This Career?" via LLM (with {{language}} variable support)
                // when the LLM service is configured; fall back to heuristic generator otherwise.
                let premiumReasoning: string;
                if (llmAvailable && llmNarrativeModule) {
                  const llmResult = await llmNarrativeModule.generateCareerReasoningNarrative(
                    storage,
                    assessment,
                    career,
                    rec.overallMatchScore,
                    narrativeLanguage,
                    rec.componentBreakdown as any
                  );
                  premiumReasoning = llmResult.success && llmResult.narrative
                    ? llmResult.narrative
                    : generateEnhancedReasoning(narrativeContext);
                } else {
                  premiumReasoning = generateEnhancedReasoning(narrativeContext);
                }

                // Work Style Fit and Strengths/Growth use heuristic generators
                // (no LLM prompt templates exist for these sections yet)
                const workStyleFit = generateWorkStyleFit(narrativeContext);
                const strengthsGrowth = generateStrengthsGrowth(narrativeContext);
                const enhancedActionSteps = generateEnhancedActionSteps(narrativeContext);

                // Return enriched recommendation with both component reasoning and premium narratives
                return {
                  ...rec,
                  career: localizeCareer(career, isArabic),
                  wefSkillTags,
                  // Add premium fields (not stored in DB, generated on-demand)
                  premiumReasoning,
                  workStyleFit,
                  strengthsGrowth,
                  premiumActionSteps: enhancedActionSteps,
                };
              } catch (error) {
                console.error('[Premium Narratives] Error generating for career:', career.id, error);
                // Fallback: return basic recommendation without premium narratives
                return { ...rec, career: localizeCareer(career, isArabic), wefSkillTags };
              }
            }
          }

          // FREE tier: RENDER the narrative rather than withhold it.
          //
          // This used to return `reasoning: null, premiumReasoning: null,
          // locked: true`, and the client drew a blurred skeleton with an
          // "Unlock full report" button where the explanation belonged. The data
          // was never missing — the stored rec.reasoning blob has been written
          // for both tiers all along — it was only unreadable, because it is an
          // audit string of component names, weights and percentages. So format
          // it instead of hiding it. Deterministic, no LLM, no new data: see
          // server/services/freeNarrative.ts.
          //
          // The page-wide `locked` flag is gone, replaced by the single narrow
          // `pdfLocked`: GET /api/recommendations/pdf/:id 403s for free, and
          // that is now the only thing the response withholds. Everything the
          // free report renders, it renders in full — the difference from
          // premium is which BLOCKS appear (the client omits the three
          // career-fact blocks for a free assessmentType), not whether the
          // content behind them is legible.
          //
          // Gated on `!isPremium`, so a premium assessment that merely lacked
          // RIASEC data (and fell through the branch above) is unaffected —
          // premium behaviour is unchanged.
          if (!isPremium) {
            return {
              ...rec,
              // Replace the audit blob with student-readable prose built from it.
              reasoning: formatFreeReasoning({
                auditReasoning: rec.reasoning,
                careerTitle: isArabic && career?.titleAr ? career.titleAr : (career?.title ?? ''),
                overallScore: rec.overallMatchScore,
                language: isArabic ? 'ar' : 'en',
              }),
              career: localizeCareer(career, isArabic),
              wefSkillTags,
              // No LLM narrative for free — that stays premium.
              premiumReasoning: null,
              pdfLocked: true,
            };
          }

          // Premium assessment missing RIASEC data (did not enter the LLM branch
          // above): keep the prior heuristic "Why This Career?" fallback so the
          // premium report still renders prose. Unchanged from before this
          // free-tier change.
          let fallbackReasoning: string | undefined;
          if (assessment && career) {
            try {
              fallbackReasoning = generateEnhancedReasoning({
                assessment,
                career,
                overallScore: rec.overallMatchScore,
                language: narrativeLanguage,
              });
            } catch (error) {
              // Never let prose generation break the recommendations response.
              console.error('[Premium Fallback] Error generating reasoning for career:', career.id, error);
            }
          }
          return {
            ...rec,
            career: localizeCareer(career, isArabic),
            wefSkillTags,
            premiumReasoning: fallbackReasoning,
          };
        })
      );

      // Apply Arabic sector-name and country-name substitutions to the reasoning
      // field when the client is in Arabic mode.  Premium narratives
      // (premiumReasoning) are already generated in the right language, so we
      // only need to patch the stored English reasoning text.
      const needsLocalization = sectorArMap || (countryNameEn && countryNameAr);
      const localized = needsLocalization
        ? enriched.map((rec: any) => {
            if (!rec.reasoning) return rec;
            let localizedReasoning: string = rec.reasoning;
            // 1. Substitute sector names (e.g. "Technology" → "التكنولوجيا")
            if (sectorArMap) {
              sectorArMap.forEach((ar, en) => {
                const pattern = new RegExp(`\\b${escapeRegExp(en)}\\b`, "gi");
                localizedReasoning = localizedReasoning.replace(pattern, ar);
              });
            }
            // 2. Substitute country name (e.g. "UAE" → "الإمارات")
            if (countryNameEn && countryNameAr) {
              const countryPattern = new RegExp(`\\b${escapeRegExp(countryNameEn)}\\b`, "gi");
              localizedReasoning = localizedReasoning.replace(countryPattern, countryNameAr);
            }
            return localizedReasoning !== rec.reasoning
              ? { ...rec, reasoning: localizedReasoning }
              : rec;
          })
        : enriched;

      res.json(localized);
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
        // Anti-enumeration: same 403 as the not-owned case below so a missing
        // assessment is indistinguishable from one the caller doesn't own.
        return res.status(403).json({ message: "Unauthorized to access this report" });
      }

      // Authorization check (H1): verify ownership, including the guest case.
      // The previous guard was `assessment.userId && (...)`, so for a GUEST
      // assessment (assessment.userId null) it short-circuited to false and ran
      // no check at all — serving the student's PDF report (name, school,
      // scores) to anyone who knew or guessed the assessment ID. Add the guest
      // branch and fail closed, mirroring the C2/C4 ownership gate.
      const guestToken = req.query.guestToken || req.cookies?.guest_token;
      let owns = false;
      if (assessment.userId) {
        owns = req.isAuthenticated() && req.user.userId === assessment.userId;
      } else {
        owns = !!guestToken && guestToken === assessment.guestSessionId;
      }
      if (!owns) {
        return res.status(403).json({ message: "Unauthorized to access this report" });
      }

      // Tier gate: the downloadable PDF report is a premium feature. Free-tier
      // assessments have their per-student narrative withheld from
      // GET /api/recommendations, so a rendered PDF would carry blank narrative
      // sections — block it here instead. Mirrors the premium-feature 403
      // returned by the career-reasoning / education-pathways endpoints below.
      if (!isPremiumAssessment(assessment.assessmentType)) {
        return res.status(403).json({
          message: "PDF report is a premium feature",
          isPremium: false,
        });
      }

      // Import Puppeteer
      const puppeteer = await import("puppeteer");

      // Respect PUPPETEER_EXECUTABLE_PATH if the deploy env pins a specific
      // binary. Otherwise omit executablePath entirely and let Puppeteer use the
      // browser it manages itself (installed by `puppeteer browsers install`).
      // Deliberately NOT falling back to a `which chromium` lookup: that would
      // silently render with an unknown system Chrome version, and a base-image
      // change could flip which binary is used with no signal.
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

      // Launch headless browser
      // Note: --no-sandbox is required in containerized environments like Replit
      // Security is maintained through strict URL validation below
      browser = await puppeteer.default.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
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
      // Mint a short-lived token scoped to THIS assessment so the headless
      // browser (which carries no session cookie) can authorize the print
      // page's data fetches. Ownership has already been verified above, so it
      // is safe to mint here. Additive to the guest path — both coexist.
      const printToken = mintPrintToken(assessment.id);
      const printTokenParam = `&printToken=${encodeURIComponent(printToken)}`;
      // Resolve language for PDF rendering:
      // 1. Honour explicit ?lang= from the download request (allowlisted)
      // 2. Fall back to stored user preference
      // 3. Default to "en"
      const ALLOWED_LANGS = ["en", "ar"] as const;
      type AllowedLang = typeof ALLOWED_LANGS[number];
      const requestedLang = typeof req.query.lang === "string" ? req.query.lang.toLowerCase() : null;
      let pdfLang: AllowedLang = "en";
      if (requestedLang && (ALLOWED_LANGS as readonly string[]).includes(requestedLang)) {
        pdfLang = requestedLang as AllowedLang;
      } else if (assessment.userId) {
        const pdfUser = await storage.getUser(assessment.userId);
        const storedLang = pdfUser?.preferredLanguage ?? "";
        pdfLang = (ALLOWED_LANGS as readonly string[]).includes(storedLang) ? (storedLang as AllowedLang) : "en";
      }
      const printUrl = `${baseUrl}/print/results?assessmentId=${assessment.id}${guestTokenParam}${printTokenParam}&lang=${pdfLang}`;
      
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
        // Allow our app port or standard https (443) for production deployments
        const allowedPorts = [allowedPort, '443', '80', ''];
        if (!allowedPorts.includes(parsedUrl.port)) {
          throw new Error(`Port ${urlPort} is not allowed`);
        }
        
        // Build allowed hosts list (production runs on Render at futurepath.ae)
        const allowedHosts = ['localhost', '127.0.0.1'];
        const targetHost = parsedUrl.hostname.toLowerCase();

        // Our production host(s): the custom domain and Render's default *.onrender.com
        const isProductionHost = targetHost === 'futurepath.ae' ||
                                 targetHost === 'www.futurepath.ae' ||
                                 targetHost.endsWith('.onrender.com');

        // Allow the current request host when it is one of our own production hosts
        // or a local dev host. baseUrl is derived from req.get('host'), so this is
        // what legitimately drives printUrl in production on Render.
        const reqHost = req.get('host')?.split(':')[0]?.toLowerCase();
        const isReqHostAllowed = !!reqHost && (
          reqHost === 'futurepath.ae' ||
          reqHost === 'www.futurepath.ae' ||
          reqHost.endsWith('.onrender.com') ||
          reqHost === 'localhost' ||
          reqHost === '127.0.0.1'
        );
        if (isReqHostAllowed && reqHost && targetHost === reqHost) {
          allowedHosts.push(reqHost);
        }

        if (!allowedHosts.includes(targetHost) && !isProductionHost) {
          throw new Error('Host not in allowed list');
        }

        // Block attempts to use IP representation tricks
        const host = targetHost;
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
      
      // Wait only for the HTML document, not network idle: the print page keeps
      // fetching i18n locale JSON (and may poll LLM narratives) well past 30s, so
      // 'networkidle0' is never satisfied and goto times out. The real readiness
      // signal is window.__REPORT_READY__, which the print page sets only after
      // translations and report data have loaded (see waitForFunction below).
      await page.goto(printUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for report data to be fully loaded (set by the client once i18n
      // locale JSON is loaded and narratives have settled). 30s safety net.
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

  // Career Reasoning - LLM-generated "Why This Career?" narrative for premium reports
  // Protected with rate limiting to prevent LLM abuse
  app.get("/api/recommendations/:assessmentId/career-reasoning/:careerId", recommendationsLimiter, async (req: any, res) => {
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
        if (typeof req.isAuthenticated === 'function' && req.isAuthenticated() && req.user) {
          const userId = req.user.userId;
          if (userId && userId === assessment.userId) {
            isAuthorized = true;
          }
        }
      } else if (guestToken && typeof guestToken === 'string' && guestToken.startsWith('guest_')) {
        const guestAssessment = await storage.getAssessmentByGuestToken(guestToken);
        if (guestAssessment && guestAssessment.id === assessmentId) {
          isAuthorized = true;
        }
      }

      // Server-side PDF render: a print token scoped to THIS assessment
      // authorizes the premium narrative read (headless browser has no cookie).
      if (!isAuthorized && printTokenAuthorizes(req.query.printToken, assessmentId)) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        if (assessment.userId) {
          return res.status(401).json({ message: "Authentication required to access this assessment" });
        }
        return res.status(403).json({ message: "Invalid session. Please complete the assessment first." });
      }

      // Only available for premium assessments
      if (!isPremiumAssessment(assessment.assessmentType)) {
        return res.status(403).json({
          message: "Career Reasoning is a premium feature",
          isPremium: false
        });
      }

      const career = await storage.getCareerById(careerId);
      if (!career) {
        return res.status(404).json({ message: "Career not found" });
      }

      // Get the recommendation for this career
      const allRecommendations = await storage.getRecommendationsByAssessment(assessmentId);
      const recommendation = allRecommendations.find(r => r.careerId === careerId);
      if (!recommendation) {
        return res.status(404).json({ message: "Recommendation not found for this career" });
      }

      // Resolve narrative language: an explicit ?lang= query param takes
      // priority (used by the PDF renderer so the report language matches the
      // download language), falling back to the user's stored preference.
      const langOverride = typeof req.query.lang === 'string' ? req.query.lang : null;
      let narrativeLanguage = (langOverride === 'ar' || langOverride === 'en') ? langOverride : "en";
      if (!langOverride && assessment.userId) {
        const narrativeUser = await storage.getUser(assessment.userId);
        narrativeLanguage = narrativeUser?.preferredLanguage || "en";
      }

      // Import LLM service
      const { generateCareerReasoningNarrative, isLlmServiceAvailable } = await import("../services/llmNarrativeService");

      // Serve from cache first — this works even when LLM credentials are
      // disabled (e.g. admin removed the API key after initial generation).
      const cachedNarrative = await storage.getLlmNarrativeCache(
        assessmentId, careerId, "career_reasoning", narrativeLanguage
      ).catch(() => null);

      if (cachedNarrative) {
        return res.json({
          success: true,
          careerId,
          careerTitle: career.title,
          careerReasoning: cachedNarrative,
          model: "cached",
          fromCache: true,
        });
      }

      // Cache miss — LLM must be available to generate a fresh narrative
      const llmAvailable = await isLlmServiceAvailable(storage);
      if (!llmAvailable) {
        return res.status(503).json({
          message: "AI service is not configured. Please contact the administrator.",
          llmConfigured: false
        });
      }

      // Generate career reasoning narrative (also writes to cache on success)
      const result = await generateCareerReasoningNarrative(
        storage,
        assessment,
        career,
        recommendation.overallMatchScore,
        narrativeLanguage,
        recommendation.componentBreakdown as any
      );

      if (!result.success) {
        console.error("[Career Reasoning] LLM error:", result.error);
        return res.status(500).json({
          message: "Failed to generate career reasoning",
          error: result.error
        });
      }

      res.json({
        success: true,
        careerId,
        careerTitle: career.title,
        careerReasoning: result.narrative,
        model: result.model,
        tokensUsed: result.tokensUsed,
      });
    } catch (error) {
      console.error("Error generating career reasoning:", error);
      res.status(500).json({ message: "Failed to generate career reasoning" });
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

      // Resolve narrative language: an explicit ?lang= query param takes
      // priority (used by the PDF renderer so the report language matches the
      // download language), falling back to the user's stored preference.
      const langOverride = typeof req.query.lang === 'string' ? req.query.lang : null;
      let narrativeLanguage = (langOverride === 'ar' || langOverride === 'en') ? langOverride : "en";
      if (!langOverride && assessment.userId) {
        const narrativeUser = await storage.getUser(assessment.userId);
        narrativeLanguage = narrativeUser?.preferredLanguage || "en";
      }

      // Import LLM service
      const { generateEducationPathwaysNarrative, isLlmServiceAvailable } = await import("../services/llmNarrativeService");

      // Serve from cache first — this works even when LLM credentials are
      // disabled (e.g. admin removed the API key after initial generation).
      const cachedPathways = await storage.getLlmNarrativeCache(
        assessmentId, careerId, "education_pathways", narrativeLanguage
      ).catch(() => null);

      if (cachedPathways) {
        return res.json({
          success: true,
          careerId,
          careerTitle: career.title,
          educationPathways: cachedPathways,
          model: "cached",
          fromCache: true,
          caaLinks: {
            institutions: "https://caa.ae/Pages/Institutes/All.aspx",
            programs: "https://caa.ae/Pages/Programs/All.aspx"
          }
        });
      }

      // Cache miss — LLM must be available to generate a fresh narrative
      const llmAvailable = await isLlmServiceAvailable(storage);
      if (!llmAvailable) {
        return res.status(503).json({ 
          message: "AI service is not configured. Please contact the administrator.",
          llmConfigured: false
        });
      }

      // Generate education pathways narrative (also writes to cache on success)
      const result = await generateEducationPathwaysNarrative(
        storage,
        assessment,
        career,
        recommendation.overallMatchScore,
        narrativeLanguage
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
