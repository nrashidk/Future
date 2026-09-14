/**
 * Removing a student and recording it are one act.
 *
 * THE DEFECT THIS PINS. applyRemovalDisposition committed the erase or detach
 * and the licence recompute in a transaction, then wrote the student_erased /
 * student_detached event AFTERWARDS, on its own connection. A failed insert left
 * the removal committed with no event, and the route reported failure for a
 * removal that had happened — the same class as the bulk school-delete
 * misreport fixed in 3fc4656, but on the path every student removal takes. The
 * seeded school in production has students and zero events, and nothing in the
 * row can say whether that means "never removed anyone" or "an insert failed".
 *
 * HOW THE FAKE TELLS THE TWO ORDERINGS APART. The transaction snapshots the
 * store and restores it if the callback throws. The storage mock writes the
 * event through whatever handle it is given: inside the transaction when passed
 * `tx`, straight to the store when not. So against the old ordering the removal
 * has already committed by the time the insert fails, and the rollback
 * assertions below fail.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type Store = {
  members: Array<{ id: string; userId: string; organizationId: string }>;
  users: Array<{ id: string; username: string; detachedAt: Date | null }>;
  events: Array<Record<string, any>>;
};

let store: Store;
let failEventInsert = false;
const txHandles: any[] = [];
const eventHandles: any[] = [];

vi.mock("../db", () => ({
  db: {
    transaction: async (cb: any) => {
      const snapshot = structuredClone(store);
      const tx = { inTransaction: true };
      txHandles.push(tx);
      try {
        return await cb(tx);
      } catch (e) {
        store = snapshot;
        throw e;
      }
    },
  },
}));

vi.mock("../storage", () => ({
  storage: {
    getUser: async (id: string) => store.users.find((u) => u.id === id),
    recomputeOrganizationLicenseUsage: async () => ({ usedLicenses: 0, rewardCreditsUsed: 0 }),
    createOrganizationEvent: async (event: any, tx?: any) => {
      eventHandles.push(tx);
      if (failEventInsert) throw new Error("simulated event insert failure");
      store.events.push(event);
      return event;
    },
  },
  SubjectNotInCatalogueError: class {},
}));

vi.mock("../services/accountErasure", () => ({
  eraseUserData: async (_tx: any, userId: string) => {
    store.members = store.members.filter((m) => m.userId !== userId);
    store.users = store.users.filter((u) => u.id !== userId);
  },
  detachUserFromOrganization: async (_tx: any, userId: string) => {
    store.members = store.members.filter((m) => m.userId !== userId);
    const user = store.users.find((u) => u.id === userId);
    if (user) user.detachedAt = new Date("2026-09-14T00:00:00Z");
  },
}));

const { applyRemovalDisposition } = await import("./admin.routes");

const member = { id: "m-stu", userId: "u-stu", organizationId: "org1", studentName: "Layla Hassan" };
const organization = { id: "org1", name: "Test High School" };

beforeEach(() => {
  store = {
    members: [{ id: "m-stu", userId: "u-stu", organizationId: "org1" }],
    users: [{ id: "u-stu", username: "stu1", detachedAt: null }],
    events: [],
  };
  failEventInsert = false;
  txHandles.length = 0;
  eventHandles.length = 0;
});

describe("applyRemovalDisposition", () => {
  for (const disposition of ["detach", "erase"] as const) {
    it(`rolls back a ${disposition} when its event cannot be written`, async () => {
      failEventInsert = true;

      await expect(
        applyRemovalDisposition(member, organization, disposition, "u-admin", false),
      ).rejects.toThrow(/simulated event insert failure/);

      // Nothing happened: the student is still enrolled, still has their
      // account, and is not detached. A reported failure is a true one.
      expect(store.members.map((m) => m.id)).toEqual(["m-stu"]);
      expect(store.users).toEqual([{ id: "u-stu", username: "stu1", detachedAt: null }]);
      expect(store.events).toEqual([]);
    });
  }

  it("writes the event through the removal's own transaction", async () => {
    await applyRemovalDisposition(member, organization, "detach", "u-admin", false);

    expect(txHandles).toHaveLength(1);
    expect(eventHandles).toEqual([txHandles[0]]);
    expect(store.members).toEqual([]);
    expect(store.events).toEqual([
      expect.objectContaining({ organizationId: "org1", eventType: "student_detached" }),
    ]);
  });

  // Carried over unchanged, and the reason it matters: an affected_user_id FK to
  // the student would make this row an actor record that blocks their erasure.
  it("still does not name the student in affectedUserId", async () => {
    await applyRemovalDisposition(member, organization, "erase", "u-admin", true);

    expect(store.events).toHaveLength(1);
    expect(store.events[0]).not.toHaveProperty("affectedUserId");
    expect(store.events[0]).toMatchObject({
      eventType: "student_erased",
      performedByRole: "superadmin",
      previousValue: { studentName: "Layla Hassan", username: "stu1" },
    });
  });
});
