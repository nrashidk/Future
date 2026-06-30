# One-off migration scripts (manual-migration audit trail)

These scripts were **already run once against the production Neon database
(`ep-floral-rice`)**. The project schema is managed with `db:push` (Drizzle
push, no migration journal), so there is no generated migration history. These
files are kept as the **only record of manual prod schema/data changes** — for
audit and reproducibility. Do not re-run them blindly; each has already been
applied.

| Script | What it did | Status |
|---|---|---|
| `add_component_breakdown.cjs` | DDL: added a nullable `jsonb` `component_breakdown` column to the `recommendations` table. | Applied |
| `backfill_breakdown_apply.cjs` | Backfilled `component_breakdown` from each row's `reasoning`, in a single transaction with verify-gates (aborts/rolls back if any row flags). | Applied |
| `cvq_reset_apply.cjs` | Transactional CVQ reset to the 5-domain / 15-item structure. | Applied |
