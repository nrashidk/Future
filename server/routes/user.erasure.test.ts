/**
 * The right-to-erasure endpoint must actually erase, and must not 500.
 *
 * THE DEFECT THIS PINS. DELETE /api/users/me deleted cvq_results,
 * quiz_responses, assessment_quizzes, recommendations, assessments,
 * organization_members and users — and omitted wef_competency_results, which is
 * NOT NULL -> assessments with NO ACTION (schema.ts:401). Nothing deleted it, so
 * `delete(assessments)` raised 23503, the transaction rolled back whole, and the
 * endpoint returned 500.
 *
 * It fired for every user with a PREMIUM assessment: premium is what writes the
 * row (recommendations.routes.ts:137 -> wefOrchestrator.ts:57) and school
 * students are forced premium (auth.routes.ts:53). So the GDPR/PDPL erasure
 * route was broken for exactly the population it most exists for — minors whose
 * school created their account — and it is the route docs/consent-implementation
 * -recon.md position 4 depends on.
 *
 * WHY THE FAKE DB ENFORCES FOREIGN KEYS. A test that only asserted "the new
 * function deletes these tables" would pass against a list that is still short —
 * which is the bug class here. So the fake refuses a delete that would strand a
 * child row, exactly as Postgres does, and `legacyEraseUserData` below is the
 * old sequence verbatim. The first test runs BOTH: the old one must throw and
 * the new one must not. That is what makes this a regression test rather than a
 * restatement of the implementation.
 *
 * db/storage/auth are mocked so importing the route module does not pull in
 * db.ts, which throws at import when DATABASE_URL is unset — same pattern as
 * health.seedStatus.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import {
  users, assessments, recommendations, assessmentQuizzes, quizResponses,
  cvqResults, organizationMembers, wefCompetencyResults,
  organizations, organizationEvents, files, contributionSubmissions,
  contributionRewards, scoringConfigChangeLog, systemAnnouncements, systemConfig,
} from "@shared/schema";

// Only the three predicate builders are replaced, so the fake can read them.
// pgTable/sql/relations stay real — @shared/schema is built with them.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: any, val: any) => ({ __k: "eq", col, val }),
    or: (...conds: any[]) => ({ __k: "or", conds }),
    inArray: (col: any, vals: any[]) => ({ __k: "in", col, vals }),
  };
});

const { eq } = await import("drizzle-orm");

let currentUserId = "u-student";
let store: Store;

vi.mock("../db", () => ({
  db: { transaction: async (cb: any) => cb(makeTx(store)) },
}));
const recomputed: string[] = [];
vi.mock("../storage", () => ({
  storage: {
    getUser: async (id: string) => ({ id, email: null }),
    // Self-deletion used to leave the school's licence counters untouched, so a
    // student who erased their account burned one of their school's seats. The
    // counters derive from the roster now, so erasure must recompute the roster
    // the membership row just left.
    recomputeOrganizationLicenseUsage: async (orgId: string) => {
      recomputed.push(orgId);
      return { usedLicenses: 0, rewardCreditsUsed: 0 };
    },
  },
}));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { userId: currentUserId };
    req.session = { destroy: (cb: any) => cb(null) };
    next();
  },
}));
vi.mock("../middleware/rateLimiter.middleware", () => ({
  dataExportLimiter: (_req: any, _res: any, next: any) => next(),
}));

const { eraseUserData, collectBlockingAuditRecords, registerUserRoutes } =
  await import("./user.routes");

// ---------------------------------------------------------------- fake db ---

const TABLES = [
  users, assessments, recommendations, assessmentQuizzes, quizResponses,
  cvqResults, organizationMembers, wefCompetencyResults, organizations,
  organizationEvents, files, contributionSubmissions, contributionRewards,
  scoringConfigChangeLog, systemAnnouncements, systemConfig,
];

/** column object -> {table, key}, by reference, built from the real schema. */
const COLS = new Map<any, { table: any; key: string }>();
for (const table of TABLES) {
  for (const key of Object.keys(table)) COLS.set((table as any)[key], { table, key });
}

/** The FK edges under test, transcribed from shared/schema.ts. */
const FKS: Array<{ child: any; childKey: string; parent: any; parentKey: string }> = [
  { child: wefCompetencyResults, childKey: "assessmentId", parent: assessments, parentKey: "id" },
  { child: recommendations, childKey: "assessmentId", parent: assessments, parentKey: "id" },
  { child: assessmentQuizzes, childKey: "assessmentId", parent: assessments, parentKey: "id" },
  { child: cvqResults, childKey: "assessmentId", parent: assessments, parentKey: "id" },
  { child: quizResponses, childKey: "assessmentQuizId", parent: assessmentQuizzes, parentKey: "id" },
  { child: assessments, childKey: "userId", parent: users, parentKey: "id" },
  { child: wefCompetencyResults, childKey: "userId", parent: users, parentKey: "id" },
  { child: cvqResults, childKey: "userId", parent: users, parentKey: "id" },
  { child: organizationMembers, childKey: "userId", parent: users, parentKey: "id" },
  { child: organizations, childKey: "adminUserId", parent: users, parentKey: "id" },
  { child: organizationEvents, childKey: "performedBy", parent: users, parentKey: "id" },
];

type Row = Record<string, any>;
class Store {
  data = new Map<any, Row[]>();
  constructor() { for (const t of TABLES) this.data.set(t, []); }
  rows(table: any): Row[] { return this.data.get(table)!; }
  add(table: any, ...rows: Row[]) { this.rows(table).push(...rows); }
  remove(table: any, cond: any) {
    const victims = this.rows(table).filter((r) => match(cond, r));
    if (victims.length === 0) return;
    for (const fk of FKS) {
      if (fk.parent !== table) continue;
      const orphaned = this.rows(fk.child).find((c) => {
        const ref = c[fk.childKey];
        return ref != null && victims.some((v) => v[fk.parentKey] === ref);
      });
      if (orphaned) {
        throw new Error(
          `23503 foreign_key_violation: update or delete on "${name(table)}" ` +
          `violates foreign key constraint on table "${name(fk.child)}"`,
        );
      }
    }
    this.data.set(table, this.rows(table).filter((r) => !victims.includes(r)));
  }
}

function name(table: any): string {
  return Object.getOwnPropertySymbols(table)
    .map((s) => (table as any)[s])
    .find((v) => typeof v === "string") ?? "?";
}

function match(cond: any, row: Row): boolean {
  if (!cond) return true;
  if (cond.__k === "eq") return row[COLS.get(cond.col)!.key] === cond.val;
  if (cond.__k === "in") return cond.vals.includes(row[COLS.get(cond.col)!.key]);
  if (cond.__k === "or") return cond.conds.some((c: any) => match(c, row));
  throw new Error("unsupported condition in fake db");
}

function makeTx(s: Store) {
  return {
    select(shape: Record<string, any>) {
      return {
        from(table: any) {
          return {
            where(cond: any) {
              const run = () =>
                s.rows(table).filter((r) => match(cond, r)).map((r) => {
                  const out: Row = {};
                  for (const [k, col] of Object.entries(shape)) out[k] = r[COLS.get(col)!.key];
                  return out;
                });
              return {
                limit: (n: number) => Promise.resolve(run().slice(0, n)),
                then: (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad),
              };
            },
          };
        },
      };
    },
    delete(table: any) {
      return { where: (cond: any) => Promise.resolve(s.remove(table, cond)) };
    },
  };
}

/** The pre-fix sequence, verbatim from user.routes.ts:134-167 before this commit. */
async function legacyEraseUserData(tx: any, userId: string, assessmentIds: string[]) {
  for (const id of assessmentIds) {
    await tx.delete(cvqResults).where(eq(cvqResults.assessmentId, id));
    const quizzes = await tx
      .select({ id: assessmentQuizzes.id })
      .from(assessmentQuizzes)
      .where(eq(assessmentQuizzes.assessmentId, id));
    if (quizzes.length > 0) {
      await tx.delete(quizResponses).where(eq(quizResponses.assessmentQuizId, quizzes[0].id));
      await tx.delete(assessmentQuizzes).where(eq(assessmentQuizzes.assessmentId, id));
    }
    await tx.delete(recommendations).where(eq(recommendations.assessmentId, id));
  }
  await tx.delete(assessments).where(eq(assessments.userId, userId));
  await tx.delete(organizationMembers).where(eq(organizationMembers.userId, userId));
  await tx.delete(users).where(eq(users.id, userId));
}

/** A school student who completed one premium assessment. */
function seedPremiumStudent(s: Store) {
  s.add(users, { id: "u-student", accountType: "org_student" });
  s.add(assessments, { id: "a1", userId: "u-student", assessmentType: "premium" });
  s.add(assessmentQuizzes, { id: "q1", assessmentId: "a1" });
  s.add(quizResponses, { id: "r1", assessmentQuizId: "q1", questionId: "qq1" });
  s.add(recommendations, { id: "rec1", assessmentId: "a1" });
  s.add(cvqResults, { id: "c1", assessmentId: "a1", userId: "u-student" });
  s.add(wefCompetencyResults, { id: "w1", assessmentId: "a1", userId: "u-student" });
  s.add(organizationMembers, { id: "m1", userId: "u-student", organizationId: "org1" });
}

const SUBJECT_TABLES = [
  users, assessments, recommendations, assessmentQuizzes, quizResponses,
  cvqResults, wefCompetencyResults, organizationMembers,
];

// -------------------------------------------------------------------- tests --

beforeEach(() => {
  store = new Store();
  currentUserId = "u-student";
  recomputed.length = 0;
});

describe("eraseUserData", () => {
  // 1. The regression. Fails against main, where wef_competency_results is
  //    never deleted and delete(assessments) raises 23503.
  it("erases a premium student the old sequence could not", async () => {
    seedPremiumStudent(store);
    await expect(
      legacyEraseUserData(makeTx(store), "u-student", ["a1"]),
    ).rejects.toThrow(/23503.*wef_competency_results/);

    store = new Store();
    seedPremiumStudent(store);
    await expect(eraseUserData(makeTx(store), "u-student")).resolves.toBeUndefined();
    expect(store.rows(wefCompetencyResults)).toHaveLength(0);
    expect(store.rows(users)).toHaveLength(0);
  });

  // 2. cvq_results.assessment_id is nullable while its user_id is NOT NULL, so a
  //    row written without an assessment was never reached by the old loop and
  //    blocked the users delete instead.
  it("erases a cvq_results row that has no assessment", async () => {
    seedPremiumStudent(store);
    store.add(cvqResults, { id: "c2", assessmentId: null, userId: "u-student" });

    await expect(eraseUserData(makeTx(store), "u-student")).resolves.toBeUndefined();
    expect(store.rows(cvqResults)).toHaveLength(0);
  });

  // The other half of the or(): wef rows written while the assessment was still
  // a guest assessment carry a null user_id, so an owner-only delete misses them
  // and fails on delete(assessments) exactly as before the fix.
  it("erases a wef row from a guest assessment the user later registered against", async () => {
    seedPremiumStudent(store);
    store.add(assessments, { id: "a2", userId: "u-student", assessmentType: "premium" });
    store.add(wefCompetencyResults, { id: "w2", assessmentId: "a2", userId: null, isGuest: true });

    await expect(eraseUserData(makeTx(store), "u-student")).resolves.toBeUndefined();
    expect(store.rows(wefCompetencyResults)).toHaveLength(0);
  });

  // 3. Nothing of the subject survives.
  it("leaves no row in any table that holds the user's own data", async () => {
    seedPremiumStudent(store);
    await eraseUserData(makeTx(store), "u-student");
    for (const table of SUBJECT_TABLES) {
      expect(store.rows(table), `${name(table)} should be empty`).toHaveLength(0);
    }
  });

  // The licence-seat leak: erasing an account frees the school's seat, because
  // the counters are recomputed from the roster the membership row just left.
  it("recomputes the school's licence usage after removing the membership", async () => {
    seedPremiumStudent(store);
    await eraseUserData(makeTx(store), "u-student");
    expect(recomputed).toEqual(["org1"]);
  });

  it("recomputes nothing for a user who belongs to no school", async () => {
    store.add(users, { id: "u-solo" });
    store.add(assessments, { id: "a-solo", userId: "u-solo" });
    await eraseUserData(makeTx(store), "u-solo");
    expect(recomputed).toEqual([]);
  });

  it("does not touch another user's records", async () => {
    seedPremiumStudent(store);
    store.add(users, { id: "u-other" });
    store.add(assessments, { id: "a9", userId: "u-other" });
    store.add(wefCompetencyResults, { id: "w9", assessmentId: "a9", userId: "u-other" });

    await eraseUserData(makeTx(store), "u-student");
    expect(store.rows(users).map((r) => r.id)).toEqual(["u-other"]);
    expect(store.rows(assessments).map((r) => r.id)).toEqual(["a9"]);
    expect(store.rows(wefCompetencyResults).map((r) => r.id)).toEqual(["w9"]);
  });
});

describe("collectBlockingAuditRecords", () => {
  it("is empty for a student, so their erasure runs", async () => {
    seedPremiumStudent(store);
    expect(await collectBlockingAuditRecords(makeTx(store), "u-student")).toEqual([]);
  });

  it("names the audit records that block an org admin", async () => {
    store.add(users, { id: "u-admin", accountType: "org_admin" });
    store.add(organizations, { id: "org1", adminUserId: "u-admin" });
    store.add(organizationEvents, { id: "e1", organizationId: "org1", performedBy: "u-admin" });

    const blocking = await collectBlockingAuditRecords(makeTx(store), "u-admin");
    expect(blocking).toHaveLength(2);
    expect(blocking[0]).toMatch(/registered administrator/);
    expect(blocking[1]).toMatch(/activity-log entries recording actions you performed/);
  });
});

// 4. The route, end to end: an org admin must get a 409 that names what blocks
//    it, not the 23503-shaped 500 the same rows would otherwise produce.
describe("DELETE /api/users/me", () => {
  async function del(): Promise<{ status: number; body: any }> {
    const app = express();
    app.use(express.json());
    registerUserRoutes(app);
    const server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/me`, { method: "DELETE" });
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  it("refuses an org admin with 409 and names the blocking records", async () => {
    currentUserId = "u-admin";
    store.add(users, { id: "u-admin", accountType: "org_admin" });
    store.add(organizations, { id: "org1", adminUserId: "u-admin" });
    store.add(organizationEvents, { id: "e1", organizationId: "org1", performedBy: "u-admin" });

    const { status, body } = await del();
    expect(status).toBe(409);
    expect(body.code).toBe("ERASURE_BLOCKED_BY_AUDIT_RECORDS");
    expect(body.blockingRecords).toHaveLength(2);
    // Refusing must not delete: the admin's own user row is still there.
    expect(store.rows(users)).toHaveLength(1);
  });

  it("erases a premium student and reports what it deleted, without claiming more", async () => {
    seedPremiumStudent(store);
    const { status, body } = await del();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deleted).toContain("WEF competency results");
    // The old string claimed "all associated data", which organization_consents
    // retention makes untrue for an attester (schema.ts:1553-1558).
    expect(body.message).not.toMatch(/all associated data/i);
    expect(store.rows(users)).toHaveLength(0);
  });
});
