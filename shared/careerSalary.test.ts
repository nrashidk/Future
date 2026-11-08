import { describe, it, expect } from "vitest";
import { resolveSalaryRange, NO_LOCAL_SALARY } from "./careerSalary";

/**
 * The assertion that carries the whole point is "never returns the US figure".
 * The rest guards the edges that would quietly defeat it.
 */
describe("resolveSalaryRange", () => {
  it("returns the local figure when one is set", () => {
    expect(
      resolveSalaryRange({
        averageSalary: "$80,000 - $150,000",
        averageSalaryLocal: "AED 180,000 - AED 320,000",
      }),
    ).toBe("AED 180,000 - AED 320,000");
  });

  it("NEVER returns the US dollar figure, even as a fallback", () => {
    const usOnly = { averageSalary: "$80,000 - $150,000", averageSalaryLocal: null };
    const out = resolveSalaryRange(usOnly);

    expect(out).toBe(NO_LOCAL_SALARY);
    // Stated separately from the equality above: if the fallback phrase is ever
    // changed, this must still fail rather than pass on the new wording.
    expect(out).not.toContain("$");
    expect(out).not.toContain("80,000");
  });

  it("treats the seeded state of every career today as having no figure", () => {
    // average_salary_local is empty for every row in the catalogue, so this is
    // the live case, not an edge case.
    expect(resolveSalaryRange({ averageSalary: "$45,000 - $75,000" })).toBe(NO_LOCAL_SALARY);
  });

  it("treats whitespace-only and empty local figures as absent", () => {
    // A cleared field in an admin form arrives as "" or "   ", and returning it
    // would print a blank salary line rather than omitting one.
    expect(resolveSalaryRange({ averageSalaryLocal: "" })).toBe(NO_LOCAL_SALARY);
    expect(resolveSalaryRange({ averageSalaryLocal: "   " })).toBe(NO_LOCAL_SALARY);
    expect(resolveSalaryRange({ averageSalaryLocal: "\n\t" })).toBe(NO_LOCAL_SALARY);
  });

  it("trims a padded local figure rather than passing the padding through", () => {
    expect(resolveSalaryRange({ averageSalaryLocal: "  AED 1 - AED 2  " })).toBe("AED 1 - AED 2");
  });

  it("survives a row with neither column set", () => {
    expect(resolveSalaryRange({})).toBe(NO_LOCAL_SALARY);
    expect(resolveSalaryRange({ averageSalary: null, averageSalaryLocal: null })).toBe(
      NO_LOCAL_SALARY,
    );
  });

  it("ignores a non-string local value instead of rendering it", () => {
    // Defensive: a JSON column or a bad migration could deliver a number.
    expect(resolveSalaryRange({ averageSalaryLocal: 12345 as unknown as string })).toBe(
      NO_LOCAL_SALARY,
    );
  });

  it("does not leak a currency symbol or a country through the neutral phrase", () => {
    expect(NO_LOCAL_SALARY).not.toMatch(/[$£€]|USD|AED|SAR|dollar/i);
  });
});
