/**
 * THE RE-CHECK'S SUCCESS BRANCH — the one the offline harness cannot reach.
 *
 * `llm-gate.mjs` proves who may trigger a re-check, which states qualify, and
 * that a check which still cannot run answers 503 and leaves the row
 * "unavailable". What it cannot prove is what happens when the check RUNS:
 * the harness has no network, so every re-check there ends at the 503.
 *
 * That is the branch with consequences. A re-checked submission that scores
 * at or above the threshold goes to PEER REVIEW, and approved questions earn
 * reward credits that convert to free licences, in an assessment sat by
 * 13-18 year olds. So the routing is asserted here, with `fetch` standing in
 * for Anthropic and storage mocked.
 *
 *   C-01  a re-check that passes routes the submission to peer review
 *   C-02  THE CONTROL: one that runs and scores BELOW the threshold stays
 *         `pending` with a real "verified" verdict and its real score -- or
 *         C-01 would pass against a route that sends everything to peer review
 *   C-03  a non-OK reply from Anthropic is "unavailable" and a 503, never a
 *         score -- the original defect, re-asserted on the new path
 *   C-04  a submission the claim refuses makes NO Anthropic call at all
 *   C-05  the check reads the questions from the CLAIMED row, and sends the
 *         stored credential -- not anything from the request
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const getUser = vi.fn();
const getContributionSubmission = vi.fn();
const claimContributionRecheck = vi.fn();
const updateContributionSubmission = vi.fn();
const getApiCredential = vi.fn();
vi.mock("../storage", () => ({
  storage: {
    getUser: (...a: any[]) => getUser(...a),
    getContributionSubmission: (...a: any[]) => getContributionSubmission(...a),
    claimContributionRecheck: (...a: any[]) => claimContributionRecheck(...a),
    updateContributionSubmission: (...a: any[]) => updateContributionSubmission(...a),
    getApiCredential: (...a: any[]) => getApiCredential(...a),
  },
}));

vi.mock("../auth", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

const { default: contributionRouter } = await import("./contribution.routes");

const SUBMISSION = {
  id: "sub-1",
  status: "pending",
  llmVerificationStatus: "unavailable",
  questions: [{ question: "What is 2 + 2?", options: ["3", "4", "5", "6"], correctAnswer: "4" }],
  subject: "mathematics",
  grade: 10,
  curriculum: "MOE National",
};

/** A reply shaped like Anthropic's, carrying the reviewer's JSON as text. */
const anthropicReply = (overallScore: number) => ({
  ok: true,
  status: 200,
  json: async () => ({
    content: [{ text: JSON.stringify({
      overallScore,
      questions: [{ index: 0, isValid: overallScore >= 50, score: overallScore, issues: [] }],
    }) }],
  }),
  text: async () => "",
});

const realFetch = globalThis.fetch;
const anthropicFetch = vi.fn();

async function recheck(id = "sub-1"): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { userId: "u-super" }; next(); });
  app.use("/api/contributions", contributionRouter);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    // The REAL fetch reaches the test server; only the route's own outbound
    // call is the stub.
    const res = await realFetch(`http://127.0.0.1:${port}/api/contributions/admin/${id}/recheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ id: "u-super", role: "superadmin", email: "root@futurepath.test" });
  getContributionSubmission.mockResolvedValue(SUBMISSION);
  claimContributionRecheck.mockResolvedValue({ ...SUBMISSION, llmVerificationStatus: "pending" });
  getApiCredential.mockResolvedValue({ apiKey: "sk-ant-stored-credential" });
  // Echoes what the route wrote, so the response is judged on the WRITE.
  updateContributionSubmission.mockImplementation(async (id: string, data: any) => ({
    ...SUBMISSION, id, ...data,
  }));
  globalThis.fetch = ((url: any, init: any) =>
    String(url).includes("api.anthropic.com") ? anthropicFetch(url, init) : realFetch(url, init)) as any;
});

afterEach(() => { globalThis.fetch = realFetch; });

describe("re-running the automatic check", () => {
  it("C-01 a re-check that passes routes the submission to peer review", async () => {
    anthropicFetch.mockResolvedValue(anthropicReply(82));

    const r = await recheck();

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: "peer_review", llmVerificationStatus: "verified", llmVerificationScore: 82,
    });
    const [, written] = updateContributionSubmission.mock.calls[0];
    expect(written).toMatchObject({
      status: "peer_review", llmVerificationStatus: "verified", llmVerificationScore: 82,
    });
  });

  it("C-02 one that runs and scores below the threshold stays pending", async () => {
    anthropicFetch.mockResolvedValue(anthropicReply(31));

    const r = await recheck();

    expect(r.status).toBe(200);
    const [, written] = updateContributionSubmission.mock.calls[0];
    // The check RAN, so this is a verdict and not "unavailable" -- and the
    // status key is absent, so the row keeps `pending` for a superadmin.
    expect(written.llmVerificationStatus).toBe("verified");
    expect(written.llmVerificationScore).toBe(31);
    expect("status" in written).toBe(false);
    expect(r.body.status).toBe("pending");
  });

  it("C-03 a non-OK reply from Anthropic is unavailable and a 503, never a score", async () => {
    anthropicFetch.mockResolvedValue({ ok: false, status: 401, text: async () => "invalid x-api-key", json: async () => ({}) });

    const r = await recheck();

    expect(r.status).toBe(503);
    expect(r.body.code).toBe("CHECK_UNAVAILABLE");
    const [, written] = updateContributionSubmission.mock.calls[0];
    expect(written.llmVerificationStatus).toBe("unavailable");
    expect(written.llmVerificationScore).toBe(0);
    expect("status" in written).toBe(false);
  });

  it("C-04 a submission the claim refuses makes no Anthropic call", async () => {
    claimContributionRecheck.mockResolvedValue(undefined);

    const r = await recheck();

    expect(r.status).toBe(409);
    expect(r.body.code).toBe("NOT_RECHECKABLE");
    expect(anthropicFetch).not.toHaveBeenCalled();
    expect(updateContributionSubmission).not.toHaveBeenCalled();
  });

  it("C-05 the check reads the claimed row and sends the stored credential", async () => {
    anthropicFetch.mockResolvedValue(anthropicReply(70));

    await recheck();

    const [, init] = anthropicFetch.mock.calls[0];
    expect(init.headers["x-api-key"]).toBe("sk-ant-stored-credential");
    const sent = JSON.parse(init.body);
    expect(sent.messages[0].content).toContain("What is 2 + 2?");
    expect(sent.system).toContain("Grade 10");
  });
});
