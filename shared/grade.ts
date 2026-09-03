/**
 * Student grade — the single source of truth for format, parsing and ordering.
 *
 * Canonical format: 'grade8' | 'grade9' | 'grade10' | 'grade11' | 'grade12' | 'graduated'
 *
 * WHY this module exists (see docs/v2-phase2-recon.md §1a): student grade was
 * written in three incompatible formats — 'grade10' (the assessment Demographics
 * step), '10' (the admin add-student select) and NaN (a `parseInt` on a text
 * column in the member PATCH). One grade therefore denoted up to three distinct
 * values, which is the single root cause of the analytics "Grade 10 twice"
 * bucketing, the broken per-grade Career Journey link, and the blocked
 * next-grade re-assessment path.
 *
 * The `/(\d+)/` grade parse was also duplicated across two server files, with a
 * comment in one pointing at the other. That duplication is how formats drift.
 *
 * IMPORTANT — do not confuse this with QUIZ-question grade, which is
 * `quiz_questions.grade` (integer NOT NULL) and is already single-format. This
 * module is only for student grade: `assessments.grade` and
 * `organization_members.grade`, both nullable text.
 */

/** Every legal stored value, in display/sort order. */
export const CANONICAL_GRADES = [
  'grade8',
  'grade9',
  'grade10',
  'grade11',
  'grade12',
  'graduated',
] as const;

export type CanonicalGrade = (typeof CANONICAL_GRADES)[number];

/**
 * The grades a school can enrol a student INTO — i.e. CANONICAL_GRADES without
 * 'graduated'. Use this for admin-facing grade pickers; 'graduated' is a state a
 * student reaches, not an enrolment target.
 */
export const SCHOOL_GRADES = CANONICAL_GRADES.filter(
  (g): g is Exclude<CanonicalGrade, 'graduated'> => g !== 'graduated',
);

/** Numeric grades we support, as strings, for digit-core matching. */
const SUPPORTED_CORES = new Set(['8', '9', '10', '11', '12']);

/** Sort keys for the two non-numeric outcomes. Both sort after grade12. */
const GRADUATED_SORT_KEY = 99;
const UNKNOWN_SORT_KEY = 100;

export function isCanonicalGrade(value: unknown): value is CanonicalGrade {
  return typeof value === 'string' && (CANONICAL_GRADES as readonly string[]).includes(value);
}

/**
 * Normalize any input to a canonical grade, or null.
 *
 * Contract:
 *  - **Lossless or null.** Never guesses. An input that does not unambiguously
 *    denote one supported grade returns null — it is never coerced to a
 *    neighbouring grade. These are minors' records; a wrong grade is worse than
 *    a missing one.
 *  - **Idempotent.** toCanonicalGrade('grade10') === 'grade10', so it is safe to
 *    apply repeatedly and safe to apply to already-migrated data.
 *  - Accepts a number (10 → 'grade10') because JSON request bodies can carry one.
 *  - 'NaN' → null. That string is the artifact of the member-PATCH `parseInt`
 *    bug; the original grade is already destroyed and nothing in the row
 *    recovers it, so null is the honest answer.
 *
 * Note the deliberate divergence from the SQL normalizer in migration 013: this
 * function returns null for an unrecognized value so a write can be REJECTED at
 * the API boundary, whereas the migration leaves such a row untouched so no
 * stored data is destroyed. Different jobs; the buckets that DO convert are
 * identical in both.
 */
export function toCanonicalGrade(raw: unknown): CanonicalGrade | null {
  if (raw === null || raw === undefined) return null;

  // A JSON body can legitimately send grade as a number.
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw)) return null;
    return SUPPORTED_CORES.has(String(raw)) ? (`grade${raw}` as CanonicalGrade) : null;
  }

  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '') return null;

  // Already canonical (case/whitespace-insensitively) — the idempotent path.
  if (isCanonicalGrade(trimmed)) return trimmed;

  // The parseInt artifact. Information is gone; do not invent one.
  if (trimmed === 'nan') return null;

  // Recoverable only when the digits present name exactly one supported grade.
  // 'Grade 10' and '10th' convert; '89', '1012', '7' and '13' do not.
  const core = trimmed.replace(/\D/g, '');
  if (SUPPORTED_CORES.has(core)) return `grade${core}` as CanonicalGrade;

  return null;
}

/**
 * Numeric grade, or null for 'graduated' / unknown / absent.
 *
 * Tolerant of non-canonical input by design: it is the reader-side counterpart
 * of toCanonicalGrade and mirrors the digit extraction already shipped in
 * server/routes/quiz.routes.ts and server/services/premiumNarratives.ts, so a
 * value either of those accepts is a value this accepts.
 */
export function gradeToNumber(grade: string | number | null | undefined): number | null {
  if (grade === null || grade === undefined) return null;
  if (typeof grade === 'number') return Number.isInteger(grade) ? grade : null;

  const trimmed = grade.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'graduated' || trimmed === 'nan') return null;

  const core = trimmed.replace(/\D/g, '');
  if (core === '') return null;
  const n = Number.parseInt(core, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Ordering key: 8..12 for school grades, then 'graduated', then anything
 * unrecognized.
 *
 * Required because BOTH string formats sort wrongly lexically — 'grade10' <
 * 'grade8' and '10' < '8'. Any grade ordering must use this, never
 * localeCompare.
 */
export function gradeSortKey(grade: string | number | null | undefined): number {
  const n = gradeToNumber(grade);
  if (n !== null) return n;
  if (typeof grade === 'string' && grade.trim().toLowerCase() === 'graduated') {
    return GRADUATED_SORT_KEY;
  }
  return UNKNOWN_SORT_KEY;
}

/**
 * The grade after this one: grade8→grade9 … grade11→grade12, grade12→graduated.
 * Returns null for 'graduated' (nothing follows) and for unrecognized input.
 *
 * Exists for the Phase 6 school re-grant path (one licence = one assessment per
 * grade), so "advance this student a year" is expressed in exactly one place.
 */
export function nextGrade(current: string | number | null | undefined): CanonicalGrade | null {
  const canonical = toCanonicalGrade(current);
  if (canonical === null || canonical === 'graduated') return null;

  const index = CANONICAL_GRADES.indexOf(canonical);
  const next = CANONICAL_GRADES[index + 1];
  return next ?? null;
}

/**
 * Merge grade-keyed counts into ONE bucket per grade, ordered by grade.
 *
 * This is the "Grade 10 twice" fix expressed as data (docs/v2-phase2-recon.md
 * R1/R2). Rows holding '10' and rows holding 'grade10' are the same grade and
 * must sum into a single bucket BEFORE anything picks a max over them —
 * otherwise the split halves can both lose to a smaller unsplit grade, which is
 * the top-grade metric bug (R2).
 *
 * The analytics query already groups on a canonicalizing SQL expression, and
 * migration 013 canonicalizes the stored rows. This is the third layer on
 * purpose: it is the only one that is unit-testable without a database, and it
 * means a single stray non-canonical row written by some future code path can
 * never split a bar again.
 *
 * A grade that does not canonicalize keeps its own raw label rather than being
 * folded into a neighbour — same "never guess" contract as toCanonicalGrade,
 * and it mirrors the migration's `ELSE raw`, so an unexpected value stays
 * visible in the chart instead of silently inflating a real grade.
 *
 * Rows with no grade at all are dropped: they carry no grade information, and
 * the analytics query already filters them out server-side.
 */
export function mergeGradeCounts(
  rows: ReadonlyArray<{ grade: string | null | undefined; count: number }>,
): Array<{ grade: string; count: number }> {
  const merged = new Map<string, number>();

  for (const row of rows) {
    if (row.grade === null || row.grade === undefined) continue;
    const raw = row.grade.trim();
    if (raw === '') continue;

    const key = toCanonicalGrade(raw) ?? raw;
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }

  return Array.from(merged, ([grade, count]) => ({ grade, count })).sort(
    (a, b) => gradeSortKey(a.grade) - gradeSortKey(b.grade) || a.grade.localeCompare(b.grade),
  );
}

/** The shape pickLatestForGrade needs. Satisfied by `Assessment` as-is. */
export interface GradedRecord {
  grade?: string | number | null;
  completedAt?: string | Date | null;
  isCompleted?: boolean | null;
}

/**
 * The record for one specific grade — the most recently completed one.
 *
 * This is the resolver behind Bug #12 (docs/v2-phase2-recon.md R4/C10): the
 * Career Journey's per-grade "View Results" link carries `?grade=grade10`, and
 * Results.tsx has to turn that into THAT grade's assessment. Before this, it
 * read no grade param at all and every per-grade link opened the latest report.
 *
 * Matching is canonical on both sides, so a legacy row still stored as '10'
 * resolves for a link that asks for 'grade10'. That is why this fix had to wait
 * on canonicalization: matching raw strings would miss exactly the school
 * students whose rows the old admin select corrupted.
 *
 * Returns null when the caller has no record for that grade — the caller
 * decides what to do, this never falls back to a different grade's record.
 *
 * Records are excluded only when `isCompleted` is explicitly false; an
 * in-progress assessment has no report to show.
 */
export function pickLatestForGrade<T extends GradedRecord>(
  records: ReadonlyArray<T>,
  grade: string | number | null | undefined,
): T | null {
  const target = toCanonicalGrade(grade);
  if (target === null) return null;

  let best: T | null = null;
  let bestTime = -Infinity;

  for (const record of records) {
    if (record.isCompleted === false) continue;
    if (toCanonicalGrade(record.grade) !== target) continue;

    // A completed record with no timestamp still beats nothing, but loses to any
    // record that has one.
    const time = record.completedAt ? new Date(record.completedAt).getTime() : -Infinity;
    if (best === null || time > bestTime) {
      best = record;
      bestTime = time;
    }
  }

  return best;
}
