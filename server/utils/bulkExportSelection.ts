/**
 * Resolves which org members a bulk export should cover, given an optional
 * client-requested id selection.
 *
 * Extracted out of the route handler (admin.routes.ts) specifically so the
 * cross-tenant safety property here is pinned by a test rather than resting
 * on the handler's plumbing: `members` must already be scoped to one
 * organization (storage.getOrganizationMembersByOrganizationId) BEFORE it
 * reaches this function. The safety is emergent, not enforced here — a
 * requested id for a different organization simply has no match in `members`
 * and silently contributes nothing. This function does not, and cannot,
 * verify that `members` was scoped correctly; it only guarantees that IF it
 * was, a foreign id cannot smuggle in a member it doesn't already contain.
 */
export interface OrgMemberForExport {
  id: string;
  hasCompletedAssessment: boolean;
}

export interface ExportSelection<M extends OrgMemberForExport> {
  selectionMode: "all" | "selected";
  completedMembers: M[];
}

export function resolveExportSelection<M extends OrgMemberForExport>(
  members: M[],
  requestedMemberIds: string[] | undefined,
): ExportSelection<M> {
  const hasSelection = !!requestedMemberIds && requestedMemberIds.length > 0;
  const scopedMembers = hasSelection
    ? members.filter((m) => requestedMemberIds!.includes(m.id))
    : members;
  return {
    selectionMode: hasSelection ? "selected" : "all",
    completedMembers: scopedMembers.filter((m) => m.hasCompletedAssessment),
  };
}
