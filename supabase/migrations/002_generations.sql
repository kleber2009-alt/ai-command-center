-- Adds a `generations` jsonb column to cache derivative content
-- (carousel, reels script, telegram post) keyed by generation type.

alter table transcripts
  add column if not exists generations jsonb;
