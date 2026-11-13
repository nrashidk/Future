import type { Express } from "express";
import { storage } from "../storage";
import { renderInvoicePdf } from "../services/invoicePdf";
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
        return res.status(403).json({ message: "Access denied: School admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch school" });
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
        return res.status(403).json({ message: "Access denied: School admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
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
        return res.status(403).json({ message: "Access denied: School admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
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
        return res.status(403).json({ message: "Access denied: School admin only" });
      }

      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
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
      res.status(500).json({ message: "Failed to fetch school stats" });
    }
  });

  /**
   * THE SCHOOL'S OWN INVOICES.
   *
   * THE ORGANIZATION IS DERIVED FROM THE SESSION, never taken from the
   * request — `getOrganizationByAdminUserId(userId)`, exactly as every other
   * route in this file does it. There is no organization id in the URL to
   * tamper with, which is the strongest version of the control: the leak this
   * screen could produce is not prevented by a check, it is unreachable by
   * construction.
   *
   * DRAFTS ARE EXCLUDED. A draft has not been sent to anybody, so showing one
   * would have a school querying a bill nobody raised — and "outstanding" on
   * their side must mean the same thing it means on ours.
   */
  const SCHOOL_VISIBLE_INVOICE_STATUSES = ["issued", "paid", "cancelled"];

  app.get("/api/my-organization/invoices", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      if (!user || user.accountType !== 'org_admin') {
        return res.status(403).json({ message: "Access denied: School admin only" });
      }
      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
      }

      const rows = await storage.listInvoices({
        organizationId: organization.id,
        statuses: SCHOOL_VISIBLE_INVOICE_STATUSES,
      });

      /**
       * "Awaiting payment" counts ISSUED only, and is the same arithmetic the
       * superadmin screen does — a school and the person chasing them must not
       * read different numbers off the same rows.
       */
      const awaiting = rows.filter((i) => i.status === "issued");
      res.json({
        invoices: rows,
        awaitingMinor: awaiting.reduce((n, i) => n + i.totalMinor, 0),
        awaitingCurrencies: [...new Set(awaiting.map((i) => i.currency))],
      });
    } catch (error) {
      console.error("Error fetching organization invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  /**
   * ONE INVOICE, and the only route here that takes an id — so the only one
   * where a school could ask for someone else's.
   *
   * THE CHECK IS A COMPARISON AGAINST THE DERIVED ORG, and it answers 404
   * rather than 403. A 403 confirms the invoice exists, which turns this into
   * an enumeration oracle for how many sales a competitor has made; 404 says
   * only "not one of yours". The same reasoning as the anti-enumeration 200s
   * elsewhere in this codebase.
   *
   * A DRAFT is 404 here too, for the same reason it is absent from the list.
   */
  app.get("/api/my-organization/invoices/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      if (!user || user.accountType !== 'org_admin') {
        return res.status(403).json({ message: "Access denied: School admin only" });
      }
      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
      }

      const invoice = await storage.getInvoiceById(req.params.id);
      if (
        !invoice ||
        invoice.organizationId !== organization.id ||
        !SCHOOL_VISIBLE_INVOICE_STATUSES.includes(invoice.status)
      ) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json({ invoice });
    } catch (error) {
      console.error("Error fetching organization invoice:", error);
      res.status(500).json({ message: "Failed to fetch the invoice" });
    }
  });

  /**
   * THE SCHOOL'S OWN PDF.
   *
   * THE ACCESS CHECK IS REPEATED IN FULL, not inherited from the route above.
   * A download is a different verb on the same resource, and "a control
   * applied to one verb and not its sibling" is the bug family this codebase
   * keeps producing — the version of it that matters here would hand a
   * competitor's invoice to anyone who guessed an id.
   *
   * 404, not 403, for the same anti-enumeration reason as the JSON route.
   */
  app.get("/api/my-organization/invoices/:id/pdf", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      if (!user || user.accountType !== 'org_admin') {
        return res.status(403).json({ message: "Access denied: School admin only" });
      }
      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
      }

      const invoice = await storage.getInvoiceById(req.params.id);
      if (
        !invoice ||
        invoice.organizationId !== organization.id ||
        !SCHOOL_VISIBLE_INVOICE_STATUSES.includes(invoice.status)
      ) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // The school's own language, not the superadmin's.
      const language = req.query.lang === "ar"
        ? "ar"
        : (req.query.lang === "en" ? "en" : (user.preferredLanguage === "ar" ? "ar" : "en"));
      const pdf = await renderInvoicePdf({ invoice, language });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${invoice.number}.pdf"`);
      res.setHeader("Content-Length", String(pdf.length));
      return res.end(pdf);
    } catch (error) {
      console.error("Error rendering organization invoice PDF:", error);
      return res.status(500).json({ message: "Failed to render the invoice" });
    }
  });
}
