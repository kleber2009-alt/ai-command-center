-- Phase 7: Instagram Intelligence module

-- Scraped Instagram accounts
CREATE TABLE instagram_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT        UNIQUE NOT NULL,
  full_name       TEXT,
  bio             TEXT,
  followers_count INT,
  following_count INT,
  posts_count     INT,
  profile_pic_url TEXT,
  is_verified     BOOLEAN     NOT NULL DEFAULT false,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual Reels scraped per account
CREATE TABLE instagram_reels (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID         NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  shortcode      TEXT         UNIQUE NOT NULL,
  instagram_url  TEXT         NOT NULL,
  caption        TEXT,
  hashtags       TEXT[],
  audio_title    TEXT,
  published_at   TIMESTAMPTZ,
  views_count    BIGINT       NOT NULL DEFAULT 0,
  likes_count    INT          NOT NULL DEFAULT 0,
  comments_count INT          NOT NULL DEFAULT 0,
  duration       NUMERIC(7,2),
  thumbnail_url  TEXT,
  video_url      TEXT,
  transcript     TEXT,
  viral_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX instagram_reels_account_idx  ON instagram_reels (account_id);
CREATE INDEX instagram_reels_viral_idx    ON instagram_reels (viral_score DESC);
CREATE INDEX instagram_reels_views_idx    ON instagram_reels (views_count DESC);

-- AI analysis reports per account or trend run
CREATE TABLE instagram_analysis_reports (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              UUID        REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  report_type             TEXT        NOT NULL, -- 'account' | 'trend'
  input_data              JSONB       NOT NULL DEFAULT '{}',
  summary                 TEXT,
  top_hooks               JSONB,
  top_topics              JSONB,
  viral_patterns          JSONB,
  content_recommendations JSONB,
  weak_points             JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX instagram_reports_account_idx  ON instagram_analysis_reports (account_id);
CREATE INDEX instagram_reports_type_idx     ON instagram_analysis_reports (report_type);

-- Trend research reports across multiple competitors
CREATE TABLE trend_research_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  niche           TEXT        NOT NULL,
  competitors     TEXT[],
  language        TEXT        NOT NULL DEFAULT 'ru',
  geo             TEXT        NOT NULL DEFAULT 'global',
  top_reels       JSONB,
  trend_patterns  JSONB,
  trending_hooks  JSONB,
  trending_audios JSONB,
  content_ideas   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
