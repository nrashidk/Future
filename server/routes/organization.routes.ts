import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";

export function registerOrganizationRoutes(app: Express) {
  // Organization Admin Endpoints (for org_admin users to access their organization data)
  app.get("/api/my-organization", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user || user.accountType !== 'org_admin') {
        return res.status(403).json({ message: "Access denied: Organization admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  app.get("/api/my-organization/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user || user.accountType !== 'org_admin') {
        return res.status(403).json({ message: "Access denied: Organization admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Get organization statistics with accurate assessment completion data
      const stats = await storage.getOrganizationStats(organization.id);
      
      res.json({
        totalLicenses: organization.totalLicenses,
        usedLicenses: organization.usedLicenses,
        remainingLicenses: Math.max(0, organization.totalLicenses - organization.usedLicenses),
        ...stats,
      });
    } catch (error) {
      console.error("Error fetching organization stats:", error);
      res.status(500).json({ message: "Failed to fetch organization stats" });
    }
  });
}
