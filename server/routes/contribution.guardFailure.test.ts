/**
 * A GUARD WHOSE DATABASE READ FAILS MUST ANSWER 500 — NOT KILL THE SERVER.
 *
 * Express 4 does not await middleware. `checkSuperadmin` and `checkOrgAdmin`
 * in contribution.routes.ts were plain async functions with no catch, so a
 * failed `storage.getUser` became a rejected promise nobody was listening to.
 * The server installs no `unhandledRejection` handler, so Node's default
 * applies: the process exits. Seen for real in the harness on 2026-11-12.
 *
 * What a test can observe is the other half of the same fault: the request
 * is never answered. Before the fix each case below hangs until the abort
 * fires (and vitest reports the unhandled rejection besides); after it, each
 * is a prompt 500.
 *
 *   F-01  the superadmin guard's read fails  -> 500, and the handler never ran
 *   F-02  the org-admin guard's read fails   -> 500, and the handler never ran
 *   F-03  THE CONTROL: with the read working, the same superadmin route is
 *         reached -- or F-01 would pass against a route that always says 500
 *   F-04  it FAILS CLOSED: an error is never treated as permission
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const getUser = vi.fn();
const getOrganizationMemberByUserId = vi.fn();
const getAllPendingContributionSubmissions = vi.fn();
const getContributionSubmissionsByOrg = vi.fn();
vi.mock("../storage", () => ({
  storage: {
    getUser: (...a: any[]) => getUser(...a),
    getOrganizationMemberByUserId: (...a: any[]) => getOrganizationMemberByUserId(...a),
    getAllPendingContributionSubmissions: (...a: any[]) => getAllPendingContributionSubmissions(...a),
    getContributionSubmissionsByOrg: (...a: any[]) => getContributionSubmissionsByOrg(...a),
  },
}));

vi.mock("../auth", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

const { default: contributionRouter } = await import("./contribution.routes");

async function get(path: string): Promise<{ status: number; body: any }> {
  const app = express();
  app.use((req: any, _res, next) => { req.user = { userId: "u-1" }; next(); });
  app.use("/api/contributions", contributionRouter);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    // An unanswered request is the symptom, so it is bounded: a hang becomes
    // a failed test in two seconds rather than a suite that never ends.
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2000) });
    return { status: res.status, body: await res.json() };
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  getAllPendingContributionSubmissions.mockResolvedValue([]);
  getContributionSubmissionsByOrg.mockResolvedValue([]);
});

describe("a contribution guard whose database read fails", () => {
  it("F-01 superadmin guard: answers 500 and never reaches the handler", async () => {
    getUser.mockRejectedValue(new Error("Connection terminated unexpectedly"));

    const r = await get("/api/contributions/admin/pending");

    expect(r.status).toBe(500);
    expect(getAllPendingContributionSubmissions).not.toHaveBeenCalled();
  });

  it("F-02 org-admin guard: answers 500 and never reaches the handler", async () => {
    getOrganizationMemberByUserId.mockRejectedValue(new Error("Connection terminated unexpectedly"));

    const r = await get("/api/contributions/submissions");

    expect(r.status).toBe(500);
    expect(getContributionSubmissionsByOrg).not.toHaveBeenCalled();
  });

  it("F-03 control: with the read working, the superadmin route is reached", async () => {
    getUser.mockResolvedValue({ id: "u-1", role: "superadmin", email: "root@futurepath.test" });

    const r = await get("/api/contributions/admin/pending");

    expect(r.status).toBe(200);
    expect(getAllPendingContributionSubmissions).toHaveBeenCalledTimes(1);
  });

  it("F-04 fails closed: the error body grants nothing and names nothing", async () => {
    getUser.mockRejectedValue(new Error("password authentication failed for user neondb_owner"));

    const r = await get("/api/contributions/admin/pending");

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("neondb_owner");
  });
});
