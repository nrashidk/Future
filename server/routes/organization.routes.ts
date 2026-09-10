import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { getPolicyVersion, hashAttestationText, POLICY_LOCALES, type PolicyLocale } from "../utils/policyVersion";

/**
 * The admin's display name AS RECORDED ON THE CONSENT ROW. Exported and tested
 * because the fallback chain is the point: this string, not the FK, is what
 * names the attester once the user row is gone, so it must never be empty.
 */
export function derivePerformedByName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.email || "Unknown";
}

/**
 * Which locale's documents the admin was served. Defaults to 'en' for anything
 * unrecognised rather than throwing: a bad locale must not block an attestation,
 * and 'en' is the locale the documents are authored in.
 */
export function resolvePolicyLocale(locale: unknown): PolicyLocale {
  return (POLICY_LOCALES as readonly string[]).includes(locale as string)
    ? (locale as PolicyLocale)
    : "en";
}

/**
 * Have the documents moved since this school attested?
 *
 * ADVISORY ONLY — exported and tested precisely so it stays that way. Nothing
 * may gate on this. A gate comparing current hash to attested hash would lock
 * every school out of enrolment on the first typo committed to legal.json, which
 * is a safeguard that breaks the thing it guards. Drift is shown to the admin;
 * enrolment does not care.
 */
export function isPolicyDrifted(
  attestedVersion: string | null | undefined,
  currentVersion: string | null | undefined,
): boolean {
  if (!attestedVersion || !currentVersion) return false;
  return attestedVersion !== currentVersion;
}

export function registerOrganizationRoutes(app: Express) {
  // Organization Admin Endpoints (for org_admin users to access their organization data)
  app.get("/api/my-organization", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user || user.accountType !== 'org_admin') {
        return res.status(403).json({ message: "Access denied: Organization admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  /**
   * THE SCHOOL'S CONSENT ACT — read and write.
   *
   * ORG_ADMIN ONLY, AND THERE IS NO SUPERADMIN PATH. That is not an oversight,
   * it is the design: a superadmin cannot create students for a school that has
   * not attested (the gate on the four enrolment routes), so a superadmin must
   * not be able to supply the attestation either. A superadmin asserting that a
   * school holds guardian consent for its students is exactly the fiction this
   * record exists to remove. The consequence is real and accepted: a school with
   * no reachable admin cannot enrol students until one attests.
   */
  app.get("/api/my-organization/consent", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);

      if (!user || user.accountType !== 'org_admin') {
        return res.status(403).json({ message: "Access denied: Organization admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const current = await storage.getCurrentOrganizationConsent(organization.id);
      const policy = getPolicyVersion();

      res.json({
        /** null when the school has never attested — this is what gates enrolment. */
        consent: current ?? null,
        /** null when the legal documents could not be read; POST will refuse. */
        currentPolicyVersion: policy?.version ?? null,
        currentPolicyLastUpdated: policy?.lastUpdated ?? null,
        /**
         * ADVISORY ONLY. Reported so an admin can see the documents moved since
         * they attested; NOTHING GATES ON IT. A drift gate would lock every
         * school out of enrolment on the first typo committed to legal.json.
         * See server/utils/policyVersion.ts.
         */
        policyDrifted: isPolicyDrifted(current?.policyVersion, policy?.version),
      });
    } catch (error) {
      console.error("Error fetching organization consent:", error);
      res.status(500).json({ message: "Failed to fetch consent record" });
    }
  });

  app.post("/api/my-organization/consent", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);

      if (!user || user.accountType !== 'org_admin') {
        return res.status(403).json({ message: "Access denied: Organization admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const { consentsToProcessing, attestsGuardianConsent, attestationText, locale } = req.body ?? {};

      /**
       * BOTH CLAIMS OR NOTHING. A partial assertion is rejected rather than
       * stored: the record's whole job is to say the school made both claims,
       * and a row with attestsGuardianConsent=false would gate nothing while
       * looking, to a later reader, like a consent record.
       */
      if (consentsToProcessing !== true || attestsGuardianConsent !== true) {
        return res.status(400).json({
          message: "Both the processing consent and the guardian-consent attestation must be affirmed.",
        });
      }

      if (typeof attestationText !== "string" || attestationText.trim().length === 0) {
        return res.status(400).json({ message: "Missing attestationText: the exact wording shown to the admin." });
      }

      const policyLocale = resolvePolicyLocale(locale);

      /**
       * FAIL CLOSED. Without readable documents we cannot say what was consented
       * to, and a row citing an unknown version is worse than no row — the next
       * reader trusts it. Refuse rather than substitute a placeholder.
       */
      const policy = getPolicyVersion();
      if (!policy) {
        return res.status(503).json({
          message: "Legal documents are unavailable, so consent cannot be recorded. Please contact support.",
        });
      }

      const performedByName = derivePerformedByName(user);

      const consent = await storage.createOrganizationConsent({
        organizationId: organization.id,
        // Denormalised so the row still names the school after the FK nulls.
        organizationName: organization.name,
        consentsToProcessing: true,
        attestsGuardianConsent: true,
        performedBy: user.id,
        performedByRole: 'org_admin',
        performedByName,
        performedByEmail: user.email || "",
        policyVersion: policy.version,
        policyLastUpdated: policy.lastUpdated[policyLocale] ?? "",
        policyLocale,
        // req.ip honours trust proxy; both are best-effort and neither is a signature.
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
        attestationTextHash: hashAttestationText(attestationText),
      });

      /**
       * The visible trace, alongside the record. organization_events is what
       * admins already read as an activity log, so the act has to appear there —
       * but it could not BE the record: its event_type is free text with no
       * uniqueness, and its rows are deleted with the organization.
       *
       * NON-FATAL. The consent row is committed above and is the thing that
       * matters; losing the log line must not fail the attestation and strand a
       * school that has just consented.
       */
      try {
        await storage.createOrganizationEvent({
          organizationId: organization.id,
          eventType: 'consent_attested',
          eventDescription: `${performedByName} recorded consent and attested guardian consent (policy ${policy.version})`,
          performedBy: user.id,
          performedByRole: 'org_admin',
          newValue: { consentId: consent.id, policyVersion: policy.version, policyLocale },
        });
      } catch (eventError) {
        console.error("Consent recorded but activity-log entry failed:", eventError);
      }

      res.status(201).json({ consent });
    } catch (error) {
      console.error("Error recording organization consent:", error);
      res.status(500).json({ message: "Failed to record consent" });
    }
  });

  app.get("/api/my-organization/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user || user.accountType !== 'org_admin') {
        return res.status(403).json({ message: "Access denied: Organization admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Get organization statistics with accurate assessment completion data
      const stats = await storage.getOrganizationStats(organization.id);
      
      res.json({
        totalLicenses: organization.totalLicenses,
        usedLicenses: organization.usedLicenses,
        remainingLicenses: Math.max(0, organization.totalLicenses - organization.usedLicenses),
        ...stats,
      });
    } catch (error) {
      console.error("Error fetching organization stats:", error);
      res.status(500).json({ message: "Failed to fetch organization stats" });
    }
  });
}
