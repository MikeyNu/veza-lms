BEGIN;

ALTER TABLE scheduled_jobs
  ALTER COLUMN created_by DROP NOT NULL,
  ADD COLUMN created_source text NOT NULL DEFAULT 'legacy';

COMMIT;
