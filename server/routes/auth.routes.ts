import type { Express } from "express";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { getSuperadminEmails } from "../middleware/auth.middleware";
import { toPublicUser } from "@shared/userPublic";

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user is a superadmin based on email or role
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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
            // Paired with organizationCountryId: the assessment's CountryStep
            // pre-fills both, and POST/PATCH /api/assessments force the org's
            // curriculum for org_students anyway — sending it lets the form show
            // the value the server is going to store.
            (user as any).organizationCurriculum = organization.curriculum || null;
          }
        }
      }
      
      // Strips passwordHash and other private columns; the decorations added
      // above (predefinedGrade, organizationName, …) are not `users` columns
      // and are preserved, as are the accountType/isPremium adjustments.
      res.json(toPublicUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
