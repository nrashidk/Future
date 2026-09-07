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
      
      // MEMBERSHIP COMES FROM THE MEMBER ROW, NOT users.accountType — the same
      // test PATCH /api/assessments/:id uses to decide which fields a school
      // owns (14459a4, assessment.routes.ts). These two must agree: this handler
      // supplies the values the assessment form pre-fills and renders read-only,
      // and that route overwrites those same fields with the school's values. If
      // one keys on accountType and the other on the member row, a student whose
      // flag is wrong gets a blank, editable form and then a silent overwrite —
      // precisely the confusing state the silent overwrite was chosen to avoid.
      //
      // role === 'student', not merely "has a member row": school admins share
      // this table (schema.ts:159) and are not students of their own school.
      //
      // Costs one indexed lookup on a unique column for every caller rather than
      // only for self-declared org students. That is the price of not trusting a
      // flag with eight write sites, one of which (auth.ts:353) already writes a
      // value outside its own documented set. Superadmins are exempted since
      // they are never enrolled.
      const orgMember = isSuperadmin
        ? undefined
        : await storage.getOrganizationMemberByUserId(userId);

      if (orgMember?.role === 'student') {
        // Organization students are treated as premium since they have school
        // access. Derived from the same row as the pre-fill, so the two cannot
        // disagree about who is a school student.
        user.isPremium = true;

        // An explicit flag, so the client stops inferring membership from
        // whether a pre-filled value happens to be present. DemographicsStep
        // derived it as `!!predefinedGrade`, which conflates "is a school
        // student" with "has a grade on file" — the same category error as
        // keying on accountType, one layer up.
        (user as any).isOrgStudent = true;

        // Pre-filled student info. The assessment renders these read-only for
        // org students; PATCH enforces them regardless.
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
