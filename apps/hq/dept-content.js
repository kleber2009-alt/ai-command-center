/* Окна команд: результаты, скиллы и шаблоны задач.
   Всё, что лежит в assets/, — реальные работы из проектов; ссылки claude.ai — артефакты.
   Блок с private: true показывается только локально; на публичном сайте вместо него — fallback. */
const A = 'https://marketing.aicex.club/assets/';
const ART = id => 'https://claude.ai/artifact/' + id;
const SK = (name, title, desc, say) => ({ name, title, desc, say });

window.DEPT_CONTENT = {
  hq: {
    lead: 'Илья задаёт стратегию и развивает продукты. Фируза ведёт маркетинг, Богдан — продажи, Нуркен — рекламу в Meta. У каждого руководителя в подчинении ИИ-агенты, которые работают своими скиллами. Выберите отдел, чтобы увидеть его результаты.',
  },

  edit: {
    lead: 'Монтирует рилсы, шортсы и длинные ролики кодом (Remotion, HyperFrames, ffmpeg): хук, субтитры, вставки, музыка. Каждый стиль — отдельный скилл, всего их больше 35.',
    results: [
      { type: 'strips', title: 'Скриншоты монтажа — кадры из готовых роликов', items: [
        { src: A + 'img/shots/claude-vs-gpt.jpg', title: 'Claude vs GPT — сравнение двух монтажей в одном кадре' },
        { src: A + 'img/shots/dvoinik.jpg', title: 'Двойник — рилс с ИИ-аватаром HeyGen' },
        { src: A + 'img/shots/claude-machine.jpg', title: 'Claude — машина для соцсетей' },
        { src: A + 'img/shots/demo-reel.jpg', title: 'Промо-рилс бота монтажа' },
        { src: A + 'img/shots/avatar-reel.jpg', title: 'Рилс с аватаром' },
        { src: A + 'img/shots/reel-4-steps.jpg', title: 'Рилс «4 шага»' },
        { src: A + 'img/shots/panel-explainer.jpg', title: 'Объяснялка «панель»' },
        { src: A + 'img/shots/pulse-promo.jpg', title: 'Промо «Пульс» 16:9, 4K' },
      ] },
      { type: 'gallery', title: 'Проверка монтажа: субтитры, биты и переходы', items: [
        { src: A + 'img/shots/panel-captions_01.jpg', title: 'Субтитры по словам' },
        { src: A + 'img/shots/panel-beats_01.jpg', title: 'Биты и вставки' },
        { src: A + 'img/shots/panel-switches.jpg', title: 'Переключения кадра' },
      ] },
      { type: 'videos', title: 'Готовые ролики', items: [
        { src: A + 'video/claude-vs-gpt.mp4', title: 'Claude vs GPT — кто монтирует лучше' },
        { src: A + 'video/dvoinik.mp4', title: 'Рилс «Двойник»' },
        { src: A + 'video/claude-machine.mp4', title: 'Claude — машина для соцсетей' },
        { src: A + 'video/demo-reel.mp4', title: 'Промо-рилс бота монтажа' },
        { src: A + 'video/avatar-reel.mp4', title: 'Рилс с ИИ-аватаром' },
        { src: A + 'video/reel-4-steps.mp4', title: 'Рилс «4 шага»' },
        { src: A + 'video/panel-explainer.mp4', title: 'Объяснялка «панель»' },
      ] },
      { type: 'gallery', title: 'Стили монтажа — листы раскадровки', items: [
        ['montazh-rils-kobalt', 'Кобальт'], ['montazh-rils-uimotion', 'UI-моушн'], ['montazh-rils-scheme', 'Неоновая схема'],
        ['montazh-rils-arena', 'Арена'], ['montazh-rils-aura', 'Аура'], ['montazh-rils-gloss', 'Глянец'],
        ['montazh-rils-hud', 'HUD'], ['montazh-rils-vibecode', 'Вайбкод'], ['montazh-rils-pixel', 'Пиксель'],
        ['montazh-rils-duel', 'Дуэль'], ['montazh-rils-duel-journal', 'Дуэль-журнал'], ['montazh-rils-bluecaps', 'Синий капс'],
        ['reels-razbor', 'Разбор'], ['reels-shema-avatar', 'Схема + аватар'], ['reels-dvoinik', 'Двойник'],
        ['reels-promo-face', 'Промо с лицом'], ['promo-pulse', 'Пульс'],
      ].map(([f, t]) => ({ src: A + 'img/montage/' + f + '.jpg', title: t })) },
    ],
    skills: [
      SK('montazh-rils', 'Монтаж рилсов', 'Базовый движок 9:16: хук с лицом, сплит «демо + лицо», пословные субтитры, призыв «пиши слово».', 'смонтируй рилс'),
      SK('montazh-rils-kobalt', 'Кобальт', 'Синие студии, белые карточки интерфейсов, овалы «от руки», 3D-объекты.', 'смонтируй как кобальт'),
      SK('montazh-rils-uimotion', 'UI-моушн', 'Стеклянные карточки, тумблеры, чаты, 3D-игрушки на плитках.', 'смонтируй в UI-стиле'),
      SK('montazh-rils-scheme', 'Неоновая схема', 'Чёрный фон, лаймовый акцент, одна схема растёт весь ролик.', 'смонтируй схемой'),
      SK('montazh-rils-arena', 'Арена', 'Объяснялка без лица: бумага в клетку, пиксельные агенты, табло.', 'стиль арена'),
      SK('montazh-rils-aura', 'Аура', 'Рилс в стиле «Чингиз | AI & YouTube»: мягкое свечение, карточки новинок.', 'стиль аура'),
      SK('montazh-rils-gloss', 'Глянец', 'Глянцевая графика в стиле Charlie Hills.', 'стиль глянец'),
      SK('montazh-rils-hud', 'HUD', 'Интерфейс-HUD поверх видео в стиле GVOZDAREV.', 'стиль HUD'),
      SK('montazh-rils-vibecode', 'Вайбкод', 'Стиль @adilet.fndr: орбы, терминалы, цикл Claude.', 'стиль вайбкод'),
      SK('reels-dvoinik', 'Двойник', 'Рилс с ИИ-аватаром HeyGen вместо съёмки.', 'сделай рилс с двойником'),
      SK('reels-razbor / montazhka / bluecaps / duel / pixel', 'Стили бота монтажа', 'Разбор, Монтажка, Синий капс, Дуэль, Дуэль-журнал, Пиксель, Схема + аватар.', 'стиль дуэль'),
      SK('reels-ui-motion / reels-neon-schema', 'Рилсы без лица', 'UI-моушн и неоновая схема с ИИ-озвучкой — без съёмки.', 'рилс без лица'),
      SK('reels-promo-story / reels-promo-face', 'Промо-история', 'Продающая история продукта — с лицом или без.', 'промо-история'),
      SK('montazh-dlinnogo-video-youtube', 'Длинное видео YouTube', 'Горизонтальный ролик: хук, скринкаст в окнах macOS, промокод в конце.', 'монтаж длинного видео'),
      SK('educational-youtube-editor', 'Обучающее YouTube-видео', 'Длинный урок 16:9 с графикой на HyperFrames.', 'смонтируй урок для YouTube'),
      SK('promo-pulse', 'Пульс', 'Промо продукта без лица: 3D-карточки, логотип на дропе, своя музыка.', 'промо как Pulse'),
      SK('reels-herk', 'Стиль Nate Herk', 'Сплит «B-roll сверху / спикер снизу», боксовые титры.', 'смонтируй как Нейт'),
      SK('business-short-form-reels', 'Бизнес-рилс', 'Премиальный рилс: стеклянные плашки, уведомления Instagram, окна Google Docs.', 'do the business reel'),
      SK('explainer-panel-reel / glass-explainer-reel', 'Объяснялка «панель»', 'Спикер в панели внизу, анимации объясняют сверху.', 'panel edit'),
      SK('split-reel', 'Сплит-рилс', 'Лицо сверху, объясняющая анимация снизу.', 'split reel'),
      SK('broll-stacked-text-edit', 'B-roll + субтитры', 'Говорящая голова с B-roll из библиотеки и «стопкой» титров.', 'edit with my B-roll'),
      SK('cutout-backdrop-reel / cutout-grid-reel', 'Вырезанный спикер', 'Спикер вырезан и стоит на сменяющихся фонах или сетке 2×2.', 'cut-out reel'),
      SK('depth-ui-reel / image-cluster-reel / visual-essay-reel', 'Интерфейсы и коллажи', 'Реальные интерфейсы, облака картинок и «визуальное эссе» поверх спикера.', 'visual essay'),
      SK('ranking-format', 'Тир-лист', 'Рилс-рейтинг с таблицей S–F на экране.', 'tier list reel'),
      SK('youtube-clips / coaching-call-clips', 'Нарезка клипов', 'Находит лучшие моменты в длинном видео или созвоне и делает клипы.', 'нарежь клипы'),
      SK('fitted-stacked-captions', 'Субтитры «стопкой»', 'Одно слово крупно в акцентном цвете, остальные обтекают его.', 'stacked captions'),
      SK('hyperframes', 'HyperFrames', 'Видео из HTML: титры, графики, карты, 3D, 450 готовых блоков.', 'сделай видео на HyperFrames'),
    ],
    templates: [
      { who: 'edit-0', task: 'Монтаж рилса в стиле', prompt: 'Смонтируй рилс в стиле «Кобальт» из video.mov. Хук — первые 3 секунды, субтитры по словам, в конце призыв «пиши СЛОВО».' },
      { who: 'edit-1', task: 'Субтитры и чистка речи', prompt: 'Вырежи паузы и оговорки из talk.mp4, добавь пословные субтитры с акцентом на ключевых словах, громкость −14 LUFS.' },
      { who: 'edit-2', task: 'Графика и промо', prompt: 'Сделай промо-ролик продукта в стиле «Пульс», 30 секунд 9:16: 4 фичи, логотип на дропе, финальная кнопка.' },
    ],
    artifacts: [
      { title: 'Пакет скиллов по монтажу видео', url: ART('8Sx4z7NmqWs6CnjieSbEHJ') },
      { title: 'Мини-апп монтажа', url: ART('5MttqUph3kSsvi8iW5TDGs') },
      { title: 'Монтаж Палия', url: ART('HardKCwUitYL85CPU9cYwb') },
      { title: 'Рилс «Claude vs GPT» — сценарий и ТЗ', url: ART('Cft7hmLVrPK9P9RA4A8NqM') },
      { title: 'ТЗ: агент Silent Reels', url: ART('GRJDBxDhoN7ncD8Bp7bCEH') },
      { title: 'Лендинг бота монтажа — reels.aicex.club', url: 'https://reels.aicex.club' },
    ],
  },

  research: {
    lead: 'Ищет темы, хуки и механики у конкурентов, разбирает чужие рилсы и превращает находки в сценарии и ТЗ для монтажа.',
    results: [
      { type: 'links', title: 'Разборы и исследования', items: [
        { title: 'ТЗ на продающие рилсы — разбор @bondar_idm', url: ART('FmuSoMWs8iVphWcC9AYgPL'), note: 'Скелет продающего рилса по топовым публикациям' },
        { title: '10 продающих рилс по скелету Бондаря', url: ART('MfLyqeAaZGw62HSUwuCCZd'), note: 'Готовые сценарии из найденной механики' },
        { title: 'Контент Илья — органика', url: ART('5LwBz4Y5Yhdxj6pDcTG6Wp'), note: 'Анализ органического контента' },
        { title: '12 рабочих связок', url: ART('Xs6q7BfiHsmEdYxSAXt9DU'), note: 'Пошаговые инструкции по связкам инструментов' },
        { title: 'Трек Юлии: 0 → 10 000 подписчиков', url: ART('BLULR8V3fsKhF7H7tWKyv9'), note: 'План роста аккаунта' },
        { title: 'Prod Skills — игровые концепции', url: ART('8bFig9B5aX3RqzZqS5LdkZ'), note: 'Идеи форматов и механик' },
      ] },
      { type: 'frame', private: true, title: 'Анализ контента и контент-план (вкладка «Контент» в дашборде)', src: A + 'pages/analytics.html#content', h: 760 },
    ],
    skills: [
      SK('niche-outlier-research', 'Выбросы в нише', 'Находит публикации, которые набрали в разы больше нормы автора, и объясняет почему.', 'найди выбросы в нише'),
      SK('deep-research', 'Глубокое исследование', 'Многошаговый поиск по вебу с источниками и выводами.', 'исследуй тему'),
      SK('watch', 'Посмотреть видео', 'Скачивает ролик по ссылке, снимает субтитры и кадры — разбор чужого рилса.', '/watch ссылка'),
      SK('video-to-written-content', 'Видео → текст', 'Превращает видео в пост, рассылку или тред в вашем голосе.', 'сделай пост из видео'),
      SK('reels-script', 'Сценарий рилса', 'Пишет сценарий по скелету: хук → напряжение → решение → призыв.', 'напиши сценарий рилса'),
      SK('Apify', 'Сбор данных', 'Скрейпит Instagram, TikTok, YouTube: охваты, комментарии, кодовые слова.', 'собери топ-рилсы аккаунта'),
      SK('personal-broll-library', 'Библиотека B-roll', 'Индексирует свои съёмки и находит нужный кадр по описанию.', 'найди b-roll где я за ноутбуком'),
    ],
    templates: [
      { who: 'research-0', task: 'Тренды недели', prompt: 'Найди 10 рилсов в нише ИИ для экспертов за 7 дней, которые набрали в 3+ раза больше медианы автора. Для каждого — хук и механика.' },
      { who: 'research-1', task: 'Разбор конкурента', prompt: 'Разбери аккаунт @конкурент: топ-20 публикаций по входам в комментарии, общий скелет, 5 идей для нас.' },
    ],
  },

  analytics: {
    lead: 'Сводит рекламу, продажи, расходы и контент в один дашборд: ROMI по кампаниям, воронка от клика до оплаты, юнит-экономика.',
    results: [
      { type: 'frame', private: true, title: 'Сквозная аналитика — рабочий дашборд', src: A + 'pages/analytics.html', h: 900,
        note: 'В дашборде реальные финансы школы: выручка, расходы и зарплаты. На публичном сайте он скрыт.',
        fallback: { src: A + 'img/analytics/funnel.jpg', title: 'Сквозная аналитика: источники данных (цифры скрыты на публичной версии)' } },
    ],
    skills: [
      SK('dataviz', 'Графики и дашборды', 'Единая система графиков: форма, цвета, подписи, светлая и тёмная тема.', 'сделай дашборд'),
      SK('Windsor.ai', 'Рекламные кабинеты', 'Тянет данные Meta Ads, Google Ads, TikTok, GA4, Stripe и CRM в один отчёт.', 'выгрузи расходы Meta за месяц'),
      SK('xlsx', 'Таблицы', 'Читает и собирает Excel и Google Sheets: декомпозиция, план/факт.', 'собери таблицу план/факт'),
      SK('superbooks:reading-financial-reports', 'Финотчёты', 'Разбирает P&L и движение денег простыми словами.', 'объясни отчёт о прибыли'),
      SK('superbooks:cleaning-up-bookkeeping', 'Порядок в учёте', 'Разносит транзакции по статьям и находит дубли.', 'разбери расходы по статьям'),
      SK('niche-outlier-research', 'Контент-аналитика', 'Входы по публикациям, медианы авторов, рилсы против каруселей.', 'посчитай входы по постам'),
    ],
    templates: [
      { who: 'analytics-0', task: 'Отчёт по охватам', prompt: 'Собери охваты и входы по всем публикациям за месяц: рилсы против каруселей, топ-10 по входам, медиана по аккаунту.' },
      { who: 'analytics-1', task: 'ROMI по каналам', prompt: 'Посчитай ROMI по кампаниям Meta за период, сверь лиды с кабинетом, покажи, где теряются деньги.' },
    ],
    artifacts: [],
  },

  carousel: {
    lead: 'Делает карусели для Instagram кодом в тех же стилях, что и рилсы: обложка-хук, пункты, вставки, призыв «пиши слово». 24 стиля.',
    results: [
      { type: 'gallery', title: '24 стиля каруселей', wide: true, items: [
        ['palii', 'Палий'], ['sticker', 'Стикер'], ['journal', 'Журнал'], ['neon', 'Неон'], ['cream', 'Крем'], ['apple', 'Apple'],
        ['tech', 'Тех-обзор'], ['arena', 'Арена'], ['kobalt', 'Кобальт'], ['uimotion', 'UI-моушн'], ['scheme', 'Схема'], ['razbor', 'Разбор'],
        ['montazhka', 'Монтажка'], ['promo', 'Промо-история'], ['dvoinik', 'Двойник'], ['youtube', 'YouTube «Монтаж ЭМ»'], ['bluecaps', 'Синий капс'], ['duel', 'Дуэль'],
        ['dueljournal', 'Дуэль-журнал'], ['pixel', 'Пиксель'], ['shemaava', 'Схема + аватар'], ['pulse', 'Пульс'], ['vibecode', 'Вайбкод'], ['aura', 'Аура'],
      ].map(([f, t]) => ({ src: A + 'img/carousel/' + f + '.jpg', title: t })) },
      { type: 'frame', title: 'Готовая карусель (PDF)', src: A + 'pages/karusel-v1.pdf', h: 720 },
    ],
    skills: [
      SK('karusel', 'Карусель', 'Слайды 4:5, 1:1 или 9:16 в любом из 24 стилей; PNG, лист-превью, PDF, отправка альбомом в Telegram.', 'сделай карусель в стиле Кобальт'),
      SK('reels-ui-motion', 'UI-моушн', 'Тот же визуальный язык, что у рилсов: карточки, тумблеры, 3D-иконки.', 'карусель в UI-стиле'),
      SK('montazh-rils-scheme', 'Неоновая схема', 'Лаймовая схема на чёрном — и для рилсов, и для каруселей.', 'карусель схемой'),
      SK('bs-grokbot-avatar', 'Аватар-маскот', 'Мягкие 3D-маскоты для обложек и персонажей карусели.', 'сделай маскота'),
      SK('canvas-design', 'Постеры и обложки', 'Статичные визуалы и обложки в PNG и PDF.', 'сделай обложку'),
      SK('video-to-written-content', 'Карусель из видео', 'Достаёт тезисы из ролика для слайдов.', 'карусель из этого видео'),
    ],
    templates: [
      { who: 'carousel-0', task: 'Карусель из рилса', prompt: 'Сделай карусель 10 слайдов 4:5 в стиле «Журнал» из сценария рилса. Обложка — хук с акцентом, последний слайд — «пиши СЛОВО».' },
      { who: 'carousel-1', task: 'Текст слайдов', prompt: 'Напиши тексты для карусели «5 ошибок эксперта в блоге»: каждый пункт — антипример → пример, до 25 слов на слайд.' },
    ],
  },

  funnel: {
    lead: 'Строит воронки «Нейроворонки»: лендинг → лид-магнит → бот с прогревом по дням → оффер и напоминания.',
    results: [
      { type: 'frames', title: 'Лендинги — 5 вариантов', h: 760, items: [1, 2, 3, 4, 5].map(i => ({ src: A + `pages/landing-a${i}.html`, title: 'Вариант A' + i })) },
      { type: 'gallery', title: 'Баннеры бота и лид-магниты', items: [
        ['magnet_voronka', 'Лид-магнит «Воронка»'], ['magnet_klon', 'Лид-магнит «Клон»'], ['magnet_potok', 'Лид-магнит «Поток»'],
        ['welcome', 'Приветствие'], ['lesson1', 'Урок 1'], ['lesson2', 'Урок 2'], ['day3', 'День 3'], ['bridge', 'Мост к офферу'],
        ['offer', 'Оффер'], ['remind_v1', 'Напоминание'], ['paid', 'После оплаты'],
      ].map(([f, t]) => ({ src: A + 'img/funnel/' + f + '.png', title: t })) },
    ],
    skills: [
      SK('lead-magnet', 'Лид-магнит', 'PDF или страница-подарок за подписку.', 'сделай лид-магнит'),
      SK('sprint-landing', 'Лендинг-спринт', 'Светлый «небесный» лендинг с одним синим акцентом.', 'сделай лендинг как спринт'),
      SK('copper-landing', 'Медь', 'Тёмный медный лендинг цифрового продукта: курсы, паки скиллов.', 'лендинг в стиле медь'),
      SK('reels-script', 'Продающие рилсы', 'Сценарии рилсов, которые ведут в бота по кодовому слову.', 'рилс с кодовым словом'),
      SK('docx / pdf', 'Документы', 'ТЗ, чек-листы и PDF-подарки для воронки.', 'сделай чек-лист в PDF'),
    ],
    templates: [
      { who: 'funnel-0', task: 'Цепочка прогрева', prompt: 'Распиши прогрев в боте на 7 дней: тема дня, баннер, текст сообщения, кнопка и переход к офферу на 5-й день.' },
      { who: 'funnel-1', task: 'Текст лид-магнита', prompt: 'Напиши лид-магнит «Как собрать нейроворонку за вечер»: 6 шагов, чек-лист и призыв забрать урок в боте.' },
    ],
    artifacts: [
      { title: 'Нейроворонка — ТЗ на Telegram-бота', url: ART('MEienkWZMA9dp3RugXzJRM') },
      { title: 'Нейроворонка — план реализации', url: ART('Qc9ehZN7mvMrUGin99JbYT') },
      { title: 'Нейроворонка — 5 лендингов', url: ART('GQybtJnYrc9EN4dYoorRae') },
      { title: 'Нейроворонка a1–a5', url: ART('DjnAUCjCvpqj7vLazrCE7e') },
      { title: 'NeuroFunnel (EN)', url: ART('UmhCiWJHjmKATyFKQKCUh3') },
      { title: 'VSL: Контент → Аудитория → Деньги', url: ART('3K2VLPCxZqQKu2oHTqTD69') },
    ],
  },

  slides: {
    lead: 'Готовит слайды вебинаров, эфиров, питчи и уроки: продающая структура, единый бренд, экспорт в PDF и PPTX.',
    results: [
      { type: 'frames', title: 'Презентации (листайте стрелками внутри окна)', h: 640, items: [
        { src: A + 'pages/copper/deck/index.html', title: 'Эфир «Монтаж рилсов с Claude» — Медь' },
        { src: A + 'pages/copper/presentation.pdf', title: 'Та же презентация в PDF' },
        { src: A + 'pages/presentation-svyazka.html', title: 'Лид-магнит «Первые 10 000»' },
        { src: A + 'pages/webinar/index.html', title: 'Урок 2 — блог с 0 до 10 000' },
      ] },
    ],
    skills: [
      SK('sprint-slides', 'Спринт-слайды', '16 макетов продающего вебинара: обложка, кейсы, тарифы, дедлайн с таймером, CTA с QR.', 'слайды для вебинара'),
      SK('copper-slides-pdf', 'Медь-слайды', 'Тёмный медный стиль: вебинар, эфир, питч — сразу в PDF.', 'презентация в стиле медь'),
      SK('pptx', 'PowerPoint', 'Собирает и правит .pptx: макеты, заметки, графики.', 'сделай pptx'),
      SK('slideshow', 'Слайдшоу HyperFrames', 'Презентация в браузере с анимациями и режимом докладчика.', 'сделай слайдшоу'),
      SK('wowerpoint', 'Wowerpoint', 'Яркая презентация-история из заметок.', 'сделай wowerpoint'),
      SK('lesson-doc-builder', 'Документ для урока', 'Экранный документ, который листают во время записи урока.', 'документ для урока'),
      SK('theme-factory', 'Темы оформления', 'Готовые темы для слайдов и документов.', 'подбери тему'),
    ],
    templates: [
      { who: 'slides-0', task: 'Слайды вебинара', prompt: 'Сделай 20 слайдов продающего вебинара «Нейроворонка»: план, спикер, кейс с метриками, тарифы, бонусы с дедлайном, CTA с QR.' },
    ],
    artifacts: [
      { title: 'Спринт Чёрный', url: ART('R56YaWRpHrDHPD8n7ZjUny') },
      { title: 'Презентация о связке (claude.ai)', url: ART('TAZq62RAQbfRsKWhMrzKFL') },
    ],
  },

  sites: {
    lead: 'Делает сайты и лендинги уровня студии и сразу выкладывает их на домен aicex.club через Cloudflare.',
    results: [
      { type: 'gallery', title: 'Сайты в продакшене', items: [
        { src: A + 'img/sites/skills.jpg', title: 'skills.aicex.club — лендинг «Медь»', url: 'https://skills.aicex.club' },
        { src: A + 'img/sites/reels.jpg', title: 'reels.aicex.club — лендинг бота монтажа', url: 'https://reels.aicex.club' },
        { src: A + 'img/sites/montazh.jpg', title: 'montazh.aicex.club — мини-апп в Telegram', url: 'https://montazh.aicex.club' },
        { src: A + 'img/sites/copper-light.jpg', title: 'Медь — светлая версия' },
      ] },
      { type: 'frames', title: 'Живые страницы', h: 760, items: [
        { src: A + 'pages/copper/site/index.html', title: 'Медь — тёмная' },
        { src: A + 'pages/copper/site-light/index.html', title: 'Медь — светлая' },
        { src: A + 'pages/landing-a1.html', title: 'Нейроворонка A1' },
        { src: A + 'pages/landing-a4.html', title: 'Нейроворонка A4' },
      ] },
    ],
    skills: [
      SK('pro-web-design', 'Веб-дизайн уровня студии', 'Сайты, лендинги и прототипы с wow-эффектом, а не «как у всех».', 'сделай сайт'),
      SK('heroui-site', 'HeroUI-сайт', 'Сайты и дашборды 1:1 в дизайн-системе heroui.com.', 'сайт как heroui'),
      SK('sprint-landing', 'Спринт-лендинг', 'Светлый SaaS-лендинг: Inter, один синий акцент, белые карточки.', 'лендинг как спринт'),
      SK('copper-landing', 'Медь', 'Тёмный медный лендинг цифрового продукта.', 'лендинг в стиле медь'),
      SK('landing-emerald / gold / light / neon / poster', '5 стилей лендинга', 'Готовые визуальные системы для страниц эксперта.', 'лендинг в стиле gold'),
      SK('frontend-design', 'Фронтенд-дизайн', 'Визуальное направление, типографика, сетка.', 'прокачай дизайн'),
      SK('web-artifacts-builder', 'Сложные сайты', 'React + Tailwind + shadcn для многостраничных проектов.', 'сделай веб-приложение'),
      SK('scroll-craft', 'Скролл-анимации', 'Сайты с анимацией по прокрутке.', 'сайт со скролл-анимацией'),
      SK('figma', 'Figma', 'Забирает макеты и токены из Figma в код и видео.', 'сделай по макету из Figma'),
    ],
    templates: [
      { who: 'sites-0', task: 'Лендинг курса', prompt: 'Сделай лендинг курса «Нейроворонка» в стиле «Медь»: оффер, программа, кейсы, тарифы, FAQ, кнопка в бота. Адаптив под телефон.' },
      { who: 'sites-1', task: 'Деплой на домен', prompt: 'Выложи папку site/ на поддомен course.aicex.club через Cloudflare Workers и проверь, что страница открывается по HTTPS.' },
    ],
    artifacts: [
      { title: 'Лендинги эксперта: 5 стилей', url: ART('F5cjiWb2ss8AvaC3uF3CHi') },
      { title: 'Лендинг Нейроворонка', url: ART('9xAM7woBmzLosiCnZt6uMe') },
      { title: 'Neuro-Funnel Landing', url: ART('9dWKV6kvSGuWUDqPKC4WtD') },
      { title: 'Persona Studio 2.0', url: ART('D1kTgCx8mQCTV3utcJdxFq') },
    ],
  },
};
