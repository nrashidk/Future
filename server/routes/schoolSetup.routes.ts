import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { users, schoolSetupTokens } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../utils/passwordHash";
import rateLimit from "express-rate-limit";
import zxcvbn from "zxcvbn";

/**
 * FIRST SIGN-IN for a school bought through group checkout.
 *
 * The buyer's account is minted server-side during the payment, so there is no
 * password anybody chose. Until these routes existed the generated one was
 * rendered once on the success screen and sent nowhere, and the only route
 * back in was "Forgot password" — a recovery flow standing in for an
 * onboarding one, reached by a real buyer on 2026-11-09.
 *
 * Same strength rule as the password reset flow (zxcvbn >= 3), the same
 * transaction shape, and its own limiter. Deliberately NOT sharing the reset
 * routes: a setup token lives seven days and may be re-sent, a reset token
 * lives an hour and never is, and one route serving both would have to branch
 * on which kind it was holding.
 */

// Minimum password strength (0-4). The same bar the reset route sets, because
// a weaker password here would be a weaker password on the same account.
const MIN_PASSWORD_SCORE = 3;

/**
 * Brute force on a 64-hex token is not realistic, but a limiter also bounds
 * the enumeration ATTEMPT — and an unlimited endpoint that reads a credential
 * from the URL is the shape that invites one.
 */
const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { message: "Too many setup attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export function registerSchoolSetupRoutes(app: Express) {
  /**
   * What this link is for, without spending it.
   *
   * The client needs the school name and sign-in name to render the page, and
   * the buyer needs to see them to know the link is theirs. Returns NOTHING
   * about anyone else, and never the token back.
   *
   * A dead link gets a flat 410 with one code. Distinguishing "expired" from
   * "already used" from "never existed" would confirm to a stranger that a
   * token value was real, which is the only thing a guesser learns from this
   * endpoint.
   */
  app.get("/api/school/setup/:token", setupLimiter, async (req, res) => {
    try {
      const row = await storage.getLiveSchoolSetupToken(req.params.token);
      if (!row) {
        return res.status(410).json({
          message: "This setup link is no longer valid. Ask your administrator to send a new one.",
          code: "SETUP_LINK_INVALID",
        });
      }

      const user = await storage.getUser(row.userId);
      if (!user) {
        // The token survived its user. The schema CASCADEs, so this should be
        // unreachable; treating it as a dead link rather than a 500 keeps the
        // response identical to every other dead-link case.
        console.error(`[SchoolSetup] Token ${row.id} has no user — treating as invalid`);
        return res.status(410).json({
          message: "This setup link is no longer valid. Ask your administrator to send a new one.",
          code: "SETUP_LINK_INVALID",
        });
      }

      const organization = row.organizationId
        ? await storage.getOrganizationById(row.organizationId)
        : null;

      res.json({
        username: user.username,
        firstName: user.firstName,
        organizationName: organization?.name ?? null,
        totalLicenses: organization?.totalLicenses ?? null,
        // What the onboarding still needs, so the client knows which step to
        // open on rather than guessing from an enrolment 409 later.
        needsCountry: !organization?.countryId,
        needsCurriculum: !organization?.curriculum,
      });
    } catch (error) {
      console.error("[SchoolSetup] Failed to read setup token:", error);
      res.status(500).json({ message: "Could not read this setup link" });
    }
  });

  /**
   * Spend the link: set the password and sign the buyer in.
   *
   * TWO GUARDS, and they cover different things.
   *
   * SEQUENTIALLY, a replay is stopped by `getLiveSchoolSetupToken` above:
   * it filters `used_at IS NULL`, so the second request finds nothing and
   * never reaches this transaction. That is the path `school-setup-link.mjs`
   * L-05 actually exercises, and it is what stops someone holding a copy of
   * the link from overwriting the password afterwards.
   *
   * CONCURRENTLY, that read is check-then-act with a window in it — the family
   * this repo keeps producing. So the UPDATE inside the transaction claims the
   * row with `WHERE id = ...` on a row already filtered by `used_at IS NULL`,
   * and a zero-row result abandons the write rather than proceeding. The token
   * is claimed BEFORE the password is written: setting the password first
   * would let two concurrent requests both write one, last in wins.
   *
   * **The concurrent half cannot be verified here.** PGlite allows a single
   * connection, so the harness serialises requests and they never overlap —
   * CLAUDE.md records the same limitation for the webhook's atomicity.
   * Removing this in-transaction check leaves all eight cases passing, which
   * was confirmed by trying. It is correct on its own terms and is reviewable
   * by eye only; real verification needs Postgres with real concurrency.
   */
  app.post("/api/school/setup/:token/password", setupLimiter, async (req: any, res) => {
    try {
      const { password } = req.body ?? {};

      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({
          message: "Password must be at least 8 characters",
          passwordStrength: { score: 0, feedback: "Password is too short" },
        });
      }

      const analysis = zxcvbn(password);
      if (analysis.score < MIN_PASSWORD_SCORE) {
        const warning = analysis.feedback.warning || "";
        return res.status(400).json({
          message: warning || "Password is too weak. Please choose a stronger password.",
          passwordStrength: {
            score: analysis.score,
            feedback: warning,
            suggestions: analysis.feedback.suggestions || [],
          },
        });
      }

      const row = await storage.getLiveSchoolSetupToken(req.params.token);
      if (!row) {
        return res.status(410).json({
          message: "This setup link is no longer valid. Ask your administrator to send a new one.",
          code: "SETUP_LINK_INVALID",
        });
      }

      const user = await storage.getUser(row.userId);
      if (!user) {
        return res.status(410).json({ message: "This setup link is no longer valid.", code: "SETUP_LINK_INVALID" });
      }

      const passwordHash = await hashPassword(password);

      let claimed = false;
      await db.transaction(async (tx) => {
        // Claim first. The WHERE is the arbiter, not a prior read.
        const spent = await tx
          .update(schoolSetupTokens)
          .set({ usedAt: new Date() })
          .where(eq(schoolSetupTokens.id, row.id))
          .returning({ id: schoolSetupTokens.id });
        if (spent.length === 0) return;
        claimed = true;

        await tx
          .update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, row.userId));
      });

      if (!claimed) {
        return res.status(410).json({
          message: "This setup link has already been used.",
          code: "SETUP_LINK_INVALID",
        });
      }

      console.log(`[SchoolSetup] Password set for user ${row.userId} via setup link`);

      /**
       * Sign them in, so the link lands them IN the onboarding rather than at
       * a login form holding a password they typed ten seconds ago.
       *
       * req.login regenerates the session, which is the behaviour auth.ts
       * already relies on. A login failure is logged but does not fail the
       * request: the password is set and committed, so the honest outcome is
       * "it worked, now sign in" rather than an error that invites them to
       * retry a link that is now spent.
       */
      await new Promise<void>((resolve) => {
        req.login(
          { userId: user.id, username: user.username, isLocal: true },
          (err: any) => {
            if (err) console.error(`[SchoolSetup] Password set but auto-login failed for ${user.id}:`, err);
            resolve();
          },
        );
      });

      res.json({
        success: true,
        signedIn: !!(req.isAuthenticated && req.isAuthenticated()),
        username: user.username,
      });
    } catch (error) {
      console.error("[SchoolSetup] Failed to set password:", error);
      res.status(500).json({ message: "Could not set your password" });
    }
  });
}
