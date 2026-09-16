/**
 * assessmentIsChildOwned — the timestamp gate shared by three call sites.
 * See the function's own doc comment for why it lives here and why it is
 * anchored on child_profiles.createdAt rather than
 * child_guardian_consents.createdAt.
 */
import { describe, it, expect } from "vitest";
import { assessmentIsChildOwned } from "./childOwnership";

describe("assessmentIsChildOwned", () => {
  const PROFILE_CREATED = "2026-09-10T12:00:00.000Z";

  it("is true for a record created after the child profile existed", () => {
    expect(assessmentIsChildOwned("2026-09-11T00:00:00.000Z", PROFILE_CREATED)).toBe(true);
  });

  it("is false for a record that predates the child profile — the account holder's own", () => {
    // The case this exists for: a free user's assessment, taken before they
    // ever registered a child, must not be silently relabelled as the
    // child's, either at write time or when the Career Journey collapses it.
    expect(assessmentIsChildOwned("2026-01-01T00:00:00.000Z", PROFILE_CREATED)).toBe(false);
  });

  // INCLUSIVE. Not reachable in practice — registration and every one of
  // these records' creation are always separate, sequential requests — but
  // the predicate is defined to be the same one the unconditional create-time
  // call relies on, where the child profile has necessarily already
  // committed by the time a brand-new record's timestamp is minted.
  it("is true at an exact tie", () => {
    expect(assessmentIsChildOwned(PROFILE_CREATED, PROFILE_CREATED)).toBe(true);
  });

  it("is false when there is no child profile at all", () => {
    expect(assessmentIsChildOwned("2026-09-11T00:00:00.000Z", null)).toBe(false);
    expect(assessmentIsChildOwned("2026-09-11T00:00:00.000Z", undefined)).toBe(false);
  });

  it("is false when the record's own createdAt is unknown", () => {
    expect(assessmentIsChildOwned(null, PROFILE_CREATED)).toBe(false);
  });

  it("accepts Date objects and ISO strings interchangeably", () => {
    expect(assessmentIsChildOwned(new Date("2026-09-11T00:00:00.000Z"), new Date(PROFILE_CREATED))).toBe(true);
    expect(assessmentIsChildOwned(new Date("2026-09-11T00:00:00.000Z"), PROFILE_CREATED)).toBe(true);
  });
});
