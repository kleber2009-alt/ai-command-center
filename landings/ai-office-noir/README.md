# AI Growth Office — noir

Тестовый сайт AI Growth Office, собранный скилом `.claude/skills/cinematic-site`
по технологии сайта White Mark: интро с отрисовкой знака, hero-видео со
скраббингом по скроллу, каталог агентов с фильтрами, карточка агента, тарифы,
о нас, контакты.

- Контент: `assets/data.js` (агенты и тарифы взяты из `apps/ai-office`).
- Страницы: правь `_source/pages` и `_source/partials`, затем
  `python3 .claude/skills/cinematic-site/scripts/build.py landings/ai-office-noir`.
- Визуал: всё в `img/` отрендерено из `_source/scene.html` (three.js, «ночной офис»):
  `node .claude/skills/cinematic-site/scripts/render-frames.js --scene landings/ai-office-noir/_source/scene.html --out landings/ai-office-noir/img --video hero`
- Заявки: Supabase `leads` (как в `apps/ai-office/config.js`, `source = ai_office_noir:*`)
  + `/api/notify-tg`, если сайт открыт на домене ai-office.
- Фото основателя: сейчас `img/founder.jpg` — кадр из сцены; замените на реальное фото 4:5.
- Не задеплоен.
