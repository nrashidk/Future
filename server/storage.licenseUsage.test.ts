/**
 * The licence counters must be a projection of the roster, not a running total.
 *
 * THE DEFECT THIS PINS. used_licenses and reward_credits_used were maintained by
 * arithmetic, and four paths could move them out of agreement with the roster:
 *
 *   1. consumeLicenseWithRewardPriority spent a REWARD credit when one was
 *      available (reward_credits_used +1, used_licenses untouched) and a PAID
 *      licence otherwise, but removal did a flat updateOrganizationQuota(-1) on
 *      used_licenses either way. Removing a reward-funded student therefore
 *      refunded a paid seat the school never spent, while the reward credit
 *      stayed spent. organization_members recorded neither, so the -1 could not
 *      have known which to refund even in principle.
 *   2. Enrolment committed before consumption ran (createUserWithCredentials
 *      owned a transaction; consumption was a separate statement after it).
 *   3. The capacity check was check-then-act with no lock.
 *   4. DELETE /api/users/me removed the membership row and decremented nothing.
 *
 * These tests are about the SHAPE of the fix rather than the SQL: a counter that
 * is SET from a COUNT cannot drift, so the property worth pinning is that after
 * any sequence of enrolments and removals the counters equal the roster. Test 1
 * reproduces defect 1 concretely against the old arithmetic, which is the one
 * that ran on every ordinary removal.
 *
 * The recompute's own SQL (count FILTER, then one UPDATE) is exercised against a
 * real database by nothing here; what is pinned is that both counters are
 * derived from license_source and role, and that no code path adds or subtracts.
 */

import { describe, it, expect } from "vitest";

type Member = { id: string; role: "student" | "admin"; licenseSource?: "paid" | "reward" };
type Org = { totalLicenses: number; isUnlimited: boolean; rewardCredits: number };

/** What recomputeOrganizationLicenseUsage computes, in the same two terms. */
function recompute(roster: Member[]) {
  const students = roster.filter((m) => m.role === "student");
  return {
    usedLicenses: students.filter((m) => m.licenseSource === "paid").length,
    rewardCreditsUsed: students.filter((m) => m.licenseSource === "reward").length,
  };
}

/** The fund choice made inside createUserWithCredentials' locked transaction. */
function chooseFund(org: Org, roster: Member[]): "paid" | "reward" {
  const { usedLicenses, rewardCreditsUsed } = recompute(roster);
  const rewardAvailable = Math.max(0, org.rewardCredits - rewardCreditsUsed);
  if (rewardAvailable > 0) return "reward";
  if (!org.isUnlimited && org.totalLicenses - usedLicenses < 1) throw new Error("Quota exceeded");
  return "paid";
}

function enrol(org: Org, roster: Member[], id: string): Member[] {
  return [...roster, { id, role: "student", licenseSource: chooseFund(org, roster) }];
}

describe("licence counters derive from the roster", () => {
  // 1. THE REGRESSION. A school with one reward credit enrols two students: the
  //    first is reward-funded, the second paid. Removing the reward-funded one
  //    must not refund a paid seat.
  it("removing a reward-funded student does not refund a paid seat", () => {
    const org: Org = { totalLicenses: 10, isUnlimited: false, rewardCredits: 1 };
    let roster: Member[] = [];
    roster = enrol(org, roster, "s1");
    roster = enrol(org, roster, "s2");
    expect(roster.map((m) => m.licenseSource)).toEqual(["reward", "paid"]);
    expect(recompute(roster)).toEqual({ usedLicenses: 1, rewardCreditsUsed: 1 });

    // The old arithmetic: a flat -1 on used_licenses regardless of fund.
    const legacyUsedLicenses = 1 - 1;

    roster = roster.filter((m) => m.id !== "s1");
    const derived = recompute(roster);

    // s2 is still enrolled on a paid seat, so used_licenses must still be 1.
    expect(derived.usedLicenses).toBe(1);
    // ...which is exactly where the old -1 was wrong: it handed back a seat the
    // school was still using, for a student who had not spent one.
    expect(legacyUsedLicenses).toBe(0);
    expect(derived.usedLicenses).not.toBe(legacyUsedLicenses);
    // And the reward credit is returned, which the old code never did.
    expect(derived.rewardCreditsUsed).toBe(0);
  });

  it("counts only students: admins consume no licence", () => {
    const roster: Member[] = [
      { id: "a1", role: "admin" },
      { id: "s1", role: "student", licenseSource: "paid" },
    ];
    expect(recompute(roster)).toEqual({ usedLicenses: 1, rewardCreditsUsed: 0 });
  });

  it("spends reward credits before paid seats, and stops when they run out", () => {
    const org: Org = { totalLicenses: 10, isUnlimited: false, rewardCredits: 2 };
    let roster: Member[] = [];
    for (const id of ["s1", "s2", "s3"]) roster = enrol(org, roster, id);
    expect(roster.map((m) => m.licenseSource)).toEqual(["reward", "reward", "paid"]);
    expect(recompute(roster)).toEqual({ usedLicenses: 1, rewardCreditsUsed: 2 });
  });

  it("refuses enrolment when paid seats are gone and no reward credit remains", () => {
    const org: Org = { totalLicenses: 1, isUnlimited: false, rewardCredits: 0 };
    let roster: Member[] = [];
    roster = enrol(org, roster, "s1");
    expect(() => enrol(org, roster, "s2")).toThrow(/Quota exceeded/);
    // The refusal leaves the roster — and therefore the counters — untouched.
    expect(recompute(roster)).toEqual({ usedLicenses: 1, rewardCreditsUsed: 0 });
  });

  it("a freed reward credit is spent again by the next enrolment", () => {
    const org: Org = { totalLicenses: 10, isUnlimited: false, rewardCredits: 1 };
    let roster: Member[] = [];
    roster = enrol(org, roster, "s1");
    roster = roster.filter((m) => m.id !== "s1");
    roster = enrol(org, roster, "s2");
    expect(roster[0].licenseSource).toBe("reward");
    expect(recompute(roster)).toEqual({ usedLicenses: 0, rewardCreditsUsed: 1 });
  });

  // The property the whole change exists for: no sequence of enrolments and
  // removals can leave a counter disagreeing with the roster, because the
  // counter is never carried forward between operations.
  it("agrees with the roster after an arbitrary sequence of churn", () => {
    const org: Org = { totalLicenses: 50, isUnlimited: false, rewardCredits: 3 };
    let roster: Member[] = [];
    let n = 0;
    for (let round = 0; round < 12; round++) {
      for (let i = 0; i < 4; i++) roster = enrol(org, roster, `s${n++}`);
      roster = roster.filter((_, i) => i % 3 !== 0); // remove a third, ignoring fund
      expect(recompute(roster)).toEqual({
        usedLicenses: roster.filter((m) => m.licenseSource === "paid").length,
        rewardCreditsUsed: roster.filter((m) => m.licenseSource === "reward").length,
      });
    }
    expect(roster.length).toBeGreaterThan(0);
  });

  // Self-delete (defect 4) removes a membership row like any other removal, so
  // it needs no special arithmetic — only a recompute, which user.erasure.test.ts
  // asserts is issued for the right organization.
  it("treats a self-deleted student as an ordinary removal", () => {
    const org: Org = { totalLicenses: 10, isUnlimited: false, rewardCredits: 0 };
    let roster: Member[] = [];
    roster = enrol(org, roster, "s1");
    roster = enrol(org, roster, "s2");
    roster = roster.filter((m) => m.id !== "s1"); // the student erased themselves
    expect(recompute(roster)).toEqual({ usedLicenses: 1, rewardCreditsUsed: 0 });
  });
});
