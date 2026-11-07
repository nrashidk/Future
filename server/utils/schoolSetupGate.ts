/**
 * A SCHOOL IS NOT OPERATIONAL UNTIL IT HAS A COUNTRY AND A CURRICULUM.
 *
 * Both decide which quiz bank a student's assessment draws from, and both
 * decide which questions the school may contribute. A school missing either is
 * not merely incomplete — it is a school whose students cannot be assessed and
 * whose contributions are unattributable.
 *
 * WHY A GATE RATHER THAN A NOT NULL. The columns are nullable on purpose (see
 * server/migrations/014_require_student_demographics.sql): the Stripe
 * group-purchase path creates an organization inside the payment transaction,
 * where neither value is available, and a NOT NULL there would roll back a
 * completed purchase. Superadmin creation already demands both. So the gap is
 * reachable only through purchase — and that is exactly the school least likely
 * to be looked at afterwards.
 *
 * WHAT IT WAS LEAVING OPEN. The contribution route guards its country and
 * curriculum as "if the school has one set, it must match". For a school with
 * neither, both guards are skipped, and it could submit questions tagged to any
 * country and any curriculum the platform knows about. A school teaches one
 * curriculum; it should never have been choosing.
 *
 * TWO SINKS, deliberately:
 *   enrolment     — a student enrolled into a school with no country gets an
 *                   assessment with no question bank. The failure arrives much
 *                   later, in front of the student.
 *   contribution  — see above.
 *
 * NOT GATED, and for a reason: reading, exporting, licence management and
 * consent itself. None of them depend on country or curriculum, and blocking
 * them would trap an admin who is trying to fix exactly this.
 *
 * FAILS CLOSED, like the consent gate: an unreadable organization is treated as
 * not set up rather than as permission to carry on.
 */

import type { IStorage } from "../storage";
import { SCHOOL_SETUP_REQUIRED_CODE } from "../../shared/schoolSetupRequired";

export { SCHOOL_SETUP_REQUIRED_CODE };

export const SCHOOL_SETUP_REQUIRED_MESSAGE =
  "This school has not finished its setup. A school administrator must set its country and curriculum first.";

/**
 * The decision, pure and exported so it can be pinned by tests without a
 * database.
 *
 * An empty string counts as missing. A cleared field can write "" rather than
 * NULL, which would satisfy a NOT NULL constraint while failing every
 * downstream `!org.countryId` check — the exact state admin.routes.ts guards
 * against when updating a school, and the reason this tests emptiness rather
 * than nullness.
 */
export function schoolSetupDecision(
  organization: { countryId?: string | null; curriculum?: string | null } | null | undefined,
): { allowed: boolean; missing: Array<"country" | "curriculum"> } {
  if (!organization) return { allowed: false, missing: ["country", "curriculum"] };
  const missing: Array<"country" | "curriculum"> = [];
  if (!organization.countryId || !organization.countryId.trim()) missing.push("country");
  if (!organization.curriculum || !organization.curriculum.trim()) missing.push("curriculum");
  return { allowed: missing.length === 0, missing };
}

export interface SchoolSetupGateResult {
  allowed: boolean;
  status: number;
  body: { message: string; code: string; missing: string[] } | null;
}

function blocked(missing: string[]): SchoolSetupGateResult {
  return {
    allowed: false,
    // 409, not 403, for the same reason the consent gate uses it: the admin is
    // entitled to do this. It is the state of the school that prevents it until
    // an act is performed, and a 403 would read as a permissions problem and
    // send them somewhere that cannot help.
    status: 409,
    body: { message: SCHOOL_SETUP_REQUIRED_MESSAGE, code: SCHOOL_SETUP_REQUIRED_CODE, missing },
  };
}

export async function requireSchoolSetup(
  storage: Pick<IStorage, "getOrganizationById">,
  organizationId: string,
): Promise<SchoolSetupGateResult> {
  try {
    const organization = await storage.getOrganizationById(organizationId);
    const decision = schoolSetupDecision(organization);
    if (!decision.allowed) return blocked(decision.missing);
    return { allowed: true, status: 200, body: null };
  } catch (error) {
    console.error("[schoolSetupGate] Could not read school setup; blocking:", error);
    return blocked(["country", "curriculum"]);
  }
}
