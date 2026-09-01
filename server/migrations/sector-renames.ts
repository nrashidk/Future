/**
 * RECONCILING MIGRATION — priority-sector renames (plan Phase 2).
 *
 * WHY THIS EXISTS: the seed's sector upsert CANNOT rename.
 * `createOrUpdateCountryPrioritySector` (server/storage.ts:1915) conflicts on
 * `(country_id, name)` (shared/schema.ts:374), so changing a name in
 * UAE_SECTOR_WEF_SKILLS makes the upsert INSERT A SECOND SECTOR and leave the
 * old row in place — orphaning its `country_sector_wef_skills` rows (FK
 * sector_id, shared/schema.ts:390) and its `country_sector_categories` rows
 * (shared/schema.ts:433) on a sector nothing points to any more. The country
 * would then carry 12 sectors, four of them dead, and every rankFactor in
 * calculateVisionScore would be computed over the wrong n.
 *
 * So the rename has to happen BEFORE the upsert loop runs, by UPDATE on the
 * existing row rather than by insert. That keeps the row's id, and therefore
 * keeps every child row attached — no delete, no re-seed, no FK churn.
 *
 * IDEMPOTENT and ORDER-SAFE:
 *   - old name absent  -> nothing to do (already renamed, or a fresh DB where
 *     the seed will insert the new name directly).
 *   - new name already present AND old name still present -> a previous run
 *     half-applied, or someone let the upsert insert the duplicate. The old
 *     row's children are re-pointed onto the surviving new row and the old row
 *     is deleted, so the end state is the same either way.
 *
 * `countries.prioritySectors` / `prioritySectorsAr` are NOT touched here: they
 * are re-written wholesale from the seed constants by the country update in
 * seedDatabase(), positionally and at matching indices.
 *
 * KNOWN, DELIBERATELY NOT HANDLED: stored `recommendations.reasoning` holds the
 * OLD sector name as free text (server/services/matching.ts:1078-1085). After
 * the rename the Arabic substitution map no longer contains that string, so
 * historical Arabic reports silently fall back to English for the sector token.
 * Staging has 0 recommendations; production does not. See
 * docs/phase2-renames-done.md — that is a prod-only decision, not a code fix.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

/** old name -> new name. Order is irrelevant; each rename is independent. */
export const SECTOR_RENAMES: Array<{ from: string; to: string }> = [
  { from: "Biotechnology", to: "Healthcare & Life Sciences" },
  { from: "Space Exploration", to: "Space & Future Sciences" },
  { from: "Renewable Energy", to: "Renewable Energy & Sustainability" },
  { from: "Education", to: "Education & Human Capital" },
];

export async function applySectorRenames(countryId = "uae"): Promise<void> {
  let renamed = 0;
  let merged = 0;

  for (const { from, to } of SECTOR_RENAMES) {
    const found: any = await db.execute(sql`
      SELECT id, name FROM country_priority_sectors
      WHERE country_id = ${countryId} AND name IN (${from}, ${to})
    `);
    const rows: Array<{ id: string; name: string }> = found.rows ?? found;
    const oldRow = rows.find(r => r.name === from);
    const newRow = rows.find(r => r.name === to);

    if (!oldRow) {
      continue; // Already renamed, or a from-scratch DB. Nothing to reconcile.
    }

    if (!newRow) {
      // The normal path: rename in place. The id survives, so both child
      // tables stay attached and no vector or category rule is ever orphaned.
      // No updated_at on this table (shared/schema.ts:366-372) — name only.
      await db.execute(sql`
        UPDATE country_priority_sectors SET name = ${to} WHERE id = ${oldRow.id}
      `);
      renamed++;
      console.log(`  ✓ renamed sector "${from}" → "${to}" (id kept, children intact)`);
      continue;
    }

    // Recovery path: both rows exist, so a previous run half-applied or the
    // upsert already inserted the new name. Re-point the old row's children
    // onto the survivor, then drop the old row. ON CONFLICT DO NOTHING because
    // the survivor may already hold the same (sector, skill) / (sector,
    // category) pair from a seed run — a duplicate would violate the unique
    // indexes, and the survivor's value is the seeded one we want to keep.
    await db.execute(sql`
      UPDATE country_sector_wef_skills s SET sector_id = ${newRow.id}
      WHERE s.sector_id = ${oldRow.id}
        AND NOT EXISTS (
          SELECT 1 FROM country_sector_wef_skills t
          WHERE t.sector_id = ${newRow.id} AND t.wef_skill_id = s.wef_skill_id
        )
    `);
    await db.execute(sql`
      UPDATE country_sector_categories c SET sector_id = ${newRow.id}
      WHERE c.sector_id = ${oldRow.id}
        AND NOT EXISTS (
          SELECT 1 FROM country_sector_categories t
          WHERE t.sector_id = ${newRow.id}
            AND t.career_category IS NOT DISTINCT FROM c.career_category
            AND t.career_id IS NOT DISTINCT FROM c.career_id
        )
    `);
    // Whatever could not be re-pointed was a duplicate of a row the survivor
    // already has, so deleting it loses nothing.
    await db.execute(sql`DELETE FROM country_sector_wef_skills WHERE sector_id = ${oldRow.id}`);
    await db.execute(sql`DELETE FROM country_sector_categories WHERE sector_id = ${oldRow.id}`);
    await db.execute(sql`DELETE FROM country_priority_sectors WHERE id = ${oldRow.id}`);
    merged++;
    console.log(`  ✓ merged duplicate sector "${from}" into "${to}" (children re-pointed, old row deleted)`);
  }

  if (renamed || merged) {
    console.log(`✓ Sector renames: ${renamed} renamed in place, ${merged} duplicates merged`);
  } else {
    console.log("✓ Sector renames: nothing to do (already applied)");
  }
}
