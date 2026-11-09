/**
 * The stage decides what a human does next, so a wrong branch sends them to
 * the wrong place with no error anywhere. Each case below is a decision, not a
 * shape check.
 */
import { describe, it, expect } from "vitest";
import { schoolSetupStage, DORMANT_AFTER_DAYS } from "./schoolSetupStage";

const NOW = new Date("2026-11-09T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const base = {
  hasPassword: true,
  linkUsed: true,
  countryId: "uae",
  curriculum: "MOE National",
  hasConsent: true,
  studentCount: 3,
  createdAt: daysAgo(1),
  now: NOW,
};

describe("schoolSetupStage", () => {
  it("a school with no password is never_signed_in, and resend is the right move", () => {
    const s = schoolSetupStage({ ...base, hasPassword: false, linkUsed: false, countryId: null, curriculum: null, hasConsent: false, studentCount: 0 });
    expect(s.stage).toBe("never_signed_in");
    expect(s.canResend).toBe(true);
  });

  it("REFUSES to offer a resend to a school that is already in", () => {
    // The whole reason this is a stage and not a checkbox. Resending a link to
    // someone signed in achieves nothing and teaches them to ignore the mail.
    const s = schoolSetupStage({ ...base, curriculum: null, studentCount: 0 });
    expect(s.stage).toBe("setup_incomplete");
    expect(s.canResend).toBe(false);
    expect(s.missing).toEqual(["curriculum"]);
  });

  it("counts CONSENT as a gate — country and curriculum alone are not ready", () => {
    // Proved against the live product in school-setup-link.mjs L-11: with both
    // columns set, enrolment is still answered 409 CONSENT_REQUIRED. Reporting
    // such a school as ready would send a human looking for a bug elsewhere.
    const s = schoolSetupStage({ ...base, hasConsent: false, studentCount: 0 });
    expect(s.stage).toBe("setup_incomplete");
    expect(s.missing).toEqual(["consent"]);
  });

  it("lists every missing gate, not just the first", () => {
    const s = schoolSetupStage({ ...base, countryId: null, curriculum: null, hasConsent: false, studentCount: 0 });
    expect(s.missing).toEqual(["country", "curriculum", "consent"]);
  });

  it("treats an empty string as missing, the same rule schoolSetupGate applies", () => {
    // A cleared field can write "" rather than NULL, which satisfies a NOT NULL
    // while failing every !org.countryId check downstream.
    const s = schoolSetupStage({ ...base, curriculum: "   ", studentCount: 0 });
    expect(s.stage).toBe("setup_incomplete");
    expect(s.missing).toEqual(["curriculum"]);
  });

  it("a fully set up school with students is ready", () => {
    const s = schoolSetupStage(base);
    expect(s.stage).toBe("ready");
    expect(s.missing).toEqual([]);
    expect(s.canResend).toBe(false);
  });

  it("does NOT call a brand-new empty school dormant", () => {
    // A school bought this morning has nobody enrolled yet and that is normal.
    const s = schoolSetupStage({ ...base, studentCount: 0, createdAt: daysAgo(2) });
    expect(s.stage).toBe("ready");
  });

  it("calls a set-up school with nobody enrolled after 30 days dormant", () => {
    const s = schoolSetupStage({ ...base, studentCount: 0, createdAt: daysAgo(DORMANT_AFTER_DAYS + 1) });
    expect(s.stage).toBe("ready_no_students");
    expect(s.canResend).toBe(false);
  });

  it("an OLD school with students is ready, not dormant", () => {
    const s = schoolSetupStage({ ...base, studentCount: 40, createdAt: daysAgo(400) });
    expect(s.stage).toBe("ready");
  });

  it("never_signed_in wins over everything else", () => {
    // Ordering matters: a school with no password and every column set is
    // still unreachable by its owner, and the action is still a resend.
    const s = schoolSetupStage({ ...base, hasPassword: false, studentCount: 0, createdAt: daysAgo(400) });
    expect(s.stage).toBe("never_signed_in");
    expect(s.canResend).toBe(true);
  });

  it("survives a missing createdAt rather than reporting dormant", () => {
    // An unparseable date must not become "nobody enrolled in 30 days", which
    // would send a human chasing a school that is fine.
    const s = schoolSetupStage({ ...base, studentCount: 0, createdAt: null });
    expect(s.stage).toBe("ready");
  });
});
