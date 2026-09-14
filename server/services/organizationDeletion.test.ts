/**
 * Both school-delete endpoints must do the same thing, report it truthfully,
 * and leave a record exactly when the school is gone.
 *
 * THE DEFECT THIS PINS. DELETE /api/superadmin/organizations/:id ran a guarded,
 * transactional sequence. POST /api/superadmin/organizations/bulk/delete ran a
 * bare DELETE FROM organizations and then inserted an organization_deleted
 * event against the id it had just removed. For a populated school the DELETE
 * 23503'd; for an empty one it committed, the insert 23503'd, and the deleted
 * school was reported as failed. `legacyBulkDeleteOne` below is that sequence,
 * run against the same fake, so the regression is shown rather than asserted.
 *
 * WHY THE FAKE ENFORCES FOREIGN KEYS AND ROLLS BACK. A test that only checked
 * which statements ran would pass against a sequence that still strands a row,
 * and both "failure means nothing happened" and "a record exists iff the delete
 * committed" are only claims if a failure mid-way actually leaves the store as
 * it was.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import {
  organizations, organizationMembers, organizationEvents, files, quizQuestions,
  organizationDeletions,
} from "@shared/schema";

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: any, val: any) => ({ __k: "eq", col, val }),
    and: (...conds: any[]) => ({ __k: "and", conds }),
  };
});

let store: Store;

const SUPERADMIN = {
  id: "u-super", firstName: "Sam", lastName: "Super", email: "sam@platform.example", role: "superadmin",
};

vi.mock("../db", () => ({
  db: { transaction: (cb: any) => makeDb(store).transaction(cb) },
}));
vi.mock("../storage", () => ({
  storage: { getUser: async () => SUPERADMIN },
  CurriculumRenameError: class {},
}));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { userId: "u-super" };
    next();
  },
}));

const { getTableColumns, eq } = await import("drizzle-orm");
const { deleteOrganizationWithDependents, performerFrom } = await import("./organizationDeletion");
const { registerSuperadminRoutes } = await import("../routes/superadmin.routes");

// ---------------------------------------------------------------- fake db ---

const TABLES = [organizations, organizationMembers, organizationEvents, files, quizQuestions, organizationDeletions];
const COLS = new Map<any, string>();
for (const t of TABLES) for (const [k, c] of Object.entries(getTableColumns(t))) COLS.set(c, k);
const keyOf = (col: any) => COLS.get(col)!;

/** Every FK to organizations.id with NO ACTION, from shared/schema.ts. */
const CHILDREN: Array<{ table: any; key: string }> = [
  { table: organizationMembers, key: "organizationId" },
  { table: organizationEvents, key: "organizationId" },
  { table: files, key: "organizationId" },
  { table: quizQuestions, key: "contributedByOrgId" },
];

type Row = Record<string, any>;
class Store {
  data = new Map<any, Row[]>();
  failOnUpdateOf: any = null;
  failOnInsertOf: any = null;
  constructor() { for (const t of TABLES) this.data.set(t, []); }
  rows(t: any) { return this.data.get(t)!; }
  add(t: any, ...rows: Row[]) { this.rows(t).push(...rows); }
  snapshot() { return new Map([...this.data].map(([t, rows]) => [t, structuredClone(rows)])); }
  restore(snap: Map<any, Row[]>) { this.data = snap; }
  dump() { return JSON.stringify(TABLES.map((t) => this.rows(t))); }
}

function match(cond: any, row: Row): boolean {
  if (!cond) return true;
  if (cond.__k === "eq") return row[keyOf(cond.col)] === cond.val;
  if (cond.__k === "and") return cond.conds.every((c: any) => match(c, row));
  throw new Error(`unsupported condition: ${cond.__k}`);
}

const project = (rows: Row[], shape: Record<string, any>) =>
  rows.map((r) => Object.fromEntries(Object.entries(shape).map(([alias, col]) => [alias, r[keyOf(col)]])));

/** A statement that has already run: awaitable, or `.returning(shape)`. */
function done(affected: Row[]) {
  return {
    returning: (shape: Record<string, any>) => Promise.resolve(project(affected, shape)),
    then: (ok: any, bad: any) => Promise.resolve(undefined).then(ok, bad),
  };
}

function makeDb(s: Store) {
  const tx = {
    select(shape: Record<string, any>) {
      return {
        from(table: any) {
          let cond: any;
          const chain: any = {
            where(c: any) { cond = c; return chain; },
            for(_mode: string) { return chain; },
            then(ok: any, bad: any) {
              return Promise.resolve().then(() => project(s.rows(table).filter((r) => match(cond, r)), shape)).then(ok, bad);
            },
          };
          return chain;
        },
      };
    },
    delete(table: any) {
      return {
        where(c: any) {
          const victims = s.rows(table).filter((r) => match(c, r));
          if (table === organizations) {
            for (const child of CHILDREN) {
              if (s.rows(child.table).some((r) => victims.some((v) => v.id === r[child.key]))) {
                throw new Error(`23503 foreign_key_violation: delete on "organizations" is still referenced`);
              }
            }
          }
          s.data.set(table, s.rows(table).filter((r) => !victims.includes(r)));
          return done(victims);
        },
      };
    },
    update(table: any) {
      return {
        set: (values: Row) => ({
          where(c: any) {
            if (s.failOnUpdateOf === table) throw new Error("simulated failure mid-sequence");
            const hit = s.rows(table).filter((r) => match(c, r));
            for (const r of hit) Object.assign(r, values);
            return done(hit);
          },
        }),
      };
    },
    insert(table: any) {
      return {
        values: async (row: Row) => {
          if (s.failOnInsertOf === table) throw new Error("simulated failure writing the record");
          if (table === organizationEvents && !s.rows(organizations).some((o) => o.id === row.organizationId)) {
            throw new Error(`23503 foreign_key_violation: insert on "organization_events" references a missing organization`);
          }
          s.add(table, row);
        },
      };
    },
  };
  return {
    ...tx,
    async transaction(cb: any) {
      const snap = s.snapshot();
      try {
        return await cb(tx);
      } catch (e) {
        s.restore(snap);
        throw e;
      }
    },
  };
}

/** The bulk delete's per-org body before this work, against the same fake. */
async function legacyBulkDeleteOne(db: any, orgId: string) {
  try {
    const [org] = await db.select({ id: organizations.id, name: organizations.name })
      .from(organizations).where(eq(organizations.id, orgId));
    if (!org) return { success: false, error: "Organization not found" };
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.insert(organizationEvents).values({
      organizationId: orgId, eventType: "organization_deleted", performedBy: "u-super",
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ------------------------------------------------------------------ seeds ---

/** A school whose roster has been cleared: admins, history, a file, a question. */
function seedAdminOnlySchool(s: Store, id = "org-a") {
  s.add(organizations, { id, name: `School ${id}` });
  s.add(organizationMembers, { id: `m-admin-${id}`, organizationId: id, role: "admin" });
  s.add(organizationEvents, { id: `e-${id}`, organizationId: id, eventType: "admin_added" });
  s.add(files, { id: `f-${id}`, organizationId: id });
  s.add(quizQuestions, { id: `qq-${id}`, contributedByOrgId: id });
}

function seedOtherSchool(s: Store) {
  s.add(organizations, { id: "org-other", name: "Other School" });
  s.add(organizationMembers, { id: "m-other", organizationId: "org-other", role: "admin" });
}

const performer = performerFrom(SUPERADMIN);

beforeEach(() => {
  store = new Store();
});

// -------------------------------------------------------------------- tests --

describe("the bulk delete before this work", () => {
  it("could not delete any school with a member", async () => {
    seedAdminOnlySchool(store);
    const result = await legacyBulkDeleteOne(makeDb(store), "org-a");
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/23503/) });
  });

  // The misreport: the school is gone and the operator is told it failed.
  it("reported a school it had deleted as failed", async () => {
    store.add(organizations, { id: "org-empty", name: "Empty" });
    const result = await legacyBulkDeleteOne(makeDb(store), "org-empty");
    expect(result.success).toBe(false);
    expect(store.rows(organizations)).toHaveLength(0);
  });
});

describe("deleteOrganizationWithDependents", () => {
  it("deletes a school and everything that held it open, and nothing else", async () => {
    seedAdminOnlySchool(store);
    seedOtherSchool(store);
    const outcome = await deleteOrganizationWithDependents(makeDb(store), "org-a", performer);

    expect(outcome).toEqual({ status: "deleted", organizationName: "School org-a" });
    expect(store.rows(organizations).map((o) => o.id)).toEqual(["org-other"]);
    expect(store.rows(organizationMembers).map((m) => m.id)).toEqual(["m-other"]);
    expect(store.rows(organizationEvents)).toHaveLength(0);
    expect(store.rows(files)).toHaveLength(0);
    // Shared bank content is kept; only the attribution goes.
    expect(store.rows(quizQuestions)).toEqual([{ id: "qq-org-a", contributedByOrgId: null }]);
  });

  it("records the deletion: which school, who, and what went with it", async () => {
    seedAdminOnlySchool(store);
    await deleteOrganizationWithDependents(makeDb(store), "org-a", performer);

    expect(store.rows(organizationDeletions)).toEqual([{
      organizationId: "org-a",
      organizationName: "School org-a",
      performedBy: "u-super",
      performedByRole: "superadmin",
      performedByName: "Sam Super",
      performedByEmail: "sam@platform.example",
      adminMembersRemoved: 1,
      eventsRemoved: 1,
      filesRemoved: 1,
      questionsDetached: 1,
    }]);
  });

  it("refuses while students are enrolled, and writes nothing — no record either", async () => {
    seedAdminOnlySchool(store);
    store.add(organizationMembers, { id: "m-stu", organizationId: "org-a", role: "student" });
    const before = store.dump();

    const outcome = await deleteOrganizationWithDependents(makeDb(store), "org-a", performer);
    expect(outcome).toEqual({ status: "has_students", organizationName: "School org-a", studentCount: 1 });
    expect(store.dump()).toBe(before);
  });

  it("reports a missing school and records nothing", async () => {
    expect(await deleteOrganizationWithDependents(makeDb(store), "nope", performer)).toEqual({ status: "not_found" });
    expect(store.rows(organizationDeletions)).toHaveLength(0);
  });

  // Failure means nothing happened — the property the old bulk path lacked.
  it("rolls back whole when a step fails part-way", async () => {
    seedAdminOnlySchool(store);
    const before = store.dump();
    store.failOnUpdateOf = quizQuestions;

    await expect(deleteOrganizationWithDependents(makeDb(store), "org-a", performer)).rejects.toThrow(/simulated/);
    expect(store.dump()).toBe(before);
  });

  // The record and the delete are one act: no record means no deletion.
  it("does not delete the school if the record cannot be written", async () => {
    seedAdminOnlySchool(store);
    const before = store.dump();
    store.failOnInsertOf = organizationDeletions;

    await expect(deleteOrganizationWithDependents(makeDb(store), "org-a", performer)).rejects.toThrow(/record/);
    expect(store.dump()).toBe(before);
  });

  it("names a performer with no name or email by username, then id", () => {
    expect(performerFrom({ id: "u1", username: "ops1", email: null })).toEqual({
      userId: "u1", role: "superadmin", name: "ops1", email: null,
    });
    expect(performerFrom({ id: "u2" }).name).toBe("u2");
  });
});

describe("both delete endpoints", () => {
  async function call(method: string, path: string, body?: any) {
    const app = express();
    app.use(express.json());
    registerSuperadminRoutes(app);
    const server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  // The defect in one assertion: the same act, the same result — record included.
  it("leave identical state for the same school, record included", async () => {
    seedAdminOnlySchool(store);
    seedOtherSchool(store);
    const single = await call("DELETE", "/api/superadmin/organizations/org-a");
    const afterSingle = store.dump();

    store = new Store();
    seedAdminOnlySchool(store);
    seedOtherSchool(store);
    const bulk = await call("POST", "/api/superadmin/organizations/bulk/delete", { orgIds: ["org-a"] });

    expect(single.status).toBe(200);
    expect(bulk.body.results).toEqual([{ orgId: "org-a", name: "School org-a", success: true }]);
    expect(store.rows(organizationDeletions)).toHaveLength(1);
    expect(store.dump()).toBe(afterSingle);
  });

  it("bulk reports each school's real outcome", async () => {
    seedAdminOnlySchool(store, "org-a");
    seedAdminOnlySchool(store, "org-s");
    store.add(organizationMembers, { id: "m-stu", organizationId: "org-s", role: "student" });

    const { status, body } = await call("POST", "/api/superadmin/organizations/bulk/delete", {
      orgIds: ["org-a", "org-s", "org-missing"],
    });
    expect(status).toBe(200);
    expect(body.results).toEqual([
      { orgId: "org-a", name: "School org-a", success: true },
      expect.objectContaining({
        orgId: "org-s", success: false, code: "ORGANIZATION_HAS_STUDENTS", studentCount: 1,
      }),
      { orgId: "org-missing", name: null, success: false, error: "Organization not found" },
    ]);
    expect(store.rows(organizations).map((o) => o.id)).toEqual(["org-s"]);
    expect(store.rows(organizationDeletions).map((d) => d.organizationId)).toEqual(["org-a"]);
  });

  // A reported failure now means the school is still there, and unrecorded.
  it("bulk reports failure only when nothing was deleted", async () => {
    seedAdminOnlySchool(store);
    store.failOnUpdateOf = quizQuestions;
    const { body } = await call("POST", "/api/superadmin/organizations/bulk/delete", { orgIds: ["org-a"] });

    expect(body.results[0]).toMatchObject({ orgId: "org-a", success: false });
    expect(store.rows(organizations).map((o) => o.id)).toEqual(["org-a"]);
    expect(store.rows(organizationMembers)).toHaveLength(1);
    expect(store.rows(organizationDeletions)).toHaveLength(0);
  });

  it("single delete keeps its 409 and 404", async () => {
    seedAdminOnlySchool(store);
    store.add(organizationMembers, { id: "m-stu", organizationId: "org-a", role: "student" });
    const refused = await call("DELETE", "/api/superadmin/organizations/org-a");
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "ORGANIZATION_HAS_STUDENTS", studentCount: 1 });

    expect((await call("DELETE", "/api/superadmin/organizations/nope")).status).toBe(404);
  });
});
