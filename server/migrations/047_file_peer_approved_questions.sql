-- 047: file the questions of submissions that peer review approved and that
-- never reached the bank.
--
-- Until 2026-11-15 a peer approval set contribution_submissions.status to
-- 'approved' and nothing else (storage.recordContributionReview). The
-- superadmin review route, the only other writer of contributed questions,
-- refuses a submission that is already approved, so these questions reached
-- no student. Found on the first live peer approval (Test High School's Grade
-- 10 Mathematics, approved by UAQ School and AD School); the code is fixed in
-- the same change, and this files what was approved before it.
--
-- WHICH SUBMISSIONS: approved (or rewarded since: 'claimed'), decided by
-- schools' votes (a contribution_reviews row exists), and with NO question in
-- the bank pointing back at them. A superadmin approval always filed its
-- questions, so "none filed" separates the two paths without guessing.
--
-- Filed under the catalogue's subject NAME, matched on the code the school
-- submitted, exactly as the code now does. A submission whose subject has
-- left the catalogue is skipped, not filed under the code (which no quiz
-- would ever serve). Options are shuffled, as createQuizQuestion does, so
-- the author's order (correct answer first, usually) is not what students see;
-- correct_answer is text, so the shuffle cannot move it.
--
-- IDEMPOTENT: the NOT EXISTS is false for every submission after one run.

INSERT INTO quiz_questions (
  question, question_type, options, correct_answer, explanation,
  subject, grade, country_id, curriculum, topic, difficulty, cognitive_level,
  source_type, contributed_by_org_id, contribution_submission_id,
  is_llm_generated, academic_year
)
SELECT
  q->>'question',
  'multiple_choice',
  (SELECT jsonb_agg(o ORDER BY random()) FROM jsonb_array_elements(q->'options') o),
  q->>'correctAnswer',
  NULLIF(q->>'explanation', ''),
  sub.name,
  s.grade,
  s.country_id,
  s.curriculum,
  q->>'topic',
  q->>'difficulty',
  q->>'cognitiveLevel',
  'school_contribution',
  s.organization_id,
  s.id,
  false,
  CASE WHEN EXTRACT(MONTH FROM NOW()) >= 7
       THEN EXTRACT(YEAR FROM NOW())::int || '-' || (EXTRACT(YEAR FROM NOW())::int + 1)
       ELSE (EXTRACT(YEAR FROM NOW())::int - 1) || '-' || EXTRACT(YEAR FROM NOW())::int
  END
FROM contribution_submissions s
JOIN subjects sub
  ON sub.country_id = s.country_id AND sub.curriculum = s.curriculum AND sub.code = s.subject
CROSS JOIN LATERAL jsonb_array_elements(s.questions) q
WHERE s.status IN ('approved', 'claimed')
  AND EXISTS (SELECT 1 FROM contribution_reviews r WHERE r.submission_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM quiz_questions x WHERE x.contribution_submission_id = s.id);

-- The DOWN below is broader than the UP: it removes every contributed question
-- from a submission schools voted on, which includes ones the fixed code files
-- later and any a superadmin filed by overriding a vote in progress.
-- Production held one such submission when this was written.
-- DOWN (manual, not run by the runner):
--   DELETE FROM quiz_questions x
--    WHERE x.source_type = 'school_contribution'
--      AND EXISTS (SELECT 1 FROM contribution_reviews r WHERE r.submission_id = x.contribution_submission_id);
