/**
 * One-off script to populate the `onet_code` column in the `careers` table
 * from the corrected Career → O*NET-SOC crosswalk.
 *
 * It ONLY updates the onet_code column. It never touches values_profile or any
 * other column, and it never creates careers. Each career is matched by exact
 * title; if no row matches a title it is reported as a skip (likely a title
 * mismatch between the crosswalk and the seeded data), never silently ignored.
 *
 * Source of truth is the single CAREER_ONET_CROSSWALK map exported from
 * scripts/parse-onet-values.ts (the 37-entry corrected version), so this script
 * cannot drift from the crosswalk we committed.
 *
 * Idempotent: re-running simply re-sets the same code for each title, which is
 * harmless.
 *
 * Requires DATABASE_URL in the environment. Run with:
 *   DATABASE_URL=... npx tsx scripts/populate-onet-codes.ts
 *
 * NOTE: this targets the live database — review before running.
 */

import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { careers } from "../shared/schema";
import { CAREER_ONET_CROSSWALK } from "./parse-onet-values";

async function populateOnetCodes() {
  const entries = Object.entries(CAREER_ONET_CROSSWALK);
  console.log(`Populating onet_code for ${entries.length} careers...\n`);

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const [title, onetCode] of entries) {
    // Update ONLY onet_code; scope strictly by exact title so no other career
    // or column is affected. .returning() lets us detect a zero-row match
    // (title mismatch) instead of failing silently.
    const result = await db
      .update(careers)
      .set({ onetCode })
      .where(eq(careers.title, title))
      .returning({ id: careers.id });

    if (result.length === 0) {
      console.warn(`  ⚠️  No row matched title "${title}" (${onetCode}) — skipping (title mismatch).`);
      skipped.push(title);
    } else {
      console.log(`  ✓ Updated "${title}" → ${onetCode}${result.length > 1 ? ` (${result.length} rows)` : ""}`);
      updated.push(title);
    }
  }

  console.log("\nPopulate complete:");
  console.log(`  - Updated: ${updated.length} / ${entries.length}`);
  console.log(`  - Skipped: ${skipped.length}${skipped.length ? ` (${skipped.join(", ")})` : ""}`);
}

populateOnetCodes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Populate onet_code failed:", error);
    process.exit(1);
  });
