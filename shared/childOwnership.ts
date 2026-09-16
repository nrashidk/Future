/**
 * Whether a record created at `recordCreatedAt` should be treated as a
 * parent-registers account's CHILD's — as opposed to the account holder's
 * own, from before they ever registered a child — given the child profile's
 * own `createdAt`. See docs/parent-registers-scoping.md item 1's residual
 * conflation.
 *
 * SHARED, DELIBERATELY, ACROSS THREE CALL SITES with three different input
 * shapes: server/routes/assessment.routes.ts (the write-side lock — does a
 * PATCH get its demographics overwritten to the child's), server/storage.ts's
 * getStudentCareerEvolution (the Career Journey's server-side per-grade
 * collapse), and client/src/pages/Profile.tsx (the same collapse, computed
 * independently client-side over a differently-shaped list). The predicate
 * itself is the one piece cheap enough to single-source; what still differs
 * at each site — fetching the child profile, shaping records into something
 * filterable, and calling collapseToLatestPerGrade — is not, and is recorded
 * as a consolidation candidate in FOLLOWUP.md rather than fixed here.
 *
 * ANCHORED ON THE CHILD PROFILE'S OWN createdAt, NOT THE CONSENT RECORD'S
 * (child_guardian_consents.createdAt). The question this answers is "did a
 * child subject exist on this account when this record was created" —
 * exactly what child_profiles.createdAt records. The consent row's
 * timestamp answers a different question (when was consent attested or
 * re-attested) that can diverge from it: child_guardian_consents is
 * append-only, mirroring organization_consents' re-attestation shape, so a
 * future re-consent could insert a new consent row well after the child
 * profile itself was created — anchoring on that would move the boundary for
 * a reason that has nothing to do with who the subject is.
 *
 * INCLUSIVE (>=), not strict (>). This keeps one predicate true at every
 * call site, including the one (assessment creation) where the comparison is
 * unconditional: a brand-new record's timestamp is being minted "now" and
 * the child profile — already committed, already read back by the same
 * request — necessarily has a createdAt at or before it. A tie is not
 * reachable in practice: registration and every one of these records'
 * creation are always separate, sequential requests, so a record's own
 * INSERT cannot start before the child profile's INSERT has already
 * committed and been read back by the request that creates it.
 */
export function assessmentIsChildOwned(
  recordCreatedAt: Date | string | null | undefined,
  childProfileCreatedAt: Date | string | null | undefined,
): boolean {
  // Absent on either side fails closed to "not child-owned" — a missing
  // childProfileCreatedAt means there is no profile to own it, and a missing
  // recordCreatedAt is handled by callers before this function is reached (a
  // create supplies "now"), not by treating "unknown" as "after".
  if (!recordCreatedAt || !childProfileCreatedAt) return false;
  const recordTime = new Date(recordCreatedAt).getTime();
  const childProfileTime = new Date(childProfileCreatedAt).getTime();
  return recordTime >= childProfileTime;
}
