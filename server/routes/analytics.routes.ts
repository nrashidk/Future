import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";

/**
 * Get superadmin emails from environment variable
 */
const getSuperadminEmails = (): string[] => {
  return (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim())
    .filter(e => e.length > 0);
};

/**
 * Helper to check if user is superadmin
 */
const checkSuperadmin = async (req: any): Promise<boolean> => {
  const userId = (req.user as any).userId;
  const user = await storage.getUser(userId);
  
  if (!user) return false;
  
  const superadminEmails = getSuperadminEmails();
  return (!(req.user as any).isLocal && user.email && superadminEmails.includes(user.email)) || user.role === "superadmin";
};

/**
 * Helper to get organization ID for org_admin users
 */
const getOrgAdminOrganizationId = async (req: any): Promise<string | null> => {
  const userId = (req.user as any).userId;
  const user = await storage.getUser(userId);
  
  if (!user || user.accountType !== "org_admin") return null;
  
  const organization = await storage.getOrganizationByAdminUserId(userId);
  return organization?.id || null;
};

export function registerAnalyticsRoutes(app: Express) {
  app.get("/api/analytics/overview", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      const countryId = req.query.countryId as string | undefined;
      
      // Org admins only see their organization's data
      const orgId = isSuperadmin ? null : await getOrgAdminOrganizationId(req);
      const organizationId = orgId || undefined;
      
      if (!isSuperadmin && !orgId) {
        return res.status(403).json({ message: "Forbidden: Analytics access requires admin privileges" });
      }
      
      const analytics = await storage.getAnalyticsOverview(countryId, organizationId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics overview:", error);
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  app.get("/api/analytics/countries", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      
      // Org admins only see their organization's data
      const orgId = isSuperadmin ? null : await getOrgAdminOrganizationId(req);
      const organizationId = orgId || undefined;
      
      if (!isSuperadmin && !orgId) {
        return res.status(403).json({ message: "Forbidden: Analytics access requires admin privileges" });
      }
      
      // Get all countries with completed assessments (filtered by organization if org_admin)
      const analytics = await storage.getAnalyticsOverview(undefined, organizationId);
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

  app.get("/api/analytics/country/:id", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      
      // Org admins only see their organization's data
      const orgId = isSuperadmin ? null : await getOrgAdminOrganizationId(req);
      const organizationId = orgId || undefined;
      
      if (!isSuperadmin && !orgId) {
        return res.status(403).json({ message: "Forbidden: Analytics access requires admin privileges" });
      }
      
      const analytics = await storage.getCountryAnalytics(req.params.id, organizationId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching country analytics:", error);
      res.status(500).json({ message: "Failed to fetch country analytics" });
    }
  });

  app.get("/api/analytics/careers", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      const countryId = req.query.countryId as string | undefined;
      
      // Org admins only see their organization's data
      const orgId = isSuperadmin ? null : await getOrgAdminOrganizationId(req);
      const organizationId = orgId || undefined;
      
      if (!isSuperadmin && !orgId) {
        return res.status(403).json({ message: "Forbidden: Analytics access requires admin privileges" });
      }
      
      const trends = await storage.getCareerTrends(countryId, organizationId);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/trends", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      const countryId = req.query.countryId as string | undefined;
      
      // Org admins only see their organization's data
      const orgId = isSuperadmin ? null : await getOrgAdminOrganizationId(req);
      const organizationId = orgId || undefined;
      
      if (!isSuperadmin && !orgId) {
        return res.status(403).json({ message: "Forbidden: Analytics access requires admin privileges" });
      }
      
      const trends = await storage.getCareerTrends(countryId, organizationId);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/sectors", isAuthenticated, async (req, res) => {
    try {
      const isSuperadmin = await checkSuperadmin(req);
      const countryId = req.query.countryId as string | undefined;
      
      // Org admins only see their organization's data
      const orgId = isSuperadmin ? null : await getOrgAdminOrganizationId(req);
      const organizationId = orgId || undefined;
      
      if (!isSuperadmin && !orgId) {
        return res.status(403).json({ message: "Forbidden: Analytics access requires admin privileges" });
      }
      
      const pipeline = await storage.getSectorPipeline(countryId, organizationId);
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching sector pipeline:", error);
      res.status(500).json({ message: "Failed to fetch sector pipeline" });
    }
  });
}
