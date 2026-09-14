/**
 * Deleting a school — one sequence, whichever endpoint asks.
 *
 * Two endpoints delete schools: DELETE /api/superadmin/organizations/:id and
 * POST /api/superadmin/organizations/bulk/delete. They did not do the same thing.
 * The single delete refused while students were enrolled and cleared admin
 * members, events, files and quiz_questions attribution in one transaction
 * before deleting the school. The bulk delete issued a bare DELETE FROM
 * organizations — 23503 for every school with a member, event, file or
 * contributed question, which is every real school — and for the one empty
 * school it could delete, then inserted an organization_deleted event against
 * the id it had just removed. That insert 23503'd after the delete had
 * committed, so a deleted school was reported as failed, and the operator's
 * retry got "Organization not found".
 *
 * Two paths behaving differently on the same destructive act is the defect; the
 * event ordering was its symptom. Both endpoints now call this, so there is one
 * answer to "what does deleting a school do", in the same shape as
 * accountErasure.ts for users.
 *
 * NO AUDIT ROW HERE YET. An organization_events row FKs to the organization and
 * cannot outlive it. The routes log to the console, which is honest about being
 * no record at all.
 */

import {
  organizations, organizationMembers, organizationEvents, files, quizQuestions,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type OrganizationDeletionOutcome =
  | { status: "deleted"; organizationName: string }
  | { status: "not_found" }
  | { status: "has_students"; organizationName: string; studentCount: number };

export async function deleteOrganizationWithDependents(
  db: any,
  orgId: string,
): Promise<OrganizationDeletionOutcome> {
  // ONE TRANSACTION. The single delete's steps were once five autocommit
  // statements, so a failure part-way left a school half-dismantled; the bulk
  // delete's two statements committed the delete before the insert that failed.
  // Inside a transaction a failure means nothing happened, so a caller that
  // reports failure is telling the truth.
  return db.transaction(async (tx: any) => {
    // LOCK THE SCHOOL ROW FIRST — the same lock enrolment takes
    // (storage.createUserWithCredentials). The student check and the member
    // delete below must see one roster: without the lock, a student enrolled
    // between them would have their membership deleted along with the admins',
    // which is exactly the side effect the refusal exists to prevent. With it,
    // an enrolment either commits first and this refuses, or waits and then
    // finds no school.
    const [org] = await tx
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .for("update");
    if (!org) return { status: "not_found" };

    // REFUSE WHILE STUDENTS ARE ENROLLED. Deleting a school and disposing of
    // its students' records are different acts, and deleting the school must
    // not perform the second as a side effect of the first. Removing member rows
    // here once left every student's account, assessments and results behind
    // with working credentials and no school. The removal endpoints answer that
    // per student, with 'erase' or 'detach' (admin.routes.ts); this routes the
    // superadmin there rather than guessing on their behalf.
    const students = await tx
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.role, "student")));
    if (students.length > 0) {
      return { status: "has_students", organizationName: org.name, studentCount: students.length };
    }

    // Admin membership rows only — the student check above already passed.
    await tx.delete(organizationMembers).where(eq(organizationMembers.organizationId, orgId));
    await tx.delete(organizationEvents).where(eq(organizationEvents.organizationId, orgId));
    await tx.delete(files).where(eq(files.organizationId, orgId));

    // quiz_questions.contributed_by_org_id is set when a superadmin approves a
    // contributed question (contribution.routes.ts) and has no cascade, so one
    // approved question held a school open forever.
    //
    // SET NULL rather than DELETE. The questions are shared bank content served
    // to every student regardless of school; removing them because the
    // contributing school closed would silently shrink the bank. The column has
    // one writer and no readers, so nulling it drops provenance only — left open
    // in docs/org-delete-student-disposition.md (sections 1 and 4.2).
    //
    // contribution_submissions and contribution_rewards CASCADE on the
    // organization, and organization_consents is ON DELETE SET NULL by design so
    // the consent record outlives the school it evidences. Nothing to write.
    await tx.update(quizQuestions)
      .set({ contributedByOrgId: null })
      .where(eq(quizQuestions.contributedByOrgId, orgId));

    await tx.delete(organizations).where(eq(organizations.id, orgId));
    return { status: "deleted", organizationName: org.name };
  });
}

export function enrolledStudentsMessage(organizationName: string, studentCount: number): string {
  return (
    `${organizationName} still has ${studentCount} enrolled student(s). Remove them from the ` +
    `school first, choosing for each whether to keep their account and report or delete ` +
    `their record — deleting the school cannot make that choice for them.`
  );
}
