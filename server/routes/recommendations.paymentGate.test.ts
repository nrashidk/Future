/**
 * POST /api/recommendations/generate/:assessmentId — the generation-side half
 * of "zero assessments before payment for a parent-registers account"
 * (shared/assessmentLimits.ts's requiresPaymentBeforeAssessment,
 * assessment.routes.ts's create guard is the other half).
 *
 * WHY THIS GUARD EXISTS SEPARATELY FROM THE CREATE GUARD, pinned rather than
 * just commented: an assessment CREATED before this rule shipped (or created
 * by a race that slipped past the create guard) must not become COMPLETABLE
 * by a still-unpaid account just because the create guard doesn't run again.
 * The two guards are independent code paths reading the same pure function,
 * so a regression in one is invisible from a test that only exercises the
 * other.
 *
 * Distinguishes "refused by the gate" (402/PAYMENT_REQUIRED, before the
 * completeness check ever runs) from "bypassed the gate" by using a
 * deliberately incomplete assessment: bypassing callers (premium, school
 * student) still get refused, but by the COMPLETENESS gate (400), which is a
 * different and later check — proving they got past the payment gate rather
 * than merely not tripping some other guard.
 *
 * db.ts throws at import when DATABASE_URL is unset, and this route module
 * imports it for its education-pathways/career-reasoning handlers — mocked
 * for that reason alone, not because this test touches it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

vi.mock("../db", () => ({ db: {} }));

const getAssessmentById = vi.fn();
const getUser = vi.fn();
const getOrganizationMemberByUserId = vi.fn();
const getChildProfileByGuardianUserId = vi.fn();
const getCvqResultByAssessmentId = vi.fn();
const countCompletedAssessmentsByUser = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getAssessmentById: (...a: any[]) => getAssessmentById(...a),
    getUser: (...a: any[]) => getUser(...a),
    getOrganizationMemberByUserId: (...a: any[]) => getOrganizationMemberByUserId(...a),
    getChildProfileByGuardianUserId: (...a: any[]) => getChildProfileByGuardianUserId(...a),
    getCvqResultByAssessmentId: (...a: any[]) => getCvqResultByAssessmentId(...a),
    countCompletedAssessmentsByUser: (...a: any[]) => countCompletedAssessmentsByUser(...a),
  },
}));

vi.mock("../middleware/rateLimiter.middleware", () => ({
  recommendationsLimiter: (_req: any, _res: any, next: any) => next(),
  printableRecommendationsLimiter: (_req: any, _res: any, next: any) => next(),
  pdfLimiter: (_req: any, _res: any, next: any) => next(),
}));

const { registerRecommendationsRoutes } = await import("./recommendations.routes");

// DELIBERATELY INCOMPLETE — no favoriteSubjects/interests/riasecScores etc.
// collectMissingComponents will always find something missing, so any caller
// that gets PAST the payment gate lands on the 400 completeness response
// instead, never on a real (and here, unmockable) LLM generation run.
const BASIC_ASSESSMENT = {
  id: "a-1",
  userId: "u-1",
  guestSessionId: null,
  assessmentType: "basic",
};

async function generate(): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { userId: "u-1" };
    next();
  });
  registerRecommendationsRoutes(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/recommendations/generate/a-1`, {
      method: "POST",
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  getAssessmentById.mockReset().mockResolvedValue(BASIC_ASSESSMENT);
  getUser.mockReset();
  getOrganizationMemberByUserId.mockReset();
  getChildProfileByGuardianUserId.mockReset();
  getCvqResultByAssessmentId.mockReset().mockResolvedValue(null);
  countCompletedAssessmentsByUser.mockReset();
});

describe("POST /api/recommendations/generate/:assessmentId — payment gate", () => {
  it("refuses a registered-but-unpaid parent-registers account with 402, before the completeness check", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce(undefined);
    getUser.mockResolvedValueOnce({ isPremium: false });
    getChildProfileByGuardianUserId.mockResolvedValueOnce({ id: "child-1" });

    const { status, body } = await generate();

    expect(status).toBe(402);
    expect(body.code).toBe("PAYMENT_REQUIRED");
    expect(getCvqResultByAssessmentId).not.toHaveBeenCalled();
  });

  it("does NOT gate an account with no child profile — falls through to the free-tier cap / completeness check instead", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce(undefined);
    getUser.mockResolvedValueOnce({ isPremium: false });
    getChildProfileByGuardianUserId.mockResolvedValueOnce(undefined);
    countCompletedAssessmentsByUser.mockResolvedValueOnce(0);

    const { status, body } = await generate();

    expect(status).toBe(400);
    expect(body.code).toBeUndefined();
    expect(body.message).toMatch(/Assessment incomplete/);
  });

  it("bypasses the gate once the account has paid (isPremium true) — the whole child-profile lookup is skipped, not just refused", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce(undefined);
    getUser.mockResolvedValueOnce({ isPremium: true });

    const { status, body } = await generate();

    expect(status).toBe(400); // completeness gate, not the payment gate
    expect(body.message).toMatch(/Assessment incomplete/);
    // isPremiumUser true short-circuits the `!isSchoolStudent && !isPremiumUser`
    // guard entirely — a paid account's gate check costs no lookup at all.
    expect(getChildProfileByGuardianUserId).not.toHaveBeenCalled();
  });

  it("bypasses the gate entirely for a school student, regardless of isPremium", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce({ role: "student" });
    getUser.mockResolvedValueOnce({ isPremium: false });

    const { status, body } = await generate();

    expect(status).toBe(400); // completeness gate, not the payment gate
    expect(body.message).toMatch(/Assessment incomplete/);
    expect(getChildProfileByGuardianUserId).not.toHaveBeenCalled();
  });
});
