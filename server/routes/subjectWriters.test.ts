/**
 * EVERY WRITER'S OUTPUT, ASSERTED WHERE IT LEAVES THE HANDLER.
 *
 * The choke point (storage.subjectVocabulary.test.ts) guarantees that nothing
 * unservable reaches the column. It does not tell you WHICH handler produced a
 * bad value, and it cannot distinguish a handler that computed the right subject
 * from one that computed the wrong subject and was rescued on the way down. That
 * distinction is the whole reason this file exists alongside it: storage is
 * mocked here, so what each handler hands over is observed BEFORE any resolve.
 *
 * This is the unit-level version of `SELECT DISTINCT subject FROM quiz_questions`
 * — run against what the writers produce, rather than against a deployment. Its
 * honest limit: it asserts over the inputs the table supplies. It catches a
 * structural defect ("this handler stores the code form", "this handler stores
 * the model's field unresolved"), which is the class that caused all of this. It
 * cannot catch a superadmin typing "Phsyics" into a valid catalogue.
 *
 * TWO CONTRACTS, and the table marks which each writer is held to:
 *
 *   "passthrough"  The handler does not compute a subject; it hands the caller's
 *                  value to storage verbatim and the choke point owns the
 *                  vocabulary. Asserting the passthrough is still worth doing —
 *                  it catches a handler that re-derives a code form on the way
 *                  past, which is precisely what contribution approval did.
 *
 *   "resolved"     The handler must NOT store the value it was handed. The
 *                  contribution UI submits a code and the LLM importer receives
 *                  the model's echo; both must store the catalogue name instead.
 *                  These are the two that were broken.
 *
 * The seeded bank is the sixth writer and is asserted directly, as static data,
 * in contribution.subjectVocabulary.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { SUBJECT_IDS } from "@shared/subjects";

class FakeSubjectError extends Error {
  constructor(message: string, public readonly status: number, public readonly subject: string) {
    super(message);
    this.name = "SubjectNotInCatalogueError";
  }
}

/** Everything handed to a quiz_questions writer, in order, before any resolve. */
const writes: Array<{ op: "create" | "update"; subject: unknown }> = [];

const getContributionSubmission = vi.fn();
const getSubjectByCode = vi.fn();
const resolveSubjectName = vi.fn();
const getUser = vi.fn();
const generateCountryQuizQuestions = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    createQuizQuestion: vi.fn(async (q: any) => { writes.push({ op: "create", subject: q.subject }); return { id: "q1", ...q }; }),
    updateQuizQuestion: vi.fn(async (_id: string, d: any) => { writes.push({ op: "update", subject: d.subject }); return { id: "q1", ...d }; }),
    getContributionSubmission: (...a: unknown[]) => getContributionSubmission(...a),
    getSubjectByCode: (...a: unknown[]) => getSubjectByCode(...a),
    resolveSubjectName: (...a: unknown[]) => resolveSubjectName(...a),
    getUser: (...a: unknown[]) => getUser(...a),
    getCountryById: vi.fn(async () => ({ id: "uae", name: "United Arab Emirates" })),
    getSubjectsByCurriculum: vi.fn(async () => []),
    updateContributionSubmission: vi.fn(async () => ({})),
    getOrganizationById: vi.fn(async () => ({ id: "org1", name: "A School" })),
    createContributionReward: vi.fn(async () => ({})),
    updateOrganization: vi.fn(async () => ({})),
    createOrganizationEvent: vi.fn(async () => ({})),
    getSystemConfig: vi.fn(async () => undefined),
  },
  SubjectNotInCatalogueError: FakeSubjectError,
}));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => { req.user = { userId: "u1" }; next(); },
}));
vi.mock("../middleware/auth.middleware", () => ({
  isAdmin: (_req: any, _res: any, next: any) => next(),
  isOrgAdmin: (_req: any, _res: any, next: any) => next(),
  getSuperadminEmails: () => ["root@example.com"],
}));
vi.mock("../middleware/rateLimiter.middleware", () => ({
  dataExportLimiter: (_req: any, _res: any, next: any) => next(),
  llmLimiter: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../services/llmCountryService", () => ({
  generateCountryQuizQuestions: (...a: unknown[]) => generateCountryQuizQuestions(...a),
  researchCountryData: vi.fn(),
  generateSectorWefMappings: vi.fn(),
  skillKey: (s: string) => s,
}));
vi.mock("../db", () => ({ db: {}, pool: {} }));

const { registerAdminRoutes } = await import("./admin.routes");
const { registerCountryRoutes } = await import("./country.routes");
const contributionRouter = (await import("./contribution.routes")).default;

const app = express();
app.use(express.json());
registerAdminRoutes(app as any);
registerCountryRoutes(app as any);
app.use("/api/contributions", contributionRouter);
const server = app.listen(0);
await new Promise(r => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const post = (p: string, body: unknown, method = "POST") =>
  fetch(`${base}${p}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const QUESTION = {
  question: "What is 2 + 2?", questionType: "multiple_choice",
  options: ["3", "4", "5", "6"], correctAnswer: "4",
  grade: 9, topic: "Arithmetic", difficulty: "easy", cognitiveLevel: "knowledge",
};

beforeEach(() => {
  writes.length = 0;
  vi.clearAllMocks();
  getUser.mockResolvedValue({ id: "u1", email: "root@example.com", role: "superadmin" });
  getSubjectByCode.mockResolvedValue({ id: "s1", code: "mathematics", name: "Mathematics" });
  resolveSubjectName.mockResolvedValue("Mathematics");
});

/**
 * `handed` is what the caller/model supplies; `expected` is what the handler must
 * pass to storage. They differ exactly where the handler is required to compute.
 */
const WRITERS: Array<{
  name: string;
  file: string;
  contract: "passthrough" | "resolved";
  handed: string;
  expected: string;
  run: () => Promise<Response>;
}> = [
  {
    name: "admin POST /api/admin/questions",
    file: "admin.routes.ts:262",
    contract: "passthrough",
    handed: "Mathematics",
    expected: "Mathematics",
    run: () => post("/api/admin/questions", { ...QUESTION, subject: "Mathematics", countryId: "uae" }),
  },
  {
    name: "admin PATCH /api/admin/questions/:id",
    file: "admin.routes.ts:276",
    contract: "passthrough",
    handed: "Science",
    expected: "Science",
    run: () => post("/api/admin/questions/q1", { subject: "Science" }, "PATCH"),
  },
  {
    name: "admin POST /api/admin/questions/bulk-upload",
    file: "admin.routes.ts:339",
    contract: "passthrough",
    handed: "Mathematics",
    expected: "Mathematics",
    run: () => post("/api/admin/questions/bulk-upload", {
      questions: [{ ...QUESTION, subject: "Mathematics", countryId: "uae", curriculum: "MOE National" }],
    }),
  },
  {
    name: "contribution approval",
    file: "contribution.routes.ts:550",
    contract: "resolved",
    handed: "mathematics",          // the CODE — the only form the contribute UI can submit
    expected: "Mathematics",
    run: () => {
      getContributionSubmission.mockResolvedValue({
        id: "s1", organizationId: "org1", countryId: "uae", curriculum: "MOE National",
        subject: "mathematics", grade: 9, status: "pending",
        questions: [{ ...QUESTION }],
      });
      return post("/api/contributions/admin/s1/review", { status: "approved" });
    },
  },
  {
    name: "LLM importer",
    file: "country.routes.ts:494",
    contract: "resolved",
    handed: "Math",                 // the model's drift from the requested subject
    expected: "Mathematics",
    run: () => {
      generateCountryQuizQuestions.mockResolvedValue({
        success: true, tokensUsed: 1,
        questions: [{ ...QUESTION, subject: "Math", curriculum: "MOE National" }],
      });
      return post("/api/admin/countries/uae/generate-questions", {
        subject: "mathematics", grade: 9, curriculum: "MOE National", count: 1,
      });
    },
  },
];

describe.each(WRITERS)("$name ($file)", ({ contract, handed, expected, run }) => {
  it(`hands storage ${contract === "resolved" ? "the resolved name" : "the caller's value"}`, async () => {
    const res = await run();
    expect(res.status).toBeLessThan(300);

    expect(writes).toHaveLength(1);
    expect(writes[0].subject).toBe(expected);
  });

  it("stores a value a student's quiz can actually contain", async () => {
    await run();
    expect(SUBJECT_IDS).toContain(writes[0].subject as any);
  });

  if (contract === "resolved") {
    // The assertion that separates "computed it right" from "was rescued on the
    // way down". Storage is mocked, so nothing downstream can repair this.
    it(`does not pass through what it was handed (${handed})`, async () => {
      await run();
      expect(writes[0].subject).not.toBe(handed);
    });
  }
});

describe("the writers agree", () => {
  it("produces one vocabulary across all five", async () => {
    for (const w of WRITERS) {
      writes.length = 0;
      vi.clearAllMocks();
      getUser.mockResolvedValue({ id: "u1", email: "root@example.com", role: "superadmin" });
      getSubjectByCode.mockResolvedValue({ id: "s1", code: "mathematics", name: "Mathematics" });
      resolveSubjectName.mockResolvedValue("Mathematics");
      await w.run();
      expect(writes[0]?.subject, `${w.name} wrote an unexpected subject`).toBe(w.expected);
    }
  });
});
