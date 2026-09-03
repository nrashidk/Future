/**
 * Phase 3 — the free-flow restructure to the shared 4-step spine.
 *
 * These pin the three things the reorder has to get right:
 *   1. the free step ORDER, and that premium's is untouched (L2/L3);
 *   2. the step COUNTS, which used to be a single hardcoded 7 meaning two
 *      different things per tier;
 *   3. free RESUME, which must not trust the step numbers already written to
 *      assessments.currentStep under the old order.
 */
import { describe, it, expect } from 'vitest';
import {
  FREE_STEP_IDS,
  PREMIUM_STEP_IDS,
  SPINE_STEP_IDS,
  deriveFreeResumeStep,
  finalInputStep,
  stepIdsForTier,
  stepNumberOf,
  totalStepsForTier,
} from './assessmentFlow';

describe('the free step order (L3)', () => {
  it('is Basic, Subjects, Country, Quiz, Interests, Aspirations, Results', () => {
    expect([...FREE_STEP_IDS]).toEqual([
      'basicInfo', 'subjects', 'country', 'quiz', 'interests', 'aspirations', 'results',
    ]);
  });

  it('no longer contains a Personality step', () => {
    expect(FREE_STEP_IDS).not.toContain('personality');
  });

  it('moved the quiz out of last place and into the spine', () => {
    // The bug being fixed: free used to take the quiz at step 7, AFTER
    // Aspirations, and finishing it fired report generation.
    expect(stepNumberOf(false, 'quiz')).toBe(4);
    expect(stepNumberOf(false, 'quiz')!).toBeLessThan(stepNumberOf(false, 'aspirations')!);
  });

  it('puts Country before the Quiz, where free used to have Interests', () => {
    expect(stepNumberOf(false, 'country')).toBe(3);
    expect(stepNumberOf(false, 'interests')).toBe(5);
  });
});

describe('the premium step order is unchanged', () => {
  it('is Basic, Subjects, Country, Quiz, RIASEC, CVQ, Aspirations, Results', () => {
    expect([...PREMIUM_STEP_IDS]).toEqual([
      'basicInfo', 'subjects', 'country', 'quiz',
      'careerPersonality', 'personalValues', 'aspirations', 'results',
    ]);
  });

  it('has no Interests step, and free has no RIASEC or CVQ', () => {
    expect(PREMIUM_STEP_IDS).not.toContain('interests');
    expect(FREE_STEP_IDS).not.toContain('careerPersonality');
    expect(FREE_STEP_IDS).not.toContain('personalValues');
  });
});

describe('the shared 4-step spine (L2)', () => {
  it('is steps 1-4 and is IDENTICAL for both tiers', () => {
    expect([...SPINE_STEP_IDS]).toEqual(['basicInfo', 'subjects', 'country', 'quiz']);
    expect(stepIdsForTier(false).slice(0, 4)).toEqual([...SPINE_STEP_IDS]);
    expect(stepIdsForTier(true).slice(0, 4)).toEqual([...SPINE_STEP_IDS]);
  });

  it('gives every spine step the same number in both tiers', () => {
    for (const id of SPINE_STEP_IDS) {
      expect(stepNumberOf(false, id)).toBe(stepNumberOf(true, id));
    }
  });

  it('diverges only after step 4', () => {
    expect(stepIdsForTier(false)[4]).toBe('interests');
    expect(stepIdsForTier(true)[4]).toBe('careerPersonality');
  });
});

describe('Aspirations is always the last input step (L3)', () => {
  it('is immediately before Results in both tiers', () => {
    for (const isPremium of [false, true]) {
      const ids = stepIdsForTier(isPremium);
      expect(ids[ids.length - 1]).toBe('results');
      expect(ids[ids.length - 2]).toBe('aspirations');
    }
  });

  it('is step 6 free and step 7 premium', () => {
    expect(finalInputStep(false)).toBe(6);
    expect(finalInputStep(true)).toBe(7);
  });
});

describe('step counts', () => {
  it('is 7 free and 8 premium, both counting Results', () => {
    expect(totalStepsForTier(false)).toBe(7);
    expect(totalStepsForTier(true)).toBe(8);
  });

  it('no longer reports the same total for both tiers', () => {
    // Before Phase 3 both were the literal 7 — but premium's 7 excluded Results
    // while free's included it, which is how the free labels came to be off.
    expect(totalStepsForTier(false)).not.toBe(totalStepsForTier(true));
  });

  it('has no step id repeated within a tier', () => {
    for (const isPremium of [false, true]) {
      const ids = stepIdsForTier(isPremium);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('returns null for a step the tier does not have', () => {
    expect(stepNumberOf(false, 'careerPersonality')).toBeNull();
    expect(stepNumberOf(true, 'interests')).toBeNull();
  });
});

describe('deriveFreeResumeStep — free resume ignores the stored step', () => {
  const complete = {
    name: 'A', age: 15, grade: 'grade10', gender: 'female',
    favoriteSubjects: ['Science'], countryId: 'uae',
    interests: ['space'], careerAspirations: ['pilot'],
  };

  it('sends an empty assessment to step 1', () => {
    expect(deriveFreeResumeStep({})).toBe(1);
    expect(deriveFreeResumeStep({ name: 'A' })).toBe(1);
  });

  it('treats age 0 as present, not missing', () => {
    // Explicit null/undefined checks matter: `!age` would send a 0-year-old back.
    expect(deriveFreeResumeStep({ ...complete, age: 0 })).toBe(6);
  });

  it('walks forward one step per completed section', () => {
    expect(deriveFreeResumeStep({ ...complete, favoriteSubjects: [], countryId: '', interests: [], careerAspirations: [] })).toBe(2);
    expect(deriveFreeResumeStep({ ...complete, countryId: '', interests: [], careerAspirations: [] })).toBe(3);
    expect(deriveFreeResumeStep({ ...complete, interests: [], careerAspirations: [] })).toBe(4);
    expect(deriveFreeResumeStep({ ...complete, careerAspirations: [] })).toBe(6);
    expect(deriveFreeResumeStep(complete)).toBe(6);
  });

  it('resumes at the QUIZ, not Interests, when interests are missing', () => {
    // The quiz is skippable and leaves no trace, so its completion cannot be
    // observed. Step 4 is the earlier of the two possible positions and
    // re-entering it is idempotent — QuizStep auto-advances when already done.
    expect(deriveFreeResumeStep({ ...complete, interests: [] })).toBe(4);
  });

  it('never pins a student who skipped the quiz', () => {
    // A student with no questions available for their country skips the quiz.
    // Nothing in the record records that, so the derivation must not depend on
    // it — once they have interests, they move past step 4 for good.
    expect(deriveFreeResumeStep({ ...complete, interests: ['space'], careerAspirations: [] })).toBe(6);
  });

  it('rescues a student stranded by the OLD numbering', () => {
    // THE REGRESSION THIS EXISTS FOR. Under the old free order step 3 was
    // Interests, so a student could have currentStep=4 (old Personality) with
    // NO countryId — country was step 5 back then. Trusting the stored 4 would
    // land them on the new step 4 (Quiz) with no country, and generation would
    // 400 on "Country Selection".
    const oldOrderDraft = {
      name: 'A', age: 15, grade: 'grade10', gender: 'female',
      favoriteSubjects: ['Science'],
      interests: ['space'],   // collected at old step 3
      countryId: '',          // old step 5 — never reached
      careerAspirations: [],
    };
    expect(deriveFreeResumeStep(oldOrderDraft)).toBe(3); // Country, correctly
  });

  it('only ever returns a real free step', () => {
    const cases = [{}, { name: 'A' }, complete, { ...complete, interests: [] }];
    for (const c of cases) {
      const step = deriveFreeResumeStep(c);
      expect(step).toBeGreaterThanOrEqual(1);
      expect(step).toBeLessThanOrEqual(totalStepsForTier(false));
      expect(FREE_STEP_IDS[step - 1]).toBeDefined();
    }
  });

  it('never returns the Results step', () => {
    // Results is a separate page; resuming "into" it would be meaningless.
    expect(deriveFreeResumeStep(complete)).not.toBe(stepNumberOf(false, 'results'));
  });
});
