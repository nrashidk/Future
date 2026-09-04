/**
 * The free-tier narrative formatter.
 *
 * The audit strings below are not invented: each is assembled exactly the way
 * server/routes/recommendations.routes.ts assembles one at generate time —
 * `${displayName} (${weight}%): ${score}% - ${reasoning}` joined by " | " —
 * from the literal reasoning sentences the calculators in
 * server/services/matching.ts emit.
 *
 * What is pinned: the student never sees a percentage, a pipe, or a component
 * name; the specifics (their subjects, their interests, the sector) survive the
 * translation; and an audit string this cannot parse degrades to a shorter
 * narrative rather than to leaked internals.
 */

import { describe, it, expect } from "vitest";
import { formatFreeReasoning, parseAuditReasoning } from "./freeNarrative";

const FULL_AUDIT =
  "Subject Match (35%): 72.3% - Strong in Mathematics, Science (preference + 71% quiz competency) | " +
  "Interest Match (35%): 64.0% - Strong match with your robotics (field, skills) and space (work tasks) interests | " +
  "Country Vision Alignment (30%): 81.0% - Core to a national priority sector for United Arab Emirates: Advanced Technology & AI";

const WEAK_AUDIT =
  "Subject Match (35%): 20.0% - No matching subjects between preferences and career requirements | " +
  "Interest Match (35%): 12.0% - Limited alignment with stated interests | " +
  "Country Vision Alignment (30%): 45.0% - Viable career path in United Arab Emirates";

describe("parseAuditReasoning", () => {
  it("splits the audit blob into components and resolves their keys", () => {
    const parsed = parseAuditReasoning(FULL_AUDIT);
    expect(parsed).toHaveLength(3);
    expect(parsed.map(c => c.key)).toEqual(["subjects", "interests", "vision"]);
    expect(parsed[0].weight).toBe(35);
    expect(parsed[0].score).toBeCloseTo(72.3);
    expect(parsed[2].detail).toContain("Advanced Technology & AI");
  });

  it("returns nothing for empty, null or unparseable input", () => {
    expect(parseAuditReasoning(null)).toEqual([]);
    expect(parseAuditReasoning("")).toEqual([]);
    expect(parseAuditReasoning("just some prose with no structure")).toEqual([]);
  });

  it("resolves keys from renamed display names rather than exact matches", () => {
    // These names live in a DB table an admin can edit.
    const parsed = parseAuditReasoning(
      "Favourite Subjects (35%): 50.0% - Interest in Physics | National Vision (30%): 60.0% - Viable career path in Oman",
    );
    expect(parsed.map(c => c.key)).toEqual(["subjects", "vision"]);
  });
});

describe("formatFreeReasoning", () => {
  const base = { careerTitle: "Robotics Engineer", overallScore: 74.2 };

  it("names the student's own subjects, interests and sector", () => {
    const out = formatFreeReasoning({ ...base, auditReasoning: FULL_AUDIT });
    expect(out).toContain("Robotics Engineer");
    expect(out).toContain("Mathematics and Science");
    expect(out).toContain("robotics and space");
    expect(out).toContain("Advanced Technology & AI");
    expect(out).toContain("United Arab Emirates");
  });

  it("leaks no percentages, pipes, weights or component names", () => {
    const out = formatFreeReasoning({ ...base, auditReasoning: FULL_AUDIT });
    expect(out).not.toMatch(/\d+(\.\d+)?%/);
    expect(out).not.toContain("|");
    expect(out).not.toContain("Subject Match");
    expect(out).not.toContain("Interest Match");
    expect(out).not.toContain("Country Vision Alignment");
  });

  it("credits the quiz only when the score was quiz-backed", () => {
    const quizBacked = formatFreeReasoning({ ...base, auditReasoning: FULL_AUDIT });
    expect(quizBacked).toContain("quiz");

    const preferenceOnly = formatFreeReasoning({
      ...base,
      auditReasoning: "Subject Match (35%): 50.0% - Interest in Physics, Chemistry",
    });
    expect(preferenceOnly).toContain("Physics and Chemistry");
    expect(preferenceOnly).not.toContain("quiz");
  });

  it("bands the opening by score instead of quoting it", () => {
    const strong = formatFreeReasoning({ ...base, overallScore: 88, auditReasoning: FULL_AUDIT });
    const good = formatFreeReasoning({ ...base, overallScore: 65, auditReasoning: FULL_AUDIT });
    const weak = formatFreeReasoning({ ...base, overallScore: 45, auditReasoning: FULL_AUDIT });
    expect(strong).toContain("one of your strongest matches");
    expect(good).toContain("a good match");
    expect(weak).toContain("worth a look");
  });

  it("drops sentences whose evidence is absent rather than inventing them", () => {
    const out = formatFreeReasoning({ ...base, overallScore: 41, auditReasoning: WEAK_AUDIT });
    // No subject list, no interest list, no sector claim — none were supported.
    expect(out).not.toContain("The subjects you picked");
    expect(out).not.toContain("Your interest in");
    expect(out).not.toContain("national priority sector");
    // But it still opens and closes honestly.
    expect(out).toContain("Robotics Engineer");
    expect(out).toContain("does not yet include your career personality");
  });

  it("always returns usable prose, even with no audit string at all", () => {
    for (const input of [null, undefined, "", "garbage"]) {
      const out = formatFreeReasoning({ ...base, auditReasoning: input as any });
      expect(out.length).toBeGreaterThan(40);
      expect(out).toContain("Robotics Engineer");
      expect(out).not.toContain("|");
    }
  });

  it("always says which signals the free report was and was not built from", () => {
    // This closing line is what makes the upsell honest: the student is told
    // what is missing rather than shown a blurred box implying it is hidden.
    const out = formatFreeReasoning({ ...base, auditReasoning: FULL_AUDIT });
    expect(out).toContain("your subjects, your interests, and your country's priority sectors");
    expect(out).toContain("does not yet include your career personality or what you value in work");
  });

  it("renders Arabic when asked, carrying the same specifics", () => {
    const out = formatFreeReasoning({ ...base, auditReasoning: FULL_AUDIT, language: "ar" });
    expect(out).toMatch(/[؀-ۿ]/);
    expect(out).toContain("Robotics Engineer");
    expect(out).toContain("Advanced Technology & AI");
    expect(out).not.toMatch(/\d+(\.\d+)?%/);
    expect(out).not.toContain("|");
  });

  it("separates paragraphs so ReportMarkdown renders them as such", () => {
    const out = formatFreeReasoning({ ...base, auditReasoning: FULL_AUDIT });
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(4);
  });
});
