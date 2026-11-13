/**
 * POST /api/assessments — who may START an assessment without having paid.
 *
 * From 2026-09-16 an account with a child profile that had not paid was
 * refused 402 PAYMENT_REQUIRED here ("zero assessments before payment").
 * REVERSED BY THE OWNER ON 2026-11-13: a parent may register a student
 * account and stay free. That account is now bounded by FREE_ASSESSMENT_CAP
 * like any other free account, and these cases pin BOTH halves: it may start
 * one, and the cap still stops it. The paid-pool cases at the end are
 * unchanged.
 *
 * Storage is mocked so importing assessment.routes.ts does not pull in
 * db.ts, which throws at import when DATABASE_URL is unset.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const getOrganizationMemberByUserId = vi.fn();
const getUser = vi.fn();
const getChildProfileByGuardianUserId = vi.fn();
const countCompletedAssessmentsByUser = vi.fn();
const createAssessment = vi.fn();
const getLicenseCapacityForStudent = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getOrganizationMemberByUserId: (...a: any[]) => getOrganizationMemberByUserId(...a),
    getUser: (...a: any[]) => getUser(...a),
    getChildProfileByGuardianUserId: (...a: any[]) => getChildProfileByGuardianUserId(...a),
    countCompletedAssessmentsByUser: (...a: any[]) => countCompletedAssessmentsByUser(...a),
    createAssessment: (...a: any[]) => createAssessment(...a),
    getLicenseCapacityForStudent: (...a: any[]) => getLicenseCapacityForStudent(...a),
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
  // A pool with something left in it, so the licence check is not what any of
  // the payment-gate cases below are measuring. The exhausted case is asserted
  // explicitly at the end of this file.
  getLicenseCapacityForStudent.mockReset().mockResolvedValue({
    poolOwnerType: "user",
    guardianUserId: "u-1",
    availableRewardCredits: 0,
    availablePaidLicenses: 1,
    totalAvailable: 1,
    isUnlimited: false,
  });
});

describe("POST /api/assessments — free and paid accounts", () => {
  it("lets an unpaid account with a child profile START a free assessment", async () => {
    getUser.mockResolvedValue({ isPremium: false, detachedAt: null });
    getChildProfileByGuardianUserId.mockResolvedValue({
      id: "child-1",
      name: "Khaled",
      gender: "male",
      grade: "grade9",
      dateOfBirth: "2012-05-04",
      countryId: "ae",
      curriculum: "MOE National",
    });
    // On no pool (shared/licensePool.ts), so the capacity read answers null.
    getLicenseCapacityForStudent.mockResolvedValue(null);

    const { status, body } = await post();

    expect(status).toBe(200);
    expect(body.code).toBeUndefined();
    expect(createAssessment).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: the free cap still stops that account once it is spent", async () => {
    getUser.mockResolvedValue({ isPremium: false, detachedAt: null });
    getChildProfileByGuardianUserId.mockResolvedValue({
      id: "child-1",
      name: "Khaled",
      gender: "male",
      grade: "grade9",
      dateOfBirth: "2012-05-04",
      countryId: "ae",
      curriculum: "MOE National",
    });
    getLicenseCapacityForStudent.mockResolvedValue(null);
    countCompletedAssessmentsByUser.mockResolvedValue(3);

    const { status, body } = await post();

    expect(status).toBe(403);
    expect(body.code).toBe("FREE_ASSESSMENT_CAP_REACHED");
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

  /**
   * PAYING ONCE IS NO LONGER A SEASON TICKET.
   *
   * Being premium used to be the whole of the self-payer's entitlement: the
   * gate above was the only thing between a parent account and an unlimited
   * number of reports, because the limit function returned Infinity for any
   * premium account and nothing counted what was spent.
   *
   * A paid account now has a BALANCE, and an exhausted one is refused here --
   * with 402 rather than 403, because the remedy is to buy more. These two cases are what keep the distinction honest.
   */
  it("refuses a paid account whose pool is exhausted", async () => {
    getUser.mockResolvedValue({ isPremium: true, detachedAt: null });
    getChildProfileByGuardianUserId.mockResolvedValueOnce({
      id: "child-1", name: "Khaled", gender: "male", grade: "grade9",
      dateOfBirth: "2012-05-04", countryId: "ae", curriculum: "MOE National",
    });
    getLicenseCapacityForStudent.mockResolvedValue({
      poolOwnerType: "user", guardianUserId: "u-1",
      availableRewardCredits: 0, availablePaidLicenses: 0,
      totalAvailable: 0, isUnlimited: false,
    });

    const { status, body } = await post();

    expect(status).toBe(402);
    expect(body.code).toBe("NO_LICENCES_AVAILABLE");
    expect(createAssessment).not.toHaveBeenCalled();
  });

  it("lets an unlimited pool through regardless of balance", async () => {
    // organizations.is_unlimited_licenses — the superadmin override for pilots.
    getUser.mockResolvedValue({ isPremium: true, detachedAt: null });
    getChildProfileByGuardianUserId.mockResolvedValueOnce({
      id: "child-1", name: "Khaled", gender: "male", grade: "grade9",
      dateOfBirth: "2012-05-04", countryId: "ae", curriculum: "MOE National",
    });
    getLicenseCapacityForStudent.mockResolvedValue({
      poolOwnerType: "organization", organizationId: "org-1",
      availableRewardCredits: 0, availablePaidLicenses: Infinity,
      totalAvailable: Infinity, isUnlimited: true,
    });

    const { status } = await post();

    expect(status).toBe(200);
    expect(createAssessment).toHaveBeenCalledTimes(1);
  });
});
