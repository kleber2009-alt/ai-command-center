-- ============================================================
-- AI Command Center · Migration 011 · Projects (доп. пачка)
-- ============================================================
-- Проекты которые живут не в монорепо: отдельные ветки или внешние
-- репо/деплои. Идемпотентно: ON CONFLICT DO NOTHING.

INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('legal-site',
 'Legal Site',
 '⚖️',
 'Лендинг юридической компании (Next.js + Netlify)',
 'production',
 'Статический сайт юридической компании: hero, услуги, отдельная страница для пенсионеров, прямые контакты в Telegram + WhatsApp без формы лидов. Полностью static export, деплой на Netlify. Живёт отдельным проектом в ветке claude/legal-company-site-Iy5a0.',
 ARRAY['Next.js 14','TypeScript','Tailwind','Netlify','Static export'],
 '[
   {"label":"Repo (ветка)","url":"https://github.com/kleber2009-alt/ai-command-center/tree/claude/legal-company-site-Iy5a0/legal-site","kind":"repo"},
   {"label":"Netlify dashboard","url":"https://app.netlify.com","kind":"admin"}
 ]'::jsonb,
 90)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('legal-site', 1, 'MVP: hero + услуги + контакты',                'done',         NULL),
('legal-site', 2, 'Отдельная страница для пенсионеров',            'done',         NULL),
('legal-site', 3, 'Static export → Netlify deploy',                'done',         NULL),
('legal-site', 4, 'Убрать форму лидов, прямые TG/WhatsApp кнопки', 'done',         NULL),
('legal-site', 5, 'Заполнить реальные TG/WhatsApp в Netlify env',  'in_progress',  'NEXT_PUBLIC_TELEGRAM_USERNAME и NEXT_PUBLIC_WHATSAPP_PHONE'),
('legal-site', 6, 'Подключить домен (вместо .netlify.app)',        'planned',      NULL),
('legal-site', 7, 'Yandex.Metrika / GA4',                          'planned',      NULL)
ON CONFLICT DO NOTHING;
