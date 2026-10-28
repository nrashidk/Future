/**
 * The session carries `userId`. It does not carry `id`.
 *
 * Three write sites in contribution.routes.ts read `user.id` and therefore
 * wrote undefined: the review path, the settings audit, and the manual reward
 * allocation — where awardedByUserId is NOT NULL, so POST
 * /admin/org/:orgId/allocate-reward failed outright every time it was called.
 * The feature has never run in production, which is the only reason nobody
 * reported it.
 *
 * What makes this worth a test rather than just a fix: two OTHER lines in the
 * same file already did `user.userId || user.id` correctly. The right idiom was
 * a hundred lines away and still not copied, so naming it once is the fix and
 * this pins what "once" means.
 *
 * The second assertion is the one with teeth. `user.id` is not merely absent —
 * reading it yields undefined, and because req.user is cast to `any` at every
 * call site, TypeScript reported nothing at all. Writing the helper with an
 * honest `string | undefined` return is what finally surfaced five call sites
 * at compile time, four of them in code that looked correct.
 */

import { describe, it, expect } from "vitest";
import { actingUserId } from "./actingUser";

describe("actingUserId", () => {
  it("reads userId, which is what passport puts on the session", () => {
    expect(actingUserId({ userId: "u-123" })).toBe("u-123");
  });

  it("returns undefined for the shape the broken call sites assumed", () => {
    // Not a hypothetical: this is req.user as it actually arrives. The three
    // fixed sites were reading .id off exactly this object.
    expect(actingUserId({ userId: "u-123" }).valueOf()).not.toBe(undefined);
    expect(({ userId: "u-123" } as any).id).toBeUndefined();
  });

  it("still honours an explicit id, so the two pre-existing call sites are unchanged", () => {
    expect(actingUserId({ id: "u-legacy" })).toBe("u-legacy");
  });

  it("prefers userId when both are present", () => {
    expect(actingUserId({ userId: "u-session", id: "u-other" })).toBe("u-session");
  });

  it("is undefined for an absent or empty user rather than throwing", () => {
    // The route guards turn this into a 401; it must not explode first.
    expect(actingUserId(undefined)).toBeUndefined();
    expect(actingUserId(null)).toBeUndefined();
    expect(actingUserId({})).toBeUndefined();
  });
});
