/**
 * POST /api/assessments — the create-side half of "zero assessments before
 * payment for a parent-registers account" (shared/assessmentLimits.ts's
 * requiresPaymentBeforeAssessment; recommendations.routes.ts's generation
 * guard is the other half, pinned separately in
 * recommendations.paymentGate.test.ts — see that file for why both exist).
 *
 * Distinguishes "refused by the payment gate" (402/PAYMENT_REQUIRED, before
 * storage.createAssessment is ever called) from every other population this
 * same handler serves, so a regression that widens or narrows the gate's
 * condition shows up as a status-code change here rather than only in a
 * comment.
 *
 * Storage is mocked so importing assessment.routes.ts does not pull in
 * db.ts, which throws at import when DATABASE_URL is unset — same pattern as
 * assessment.entitlement.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const getOrganizationMemberByUserId = vi.fn();
const getUser = vi.fn();
const getChildProfileByGuardianUserId = vi.fn();
const countCompletedAssessmentsByUser = vi.fn();
const createAssessment = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getOrganizationMemberByUserId: (...a: any[]) => getOrganizationMemberByUserId(...a),
    getUser: (...a: any[]) => getUser(...a),
    getChildProfileByGuardianUserId: (...a: any[]) => getChildProfileByGuardianUserId(...a),
    countCompletedAssessmentsByUser: (...a: any[]) => countCompletedAssessmentsByUser(...a),
    createAssessment: (...a: any[]) => createAssessment(...a),
  },
}));

// Fire-and-forget after res.json() (see the route's own comment) — mocked so
// it never touches the real DB from inside this test.
vi.mock("../services/guestAssessmentExpiry", () => ({
  sweepExpiredGuestAssessmentsIfDue: vi.fn().mockResolvedValue(undefined),
}));

const { registerAssessmentRoutes } = await import("./assessment.routes");

// Minimal body that clears insertAssessmentSchema (favoriteSubjects/interests
// are the only NOT NULL columns without a default) and validatePromptInputFields's
// create-only 3-subject minimum. All three are real canonical subjects
// (DEFAULT_CANONICAL_SUBJECTS), so the DB-backed whitelist lookup — which
// fails closed to the static list when storage has no getAllSubjects mock —
// still accepts them.
const VALID_BODY = {
  favoriteSubjects: ["Mathematics", "Science", "English"],
  interests: ["reading"],
};

async function post(): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { userId: "u-1" };
    next();
  });
  registerAssessmentRoutes(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  getOrganizationMemberByUserId.mockReset().mockResolvedValue(undefined); // not a school student
  getUser.mockReset();
  getChildProfileByGuardianUserId.mockReset();
  countCompletedAssessmentsByUser.mockReset().mockResolvedValue(0);
  createAssessment.mockReset().mockResolvedValue({ id: "new-a-1" });
});

describe("POST /api/assessments — payment gate", () => {
  it("refuses a registered-but-unpaid parent-registers account with 402, before creating anything", async () => {
    getUser.mockResolvedValue({ isPremium: false, detachedAt: null });
    getChildProfileByGuardianUserId.mockResolvedValueOnce({
      id: "child-1",
      name: "Khaled",
      gender: "male",
      grade: "grade9",
      dateOfBirth: "2012-05-04",
      countryId: "ae",
      curriculum: "MOE National",
    });

    const { status, body } = await post();

    expect(status).toBe(402);
    expect(body.code).toBe("PAYMENT_REQUIRED");
    expect(createAssessment).not.toHaveBeenCalled();
  });

  it("does NOT gate an account with no child profile — falls through to the free-tier cap instead", async () => {
    getUser.mockResolvedValue({ isPremium: false, detachedAt: null });
    getChildProfileByGuardianUserId.mockResolvedValueOnce(undefined);

    const { status } = await post();

    expect(status).toBe(200);
    expect(createAssessment).toHaveBeenCalledTimes(1);
  });

  it("bypasses the gate once the account has paid (isPremium true), even with a child profile", async () => {
    getUser.mockResolvedValue({ isPremium: true, detachedAt: null });
    getChildProfileByGuardianUserId.mockResolvedValueOnce({
      id: "child-1",
      name: "Khaled",
      gender: "male",
      grade: "grade9",
      dateOfBirth: "2012-05-04",
      countryId: "ae",
      curriculum: "MOE National",
    });

    const { status } = await post();

    expect(status).toBe(200);
    expect(createAssessment).toHaveBeenCalledTimes(1);
  });

  it("FREE_ASSESSMENT_CAP no longer governs this population: even zero prior completions still 402s with a child profile and no payment", async () => {
    getUser.mockResolvedValue({ isPremium: false, detachedAt: null });
    getChildProfileByGuardianUserId.mockResolvedValueOnce({
      id: "child-1",
      name: "Khaled",
      gender: "male",
      grade: "grade9",
      dateOfBirth: "2012-05-04",
      countryId: "ae",
      curriculum: "MOE National",
    });

    const { status, body } = await post();

    expect(status).toBe(402);
    expect(body.code).not.toBe("FREE_ASSESSMENT_CAP_REACHED");
    // The old cap check is never reached for this population any more.
    expect(countCompletedAssessmentsByUser).not.toHaveBeenCalled();
  });
});
