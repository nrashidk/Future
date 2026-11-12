/**
 * WHO, OTHER THAN THE STUDENT, MAY READ ONE STUDENT'S REPORT.
 *
 * Until 2026-11-12 the answer on every single-report route was "nobody": the
 * assessment, its recommendations, its quiz, its narratives and its PDF were
 * each readable only by the account that sat it. That was stricter than the
 * product itself. A school admin and a superadmin could already download the
 * very same reports as a zip (the bulk export), so the block protected
 * nothing -- it only meant the "view results" link in the superadmin
 * dashboard opened a page that could load none of its data. The page then
 * fell back to what it shows when it knows nothing about the report: the
 * FREE-tier layout, with an "unlock" offer, over a school's paid report.
 *
 * Two staff roles may read, and nothing else is widened:
 *   - a SUPERADMIN, any student's report
 *   - a SCHOOL ADMIN, a report belonging to a student OF THAT SCHOOL. Never
 *     another school's: that is the cross-tenant line, and it is the reason
 *     this is one function instead of a condition repeated at seven sites.
 *     "A control applied to one verb and not its siblings" is a family this
 *     codebase already has.
 *
 * READ ONLY. This is consulted by GET routes. It must never be consulted by
 * the generate route: producing a report spends a licence, and staff opening
 * a report must not be able to cause that.
 *
 * GUEST assessments are never staff-readable. They belong to no account and
 * no school, so there is no relationship to authorise on.
 *
 * Roles are read from the DATABASE on every call, never from the session, for
 * the reason CLAUDE.md gives for superadmin generally.
 *
 * Fails closed: any lookup that throws is a refusal.
 */
import { storage } from "../storage";
import { getSuperadminEmails } from "../middleware/auth.middleware";
import logger from "./logger";

type AssessmentLike = { id: string; userId: string | null } | null | undefined;

export type StaffReader = { role: "superadmin" | "org_admin"; userId: string; organizationId?: string };

export async function staffMayReadAssessment(req: any, assessment: AssessmentLike): Promise<StaffReader | null> {
  try {
    if (!assessment || !assessment.userId) return null;
    if (typeof req?.isAuthenticated !== "function" || !req.isAuthenticated()) return null;
    const viewerId: string | undefined = req.user?.userId;
    if (!viewerId || viewerId === assessment.userId) return null; // the owner is not "staff"

    const viewer = await storage.getUser(viewerId);
    if (!viewer) return null;

    const isSuperadmin =
      viewer.role === "superadmin" ||
      (!!viewer.email && getSuperadminEmails().includes(viewer.email.toLowerCase()));
    if (isSuperadmin) return { role: "superadmin", userId: viewerId };

    if (viewer.accountType !== "org_admin") return null;

    // The admin's school, then the STUDENT's school, compared. Both read here
    // rather than taken from the request: an organisation id in a URL is the
    // free choice this must not offer.
    const adminOrg = await storage.getOrganizationByAdminUserId(viewerId);
    if (!adminOrg) return null;
    const studentMembership = await storage.getOrganizationMemberByUserId(assessment.userId);
    if (!studentMembership || studentMembership.organizationId !== adminOrg.id) return null;
    if (studentMembership.role !== "student") return null;

    return { role: "org_admin", userId: viewerId, organizationId: adminOrg.id };
  } catch (error) {
    console.error("[staffReportAccess] lookup failed; refusing:", error);
    return null;
  }
}

/**
 * Records that a member of staff opened a student's report. Called once per
 * report open, from the assessment read -- the one request every view makes --
 * rather than from each of the seven routes, which would log one view seven
 * times and make the record useless for counting.
 */
export function recordStaffReportView(req: any, reader: StaffReader, assessment: { id: string; userId: string | null }) {
  logger.security("Staff viewed a student report", {
    userId: reader.userId,
    action: `staffReportView:${reader.role}`,
    resource: `assessment:${assessment.id}`,
    subjectUserId: assessment.userId,
    organizationId: reader.organizationId,
    ip: req?.ip,
  } as any);
}
