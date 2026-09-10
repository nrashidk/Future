/**
 * NO STUDENT IS ENROLLED WITHOUT THE SCHOOL'S RECORDED CONSENT.
 *
 * The students are 13-18 and the school creates their accounts on their behalf,
 * so the school is the consenting party. organization_consents holds that act;
 * this is what makes it a precondition rather than a form nobody filled in.
 *
 * THREE SINKS, AND ONLY THREE. Every path that enrols a school student goes
 * through storage.createUserWithCredentials:
 *   admin.routes.ts  POST /api/admin/organizations/:id/members            (single)
 *   admin.routes.ts  POST /api/admin/organizations/:id/members/bulk       (bulk)
 *   admin.routes.ts  POST /api/admin/organizations/:id/import-students    (CSV)
 *
 * NOT GATED, and each for a reason worth writing down rather than rediscovering:
 *   - POST /api/superadmin/students calls storage.createStandaloneUser, which
 *     writes a users row with accountType 'individual' and NO organization
 *     membership. It does not enrol anyone into a school, so there is no
 *     organization whose consent could gate it. It is a self-serve individual
 *     account and belongs to the free-flow consent question, which is open.
 *   - The two createOrganizationMember calls in superadmin.routes.ts create
 *     role 'admin', not students. Gating admin creation would be circular: an
 *     admin is who attests.
 *
 * FAILS CLOSED. A storage error is treated as "no consent", not as "carry on".
 * The failure mode of this gate has to be a school that cannot enrol until
 * someone looks, never a student enrolled without a record.
 */

import type { IStorage } from "../storage";
import type { OrganizationConsent } from "../../shared/schema";

/** Machine-readable so the client can tell this apart from an authorization failure. */
export const CONSENT_REQUIRED_CODE = "CONSENT_REQUIRED";

export const CONSENT_REQUIRED_MESSAGE =
  "This school has not recorded its consent yet. A school administrator must do that before students can be added.";

/**
 * The decision itself, pure and exported so it can be pinned by tests.
 *
 * Both claims are required. A row asserting processing but not guardian consent
 * does not open the gate — it is not a consent record for this purpose, and the
 * guardian attestation is the claim standing in for parental consent that is
 * never otherwise collected.
 */
export function consentGateDecision(
  consent: Pick<OrganizationConsent, "consentsToProcessing" | "attestsGuardianConsent"> | null | undefined,
): { allowed: boolean } {
  if (!consent) return { allowed: false };
  return { allowed: consent.consentsToProcessing === true && consent.attestsGuardianConsent === true };
}

export interface ConsentGateResult {
  allowed: boolean;
  status: number;
  body: { message: string; code: string } | null;
}

const BLOCKED: ConsentGateResult = {
  allowed: false,
  status: 409,
  body: { message: CONSENT_REQUIRED_MESSAGE, code: CONSENT_REQUIRED_CODE },
};

/**
 * 409 rather than 403 deliberately. This is not "you may not do this" — the
 * admin is entitled to enrol students — it is "the state of this school
 * prevents it until an act is performed". A 403 here would read to the client,
 * and to the admin, as a permissions problem and send them to the wrong place.
 */
export async function requireOrganizationConsent(
  storage: Pick<IStorage, "getCurrentOrganizationConsent">,
  organizationId: string,
): Promise<ConsentGateResult> {
  try {
    const consent = await storage.getCurrentOrganizationConsent(organizationId);
    if (!consentGateDecision(consent).allowed) return BLOCKED;
    return { allowed: true, status: 200, body: null };
  } catch (error) {
    // Fail closed: an unreadable consent state is not a licence to enrol.
    console.error("[consentGate] Could not read consent state; blocking enrolment:", error);
    return BLOCKED;
  }
}
