import { describe, it, expect } from "vitest";
import { GUEST_ASSESSMENT_TTL_HOURS, guestAssessmentExpiresAt } from "./guestAssessmentExpiry";

describe("guestAssessmentExpiresAt", () => {
  it("adds GUEST_ASSESSMENT_TTL_HOURS to a Date completedAt", () => {
    const completedAt = new Date("2026-09-15T00:00:00.000Z");
    const expiresAt = guestAssessmentExpiresAt(completedAt);
    expect(expiresAt.getTime() - completedAt.getTime()).toBe(GUEST_ASSESSMENT_TTL_HOURS * 60 * 60 * 1000);
  });

  it("accepts an ISO string, same as a Date", () => {
    const iso = "2026-09-15T00:00:00.000Z";
    expect(guestAssessmentExpiresAt(iso).toISOString()).toBe(
      guestAssessmentExpiresAt(new Date(iso)).toISOString(),
    );
  });

  it("is exactly 72 hours — the client and the server must agree on this number", () => {
    expect(GUEST_ASSESSMENT_TTL_HOURS).toBe(72);
  });
});
