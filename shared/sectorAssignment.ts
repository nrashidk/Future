/**
 * Which ONE priority sector a career belongs to, for the analytics sector
 * cards ("Talent Pipeline by Priority Sector").
 *
 * The owner's rule (2026-11-18, option A): a student is counted in the sector
 * of their TOP career, once, so the cards add up to the students assessed.
 * Before this every student was counted in every sector, and all ten cards
 * read the same number.
 *
 * Reads the same seeded map the vision score reads
 * (country_sector_categories) with the same OVERRIDE-EXCLUSIVE rule as
 * calculateVisionScore in server/services/matching.ts: if a career has any
 * per-career override row, only those rows are candidates; otherwise the rules
 * for its category. The highest relevance wins; a tie goes to the sector the
 * country lists first. No candidate -> null (the student is in no card).
 */
export interface SectorMapRow {
  sectorName: string;
  displayOrder: number;
  careerCategory: string | null;
  careerId: string | null;
  relevance: number | null;
}

export function primarySectorFor(
  career: { id: string; category: string | null | undefined },
  rows: readonly SectorMapRow[],
): string | null {
  const overrides = rows.filter((r) => r.careerId === career.id && r.relevance !== null);
  const category = (career.category ?? "").trim().toLowerCase();
  const candidates = overrides.length > 0
    ? overrides
    : rows.filter((r) => r.careerId === null && r.relevance !== null && category !== ""
        && (r.careerCategory ?? "").trim().toLowerCase() === category);
  let best: SectorMapRow | null = null;
  for (const r of candidates) {
    if (!best || (r.relevance as number) > (best.relevance as number)
      || ((r.relevance as number) === (best.relevance as number) && r.displayOrder < best.displayOrder)) {
      best = r;
    }
  }
  return best ? best.sectorName : null;
}
