/**
 * POST /api/recommendations/generate/:assessmentId — who may COMPLETE an
 * assessment without having paid. The generation-side half of
 * assessment.paymentGate.test.ts; see that file for the 2026-11-13 reversal
 * of "zero assessments before payment".
 *
 * Uses a deliberately incomplete assessment: a caller the guards let through
 * is refused by the COMPLETENESS gate (400), a later and different check,
 * which proves they got past the guards rather than merely not tripping one.
 *
 * db.ts throws at import when DATABASE_URL is unset, and this route module
 * imports it — mocked for that reason alone.
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

describe("POST /api/recommendations/generate/:assessmentId — free and paid accounts", () => {
  it("lets an unpaid account with a child profile through to the completeness check", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce(undefined);
    getUser.mockResolvedValueOnce({ isPremium: false });
    getChildProfileByGuardianUserId.mockResolvedValue({ id: "child-1" });
    countCompletedAssessmentsByUser.mockResolvedValueOnce(0);

    const { status, body } = await generate();

    expect(status).toBe(400);
    expect(body.code).toBeUndefined();
    expect(body.message).toMatch(/Assessment incomplete/);
  });

  it("CONTROL: the free cap still refuses it, counting OTHER completed assessments", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce(undefined);
    getUser.mockResolvedValueOnce({ isPremium: false });
    getChildProfileByGuardianUserId.mockResolvedValue({ id: "child-1" });
    countCompletedAssessmentsByUser.mockResolvedValueOnce(3);

    const { status, body } = await generate();

    expect(status).toBe(403);
    expect(body.code).toBe("FREE_ASSESSMENT_CAP_REACHED");
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
  });

  it("bypasses the gate entirely for a school student, regardless of isPremium", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce({ role: "student" });
    getUser.mockResolvedValueOnce({ isPremium: false });

    const { status, body } = await generate();

    expect(status).toBe(400); // completeness gate, not the payment gate
    expect(body.message).toMatch(/Assessment incomplete/);
  });
});
