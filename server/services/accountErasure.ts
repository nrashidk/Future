/**
 * What happens to a student's own record when they leave — erase it, or detach it.
 *
 * Lives in services/ rather than beside a route because there are now two
 * callers with different reasons: the student exercising their own right to
 * erasure (user.routes.ts, DELETE /api/users/me) and a school admin removing a
 * student from their school (admin.routes.ts). Those are different acts and the
 * routes keep their own authorization, but what they do to the data must not
 * drift apart — an erasure that means one thing when a student asks and another
 * when a school does is exactly the kind of divergence this file exists to
 * prevent.
 */

import {
  users, assessments, recommendations, assessmentQuizzes, quizResponses,
  cvqResults, organizationMembers, wefCompetencyResults,
  organizations, organizationEvents, contributionSubmissions, contributionRewards,
  files, scoringConfigChangeLog, systemAnnouncements, systemConfig,
} from "@shared/schema";
import { eq, or, inArray } from "drizzle-orm";
import { storage } from "../storage";

/**
 * ERASURE'S DEPENDENT LIST — DERIVED, NOT REMEMBERED.
 *
 * The bug this replaces was not a wrong delete, it was a SHORT LIST. The old
 * sequence deleted cvq_results, quiz_responses, assessment_quizzes,
 * recommendations, assessments, organization_members, users — and omitted
 * wef_competency_results, which is NOT NULL -> assessments with NO ACTION
 * (schema.ts:401). So `delete(assessments)` raised 23503, the transaction rolled
 * back whole, and the right-to-erasure endpoint returned 500 for every user who
 * had ever completed a PREMIUM assessment. School students are forced premium
 * (auth.routes.ts:53) and premium is what writes that row
 * (recommendations.routes.ts:137 -> wefOrchestrator.ts:57), so the population
 * this route exists for is exactly the population it failed for.
 *
 * The full FK graph is enumerated in docs/erasure-dependent-list.md. Two rules
 * came out of it and both are load-bearing here:
 *
 * 1. DELETE BY OWNER, NOT BY PARENT ID. The old code deleted cvq_results inside
 *    a per-assessment loop keyed on assessment_id. cvq_results.assessment_id is
 *    NULLABLE (schema.ts:994) while its user_id is NOT NULL (:995), so a row
 *    written without an assessment was never reached by that loop and then
 *    blocked the users delete instead. Keying on the owner makes the list
 *    complete by construction rather than complete by inspection — which is the
 *    only durable defence against this bug class.
 *
 * 2. SUBJECT ROWS ARE ERASED; ACTOR ROWS ARE NOT. A row naming the user as the
 *    person who DID something belongs to someone else's audit trail. See
 *    collectBlockingAuditRecords below.
 */
export async function eraseUserData(tx: any, userId: string): Promise<void> {
  const owned = await tx
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.userId, userId));
  const assessmentIds: string[] = owned.map((a: { id: string }) => a.id);

  if (assessmentIds.length > 0) {
    const quizzes = await tx
      .select({ id: assessmentQuizzes.id })
      .from(assessmentQuizzes)
      .where(inArray(assessmentQuizzes.assessmentId, assessmentIds));
    const quizIds: string[] = quizzes.map((q: { id: string }) => q.id);

    if (quizIds.length > 0) {
      await tx.delete(quizResponses).where(inArray(quizResponses.assessmentQuizId, quizIds));
    }
    await tx.delete(assessmentQuizzes).where(inArray(assessmentQuizzes.assessmentId, assessmentIds));
    await tx.delete(recommendations).where(inArray(recommendations.assessmentId, assessmentIds));
  }

  // BOTH PREDICATES, for cvq_results and wef_competency_results alike, and
  // neither half is redundant:
  //
  //   user_id      catches rows whose assessment_id is null — the case the old
  //                per-assessment loop could not reach (rule 1 above).
  //   assessment_id catches rows pointing at an assessment being deleted here.
  //                 wef_competency_results.user_id is NULLABLE (schema.ts:402)
  //                 and IS null for rows written while the assessment was still
  //                 a guest assessment, so a user_id-only delete would miss
  //                 precisely what a guest-then-registered student accumulated —
  //                 and then fail on delete(assessments) exactly as before.
  const ownedBy = (userCol: any, assessmentCol: any) =>
    assessmentIds.length > 0
      ? or(eq(userCol, userId), inArray(assessmentCol, assessmentIds))
      : eq(userCol, userId);

  await tx.delete(cvqResults).where(ownedBy(cvqResults.userId, cvqResults.assessmentId));
  await tx.delete(wefCompetencyResults)
    .where(ownedBy(wefCompetencyResults.userId, wefCompetencyResults.assessmentId));

  // llm_narrative_cache CASCADEs on assessments (schema.ts:1960), and
  // password_reset_tokens CASCADEs on users (:89). Nothing to write for either.
  await tx.delete(assessments).where(eq(assessments.userId, userId));

  // CAPTURED BEFORE THE DELETE, because after it there is nothing left to say
  // which school this student belonged to. Self-deletion used to remove the
  // membership row and touch the school's licence counters not at all, so a
  // student who erased their account permanently burned one of their school's
  // seats — the leak recorded against position 4 in
  // docs/consent-implementation-recon.md. The counters are now derived from the
  // roster, so the fix is to recompute the roster this row just left rather than
  // to add a matching decrement somewhere.
  const memberships = await tx
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));

  await tx.delete(organizationMembers).where(eq(organizationMembers.userId, userId));

  for (const { organizationId } of memberships) {
    if (organizationId) {
      await storage.recomputeOrganizationLicenseUsage(organizationId, tx);
    }
  }

  await tx.delete(users).where(eq(users.id, userId));
}

/**
 * ROWS WHERE THE USER IS AN ACTOR, NOT THE SUBJECT.
 *
 * Each of these names the user as whoever performed an action recorded about a
 * school or about the platform. Erasing a school's activity log because its
 * admin exercised their own erasure right destroys someone else's record, so
 * this route refuses instead — a 409 naming what blocks it, rather than the
 * 23503-shaped 500 the same rows would otherwise produce.
 *
 * NO STUDENT CAN ACCUMULATE ANY OF THESE, verified per row in
 * docs/erasure-dependent-list.md §1c: organization_events.affected_user_id has
 * four write sites and all four target an admin; contributions are gated by
 * checkOrgAdmin; file upload is gated by isAdmin, which is superadmin. So
 * student and ordinary-account erasure runs the full sequence above and this
 * list comes back empty — which is the case the endpoint exists for.
 *
 * Making admin erasure work is a separate decision with a schema change behind
 * it: organizations.admin_user_id and organization_events.performed_by are both
 * NOT NULL with NO ACTION and cannot be nulled as they stand.
 */
export const BLOCKING_AUDIT_SOURCES: Array<{ table: any; column: any; label: string }> = [
  { table: organizations, column: organizations.adminUserId, label: "school records naming you as the registered administrator" },
  { table: organizationEvents, column: organizationEvents.performedBy, label: "school activity-log entries recording actions you performed" },
  { table: organizationEvents, column: organizationEvents.affectedUserId, label: "school activity-log entries recording actions taken on your admin account" },
  { table: files, column: files.uploadedBy, label: "files you uploaded" },
  { table: contributionSubmissions, column: contributionSubmissions.submittedByUserId, label: "question contributions you submitted" },
  { table: contributionSubmissions, column: contributionSubmissions.reviewedByUserId, label: "question contributions you reviewed" },
  { table: contributionRewards, column: contributionRewards.awardedByUserId, label: "contribution rewards you awarded" },
  { table: scoringConfigChangeLog, column: scoringConfigChangeLog.changedBy, label: "scoring-configuration changes you made" },
  { table: systemAnnouncements, column: systemAnnouncements.createdByUserId, label: "system announcements you created" },
  { table: systemConfig, column: systemConfig.updatedByUserId, label: "system settings you updated" },
];

export async function collectBlockingAuditRecords(tx: any, userId: string): Promise<string[]> {
  const blocking: string[] = [];
  for (const source of BLOCKING_AUDIT_SOURCES) {
    const rows = await tx
      .select({ id: source.column })
      .from(source.table)
      .where(eq(source.column, userId))
      .limit(1);
    if (rows.length > 0) blocking.push(source.label);
  }
  return blocking;
}

/**
 * DETACH — the student keeps their account and their report; the school lets go.
 *
 * This is what a graduating cohort needs, and it is deliberately NOT what
 * removal used to do by accident. Deleting the membership row on its own already
 * left the account and every assessment behind, which is why orphaned students
 * could still log in; the difference here is not which rows survive, it is that
 * the account type actually changes, the act is recorded, the school's licence
 * seat is released, and somebody chose it.
 *
 * THE CONSTRAINT THIS FUNCTION EXISTS TO HOLD, and the one most easily lost:
 * detaching preserves READ ACCESS TO WHAT ALREADY EXISTS. It must not hand the
 * student a new capability. Concretely, it must not silently turn them into a
 * free-tier user who can start fresh assessments — because the school's consent,
 * which is what made processing this minor lawful, ends here, and nothing has
 * replaced it. What a 13-18 year old self-consenting should require is an open
 * product question (FOLLOWUP: "the free flow's consent is a checkbox that
 * records nothing"), and detaching a cohort must not answer it by accident for
 * several hundred of them at once.
 *
 * That is why `detachedAt` is written rather than merely clearing the membership:
 * every read path already degrades correctly when the member row disappears
 * (auth.routes.ts:48, assessment.routes.ts:228, recommendations.routes.ts:98 all
 * optional-chain it), but the CREATE path degrades the wrong way — with no member
 * row, the school licence guard simply stops applying and the free-tier cap takes
 * over, which is a grant. assessment.routes.ts reads detachedAt to refuse that,
 * and that refusal is the whole point of the column.
 */
export async function detachUserFromOrganization(
  tx: any,
  userId: string,
  organizationName: string,
): Promise<void> {
  await tx.delete(organizationMembers).where(eq(organizationMembers.userId, userId));

  await tx
    .update(users)
    .set({
      // No longer a school's student. accountType is read in several places to
      // decide whether someone is acting on a school's behalf; leaving it as
      // 'org_student' after the school has gone would be a lie with consequences.
      accountType: "individual",
      isOrgGenerated: false,
      detachedAt: new Date(),
      detachedFromOrganizationName: organizationName,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
