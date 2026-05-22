-- ============================================================
-- AI Command Center · Migration 017 · viral-clone как отдельный проект
-- ============================================================
-- Раньше viral_clone жил как milestone #5 у transcribe.
-- Теперь это самостоятельная карточка в дашборде со своим лендингом.
-- ============================================================

INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('viral-clone',
 'Reels Cloner',
 '🎬',
 'Залетевший Reels конкурента → твой Reels за 5 минут',
 'production',
 'Pipeline в @your_transscribe_bot: /clone <url> → yt-dlp/Apify → Whisper → Claude rewrite → HeyGen (твой аватар + голос) → Submagic (Hormozi 2 + B-rolls + зумы) → TG sendDocument. End-to-end 4-7 мин. Любая ссылка IG/TikTok/YouTube/X → готовый Reels 1080×1920 с твоим лицом и голосом, переписанный под твою нишу.',
 ARRAY['yt-dlp','Apify','Whisper v3','Claude Opus','HeyGen','Submagic','Telegram Bot API','ElevenLabs'],
 '[
   {"label":"Лендинг","url":"https://dashboard.46-62-215-11.nip.io/landings/viral-clone/","kind":"live"},
   {"label":"Запустить /clone","url":"https://t.me/your_transscribe_bot","kind":"admin"},
   {"label":"Pipeline handler","url":"https://github.com/kleber2009-alt/aisales-app-v2/blob/main/infra-worker/handlers/viral_clone.js","kind":"repo"},
   {"label":"Webhook dispatch","url":"https://transcribe.46-62-215-11.nip.io/worker/viral-clone/dispatch","kind":"api"}
 ]'::jsonb,
 25)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  technologies = EXCLUDED.technologies,
  links = EXCLUDED.links,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('viral-clone', 1, 'yt-dlp + Apify (IG residential proxy)',            'done',         NULL),
('viral-clone', 2, 'Whisper v3 транскрибация + word-timestamps',       'done',         NULL),
('viral-clone', 3, 'Claude rewrite под нишу пользователя',             'done',         NULL),
('viral-clone', 4, 'HeyGen API: аватар + voice clone',                 'done',         NULL),
('viral-clone', 5, 'Submagic Hormozi 2 + B-rolls + zooms',             'done',         NULL),
('viral-clone', 6, 'TG sendDocument (≤50МБ) / direct-link fallback',   'done',         NULL),
('viral-clone', 7, 'Stage-timeout sweep (orphan pipeline)',            'done',         NULL),
('viral-clone', 8, 'Лендинг + публичный путь клиента',                 'done',         NULL),
('viral-clone', 9, 'Deep-link /start=clone_<url> в боте',              'planned',      'Бот должен парсить base64 payload и сразу запускать /clone'),
('viral-clone',10, 'Refund flow при failed pipeline',                  'planned',      NULL)
ON CONFLICT DO NOTHING;
