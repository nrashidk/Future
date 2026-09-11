/**
 * quiz_questions.subject has ONE vocabulary: the subject NAME.
 *
 * THE DEFECT THIS PINS. The column had two writers that disagreed. The seeded
 * bank stores the name ("Mathematics"); contribution approval stored
 * submission.subject, which is the CODE ("mathematics") — the contribute UI
 * submits s.code (ContributeQuestions.tsx:582) and validation matches
 * subjects.code, so the code form was the only one that could reach the write.
 *
 * The one thing that could have bridged the two vocabularies is applied to the
 * wrong side: a student's picks go through normalizeSubjectsAsync
 * (quiz.routes.ts:336), whose alias map maps a code to its canonical name
 * (utils/subjects.ts:62), while the stored row is normalized by nothing and is
 * compared raw, exactly and case-sensitively (quiz.routes.ts:346). So an approved
 * contributed question could never enter any student's quiz. It failed invisibly:
 * the submission succeeded, the review queue showed it, approval wrote a real and
 * correct row. Only the intersection — the questions a quiz actually contains —
 * was wrong, and nothing looks at the intersection.
 *
 * Latent, not live: prod held 240 questions, all source_type 'system' and all
 * name-form, and zero contributed rows, so nothing needed migrating.
 *
 * WHAT THESE TESTS DO AND DO NOT COVER. Neither test reaches a database; the
 * suite is DB-free by design (server/db.ts throws at import without
 * DATABASE_URL). Test 1 is not a fixture — it asserts over the literal source of
 * every one of the 240 rows in production, so for the seeded population it is
 * exact. But it can only see the seeded population. Test 2 is what would have
 * caught this defect, because it pins the write site itself.
 *
 * STILL UNPINNED, and deliberately out of scope here: admin.routes.ts:262 and
 * :339 write the code form in the same shape as the bug fixed here, and
 * country.routes.ts:494 writes whatever free-text subject the LLM returned.
 * Reported, not fixed. Separately, filing under the catalogue NAME is necessary
 * but not sufficient — a catalogue subject outside the umbrella-6 is unservable
 * in either form, which is a different divergence between the same two
 * vocabularies (FOLLOWUP.md).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { SUBJECT_IDS } from "@shared/subjects";
import { uaeQuestionBank } from "../questionBanks/uae";
import { flattenQuestionBank } from "@shared/questionTypes";

const getContributionSubmission = vi.fn();
const getSubjectByCode = vi.fn();
const createQuizQuestion = vi.fn();
const getUser = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getContributionSubmission: (...a: unknown[]) => getContributionSubmission(...a),
    getSubjectByCode: (...a: unknown[]) => getSubjectByCode(...a),
    createQuizQuestion: (...a: unknown[]) => createQuizQuestion(...a),
    getUser: (...a: unknown[]) => getUser(...a),
    updateContributionSubmission: vi.fn(async () => ({})),
    getOrganizationById: vi.fn(async () => ({ id: "org1", name: "A School" })),
    createContributionReward: vi.fn(async () => ({})),
    updateOrganization: vi.fn(async () => ({})),
    createOrganizationEvent: vi.fn(async () => ({})),
  },
}));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => { req.user = { userId: "u1" }; next(); },
}));
vi.mock("../middleware/auth.middleware", () => ({
  getSuperadminEmails: () => ["root@example.com"],
}));

const contributionRouter = (await import("./contribution.routes")).default;

/**
 * Test 1 — the seeded bank, which IS the 240 production rows.
 *
 * shared/subjects.ts has carried this as a comment since it was written: "Each
 * id must match subjects.name in the DB EXACTLY ... a drift silently yields an
 * empty question pool for that subject, with no error anywhere." A comment
 * cannot fail. This can.
 */
describe("every seeded question is filed under a canonical subject name", () => {
  const questions = flattenQuestionBank(uaeQuestionBank);

  // A snapshot of prod, not an invariant: 40 questions x 6 subjects. If the bank
  // legitimately grows, update the number — the vocabulary assertions below are
  // the part that must never change.
  it("flattens to the 240 rows production holds", () => {
    expect(questions).toHaveLength(240);
  });

  it("uses only umbrella-6 subject names, exactly", () => {
    const distinct = [...new Set(questions.map(q => q.subject))].sort();
    expect(distinct).toEqual([...SUBJECT_IDS].sort());
  });

  // The failure mode is a CASE or form drift, not an unknown subject, so assert
  // the exact strings rather than a case-insensitive membership test.
  it("stores no code-form value", () => {
    for (const q of questions) {
      expect(q.subject).not.toBe(q.subject.toLowerCase().replace(/\s+/g, "_"));
      expect(SUBJECT_IDS).toContain(q.subject as typeof SUBJECT_IDS[number]);
    }
  });

  it("declares the same names on the per-subject bank descriptors", () => {
    const declared = uaeQuestionBank.subjects.map(s => s.subject).sort();
    expect(declared).toEqual([...SUBJECT_IDS].sort());
  });
});

/**
 * Test 2 — the write site. This is the one that would have caught the defect.
 */
describe("approving a contribution files it under the subject NAME", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/contributions", contributionRouter);
  let base = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ id: "u1", email: "root@example.com", role: "superadmin" });
    createQuizQuestion.mockResolvedValue({});
  });

  const listen = async () => {
    if (base) return base;
    const server = app.listen(0);
    await new Promise(r => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    return base;
  };

  const submission = {
    id: "s1", organizationId: "org1", countryId: "uae", curriculum: "MOE National",
    subject: "mathematics",            // the CODE — the only form that passes validation
    grade: 9, status: "pending",
    questions: [{ question: "Q1", options: ["a","b","c","d"], correctAnswer: "a",
                  topic: "Algebra", difficulty: "easy", cognitiveLevel: "knowledge" }],
  };

  it("writes the catalogue name, not the submitted code", async () => {
    getContributionSubmission.mockResolvedValue({ ...submission });
    getSubjectByCode.mockResolvedValue({ id: "sub1", code: "mathematics", name: "Mathematics" });

    const url = await listen();
    const res = await fetch(`${url}/api/contributions/admin/s1/review`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(200);

    expect(createQuizQuestion).toHaveBeenCalledTimes(1);
    const written = createQuizQuestion.mock.calls[0][0];
    expect(written.subject).toBe("Mathematics");
    expect(written.subject).not.toBe("mathematics");
    // The value it writes must be servable: the pool filter compares against
    // exactly these strings.
    expect(SUBJECT_IDS).toContain(written.subject);
  });

  it("refuses rather than falling back to the code when the subject is gone", async () => {
    getContributionSubmission.mockResolvedValue({ ...submission });
    getSubjectByCode.mockResolvedValue(undefined);

    const url = await listen();
    const res = await fetch(`${url}/api/contributions/admin/s1/review`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("SUBJECT_NOT_IN_CATALOGUE");
    // The point of the refusal: nothing unservable gets written.
    expect(createQuizQuestion).not.toHaveBeenCalled();
  });
});
