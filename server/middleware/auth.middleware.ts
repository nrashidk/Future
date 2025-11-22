import { storage } from "../storage";

/**
 * Middleware to check if the authenticated user is a superadmin
 * Requires isAuthenticated middleware to run first
 */
export const isAdmin = async (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  if (req.user.isLocal) {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  
  try {
    const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user || user.role !== "superadmin") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    
    next();
  } catch (error) {
    console.error("Admin authorization check failed:", error);
    res.status(500).json({ message: "Authorization check failed" });
  }
};
