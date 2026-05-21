-- Featured/Showcase media. Admin-set boolean flag; public showcase page reads
-- only is_featured=true rows; partial index makes the filter cheap.

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_at timestamp;

CREATE INDEX IF NOT EXISTS media_assets_featured_idx
  ON media_assets (featured_at DESC) WHERE is_featured = true;
