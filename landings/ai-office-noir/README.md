# AI Growth Office — noir

Сайт AI Growth Office, собранный скилом `.claude/skills/cinematic-site` по технологии
сайта White Mark (интро с отрисовкой знака, hero-видео со скраббингом по скроллу,
каталог с фильтрами, досье, бегущая лента, формы). Весь визуал и персонажи — из живого
офиса агентов hq2.aicex.club (`apps/hq-office`), тема «Обсидиан».

- **Персонажи и тексты**: `node landings/ai-office-noir/_source/import-hq.js` пересобирает
  `assets/data.js` из `apps/hq-office` — 4 руководителя и 25 агентов с досье (скиллы, процесс,
  готовые работы) и 10 последних задач из истории офиса. Руками `data.js` не править;
  настройки заявок — `_source/site-config.js`.
- **Кадры и видео**: `node landings/ai-office-noir/_source/hq-capture.js --stills` и `--video`
  снимают настоящий 3D-офис: поднимают `apps/hq-office` на локальном сервере, открывают
  `?debug&theme=obsidian`, прячут интерфейс и ведут часы офиса виртуально (кадр = 1/32 с).
  Ракурсы — `_source/hq-shots.json`; для кадров агентов все садятся за свои столы.
- **Страницы**: `_source/pages` + `_source/partials`, сборка —
  `python3 .claude/skills/cinematic-site/scripts/build.py landings/ai-office-noir`.
- **Палитра**: `assets/theme.css` (поверх движка `assets/site.css`).
- **Заявки**: Supabase `leads` (как `apps/ai-office/config.js`, `source = ai_office_noir:*`) +
  `/api/notify-tg` на домене ai-office.
- Не задеплоен.
