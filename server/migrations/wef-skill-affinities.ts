/**
 * Backfill WEF skill affinities for careers that have none.
 *
 * WHY A BACKFILL AND NOT JUST THE SEED ARRAY
 * The affinity block in server/seed.ts is COUNT-GUARDED: it compares
 * getCareerWefSkillAffinityCount() against the expected total and skips the
 * whole block once the count is met. Adding a career to
 * CAREER_WEF_SKILL_AFFINITIES therefore reaches a from-scratch database only.
 * This is the mechanism that updates databases that have already been seeded -
 * the same pattern, and the same reason, as
 * server/migrations/career-values-profiles.ts and career-related-subjects.ts.
 *
 * A count guard is also the wrong shape for this problem: it cannot tell 576
 * rows spread over 36 careers from 576 rows spread over 37, and it goes quiet
 * entirely the moment a career is removed. This function asks the only question
 * that matters - which careers have zero affinity rows - and fills exactly those.
 *
 * Idempotent and strictly additive: a career that already has ANY affinity row
 * is skipped untouched, so a hand-tuned or O*NET-derived value can never be
 * clobbered by the hardcoded defaults here.
 */

import type { IStorage } from '../storage';
import { CAREER_WEF_SKILL_AFFINITIES } from '../wefSkillsData';

export async function applyMissingWefAffinities(storage: IStorage): Promise<void> {
  console.log('Backfilling missing WEF skill affinities...');

  const careers = await storage.getAllCareers();
  const skillIdByName = new Map(
    (await storage.getAllWefSkills()).map(skill => [skill.name, skill.id]),
  );

  let careersBackfilled = 0;
  let affinitiesWritten = 0;
  let notFound = 0;

  for (const mapping of CAREER_WEF_SKILL_AFFINITIES) {
    const career = careers.find(c => c.title === mapping.careerTitle);
    if (!career) {
      console.warn(`  ⚠ WEF affinity backfill: career not found: "${mapping.careerTitle}"`);
      notFound++;
      continue;
    }

    const existing = await storage.getCareerWefSkillAffinitiesByCareer(career.id);
    if (existing.length > 0) {
      continue; // Already seeded - never overwrite.
    }

    for (const [skillName, affinityScore] of Object.entries(mapping.skills)) {
      const wefSkillId = skillIdByName.get(skillName);
      if (!wefSkillId) {
        console.warn(`  ⚠ WEF affinity backfill: unknown WEF skill "${skillName}" for ${career.title}`);
        continue;
      }
      await storage.createOrUpdateCareerWefSkillAffinity(career.id, wefSkillId, {
        affinityScore,
        source: 'Expert Panel',
        evidence: null,
      });
      affinitiesWritten++;
    }
    careersBackfilled++;
  }

  console.log(
    `WEF affinity backfill: ${affinitiesWritten} affinities written across ` +
    `${careersBackfilled} career(s), ${notFound} not found`,
  );
}
