/**
 * The report-generation gate, and specifically the Phase 3 change to it: free
 * no longer requires personalityTraits.
 *
 * Had this requirement survived the removal of the free PersonalityStep, every
 * free report would have 400'd — the plan called it out as the one companion
 * edit that is easy to miss.
 */
import { describe, it, expect } from 'vitest';
import { collectMissingComponents } from './assessmentCompleteness';

const freeComplete = {
  name: 'A', age: 15, grade: 'grade10',
  favoriteSubjects: ['Science'], countryId: 'uae',
  interests: ['space'], careerAspirations: ['pilot'],
};

const premiumComplete = {
  name: 'A', age: 15, grade: 'grade10',
  favoriteSubjects: ['Science'], countryId: 'uae',
  quizScore: 72, riasecScores: { R: 10, I: 8 },
};

const free = (a: object) => collectMissingComponents(a, { isPremium: false, hasCvqResult: false });
const premium = (a: object) => collectMissingComponents(a, { isPremium: true, hasCvqResult: true });

describe('free tier no longer requires Personality Traits', () => {
  it('passes a free assessment that has NO personalityTraits at all', () => {
    // THE PHASE 3 REGRESSION GUARD. This is what every new free assessment
    // looks like now that the step is gone.
    expect(free(freeComplete)).toEqual([]);
  });

  it('never reports "Personality Traits" as missing, whatever the field holds', () => {
    for (const pt of [undefined, null, [], {}, ['teamwork_2']]) {
      expect(free({ ...freeComplete, personalityTraits: pt })).not.toContain('Personality Traits');
    }
  });

  it('still passes a legacy free assessment that DOES carry traits', () => {
    // Rows written before Phase 3 must keep generating.
    expect(free({ ...freeComplete, personalityTraits: ['teamwork_2'] })).toEqual([]);
  });
});

describe('free tier does NOT require the quiz', () => {
  it('passes with no quizScore', () => {
    // Deliberate: the quiz is skippable when no questions exist for the
    // student's country, and requiring it would 400 every free assessment
    // already in flight under the old order where the quiz came last.
    expect(free({ ...freeComplete, quizScore: null })).toEqual([]);
    expect(free({ ...freeComplete, quizScore: undefined })).toEqual([]);
  });
});

describe('free tier still requires what it still collects', () => {
  it('requires Interests', () => {
    expect(free({ ...freeComplete, interests: [] })).toEqual(['Interests']);
    expect(free({ ...freeComplete, interests: undefined })).toEqual(['Interests']);
  });

  it('requires Career Aspirations', () => {
    expect(free({ ...freeComplete, careerAspirations: undefined })).toEqual(['Career Aspirations']);
  });

  it('requires the shared spine fields', () => {
    expect(free({ ...freeComplete, name: '' })).toEqual(['Name']);
    expect(free({ ...freeComplete, age: null })).toEqual(['Age']);
    expect(free({ ...freeComplete, grade: '' })).toEqual(['Grade']);
    expect(free({ ...freeComplete, favoriteSubjects: [] })).toEqual(['Favorite Subjects']);
    expect(free({ ...freeComplete, countryId: '' })).toEqual(['Country Selection']);
  });

  it('reports every missing component at once, not just the first', () => {
    expect(free({})).toEqual([
      'Name', 'Age', 'Grade', 'Favorite Subjects', 'Country Selection',
      'Interests', 'Career Aspirations',
    ]);
  });
});

describe('premium requirements are unchanged by Phase 3', () => {
  it('passes a complete premium assessment', () => {
    expect(premium(premiumComplete)).toEqual([]);
  });

  it('still requires the quiz, RIASEC and CVQ', () => {
    expect(premium({ ...premiumComplete, quizScore: null })).toEqual(['Subject Competency Quiz']);
    expect(premium({ ...premiumComplete, riasecScores: {} })).toEqual(['Interest Inventory (RIASEC)']);
    expect(collectMissingComponents(premiumComplete, { isPremium: true, hasCvqResult: false }))
      .toEqual(['Work Values Assessment (CVQ)']);
  });

  it('never asks premium for Interests, which premium does not collect', () => {
    expect(premium({ ...premiumComplete, interests: [] })).not.toContain('Interests');
  });

  it('treats quizScore 0 as present, not missing', () => {
    expect(premium({ ...premiumComplete, quizScore: 0 })).toEqual([]);
  });
});
