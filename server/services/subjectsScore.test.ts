/**
 * SUBJECTS-component scoring — unit tests (Piece D).
 *
 * Career `relatedSubjects` are curriculum-flavoured ("Biology", "Health
 * Science"); a student's favoriteSubjects are normalized to the umbrella-6.
 * Before Piece D the two were compared with an exact string match, so 10 of the
 * 37 seeded careers scored a flat 20 for EVERY student.
 *
 * These pin the three things the fix has to get right:
 *   1. the career's tags are projected onto the umbrella-6 before matching;
 *   2. the DENOMINATOR is the projected set, not the raw tag list — leaving it
 *      raw caps the health cluster at 33.3 instead of 100 (the "half-fix");
 *   3. a career whose tags project to nothing still returns the flat 20.
 * Plus the regression guard that matching.ts stays importable without a DB.
 */

import { describe, it, expect, vi } from "vitest";
import { calculateSubjectsScore, type MatchingContext } from "./matching";
import { normalizeCareerSubjects } from "../utils/subjectMap";
import type { AssessmentComponent, Career } from "../../shared/schema";

const COMPONENT = { key: "subjects", weight: 25 } as unknown as AssessmentComponent;

function career(title: string, relatedSubjects: string[]): Career {
  return { id: title, title, relatedSubjects } as unknown as Career;
}

function context(
  favoriteSubjects: string[],
  competencyScores?: Record<string, number>,
): MatchingContext {
  return {
    assessment: { assessmentType: "premium", favoriteSubjects },
    careers: [],
    activeComponents: [COMPONENT],
    careerAffinities: new Map(),
    jobMarketTrends: new Map(),
    competencyScores,
  } as unknown as MatchingContext;
}

function score(favoriteSubjects: string[], c: Career, competencyScores?: Record<string, number>) {
  return calculateSubjectsScore(context(favoriteSubjects, competencyScores), c, COMPONENT)?.score;
}

// Raw relatedSubjects exactly as seeded (server/seed.ts) for the 10 careers that
// scored a flat 20 for every student before Piece D.
const DOCTOR = career("Doctor (General Practitioner)", ["Biology", "Chemistry", "Health Science"]);
const DENTIST = career("Dentist", ["Biology", "Chemistry", "Health Science"]);
const NURSE = career("Healthcare Professional (Nurse)", ["Biology", "Chemistry", "Health Science"]);
const PHARMACIST = career("Pharmacist", ["Chemistry", "Biology", "Health Science"]);
const PHYSIO = career("Physical Therapist", ["Biology", "Health Science", "Physical Education"]);
const CHEF = career("Chef", ["Chemistry", "Art", "Business"]);
const ENV_SCIENTIST = career("Environmental Scientist", ["Biology", "Chemistry", "Geography", "Environmental Science"]);
const HR_MANAGER = career("Human Resources Manager", ["Business", "Psychology", "Communication"]);
const TEACHER = career("Teacher (Secondary Education)", ["Education", "Subject Specialization"]);
const FASHION = career("Fashion Designer", ["Art", "Design", "Business"]);

describe("normalizeCareerSubjects", () => {
  it("collapses curriculum variants onto the umbrella-6 and dedupes", () => {
    expect(normalizeCareerSubjects(["Biology", "Chemistry", "Health Science"])).toEqual(["Science"]);
  });

  it("drops tags with no umbrella-6 home, including the self-mapping Art/Business", () => {
    expect(normalizeCareerSubjects(["Chemistry", "Art", "Business"])).toEqual(["Science"]);
    expect(normalizeCareerSubjects(["Art", "Design", "Business"])).toEqual([]);
  });

  it("applies the Piece D alias additions", () => {
    expect(normalizeCareerSubjects(["Health Science"])).toEqual(["Science"]);
    expect(normalizeCareerSubjects(["Environmental Science"])).toEqual(["Science"]);
    expect(normalizeCareerSubjects(["Engineering"])).toEqual(["Science"]);
    expect(normalizeCareerSubjects(["Statistics"])).toEqual(["Mathematics"]);
    expect(normalizeCareerSubjects(["Psychology"])).toEqual(["Social Studies"]);
    expect(normalizeCareerSubjects(["Communication"])).toEqual(["English"]);
  });

  it("tolerates an empty or missing tag list", () => {
    expect(normalizeCareerSubjects([])).toEqual([]);
    expect(normalizeCareerSubjects(null)).toEqual([]);
  });
});

describe("calculateSubjectsScore — the flat-20 bug", () => {
  it("Doctor + Science scores 100, not the old flat 20", () => {
    expect(score(["Science"], DOCTOR)).toBe(100);
  });

  it("returns null when the student picked no subjects", () => {
    expect(calculateSubjectsScore(context([]), DOCTOR, COMPONENT)).toBeNull();
  });

  it("still floors a genuine non-match at 20", () => {
    // Doctor projects to [Science]; this student picked none of it.
    expect(score(["English", "Social Studies"], DOCTOR)).toBe(20);
  });
});

describe("calculateSubjectsScore — the denominator is the NORMALIZED set", () => {
  // Doctor's three raw tags collapse to ONE umbrella subject, so a Science
  // picker is 1/1 = 100%. Dividing by the raw 3 would give 33.3 — the half-fix.
  it.each([
    ["Doctor", DOCTOR],
    ["Dentist", DENTIST],
    ["Nurse", NURSE],
    ["Pharmacist", PHARMACIST],
    ["Physical Therapist", PHYSIO],
    ["Chef", CHEF],
  ])("%s scores 100 for a Science picker, not 33.3", (_name, c) => {
    expect(score(["Science", "Mathematics", "English"], c)).toBe(100);
  });

  it("Environmental Scientist's 4 tags collapse to 2, so 1 of 2 is 50", () => {
    expect(normalizeCareerSubjects(ENV_SCIENTIST.relatedSubjects)).toEqual(["Science", "Social Studies"]);
    expect(score(["Science", "Mathematics", "English"], ENV_SCIENTIST)).toBe(50);
  });

  it("the clinical cluster now discriminates between student profiles", () => {
    expect(score(["Science"], DOCTOR)).toBe(100);
    expect(score(["English", "Social Studies"], DOCTOR)).toBe(20);
  });
});

describe("calculateSubjectsScore — careers that project to nothing", () => {
  it("Fashion Designer stays at the floor (no art axis in the umbrella-6)", () => {
    expect(normalizeCareerSubjects(FASHION.relatedSubjects)).toEqual([]);
    expect(score(["Science", "Mathematics", "English", "Arabic", "Social Studies", "Computer Science"], FASHION)).toBe(20);
  });

  it("Teacher stays at the floor: Education / Subject Specialization are professions, not school subjects", () => {
    expect(normalizeCareerSubjects(TEACHER.relatedSubjects)).toEqual([]);
    expect(score(["Science", "Mathematics", "English", "Arabic", "Social Studies", "Computer Science"], TEACHER)).toBe(20);
  });
});

describe("the alias additions rescue HR Manager", () => {
  it("Business/Psychology/Communication now projects to Social Studies + English", () => {
    expect(normalizeCareerSubjects(HR_MANAGER.relatedSubjects)).toEqual(["Social Studies", "English"]);
  });

  it("HR Manager clears the floor for a Social Studies picker", () => {
    expect(score(["Social Studies"], HR_MANAGER)).toBe(50);
    expect(score(["Social Studies", "English"], HR_MANAGER)).toBe(100);
  });
});

describe("floor census — which of the 10 previously-floored careers clear it", () => {
  // A career clears the floor iff its tags project to a non-empty umbrella-6 set:
  // that is exactly the condition for SOME student to score above 20.
  const ALL = [DOCTOR, DENTIST, NURSE, PHARMACIST, PHYSIO, CHEF, ENV_SCIENTIST, HR_MANAGER, TEACHER, FASHION];

  it("8 of 10 clear; Teacher and Fashion Designer remain (they need a data fix)", () => {
    const stuck = ALL.filter(c => normalizeCareerSubjects(c.relatedSubjects).length === 0).map(c => c.title);
    expect(stuck).toEqual(["Teacher (Secondary Education)", "Fashion Designer"]);
  });
});

describe("the 40/60 competency blend is untouched", () => {
  it("blends preference and quiz competency when competency data exists", () => {
    // Doctor -> [Science]; student matched on Science with a 70% quiz score.
    // 100 * 0.4 + 70 * 0.6 = 82
    expect(score(["Science"], DOCTOR, { Science: 70 })).toBeCloseTo(82);
  });
});

describe("matching.ts stays DB-free", () => {
  it("imports with DATABASE_URL unset (subjectMap must not pull in storage/db)", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      vi.resetModules();
      const mod = await import("./matching");
      expect(typeof mod.calculateSubjectsScore).toBe("function");
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
      vi.resetModules();
    }
  });
});
