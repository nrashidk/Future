/**
 * WHICH SALARY FIGURE MAY REACH A STUDENT.
 *
 * `careers.average_salary` holds US dollar ranges — `seed.ts` seeds literal
 * strings like "$80,000 - $150,000". They are American labour-market figures,
 * and the problem is not the currency symbol: converting them at the dirham's
 * dollar peg would produce an exact conversion of the wrong number. What a
 * nurse earns in Ohio, in dirhams, is not what a nurse earns in Abu Dhabi.
 *
 * `careers.average_salary_local` is where a real local figure belongs. It is
 * currently empty for every career, so THIS FUNCTION RETURNS THE NEUTRAL
 * PHRASE FOR EVERY CAREER TODAY. That is the intended outcome, not a gap: no
 * figure is better than a foreign one.
 *
 * WHY THIS EXISTS AT ALL, given that nothing renders a salary today.
 *
 * No client file reads either column, and no prompt template in the repo
 * contains `{{salaryRange}}`, so the US figure currently reaches nobody. But
 * `buildCareerContext` still has to supply the variable, and
 * `userPromptTemplate` is editable from the superadmin UI
 * (`superadmin.routes.ts:1609`). Adding `{{salaryRange}}` to a template is a
 * no-code, no-review action that would put US dollars into a UAE student's
 * report immediately. This makes that trapdoor safe rather than relying on
 * nobody ever opening it.
 *
 * So this is deliberately a no-op change in behaviour and a real change in
 * what is POSSIBLE. When genuine local figures are loaded, they start being
 * used with no further code change.
 *
 * Pure and tested on purpose: it is the one place that decides whether a
 * foreign salary can be shown to a child, and that decision should be
 * readable in one screen.
 */

/** The phrase used when there is no local figure. Names no currency and no
 *  country, so it is safe in an English or an Arabic narrative alike. */
export const NO_LOCAL_SALARY = "Varies by experience";

export interface CareerSalaryFields {
  /** US dollar range. NEVER returned by resolveSalaryRange. */
  averageSalary?: string | null;
  /** Local-currency range for the career's own market. Returned when set. */
  averageSalaryLocal?: string | null;
}

/**
 * The only salary string that may be put in front of a student.
 *
 * Returns the local figure when one is set, and the neutral phrase otherwise.
 * `averageSalary` is never returned — not as a fallback, not converted, not
 * annotated. A caller that wants the US figure (a superadmin career editor,
 * say) should read the column directly and be obvious about it.
 */
export function resolveSalaryRange(career: CareerSalaryFields): string {
  const local = typeof career.averageSalaryLocal === "string"
    ? career.averageSalaryLocal.trim()
    : "";

  return local.length > 0 ? local : NO_LOCAL_SALARY;
}
