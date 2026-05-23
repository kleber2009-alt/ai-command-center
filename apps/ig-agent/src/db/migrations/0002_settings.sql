-- Generic key-value store for runtime-toggleable system settings.
-- First user: the global "auto-reply enabled" master switch.

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults. The auto-reply flag is ON by default — turning it OFF
-- silences the responder (Claude reply path) while the analyst keeps
-- writing intent/sentiment/recommendations into ai_recommendations.
INSERT INTO system_settings (key, value) VALUES
  ('auto_reply_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- Keep updated_at fresh on writes.
DROP TRIGGER IF EXISTS system_settings_touch_updated_at ON system_settings;
CREATE TRIGGER system_settings_touch_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
