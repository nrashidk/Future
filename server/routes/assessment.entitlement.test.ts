/**
 * assessmentType flipped to 'premium' on POST/PATCH /api/assessments purely
 * because riasecResponses/cvqResponses was present in the request body — no
 * check that the caller was entitled. Both handlers relied on the client's
 * own isPremiumFlow gate, which is not a security boundary: a direct request
 * (or a guest, who never sees that gate at all) got premium scoring for free.
 *
 * isEntitledForPremiumAssessment is the fix — the handler-independent
 * decision, pinned here the same way resolveSchoolOwnedFields is pinned in
 * assessment.school-owned-fields.test.ts. Storage is mocked so importing
 * assessment.routes.ts does not pull in db.ts, which throws at import when
 * DATABASE_URL is unset (same pattern as that file).
 *
 * The case that matters most: isSchoolUser and isPremiumUser are INDEPENDENT
 * checks. A school student's users.isPremium column is false —
 * createUserWithCredentials never sets it — so a fix that checked only
 * users.isPremium would silently fail every school student, reintroducing
 * the exact bug resolveQuizTier (quiz.routes.ts) already fixed once for the
 * quiz distribution.
 */

import { describe, it, expect, vi } from "vitest";

const getOrganizationMemberByUserId = vi.fn();
const getUser = vi.fn();

vi.mock("../storage", () => ({
  storage: { getOrganizationMemberByUserId, getUser },
}));

const { isEntitledForPremiumAssessment } = await import("./assessment.routes");

describe("isEntitledForPremiumAssessment", () => {
  it("is false for a guest (null userId), with no DB lookup", async () => {
    const result = await isEntitledForPremiumAssessment(null);
    expect(result).toBe(false);
    expect(getOrganizationMemberByUserId).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("is true for a school student, even though users.isPremium is false", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce({ role: "student" });
    getUser.mockResolvedValueOnce({ isPremium: false });

    const result = await isEntitledForPremiumAssessment("student-1");
    expect(result).toBe(true);
  });

  it("is false for a school ADMIN's own member row — role must be 'student'", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce({ role: "admin" });
    getUser.mockResolvedValueOnce({ isPremium: false });

    const result = await isEntitledForPremiumAssessment("admin-1");
    expect(result).toBe(false);
  });

  it("is true for a self-paying premium individual with no org membership", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce(undefined);
    getUser.mockResolvedValueOnce({ isPremium: true });

    const result = await isEntitledForPremiumAssessment("premium-user-1");
    expect(result).toBe(true);
  });

  it("is false for a free individual account with no org membership", async () => {
    getOrganizationMemberByUserId.mockResolvedValueOnce(undefined);
    getUser.mockResolvedValueOnce({ isPremium: false });

    const result = await isEntitledForPremiumAssessment("free-user-1");
    expect(result).toBe(false);
  });
});
