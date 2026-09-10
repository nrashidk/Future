/**
 * Coverage gate for the .ts content migrations applied at the end of seedDatabase().
 *
 * WHY THIS EXISTS: the nine apply* modules each log "<n> updated, <m> not found"
 * and return void. Nobody reads a startup log, so a module that matched zero rows
 * looked exactly like one that matched all of them. careers.title_ar and
 * education_level_ar sat NULL in production for months on that basis, and the
 * first report of it was a human noticing English text in an Arabic PDF.
 *
 * This follows the gate pattern already used at career-growth-bands.ts:546 —
 * assert against what is actually IN the database afterwards, not against a
 * counter the writer kept. That distinction is the whole point:
 *
 *   careers.title has NO unique constraint (shared/schema.ts:548), and every
 *   title-matched module takes .limit(1). Two rows sharing a title therefore
 *   means one is updated and the other silently keeps stale content, while the
 *   module's own notFound counter stays 0 and reports full coverage. A gate
 *   built on the counters cannot see that. A gate built on the rows can, and
 *   DUPLICATE_TITLE below is the check for it.
 *
 * Each check keys off the column that only one migration writes, so a failure
 * names the module that did not land:
 *
 *   title_ar / description_ar / required_skills_ar / education_level_ar
 *                            -> career-arabic-content.ts
 *   values_profile           -> career-values-profiles.ts
 *   onet_growth_source       -> career-growth-bands.ts
 *   future_readiness_source  -> career-future-readiness.ts
 *   question_ar              -> quiz-arabic-content.ts / -grades9-12.ts
 *
 * Reports rather than throws. It runs after the content block, and taking the
 * rest of the seed down would trade a reporting failure for a seeding failure.
 * The caller marks the boot incomplete, which surfaces on /health.
 */

export interface CoverageProblem {
  /** Which migration did not land. */
  module: string;
  /** Machine-readable check id. */
  check: "MISSING_ROW" | "DUPLICATE_TITLE" | "MISSING_CONTENT";
  detail: string;
}

export interface CareerCoverageRow {
  title: string;
  titleAr: string | null;
  descriptionAr: string | null;
  requiredSkillsAr: string[] | null;
  educationLevelAr: string | null;
  valuesProfile: unknown | null;
  onetGrowthSource: unknown | null;
  futureReadinessSource: unknown | null;
}

export interface QuizCoverageRow {
  question: string;
  questionAr: string | null;
}

export interface CoverageInput {
  careerRows: CareerCoverageRow[];
  quizRows: QuizCoverageRow[];
  /** Titles career-arabic-content.ts claims to cover. */
  arabicTitles: Set<string>;
  /** Titles career-values-profiles.ts claims to cover. */
  valuesTitles: Set<string>;
  /** Titles career-growth-bands.ts claims to cover. */
  growthTitles: Set<string>;
  /** Question texts the two quiz Arabic modules claim to cover. */
  quizQuestions: Set<string>;
}

/** Cap per check, so one systemic failure cannot produce 68 log lines. */
const MAX_LISTED = 10;

function summarise(items: string[]): string {
  const shown = items.slice(0, MAX_LISTED).join(", ");
  return items.length > MAX_LISTED
    ? `${shown} … and ${items.length - MAX_LISTED} more`
    : shown;
}

export function evaluateContentCoverage(input: CoverageInput): CoverageProblem[] {
  const problems: CoverageProblem[] = [];
  const { careerRows, quizRows, arabicTitles, valuesTitles, growthTitles, quizQuestions } = input;

  // 1. Duplicate titles. Checked FIRST and reported for every module that keys on
  //    title, because it is the one failure the notFound counters cannot see.
  const titleCounts = new Map<string, number>();
  for (const row of careerRows) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }
  const allKeyedTitles = new Set([...arabicTitles, ...valuesTitles, ...growthTitles]);
  const duplicates = [...titleCounts.entries()]
    .filter(([title, n]) => n > 1 && allKeyedTitles.has(title))
    .map(([title, n]) => `${title} (×${n})`)
    .sort();
  if (duplicates.length > 0) {
    problems.push({
      module: "all title-matched migrations",
      check: "DUPLICATE_TITLE",
      detail:
        `${duplicates.length} career title(s) appear more than once, so .limit(1) updated ` +
        `an arbitrary row and the rest keep stale content — with no warning logged: ` +
        summarise(duplicates),
    });
  }

  const byTitle = new Map(careerRows.map((r) => [r.title, r]));

  // 2. A title the migration expects that has no row at all.
  const expectations: Array<[string, Set<string>]> = [
    ["career-arabic-content.ts", arabicTitles],
    ["career-values-profiles.ts", valuesTitles],
    ["career-growth-bands.ts", growthTitles],
  ];
  for (const [module, titles] of expectations) {
    const absent = [...titles].filter((t) => !byTitle.has(t)).sort();
    if (absent.length > 0) {
      problems.push({
        module,
        check: "MISSING_ROW",
        detail: `${absent.length} expected career(s) not in the database: ${summarise(absent)}`,
      });
    }
  }

  // 3. Row present but the column this migration owns was never written.
  const contentChecks: Array<{
    module: string;
    titles: Set<string>;
    column: string;
    missing: (row: CareerCoverageRow) => boolean;
  }> = [
    {
      module: "career-arabic-content.ts",
      titles: arabicTitles,
      column: "title_ar/description_ar/required_skills_ar/education_level_ar",
      missing: (r) =>
        !r.titleAr || !r.descriptionAr || !r.requiredSkillsAr?.length || !r.educationLevelAr,
    },
    {
      module: "career-values-profiles.ts",
      titles: valuesTitles,
      column: "values_profile",
      missing: (r) => r.valuesProfile == null,
    },
    {
      module: "career-growth-bands.ts",
      titles: growthTitles,
      column: "onet_growth_source",
      missing: (r) => r.onetGrowthSource == null,
    },
    {
      // Not title-keyed — it rewrites every row it finds, so every career is expected.
      module: "career-future-readiness.ts",
      titles: new Set(careerRows.map((r) => r.title)),
      column: "future_readiness_source",
      missing: (r) => r.futureReadinessSource == null,
    },
  ];

  for (const { module, titles, column, missing } of contentChecks) {
    const bad = [...titles]
      .map((t) => byTitle.get(t))
      .filter((r): r is CareerCoverageRow => !!r && missing(r))
      .map((r) => r.title)
      .sort();
    if (bad.length > 0) {
      problems.push({
        module,
        check: "MISSING_CONTENT",
        detail: `${bad.length} career(s) with ${column} unwritten: ${summarise(bad)}`,
      });
    }
  }

  // 4. Quiz Arabic. Same shape, keyed on exact English question text.
  const quizByText = new Map(quizRows.map((r) => [r.question, r]));
  const quizAbsent = [...quizQuestions].filter((q) => !quizByText.has(q));
  const quizUntranslated = [...quizQuestions]
    .map((q) => quizByText.get(q))
    .filter((r): r is QuizCoverageRow => !!r && !r.questionAr)
    .map((r) => r.question);
  if (quizAbsent.length > 0) {
    problems.push({
      module: "quiz-arabic-content.ts / -grades9-12.ts",
      check: "MISSING_ROW",
      detail:
        `${quizAbsent.length} expected question(s) not in the database: ` +
        summarise(quizAbsent.map((q) => `"${q.slice(0, 60)}…"`)),
    });
  }
  if (quizUntranslated.length > 0) {
    problems.push({
      module: "quiz-arabic-content.ts / -grades9-12.ts",
      check: "MISSING_CONTENT",
      detail:
        `${quizUntranslated.length} question(s) with question_ar unwritten: ` +
        summarise(quizUntranslated.map((q) => `"${q.slice(0, 60)}…"`)),
    });
  }

  return problems;
}

/** Reads the rows the gate needs and evaluates them. */
export async function checkContentCoverage(): Promise<CoverageProblem[]> {
  const { db } = await import("../db");
  const { careers, quizQuestions: quizQuestionsTable } = await import("../../shared/schema");
  const { CANONICAL_CAREER_TITLES } = await import("./career-arabic-content");
  const { CAREER_VALUES_PROFILES } = await import("./career-values-profiles");
  const { CAREER_GROWTH_BANDS } = await import("./career-growth-bands");
  const { GRADE8_ARABIC_CONTENT } = await import("./quiz-arabic-content.data");
  const { GRADES9_12_ARABIC_CONTENT } = await import("./quiz-arabic-content-grades9-12.data");

  const careerRows = await db
    .select({
      title: careers.title,
      titleAr: careers.titleAr,
      descriptionAr: careers.descriptionAr,
      requiredSkillsAr: careers.requiredSkillsAr,
      educationLevelAr: careers.educationLevelAr,
      valuesProfile: careers.valuesProfile,
      onetGrowthSource: careers.onetGrowthSource,
      futureReadinessSource: careers.futureReadinessSource,
    })
    .from(careers);

  const quizRows = await db
    .select({
      question: quizQuestionsTable.question,
      questionAr: quizQuestionsTable.questionAr,
    })
    .from(quizQuestionsTable);

  return evaluateContentCoverage({
    careerRows: careerRows as CareerCoverageRow[],
    quizRows: quizRows as QuizCoverageRow[],
    arabicTitles: CANONICAL_CAREER_TITLES,
    valuesTitles: new Set(CAREER_VALUES_PROFILES.map((c) => c.title)),
    growthTitles: new Set(CAREER_GROWTH_BANDS.map((c) => c.title)),
    quizQuestions: new Set([
      ...GRADE8_ARABIC_CONTENT.map((q) => q.question),
      ...GRADES9_12_ARABIC_CONTENT.map((q) => q.question),
    ]),
  });
}
