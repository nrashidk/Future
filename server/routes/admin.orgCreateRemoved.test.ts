/**
 * There is no route that creates a school without an admin.
 *
 * THE DEFECT THIS PINS. POST /api/admin/organizations created an organization
 * row and nothing else — no primary admin member, no creation event — and had
 * no client caller. It was the sole producer of a school with no members and no
 * events, which is the only state in which the bulk delete's bare DELETE could
 * succeed and then misreport itself as failed. Removing it makes that state
 * unreachable by construction rather than by nobody having called it.
 *
 * Asserted on the registered route table, not by expecting a 404: a 404 would
 * also pass if a middleware swallowed the request. The GET beside it is the
 * control, so the test cannot pass because nothing registered at all.
 */

import { describe, it, expect, vi } from "vitest";
import express from "express";

vi.mock("../storage", () => ({ storage: {}, SubjectNotInCatalogueError: class {} }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../auth", () => ({ isAuthenticated: (_req: any, _res: any, next: any) => next() }));

const { registerAdminRoutes } = await import("./admin.routes");

function routesAt(path: string): string[] {
  const app = express();
  registerAdminRoutes(app);
  const stack: any[] = (app as any)._router.stack;
  return stack
    .filter((layer) => layer.route?.path === path)
    .flatMap((layer) => Object.keys(layer.route.methods));
}

describe("POST /api/admin/organizations", () => {
  it("is not registered", () => {
    expect(routesAt("/api/admin/organizations")).not.toContain("post");
  });

  it("leaves the listing route beside it registered", () => {
    expect(routesAt("/api/admin/organizations")).toContain("get");
  });
});
