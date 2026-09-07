/**
 * The one place a student's display name is split into users.firstName /
 * users.lastName.
 *
 * organization_members.student_name holds the name as the school typed it;
 * users.firstName/lastName hold a split of the same string. That duplication
 * predates this helper (createUserWithCredentials derived both at create time
 * and nothing could edit either afterwards), and it is only safe while every
 * writer splits identically — a second copy of this three-line split is how the
 * two would drift. Both the create path and the member-update path call this.
 *
 * The fallbacks are load-bearing, not defensive padding: users.firstName and
 * users.lastName are NOT NULL, and at create time the split also seeds the
 * username. Preserved from the original at server/storage.ts so an existing row
 * re-split through this function is unchanged.
 */
export function splitStudentName(fullName: string): { firstName: string; lastName: string } {
  const nameParts = fullName.trim().split(/\s+/);
  return {
    firstName: nameParts[0] || 'Student',
    lastName: nameParts.slice(1).join(' ') || 'User',
  };
}
