import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { z } from "zod";
import { clearSubjectCache } from "../utils/subjects";
import { dataExportLimiter, orgCreationLimiter } from "../middleware/rateLimiter.middleware";
import { getSuperadminEmails } from "../middleware/auth.middleware";
import { toPublicUser } from "@shared/userPublic";
import type { User } from "@shared/schema";
import * as fileStorage from "../services/fileStorage";
import Stripe from "stripe";

// Initialize Stripe only if keys are configured
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-10-29.clover",
  });
}

const isSuperadminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any).userId;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const superadminEmails = getSuperadminEmails();
    const isSuperadmin = 
      (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
      user.role === "superadmin";
    
    if (!isSuperadmin) {
      return res.status(403).json({ message: "Forbidden: Superadmin access required" });
    }

    (req as any).currentUser = user;
    next();
  } catch (error) {
    console.error("Superadmin middleware error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ===============================
// PAYMENT RECONCILIATION - classification (READ-ONLY)
// ===============================

// A succeeded PaymentIntent whose metadata.processed is not "true". Every
// residual path in the payment code returns BEFORE its
// paymentIntents.update(processed) call, so this filter has no false negatives -
// but it has plenty of false positives (a grant that landed and then failed to
// stamp still looks unreconciled). That is why classification reconciles against
// live DB account state instead of trusting the flag.
type ReconciliationClass =
  | "amount_mismatch"    // amount != metadata.expectedAmount - suspicious, NEVER grant
  | "unidentifiable"     // no userId and no buyerEmail - nothing to resolve against
  | "group_incomplete"   // studentCount > 1 - org cannot be rebuilt from an individual grant
  | "already_granted"    // account resolves and is premium - stamp was lost, NOT a money hole
  | "oauth_blocked"      // resolves to a passwordHash-less account - needs verified login
  | "grantable_user"     // real server-derived userId, account exists, not premium
  | "grantable_guest";   // guest + buyerEmail, single seat, resolves-or-free

interface ReconciliationRow {
  id: string;
  created: string;
  amount: number;
  currency: string;
  class: ReconciliationClass;
  studentCount: number;
  metadataUserId: string | null;
  buyerEmail: string | null;
  resolvedUserId: string | null;
  resolvedEmail: string | null;
  resolvedVia: "userId" | "buyerEmail" | null;
}

/**
 * Classify one unreconciled PaymentIntent. READ-ONLY: reads Stripe metadata that
 * was already fetched, plus at most two DB lookups. Writes nothing.
 *
 * Precedence is deliberate and order-dependent - several classes can match one
 * intent, and the first match wins:
 *   1. amount_mismatch  - a tampering signal outranks every recovery path.
 *   2. unidentifiable   - without an identity the remaining checks cannot run.
 *   3. group_incomplete - for studentCount > 1, "buyer is premium" is NOT proof
 *      the purchase completed: the organisation is the deliverable, and
 *      organizationName is only present on intents stamped after that fix
 *      shipped. Ranked above already_granted so a buyer who paid for 50 seats
 *      and holds 1 personal licence is never reported as fully reconciled.
 *   4. already_granted  - the false-positive filter for a lost stamp.
 *   5. oauth_blocked    - resolves, not premium, no password to grant against.
 *   6/7. grantable_*    - what a later, opt-in grant pass could safely act on.
 */
// Exported for unit testing (superadmin.reconciliation.test.ts); not routed directly.
export async function classifyUnreconciledIntent(pi: Stripe.PaymentIntent): Promise<ReconciliationRow> {
  const md = pi.metadata ?? {};
  const metadataUserId = md.userId || null;
  const buyerEmail = typeof md.buyerEmail === "string" && md.buyerEmail.trim() ? md.buyerEmail.trim() : null;

  const parsedCount = parseInt(md.studentCount || "1", 10);
  const studentCount = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 1;

  const isRealUserId = Boolean(metadataUserId && metadataUserId !== "guest");

  const base = {
    id: pi.id,
    created: new Date(pi.created * 1000).toISOString(),
    amount: pi.amount / 100,
    currency: pi.currency,
    studentCount,
    metadataUserId,
    buyerEmail,
  };

  // 1. Amount tampering - report, never grant. Mirrors the webhook guard at
  //    webhook.routes.ts:125-128.
  const expectedAmount = md.expectedAmount ? parseInt(md.expectedAmount, 10) : NaN;
  if (!Number.isInteger(expectedAmount) || pi.amount !== expectedAmount) {
    return { ...base, class: "amount_mismatch", resolvedUserId: null, resolvedEmail: null, resolvedVia: null };
  }

  // 2. No identity at all: stamp-buyer never landed and this was a guest. The
  //    charge object may still carry a billing email, but nothing in this
  //    codebase reads it - manual review only.
  if (!isRealUserId && !buyerEmail) {
    return { ...base, class: "unidentifiable", resolvedUserId: null, resolvedEmail: null, resolvedVia: null };
  }

  // Resolve the buyer. userId is server-derived at intent creation
  // (payment.routes.ts:56-58) so it is the stronger signal; buyerEmail is
  // client-supplied and only used as a fallback.
  let account: User | undefined;
  let resolvedVia: "userId" | "buyerEmail" | null = null;

  if (isRealUserId) {
    account = await storage.getUser(metadataUserId!);
    if (account) resolvedVia = "userId";
  }
  if (!account && buyerEmail) {
    account = await storage.getUserByEmail(buyerEmail);
    if (account) resolvedVia = "buyerEmail";
  }

  const resolved = {
    resolvedUserId: account?.id ?? null,
    resolvedEmail: account?.email ?? null,
    resolvedVia,
  };

  // 3. Group purchase - see precedence note above.
  if (studentCount > 1) {
    return { ...base, ...resolved, class: "group_incomplete" };
  }

  if (account) {
    // 4. Granted already; only the metadata stamp is missing.
    if (account.isPremium) {
      return { ...base, ...resolved, class: "already_granted" };
    }
    // 5. OAuth-only account - cannot be granted on an email match alone.
    if (!account.passwordHash) {
      return { ...base, ...resolved, class: "oauth_blocked" };
    }
  }

  // 6. Strong identity, account present, not premium.
  if (isRealUserId) {
    if (account) {
      return { ...base, ...resolved, class: "grantable_user" };
    }
    // A server-derived userId that no longer resolves (account deleted) and no
    // email fallback - there is no target to grant to.
    return { ...base, ...resolved, class: "unidentifiable" };
  }

  // 7. Guest with a stamped email, single seat: either free (would create) or a
  //    local non-premium account (would upgrade). Same shape the Fix 2 webhook
  //    backstop already handles.
  return { ...base, ...resolved, class: "grantable_guest" };
}

export function registerSuperadminRoutes(app: Express) {
  // ===============================
  // SUPERADMIN DASHBOARD METRICS
  // ===============================
  
  app.get("/api/superadmin/metrics", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const organizations = await storage.getAllOrganizations();
      
      let totalSchools = organizations.length;
      let totalLicenses = 0;
      let usedLicenses = 0;
      let unlimitedSchools = 0;
      let totalStudents = 0;
      let studentsCompleted = 0;
      
      for (const org of organizations) {
        if (org.isUnlimitedLicenses) {
          unlimitedSchools++;
        } else {
          totalLicenses += org.totalLicenses;
        }
        usedLicenses += org.usedLicenses;
        
        const members = await storage.getOrganizationMembersByOrganizationId(org.id);
        const students = members.filter(m => m.role === "student");
        totalStudents += students.length;
        studentsCompleted += students.filter(s => s.hasCompletedAssessment).length;
      }
      
      let totalAdmins = 0;
      for (const org of organizations) {
        const members = await storage.getOrganizationMembersByOrganizationId(org.id);
        totalAdmins += members.filter((m: any) => m.role === "admin").length;
      }
      
      const utilizationRate = totalLicenses > 0 ? Math.round((usedLicenses / totalLicenses) * 100) : 0;
      const completionRate = totalStudents > 0 ? Math.round((studentsCompleted / totalStudents) * 100) : 0;
      
      res.json({
        totalSchools,
        totalAdmins,
        totalStudents,
        studentsCompleted,
        totalLicenses,
        usedLicenses,
        unlimitedSchools,
        utilizationRate,
        completionRate,
      });
    } catch (error) {
      console.error("Error fetching superadmin metrics:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // ===============================
  // ORGANIZATIONS DIRECTORY (with search/filter/sort)
  // ===============================
  
  app.get("/api/superadmin/organizations", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { search, country, licenseStatus, sortBy, sortOrder } = req.query;
      
      let organizations = await storage.getAllOrganizations();
      
      if (search) {
        const searchLower = (search as string).toLowerCase();
        organizations = organizations.filter(org => 
          org.name.toLowerCase().includes(searchLower)
        );
      }
      
      if (country) {
        organizations = organizations.filter(org => org.countryId === country);
      }
      
      if (licenseStatus) {
        switch (licenseStatus) {
          case "unlimited":
            organizations = organizations.filter(org => org.isUnlimitedLicenses);
            break;
          case "low":
            organizations = organizations.filter(org => {
              if (org.isUnlimitedLicenses) return false;
              const remaining = org.totalLicenses - org.usedLicenses;
              return remaining <= 10 && remaining > 0;
            });
            break;
          case "exhausted":
            organizations = organizations.filter(org => {
              if (org.isUnlimitedLicenses) return false;
              return org.usedLicenses >= org.totalLicenses;
            });
            break;
          case "active":
            organizations = organizations.filter(org => {
              if (org.isUnlimitedLicenses) return true;
              return org.usedLicenses < org.totalLicenses;
            });
            break;
        }
      }
      
      const orgWithDetails = await Promise.all(organizations.map(async (org) => {
        const members = await storage.getOrganizationMembersByOrganizationId(org.id);
        const admins = members.filter(m => m.role === "admin");
        const students = members.filter(m => m.role === "student");
        const primaryAdmin = admins.find(a => a.isPrimaryAdmin) || admins[0];
        
        let primaryAdminDetails = null;
        if (primaryAdmin) {
          const adminUser = await storage.getUser(primaryAdmin.userId);
          if (adminUser) {
            primaryAdminDetails = {
              id: adminUser.id,
              username: adminUser.username,
              email: adminUser.email,
              firstName: adminUser.firstName,
              lastName: adminUser.lastName,
              phone: adminUser.phone,
            };
          }
        }
        
        const utilizationRate = org.isUnlimitedLicenses 
          ? null 
          : (org.totalLicenses > 0 ? Math.round((org.usedLicenses / org.totalLicenses) * 100) : 0);
        
        return {
          ...org,
          adminCount: admins.length,
          studentCount: students.length,
          completedCount: students.filter(s => s.hasCompletedAssessment).length,
          primaryAdmin: primaryAdminDetails,
          utilizationRate,
        };
      }));
      
      if (sortBy) {
        const order = sortOrder === "desc" ? -1 : 1;
        orgWithDetails.sort((a, b) => {
          switch (sortBy) {
            case "name":
              return order * a.name.localeCompare(b.name);
            case "students":
              return order * (a.studentCount - b.studentCount);
            case "licenses":
              return order * ((a.totalLicenses || 0) - (b.totalLicenses || 0));
            case "utilization":
              return order * ((a.utilizationRate || 0) - (b.utilizationRate || 0));
            case "created":
              return order * (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
            default:
              return 0;
          }
        });
      }
      
      res.json(orgWithDetails);
    } catch (error) {
      console.error("Error fetching organizations directory:", error);
      res.status(500).json({ message: "Failed to fetch schools" });
    }
  });

  // ===============================
  // ORGANIZATION ADMINS
  // ===============================
  
  app.get("/api/superadmin/organizations/:id/admins", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const org = await storage.getOrganizationById(req.params.id);
      if (!org) {
        return res.status(404).json({ message: "School not found" });
      }
      
      const members = await storage.getOrganizationMembersByOrganizationId(req.params.id);
      const admins = members.filter(m => m.role === "admin");
      
      const adminDetails = await Promise.all(admins.map(async (admin) => {
        const user = await storage.getUser(admin.userId);
        return {
          memberId: admin.id,
          userId: admin.userId,
          isPrimaryAdmin: admin.isPrimaryAdmin,
          createdAt: admin.createdAt,
          user: user ? {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            createdAt: user.createdAt,
          } : null,
        };
      }));
      
      res.json(adminDetails);
    } catch (error) {
      console.error("Error fetching school admins:", error);
      res.status(500).json({ message: "Failed to fetch school admins" });
    }
  });

  // Add a new admin to an organization
  app.post("/api/superadmin/organizations/:id/admins", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const org = await storage.getOrganizationById(req.params.id);
      if (!org) {
        return res.status(404).json({ message: "School not found" });
      }
      
      const { firstName, lastName, email, phone, username } = req.body;
      
      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First name and last name are required" });
      }
      
      const { generateUsername, generatePassword } = await import("../utils/passwordGenerator");
      const { hashPassword } = await import("../utils/passwordHash");

      // Check for duplicate email before attempting insert
      if (email) {
        const existingByEmail = await storage.getUserByEmail(email);
        if (existingByEmail) {
          return res.status(400).json({ message: "An account with this email address already exists" });
        }
      }
      
      let finalUsername = username;
      if (!finalUsername) {
        finalUsername = generateUsername(firstName, lastName);
        let attempts = 0;
        while (attempts < 10) {
          const existing = await storage.getUserByUsername(finalUsername);
          if (!existing) break;
          finalUsername = generateUsername(firstName, lastName);
          attempts++;
        }
        if (attempts >= 10) {
          return res.status(400).json({ message: "Could not generate a unique username. Please provide one manually." });
        }
      } else {
        const existing = await storage.getUserByUsername(finalUsername);
        if (existing) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }
      
      const password = generatePassword("strong");
      const passwordHash = await hashPassword(password);
      
      const newUser = await storage.upsertUser({
        id: crypto.randomUUID(),
        email: email || null,
        firstName,
        lastName,
        phone: phone || null,
        role: "user",
        username: finalUsername,
        passwordHash,
        accountType: "org_admin",
        isOrgGenerated: true,
      });
      
      const member = await storage.createOrganizationMember({
        organizationId: req.params.id,
        userId: newUser.id,
        role: "admin",
        isPrimaryAdmin: false,
      });
      
      const currentUser = (req as any).currentUser;
      await storage.createOrganizationEvent({
        organizationId: req.params.id,
        eventType: "admin_added",
        eventDescription: `Added new admin: ${firstName} ${lastName} (${finalUsername})`,
        performedBy: currentUser.id,
        performedByRole: "superadmin",
        affectedUserId: newUser.id,
        newValue: { username: finalUsername, email, firstName, lastName },
      });
      
      res.status(201).json({
        user: {
          id: newUser.id,
          username: finalUsername,
          email,
          firstName,
          lastName,
          phone,
        },
        member,
        credentials: {
          username: finalUsername,
          password,
        },
      });
    } catch (error) {
      console.error("Error adding school admin:", error);
      res.status(500).json({ message: "Failed to add school admin" });
    }
  });

  // Remove admin from school
  app.delete("/api/superadmin/organizations/:orgId/admins/:memberId", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { orgId, memberId } = req.params;
      
      const org = await storage.getOrganizationById(orgId);
      if (!org) {
        return res.status(404).json({ message: "School not found" });
      }
      
      const members = await storage.getOrganizationMembersByOrganizationId(orgId);
      const adminToRemove = members.find(m => m.id === memberId && m.role === "admin");
      
      if (!adminToRemove) {
        return res.status(404).json({ message: "Admin not found" });
      }
      
      if (adminToRemove.isPrimaryAdmin) {
        return res.status(400).json({ message: "Cannot remove primary admin. Transfer primary admin role first." });
      }
      
      const admins = members.filter(m => m.role === "admin");
      if (admins.length <= 1) {
        return res.status(400).json({ message: "Cannot remove the last admin from a school" });
      }
      
      const removedUser = await storage.getUser(adminToRemove.userId);
      
      await storage.deleteOrganizationMember(memberId);
      
      const currentUser = (req as any).currentUser;
      await storage.createOrganizationEvent({
        organizationId: orgId,
        eventType: "admin_removed",
        eventDescription: `Removed admin: ${removedUser?.firstName || ""} ${removedUser?.lastName || ""} (${removedUser?.username || "unknown"})`,
        performedBy: currentUser.id,
        performedByRole: "superadmin",
        affectedUserId: adminToRemove.userId,
        previousValue: { username: removedUser?.username, email: removedUser?.email },
      });
      
      res.json({ success: true, message: "Admin removed successfully" });
    } catch (error) {
      console.error("Error removing school admin:", error);
      res.status(500).json({ message: "Failed to remove school admin" });
    }
  });

  // Promote admin to primary
  app.patch("/api/superadmin/organizations/:orgId/admins/:memberId/promote", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { orgId, memberId } = req.params;
      
      const org = await storage.getOrganizationById(orgId);
      if (!org) {
        return res.status(404).json({ message: "School not found" });
      }
      
      const members = await storage.getOrganizationMembersByOrganizationId(orgId);
      const adminToPromote = members.find(m => m.id === memberId && m.role === "admin");
      
      if (!adminToPromote) {
        return res.status(404).json({ message: "Admin not found" });
      }
      
      const currentPrimary = members.find(m => m.isPrimaryAdmin);
      if (currentPrimary) {
        await storage.updateOrganizationMember(currentPrimary.id, { isPrimaryAdmin: false });
      }
      
      await storage.updateOrganizationMember(memberId, { isPrimaryAdmin: true });
      
      const promotedUser = await storage.getUser(adminToPromote.userId);
      const currentUser = (req as any).currentUser;
      
      await storage.createOrganizationEvent({
        organizationId: orgId,
        eventType: "admin_promoted",
        eventDescription: `Promoted ${promotedUser?.firstName || ""} ${promotedUser?.lastName || ""} to primary admin`,
        performedBy: currentUser.id,
        performedByRole: "superadmin",
        affectedUserId: adminToPromote.userId,
        previousValue: currentPrimary ? { previousPrimaryUserId: currentPrimary.userId } : null,
        newValue: { newPrimaryUserId: adminToPromote.userId },
      });
      
      res.json({ success: true, message: "Admin promoted to primary" });
    } catch (error) {
      console.error("Error promoting admin:", error);
      res.status(500).json({ message: "Failed to promote admin" });
    }
  });

  // ===============================
  // LICENSE MANAGEMENT
  // ===============================
  
  app.patch("/api/superadmin/organizations/:id/licenses", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const org = await storage.getOrganizationById(req.params.id);
      if (!org) {
        return res.status(404).json({ message: "School not found" });
      }
      
      const { totalLicenses, isUnlimitedLicenses, adjustment } = req.body;
      
      const currentUser = (req as any).currentUser;
      const previousValue = {
        totalLicenses: org.totalLicenses,
        isUnlimitedLicenses: org.isUnlimitedLicenses,
      };
      
      let newTotalLicenses = org.totalLicenses;
      let newIsUnlimited = org.isUnlimitedLicenses;
      let eventType = "";
      let eventDescription = "";
      
      if (isUnlimitedLicenses !== undefined) {
        newIsUnlimited = Boolean(isUnlimitedLicenses);
        if (newIsUnlimited && !org.isUnlimitedLicenses) {
          eventType = "unlimited_enabled";
          eventDescription = "Enabled unlimited licenses";
        } else if (!newIsUnlimited && org.isUnlimitedLicenses) {
          eventType = "unlimited_disabled";
          eventDescription = "Disabled unlimited licenses";
          if (totalLicenses === undefined) {
            return res.status(400).json({ message: "Must specify totalLicenses when disabling unlimited" });
          }
        }
      }
      
      if (totalLicenses !== undefined) {
        newTotalLicenses = parseInt(totalLicenses);
        if (newTotalLicenses < org.usedLicenses) {
          return res.status(400).json({ 
            message: `Cannot set licenses below used count. Currently ${org.usedLicenses} licenses are in use.` 
          });
        }
        if (!eventType) {
          const diff = newTotalLicenses - org.totalLicenses;
          if (diff > 0) {
            eventType = "license_added";
            eventDescription = `Added ${diff} licenses (${org.totalLicenses} → ${newTotalLicenses})`;
          } else if (diff < 0) {
            eventType = "license_removed";
            eventDescription = `Removed ${Math.abs(diff)} licenses (${org.totalLicenses} → ${newTotalLicenses})`;
          }
        }
      } else if (adjustment !== undefined) {
        const adj = parseInt(adjustment);
        newTotalLicenses = org.totalLicenses + adj;
        if (newTotalLicenses < org.usedLicenses) {
          return res.status(400).json({ 
            message: `Cannot reduce licenses below used count. Currently ${org.usedLicenses} licenses are in use.` 
          });
        }
        if (adj > 0) {
          eventType = "license_added";
          eventDescription = `Added ${adj} licenses (${org.totalLicenses} → ${newTotalLicenses})`;
        } else if (adj < 0) {
          eventType = "license_removed";
          eventDescription = `Removed ${Math.abs(adj)} licenses (${org.totalLicenses} → ${newTotalLicenses})`;
        }
      }
      
      const updated = await storage.updateOrganization(req.params.id, {
        totalLicenses: newTotalLicenses,
        isUnlimitedLicenses: newIsUnlimited,
      });
      
      if (eventType) {
        await storage.createOrganizationEvent({
          organizationId: req.params.id,
          eventType,
          eventDescription,
          performedBy: currentUser.id,
          performedByRole: "superadmin",
          previousValue,
          newValue: {
            totalLicenses: newTotalLicenses,
            isUnlimitedLicenses: newIsUnlimited,
          },
        });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating licenses:", error);
      res.status(500).json({ message: "Failed to update licenses" });
    }
  });

  // ===============================
  // ORGANIZATION EVENTS (AUDIT LOG)
  // ===============================
  
  app.get("/api/superadmin/organizations/:id/events", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const org = await storage.getOrganizationById(req.params.id);
      if (!org) {
        return res.status(404).json({ message: "School not found" });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const events = await storage.getOrganizationEvents(req.params.id, limit);
      
      const eventsWithPerformer = await Promise.all(events.map(async (event) => {
        const performer = await storage.getUser(event.performedBy);
        return {
          ...event,
          performer: performer ? {
            id: performer.id,
            username: performer.username,
            firstName: performer.firstName,
            lastName: performer.lastName,
          } : null,
        };
      }));
      
      res.json(eventsWithPerformer);
    } catch (error) {
      console.error("Error fetching organization events:", error);
      res.status(500).json({ message: "Failed to fetch organization events" });
    }
  });

  // Get all events (for superadmin overview)
  app.get("/api/superadmin/events", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const events = await storage.getAllOrganizationEvents(limit);
      
      const eventsWithDetails = await Promise.all(events.map(async (event) => {
        const [performer, org] = await Promise.all([
          storage.getUser(event.performedBy),
          storage.getOrganizationById(event.organizationId),
        ]);
        return {
          ...event,
          performer: performer ? {
            id: performer.id,
            username: performer.username,
            firstName: performer.firstName,
            lastName: performer.lastName,
          } : null,
          organization: org ? {
            id: org.id,
            name: org.name,
          } : null,
        };
      }));
      
      res.json(eventsWithDetails);
    } catch (error) {
      console.error("Error fetching all events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // ===============================
  // CREATE ORGANIZATION WITH ADMIN
  // ===============================
  
  app.post("/api/superadmin/organizations/create-with-admin", isAuthenticated, isSuperadminMiddleware, orgCreationLimiter, async (req, res) => {
    try {
      const { 
        organizationName, 
        totalLicenses, 
        isUnlimitedLicenses,
        countryId,
        curriculum,
        adminFirstName, 
        adminLastName, 
        adminEmail, 
        adminPhone,
        adminUsername,
      } = req.body;
      
      if (!organizationName) {
        return res.status(400).json({ message: "Organization name is required" });
      }
      
      if (!isUnlimitedLicenses && (!totalLicenses || totalLicenses <= 0)) {
        return res.status(400).json({ message: "Total licenses must be greater than 0 (or enable unlimited)" });
      }
      
      if (!adminFirstName || !adminLastName) {
        return res.status(400).json({ message: "Admin first name and last name are required" });
      }

      if (adminEmail) {
        const existingByEmail = await storage.getUserByEmail(adminEmail);
        if (existingByEmail) {
          return res.status(400).json({ message: "A user with this email address already exists in the system" });
        }
      }
      
      const { generateUsername, generatePassword } = await import("../utils/passwordGenerator");
      const { hashPassword } = await import("../utils/passwordHash");
      
      let finalUsername = adminUsername;
      if (!finalUsername) {
        finalUsername = generateUsername(adminFirstName, adminLastName);
        let attempts = 0;
        while (attempts < 10) {
          const existing = await storage.getUserByUsername(finalUsername);
          if (!existing) break;
          finalUsername = generateUsername(adminFirstName, adminLastName);
          attempts++;
        }
      } else {
        const existing = await storage.getUserByUsername(finalUsername);
        if (existing) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }
      
      const password = generatePassword("strong");
      const passwordHash = await hashPassword(password);
      
      const adminUser = await storage.upsertUser({
        id: crypto.randomUUID(),
        email: adminEmail || null,
        firstName: adminFirstName,
        lastName: adminLastName,
        phone: adminPhone || null,
        role: "user",
        username: finalUsername,
        passwordHash,
        accountType: "org_admin",
        isOrgGenerated: true,
      });
      
      const organization = await storage.createOrganization({
        name: organizationName,
        adminUserId: adminUser.id,
        totalLicenses: isUnlimitedLicenses ? 0 : parseInt(totalLicenses),
        usedLicenses: 0,
        isUnlimitedLicenses: Boolean(isUnlimitedLicenses),
        countryId: countryId || null,
        curriculum: curriculum || null,
      });
      
      const member = await storage.createOrganizationMember({
        organizationId: organization.id,
        userId: adminUser.id,
        role: "admin",
        isPrimaryAdmin: true,
      });
      
      const currentUser = (req as any).currentUser;
      await storage.createOrganizationEvent({
        organizationId: organization.id,
        eventType: "admin_added",
        eventDescription: `Created organization with primary admin: ${adminFirstName} ${adminLastName} (${finalUsername})`,
        performedBy: currentUser.id,
        performedByRole: "superadmin",
        affectedUserId: adminUser.id,
        newValue: { 
          organizationName, 
          totalLicenses: isUnlimitedLicenses ? "unlimited" : totalLicenses,
          adminUsername: finalUsername,
        },
      });
      
      res.status(201).json({
        organization,
        admin: {
          user: {
            id: adminUser.id,
            username: finalUsername,
            email: adminEmail,
            firstName: adminFirstName,
            lastName: adminLastName,
            phone: adminPhone,
          },
          member,
          credentials: {
            username: finalUsername,
            password,
          },
        },
      });
    } catch (error) {
      console.error("Error creating organization with admin:", error);
      res.status(500).json({ message: "Failed to create school" });
    }
  });

  // ===============================
  // BULK OPERATIONS
  // ===============================
  
  app.get("/api/superadmin/export/organizations", isAuthenticated, isSuperadminMiddleware, dataExportLimiter, async (req, res) => {
    try {
      const format = req.query.format === "json" ? "json" : "csv";
      const organizations = await storage.getAllOrganizations();
      
      const orgData = await Promise.all(organizations.map(async (org) => {
        const members = await storage.getOrganizationMembersByOrganizationId(org.id);
        const admins = members.filter(m => m.role === "admin");
        const students = members.filter(m => m.role === "student");
        const primaryAdmin = admins.find(a => a.isPrimaryAdmin) || admins[0];
        
        let primaryAdminUser = null;
        if (primaryAdmin) {
          primaryAdminUser = await storage.getUser(primaryAdmin.userId);
        }
        
        return {
          id: org.id,
          name: org.name,
          totalLicenses: org.isUnlimitedLicenses ? "Unlimited" : org.totalLicenses,
          usedLicenses: org.usedLicenses,
          isUnlimitedLicenses: org.isUnlimitedLicenses,
          adminCount: admins.length,
          studentCount: students.length,
          completedAssessments: students.filter(s => s.hasCompletedAssessment).length,
          primaryAdminName: primaryAdminUser ? `${primaryAdminUser.firstName || ""} ${primaryAdminUser.lastName || ""}`.trim() : "",
          primaryAdminEmail: primaryAdminUser?.email || "",
          primaryAdminUsername: primaryAdminUser?.username || "",
          createdAt: org.createdAt,
        };
      }));
      
      if (format === "json") {
        res.json(orgData);
      } else {
        const sanitize = (value: any): string => {
          if (value === null || value === undefined) return "";
          const str = String(value);
          const sanitized = str.replace(/^[=+\-@\t\r]+/, "'$&");
          if (sanitized.includes(",") || sanitized.includes('"') || sanitized.includes("\n")) {
            return `"${sanitized.replace(/"/g, '""')}"`;
          }
          return sanitized;
        };
        
        const headers = [
          "ID", "Name", "Total Licenses", "Used Licenses", "Unlimited", 
          "Admin Count", "Student Count", "Completed Assessments",
          "Primary Admin Name", "Primary Admin Email", "Primary Admin Username", "Created At"
        ];
        
        const rows = orgData.map(org => [
          sanitize(org.id),
          sanitize(org.name),
          sanitize(org.totalLicenses),
          sanitize(org.usedLicenses),
          sanitize(org.isUnlimitedLicenses),
          sanitize(org.adminCount),
          sanitize(org.studentCount),
          sanitize(org.completedAssessments),
          sanitize(org.primaryAdminName),
          sanitize(org.primaryAdminEmail),
          sanitize(org.primaryAdminUsername),
          sanitize(org.createdAt),
        ].join(","));
        
        const csv = [headers.join(","), ...rows].join("\n");
        
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="organizations-export-${Date.now()}.csv"`);
        res.send(csv);
      }
    } catch (error) {
      console.error("Error exporting organizations:", error);
      res.status(500).json({ message: "Failed to export organizations" });
    }
  });

  // Bulk license adjustment
  app.post("/api/superadmin/bulk/licenses", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { organizationIds, adjustment } = req.body;
      
      if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
        return res.status(400).json({ message: "Organization IDs array is required" });
      }
      
      if (typeof adjustment !== "number" || adjustment === 0) {
        return res.status(400).json({ message: "Adjustment must be a non-zero number" });
      }
      
      const currentUser = (req as any).currentUser;
      const results = {
        success: 0,
        failed: 0,
        errors: [] as { orgId: string; error: string }[],
      };
      
      for (const orgId of organizationIds) {
        try {
          const org = await storage.getOrganizationById(orgId);
          if (!org) {
            results.failed++;
            results.errors.push({ orgId, error: "School not found" });
            continue;
          }
          
          if (org.isUnlimitedLicenses) {
            results.failed++;
            results.errors.push({ orgId, error: "Cannot adjust licenses for unlimited organization" });
            continue;
          }
          
          const newTotal = org.totalLicenses + adjustment;
          if (newTotal < org.usedLicenses) {
            results.failed++;
            results.errors.push({ orgId, error: `Cannot reduce below used count (${org.usedLicenses})` });
            continue;
          }
          
          await storage.updateOrganization(orgId, { totalLicenses: newTotal });
          
          const eventType = adjustment > 0 ? "license_added" : "license_removed";
          await storage.createOrganizationEvent({
            organizationId: orgId,
            eventType,
            eventDescription: `Bulk adjustment: ${adjustment > 0 ? "Added" : "Removed"} ${Math.abs(adjustment)} licenses (${org.totalLicenses} → ${newTotal})`,
            performedBy: currentUser.id,
            performedByRole: "superadmin",
            previousValue: { totalLicenses: org.totalLicenses },
            newValue: { totalLicenses: newTotal },
          });
          
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ orgId, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }
      
      res.json(results);
    } catch (error) {
      console.error("Error bulk adjusting licenses:", error);
      res.status(500).json({ message: "Failed to bulk adjust licenses" });
    }
  });

  // ===============================
  // SCORING METHODOLOGY MANAGEMENT
  // ===============================
  
  // Get scoring config summary (tiers, weights, validation)
  app.get("/api/superadmin/scoring-config", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { getScoringConfigSummary } = await import("../services/scoringConfig");
      const summary = await getScoringConfigSummary(storage);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching scoring config:", error);
      res.status(500).json({ message: "Failed to fetch scoring configuration" });
    }
  });

  // Update tier component weights
  app.patch("/api/superadmin/scoring-config/tiers/:tierKey/weights", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { tierKey } = req.params;
      const { weights } = req.body;
      
      if (!weights || typeof weights !== "object") {
        return res.status(400).json({ message: "Weights object is required" });
      }
      
      // Validate weights sum to 100%
      let enabledWeightSum = 0;
      for (const [key, config] of Object.entries(weights)) {
        const cfg = config as { weight: number; isEnabled: boolean };
        if (cfg.isEnabled) {
          enabledWeightSum += cfg.weight;
        }
      }
      
      if (Math.abs(enabledWeightSum - 100) > 0.01) {
        return res.status(400).json({ 
          message: `Enabled weights must sum to 100%. Current sum: ${enabledWeightSum}%` 
        });
      }
      
      // Get tier ID
      const tier = await storage.getScoringTierByKey(tierKey);
      if (!tier) {
        return res.status(404).json({ message: "Tier not found" });
      }
      
      // Get all components for component ID lookup
      const components = await storage.getAllAssessmentComponents();
      const componentByKey = new Map(components.map(c => [c.key, c]));
      
      const currentUser = (req as any).currentUser;
      const previousWeights = await storage.getTierComponentWeights(tier.id);
      const previousWeightMap = new Map(
        previousWeights.map(w => {
          const component = components.find(c => c.id === w.componentId);
          return [component?.key || "", { weight: w.weight, isEnabled: w.isEnabled }];
        })
      );
      
      // Update each weight
      for (const [componentKey, config] of Object.entries(weights)) {
        const cfg = config as { weight: number; isEnabled: boolean };
        const component = componentByKey.get(componentKey);
        if (!component) continue;
        
        await storage.upsertTierComponentWeight({
          tierId: tier.id,
          componentId: component.id,
          weight: cfg.weight,
          isEnabled: cfg.isEnabled,
        });
      }
      
      // Log the change
      await storage.createScoringConfigChangeLog({
        changedBy: currentUser.id,
        changeType: "tier_weights_updated",
        entityType: "tier",
        entityId: tier.id,
        previousValue: Object.fromEntries(previousWeightMap),
        newValue: weights,
        changeDescription: (req.body.changeReason as string) || null,
      });
      
      // Invalidate cache
      const { invalidateScoringConfigCache } = await import("../services/scoringConfig");
      invalidateScoringConfigCache();
      
      res.json({ success: true, message: "Tier weights updated successfully" });
    } catch (error) {
      console.error("Error updating tier weights:", error);
      res.status(500).json({ message: "Failed to update tier weights" });
    }
  });

  // Toggle tier active status
  app.patch("/api/superadmin/scoring-config/tiers/:tierKey/toggle-active", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { tierKey } = req.params;
      const { isActive } = req.body;
      
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }
      
      // Get tier
      const tier = await storage.getScoringTierByKey(tierKey);
      if (!tier) {
        return res.status(404).json({ message: "Tier not found" });
      }
      
      const currentUser = (req as any).currentUser;
      
      // Update tier active status
      await storage.updateScoringTier(tier.id, { isActive });
      
      // Log the change
      await storage.createScoringConfigChangeLog({
        changedBy: currentUser.id,
        changeType: "tier_status_updated",
        entityType: "tier",
        entityId: tier.id,
        previousValue: { isActive: tier.isActive },
        newValue: { isActive },
        changeDescription: `${isActive ? 'Activated' : 'Deactivated'} ${tier.name} tier`,
      });
      
      // Invalidate cache
      const { invalidateScoringConfigCache } = await import("../services/scoringConfig");
      invalidateScoringConfigCache();
      
      res.json({ success: true, message: `Tier ${isActive ? 'activated' : 'deactivated'} successfully` });
    } catch (error) {
      console.error("Error toggling tier status:", error);
      res.status(500).json({ message: "Failed to toggle tier status" });
    }
  });

  // LLM narrative cache stats
  app.get("/api/superadmin/llm-cache/stats", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const stats = await storage.getLlmNarrativeCacheStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching LLM cache stats:", error);
      res.status(500).json({ message: "Failed to fetch LLM cache stats" });
    }
  });

  // Get all LLM prompt templates
  app.get("/api/superadmin/llm-prompts", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const prompts = await storage.getAllLlmPromptTemplates();
      res.json(prompts);
    } catch (error) {
      console.error("Error fetching LLM prompts:", error);
      res.status(500).json({ message: "Failed to fetch LLM prompts" });
    }
  });

  // Update LLM prompt template
  app.patch("/api/superadmin/llm-prompts/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { systemPrompt, userPromptTemplate, model, maxTokens, temperature, isActive } = req.body;
      
      const updates: Record<string, any> = {};
      if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
      if (userPromptTemplate !== undefined) updates.userPromptTemplate = userPromptTemplate;
      if (model !== undefined) updates.model = model;
      if (maxTokens !== undefined) updates.maxTokens = maxTokens;
      if (temperature !== undefined) updates.temperature = temperature;
      if (isActive !== undefined) updates.isActive = isActive;
      
      const updated = await storage.updateLlmPromptTemplate(id, updates);

      // Invalidate cached narratives that were generated with the old template
      // so the next request will call the LLM with the updated prompt.
      // Track the actual outcome so the client can show an accurate confirmation.
      let cacheCleared = false;
      try {
        await storage.invalidateLlmNarrativeCacheForPromptKey(updated.key);
        cacheCleared = true;
      } catch (cacheErr) {
        console.warn("[LLM Cache] Failed to invalidate on template update:", cacheErr);
      }
      
      const currentUser = (req as any).currentUser;
      await storage.createScoringConfigChangeLog({
        changedBy: currentUser.id,
        changeType: "prompt_updated",
        entityType: "llm_prompt",
        entityId: id,
        previousValue: null,
        newValue: updates,
        changeDescription: (req.body.changeReason as string) || null,
      });
      
      res.json({ ...updated, cacheCleared });
    } catch (error) {
      console.error("Error updating LLM prompt:", error);
      res.status(500).json({ message: "Failed to update LLM prompt" });
    }
  });

  // ===============================
  // API CREDENTIALS MANAGEMENT
  // ===============================
  
  // Get all API credentials (without exposing full keys)
  app.get("/api/superadmin/api-credentials", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const credentials = await storage.getAllApiCredentials();
      
      // Mask API keys for security
      const masked = credentials.map(cred => ({
        id: cred.id,
        provider: cred.provider,
        apiKeyMasked: cred.apiKey ? `${cred.apiKey.substring(0, 8)}...${cred.apiKey.substring(cred.apiKey.length - 4)}` : null,
        isActive: cred.isActive,
        lastTestedAt: cred.lastTestedAt,
        lastTestResult: cred.lastTestResult,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt,
      }));
      
      res.json(masked);
    } catch (error) {
      console.error("Error fetching API credentials:", error);
      res.status(500).json({ message: "Failed to fetch API credentials" });
    }
  });

  // Upsert API credential
  app.post("/api/superadmin/api-credentials", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { provider, apiKey, isActive } = req.body;
      
      if (!provider || !apiKey) {
        return res.status(400).json({ message: "Provider and API key are required" });
      }
      
      const credential = await storage.upsertApiCredential({
        provider,
        apiKey,
        isActive: isActive !== false,
      });
      
      const currentUser = (req as any).currentUser;
      await storage.createScoringConfigChangeLog({
        changedBy: currentUser.id,
        changeType: "api_key_updated",
        entityType: "api_credential",
        entityId: credential.id,
        previousValue: null,
        newValue: { provider, isActive: credential.isActive },
        changeDescription: null,
      });
      
      res.json({
        id: credential.id,
        provider: credential.provider,
        apiKeyMasked: `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`,
        isActive: credential.isActive,
        createdAt: credential.createdAt,
      });
    } catch (error) {
      console.error("Error saving API credential:", error);
      res.status(500).json({ message: "Failed to save API credential" });
    }
  });

  // Test API credential
  app.post("/api/superadmin/api-credentials/:provider/test", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { provider } = req.params;
      
      const credential = await storage.getApiCredential(provider);
      if (!credential) {
        return res.status(404).json({ message: "API credential not found" });
      }
      
      let testResult = "success";
      let testMessage = "API key is valid";
      
      if (provider === "anthropic") {
        try {
          const response = await fetch("https://api.anthropic.com/v1/models", {
            headers: {
              "x-api-key": credential.apiKey,
              "anthropic-version": "2023-06-01",
            },
          });

          if (!response.ok) {
            testResult = "failed";
            testMessage = `API returned status ${response.status}`;
          }
        } catch (error) {
          testResult = "failed";
          testMessage = error instanceof Error ? error.message : "Connection failed";
        }
      }
      
      await storage.updateApiCredentialTestResult(provider, testResult);
      
      res.json({
        success: testResult === "success",
        result: testResult,
        message: testMessage,
      });
    } catch (error) {
      console.error("Error testing API credential:", error);
      res.status(500).json({ message: "Failed to test API credential" });
    }
  });

  // Delete API credential
  app.delete("/api/superadmin/api-credentials/:provider", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { provider } = req.params;
      
      const deleted = await storage.deleteApiCredential(provider);
      if (!deleted) {
        return res.status(404).json({ message: "API credential not found" });
      }
      
      const currentUser = (req as any).currentUser;
      await storage.createScoringConfigChangeLog({
        changedBy: currentUser.id,
        changeType: "api_key_deleted",
        entityType: "api_credential",
        entityId: provider,
        previousValue: { provider },
        newValue: null,
        changeDescription: null,
      });
      
      res.json({ success: true, message: "API credential deleted" });
    } catch (error) {
      console.error("Error deleting API credential:", error);
      res.status(500).json({ message: "Failed to delete API credential" });
    }
  });

  // ===============================
  // SCORING CONFIG AUDIT LOG
  // ===============================
  
  app.get("/api/superadmin/scoring-config/changelog", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getScoringConfigChangeLogs(limit);
      
      const logsWithUser = await Promise.all(logs.map(async (log) => {
        const user = await storage.getUser(log.changedBy);
        return {
          ...log,
          changedByUser: user ? {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
          } : null,
        };
      }));
      
      res.json(logsWithUser);
    } catch (error) {
      console.error("Error fetching scoring config changelog:", error);
      res.status(500).json({ message: "Failed to fetch changelog" });
    }
  });

  // ===============================
  // DELETE ORGANIZATION
  // ===============================
  
  app.delete("/api/superadmin/organizations/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const org = await storage.getOrganizationById(req.params.id);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      const orgId = req.params.id;
      
      // Delete organization members first (foreign key constraint)
      const members = await storage.getOrganizationMembersByOrganizationId(orgId);
      if (members.length > 0) {
        for (const member of members) {
          await storage.deleteOrganizationMember(member.id);
        }
      }
      
      // Delete organization events (foreign key constraint - no cascade)
      await storage.deleteOrganizationEventsByOrgId(orgId);
      
      // Delete files associated with this organization (foreign key constraint - no cascade)
      await storage.deleteFilesByOrganizationId(orgId);
      
      // Now delete the organization
      const deleted = await storage.deleteOrganization(orgId);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete organization" });
      }
      
      // Log deletion (not in database since org is deleted - just console log)
      const currentUser = (req as any).currentUser;
      console.log(`[Superadmin] Organization "${org.name}" (${orgId}) deleted by user ${currentUser?.id}`);
      
      res.json({ success: true, message: "Organization deleted successfully" });
    } catch (error) {
      console.error("Error deleting organization:", error);
      res.status(500).json({ message: "Failed to delete organization" });
    }
  });

  // ===============================
  // GLOBAL PASSWORD RESET (ANY USER)
  // ===============================
  
  app.post("/api/superadmin/users/:userId/reset-password", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.username || !user.passwordHash) {
        return res.status(400).json({ message: "User does not have local credentials (may be OAuth user)" });
      }
      
      const { generatePassword } = await import("../utils/passwordGenerator");
      const { hashPassword } = await import("../utils/passwordHash");
      
      const newPassword = generatePassword("strong");
      const passwordHash = await hashPassword(newPassword);
      
      await storage.upsertUser({
        ...user,
        passwordHash,
      });
      
      res.json({ 
        success: true, 
        username: user.username,
        newPassword,
        message: "Password reset successfully" 
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ===============================
  // BULK OPERATIONS
  // ===============================
  
  const bulkUserIdsSchema = z.object({
    userIds: z.array(z.string().min(1)).min(1, "At least one user ID is required").max(100, "Maximum 100 users per batch"),
  });

  app.post("/api/superadmin/users/bulk/reset-passwords", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const validation = bulkUserIdsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0]?.message || "Invalid request body" });
      }
      const { userIds } = validation.data;
      
      const { generatePassword } = await import("../utils/passwordGenerator");
      const { hashPassword } = await import("../utils/passwordHash");
      
      const results = await Promise.all(userIds.map(async (userId: string) => {
        try {
          const user = await storage.getUser(userId);
          if (!user) {
            return { userId, username: null, newPassword: null, success: false, error: "User not found" };
          }
          
          if (!user.username || !user.passwordHash) {
            return { userId, username: user.username, newPassword: null, success: false, error: "User does not have local credentials" };
          }
          
          const newPassword = generatePassword("strong");
          const passwordHash = await hashPassword(newPassword);
          
          await storage.upsertUser({
            ...user,
            passwordHash,
          });
          
          return { userId, username: user.username, newPassword, success: true };
        } catch (error: any) {
          return { userId, username: null, newPassword: null, success: false, error: error.message || "Unknown error" };
        }
      }));
      
      res.json({ 
        success: true, 
        results,
        summary: {
          total: results.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        }
      });
    } catch (error) {
      console.error("Error bulk resetting passwords:", error);
      res.status(500).json({ message: "Failed to bulk reset passwords" });
    }
  });

  const bulkOrgIdsSchema = z.object({
    orgIds: z.array(z.string().min(1)).min(1, "At least one organization ID is required").max(50, "Maximum 50 organizations per batch"),
  });

  app.post("/api/superadmin/organizations/bulk/delete", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const validation = bulkOrgIdsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0]?.message || "Invalid request body" });
      }
      const { orgIds } = validation.data;
      
      const currentUser = (req as any).currentUser;
      
      const results = await Promise.all(orgIds.map(async (orgId: string) => {
        try {
          const org = await storage.getOrganizationById(orgId);
          if (!org) {
            return { orgId, name: null, success: false, error: "Organization not found" };
          }
          
          const deleted = await storage.deleteOrganization(orgId);
          if (!deleted) {
            return { orgId, name: org.name, success: false, error: "Failed to delete" };
          }
          
          await storage.createOrganizationEvent({
            organizationId: orgId,
            eventType: "organization_deleted",
            eventDescription: `Organization "${org.name}" was deleted (bulk operation)`,
            performedBy: currentUser.id,
            performedByRole: "superadmin",
            previousValue: { name: org.name, totalLicenses: org.totalLicenses },
            newValue: null,
          });
          
          return { orgId, name: org.name, success: true };
        } catch (error: any) {
          return { orgId, name: null, success: false, error: error.message || "Unknown error" };
        }
      }));
      
      res.json({ 
        success: true, 
        results,
        summary: {
          total: results.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        }
      });
    } catch (error) {
      console.error("Error bulk deleting organizations:", error);
      res.status(500).json({ message: "Failed to bulk delete organizations" });
    }
  });

  // ===============================
  // STUDENT RESULTS VIEWER
  // ===============================
  
  app.get("/api/superadmin/students", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const students = await storage.getAllStudentsWithAssessments();
      res.json(students.map(s => ({ ...s, user: toPublicUser(s.user) })));
    } catch (error) {
      console.error("Error fetching students:", error);
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });

  app.get("/api/superadmin/students/:userId/results", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const assessments = await storage.getAssessmentsByUser(req.params.userId);
      const completed = assessments.filter(a => a.isCompleted).sort((a, b) =>
        new Date(b.completedAt ?? b.createdAt ?? 0).getTime() - new Date(a.completedAt ?? a.createdAt ?? 0).getTime()
      );
      if (!completed.length) {
        return res.status(404).json({ message: "No completed assessments found for this student" });
      }
      return res.redirect(`/results?assessmentId=${completed[0].id}`);
    } catch (error) {
      console.error("Error fetching student results:", error);
      res.status(500).json({ message: "Failed to fetch student results" });
    }
  });

  app.get("/api/superadmin/students/:userId/assessments", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const assessments = await storage.getAssessmentsByUser(req.params.userId);
      
      const assessmentsWithDetails = await Promise.all(assessments.map(async (assessment) => {
        const recommendations = await storage.getRecommendationsByAssessment(assessment.id);
        return {
          ...assessment,
          recommendations: recommendations.slice(0, 5),
        };
      }));
      
      res.json({
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          accountType: user.accountType,
        },
        assessments: assessmentsWithDetails,
      });
    } catch (error) {
      console.error("Error fetching student assessments:", error);
      res.status(500).json({ message: "Failed to fetch student assessments" });
    }
  });

  // ===============================
  // CROSS-ORG DATA EXPORT
  // ===============================
  
  app.get("/api/superadmin/export/all-students", isAuthenticated, isSuperadminMiddleware, dataExportLimiter, async (req, res) => {
    try {
      const format = req.query.format === "json" ? "json" : "csv";
      const students = await storage.getAllStudentsWithAssessments();
      
      const exportData = students.map(s => ({
        userId: s.user.id,
        username: s.user.username,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        email: s.user.email,
        accountType: s.user.accountType,
        organizationName: s.organizationName || "Individual",
        assessmentCount: s.assessmentCount,
        latestAssessmentDate: s.latestAssessmentDate ? new Date(s.latestAssessmentDate).toISOString() : null,
        isPremium: s.user.isPremium,
        createdAt: s.user.createdAt,
      }));
      
      if (format === "json") {
        res.json(exportData);
      } else {
        const sanitize = (value: any): string => {
          if (value === null || value === undefined) return "";
          const str = String(value);
          const sanitized = str.replace(/^[=+\-@\t\r]+/, "'$&");
          if (sanitized.includes(",") || sanitized.includes('"') || sanitized.includes("\n")) {
            return `"${sanitized.replace(/"/g, '""')}"`;
          }
          return sanitized;
        };
        
        const headers = [
          "User ID", "Username", "First Name", "Last Name", "Email", 
          "Account Type", "Organization", "Assessment Count", "Latest Assessment", 
          "Is Premium", "Created At"
        ];
        
        const rows = exportData.map(s => [
          sanitize(s.userId),
          sanitize(s.username),
          sanitize(s.firstName),
          sanitize(s.lastName),
          sanitize(s.email),
          sanitize(s.accountType),
          sanitize(s.organizationName),
          sanitize(s.assessmentCount),
          sanitize(s.latestAssessmentDate),
          sanitize(s.isPremium),
          sanitize(s.createdAt),
        ].join(","));
        
        const csv = [headers.join(","), ...rows].join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=all-students-${Date.now()}.csv`);
        res.send(csv);
      }
    } catch (error) {
      console.error("Error exporting all students:", error);
      res.status(500).json({ message: "Failed to export student data" });
    }
  });

  // ===============================
  // FILE MANAGEMENT
  // ===============================
  
  app.get("/api/superadmin/files", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const files = await storage.getAllFiles();
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ message: "Failed to fetch files" });
    }
  });

  app.delete("/api/superadmin/files/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const file = await storage.getFileById(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Object first, then the row — same ordering as DELETE /api/files/:id.
      // A row with no object announces itself (the download 404s and the delete
      // can be retried); an object with no row is invisible, because nothing
      // left in the database names its key, and it holds minors' data. The
      // previous code swallowed the unlink failure and deleted the row anyway,
      // which produced exactly that invisible orphan.
      try {
        await fileStorage.remove(file.filePath);
      } catch (err) {
        console.error(
          "Failed to delete object from Spaces; keeping the database row so the delete can be retried:",
          file.filePath,
          err,
        );
        return res.status(500).json({ message: "Failed to delete file from storage" });
      }

      await storage.deleteFile(req.params.id);
      res.json({ success: true, message: "File deleted successfully" });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ message: "Failed to delete file" });
    }
  });

  // ===============================
  // USER IMPERSONATION
  // ===============================
  
  app.post("/api/superadmin/impersonate/:userId", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const currentUser = (req as any).currentUser;
      
      (req.session as any).impersonating = {
        originalUserId: currentUser.id,
        targetUserId: targetUser.id,
        startedAt: new Date().toISOString(),
      };
      
      res.json({ 
        success: true, 
        message: `Now impersonating ${targetUser.username || targetUser.email}`,
        targetUser: {
          id: targetUser.id,
          username: targetUser.username,
          email: targetUser.email,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName,
          accountType: targetUser.accountType,
        }
      });
    } catch (error) {
      console.error("Error starting impersonation:", error);
      res.status(500).json({ message: "Failed to start impersonation" });
    }
  });

  app.post("/api/superadmin/stop-impersonation", isAuthenticated, async (req, res) => {
    try {
      if (!(req.session as any).impersonating) {
        return res.status(400).json({ message: "Not currently impersonating anyone" });
      }
      
      delete (req.session as any).impersonating;
      res.json({ success: true, message: "Stopped impersonation" });
    } catch (error) {
      console.error("Error stopping impersonation:", error);
      res.status(500).json({ message: "Failed to stop impersonation" });
    }
  });

  // ===============================
  // SYSTEM ANNOUNCEMENTS
  // ===============================
  
  app.get("/api/superadmin/announcements", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const announcements = await storage.getAllSystemAnnouncements();
      res.json(announcements);
    } catch (error) {
      console.error("Error fetching announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  app.post("/api/superadmin/announcements", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { title, content, titleAr, contentAr, type, targetAudience, isPinned, expiresAt } = req.body;
      
      if (!title || !content) {
        return res.status(400).json({ message: "Title and content are required" });
      }
      
      const currentUser = (req as any).currentUser;
      
      const announcement = await storage.createSystemAnnouncement({
        title,
        content,
        titleAr: titleAr || null,
        contentAr: contentAr || null,
        type: type || "info",
        targetAudience: targetAudience || "all",
        isPinned: isPinned || false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdByUserId: currentUser.id,
        isActive: true,
      });
      
      res.status(201).json(announcement);
    } catch (error) {
      console.error("Error creating announcement:", error);
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  app.patch("/api/superadmin/announcements/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const existing = await storage.getSystemAnnouncement(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Announcement not found" });
      }
      
      const { title, content, titleAr, contentAr, type, targetAudience, isPinned, isActive, expiresAt, publishAt, backgroundColor } = req.body;
      
      const updates: Record<string, any> = {};
      if (title !== undefined) updates.title = title;
      if (content !== undefined) updates.content = content;
      if (titleAr !== undefined) updates.titleAr = titleAr || null;
      if (contentAr !== undefined) updates.contentAr = contentAr || null;
      if (type !== undefined) updates.type = type;
      if (targetAudience !== undefined) updates.targetAudience = targetAudience;
      if (isPinned !== undefined) updates.isPinned = isPinned;
      if (isActive !== undefined) updates.isActive = isActive;
      if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (publishAt !== undefined) updates.publishAt = publishAt ? new Date(publishAt) : null;
      if (backgroundColor !== undefined) updates.backgroundColor = backgroundColor || "#ffffff";
      
      const updated = await storage.updateSystemAnnouncement(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating announcement:", error);
      res.status(500).json({ message: "Failed to update announcement" });
    }
  });

  app.delete("/api/superadmin/announcements/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const deleted = await storage.deleteSystemAnnouncement(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Announcement not found" });
      }
      res.json({ success: true, message: "Announcement deleted" });
    } catch (error) {
      console.error("Error deleting announcement:", error);
      res.status(500).json({ message: "Failed to delete announcement" });
    }
  });

  // Public endpoint for users to get active announcements
  app.get("/api/announcements", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      let targetAudience = "all";
      if (user?.accountType === "org_admin") targetAudience = "org_admins";
      else if (user?.accountType === "org_student") targetAudience = "students";
      else if (user?.isPremium) targetAudience = "premium";
      
      const announcements = await storage.getActiveSystemAnnouncements(targetAudience);
      res.json(announcements);
    } catch (error) {
      console.error("Error fetching active announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  // ===============================
  // CAREER MANAGEMENT
  // ===============================
  
  app.get("/api/superadmin/careers", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const careers = await storage.getAllCareers();
      res.json(careers);
    } catch (error) {
      console.error("Error fetching careers:", error);
      res.status(500).json({ message: "Failed to fetch careers" });
    }
  });

  app.post("/api/superadmin/careers", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { title, description, titleAr, descriptionAr, requiredSkills, requiredSkillsAr, relatedSubjects, category, educationLevel, educationLevelAr, averageSalary, growthOutlook, icon, valuesProfile, onetCode, countryId } = req.body;
      
      if (!title || !description || !requiredSkills || !relatedSubjects || !category || !educationLevel || !growthOutlook) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const career = await storage.createCareer({
        title,
        description,
        titleAr: titleAr || null,
        descriptionAr: descriptionAr || null,
        requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [requiredSkills],
        requiredSkillsAr: requiredSkillsAr ? (Array.isArray(requiredSkillsAr) ? requiredSkillsAr : [requiredSkillsAr]) : null,
        relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [relatedSubjects],
        category,
        educationLevel,
        educationLevelAr: educationLevelAr || null,
        averageSalary: averageSalary || null,
        growthOutlook,
        icon: icon || null,
        valuesProfile: valuesProfile || null,
        onetCode: onetCode || null,
        countryId: countryId || null,
      });
      
      res.status(201).json(career);
    } catch (error) {
      console.error("Error creating career:", error);
      res.status(500).json({ message: "Failed to create career" });
    }
  });

  app.patch("/api/superadmin/careers/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const existing = await storage.getCareerById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Career not found" });
      }
      
      const { title, description, titleAr, descriptionAr, requiredSkills, requiredSkillsAr, relatedSubjects, category, educationLevel, educationLevelAr, averageSalary, growthOutlook, icon, valuesProfile, onetCode, countryId } = req.body;
      
      const updates: Record<string, any> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (titleAr !== undefined) updates.titleAr = titleAr || null;
      if (descriptionAr !== undefined) updates.descriptionAr = descriptionAr || null;
      if (requiredSkills !== undefined) updates.requiredSkills = Array.isArray(requiredSkills) ? requiredSkills : [requiredSkills];
      if (requiredSkillsAr !== undefined) updates.requiredSkillsAr = requiredSkillsAr ? (Array.isArray(requiredSkillsAr) ? requiredSkillsAr : [requiredSkillsAr]) : null;
      if (relatedSubjects !== undefined) updates.relatedSubjects = Array.isArray(relatedSubjects) ? relatedSubjects : [relatedSubjects];
      if (category !== undefined) updates.category = category;
      if (educationLevel !== undefined) updates.educationLevel = educationLevel;
      if (educationLevelAr !== undefined) updates.educationLevelAr = educationLevelAr || null;
      if (averageSalary !== undefined) updates.averageSalary = averageSalary;
      if (growthOutlook !== undefined) updates.growthOutlook = growthOutlook;
      if (icon !== undefined) updates.icon = icon;
      if (valuesProfile !== undefined) updates.valuesProfile = valuesProfile;
      if (onetCode !== undefined) updates.onetCode = onetCode;
      if (countryId !== undefined) updates.countryId = countryId || null;
      
      const updated = await storage.updateCareer(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating career:", error);
      res.status(500).json({ message: "Failed to update career" });
    }
  });

  app.delete("/api/superadmin/careers/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const deleted = await storage.deleteCareer(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Career not found" });
      }
      res.json({ success: true, message: "Career deleted" });
    } catch (error) {
      console.error("Error deleting career:", error);
      res.status(500).json({ message: "Failed to delete career" });
    }
  });

  app.post("/api/superadmin/careers/apply-arabic-translations", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { applyCareerArabicContent } = await import("../migrations/career-arabic-content");
      await applyCareerArabicContent();
      const allCareers = await storage.getAllCareers();
      const missing = allCareers.filter(c => !c.titleAr || !c.descriptionAr || !c.requiredSkillsAr?.length);
      res.json({ success: true, message: "Arabic translations applied to all 36 seeded careers", missingCount: missing.length, missingTitles: missing.map(c => c.title) });
    } catch (error) {
      console.error("Error applying Arabic translations:", error);
      res.status(500).json({ message: "Failed to apply Arabic translations" });
    }
  });

  // ===============================
  // GLOBAL USER SEARCH
  // ===============================
  
  app.get("/api/superadmin/users/search", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      // req.query.q may be parsed as a string, an array, or an object by Express.
      // Coerce to a real string (take the first element if it's an array) so that
      // .length and downstream search operate on a genuine string.
      const rawQuery = req.query.q;
      const query = typeof rawQuery === 'string'
        ? rawQuery
        : Array.isArray(rawQuery) && typeof rawQuery[0] === 'string'
          ? rawQuery[0]
          : '';
      if (!query || query.length < 2) {
        return res.status(400).json({ message: "Search query must be at least 2 characters" });
      }
      
      const users = await storage.searchAllUsers(query);
      
      const usersWithOrg = await Promise.all(users.map(async (user) => {
        const membership = await storage.getOrganizationMemberByUserId(user.id);
        let organizationName = null;
        if (membership) {
          const org = await storage.getOrganizationById(membership.organizationId);
          organizationName = org?.name || null;
        }
        return {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          accountType: user.accountType,
          isPremium: user.isPremium,
          organizationName,
          createdAt: user.createdAt,
        };
      }));
      
      res.json(usersWithOrg);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // ===============================
  // SUBJECT MANAGEMENT (Curriculum-scoped)
  // ===============================

  // Get quiz question counts grouped by subject (must come before /:id route)
  app.get("/api/superadmin/subjects/question-counts", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { countryId, curriculum } = req.query;
      const counts = await storage.getQuizQuestionCountsBySubject(
        countryId as string | undefined,
        curriculum as string | undefined,
      );
      res.json(counts);
    } catch (error) {
      console.error("Error fetching question counts:", error);
      res.status(500).json({ message: "Failed to fetch question counts" });
    }
  });

  // Get all subjects (with optional filters)
  app.get("/api/superadmin/subjects", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { countryId, curriculum } = req.query;
      
      let subjects;
      if (countryId && curriculum) {
        subjects = await storage.getSubjectsByCurriculum(countryId as string, curriculum as string);
      } else if (countryId) {
        subjects = await storage.getSubjectsByCountry(countryId as string);
      } else {
        subjects = await storage.getAllSubjects();
      }
      
      res.json(subjects);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ message: "Failed to fetch subjects" });
    }
  });

  // Get a single subject by ID
  app.get("/api/superadmin/subjects/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const subject = await storage.getSubjectById(req.params.id);
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }
      res.json(subject);
    } catch (error) {
      console.error("Error fetching subject:", error);
      res.status(500).json({ message: "Failed to fetch subject" });
    }
  });

  // Create a new subject
  app.post("/api/superadmin/subjects", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { name, code, countryId, curriculum, description, aliases, displayOrder, icon, isActive } = req.body;
      
      // Validate required fields
      if (!name || !code || !countryId || !curriculum) {
        return res.status(400).json({ message: "Name, code, countryId, and curriculum are required" });
      }
      
      // Check if country exists
      const country = await storage.getCountryById(countryId);
      if (!country) {
        return res.status(400).json({ message: "Country not found" });
      }
      
      // Check if curriculum is valid for this country
      if (country.curricula && !country.curricula.includes(curriculum)) {
        return res.status(400).json({ message: `Curriculum '${curriculum}' is not available for this country` });
      }
      
      // Check if subject with same code already exists for this curriculum
      const existing = await storage.getSubjectByCode(countryId, curriculum, code);
      if (existing) {
        return res.status(400).json({ message: `Subject with code '${code}' already exists for this curriculum` });
      }
      
      const subject = await storage.createSubject({
        name,
        code: code.toLowerCase().replace(/\s+/g, '_'),
        countryId,
        curriculum,
        description: description || null,
        aliases: aliases || [],
        displayOrder: displayOrder ?? 0,
        icon: icon || null,
        isActive: isActive ?? true,
      });
      
      // Clear subject alias cache so new subject and aliases are immediately available
      clearSubjectCache();
      
      res.status(201).json(subject);
    } catch (error) {
      console.error("Error creating subject:", error);
      res.status(500).json({ message: "Failed to create subject" });
    }
  });

  // Update a subject
  app.patch("/api/superadmin/subjects/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const subject = await storage.getSubjectById(req.params.id);
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }
      
      const { name, code, description, aliases, displayOrder, icon, isActive, countryId, curriculum } = req.body;
      
      // Determine the effective country and curriculum for uniqueness check
      const effectiveCountryId = countryId || subject.countryId;
      const effectiveCurriculum = curriculum || subject.curriculum;
      const effectiveCode = code ? code.toLowerCase().replace(/\s+/g, '_') : subject.code;
      
      // Check for duplicates if country, curriculum, or code is changing
      const isChangingScope = (countryId && countryId !== subject.countryId) || 
                              (curriculum && curriculum !== subject.curriculum) ||
                              (code && effectiveCode !== subject.code);
      
      if (isChangingScope) {
        const existing = await storage.getSubjectByCode(effectiveCountryId, effectiveCurriculum, effectiveCode);
        if (existing && existing.id !== subject.id) {
          return res.status(409).json({ 
            message: `Subject with code '${effectiveCode}' already exists for ${effectiveCurriculum} curriculum` 
          });
        }
      }
      
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (code !== undefined) updates.code = effectiveCode;
      if (description !== undefined) updates.description = description;
      if (aliases !== undefined) updates.aliases = aliases;
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      if (icon !== undefined) updates.icon = icon;
      if (isActive !== undefined) updates.isActive = isActive;
      if (countryId !== undefined) updates.countryId = countryId;
      if (curriculum !== undefined) updates.curriculum = curriculum;
      
      const updated = await storage.updateSubject(req.params.id, updates);
      
      // Clear subject alias cache so updated aliases are immediately available
      clearSubjectCache();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating subject:", error);
      res.status(500).json({ message: "Failed to update subject" });
    }
  });

  // Delete a subject
  app.delete("/api/superadmin/subjects/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const subject = await storage.getSubjectById(req.params.id);
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }
      
      // TODO: Check if there are any quiz questions using this subject before deleting
      // For now, we allow deletion but log a warning
      console.log(`Deleting subject: ${subject.name} (${subject.code}) for ${subject.curriculum}`);
      
      const deleted = await storage.deleteSubject(req.params.id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete subject" });
      }
      
      // Clear subject alias cache so deleted subject is no longer available
      clearSubjectCache();
      
      res.json({ success: true, message: "Subject deleted" });
    } catch (error) {
      console.error("Error deleting subject:", error);
      res.status(500).json({ message: "Failed to delete subject" });
    }
  });

  // Clone subjects from one curriculum to another
  app.post("/api/superadmin/subjects/clone", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { sourceCountryId, sourceCurriculum, targetCountryId, targetCurriculum } = req.body;
      
      if (!sourceCountryId || !sourceCurriculum || !targetCountryId || !targetCurriculum) {
        return res.status(400).json({ message: "Source and target country/curriculum are required" });
      }
      
      // Get source subjects
      const sourceSubjects = await storage.getSubjectsByCurriculum(sourceCountryId, sourceCurriculum);
      if (sourceSubjects.length === 0) {
        return res.status(400).json({ message: "No subjects found in source curriculum" });
      }
      
      // Check target country exists
      const targetCountry = await storage.getCountryById(targetCountryId);
      if (!targetCountry) {
        return res.status(400).json({ message: "Target country not found" });
      }
      
      // Clone each subject
      const clonedSubjects = [];
      for (const source of sourceSubjects) {
        // Check if already exists in target
        const existing = await storage.getSubjectByCode(targetCountryId, targetCurriculum, source.code);
        if (existing) {
          continue; // Skip if already exists
        }
        
        const cloned = await storage.createSubject({
          name: source.name,
          code: source.code,
          countryId: targetCountryId,
          curriculum: targetCurriculum,
          description: source.description,
          aliases: source.aliases || [],
          displayOrder: source.displayOrder,
          icon: source.icon,
          isActive: true,
        });
        clonedSubjects.push(cloned);
      }
      
      // Clear subject alias cache so cloned subjects are immediately available
      if (clonedSubjects.length > 0) {
        clearSubjectCache();
      }
      
      res.json({ 
        success: true, 
        cloned: clonedSubjects.length, 
        skipped: sourceSubjects.length - clonedSubjects.length,
        subjects: clonedSubjects 
      });
    } catch (error) {
      console.error("Error cloning subjects:", error);
      res.status(500).json({ message: "Failed to clone subjects" });
    }
  });

  // ===============================
  // CURRICULUM RENAME
  // ===============================

  // Rename a curriculum - updates country, subjects, and quiz questions
  app.post("/api/superadmin/countries/:countryId/curricula/rename", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { countryId } = req.params;
      const { oldName, newName } = req.body;
      
      if (!oldName || !newName) {
        return res.status(400).json({ message: "Both oldName and newName are required" });
      }
      
      if (oldName === newName) {
        return res.status(400).json({ message: "New name must be different from old name" });
      }
      
      // Get the country
      const country = await storage.getCountryById(countryId);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }
      
      // Check if old curriculum exists in country
      if (!country.curricula?.includes(oldName)) {
        return res.status(400).json({ message: `Curriculum '${oldName}' not found in this country` });
      }
      
      // Check if new name already exists
      if (country.curricula?.includes(newName)) {
        return res.status(409).json({ message: `Curriculum '${newName}' already exists in this country` });
      }
      
      // Update country's curricula array
      const newCurricula = country.curricula.map(c => c === oldName ? newName : c);
      await storage.updateCountry(countryId, { curricula: newCurricula });
      
      // Update all subjects with this curriculum
      const subjectsUpdated = await storage.renameCurriculumInSubjects(countryId, oldName, newName);
      
      // Update all quiz questions with this curriculum
      const questionsUpdated = await storage.renameCurriculumInQuizQuestions(countryId, oldName, newName);
      
      // Clear subject cache
      clearSubjectCache();
      
      res.json({
        success: true,
        message: `Curriculum renamed from '${oldName}' to '${newName}'`,
        updated: {
          subjects: subjectsUpdated,
          questions: questionsUpdated
        }
      });
    } catch (error) {
      console.error("Error renaming curriculum:", error);
      res.status(500).json({ message: "Failed to rename curriculum" });
    }
  });

  app.post("/api/superadmin/students", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { firstName, lastName, email } = req.body;
      if (!firstName || !lastName || !email) {
        return res.status(400).json({ message: "First name, last name, and email are required" });
      }

      const existingByEmail = await storage.getUserByEmail(email);
      if (existingByEmail) {
        return res.status(409).json({ message: "A user with this email already exists" });
      }

      const { user, username, password } = await storage.createStandaloneUser({
        firstName,
        lastName,
        email,
        passwordComplexity: "strong",
      });

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        credentials: { username, password },
      });
    } catch (error) {
      console.error("Error creating student:", error);
      res.status(500).json({ message: "Failed to create student" });
    }
  });

  // Translation Manager endpoints
  const SUPPORTED_NAMESPACES = ["common", "landing", "assessment", "results", "auth", "admin", "riasec", "profile", "legal", "pricing"];
  const SUPPORTED_LANGS = ["en", "ar"];

  const readLocaleFile = async (lang: string, ns: string): Promise<Record<string, any>> => {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    try {
      const filePath = join(process.cwd(), "client", "public", "locales", lang, `${ns}.json`);
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return {};
    }
  };

  const writeLocaleFile = async (lang: string, ns: string, data: Record<string, any>): Promise<void> => {
    const { writeFile, rename } = await import("fs/promises");
    const { join } = await import("path");
    const filePath = join(process.cwd(), "client", "public", "locales", lang, `${ns}.json`);
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmpPath, filePath);
  };

  const flattenObject = (obj: Record<string, any>, prefix = ""): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, fullKey));
      } else {
        result[fullKey] = String(value ?? "");
      }
    }
    return result;
  };

  const FORBIDDEN_KEY_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

  const setNestedKey = (obj: Record<string, any>, key: string, value: string): Record<string, any> => {
    const parts = key.split(".");
    if (parts.some(part => FORBIDDEN_KEY_SEGMENTS.has(part))) {
      throw new Error("Invalid translation key");
    }
    const result = { ...obj };
    let current: Record<string, any> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {};
      } else {
        current[parts[i]] = { ...current[parts[i]] };
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    return result;
  };

  // GET /api/superadmin/translations/coverage — returns per-namespace coverage stats
  app.get("/api/superadmin/translations/coverage", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const coverage = await Promise.all(
        SUPPORTED_NAMESPACES.map(async (ns) => {
          const enData = await readLocaleFile("en", ns);
          const arData = await readLocaleFile("ar", ns);
          const enFlat = flattenObject(enData);
          const arFlat = flattenObject(arData);
          const totalKeys = Object.keys(enFlat).length;
          const translatedKeys = Object.keys(enFlat).filter(k => arFlat[k] && arFlat[k].trim() !== "").length;
          return {
            namespace: ns,
            totalKeys,
            translatedKeys,
            coveragePercent: totalKeys > 0 ? Math.round((translatedKeys / totalKeys) * 100) : 0,
          };
        })
      );
      const totalKeys = coverage.reduce((sum, c) => sum + c.totalKeys, 0);
      const translatedKeys = coverage.reduce((sum, c) => sum + c.translatedKeys, 0);
      const overallCoverage = totalKeys > 0 ? Math.round((translatedKeys / totalKeys) * 100) : 0;
      res.json({ namespaces: coverage, overallCoverage });
    } catch (error) {
      console.error("Error fetching translation coverage:", error);
      res.status(500).json({ message: "Failed to fetch translation coverage" });
    }
  });

  // GET /api/superadmin/translations/:namespace — returns flat en/ar key-value pairs
  app.get("/api/superadmin/translations/:namespace", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { namespace } = req.params;
      if (!SUPPORTED_NAMESPACES.includes(namespace)) {
        return res.status(400).json({ message: "Invalid namespace" });
      }
      const enData = await readLocaleFile("en", namespace);
      const arData = await readLocaleFile("ar", namespace);
      const enFlat = flattenObject(enData);
      const arFlat = flattenObject(arData);
      const keys = Object.keys(enFlat);
      const translations = keys.map(key => ({
        key,
        en: enFlat[key] || "",
        ar: arFlat[key] || "",
        isMissing: !arFlat[key] || arFlat[key].trim() === "",
      }));
      res.json({ namespace, translations });
    } catch (error) {
      console.error("Error fetching translations:", error);
      res.status(500).json({ message: "Failed to fetch translations" });
    }
  });

  // PATCH /api/superadmin/cvq-items/:id — update Arabic text of a CVQ item
  app.patch("/api/superadmin/cvq-items/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      if (!id || typeof id !== "string") {
        return res.status(400).json({ message: "Invalid CVQ item ID" });
      }
      const { textAr } = req.body;
      if (typeof textAr !== "string") {
        return res.status(400).json({ message: "textAr is required" });
      }
      const { db } = await import("../db");
      const { cvqItems } = await import("../../shared/schema");
      const { eq } = await import("drizzle-orm");
      const updated = await db
        .update(cvqItems)
        .set({ textAr })
        .where(eq(cvqItems.id, id))
        .returning();
      if (!updated.length) {
        return res.status(404).json({ message: "CVQ item not found" });
      }
      res.json(updated[0]);
    } catch (error) {
      console.error("Error updating CVQ item:", error);
      res.status(500).json({ message: "Failed to update CVQ item" });
    }
  });

  // GET /api/superadmin/quiz-questions — list quiz questions for translation
  app.get("/api/superadmin/quiz-questions", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { db } = await import("../db");
      const { quizQuestions } = await import("../../shared/schema");
      const { isNull, or, eq } = await import("drizzle-orm");
      const { sql } = await import("drizzle-orm");
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const missingOnly = req.query.missingOnly === "true";

      const baseQuery = db.select({
        id: quizQuestions.id,
        question: quizQuestions.question,
        questionAr: quizQuestions.questionAr,
        subject: quizQuestions.subject,
        grade: quizQuestions.grade,
      }).from(quizQuestions);

      const rows = missingOnly
        ? await baseQuery.where(or(isNull(quizQuestions.questionAr), eq(quizQuestions.questionAr, ""))).limit(limit).offset(offset)
        : await baseQuery.limit(limit).offset(offset);

      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(quizQuestions);
      const [{ missingCount }] = await db
        .select({ missingCount: sql<number>`count(*)` })
        .from(quizQuestions)
        .where(or(isNull(quizQuestions.questionAr), eq(quizQuestions.questionAr, "")));

      res.json({ questions: rows, total: Number(count), missing: Number(missingCount) });
    } catch (error) {
      console.error("Error fetching quiz questions:", error);
      res.status(500).json({ message: "Failed to fetch quiz questions" });
    }
  });

  // PATCH /api/superadmin/countries/:id/name-ar — update Arabic name of a country
  app.patch("/api/superadmin/countries/:id/name-ar", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { nameAr } = req.body;
      if (typeof nameAr !== "string") {
        return res.status(400).json({ message: "nameAr is required" });
      }
      const { db } = await import("../db");
      const { countries } = await import("../../shared/schema");
      const { eq } = await import("drizzle-orm");
      const updated = await db
        .update(countries)
        .set({ nameAr })
        .where(eq(countries.id, id))
        .returning();
      if (!updated.length) {
        return res.status(404).json({ message: "Country not found" });
      }
      res.json(updated[0]);
    } catch (error) {
      console.error("Error updating country nameAr:", error);
      res.status(500).json({ message: "Failed to update country Arabic name" });
    }
  });

  // PATCH /api/superadmin/quiz-questions/:id — update Arabic translation of a quiz question
  app.patch("/api/superadmin/quiz-questions/:id", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { questionAr } = req.body;
      if (typeof questionAr !== "string") {
        return res.status(400).json({ message: "questionAr is required" });
      }
      const { db } = await import("../db");
      const { quizQuestions } = await import("../../shared/schema");
      const { eq } = await import("drizzle-orm");
      const updated = await db
        .update(quizQuestions)
        .set({ questionAr })
        .where(eq(quizQuestions.id, id))
        .returning();
      if (!updated.length) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json(updated[0]);
    } catch (error) {
      console.error("Error updating quiz question:", error);
      res.status(500).json({ message: "Failed to update quiz question" });
    }
  });

  // PATCH /api/superadmin/translations/:namespace — update a single translation key
  app.patch("/api/superadmin/translations/:namespace", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { namespace } = req.params;
      if (!SUPPORTED_NAMESPACES.includes(namespace)) {
        return res.status(400).json({ message: "Invalid namespace" });
      }
      const { lang, key, value } = req.body;
      if (!lang || !key || typeof value !== "string") {
        return res.status(400).json({ message: "lang, key, and value are required" });
      }
      if (!SUPPORTED_LANGS.includes(lang)) {
        return res.status(400).json({ message: "Invalid language" });
      }
      if (key.split(".").some((part: string) => FORBIDDEN_KEY_SEGMENTS.has(part))) {
        return res.status(400).json({ message: "Invalid translation key" });
      }
      const existing = await readLocaleFile(lang, namespace);
      const updated = setNestedKey(existing, key, value);
      await writeLocaleFile(lang, namespace, updated);
      res.json({ success: true, namespace, lang, key, value });
    } catch (error) {
      console.error("Error updating translation:", error);
      res.status(500).json({ message: "Failed to update translation" });
    }
  });

  // ===============================
  // PAYMENT RECONCILIATION (READ-ONLY)
  // ===============================

  /**
   * GET /api/superadmin/payments/unreconciled?days=90
   *
   * Visibility for succeeded-but-ungranted payments. Answers the question
   * nobody can answer today: how much money has been taken without the buyer
   * receiving what they paid for, and which of those cases are recoverable.
   *
   * STRICTLY READ-ONLY BY DESIGN. It calls paymentIntents.list and two storage
   * getters - nothing else. No grant, no paymentIntents.update, no DB write.
   * Deciding what to do with the results is a separate, opt-in pass; shipping
   * the report first means the auto-grant policy is chosen from real data
   * rather than guesswork.
   */
  app.get("/api/superadmin/payments/unreconciled", isAuthenticated, isSuperadminMiddleware, dataExportLimiter, async (req, res) => {
    if (!stripe) {
      return res.status(503).json({
        message: "Payment system not configured. STRIPE_SECRET_KEY must be set to run reconciliation."
      });
    }

    const DEFAULT_DAYS = 90;
    const MAX_DAYS = 365;
    const PAGE_SIZE = 100;
    // Backstop against an unbounded walk: 50 pages = 5,000 intents. If it trips,
    // `truncated` says so in the response - a silent cap would read as "nothing
    // else to find".
    const MAX_PAGES = 50;

    try {
      const requestedDays = parseInt(String(req.query.days ?? ""), 10);
      const days = Number.isInteger(requestedDays) && requestedDays > 0
        ? Math.min(requestedDays, MAX_DAYS)
        : DEFAULT_DAYS;
      const createdGte = Math.floor(Date.now() / 1000) - days * 86400;

      const rows: ReconciliationRow[] = [];
      const errors: { paymentIntentId: string; error: string }[] = [];
      const tally: Record<ReconciliationClass, { count: number; amount: number }> = {
        amount_mismatch: { count: 0, amount: 0 },
        unidentifiable: { count: 0, amount: 0 },
        group_incomplete: { count: 0, amount: 0 },
        already_granted: { count: 0, amount: 0 },
        oauth_blocked: { count: 0, amount: 0 },
        grantable_user: { count: 0, amount: 0 },
        grantable_guest: { count: 0, amount: 0 },
      };

      let totalSucceeded = 0;
      // Sum in integer cents and divide once at the end - never accumulate money
      // in floats.
      let unreconciledCents = 0;
      const tallyCents: Record<ReconciliationClass, number> = {
        amount_mismatch: 0, unidentifiable: 0, group_incomplete: 0,
        already_granted: 0, oauth_blocked: 0, grantable_user: 0, grantable_guest: 0,
      };

      let startingAfter: string | undefined;
      let hasMore = true;
      let pagesFetched = 0;

      // Deliberately list + filter in-process rather than paymentIntents.search:
      // the search index lags writes by up to ~a minute, so a checkout that just
      // completed would surface as unreconciled. list() reads live state.
      while (hasMore && pagesFetched < MAX_PAGES) {
        const page = await stripe.paymentIntents.list({
          created: { gte: createdGte },
          limit: PAGE_SIZE,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        pagesFetched++;

        for (const pi of page.data) {
          if (pi.status !== "succeeded") continue;
          totalSucceeded++;

          // Discovery filter. Sound (no false negatives), noisy (false positives
          // are separated by classification below).
          if (pi.metadata?.processed === "true") continue;

          try {
            const row = await classifyUnreconciledIntent(pi);
            rows.push(row);
            tally[row.class].count++;
            tallyCents[row.class] += pi.amount;
            unreconciledCents += pi.amount;
          } catch (error) {
            // One bad intent must never abort the batch - same contract as the
            // bulk maintenance routes above.
            errors.push({
              paymentIntentId: pi.id,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        hasMore = page.has_more;
        if (hasMore) {
          startingAfter = page.data[page.data.length - 1]?.id;
          if (!startingAfter) hasMore = false;
        }
      }

      for (const key of Object.keys(tally) as ReconciliationClass[]) {
        tally[key].amount = tallyCents[key] / 100;
      }

      res.json({
        windowDays: days,
        since: new Date(createdGte * 1000).toISOString(),
        totalSucceeded,
        totalUnreconciled: rows.length,
        totalAmountUnreconciled: unreconciledCents / 100,
        tally,
        rows,
        errors,
        // True when the page budget ran out with more intents still available -
        // widen the window or raise MAX_PAGES to see the rest.
        truncated: hasMore,
        pagesFetched,
      });
    } catch (error) {
      console.error("Error running payment reconciliation sweep:", error);
      res.status(500).json({ message: "Failed to run reconciliation sweep" });
    }
  });
}
