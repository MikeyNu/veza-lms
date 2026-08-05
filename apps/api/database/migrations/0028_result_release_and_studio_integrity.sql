BEGIN;

CREATE OR REPLACE FUNCTION app.prepare_published_grade_result()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE prior_id uuid;
BEGIN
  IF NEW.state <> 'published' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO prior_id
  FROM learner_grade_results
  WHERE tenant_id=NEW.tenant_id
    AND enrolment_id=NEW.enrolment_id
    AND gradebook_item_id=NEW.gradebook_item_id
    AND state <> 'corrected'
    AND id <> NEW.id
  ORDER BY created_at DESC,id DESC
  LIMIT 1
  FOR UPDATE;

  IF prior_id IS NOT NULL THEN
    UPDATE learner_grade_results
    SET state='corrected'
    WHERE id=prior_id;
    IF NEW.supersedes_result_id IS NULL THEN
      NEW.supersedes_result_id:=prior_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learner_grade_results_prepare_publication ON learner_grade_results;
CREATE TRIGGER learner_grade_results_prepare_publication
BEFORE INSERT ON learner_grade_results
FOR EACH ROW EXECUTE FUNCTION app.prepare_published_grade_result();

CREATE OR REPLACE FUNCTION app.protect_ready_studio_assets()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status='ready' AND (
    NEW.object_key IS DISTINCT FROM OLD.object_key OR
    NEW.original_filename IS DISTINCT FROM OLD.original_filename OR
    NEW.media_type IS DISTINCT FROM OLD.media_type OR
    NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR
    NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256 OR
    NEW.asset_kind IS DISTINCT FROM OLD.asset_kind
  ) THEN
    RAISE EXCEPTION 'ready Studio asset evidence is immutable; register a new asset';
  END IF;
  IF NEW.status='ready' AND NEW.malware_status<>'clean' THEN
    RAISE EXCEPTION 'Studio assets require clean malware evidence before becoming ready';
  END IF;
  IF NEW.status='ready' AND NEW.asset_kind='image' AND NULLIF(btrim(NEW.alt_text),'') IS NULL THEN
    RAISE EXCEPTION 'ready images require alternative text';
  END IF;
  IF NEW.status='ready' AND NEW.asset_kind IN ('video','audio')
     AND NULLIF(btrim(NEW.caption_text),'') IS NULL
     AND NULLIF(btrim(NEW.transcript_text),'') IS NULL THEN
    RAISE EXCEPTION 'ready audio and video require captions or a transcript';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_assets_ready_integrity ON studio_assets;
CREATE TRIGGER studio_assets_ready_integrity
BEFORE UPDATE ON studio_assets
FOR EACH ROW EXECUTE FUNCTION app.protect_ready_studio_assets();

COMMIT;
