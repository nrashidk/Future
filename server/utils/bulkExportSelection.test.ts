/**
 * Cross-tenant safety of the bulk-export member selection — the one property
 * in this feature that cannot be verified by reading admin.routes.ts alone.
 *
 * The route filters `members` (already scoped to one organization by
 * storage.getOrganizationMembersByOrganizationId) down to the requested
 * memberIds. Safety is emergent: nothing here REJECTS a foreign id, it just
 * has no match in `members` because `members` never contained it. That holds
 * only as long as `members` stays org-scoped and the filter stays an
 * intersection against it — reorder the two filters, or fetch members by the
 * requested ids directly instead of scoping first, and a POST could pull in
 * another organization's student. These tests pin the current, correct shape
 * so either regression fails loudly here rather than shipping silently.
 */

import { describe, it, expect } from "vitest";
import { resolveExportSelection } from "./bulkExportSelection";

describe("resolveExportSelection", () => {
  // Stands in for storage.getOrganizationMembersByOrganizationId's result for
  // ONE organization — a foreign member id, by construction, never appears
  // here, which is the entire safety property under test.
  const orgAMembers = [
    { id: "org-a-member-1", hasCompletedAssessment: true },
    { id: "org-a-member-2", hasCompletedAssessment: true },
    { id: "org-a-member-3", hasCompletedAssessment: false },
  ];

  it("exports nothing for a requested id belonging to another organization", () => {
    const result = resolveExportSelection(orgAMembers, ["org-b-member-99"]);

    expect(result.selectionMode).toBe("selected");
    expect(result.completedMembers).toEqual([]);
  });

  it("exports only the valid id from a mixed valid-plus-foreign request", () => {
    const result = resolveExportSelection(orgAMembers, ["org-a-member-1", "org-b-member-99"]);

    expect(result.selectionMode).toBe("selected");
    expect(result.completedMembers).toEqual([
      { id: "org-a-member-1", hasCompletedAssessment: true },
    ]);
  });

  it("still excludes a same-org id that has no completed assessment", () => {
    const result = resolveExportSelection(orgAMembers, ["org-a-member-3"]);

    expect(result.completedMembers).toEqual([]);
  });

  it("treats an empty or absent selection as everyone in the org", () => {
    expect(resolveExportSelection(orgAMembers, undefined)).toEqual({
      selectionMode: "all",
      completedMembers: [orgAMembers[0], orgAMembers[1]],
    });
    expect(resolveExportSelection(orgAMembers, [])).toEqual({
      selectionMode: "all",
      completedMembers: [orgAMembers[0], orgAMembers[1]],
    });
  });
});
