import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";

function getSuperadminEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user is a superadmin based on email or role
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (!(req.user as any).isLocal && user.email && superadminEmails.includes(user.email.toLowerCase())) ||
        user.role === "superadmin" ||
        user.accountType === "superadmin";
      
      if (isSuperadmin) {
        user.accountType = "superadmin";
      }
      
      // Organization students should be treated as premium users since they have school access
      if (user.accountType === 'org_student') {
        user.isPremium = true;
        
        // Fetch organization member data to get pre-filled student info
        const orgMember = await storage.getOrganizationMemberByUserId(userId);
        if (orgMember) {
          // Add all pre-filled fields to user object
          (user as any).predefinedGrade = orgMember.grade;
          (user as any).predefinedName = orgMember.studentName;
          (user as any).predefinedAge = orgMember.studentAge;
          (user as any).predefinedGender = orgMember.studentGender;
          
          // Fetch organization details to get school name, logo, and country
          const organization = await storage.getOrganizationById(orgMember.organizationId);
          if (organization) {
            (user as any).organizationName = organization.name;
            (user as any).organizationLogoUrl = organization.logoUrl || null;
            (user as any).organizationCountryId = organization.countryId || null;
          }
        }
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
