import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { z } from "zod";

const getSuperadminEmails = (): string[] => {
  return (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim())
    .filter(e => e.length > 0);
};

const isSuperadminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any).isLocal ? (req.user as any).userId : (req.user as any).claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const superadminEmails = getSuperadminEmails();
    const isSuperadmin = 
      (!(req.user as any).isLocal && user.email && superadminEmails.includes(user.email)) ||
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
  
  app.post("/api/superadmin/organizations/create-with-admin", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
    try {
      const { 
        organizationName, 
        totalLicenses, 
        isUnlimitedLicenses,
        countryId,
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
  
  app.get("/api/superadmin/export/organizations", isAuthenticated, isSuperadminMiddleware, async (req, res) => {
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
}
