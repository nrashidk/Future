import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Organization students should be treated as premium users since they have school access
      if (user && user.accountType === 'org_student') {
        user.isPremium = true;
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
