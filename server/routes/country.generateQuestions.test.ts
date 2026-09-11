/**
 * The LLM importer must not let the model name the subject.
 *
 * THE DEFECT THIS PINS. This endpoint wrote `q.subject` — the model's echo of the
 * string interpolated into its own prompt (llmCountryService.ts:403). Nothing
 * enforced the echo: safeParseJSON is JSON.parse plus an `as T` cast and
 * GeneratedQuestion is an interface, erased at runtime. A drift as small as
 * "Math" for "Mathematics" produced rows no student's quiz could contain, because
 * serving compares the stored value exactly and case-sensitively.
 *
 * Worse than a mismatch: the endpoint then MANUFACTURED a catalogue row to match,
 * deriving it from the REQUEST string while the rows carried the MODEL's string.
 * When the two differed, every row pointed at a subject that still did not exist
 * and nothing raised. That block is gone — resolving up front makes it
 * unreachable — and its removal is a deliberate workflow change: a subject must
 * exist in the catalogue before questions can be generated for it.
 *
 * The third test is the reporting half. A caller who asked for 3 and got 2 could
 * previously see only a number that did not match the one requested; the reason
 * went to console.error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

class FakeSubjectError extends Error {
  constructor(message: string, public readonly status: number, public readonly subject: string) {
    super(message);
    this.name = "SubjectNotInCatalogueError";
  }
}

const resolveSubjectName = vi.fn();
const createQuizQuestion = vi.fn();
const createSubject = vi.fn();
const getUser = vi.fn();
const generateCountryQuizQuestions = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    resolveSubjectName: (...a: unknown[]) => resolveSubjectName(...a),
    createQuizQuestion: (...a: unknown[]) => createQuizQuestion(...a),
    createSubject: (...a: unknown[]) => createSubject(...a),
    getUser: (...a: unknown[]) => getUser(...a),
    getCountryById: vi.fn(async () => ({ id: "uae", name: "United Arab Emirates" })),
    getSubjectByCode: vi.fn(async () => undefined),
  },
  SubjectNotInCatalogueError: FakeSubjectError,
}));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => { req.user = { userId: "u1" }; next(); },
}));
vi.mock("../middleware/auth.middleware", () => ({
  getSuperadminEmails: () => ["root@example.com"],
}));
vi.mock("../services/llmCountryService", () => ({
  generateCountryQuizQuestions: (...a: unknown[]) => generateCountryQuizQuestions(...a),
  researchCountryData: vi.fn(),
  generateSectorWefMappings: vi.fn(),
  skillKey: (s: string) => s,
}));

const { registerCountryRoutes } = await import("./country.routes");

const app = express();
app.use(express.json());
registerCountryRoutes(app as any);
const server = app.listen(0);
await new Promise(r => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const question = (n: number) => ({
  question: `Question number ${n}`,
  questionType: "multiple_choice",
  options: ["a", "b", "c", "d"],
  correctAnswer: "a",
  explanation: "because",
  subject: "Math",          // the MODEL's drift — must never be stored
  grade: 9,
  curriculum: "MOE National",
  topic: "Algebra",
  difficulty: "easy",
  cognitiveLevel: "knowledge",
});

const generate = (body: Record<string, unknown> = {}) =>
  fetch(`${base}/api/admin/countries/uae/generate-questions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subject: "mathematics", grade: 9, curriculum: "MOE National", count: 3, ...body }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ id: "u1", email: "root@example.com", role: "superadmin" });
  createQuizQuestion.mockResolvedValue({});
});

describe("generate-questions stores the resolved subject, never the model's", () => {
  it("writes the catalogue name on every row, discarding q.subject", async () => {
    resolveSubjectName.mockResolvedValue("Mathematics");
    generateCountryQuizQuestions.mockResolvedValue({
      success: true, questions: [question(1), question(2), question(3)], tokensUsed: 42,
    });

    const res = await generate();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questionsCreated).toBe(3);
    expect(body.subject).toBe("Mathematics");

    expect(createQuizQuestion).toHaveBeenCalledTimes(3);
    for (const [written] of createQuizQuestion.mock.calls) {
      expect(written.subject).toBe("Mathematics");
      expect(written.subject).not.toBe("Math");
    }

    // The caller's string is resolved, not the model's, and the generator is
    // given the canonical name so the prompt asks for the right thing.
    expect(resolveSubjectName).toHaveBeenCalledWith("uae", "MOE National", "mathematics");
    expect(generateCountryQuizQuestions.mock.calls[0][3]).toBe("Mathematics");
  });

  it("refuses before spending tokens when the subject is not in the catalogue", async () => {
    resolveSubjectName.mockRejectedValue(
      new FakeSubjectError("Subject 'astrophysics' does not match anything.", 400, "astrophysics"),
    );

    const res = await generate({ subject: "astrophysics" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("astrophysics");

    // The point of resolving FIRST: no generation, no writes, and no catalogue
    // row manufactured to make the request true after the fact.
    expect(generateCountryQuizQuestions).not.toHaveBeenCalled();
    expect(createQuizQuestion).not.toHaveBeenCalled();
    expect(createSubject).not.toHaveBeenCalled();
  });

  it("names which questions failed and why, rather than only how many", async () => {
    resolveSubjectName.mockResolvedValue("Mathematics");
    generateCountryQuizQuestions.mockResolvedValue({
      success: true, questions: [question(1), question(2), question(3)], tokensUsed: 42,
    });
    createQuizQuestion
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("null value in column \"topic\" violates not-null constraint"))
      .mockResolvedValueOnce({});

    const body = await (await generate()).json();
    expect(body.questionsGenerated).toBe(3);
    expect(body.questionsCreated).toBe(2);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].index).toBe(1);
    expect(body.failures[0].question).toContain("Question number 2");
    expect(body.failures[0].reason).toContain("not-null constraint");
  });
});
