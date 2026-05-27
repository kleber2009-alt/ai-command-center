-- Master kill-switch for the entire bot. Independent of auto_reply_enabled:
--   bot_enabled=false        → webhook acks 200 but pipeline is skipped
--                              (nothing persisted, classified, replied, notified)
--   bot_enabled=true & auto_reply_enabled=false
--                            → webhook ingests, classifies and stores; responder is silent
--   both true                → full pipeline

INSERT INTO system_settings (key, value) VALUES
  ('bot_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
