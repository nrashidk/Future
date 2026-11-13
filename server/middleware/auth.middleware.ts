import { storage } from "../storage";
import { logger } from "../utils/logger";

/**
 * Get superadmin emails from environment variable (normalized to lowercase)
 */
export const getSuperadminEmails = (): string[] => {
  return (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);
};

/**
 * SUPERADMIN ONLY. Nationwide access, every organization.
 *
 * NAMED FOR WHAT IT DOES, which it previously was not: this was called
 * `isAdmin`, and the name was the whole problem. It reads as "any kind of
 * admin" and it is not -- a school's own org_admin is refused by it. The
 * behaviour was correct and is unchanged; only the name moved.
 *
 * Why that mattered enough to rename 13 call sites: every route guarded by
 * this one does NO organization scoping, and does not need any, because the
 * caller can legitimately see every organization. A reader who believed the
 * old name would conclude the opposite -- that an org_admin reaches these
 * handlers -- and the natural next step from that belief is to add
 * org-scoped logic around a `req.user` that is actually a superadmin, or to
 * widen the guard to admit org_admins without adding the scoping those
 * handlers have never had.
 *
 * The inconsistency that makes this live rather than theoretical:
 * GET /api/admin/organizations/:id is superadmin-only via this middleware,
 * while DELETE /api/admin/organizations/:id/members/:memberId under the same
 * path prefix admits org_admins and does its own explicit ownership check.
 * Two neighbouring routes, two different audiences. Anyone reconciling them
 * needs the guard's name to tell the truth.
 *
 * Superadmin status is recomputed from the database on every request -- by
 * email against SUPERADMIN_EMAILS, or by role -- and never read from the
 * session, so any endpoint that can write a user's email is a privilege
 * escalation surface.
 *
 * For a school admin scoped to their own organization, use isOrgAdmin below.
 * Requires isAuthenticated to run first.
 */
export const isSuperadminOnly = async (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  try {
    const userId = req.user.userId;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    // Check if user is superadmin by email or role
    const superadminEmails = getSuperadminEmails();
    const isSuperadmin = 
      (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
      user.role === "superadmin";
    
    if (!isSuperadmin) {
      logger.security("Access control failure: admin access required", {
        userId: req.user?.userId,
        action: "isSuperadminOnly",
        resource: req.path,
        ip: req.ip,
      });
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    
    next();
  } catch (error) {
    console.error("Admin authorization check failed:", error);
    res.status(500).json({ message: "Authorization check failed" });
  }
};

/**
 * Middleware to check if the authenticated user is an organization admin
 * Requires isAuthenticated middleware to run first
 */
export const isOrgAdmin = async (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  try {
    const userId = req.user.userId;
    const user = await storage.getUser(userId);
    
    if (!user || user.accountType !== "org_admin") {
      logger.security("Access control failure: org admin access required", {
        userId: req.user?.userId,
        action: "isOrgAdmin",
        resource: req.path,
        ip: req.ip,
      });
      return res.status(403).json({ message: "Forbidden: School admin access required" });
    }
    
    next();
  } catch (error) {
    console.error("Organization admin authorization check failed:", error);
    res.status(500).json({ message: "Authorization check failed" });
  }
};
