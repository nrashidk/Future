import { storage } from "../storage";

/**
 * Get superadmin emails from environment variable (normalized to lowercase)
 */
const getSuperadminEmails = (): string[] => {
  return (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);
};

/**
 * Middleware to check if the authenticated user is a superadmin
 * Requires isAuthenticated middleware to run first
 */
export const isAdmin = async (req: any, res: any, next: any) => {
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
      return res.status(403).json({ message: "Forbidden: Organization admin access required" });
    }
    
    next();
  } catch (error) {
    console.error("Organization admin authorization check failed:", error);
    res.status(500).json({ message: "Authorization check failed" });
  }
};
