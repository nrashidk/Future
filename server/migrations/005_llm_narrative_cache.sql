-- LLM Narrative Cache: stores generated AI narratives so repeated page loads
-- return instantly instead of making a new LLM call every time.
-- Keyed by (assessment_id, career_id, prompt_key, language).
-- Rows are deleted automatically when the parent assessment or career is removed
-- (ON DELETE CASCADE), and explicitly when a prompt template is updated.

CREATE TABLE IF NOT EXISTS llm_narrative_cache (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id VARCHAR NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  career_id VARCHAR NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  prompt_key TEXT NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  narrative TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS llm_narrative_cache_unique_idx
  ON llm_narrative_cache(assessment_id, career_id, prompt_key, language);

CREATE INDEX IF NOT EXISTS llm_narrative_cache_assessment_idx
  ON llm_narrative_cache(assessment_id);

CREATE INDEX IF NOT EXISTS llm_narrative_cache_prompt_key_idx
  ON llm_narrative_cache(prompt_key);
