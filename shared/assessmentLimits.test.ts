/**
 * The two assessment limits, and who each one binds.
 *
 * The defect this pins: Assessment.tsx redirected every authenticated
 * non-premium, non-school user to /tier-selection, so a free account could not
 * take the assessment at all — including a user who had just recovered their
 * account by password reset, who was answered with a pricing page. Removing that
 * redirect makes the cap the only thing standing between a free account and
 * unlimited completions, so the cap's population rules are worth pinning.
 *
 * The rule these encode: the school allocation and the free cap are DIFFERENT
 * concepts that happen to share a shape, and a self-paying premium account is
 * bound by neither (its limit is users.purchasedLicenses, which this module
 * deliberately does not model).
 */

import { describe, it, expect } from "vitest";
import {
  SCHOOL_ALLOCATIONS_PER_STUDENT,
  FREE_ASSESSMENT_CAP,
  assessmentLimitFor,
  isFreeTierCapReached,
  requiresPaymentBeforeAssessment,
} from "./assessmentLimits";

describe("assessment limits", () => {
  it("keeps the two limits distinct", () => {
    // Not an arbitrary assertion: if these ever become equal, the next reader is
    // one step from "merge them", which is what the module docblock forbids.
    expect(SCHOOL_ALLOCATIONS_PER_STUDENT).not.toBe(FREE_ASSESSMENT_CAP);
  });

  describe("assessmentLimitFor", () => {
    it("gives a school student their allocation", () => {
      expect(assessmentLimitFor(true, false)).toBe(SCHOOL_ALLOCATIONS_PER_STUDENT);
    });

    it("gives a free account the cap", () => {
      expect(assessmentLimitFor(false, false)).toBe(FREE_ASSESSMENT_CAP);
    });

    it("does not model a self-paying premium account's limit", () => {
      expect(assessmentLimitFor(false, true)).toBe(Infinity);
    });

    it("treats school membership as winning over the isPremium decoration", () => {
      // auth.routes.ts decorates isPremium=true onto a school student's response
      // while the column stays false (quiz.routes.ts:86-105). Either way they
      // must get the school allocation, never the free cap.
      expect(assessmentLimitFor(true, true)).toBe(SCHOOL_ALLOCATIONS_PER_STUDENT);
    });
  });

  describe("isFreeTierCapReached", () => {
    it("is false below the cap and true at it", () => {
      expect(isFreeTierCapReached(false, false, FREE_ASSESSMENT_CAP - 1)).toBe(false);
      expect(isFreeTierCapReached(false, false, FREE_ASSESSMENT_CAP)).toBe(true);
    });

    it("stays true above the cap", () => {
      // Reachable: two tabs racing the create guard. The generation guard is
      // what keeps this from compounding, and it must not flip back to false.
      expect(isFreeTierCapReached(false, false, FREE_ASSESSMENT_CAP + 5)).toBe(true);
    });

    it("never applies the free cap to a school student", () => {
      expect(isFreeTierCapReached(true, false, FREE_ASSESSMENT_CAP + 10)).toBe(false);
    });

    it("never applies the free cap to a premium account", () => {
      expect(isFreeTierCapReached(false, true, FREE_ASSESSMENT_CAP + 10)).toBe(false);
    });

    it("counts zero completions as not capped", () => {
      expect(isFreeTierCapReached(false, false, 0)).toBe(false);
    });
  });

  describe("requiresPaymentBeforeAssessment", () => {
    // Decided 2026-09-16: zero assessments before payment for a
    // parent-registers account, replacing FREE_ASSESSMENT_CAP for this
    // population. See the function's own doc comment for why it is not a
    // third argument to isFreeTierCapReached.
    it("refuses a parent-registers account that has not paid", () => {
      expect(requiresPaymentBeforeAssessment(true, false)).toBe(true);
    });

    it("does not apply once the account is premium", () => {
      expect(requiresPaymentBeforeAssessment(true, true)).toBe(false);
    });

    it("does not apply to an account with no child profile at all", () => {
      // The plain free-tier population — untouched, still governed by
      // isFreeTierCapReached/FREE_ASSESSMENT_CAP, not this function.
      expect(requiresPaymentBeforeAssessment(false, false)).toBe(false);
    });

    it("is false for a premium account with no child profile too", () => {
      expect(requiresPaymentBeforeAssessment(false, true)).toBe(false);
    });
  });
});
