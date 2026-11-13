/**
 * repopulate must rebuild the sector maps, not just the country row.
 *
 * The defect this pins: POST /api/admin/countries/:id/repopulate rewrote
 * mission, vision, prioritySectors, curricula and subjects and stopped there.
 * country_sector_categories was never touched, and that is the table
 * calculateVisionScore reads -- without those rows every career scores
 * VISION_FLOOR, so the vision component (30% of a basic report, 20% of
 * premium) becomes a constant. The report still renders and looks right; the
 * only trace is a SCORING WARNING in the server log.
 *
 * Those rows are written in exactly one place, persistGeneratedSectors, and it
 * was reachable only from the autoPopulate branch of country CREATION. So a
 * country created manually, or one whose sector generation failed at creation,
 * was stranded permanently -- and repopulate, the obvious thing to reach for,
 * rewrote everything except the part that was missing.
 *
 * No express here: registerCountryRoutes is handed a fake app that captures
 * handlers, so the route can be invoked directly. The LLM services are mocked
 * because api.anthropic.com is not reachable from a test run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSectorGenerationJob,
  resetSectorGenerationJobs,
  whenSectorGenerationSettles,
} from "../services/sectorGenerationJobs";

const sectorRows: Array<{ countryId: string; name: string }> = [];
const skillRows: Array<{ sectorId: string; wefSkillId: string; importance: number }> = [];
const categoryRows: Array<{ sectorId: string; careerCategory: string; relevance: number }> = [];
const countryUpdates: Array<Record<string, unknown>> = [];

vi.mock("../storage", () => ({
  storage: {
    // checkSuperadmin re-reads the user from storage on every privileged
    // request rather than trusting the session, so the mock has to supply one.
    getUser: async () => ({ id: "u1", email: "super@futurepath.test", role: "superadmin" }),
    getCountryById: async () => ({ id: "testland", name: "Testland", code: "TL", curricula: ["MOE National"] }),
    updateCountry: async (_id: string, data: Record<string, unknown>) => {
      countryUpdates.push(data);
      return { id: "testland", ...data };
    },
    getAllCareers: async () => [{ id: "c1", title: "Nurse", category: "Healthcare" }],
    getAllWefSkills: async () => [{ id: "wef-num", name: "Numeracy" }],
    createOrUpdateCountryPrioritySector: async (countryId: string, name: string) => {
      sectorRows.push({ countryId, name });
      return { id: `sector-${sectorRows.length}` };
    },
    createOrUpdateCountrySectorWefSkill: async (sectorId: string, wefSkillId: string, importance: number) => {
      skillRows.push({ sectorId, wefSkillId, importance });
      return {};
    },
    createOrUpdateSectorCategoryRule: async (sectorId: string, careerCategory: string, relevance: number) => {
      categoryRows.push({ sectorId, careerCategory, relevance });
      return {};
    },
  },
}));

const researchCountryData = vi.fn();
const generateSectorWefMappings = vi.fn();

vi.mock("../services/llmCountryService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/llmCountryService")>();
  return {
    ...actual,
    researchCountryData: (...args: unknown[]) => researchCountryData(...args),
    generateSectorWefMappings: (...args: unknown[]) => generateSectorWefMappings(...args),
  };
});

vi.mock("../middleware/rateLimiter.middleware", () => ({
  llmLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../auth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../middleware/auth.middleware", () => ({
  isSuperadminOnly: (_req: unknown, _res: unknown, next: () => void) => next(),
  getSuperadminEmails: () => ["super@futurepath.test"],
}));

const { registerCountryRoutes } = await import("./country.routes");

/** Captures the handler registered for each method+path. */
function captureRoutes() {
  const routes = new Map<string, Function>();
  const record = (method: string) => (path: string, ...rest: unknown[]) => {
    routes.set(`${method} ${path}`, rest[rest.length - 1] as Function);
  };
  // Every verb the real routes use. A missing one fails with "app.patch is not
  // a function" from inside registerCountryRoutes, which reads like a bug in
  // the route rather than a gap in this stub.
  const app = { get: record("GET"), post: record("POST"), put: record("PUT"), patch: record("PATCH"), delete: record("DELETE") };
  registerCountryRoutes(app as never);
  return routes;
}

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  return {
    out,
    status(code: number) { out.status = code; return this; },
    json(body: unknown) { out.body = body; return this; },
  };
}

const req = {
  params: { id: "testland" },
  body: {},
  user: { userId: "u1", email: "super@futurepath.test" },
  isAuthenticated: () => true,
};

describe("POST /api/admin/countries/:id/repopulate", () => {
  beforeEach(() => {
    sectorRows.length = 0;
    skillRows.length = 0;
    categoryRows.length = 0;
    countryUpdates.length = 0;
    resetSectorGenerationJobs();
    researchCountryData.mockReset();
    generateSectorWefMappings.mockReset();

    researchCountryData.mockResolvedValue({
      success: true,
      tokensUsed: 10,
      data: {
        mission: "m", vision: "v", visionPlan: null,
        prioritySectors: ["Healthcare"],
        nationalGoals: [], targets: null, educationSystem: null,
        universitiesLink: null, universitiesLinkLabel: null,
        curricula: ["MOE"], nationalCurriculum: "Ministry of Education National Curriculum",
        subjects: ["Mathematics"], gradeLevels: ["10"],
      },
    });
    generateSectorWefMappings.mockResolvedValue({
      success: true,
      // `sources` is read unguarded by persistGeneratedSectors when it builds
      // the sector description, so a mapping without it throws before the
      // first row is written -- which is how the first version of this test
      // failed.
      mappings: [{
        sector: "Healthcare",
        sources: ["https://example.test/plan"],
        skills: [{ skill: "Numeracy", importance: 80 }],
        categoryRules: [{ category: "Healthcare", relevance: 90, notes: "test" }],
      }],
      rejected: [], warnings: [],
    });
  });

  it("writes the sector, skill and category rows, not just the country row", async () => {
    const handler = captureRoutes().get("POST /api/admin/countries/:id/repopulate")!;
    const res = fakeRes();
    await handler(req, res);

    expect(res.out.status).toBe(200);
    expect(countryUpdates).toHaveLength(1);

    // The request ANSWERS BEFORE the map exists: the research does not finish
    // inside an HTTP request (240 s was not enough on production).
    expect((res.out.body as any).sectorGeneration).toMatchObject({ attempted: true, started: true });
    await whenSectorGenerationSettles("testland");

    // The three tables that were silently skipped before.
    expect(sectorRows, "country_priority_sectors must be written").toHaveLength(1);
    expect(skillRows, "country_sector_wef_skills must be written").toHaveLength(1);
    expect(
      categoryRows,
      "country_sector_categories must be written — without it calculateVisionScore floors every career",
    ).toHaveLength(1);

    expect(getSectorGenerationJob("testland")).toMatchObject({
      status: "done",
      outcome: { attempted: true, persisted: true, sectorsWritten: 1 },
    });
  });

  it("passes the generator a longer limit than a request could wait", async () => {
    const handler = captureRoutes().get("POST /api/admin/countries/:id/repopulate")!;
    await handler(req, fakeRes());
    await whenSectorGenerationSettles("testland");
    const options = generateSectorWefMappings.mock.calls[0][3];
    expect(options.timeoutMs).toBeGreaterThan(240_000);
  });

  it("does not start a second research while one is running", async () => {
    let release!: (v: unknown) => void;
    generateSectorWefMappings.mockReturnValue(new Promise((r) => { release = r; }));
    const handler = captureRoutes().get("POST /api/admin/countries/:id/repopulate")!;
    const first = fakeRes(); await handler(req, first);
    const second = fakeRes(); await handler(req, second);
    expect((second.out.body as any).sectorGeneration).toMatchObject({ started: true, alreadyRunning: true });
    // The generator is reached after two awaited reads, so give it a turn.
    await new Promise((r) => setTimeout(r, 0));
    expect(generateSectorWefMappings).toHaveBeenCalledTimes(1);
    expect(getSectorGenerationJob("testland")?.status).toBe("running");
    release({ success: false, error: "stopped" });
    await whenSectorGenerationSettles("testland");
    expect(getSectorGenerationJob("testland")?.status).toBe("failed");
  });

  it("records a generator that throws as a failure, not as running for ever", async () => {
    generateSectorWefMappings.mockRejectedValue(new Error("Anthropic API request timed out after 900 seconds"));
    const handler = captureRoutes().get("POST /api/admin/countries/:id/repopulate")!;
    await handler(req, fakeRes());
    await whenSectorGenerationSettles("testland");
    expect(getSectorGenerationJob("testland")).toMatchObject({
      status: "failed",
      outcome: { persisted: false, error: "Anthropic API request timed out after 900 seconds" },
    });
  });

  it("keeps the country's curricula and does not add the model's spelling of the national one", async () => {
    const handler = captureRoutes().get("POST /api/admin/countries/:id/repopulate")!;
    await handler(req, fakeRes());
    await whenSectorGenerationSettles("testland");
    expect(countryUpdates[0].curricula).toEqual(["MOE National"]);
  });

  it("answers the status route with the job, and 'none' for a country never started", async () => {
    const routes = captureRoutes();
    await routes.get("POST /api/admin/countries/:id/repopulate")!(req, fakeRes());
    await whenSectorGenerationSettles("testland");
    const res = fakeRes();
    await routes.get("GET /api/admin/countries/:id/sector-generation")!(req, res);
    expect(res.out.body).toMatchObject({ status: "done" });
    const other = fakeRes();
    await routes.get("GET /api/admin/countries/:id/sector-generation")!({ ...req, params: { id: "elsewhere" } }, other);
    expect(other.out.body).toEqual({ status: "none" });
  });

  it("still saves the country when sector generation fails", async () => {
    generateSectorWefMappings.mockResolvedValue({ success: false, error: "LLM unavailable" });
    const handler = captureRoutes().get("POST /api/admin/countries/:id/repopulate")!;
    const res = fakeRes();
    await handler(req, res);

    // The country data is already persisted at that point; rolling it back
    // because the sector pass failed would lose a good update and leave the
    // caller with nothing.
    expect(res.out.status).toBe(200);
    expect(countryUpdates).toHaveLength(1);
    await whenSectorGenerationSettles("testland");
    expect(categoryRows).toHaveLength(0);
    expect(getSectorGenerationJob("testland")).toMatchObject({
      status: "failed",
      outcome: { attempted: true, persisted: false, error: "LLM unavailable" },
    });
  });

  it("reports that it did not attempt sector generation when there are no sectors", async () => {
    researchCountryData.mockResolvedValue({
      success: true, tokensUsed: 1,
      data: {
        mission: "m", vision: "v", visionPlan: null, prioritySectors: [],
        nationalGoals: [], targets: null, educationSystem: null,
        universitiesLink: null, universitiesLinkLabel: null,
        curricula: [], subjects: [], gradeLevels: [],
      },
    });
    const handler = captureRoutes().get("POST /api/admin/countries/:id/repopulate")!;
    const res = fakeRes();
    await handler(req, res);

    expect(res.out.status).toBe(200);
    expect((res.out.body as any).sectorGeneration).toMatchObject({ attempted: false });
  });
});
