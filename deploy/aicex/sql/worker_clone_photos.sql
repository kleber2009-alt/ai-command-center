-- clone_user_photos: HeyGen talking photos a /clone user saved
-- (apps/infra-worker/lib/webhook.js /worker/clone/photo[s]). No migration in
-- the repo creates it; columns follow those INSERT/SELECT statements. The id
-- is an integer because transcribe keeps it in clone_drafts.photo_id.
CREATE TABLE IF NOT EXISTS clone_user_photos (
  id                       SERIAL PRIMARY KEY,
  telegram_user_id         BIGINT NOT NULL,
  name                     TEXT NOT NULL,
  heygen_talking_photo_id  TEXT NOT NULL,
  telegram_file_id         TEXT,
  source_image_url         TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clone_user_photos_tg_idx
  ON clone_user_photos (telegram_user_id, created_at DESC);
