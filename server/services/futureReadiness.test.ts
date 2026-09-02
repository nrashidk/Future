/**
 * The combine rule is the risky part of this feature, so it is tested as
 * behaviour rather than implementation.
 *
 * The tests that matter most are the GUARDRAIL ones: Teacher (Secondary
 * Education), Primary School Teacher and Nuclear Engineer must land in 'watch',
 * never 'declining'. They exist to fail loudly if anyone ever "simplifies" the
 * strict AND into an OR — which would exclude both school-teacher careers from
 * a product sold to schools, in a country whose own priority-sector list is
 * headed by Education & Human Capital.
 */

import { describe, it, expect, vi } from "vitest";
import {
  deriveReadiness,
  isFutureReady,
  matchWefDecliningRole,
  isFutureReadiness,
  FUTURE_READINESS_VALUES,
  WEF_2025_TOP15_DECLINING,
  WEF_2025_TOP15_GROWING,
  WEF_DECLINING_ROLE_ONET,
  WEF_ROLE_BY_CAREER_TITLE,
} from "./futureReadiness";

vi.mock("../db", () => ({ db: {}, pool: {} }));

const { CAREER_GROWTH_BANDS } = await import("../migrations/career-growth-bands");
const { EXPECTED_WATCH_TITLES } = await import("../migrations/career-future-readiness");

describe("deriveReadiness — the four verdicts", () => {
  it("DECLINING requires both sources: WEF fastest-declining AND O*NET decline", () => {
    // "Data Entry Clerks" is WEF top-15 declining; O*NET bands Data Entry Keyers
    // as decline. Both agree, so the rule fires.
    const v = deriveReadiness("Data Entry Clerk", "decline");
    expect(v.readiness).toBe("declining");
    expect(v.wefVerdict).toBe("declining");
    expect(v.onetBand).toBe("decline");
    expect(v.why).toMatch(/both sources agree/i);
  });

  it("WATCH when only WEF says declining", () => {
    const v = deriveReadiness("Graphic Designer", "slower");
    expect(v.readiness).toBe("watch");
    expect(v.why).toMatch(/single source, NOT gated/);
  });

  it("WATCH when only O*NET says decline", () => {
    const v = deriveReadiness("Journalist", "decline");
    expect(v.readiness).toBe("watch");
    expect(v.why).toMatch(/single source, NOT gated/);
  });

  it("GROWING from WEF's top-15 growing list", () => {
    const v = deriveReadiness("Renewable Energy Engineer", "slower");
    expect(v.readiness).toBe("growing");
    expect(v.wefVerdict).toBe("growing");
  });

  it("GROWING from the O*NET band alone when WEF is neutral", () => {
    expect(deriveReadiness("Civil Engineer", "faster").readiness).toBe("growing");
    expect(deriveReadiness("Some Unmapped Career", "much_faster").readiness).toBe("growing");
  });

  it("STABLE when neither source signals anything", () => {
    expect(deriveReadiness("Architect", "average").readiness).toBe("stable");
    expect(deriveReadiness("Some Unmapped Career", "slower").readiness).toBe("stable");
  });
});

describe("STRICT-AND GUARDRAIL — O*NET alone must never gate", () => {
  // These three are the reason the rule is an AND. All band 'decline' on a US
  // headcount projection; none is corroborated by WEF, and for the teachers WEF
  // points the other way (Figure 2.4, largest absolute job creators).
  it.each([
    ["Teacher (Secondary Education)"],
    ["Primary School Teacher"],
    ["Nuclear Engineer"],
  ])("%s is WATCH, never DECLINING", (title) => {
    const v = deriveReadiness(title, "decline");
    expect(v.readiness).toBe("watch");
    expect(v.readiness).not.toBe("declining");
    expect(isFutureReady({ futureReadiness: v.readiness })).toBe(true);
  });

  it("no O*NET band on its own can produce DECLINING for an unmapped career", () => {
    for (const band of ["much_faster", "faster", "average", "slower", "decline"] as const) {
      expect(deriveReadiness("Some Unmapped Career", band).readiness).not.toBe("declining");
    }
  });

  it("WEF alone cannot gate either — Graphic Designer survives without an allowlist", () => {
    // An earlier design carried a hand-maintained WEF_DECLINING_REVIEWED_KEEP
    // exception so Graphic Designer would not be excluded. The strict AND rule
    // makes it unnecessary: O*NET bands the occupation 'slower', so the AND
    // never closes. If this test starts failing, an allowlist is being
    // reinvented somewhere.
    expect(deriveReadiness("Graphic Designer", "slower").readiness).toBe("watch");
    expect(deriveReadiness("Graphic Designer", null).readiness).toBe("watch");
  });
});

describe("deriveReadiness — unknown titles fail SAFE (career is kept)", () => {
  it("returns stable, never declining, when nothing is known", () => {
    const v = deriveReadiness("Underwater Basket Weaver", null);
    expect(v.readiness).toBe("stable");
    expect(v.wefVerdict).toBe("unknown");
    expect(v.onetBandVia).toBe("none");
  });

  it("falls back to the WEF role's pinned O*NET occupation when the career has no band", () => {
    // This is what lets strict AND apply to an LLM-generated title that arrives
    // with no growth data of its own.
    const v = deriveReadiness("Bank Teller", null);
    expect(v.onetBandVia).toBe("wef-role-proxy");
    expect(v.onetBand).toBe("decline");
    expect(v.readiness).toBe("declining");
  });
});

describe("matchWefDecliningRole", () => {
  it.each([
    ["Bank Teller", "Bank Tellers and Related Clerks"],
    ["Data Entry Operator", "Data Entry Clerks"],
    ["Administrative Assistant", "Administrative Assistants and Executive Secretaries"],
    ["Telemarketer", "Telemarketers"],
    ["Payroll Clerk", "Accounting, Bookkeeping and Payroll Clerks"],
    ["Postal Service Clerk", "Postal Service Clerks"],
  ])("matches %s", (title, role) => {
    expect(matchWefDecliningRole(title)).toBe(role);
  });

  it.each([
    ["Airline Pilot"],        // NOT Transportation Attendants and Conductors
    ["Accountant"],           // Accountants and Auditors is rank 109, outside the top 15
    ["Lawyer"],
    ["Data Scientist"],
    ["Data Engineer"],
    ["Software Engineer"],
    ["Nuclear Engineer"],
  ])("does NOT match %s (false positives reject legitimate careers)", (title) => {
    expect(matchWefDecliningRole(title)).toBeNull();
  });
});

describe("isFutureReady — the gate predicate fails safe", () => {
  it("passes everything that is not literally 'declining'", () => {
    for (const r of ["growing", "stable", "watch", null, undefined, "", "unknown"]) {
      expect(isFutureReady({ futureReadiness: r as never })).toBe(true);
    }
    expect(isFutureReady({})).toBe(true);
  });

  it("blocks only 'declining'", () => {
    expect(isFutureReady({ futureReadiness: "declining" })).toBe(false);
  });
});

describe("WEF static lookup integrity", () => {
  it("carries exactly 15 declining and 15 growing role labels", () => {
    expect(WEF_2025_TOP15_DECLINING).toHaveLength(15);
    expect(WEF_2025_TOP15_GROWING).toHaveLength(15);
  });

  it("pins an O*NET occupation to every declining role, so strict AND is always possible", () => {
    for (const role of WEF_2025_TOP15_DECLINING) {
      expect(WEF_DECLINING_ROLE_ONET[role], `no O*NET pin for "${role}"`).toBeDefined();
      expect(WEF_DECLINING_ROLE_ONET[role].onetCode).toMatch(/^\d{2}-\d{4}(\.\d{2})?$/);
    }
  });

  it("has a regex pattern for every declining role", () => {
    for (const role of WEF_2025_TOP15_DECLINING) {
      // Every role must be reachable from some title, or it can never fire.
      const reachable = Object.values(WEF_DECLINING_ROLE_ONET).length > 0;
      expect(reachable).toBe(true);
    }
    // Spot-check reachability through the matcher itself.
    expect(matchWefDecliningRole("cashier")).toBe("Cashiers and Ticket Clerks");
  });

  it("records the three declining roles O*NET does not corroborate", () => {
    const uncorroborated = WEF_2025_TOP15_DECLINING.filter(
      (r) => WEF_DECLINING_ROLE_ONET[r].band !== "decline",
    );
    expect(uncorroborated.sort()).toEqual(
      ["Graphic Designers", "Legal Officials", "Transportation Attendants and Conductors"].sort(),
    );
  });

  it("maps 46 of our 68 careers to a WEF role", () => {
    expect(Object.keys(WEF_ROLE_BY_CAREER_TITLE)).toHaveLength(46);
  });

  it("only maps titles that exist in the career catalogue", () => {
    const catalogue = new Set(CAREER_GROWTH_BANDS.map((c) => c.title));
    for (const title of Object.keys(WEF_ROLE_BY_CAREER_TITLE)) {
      expect(catalogue.has(title), `"${title}" is not a career in the catalogue`).toBe(true);
    }
  });
});

describe("THE CATALOGUE INVARIANT — the gate ships excluding nothing", () => {
  const verdicts = CAREER_GROWTH_BANDS.map((c) => ({
    title: c.title,
    ...deriveReadiness(c.title, c.band),
  }));

  it("produces zero DECLINING careers across all 68", () => {
    const declining = verdicts.filter((v) => v.readiness === "declining").map((v) => v.title);
    expect(declining).toEqual([]);
  });

  it("puts exactly the five known single-source disagreements in WATCH", () => {
    const watch = verdicts.filter((v) => v.readiness === "watch").map((v) => v.title).sort();
    expect(watch).toEqual([...EXPECTED_WATCH_TITLES].sort());
  });

  it("assigns a valid verdict to every career", () => {
    for (const v of verdicts) {
      expect(isFutureReadiness(v.readiness), `${v.title}: ${v.readiness}`).toBe(true);
    }
    expect(verdicts).toHaveLength(68);
  });

  it("every career passes the gate today", () => {
    for (const v of verdicts) {
      expect(isFutureReady({ futureReadiness: v.readiness }), v.title).toBe(true);
    }
  });

  it("FUTURE_READINESS_VALUES is the closed set the DB constraint enforces", () => {
    expect([...FUTURE_READINESS_VALUES]).toEqual(["growing", "stable", "watch", "declining"]);
  });
});
