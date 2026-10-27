-- Dead links left on legacy Command Center rows after the move: the old
-- 46.62.215.11 API, Railway, and a ytdlp path that moved to apps/ytdlp.
UPDATE projects SET links = '[
  {"label":"Код (v1)","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/aisales/v1","kind":"repo"}
]'::jsonb, updated_at = NOW() WHERE slug = 'aisales-v1';

UPDATE projects SET links = '[
  {"label":"Код","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/ytdlp","kind":"repo"}
]'::jsonb, updated_at = NOW() WHERE slug = 'ytdlp';
