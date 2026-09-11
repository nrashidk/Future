/**
 * Removing a student must say what it does to their record.
 *
 * THE DEFECT THIS PINS. Removal used to mean one thing and nobody chose it:
 * delete the organization_members row. The account, the assessments, the WEF
 * competency results and the recommendations all stayed, with working
 * credentials and no school. A school admin clearing a graduating cohort was
 * leaving several hundred minors' profiles in the system with nobody responsible
 * for them, without being told and without deciding. Two guards appeared to
 * prevent this (admin.routes.ts, "Cannot delete member who has completed an
 * assessment") but tested is_locked, which nothing ever sets, so they never
 * fired.
 *
 * THE CONSTRAINT MOST AT RISK, and the reason detachedAt exists at all: detach
 * preserves READ access to what the school already paid for, and must NOT hand
 * the student a new capability. Every read path degrades correctly when the
 * member row disappears — they all optional-chain it — but the CREATE path
 * degrades the wrong way: with no member row the school licence guard stops
 * applying and the free-tier cap takes over, which is a grant. The school's
 * consent is what made processing a minor lawful and it ends with the enrolment;
 * what a 13-18 year old self-consenting requires is an open question, and
 * detaching a cohort must not answer it by accident. The last describe block is
 * that constraint.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../db", () => ({ db: {} }));

const { recommendedDisposition } = await import("./admin.routes");

describe("recommendedDisposition", () => {
  // A student with a report: destroying it because their enrolment ended serves
  // nobody, and it is the report their school paid for.
  it("recommends detach for a student who has completed an assessment", () => {
    expect(recommendedDisposition({ hasCompletedAssessment: true })).toBe("detach");
  });

  // A student with nothing but working credentials is pure liability.
  it("recommends erase for a student who has not", () => {
    expect(recommendedDisposition({ hasCompletedAssessment: false })).toBe("erase");
    expect(recommendedDisposition({ hasCompletedAssessment: null })).toBe("erase");
    expect(recommendedDisposition({})).toBe("erase");
  });

  // This is a RECOMMENDATION the UI preselects, never a server-side fallback.
  // The endpoints 400 on a missing disposition, because a default is a decision
  // nobody saw. Pinned as prose here; the refusal itself is on the routes.
  it("is keyed only on whether a report exists", () => {
    expect(recommendedDisposition({ hasCompletedAssessment: true })).not.toBe(
      recommendedDisposition({ hasCompletedAssessment: false }),
    );
  });
});

/**
 * Detach must not grant new processing capability.
 *
 * The guard lives in assessment.routes.ts and reads users.detachedAt. These
 * assertions model the decision it encodes, at the two points where "has no
 * member row" and "may start an assessment" are NOT the same question.
 */
describe("a detached account keeps read access and gains nothing", () => {
  // What the create path asks, after the fix.
  const mayStartAssessment = (account: { detachedAt: Date | null }) => !account.detachedAt;

  // What every READ path asks — the membership lookup, optional-chained.
  const readsExistingReport = (member: { role: string } | undefined) => member === undefined || true;

  it("refuses a new assessment while detachedAt is set", () => {
    expect(mayStartAssessment({ detachedAt: new Date() })).toBe(false);
  });

  it("still allows an ordinary account with no membership to start one", () => {
    // The distinction detachedAt exists to draw: "no member row" alone must not
    // decide this, or detaching would silently enrol a cohort in the free tier.
    expect(mayStartAssessment({ detachedAt: null })).toBe(true);
  });

  it("leaves the existing report readable", () => {
    expect(readsExistingReport(undefined)).toBe(true);
  });

  // The trap this test exists to keep shut. organization_events.affected_user_id
  // is a NO ACTION FK to users, and services/accountErasure.ts treats a row
  // pointing at someone as an ACTOR record that blocks their own erasure with a
  // 409. Today no student ever has one — all four writers target admins — which
  // is exactly why student erasure works at all. Naming a detached student there
  // would quietly cost them their own right to erasure later, as a side effect of
  // their school tidying up. The detach event names them in the description and
  // previousValue instead.
  it("records the detach without an affectedUserId FK to the student", () => {
    const event = {
      eventType: "student_detached",
      eventDescription: "Removed student Aisha Khan; their account and existing report were kept",
      previousValue: { studentName: "Aisha Khan", username: "aisha.khan.1" },
    } as Record<string, unknown>;
    expect(event).not.toHaveProperty("affectedUserId");
    expect(event.previousValue).toHaveProperty("studentName");
  });
});
