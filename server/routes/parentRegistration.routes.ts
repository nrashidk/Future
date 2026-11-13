import type { Express } from "express";
import { z } from "zod";
import { storage, emailIsReserved } from "../storage";
import { hashPassword } from "../utils/passwordHash";
import { getPolicyVersion, hashAttestationText } from "../utils/policyVersion";
import { derivePerformedByName, resolvePolicyLocale } from "./organization.routes";
import { registerParentLimiter } from "../middleware/rateLimiter.middleware";
import rateLimit from "express-rate-limit";
import { isAuthenticated } from "../auth";
import { confirmationDueAt, needsConfirmation } from "@shared/emailConfirmation";
import { confirmEmailByToken, issueEmailConfirmation } from "../services/emailConfirmation";

/**
 * Resend is the only way to make this server send mail to an address on
 * demand, so it is bounded per ACCOUNT: five an hour is more than a parent
 * hunting through a spam folder needs and too few to use as a mail cannon.
 */
const resendConfirmationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req: any) => `confirm-resend:${req.user?.userId ?? "anon"}`,
  message: { message: "Too many confirmation emails requested. Please try again later.", code: "RESEND_LIMIT" },
  standardHeaders: true,
  legacyHeaders: false,
});

/** A link is guessed, not typed: bound guessing per address. */
const confirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Too many attempts. Please try again later.", code: "CONFIRM_LIMIT" },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * THE PARENT-REGISTERS ROUTE'S ACCOUNT CREATION — account, child profile and
 * consent, before payment.
 *
 * docs/parent-registers-scoping.md: the self-pay route's individual buyer
 * becomes a parent registering FOR a child, not for themselves. This is the
 * inversion that report's item 3 asked for — today's /api/checkout/complete
 * (payment.routes.ts) creates an account as a SIDE EFFECT of a successful
 * charge, with auto-generated credentials nobody chose and no child identity
 * or consent captured anywhere. This endpoint runs BEFORE that: the account,
 * the child's identity and the parent's consent all have to exist before
 * Stripe is ever reached. /api/checkout/complete's `wasLoggedIn` branch —
 * already built for an authenticated user upgrading — is what runs next; it
 * is unchanged by this commit.
 *
 * NOT IN setupAuth (server/auth.ts) AND NOT REUSING registerSchema THERE.
 * That file is the reviewed, do-not-touch authentication core; this is a new,
 * separate account-creation path that happens to also hash a password the
 * same way. Duplicating the four-field parent shape here costs four lines and
 * avoids widening auth.ts's surface for a route it has no reason to know
 * about.
 *
 * CSRF-EXEMPT, LIKE /api/register. This endpoint creates the session, so
 * there is no prior CSRF token to validate against — see the addition to
 * middleware/csrf.middleware.ts's exemptPaths.
 */

const registerParentSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  child: z.object({
    name: z.string().min(1, "Child's name is required"),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD"),
    gender: z.string().min(1, "Child's gender is required"),
    grade: z.string().min(1, "Child's grade is required"),
    countryId: z.string().min(1, "Country is required"),
    curriculum: z.string().min(1, "Curriculum is required"),
  }),
  // BOTH CLAIMS OR NOTHING, same as the org attestation (organization.routes.ts):
  // a partial affirmation is rejected rather than stored as a row that would
  // gate nothing while looking, to a later reader, like a consent record.
  consentsToProcessing: z.literal(true, {
    error: "Consent to processing must be affirmed.",
  }),
  attestsGuardianRelationship: z.literal(true, {
    error: "The guardian-relationship attestation must be affirmed.",
  }),
  attestationText: z.string().min(1, "Missing attestationText: the exact wording shown to the parent."),
  locale: z.string().optional(),
});

export function registerParentRegistrationRoutes(app: Express) {
  app.post("/api/register/parent", registerParentLimiter, async (req, res) => {
    try {
      const result = registerParentSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.issues[0]?.message || "Invalid input" });
      }
      const { email, password, firstName, lastName, child, attestationText, locale } = result.data;
      const normalizedEmail = email.toLowerCase();

      // A RESERVED ADDRESS IS REFUSED, AND REFUSED IN THE SAME WORDS AS A TAKEN
      // ONE. An account whose email is in SUPERADMIN_EMAILS is a platform
      // administrator from its next request, this route is public, and it
      // signs the new account in without proof of the address -- so a
      // reserved address no account yet held was an administrator account for
      // whoever typed it first. Same sentence as below on purpose: a public
      // form must not say which addresses are reserved.
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser || emailIsReserved(normalizedEmail)) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      // FAIL CLOSED, same as /api/my-organization/consent. Without readable
      // documents there is nothing to say the parent's consent was given
      // against, and a row citing an unknown version is worse than no row.
      const policy = getPolicyVersion();
      if (!policy) {
        return res.status(503).json({
          message: "Legal documents are unavailable, so consent cannot be recorded. Please contact support.",
        });
      }

      const passwordHash = await hashPassword(password);
      const policyLocale = resolvePolicyLocale(locale);
      const performedByName = derivePerformedByName({ firstName, lastName, email: normalizedEmail });

      const { user, childProfile } = await storage.createParentRegistration({
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName,
        role: "user",
        // The parent has this long to click the link in the mail sent below,
        // or the account is erased (shared/emailConfirmation.ts).
        emailConfirmationDueAt: confirmationDueAt(new Date()),
        child,
        consent: {
          consentsToProcessing: true,
          attestsGuardianRelationship: true,
          performedByName,
          performedByEmail: normalizedEmail,
          policyVersion: policy.version,
          policyLastUpdated: policy.lastUpdated[policyLocale] ?? "",
          policyLocale,
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
          attestationTextHash: hashAttestationText(attestationText),
        },
      });

      // Never throws and never fails the registration: the account exists.
      // Awaited so the response can say whether the mail went, and the page
      // can tell the parent to use Resend instead of waiting for nothing.
      const confirmation = await issueEmailConfirmation({
        userId: user.id,
        email: normalizedEmail,
        name: firstName,
        language: policyLocale,
      });

      req.logIn({ userId: user.id, isLocal: true }, (err) => {
        if (err) {
          return res.status(500).json({ message: "Account created but login failed" });
        }
        return res.json({
          success: true,
          user: { id: user.id, email: user.email },
          child: { id: childProfile.id, name: childProfile.name },
          confirmationEmailSent: confirmation.sent,
        });
      });
    } catch (error) {
      console.error("Error registering parent account:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  /**
   * SPEND A CONFIRMATION LINK. POST, not GET: mail scanners and link
   * previews fetch every URL in a message, and a GET that confirmed would
   * let a scanner confirm an address its owner never saw. The page at
   * /confirm-email/:token posts this when it loads in a real browser.
   *
   * No session is needed or consulted: the parent may open the mail on a
   * different device from the one they registered on. The token is the
   * credential.
   */
  app.post("/api/email-confirmation/confirm", confirmLimiter, async (req, res) => {
    try {
      const outcome = await confirmEmailByToken(String(req.body?.token ?? ""));
      if (outcome === "confirmed" || outcome === "already_confirmed") {
        return res.json({ success: true, outcome });
      }
      if (outcome === "expired") {
        return res.status(410).json({ message: "This confirmation link has expired.", code: "LINK_EXPIRED" });
      }
      return res.status(404).json({ message: "This confirmation link is not valid.", code: "LINK_INVALID" });
    } catch (error) {
      console.error("Error confirming email:", error);
      res.status(500).json({ message: "Could not confirm the email address" });
    }
  });

  app.post("/api/email-confirmation/resend", isAuthenticated, resendConfirmationLimiter, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user || !user.email) return res.status(404).json({ message: "Account not found" });
      if (!needsConfirmation(user, new Date())) {
        return res.status(409).json({ message: "This account has nothing to confirm.", code: "NOT_PENDING" });
      }
      const { sent } = await issueEmailConfirmation({
        userId: user.id,
        email: user.email,
        name: user.firstName ?? undefined,
        language: resolvePolicyLocale(req.body?.locale ?? user.preferredLanguage ?? undefined),
      });
      if (!sent) {
        return res.status(503).json({ message: "The confirmation email could not be sent. Please try again.", code: "MAIL_NOT_SENT" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error resending confirmation email:", error);
      res.status(500).json({ message: "Could not resend the confirmation email" });
    }
  });
}
