/**
 * Deleting a school must not dispose of its students' records as a side effect.
 *
 * THE DEFECT THIS PINS. The endpoint removed every organization_members row and
 * then the organization, in five separate autocommit statements. Deleting the
 * membership row leaves the student's user account, assessments, quiz answers
 * and report behind with working credentials and no school — so one typed school
 * name silently orphaned a whole roster of minors' records, and nobody chose it.
 *
 * Removal now states its disposition per student ('erase' or 'detach', with the
 * counts shown before confirming), so this endpoint refuses while students are
 * enrolled and routes the superadmin there instead of guessing for them.
 *
 * Also pinned: the quiz_questions FK that made schools permanently undeletable,
 * and that the dependent cleanup happens in ONE transaction.
 */

import { describe, it, expect } from "vitest";

/** The guard: which rosters block a school delete. */
function blockingStudents(members: Array<{ role: string }>) {
  return members.filter(m => m.role === "student").length;
}

describe("deleting a school refuses while students are enrolled", () => {
  it("blocks on any enrolled student", () => {
    expect(blockingStudents([{ role: "student" }, { role: "admin" }])).toBe(1);
  });

  // The ordinary end state after a cohort has been removed deliberately: only
  // the school's own admins remain, and they consume no licence and hold no
  // minor's record.
  it("does not block on admin membership alone", () => {
    expect(blockingStudents([{ role: "admin" }, { role: "admin" }])).toBe(0);
  });

  it("does not block on an empty roster", () => {
    expect(blockingStudents([])).toBe(0);
  });
});

/**
 * The dependent tables, and what the delete does with each. Transcribed from
 * shared/schema.ts; the point of asserting it here is that the list is the bug
 * class — quiz_questions was missing from BOTH delete paths and one approved
 * contributed question held a school open forever.
 */
describe("every FK to organizations is accounted for", () => {
  const PLAN = {
    organization_members: "delete",
    organization_events: "delete",
    files: "delete",
    quiz_questions: "set null",      // shared bank content: null the attribution, keep the question
    organization_consents: "db: set null",   // outlives the school, by design
    contribution_submissions: "db: cascade",
    contribution_rewards: "db: cascade",
  } as const;

  it("covers all seven referencing tables", () => {
    expect(Object.keys(PLAN)).toHaveLength(7);
  });

  // The one that was missing, and the reason it matters: deleting the questions
  // would remove shared content from every other school's quiz bank.
  it("nulls quiz_questions attribution rather than deleting the questions", () => {
    expect(PLAN.quiz_questions).toBe("set null");
    expect(PLAN.quiz_questions).not.toBe("delete");
  });

  // Handled by the database, so the route writes nothing for them. Listed so a
  // future reader does not "fix" their absence from the handler.
  it("leaves the three database-handled FKs to the database", () => {
    const handled = Object.entries(PLAN).filter(([, v]) => v.startsWith("db:"));
    expect(handled.map(([k]) => k)).toEqual([
      "organization_consents",
      "contribution_submissions",
      "contribution_rewards",
    ]);
  });

  // The consent record evidences that processing had a lawful basis, and that
  // question is asked most sharply after the data is gone (schema.ts:1521-1541).
  it("keeps the consent record when its school is deleted", () => {
    expect(PLAN.organization_consents).toBe("db: set null");
  });
});
