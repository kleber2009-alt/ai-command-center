-- ============================================================
-- AI Command Center · Migration 018 · open-gen-ai как проект
-- ============================================================
-- Open Generative AI — Next.js 15 студия для генерации изображений,
-- видео и lipsync. Прокси на api.muapi.ai через middleware.js, ключ
-- юзера живёт только в его browser localStorage. Никакой серверной
-- стороны, никакой БД — чистый stateless renderer.
--
-- Применять вручную после `docker compose up -d --build open-gen-ai`:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < apps/aisales/db-init/018_open_gen_ai_project.sql
-- ============================================================

INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('open-gen-ai',
 'Open Generative AI',
 '🎨',
 'Open-source студия image/video/lipsync на 200+ моделях через Muapi',
 'dev',
 'Self-hosted Next.js 15 студия: Image Studio (Nano Banana Pro, Flux, и другие), Video Studio, Lip Sync, Cinema. Без серверной части — middleware.js рерайтит /api/v1/* на api.muapi.ai с клиентским x-api-key (хранится в localStorage пользователя). Состоит из 4 workspace-пакетов: studio (UI), workflow-builder (Vibe-Workflow node-based), ai-agent (Open-Poe-AI), design-agent (Open-AI-Design-Agent).',
 ARRAY['Next.js 15','React 19','Tailwind v4','Muapi.ai','@xyflow/react','Electron'],
 '[
   {"label":"Студия","url":"https://open-gen-ai.46-62-215-11.nip.io/","kind":"live"},
   {"label":"Upstream repo","url":"https://github.com/Anil-matcha/Open-Generative-AI","kind":"repo"},
   {"label":"Muapi API","url":"https://muapi.ai/","kind":"docs"}
 ]'::jsonb,
 110)
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
('open-gen-ai', 1, 'Image Studio (Nano Banana Pro UI)',                  'done',    'Готово в апстриме'),
('open-gen-ai', 2, 'ApiKeyModal + localStorage flow',                    'done',    'Юзер сам приносит Muapi key'),
('open-gen-ai', 3, 'Перенос в монорепо apps/open-gen-ai',                'done',    'Submodules склонированы как обычные файлы'),
('open-gen-ai', 4, 'Docker build + infra/docker-compose сервис',         'done',    '127.0.0.1:3008:3000 + Caddy snippet'),
('open-gen-ai', 5, 'Прод-деплой за Caddy (open-gen-ai.46-62-215-11.nip.io)', 'planned', 'ssh prod && docker compose up -d --build open-gen-ai + reload caddy'),
('open-gen-ai', 6, 'Video Studio + Lip Sync wiring',                     'planned', 'models в models_dump.json есть, UI не подключён'),
('open-gen-ai', 7, 'Cinema (multi-shot pipeline)',                       'planned', NULL)
ON CONFLICT DO NOTHING;
