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
 * THE RECORD is an organization_deletions row, written inside the same
 * transaction as the delete, so it exists if and only if the deletion committed.
 * It cannot be an organization_events row: that table FKs to the organization
 * and its rows are removed with it.
 */

import {
  organizations, organizationMembers, organizationEvents, files, quizQuestions,
  organizationDeletions,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type OrganizationDeletionOutcome =
  | { status: "deleted"; organizationName: string }
  | { status: "not_found" }
  | { status: "has_students"; organizationName: string; studentCount: number };

export type OrganizationDeletionPerformer = {
  userId: string;
  role: string;
  name: string;
  email: string | null;
};

/**
 * Who is deleting, captured as values rather than only an id: the record keeps
 * the name and email after the account is gone, as organization_consents does.
 */
export function performerFrom(user: any, role = "superadmin"): OrganizationDeletionPerformer {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || user?.id;
  return { userId: user.id, role, name, email: user?.email ?? null };
}

export async function deleteOrganizationWithDependents(
  db: any,
  orgId: string,
  performer: OrganizationDeletionPerformer,
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
    const members = await tx.delete(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId))
      .returning({ id: organizationMembers.id });
    const events = await tx.delete(organizationEvents)
      .where(eq(organizationEvents.organizationId, orgId))
      .returning({ id: organizationEvents.id });
    const removedFiles = await tx.delete(files)
      .where(eq(files.organizationId, orgId))
      .returning({ id: files.id });

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
    const questions = await tx.update(quizQuestions)
      .set({ contributedByOrgId: null })
      .where(eq(quizQuestions.contributedByOrgId, orgId))
      .returning({ id: quizQuestions.id });

    await tx.delete(organizations).where(eq(organizations.id, orgId));

    // Same transaction as the delete above: if this insert fails, the school is
    // not deleted either. The performer's name and email outlive their own
    // erasure by decision, not by accident — FOLLOWUP.md, "ORGANIZATION DELETION
    // RECORD — DECIDED 2026-09-14".
    await tx.insert(organizationDeletions).values({
      organizationId: org.id,
      organizationName: org.name,
      performedBy: performer.userId,
      performedByRole: performer.role,
      performedByName: performer.name,
      performedByEmail: performer.email,
      adminMembersRemoved: members.length,
      eventsRemoved: events.length,
      filesRemoved: removedFiles.length,
      questionsDetached: questions.length,
    });

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
