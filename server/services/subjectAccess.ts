/**
 * What the system holds about one person, for their own subject-access request.
 *
 * Two routes read this and must never disagree: GET /api/users/me/export returns
 * it, GET /api/users/me/data-summary counts it. Before this file each route kept
 * its own hand-written list of tables, and both lists were short — no
 * wef_competency_results, no organization_members row (where a school student's
 * name, date of birth, grade, student id and gender live), cvq_results read per
 * assessment so a row without one was dropped. The summary then put a
 * `totalRecords` number on the short list.
 *
 * THE SAME BUG CLASS AS THE ERASURE 500, POINTING THE OTHER WAY. Erasure's short
 * list was loud: Postgres refused the delete. An export's short list is silent —
 * it returns 200 and a file that looks complete, and nothing will ever refuse
 * it. So the defence cannot be "the database will tell us". It is
 * SUBJECT_ACCESS_REGISTRY below, which user.subjectAccess.test.ts checks against
 * a walk of the real FK graph: a new table that references a user fails that
 * test until someone decides whether it is about them.
 *
 * Erasure deliberately does NOT consume this registry yet. It works, and
 * restructuring the correct half to fit the fixed one is a risk with no bug
 * behind it. Unifying the two is a filed follow-up.
 */

import {
  users, assessments, recommendations, assessmentQuizzes, quizResponses,
  cvqResults, wefCompetencyResults, llmNarrativeCache, organizationMembers,
  organizations, organizationConsents, organizationEvents, passwordResetTokens,
  organizationDeletions,
} from "@shared/schema";
import { eq, or, and, inArray, lte, desc } from "drizzle-orm";
import { BLOCKING_AUDIT_SOURCES, collectBlockingAuditRecords } from "./accountErasure";
import { erasureConfirmationMethod } from "./erasureConfirmation";
import type { ErasureKeptCode, ErasureStatus } from "@shared/dataRights";
import { toClientRecommendations } from "../utils/recommendationView";

export type SubjectSection =
  | "account"
  | "assessments"
  | "cvqResults"
  | "wefCompetencyResults"
  | "schoolEnrolment"
  | "passwordResetRequests"
  | "consentAttestationsYouMade"
  | "organizationDeletionsYouPerformed";

/**
 * EVERY FOREIGN KEY THAT POINTS AT A USER, OR AT A ROW THAT IS ABOUT ONE.
 *
 * subject — the row is about this person; `section` names where the export
 *           returns it, and the test asserts that section actually carries it.
 * actor   — the row is someone else's record naming this person as who did
 *           something. Taken VERBATIM from BLOCKING_AUDIT_SOURCES, the list the
 *           erasure 409 uses, so "what blocks your erasure" and "what we hold
 *           but did not include" cannot drift apart.
 *
 * CASCADE ROWS ARE LISTED TOO. Erasure could ignore llm_narrative_cache and
 * password_reset_tokens because the database deletes them; an export has no
 * such help, and the narrative cache is model-written prose about this student.
 */
export const SUBJECT_ACCESS_REGISTRY: Array<
  | { column: any; kind: "subject"; section: SubjectSection }
  | { column: any; kind: "actor" }
> = [
  { column: assessments.userId, kind: "subject", section: "assessments" },
  { column: recommendations.assessmentId, kind: "subject", section: "assessments" },
  { column: assessmentQuizzes.assessmentId, kind: "subject", section: "assessments" },
  { column: quizResponses.assessmentQuizId, kind: "subject", section: "assessments" },
  { column: llmNarrativeCache.assessmentId, kind: "subject", section: "assessments" },
  { column: cvqResults.userId, kind: "subject", section: "cvqResults" },
  { column: cvqResults.assessmentId, kind: "subject", section: "cvqResults" },
  { column: wefCompetencyResults.userId, kind: "subject", section: "wefCompetencyResults" },
  { column: wefCompetencyResults.assessmentId, kind: "subject", section: "wefCompetencyResults" },
  { column: organizationMembers.userId, kind: "subject", section: "schoolEnrolment" },
  { column: passwordResetTokens.userId, kind: "subject", section: "passwordResetRequests" },
  // The attester's own act. performed_by_name and performed_by_email survive
  // this person's erasure by design (schema.ts organizationConsents), so they
  // are data the system holds about them and will not delete. Returned in full:
  // the row carries nobody else's personal data.
  { column: organizationConsents.performedBy, kind: "subject", section: "consentAttestationsYouMade" },
  // A school deletion this person performed. The same shape as the attestation
  // above: SET NULL, name and email kept past their own erasure by recorded
  // decision (FOLLOWUP.md, "ORGANIZATION DELETION RECORD — DECIDED 2026-09-14"),
  // and no one else's personal data in the row. NOT in BLOCKING_AUDIT_SOURCES:
  // an ON DELETE SET NULL reference cannot block erasure.
  { column: organizationDeletions.performedBy, kind: "subject", section: "organizationDeletionsYouPerformed" },
  ...BLOCKING_AUDIT_SOURCES.map((s) => ({ column: s.column, kind: "actor" as const })),
];

/**
 * DATA ABOUT A USER THAT NO FOREIGN KEY LEADS TO. The registry test cannot see
 * these, so they are named here instead, and each is a place to look when the
 * next one appears.
 *
 * schoolRemovalRecords — admin.routes.ts writes 'student_detached' events that
 * name the student in event_description and previous_value, deliberately WITHOUT
 * affected_user_id (an FK there would block the student's own erasure). A
 * detached student keeps their account and is exactly who will call this.
 */
export const NON_FK_SUBJECT_SOURCES = ["schoolRemovalRecords"] as const;

/** The only users column withheld. Everything else is exported by default. */
const WITHHELD_USER_COLUMN = "passwordHash";

const PRIVACY_CONTACT = "privacy@futurepath.ae";

export async function collectSubjectAccess(db: any, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;

  // AN EXCLUSION LIST, NOT AN INCLUSION LIST. The old export named nine columns
  // and every column added since — phone, OAuth identity, detachment, payment,
  // login activity, language — was silently absent. Removing the one credential
  // means a column added tomorrow is exported by default.
  const { [WITHHELD_USER_COLUMN]: passwordHash, ...account } = user;

  const owned = await db
    .select()
    .from(assessments)
    .where(eq(assessments.userId, userId))
    .orderBy(desc(assessments.createdAt));
  const assessmentIds: string[] = owned.map((a: any) => a.id);

  let recs: any[] = [];
  let quizzes: any[] = [];
  let responses: any[] = [];
  let narratives: any[] = [];
  if (assessmentIds.length > 0) {
    recs = await db.select().from(recommendations)
      .where(inArray(recommendations.assessmentId, assessmentIds));
    quizzes = await db.select().from(assessmentQuizzes)
      .where(inArray(assessmentQuizzes.assessmentId, assessmentIds));
    narratives = await db.select().from(llmNarrativeCache)
      .where(inArray(llmNarrativeCache.assessmentId, assessmentIds));
    const quizIds = quizzes.map((q) => q.id);
    if (quizIds.length > 0) {
      responses = await db.select().from(quizResponses)
        .where(inArray(quizResponses.assessmentQuizId, quizIds));
    }
  }

  // BOTH PREDICATES, for the same two reasons as accountErasure.ts: a cvq row can
  // have a null assessment_id (the old per-assessment read dropped it), and a wef
  // row written while the assessment was a guest one keeps a null user_id after
  // migrateGuestAssessments, which only re-owns the assessment.
  const ownedBy = (userCol: any, assessmentCol: any) =>
    assessmentIds.length > 0
      ? or(eq(userCol, userId), inArray(assessmentCol, assessmentIds))
      : eq(userCol, userId);

  const cvq = await db.select().from(cvqResults)
    .where(ownedBy(cvqResults.userId, cvqResults.assessmentId));
  const wef = await db.select().from(wefCompetencyResults)
    .where(ownedBy(wefCompetencyResults.userId, wefCompetencyResults.assessmentId));

  const [member] = await db.select().from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
  let schoolEnrolment: any = null;
  let schoolConsentCoveringYou: any = null;
  let resetByStaff = false;
  if (member) {
    const [org] = await db.select({ name: organizations.name }).from(organizations)
      .where(eq(organizations.id, member.organizationId));
    // WHICH STAFF MEMBER reset this student's password is data about that staff
    // member. An id is only not-a-name until someone correlates it, and an export
    // is the artifact that makes correlation possible. passwordLastResetAt stays:
    // that it happened, and when, is about the student.
    const { passwordLastResetBy, ...enrolment } = member;
    schoolEnrolment = { ...enrolment, organizationName: org?.name ?? null };
    resetByStaff = passwordLastResetBy != null;
    if (member.role === "student") {
      schoolConsentCoveringYou = await coveringAttestation(db, member);
    }
  }

  const schoolRemovalRecords = await removalRecords(db, user);

  // The value is a credential; that a reset was requested, and when, is not.
  const passwordResetRequests = await db
    .select({
      createdAt: passwordResetTokens.createdAt,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId));

  const consentAttestationsYouMade = await db.select().from(organizationConsents)
    .where(eq(organizationConsents.performedBy, userId));

  return {
    exportedAt: new Date().toISOString(),
    exportVersion: "2.0",
    account,
    assessments: owned.map((a: any) => ({
      ...a,
      // Withholds the scoring-regime identifiers only — they describe the
      // algorithm, not the student. Every score and reason is still returned.
      recommendations: toClientRecommendations(recs.filter((r) => r.assessmentId === a.id)),
      quizzes: quizzes
        .filter((q) => q.assessmentId === a.id)
        .map((q) => ({ ...q, responses: responses.filter((r) => r.assessmentQuizId === q.id) })),
      careerNarratives: narratives.filter((n) => n.assessmentId === a.id),
    })),
    cvqResults: cvq,
    wefCompetencyResults: wef,
    schoolEnrolment,
    schoolConsentCoveringYou,
    schoolRemovalRecords,
    passwordResetRequests,
    consentAttestationsYouMade,
    // Returned in full, like the attestations: the performer's own act, holding
    // a school's name and counts but no one else's personal data.
    organizationDeletionsYouPerformed: await db.select().from(organizationDeletions)
      .where(eq(organizationDeletions.performedBy, userId)),
    heldButNotIncluded: await heldButNotIncluded(db, userId, {
      hasPassword: passwordHash != null,
      resetRequests: passwordResetRequests.length,
      resetByStaff,
    }),
  };
}

/**
 * WHICH SCHOOL ATTESTATION COVERED THIS STUDENT — not simply the latest one.
 *
 * organization_consents is append-only, and the schema says why: which
 * attestation covered a student depends on when they were enrolled, and a
 * re-attestation after that is not the one their enrolment relied on. So this is
 * the most recent attestation created ON OR BEFORE the membership row. It is NOT
 * storage.getCurrentOrganizationConsent, which answers the enrolment gate's
 * question ("may this school enrol now"), a different one.
 *
 * Every outcome states its basis. A student enrolled before consent was recorded
 * has no covering row, and saying so is the answer — substituting a later
 * attestation would claim it covered an enrolment it post-dates.
 *
 * The attester's name, email, IP address and browser are that staff member's
 * data, not the student's, and are not returned here. The note says so.
 */
async function coveringAttestation(db: any, member: any) {
  const projection = {
    organizationName: organizationConsents.organizationName,
    consentsToProcessing: organizationConsents.consentsToProcessing,
    attestsGuardianConsent: organizationConsents.attestsGuardianConsent,
    policyVersion: organizationConsents.policyVersion,
    policyLastUpdated: organizationConsents.policyLastUpdated,
    policyLocale: organizationConsents.policyLocale,
    performedByRole: organizationConsents.performedByRole,
    attestedAt: organizationConsents.createdAt,
  };
  const bothClaims = [
    eq(organizationConsents.organizationId, member.organizationId),
    eq(organizationConsents.consentsToProcessing, true),
    eq(organizationConsents.attestsGuardianConsent, true),
  ];
  const withheld =
    "The name and contact details of the school staff member who recorded this are that person's data and are not included.";

  if (member.createdAt == null) {
    const [latest] = await db.select(projection).from(organizationConsents)
      .where(and(...bothClaims))
      .orderBy(desc(organizationConsents.createdAt))
      .limit(1);
    return {
      basis: "latest_attestation_enrolment_date_unknown",
      note: "Your enrolment date is not recorded, so this is your school's most recent consent record, which may post-date your enrolment. " + withheld,
      attestation: latest ?? null,
    };
  }

  const [covering] = await db.select(projection).from(organizationConsents)
    .where(and(...bothClaims, lte(organizationConsents.createdAt, member.createdAt)))
    .orderBy(desc(organizationConsents.createdAt))
    .limit(1);
  if (!covering) {
    return {
      basis: "no_attestation_on_or_before_enrolment",
      note: "Your school has no consent record dated on or before your enrolment. " +
        `Contact ${PRIVACY_CONTACT} to ask on what basis your data was processed.`,
      attestation: null,
    };
  }
  return {
    basis: "latest_attestation_on_or_before_enrolment",
    note: withheld,
    attestation: covering,
  };
}

/**
 * The 'student_detached' events that name this person — found by username,
 * because no FK leads to them (see NON_FK_SUBJECT_SOURCES).
 *
 * TWO GUARDS AGAINST RETURNING SOMEONE ELSE'S NAME. A username is unique among
 * live accounts but not across time: a detached student who later erases their
 * account frees theirs. So the account must itself be detached, and the event
 * must not predate the account — an event written before this account existed
 * is about whoever held the username before.
 *
 * The event_type index narrows the scan; matching on the JSON field happens
 * here. The export is rate limited and detach events are few per school.
 */
async function removalRecords(db: any, user: any) {
  if (!user.username || !user.detachedAt) return [];
  const events = await db
    .select({
      eventType: organizationEvents.eventType,
      eventDescription: organizationEvents.eventDescription,
      previousValue: organizationEvents.previousValue,
      performedByRole: organizationEvents.performedByRole,
      organizationId: organizationEvents.organizationId,
      createdAt: organizationEvents.createdAt,
    })
    .from(organizationEvents)
    .where(eq(organizationEvents.eventType, "student_detached"));

  const accountCreated = user.createdAt ? new Date(user.createdAt).getTime() : null;
  const mine = events.filter((e: any) =>
    e.previousValue?.username === user.username &&
    (accountCreated == null || (e.createdAt && new Date(e.createdAt).getTime() >= accountCreated)),
  );
  if (mine.length === 0) return [];

  const orgIds = Array.from(new Set<string>(mine.map((e: any) => e.organizationId)));
  const orgs = await db.select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(inArray(organizations.id, orgIds));
  const nameOf = new Map<string, string>(orgs.map((o: any) => [o.id, o.name]));
  return mine.map(({ organizationId, ...e }: any) => ({
    ...e,
    organizationName: nameOf.get(organizationId) ?? null,
  }));
}

/**
 * WHAT IS HELD BUT NOT IN THIS FILE, AND WHY — the export's equivalent of the
 * erasure response saying what it deleted instead of "everything".
 *
 * Credentials are withheld because a leaked export must not sign anyone in.
 * Actor records are withheld because they carry other people's personal data
 * (the students an admin removed, the questions a school contributed); their
 * counts come from BLOCKING_AUDIT_SOURCES, the list behind the erasure 409.
 */
async function heldButNotIncluded(
  db: any,
  userId: string,
  { hasPassword, resetRequests, resetByStaff }: { hasPassword: boolean; resetRequests: number; resetByStaff: boolean },
) {
  const held: Array<{ category: string; count?: number; reason: string }> = [];
  if (hasPassword) {
    held.push({
      category: "your password",
      reason: "Stored only as a one-way hash. It is a credential, not information about you, and cannot be turned back into your password.",
    });
  }
  if (resetRequests > 0) {
    held.push({
      category: "password reset link codes",
      count: resetRequests,
      reason: "The dates of each request are included above; the codes themselves are credentials and are withheld.",
    });
  }
  if (resetByStaff) {
    held.push({
      category: "which school staff member last reset your password",
      reason: "When it was last reset is included in your school enrolment record; who did it is that staff member's data.",
    });
  }
  held.push({
    category: "any active login sessions",
    reason: "A session identifier would let anyone holding this file sign in as you.",
  });

  for (const source of BLOCKING_AUDIT_SOURCES) {
    const rows = await db.select({ id: source.column }).from(source.table)
      .where(eq(source.column, userId));
    if (rows.length > 0) {
      held.push({
        category: source.label,
        count: rows.length,
        reason: `These records also contain other people's personal data. Contact ${PRIVACY_CONTACT} for a copy with that data removed.`,
      });
    }
  }
  return held;
}

/**
 * The data-summary route's view. Counted FROM the export, never alongside it, so
 * the number and the file cannot disagree.
 */
export function summarizeSubjectAccess(subject: NonNullable<Awaited<ReturnType<typeof collectSubjectAccess>>>) {
  const sum = (f: (a: any) => number) => subject.assessments.reduce((n: number, a: any) => n + f(a), 0);
  const dataCategories = {
    assessments: subject.assessments.length,
    careerRecommendations: sum((a) => a.recommendations.length),
    quizzes: sum((a) => a.quizzes.length),
    quizResponses: sum((a) => a.quizzes.reduce((n: number, q: any) => n + q.responses.length, 0)),
    careerNarratives: sum((a) => a.careerNarratives.length),
    cvqResults: subject.cvqResults.length,
    wefCompetencyResults: subject.wefCompetencyResults.length,
    schoolEnrolment: subject.schoolEnrolment ? 1 : 0,
    schoolConsentCoveringYou: subject.schoolConsentCoveringYou?.attestation ? 1 : 0,
    schoolRemovalRecords: subject.schoolRemovalRecords.length,
    passwordResetRequests: subject.passwordResetRequests.length,
    consentAttestationsYouMade: subject.consentAttestationsYouMade.length,
    organizationDeletionsYouPerformed: subject.organizationDeletionsYouPerformed.length,
  };
  return {
    accountCreated: subject.account.createdAt,
    dataCategories: { profileData: true, ...dataCategories },
    // Records in the export file. Not "everything held" — heldButNotIncluded
    // says what else exists and why it is not in the file.
    totalRecords: 1 + Object.values(dataCategories).reduce((n, c) => n + c, 0),
    heldButNotIncluded: subject.heldButNotIncluded,
  };
}

/**
 * WHETHER ERASURE WOULD RUN NOW, AND WHAT OUTLIVES IT — for data-summary.
 *
 * ON THE SUMMARY, NOT A SECOND ENDPOINT. The Profile screen needs the counts and
 * the answer to "can I delete this" together. Two endpoints reporting on the
 * same account can disagree, and then the screen has to pick one. So it is one
 * fetch.
 *
 * NOT A PROMISE. DELETE /api/users/me decides for itself, inside its
 * transaction. This runs the same check — collectBlockingAuditRecords and
 * erasureConfirmationMethod, not copies of them — so it is what that route would
 * decide at the moment of reading.
 *
 * keptAfterErasure is what a truthful deletion screen has to say is NOT deleted,
 * for this reader only:
 *   school_removal_record  the 'student_detached' event that names a detached
 *                          student (FOLLOWUP.md, "A school's activity log keeps
 *                          an erased student's name" — decided 2026-09-15: the
 *                          name is kept, so it is said)
 *   consent_attestation    an attester's name and email (decided, 2026-09-10)
 *   school_deletion_record a school deleter's name and email (decided, 2026-09-14)
 * Read from the subject's own sections, so it lists exactly the records the
 * export returned and nothing inferred from account flags. A detached student
 * whose school has since been deleted has no event left, and is told nothing.
 */
export async function summarizeErasure(
  db: any,
  userId: string,
  subject: NonNullable<Awaited<ReturnType<typeof collectSubjectAccess>>>,
): Promise<ErasureStatus> {
  const blockingRecords = await collectBlockingAuditRecords(db, userId);

  // The schools named in the refusal. Only the registered administrator is told
  // which school, because that is the one block the school's deletion resolves.
  const administeredSchools: string[] = blockingRecords.includes("school_administrator")
    ? (await db.select({ name: organizations.name }).from(organizations)
        .where(eq(organizations.adminUserId, userId))).map((o: any) => o.name)
    : [];

  const [credentials] = await db
    .select({ passwordHash: users.passwordHash, email: users.email })
    .from(users)
    .where(eq(users.id, userId));

  const kept = new Map<string, { code: ErasureKeptCode; organizationName: string | null }>();
  const keep = (code: ErasureKeptCode, organizationName: string | null | undefined) =>
    kept.set(`${code}:${organizationName ?? ""}`, { code, organizationName: organizationName ?? null });
  for (const r of subject.schoolRemovalRecords) keep("school_removal_record", r.organizationName);
  for (const c of subject.consentAttestationsYouMade) keep("consent_attestation", c.organizationName);
  for (const d of subject.organizationDeletionsYouPerformed) keep("school_deletion_record", d.organizationName);

  return {
    blocked: blockingRecords.length > 0,
    blockingRecords,
    administeredSchools,
    confirmWith: credentials ? erasureConfirmationMethod(credentials) : null,
    keptAfterErasure: Array.from(kept.values()),
  };
}
