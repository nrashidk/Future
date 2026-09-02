/**
 * RECONCILING MIGRATION — priority-sector renames.
 *
 * Carries plan Phase 2's four renames and Phase 4's eight (the move onto
 * official UAE government sector names, docs/uae-official-sectors.md). See the
 * note on SECTOR_RENAMES for why the two phases are collapsed into one flat
 * list rather than applied in sequence.
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

/**
 * old name -> new name.
 *
 * ORDER-INDEPENDENT BY CONSTRUCTION, and it must stay that way: no `to` here is
 * any other row's `from`. That is asserted at run time by assertNoRenameChains()
 * below, because the property is easy to break and silent when broken — a chain
 * A->B, B->C applied in list order collapses to A->C, but applied in the other
 * order leaves A at B, and which you get depends on array position.
 *
 * PHASE 4 (docs/uae-official-sectors.md §3, §5) renamed 8 sectors onto official
 * UAE government terms. Three of them were themselves Phase-2 rename TARGETS,
 * which would have created exactly those chains:
 *
 *   Biotechnology     -P2-> Healthcare & Life Sciences        -P4-> Healthcare
 *   Space Exploration -P2-> Space & Future Sciences           -P4-> Space & Advanced Sciences
 *   Renewable Energy  -P2-> Renewable Energy & Sustainability -P4-> Renewable Energy
 *
 * So the Phase-2 rows were COLLAPSED onto their final targets rather than left
 * to chain. Two consequences worth knowing:
 *   - `Renewable Energy -> Renewable Energy & Sustainability` is GONE, because
 *     Phase 4 takes that name back and the mapping is now the identity. A
 *     pre-Phase-2 database already holds the correct final name.
 *   - `Biotechnology` and `Healthcare & Life Sciences` both map to `Healthcare`
 *     (same for the two space rows). Two sources, one target is fine: a given
 *     database holds at most one of them, and if it somehow holds both, the
 *     merge branch below reconciles them.
 *
 * Phase 2's own history is recorded in server/seed.ts above
 * UAE_SECTOR_CATEGORY_RULES; it is not re-derivable from this list any more.
 */
export const SECTOR_RENAMES: Array<{ from: string; to: string }> = [
  // — Phase 2 origins, collapsed onto their Phase 4 targets.
  { from: "Biotechnology", to: "Healthcare" },
  { from: "Space Exploration", to: "Space & Advanced Sciences" },
  { from: "Education", to: "Education & Human Capital" },

  // — Phase 4: official UAE government terms (docs/uae-official-sectors.md §5).
  // Rationale per row is in that report; the short form:
  { from: "Technology", to: "Digital Economy" },                              // no official sector is called "Technology"
  { from: "Creative Industries & Media", to: "Cultural & Creative Industries" }, // exact federal strategy name
  { from: "Renewable Energy & Sustainability", to: "Renewable Energy" },      // "Sustainability" is a theme, not a sector
  { from: "Space & Future Sciences", to: "Space & Advanced Sciences" },       // official term is "advanced sciences"
  { from: "Food Security & Agriculture", to: "Food Security" },              // agriculture is an activity inside it
  { from: "Healthcare & Life Sciences", to: "Healthcare" },                  // "life sciences" is emirate-level, not federal
  { from: "Financial Services & FinTech", to: "Financial Services" },        // NIS 2031 wording
  { from: "Tourism & Hospitality", to: "Tourism" },                          // UAE Tourism Strategy 2031 wording
];

/**
 * A rename list containing a chain (some row's `to` is another row's `from`)
 * produces a different end state depending on array order. Nothing downstream
 * would notice — the sectors would simply carry the wrong names, and the seed's
 * `unknown sector` warnings are non-fatal. So it is checked here, loudly, before
 * a single UPDATE runs.
 */
export function assertNoRenameChains(list = SECTOR_RENAMES): void {
  const sources = new Set(list.map(r => r.from));
  const chains = list.filter(r => sources.has(r.to));
  if (chains.length > 0) {
    throw new Error(
      `Sector rename list contains ${chains.length} chain(s) — the end state ` +
      `would depend on array order: ` +
      chains.map(c => `"${c.from}" -> "${c.to}" (and "${c.to}" is itself renamed)`).join("; ") +
      `. Collapse each chain onto its final target instead.`,
    );
  }
}

export async function applySectorRenames(countryId = "uae"): Promise<void> {
  assertNoRenameChains();

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
