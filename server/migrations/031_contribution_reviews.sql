-- PEER REVIEW of contributed questions.
--
-- A submission that passed the automatic LLM check waited for a superadmin.
-- That does not scale past a handful of schools, and it puts one person's
-- judgement behind every question in the bank. Schools teaching the curriculum
-- are better placed to judge, and there are many of them.
--
-- Three reviews, two agreeing decides. One vote per SCHOOL -- enforced by the
-- unique index below, because a school with two administrators could otherwise
-- supply a majority by itself. The author check lives in the route, since an
-- index cannot see who wrote the submission.
--
-- Additive only: no existing column changes, so the down migration is a plain
-- DROP TABLE and submissions already in flight keep their current status.

CREATE TABLE IF NOT EXISTS contribution_reviews (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id     VARCHAR NOT NULL REFERENCES contribution_submissions(id) ON DELETE CASCADE,
  reviewer_org_id   VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reviewer_user_id  VARCHAR NOT NULL REFERENCES users(id),
  vote              TEXT NOT NULL,
  comment           TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT contribution_reviews_vote_check CHECK (vote IN ('approve', 'reject'))
);

CREATE INDEX IF NOT EXISTS contribution_reviews_submission_idx
  ON contribution_reviews (submission_id);
CREATE INDEX IF NOT EXISTS contribution_reviews_org_idx
  ON contribution_reviews (reviewer_org_id);

-- One vote per school per submission.
CREATE UNIQUE INDEX IF NOT EXISTS contribution_reviews_one_per_org
  ON contribution_reviews (submission_id, reviewer_org_id);

-- DOWN (manual, not run by the runner):
--   DROP TABLE contribution_reviews;
--   -- submissions sitting at 'peer_review' should be moved back to
--   -- 'llm_verified' so a superadmin picks them up again:
--   UPDATE contribution_submissions SET status = 'llm_verified'
--   WHERE status = 'peer_review';
