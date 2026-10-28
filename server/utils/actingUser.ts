/**
 * The id of the acting user, from the session.
 *
 * Passport stores { userId, ... } on this app's session — there is no `id`.
 * Three write sites in this file read `user.id` directly and therefore wrote
 * undefined: the review path (reviewedByUserId), the manual reward allocation
 * (awardedByUserId, a NOT NULL column, so that endpoint 500s outright) and the
 * settings audit (changedBy). Two sibling lines in the same file already did
 * `user.userId || user.id` correctly, which is exactly how the discrepancy
 * survived review — the right idiom was visible a few lines away and still
 * not copied.
 *
 * Named once here so the next write site cannot get it wrong by inattention.
 * The `?? user?.id` arm is kept rather than dropped: it costs nothing and
 * preserves the two call sites' existing behaviour verbatim.
 */
export const actingUserId = (user: any): string | undefined => user?.userId ?? user?.id;
