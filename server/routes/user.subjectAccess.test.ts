/**
 * The subject-access export must return what the system holds about a person,
 * and the data summary must count the same thing.
 *
 * THE DEFECT THIS PINS. GET /api/users/me/export read a hand-written list:
 * nine users columns, assessments with recommendations, quiz and CVQ data. It
 * never read wef_competency_results or organization_members — the student's
 * derived competency profile and everything their school recorded about them —
 * and it read cvq_results per assessment, dropping a row without one. It
 * returned 200 and a file that looked complete. data-summary put a totalRecords
 * number on the same short list.
 *
 * WHY THE FIRST TEST WALKS THE REAL SCHEMA. The erasure gap was found because
 * Postgres refused. Nothing refuses an export, so the only thing that can catch
 * the next table is a test that reads every foreign key from shared/schema.ts
 * and fails on one the registry has not classified.
 *
 * db/storage/auth are mocked so importing the route module does not pull in
 * db.ts, which throws at import when DATABASE_URL is unset — same pattern as
 * user.erasure.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";
import {
  users, assessments, recommendations, assessmentQuizzes, quizResponses,
  cvqResults, wefCompetencyResults, llmNarrativeCache, organizationMembers,
  organizations, organizationConsents, organizationEvents, passwordResetTokens,
  files, contributionSubmissions, contributionRewards, scoringConfigChangeLog,
  systemAnnouncements, systemConfig, organizationDeletions,
} from "@shared/schema";

// Only the predicate builders are replaced, so the fake can read them.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: any, val: any) => ({ __k: "eq", col, val }),
    or: (...conds: any[]) => ({ __k: "or", conds }),
    and: (...conds: any[]) => ({ __k: "and", conds }),
    inArray: (col: any, vals: any[]) => ({ __k: "in", col, vals }),
    lte: (col: any, val: any) => ({ __k: "lte", col, val }),
    desc: (col: any) => ({ __k: "desc", col }),
  };
});

let currentUserId = "u-student";
let store: Store;

vi.mock("../db", () => ({
  db: { select: (shape?: any) => makeDb(store).select(shape) },
}));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { userId: currentUserId };
    next();
  },
}));
vi.mock("../middleware/rateLimiter.middleware", () => ({
  dataExportLimiter: (_req: any, _res: any, next: any) => next(),
}));

const { getTableColumns } = await import("drizzle-orm");
const { BLOCKING_AUDIT_SOURCES } = await import("../services/accountErasure");
const { SUBJECT_ACCESS_REGISTRY, collectSubjectAccess, summarizeSubjectAccess } =
  await import("../services/subjectAccess");
const { registerUserRoutes } = await import("./user.routes");

// ---------------------------------------------------------------- fake db ---

const TABLES = [
  users, assessments, recommendations, assessmentQuizzes, quizResponses,
  cvqResults, wefCompetencyResults, llmNarrativeCache, organizationMembers,
  organizations, organizationConsents, organizationEvents, passwordResetTokens,
  files, contributionSubmissions, contributionRewards, scoringConfigChangeLog,
  systemAnnouncements, systemConfig, organizationDeletions,
];

const COLS = new Map<any, { table: any; key: string }>();
for (const table of TABLES) {
  for (const [key, col] of Object.entries(getTableColumns(table))) COLS.set(col, { table, key });
}
const keyOf = (col: any) => COLS.get(col)!.key;

type Row = Record<string, any>;
class Store {
  data = new Map<any, Row[]>();
  constructor() { for (const t of TABLES) this.data.set(t, []); }
  rows(table: any): Row[] { return this.data.get(table)!; }
  add(table: any, ...rows: Row[]) { this.rows(table).push(...rows); }
}

const time = (v: any) => (v instanceof Date ? v.getTime() : v);

function match(cond: any, row: Row): boolean {
  if (!cond) return true;
  switch (cond.__k) {
    case "eq": return row[keyOf(cond.col)] === cond.val;
    case "in": return cond.vals.includes(row[keyOf(cond.col)]);
    case "or": return cond.conds.some((c: any) => match(c, row));
    case "and": return cond.conds.every((c: any) => match(c, row));
    case "lte": {
      const v = row[keyOf(cond.col)];
      return v != null && time(v) <= time(cond.val);
    }
  }
  throw new Error(`unsupported condition in fake db: ${cond.__k}`);
}

function makeDb(s: Store) {
  return {
    select(shape?: Record<string, any>) {
      return {
        from(table: any) {
          const q: { cond?: any; order?: any; n?: number } = {};
          const exec = () => {
            let rows = s.rows(table).filter((r) => match(q.cond, r));
            if (q.order) {
              const k = keyOf(q.order.col);
              rows = [...rows].sort((a, b) => time(b[k]) - time(a[k]));
            }
            if (q.n != null) rows = rows.slice(0, q.n);
            return rows.map((r) => {
              if (!shape) return { ...r };
              const out: Row = {};
              for (const [alias, col] of Object.entries(shape)) out[alias] = r[keyOf(col)];
              return out;
            });
          };
          const chain: any = {
            where(c: any) { q.cond = c; return chain; },
            orderBy(o: any) { q.order = o; return chain; },
            limit(n: number) { q.n = n; return chain; },
            then(ok: any, bad: any) { return Promise.resolve().then(exec).then(ok, bad); },
          };
          return chain;
        },
      };
    },
  };
}

// ------------------------------------------------------------------ seeds ---

const ENROLLED = new Date("2026-02-01T00:00:00Z");

/**
 * A users row with EVERY column set, built from the schema rather than typed
 * out — so a column added tomorrow is seeded, and the exclusion-list test below
 * checks it is exported without anyone editing this file.
 */
function fullUserRow(id: string, extra: Row = {}): Row {
  const row: Row = {};
  for (const key of Object.keys(getTableColumns(users))) row[key] = `${key}-value`;
  return { ...row, id, createdAt: new Date("2026-01-01T00:00:00Z"), detachedAt: null, ...extra };
}

/** A school student with one premium assessment and every kind of subject row. */
function seedStudent(s: Store) {
  s.add(users, fullUserRow("u-student", {
    username: "stu1", passwordHash: "$2b$10$hashhashhash", accountType: "org_student",
  }));
  s.add(assessments, { id: "a1", userId: "u-student", assessmentType: "premium", createdAt: new Date("2026-03-01") });
  s.add(recommendations, { id: "rec1", assessmentId: "a1", scoringProvenance: { regime: "x" } });
  s.add(assessmentQuizzes, { id: "q1", assessmentId: "a1" });
  s.add(quizResponses, { id: "r1", assessmentQuizId: "q1", questionId: "qq1" });
  s.add(llmNarrativeCache, { id: "n1", assessmentId: "a1", careerId: "c-eng", narrative: "You would thrive…" });
  s.add(cvqResults, { id: "c1", assessmentId: "a1", userId: "u-student" });
  s.add(wefCompetencyResults, { id: "w1", assessmentId: "a1", userId: "u-student" });
  s.add(organizations, { id: "org1", name: "Al Noor School", adminUserId: "u-admin" });
  s.add(organizationMembers, {
    id: "m1", userId: "u-student", organizationId: "org1", role: "student",
    studentName: "Layla Hassan", dateOfBirth: "2011-05-04", grade: "grade9",
    studentId: "S-0042", studentGender: "female", createdAt: ENROLLED,
    passwordLastResetBy: "u-admin", passwordLastResetAt: new Date("2026-04-02T00:00:00Z"),
  });
  s.add(passwordResetTokens, {
    id: "t1", userId: "u-student", token: "reset-token-secret",
    createdAt: new Date("2026-04-01"), expiresAt: new Date("2026-04-01T01:00:00Z"), usedAt: null,
  });
}

function consent(id: string, createdAt: Date, extra: Row = {}): Row {
  return {
    id, organizationId: "org1", organizationName: "Al Noor School",
    consentsToProcessing: true, attestsGuardianConsent: true,
    performedBy: "u-admin", performedByRole: "org_admin",
    performedByName: "Admin Person", performedByEmail: "admin@alnoor.example",
    policyVersion: `pv-${id}`, policyLastUpdated: "2026", policyLocale: "en",
    ipAddress: "10.0.0.1", userAgent: "UA", attestationTextHash: "h", createdAt,
    ...extra,
  };
}

beforeEach(() => {
  store = new Store();
  currentUserId = "u-student";
});

// -------------------------------------------------------------------- tests --

describe("SUBJECT_ACCESS_REGISTRY", () => {
  // 1. The guard for the silent direction. Walks every FK in shared/schema.ts
  //    from users outward, following only subject rows, and requires each one
  //    to have been classified.
  it("classifies every foreign key that reaches a user's data", () => {
    const allFks = Object.values(schema).flatMap((v: any) => {
      try { return getTableConfig(v).foreignKeys.map((fk) => fk.reference()); } catch { return []; }
    });
    const registered = new Map(SUBJECT_ACCESS_REGISTRY.map((e) => [e.column, e]));

    const reached = new Set<any>([users]);
    const unclassified: string[] = [];
    let grew = true;
    while (grew) {
      grew = false;
      for (const ref of allFks) {
        if (!reached.has(ref.foreignTable)) continue;
        const column = ref.columns[0];
        const entry = registered.get(column);
        const child = (column as any).table;
        const label = `${getTableConfig(child).name}.${column.name}`;
        if (!entry) {
          if (!unclassified.includes(label)) unclassified.push(label);
          continue;
        }
        if (entry.kind === "subject" && !reached.has(child)) {
          reached.add(child);
          grew = true;
        }
      }
    }
    expect(unclassified, "classify these in SUBJECT_ACCESS_REGISTRY as subject or actor").toEqual([]);
  });

  // 2. The actor half IS the erasure 409's list, so the two cannot drift.
  it("takes its actor rows from the same list as the erasure 409", () => {
    const actors = SUBJECT_ACCESS_REGISTRY.filter((e) => e.kind === "actor").map((e) => e.column);
    expect(actors).toEqual(BLOCKING_AUDIT_SOURCES.map((s) => s.column));
  });

  // 3. Classifying a table as subject is a promise; this checks it is kept.
  //    Each subject entry names a section, and that section must carry the row.
  it("returns a seeded row for every subject entry", async () => {
    seedStudent(store);
    store.add(organizationConsents, consent("k-own", new Date("2026-01-15"), { performedBy: "u-student" }));
    store.add(organizationDeletions, {
      id: "d-own", organizationId: "org-gone", organizationName: "Closed School",
      performedBy: "u-student", performedByRole: "superadmin",
      performedByName: "Layla Hassan", performedByEmail: null,
      adminMembersRemoved: 1, eventsRemoved: 2, filesRemoved: 0, questionsDetached: 0,
      createdAt: new Date("2026-05-01"),
    });
    const out: any = await collectSubjectAccess(makeDb(store), "u-student");

    const sectionOf: Record<string, (o: any) => any[]> = {
      assessments: (o) => o.assessments,
      cvqResults: (o) => o.cvqResults,
      wefCompetencyResults: (o) => o.wefCompetencyResults,
      schoolEnrolment: (o) => (o.schoolEnrolment ? [o.schoolEnrolment] : []),
      passwordResetRequests: (o) => o.passwordResetRequests,
      consentAttestationsYouMade: (o) => o.consentAttestationsYouMade,
      organizationDeletionsYouPerformed: (o) => o.organizationDeletionsYouPerformed,
    };
    for (const entry of SUBJECT_ACCESS_REGISTRY) {
      if (entry.kind !== "subject") continue;
      const read = sectionOf[entry.section];
      expect(read, `no reader for section ${entry.section}`).toBeDefined();
      expect(read(out).length, `section ${entry.section} is empty`).toBeGreaterThan(0);
    }
    const a1 = out.assessments[0];
    expect(a1.recommendations.map((r: any) => r.id)).toEqual(["rec1"]);
    expect(a1.quizzes[0].responses.map((r: any) => r.id)).toEqual(["r1"]);
    expect(a1.careerNarratives.map((n: any) => n.narrative)).toEqual(["You would thrive…"]);
  });
});

describe("collectSubjectAccess", () => {
  // The two tables the old export never read — the reason this commit exists.
  it("returns the school-recorded enrolment and the WEF competency profile", async () => {
    seedStudent(store);
    const out: any = await collectSubjectAccess(makeDb(store), "u-student");
    expect(out.schoolEnrolment).toMatchObject({
      studentName: "Layla Hassan", dateOfBirth: "2011-05-04", grade: "grade9",
      studentId: "S-0042", studentGender: "female", organizationName: "Al Noor School",
    });
    expect(out.wefCompetencyResults.map((w: any) => w.id)).toEqual(["w1"]);
  });

  // Exclusion, not inclusion: every users column is exported except the hash.
  it("exports every users column except passwordHash", async () => {
    seedStudent(store);
    const out: any = await collectSubjectAccess(makeDb(store), "u-student");
    const expected = Object.keys(getTableColumns(users)).filter((k) => k !== "passwordHash");
    expect(Object.keys(out.account).sort()).toEqual(expected.sort());
  });

  // Which staff member reset the password is data about them; that it was reset,
  // and when, is about the student.
  it("withholds who reset the student's password but keeps when", async () => {
    seedStudent(store);
    const out: any = await collectSubjectAccess(makeDb(store), "u-student");
    expect(out.schoolEnrolment).not.toHaveProperty("passwordLastResetBy");
    expect(out.schoolEnrolment.passwordLastResetAt).toEqual(new Date("2026-04-02T00:00:00Z"));
    expect(JSON.stringify(out.schoolEnrolment)).not.toContain("u-admin");
  });

  it("never puts a credential in the file", async () => {
    seedStudent(store);
    const text = JSON.stringify(await collectSubjectAccess(makeDb(store), "u-student"));
    expect(text).not.toContain("$2b$10$hashhashhash");
    expect(text).not.toContain("reset-token-secret");
  });

  it("returns a cvq row with no assessment and a wef row from a guest assessment", async () => {
    seedStudent(store);
    store.add(cvqResults, { id: "c2", assessmentId: null, userId: "u-student" });
    store.add(assessments, { id: "a2", userId: "u-student", createdAt: new Date("2026-03-02") });
    store.add(wefCompetencyResults, { id: "w2", assessmentId: "a2", userId: null, isGuest: true });

    const out: any = await collectSubjectAccess(makeDb(store), "u-student");
    expect(out.cvqResults.map((c: any) => c.id).sort()).toEqual(["c1", "c2"]);
    expect(out.wefCompetencyResults.map((w: any) => w.id).sort()).toEqual(["w1", "w2"]);
  });

  it("returns nothing belonging to another user", async () => {
    seedStudent(store);
    store.add(users, fullUserRow("u-other"));
    store.add(assessments, { id: "a9", userId: "u-other" });
    store.add(cvqResults, { id: "c9", assessmentId: "a9", userId: "u-other" });
    store.add(wefCompetencyResults, { id: "w9", assessmentId: "a9", userId: "u-other" });

    const text = JSON.stringify(await collectSubjectAccess(makeDb(store), "u-student"));
    for (const id of ["a9", "c9", "w9", "u-other"]) expect(text).not.toContain(`"${id}"`);
  });

  describe("the school consent covering the student", () => {
    it("is the latest attestation on or before enrolment, not the latest overall", async () => {
      seedStudent(store);
      store.add(organizationConsents,
        consent("k-old", new Date("2025-09-01")),
        consent("k-covering", new Date("2026-01-15")),
        consent("k-later", new Date("2026-03-01")));

      const { schoolConsentCoveringYou: c }: any = await collectSubjectAccess(makeDb(store), "u-student");
      expect(c.basis).toBe("latest_attestation_on_or_before_enrolment");
      expect(c.attestation.policyVersion).toBe("pv-k-covering");
    });

    it("withholds the attesting staff member's identity, and says so", async () => {
      seedStudent(store);
      store.add(organizationConsents, consent("k-covering", new Date("2026-01-15")));
      const out: any = await collectSubjectAccess(makeDb(store), "u-student");
      const text = JSON.stringify(out.schoolConsentCoveringYou);
      expect(text).not.toContain("Admin Person");
      expect(text).not.toContain("admin@alnoor.example");
      expect(text).not.toContain("10.0.0.1");
      expect(out.schoolConsentCoveringYou.note).toMatch(/staff member.*not included/);
    });

    it("says there is none rather than substituting a later one", async () => {
      seedStudent(store);
      store.add(organizationConsents, consent("k-later", new Date("2026-03-01")));
      const { schoolConsentCoveringYou: c }: any = await collectSubjectAccess(makeDb(store), "u-student");
      expect(c.basis).toBe("no_attestation_on_or_before_enrolment");
      expect(c.attestation).toBeNull();
    });

    it("falls back to the latest only when the enrolment date is unknown, and states it", async () => {
      seedStudent(store);
      store.rows(organizationMembers)[0].createdAt = null;
      store.add(organizationConsents, consent("k-later", new Date("2026-03-01")));
      const { schoolConsentCoveringYou: c }: any = await collectSubjectAccess(makeDb(store), "u-student");
      expect(c.basis).toBe("latest_attestation_enrolment_date_unknown");
      expect(c.attestation.policyVersion).toBe("pv-k-later");
      expect(c.note).toMatch(/enrolment date is not recorded/);
    });
  });

  describe("school removal records (no foreign key)", () => {
    function seedDetached(s: Store) {
      s.add(users, fullUserRow("u-detached", {
        username: "stu7", passwordHash: null, createdAt: new Date("2026-01-01"), detachedAt: new Date("2026-06-01"),
      }));
      s.add(organizations, { id: "org1", name: "Al Noor School", adminUserId: "u-admin" });
    }
    const event = (id: string, username: string, createdAt: Date): Row => ({
      id, organizationId: "org1", eventType: "student_detached",
      eventDescription: `Removed student ${username}`, performedBy: "u-admin", performedByRole: "org_admin",
      previousValue: { studentName: `name of ${username}`, username }, createdAt,
    });

    it("returns the detach event that names this student", async () => {
      seedDetached(store);
      store.add(organizationEvents, event("e1", "stu7", new Date("2026-06-01")));
      const out: any = await collectSubjectAccess(makeDb(store), "u-detached");
      expect(out.schoolRemovalRecords).toHaveLength(1);
      expect(out.schoolRemovalRecords[0]).toMatchObject({ organizationName: "Al Noor School" });
      expect(out.schoolRemovalRecords[0]).not.toHaveProperty("performedBy");
    });

    // A freed username must not hand the next holder the previous one's name.
    it("does not return an event about an earlier holder of the same username", async () => {
      seedDetached(store);
      store.add(organizationEvents, event("e0", "stu7", new Date("2025-11-01")));
      const out: any = await collectSubjectAccess(makeDb(store), "u-detached");
      expect(out.schoolRemovalRecords).toEqual([]);
    });
  });

  describe("held but not included", () => {
    it("lists withheld credentials for a student, and no actor records", async () => {
      seedStudent(store);
      const { heldButNotIncluded: held }: any = await collectSubjectAccess(makeDb(store), "u-student");
      expect(held.map((h: any) => h.category)).toEqual([
        "your password", "password reset link codes",
        "which school staff member last reset your password", "any active login sessions",
      ]);
    });

    it("counts an admin's actor records under the erasure 409's labels", async () => {
      store.add(users, fullUserRow("u-admin", { accountType: "org_admin" }));
      store.add(organizations, { id: "org1", name: "Al Noor School", adminUserId: "u-admin" });
      store.add(organizationEvents,
        { id: "e1", organizationId: "org1", performedBy: "u-admin" },
        { id: "e2", organizationId: "org1", performedBy: "u-admin" });
      store.add(organizationConsents, consent("k1", new Date("2026-01-15")));

      const out: any = await collectSubjectAccess(makeDb(store), "u-admin");
      const actor = out.heldButNotIncluded.filter((h: any) => h.count != null);
      expect(actor).toEqual([
        expect.objectContaining({ category: BLOCKING_AUDIT_SOURCES[0].label, count: 1 }),
        expect.objectContaining({ category: BLOCKING_AUDIT_SOURCES[1].label, count: 2 }),
      ]);
      // Their own attestation is returned in full — it survives their erasure.
      expect(out.consentAttestationsYouMade[0]).toMatchObject({
        performedByName: "Admin Person", performedByEmail: "admin@alnoor.example",
      });
    });
  });
});

describe("GET /api/users/me/export and /data-summary", () => {
  async function get(path: string): Promise<{ status: number; body: any }> {
    const app = express();
    registerUserRoutes(app);
    const server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  it("exports what the old route omitted", async () => {
    seedStudent(store);
    const { status, body } = await get("/api/users/me/export");
    expect(status).toBe(200);
    expect(body.schoolEnrolment.studentName).toBe("Layla Hassan");
    expect(body.wefCompetencyResults).toHaveLength(1);
    expect(body.heldButNotIncluded.length).toBeGreaterThan(0);
  });

  // The summary is counted from the export, so the two cannot disagree.
  it("summarises exactly the records the export returns", async () => {
    seedStudent(store);
    const exported = await get("/api/users/me/export");
    const summary = await get("/api/users/me/data-summary");
    expect(summary.status).toBe(200);
    expect(summary.body.dataCategories).toMatchObject({ wefCompetencyResults: 1, schoolEnrolment: 1 });
    expect(summary.body).toEqual(JSON.parse(JSON.stringify(summarizeSubjectAccess(exported.body))));
    // account, a1, rec1, q1, r1, n1, c1, w1, m1, t1 — ten records seeded.
    expect(summary.body.totalRecords).toBe(10);
  });

  it("returns 404 for a user that does not exist", async () => {
    currentUserId = "u-missing";
    expect((await get("/api/users/me/export")).status).toBe(404);
    expect((await get("/api/users/me/data-summary")).status).toBe(404);
  });
});
