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
  FREE_ASSESSMENT_CAP,
  assessmentLimitFor,
  isFreeTierCapReached,
} from "./assessmentLimits";

describe("assessment limits", () => {
  describe("assessmentLimitFor", () => {
    it("gives a pooled school student their pool balance", () => {
      expect(assessmentLimitFor(true, false, 4)).toBe(4);
    });

    it("gives a pooled self-payer their pool balance", () => {
      expect(assessmentLimitFor(false, true, 2)).toBe(2);
    });

    it("gives a free account the cap, ignoring any balance passed", () => {
      expect(assessmentLimitFor(false, false)).toBe(FREE_ASSESSMENT_CAP);
      expect(assessmentLimitFor(false, false, 99)).toBe(FREE_ASSESSMENT_CAP);
    });

    it("treats null as an unlimited pool", () => {
      // The superadmin override used for pilots and MOUs
      // (organizations.is_unlimited_licenses).
      expect(assessmentLimitFor(true, false, null)).toBe(Infinity);
    });

    /**
     * THE REGRESSION THIS FILE EXISTS FOR, both halves of it.
     *
     * A self-paying account used to return Infinity unconditionally -- one
     * purchase bought unlimited reports, because nothing counted consumption.
     * A school student used to return a hardcoded 1, capping them at a single
     * assessment for life with no way to grant another.
     *
     * Neither is reachable now: both populations return a balance, and an
     * exhausted pool is zero rather than unlimited.
     */
    it("returns zero for an exhausted pool, never unlimited", () => {
      expect(assessmentLimitFor(false, true, 0)).toBe(0);
      expect(assessmentLimitFor(true, false, 0)).toBe(0);
    });

    it("fails closed when the balance is unknown", () => {
      // An unresolved balance must not render as an entry point the server is
      // about to refuse.
      expect(assessmentLimitFor(true, false, undefined)).toBe(0);
      expect(assessmentLimitFor(false, true, undefined)).toBe(0);
    });

    it("treats school membership as winning over the isPremium decoration", () => {
      // auth.routes.ts decorates isPremium=true onto a school student's response
      // while the column stays false (quiz.routes.ts:86-105). Either way they
      // are pooled, never on the free cap.
      expect(assessmentLimitFor(true, true, 3)).toBe(3);
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
});
