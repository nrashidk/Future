/**
 * /health must report an aborted boot seed.
 *
 * The defect this pins: seedDatabase() was invoked as
 * `seedDatabase().catch(console.error)` (server/index.ts), so an abort anywhere
 * in it left the server booting and serving traffic with the nine .ts content
 * migrations silently skipped. Production served English career content for
 * months in that state, and nothing reported it — the only evidence was an
 * Arabic PDF rendering English text, noticed by a human, long after the fact.
 *
 * Pinned here:
 *   - a failed seed is visible on /health as status=degraded, seed=failed;
 *   - it does NOT return 503, because this route is on the load balancer path
 *     and pulling a serving instance is worse for students than stale content;
 *   - the failure MESSAGE never reaches the public response body.
 *
 * db is mocked so importing public.routes.ts does not pull in db.ts, which
 * throws at import when DATABASE_URL is unset (same pattern as
 * country.persistence.test.ts).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

let dbUp = true;

vi.mock("../db", () => ({
  db: {
    execute: async () => {
      if (!dbUp) throw new Error("connection refused");
      return { rows: [] };
    },
  },
}));
vi.mock("../storage", () => ({ storage: {} }));

const { registerPublicRoutes } = await import("./public.routes");
const { markSeedOk, markSeedFailed, markSeedIncomplete, getSeedStatus } = await import("../seedStatus");

async function getHealth(): Promise<{ status: number; body: any }> {
  const app = express();
  registerPublicRoutes(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

describe("/health reports boot seed status", () => {
  beforeEach(() => {
    dbUp = true;
  });

  it("reports ok when the seed completed", async () => {
    markSeedOk();
    const { status, body } = await getHealth();
    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok", seed: "ok" });
  });

  it("reports degraded when the seed aborted", async () => {
    markSeedFailed(new Error("column careers.onet_growth_band does not exist"));
    const { status, body } = await getHealth();
    expect(body.status).toBe("degraded");
    expect(body.seed).toBe("failed");
  });

  it("does not 503 on a failed seed — the instance still serves", async () => {
    markSeedFailed(new Error("boom"));
    const { status } = await getHealth();
    expect(status).toBe(200);
  });

  it("never discloses the seed failure message in the response body", async () => {
    markSeedFailed(new Error("column careers.onet_growth_band does not exist"));
    const { body } = await getHealth();
    expect(JSON.stringify(body)).not.toContain("onet_growth_band");
    // ...while the operator-facing status still carries it.
    expect(getSeedStatus().error).toContain("onet_growth_band");
  });

  it("reports degraded when the seed ran but the coverage gate found gaps", async () => {
    // Distinct from "failed": seedDatabase() completed, but student-facing
    // content is missing. Both must surface.
    markSeedIncomplete(["MISSING_CONTENT career-arabic-content.ts: 68 careers"]);
    const { status, body } = await getHealth();
    expect(status).toBe(200);
    expect(body).toEqual({ status: "degraded", seed: "incomplete" });
  });

  it("markSeedOk does not erase a gap the coverage gate already reported", async () => {
    // The gate runs INSIDE seedDatabase(); index.ts calls markSeedOk() on the way
    // out. Without this guard the ok would overwrite the finding.
    vi.resetModules();
    const fresh = await import("../seedStatus");
    fresh.markSeedIncomplete(["MISSING_CONTENT career-arabic-content.ts: 68 careers"]);
    fresh.markSeedOk();
    expect(fresh.getSeedStatus().state).toBe("incomplete");
  });

  it("still 503s when the database itself is unreachable", async () => {
    markSeedOk();
    dbUp = false;
    const { status, body } = await getHealth();
    expect(status).toBe(503);
    expect(body.status).toBe("unhealthy");
  });

  it("starts out pending, so a seed that never ran is not reported as ok", async () => {
    vi.resetModules();
    const fresh = await import("../seedStatus");
    expect(fresh.getSeedStatus().state).toBe("pending");
  });
});
