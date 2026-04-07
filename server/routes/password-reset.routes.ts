import type { Express } from "express";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { db } from "../db";
import { users, passwordResetTokens } from "@shared/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { hashPassword } from "../utils/passwordHash";
import { sendPasswordResetEmail, isEmailConfigured } from "../services/email";
import { sanitizeString } from "../utils/sanitize";
import rateLimit from "express-rate-limit";
import zxcvbn from "zxcvbn";

// Minimum password strength score (0-4 scale, 3 = "good")
const MIN_PASSWORD_SCORE = 3;

// Rate limit password reset requests to prevent abuse
const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 reset requests per window
  message: { message: "Too many password reset requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit actual password resets to prevent brute force token guessing
const resetActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 reset attempts per hour
  message: { message: "Too many reset attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Token validity duration (1 hour)
const TOKEN_EXPIRY_HOURS = 1;

export function registerPasswordResetRoutes(app: Express) {
  /**
   * POST /api/password-reset/request
   * Request a password reset email
   * Rate limited to prevent abuse
   */
  app.post("/api/password-reset/request", resetRequestLimiter, async (req, res) => {
    try {
      const { email, username } = req.body;
      
      // Sanitize input
      const sanitizedEmail = sanitizeString(email);
      const sanitizedUsername = sanitizeString(username);
      
      if (!sanitizedEmail && !sanitizedUsername) {
        return res.status(400).json({ message: "Email or username is required" });
      }

      // Find user by email or username
      let user;
      if (sanitizedEmail) {
        user = await db.query.users.findFirst({
          where: eq(users.email, sanitizedEmail),
        });
      } else if (sanitizedUsername) {
        user = await storage.getUserByUsername(sanitizedUsername);
      }

      // Always return success to prevent email enumeration attacks
      // But only send email if user exists and has a password (local auth)
      if (user && user.passwordHash) {
        // Generate secure random token
        const token = randomBytes(32).toString("hex");
        
        // Calculate expiration time
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

        // Invalidate any existing tokens for this user
        await db.update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.usedAt)
          ));

        // Create new reset token
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          token,
          expiresAt,
        });

        // Send password reset email
        const userName = user.firstName || user.username || undefined;
        const userEmail = user.email || `${user.username}@placeholder.local`;
        
        if (user.email) {
          await sendPasswordResetEmail(user.email, token, userName);
        } else {
          // SECURITY: Never log tokens. For org students without email, 
          // admins should use the admin password reset feature instead.
          console.log(`[Password Reset] Reset requested for user without email: ${user.username}. Admin should use credential management.`);
        }
      }

      // Generic success message to prevent enumeration
      res.json({ 
        success: true, 
        message: "If an account exists with that email/username, a password reset link has been sent." 
      });
    } catch (error) {
      console.error("Error requesting password reset:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  /**
   * GET /api/password-reset/verify
   * Verify a reset token is valid (read-only, no state change)
   */
  app.get("/api/password-reset/verify", async (req, res) => {
    try {
      const token = req.query.token as string;
      
      if (!token) {
        return res.status(400).json({ message: "Token is required" });
      }

      // Find valid token
      const resetToken = await db.query.passwordResetTokens.findFirst({
        where: and(
          eq(passwordResetTokens.token, token),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date())
        ),
      });

      if (!resetToken) {
        return res.status(400).json({ 
          valid: false, 
          message: "Invalid or expired reset token" 
        });
      }

      res.json({ valid: true });
    } catch (error) {
      console.error("Error verifying reset token:", error);
      res.status(500).json({ message: "Failed to verify reset token" });
    }
  });

  /**
   * POST /api/password-reset/reset
   * Reset the password using a valid token
   * Rate limited to prevent brute force token guessing
   */
  app.post("/api/password-reset/reset", resetActionLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      // SECURITY: Validate password strength using zxcvbn
      // Score 0-4: 0=too guessable, 1=very guessable, 2=somewhat guessable, 3=safely unguessable, 4=very unguessable
      if (newPassword.length < 8) {
        return res.status(400).json({ 
          message: "Password must be at least 8 characters",
          passwordStrength: { score: 0, feedback: "Password is too short" }
        });
      }
      
      const passwordAnalysis = zxcvbn(newPassword);
      if (passwordAnalysis.score < MIN_PASSWORD_SCORE) {
        const suggestions = passwordAnalysis.feedback.suggestions || [];
        const warning = passwordAnalysis.feedback.warning || "";
        return res.status(400).json({ 
          message: warning || "Password is too weak. Please choose a stronger password.",
          passwordStrength: {
            score: passwordAnalysis.score,
            feedback: warning,
            suggestions,
            crackTime: passwordAnalysis.crack_times_display.offline_slow_hashing_1e4_per_second
          }
        });
      }

      // Find valid token
      const resetToken = await db.query.passwordResetTokens.findFirst({
        where: and(
          eq(passwordResetTokens.token, token),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date())
        ),
        with: {
          user: true,
        },
      });

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);

      // Update user's password and mark token as used
      await db.transaction(async (tx) => {
        // Update password
        await tx.update(users)
          .set({ 
            passwordHash: hashedPassword,
            updatedAt: new Date(),
          })
          .where(eq(users.id, resetToken.userId));

        // Mark token as used
        await tx.update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(eq(passwordResetTokens.id, resetToken.id));
      });

      console.log(`[Password Reset] Password successfully reset for user ${resetToken.userId}`);

      res.json({ 
        success: true, 
        message: "Password has been reset successfully. You can now log in with your new password." 
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

}
