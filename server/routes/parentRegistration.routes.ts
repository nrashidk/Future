import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { hashPassword } from "../utils/passwordHash";
import { getPolicyVersion, hashAttestationText } from "../utils/policyVersion";
import { derivePerformedByName, resolvePolicyLocale } from "./organization.routes";
import { registerParentLimiter } from "../middleware/rateLimiter.middleware";

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
    errorMap: () => ({ message: "Consent to processing must be affirmed." }),
  }),
  attestsGuardianRelationship: z.literal(true, {
    errorMap: () => ({ message: "The guardian-relationship attestation must be affirmed." }),
  }),
  attestationText: z.string().min(1, "Missing attestationText: the exact wording shown to the parent."),
  locale: z.string().optional(),
});

export function registerParentRegistrationRoutes(app: Express) {
  app.post("/api/register/parent", registerParentLimiter, async (req, res) => {
    try {
      const result = registerParentSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0]?.message || "Invalid input" });
      }
      const { email, password, firstName, lastName, child, attestationText, locale } = result.data;
      const normalizedEmail = email.toLowerCase();

      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
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

      req.logIn({ userId: user.id, isLocal: true }, (err) => {
        if (err) {
          return res.status(500).json({ message: "Account created but login failed" });
        }
        return res.json({
          success: true,
          user: { id: user.id, email: user.email },
          child: { id: childProfile.id, name: childProfile.name },
        });
      });
    } catch (error) {
      console.error("Error registering parent account:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });
}
