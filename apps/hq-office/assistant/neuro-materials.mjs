/* Ready materials of the project «Нейроворонка» — what is already made, for the cabinet (tab «Материалы») and for every agent of
   the office (in/neuro-cabinet.md → «Готовые материалы»: build on them, do not redo them).
   Each: kind, title, url (a public page, a claude.ai artifact — opens under the owner's account, a file on GitHub or hq2 media/),
   status — ready (готово) | draft (черновик, нужна доработка), plan — items of PLAN (cabinet.mjs) it is evidence for,
   preview — a picture for the card, note — what it is and what is left. Sources: the projects registry
   (apps/command-center/registry/projects.mjs → neuro-funnel), the history of the office (tasks.js), the course
   (apps/neuro-funnel on the branch of the course session). Video files — hq2 media/neuro/ (web copies). */
const ART = id => 'https://claude.ai/artifact/' + id;
const MK = 'https://marketing.aicex.club/assets/';
const GH = 'https://github.com/kleber2009-alt/ai-command-center/blob/claude/sleepy-hopper-1racwn/apps/neuro-funnel/';
// results of the office «Нейроворонка» accepted on the desk (published files of the task)
const DESK = (id, v = 1) => `https://hq2.aicex.club/api/assistant/desk/files/${id}/v${v}/index.html`;

export const MATERIAL_KINDS = { site:'Сайт и лендинг', video:'Видео', course:'Продукт: курс и уроки', bot:'Бот и сообщения', magnet:'Лид-магниты',
  content:'Контент', doc:'Стратегия и документы' };

export const MATERIALS = [
  // ── Сайт и лендинг ──
  { id:'site', kind:'site', status:'draft', plan:['b4'], title:'Продающий сайт neuro.aicex.club', url:'https://neuro.aicex.club/', preview:'https://neuro.aicex.club/img/og.jpg',
    note:'Сайт на своём домене (landings/neuro-funnel, собрал агент «Лендинг» 05.11): тарифы 14 900 / 34 900 ₽, окно потока 10–16.11, метки nf-… в ссылках. Кнопки оплаты и бота включаются после тестовой покупки и цепочки бота; оферта — заготовка.' },
  { id:'landing', kind:'site', status:'draft', plan:['b4'], title:'Лендинг «Нейроворонка»', url:ART('6z4UBbZhGNcCpVmJUp487P'),
    note:'Продающая страница курса (пока артефакт Claude). Осталось: оффер и тарифы, оплата, оферта, свой домен.' },
  { id:'landing-mock', kind:'site', status:'draft', plan:['b4'], title:'Макет лендинга Нейроворонки', url:ART('9xAM7woBmzLosiCnZt6uMe'), note:'Макет страницы.' },
  ...[1, 2, 3, 4, 5].map(n => ({ id:'landing-a' + n, kind:'site', status:'ready', plan:['b4'], title:`Лендинг Нейроворонки A${n}`, url:`${MK}pages/landing-a${n}.html`,
    note:['Стиль «Золото»', 'Стиль «Светлый»', 'Стиль «Неон»', 'Стиль «Постер»', 'Стиль «Изумруд»'][n - 1] + ' — живая страница на marketing.aicex.club, стиль упакован в скилл.' })),
  { id:'landings-5', kind:'site', status:'ready', plan:['b4'], title:'Нейроворонка — 5 лендингов', url:ART('GQybtJnYrc9EN4dYoorRae'), note:'Пять вариантов в одном месте для выбора.' },
  { id:'copper', kind:'site', status:'ready', plan:['b4'], title:'Сайт «Медь» (тёмная и светлая)', url:`${MK}pages/copper/site/index.html`, note:'Сайт в стиле «Медь», есть светлая версия.' },
  { id:'landing-en', kind:'site', status:'ready', plan:[], title:'Neuro-Funnel Landing (EN)', url:ART('9dWKV6kvSGuWUDqPKC4WtD'), note:'Англоязычный лендинг для аудитории вне РФ.' },

  // ── Видео ──
  { id:'vsl-v1', kind:'video', status:'draft', plan:['b3', 'd4'], title:'VSL «Нейроворонка» v1 · 6:20', url:'media/neuro/vsl-v1.mp4', preview:'media/neuro/vsl-v1.jpg', file:'media/neuro/vsl-v1.mp4',
    note:'Продающее видео для бота: аватар Ильи слева, слайды справа, хук «16 454 комментария». Без субтитров (решение 05.11, .srt отдельно). Ждут материалов слайды 12, 17, 20; второй вариант хука — ещё нет.' },
  { id:'lesson-01-pilot', kind:'video', status:'draft', plan:['b5'], title:'Урок 1 «Логика нейроворонки» — пилот · 0:44', url:'media/neuro/lesson-01-pilot.mp4', preview:'media/neuro/lesson-01-pilot.jpg', file:'media/neuro/lesson-01-pilot.mp4',
    note:'Пилот урока: аватар HeyGen + слайды 1920×1080, сборка конвейером курса.' },

  // ── Продукт: курс и уроки ──
  { id:'student-path', kind:'course', status:'ready', plan:['b5', 'b0'], title:'Путь ученика Нейроворонки (методология)', url:ART('WMFVEkC6qqEDAqpEWYae7k'),
    note:'Методология курса: путь ученика, урок → инструмент → своё → чек-лист → новая часть воронки.' },
  { id:'outline', kind:'course', status:'ready', plan:['b5'], title:'Программа курса: 10 уроков в 5 этапах', url:GH + 'course/outline.json',
    note:'Старт, логика, база знаний, контент, аватар и монтаж, кодовые слова, ИИ-агент в Директе, VSL и дожим, сайт и оплата, запуск и аналитика — у каждого урока инструмент, задание, результат.' },
  { id:'lesson-01', kind:'course', status:'draft', plan:['b5'], title:'Урок 1: суфлёр и слайды', url:GH + 'lessons/01/prompter.md', note:'Текст для аватара по слайдам и лист слайдов урока 1.' },
  { id:'karta-voronki', kind:'course', status:'ready', plan:['b5', 'b0'], title:'Шаблон «Карта воронки» (инструмент урока 1)', url:GH + 'lessons/01/materials/karta-voronki.md',
    note:'Формула денег и карта своей воронки вместе с Claude.' },
  { id:'vsl-script', kind:'course', status:'draft', plan:['b3', 'd4'], title:'Сценарий VSL (суфлёр)', url:GH + 'lessons/vsl/prompter.md', note:'Сценарий VSL, адаптирован из референса.' },
  { id:'pipeline', kind:'course', status:'ready', plan:['b5'], title:'Конвейер уроков: слайды → аватар → склейка', url:GH + 'pipeline/build_lesson.py',
    note:'Урок собирается сам: суфлёр, слайды Playwright, видео HeyGen по слайду, склейка, субтитры отдельно.' },

  // ── Бот и сообщения ──
  { id:'bot-spec', kind:'bot', status:'ready', plan:['b3', 'e2', 'e3'], title:'ТЗ на Telegram-бота Нейроворонки', url:ART('MEienkWZMA9dp3RugXzJRM'),
    note:'Подарок за кодовое слово, напоминания, мост к офферу, сообщения до и после оплаты. Бот ещё не собран.' },
  { id:'bot-bridge', kind:'bot', status:'ready', plan:['b3'], title:'Карточка «Мост к офферу»', url:`${MK}img/funnel/bridge.png`, preview:`${MK}img/funnel/bridge.png`, note:'Визуал бота.' },
  { id:'bot-offer', kind:'bot', status:'ready', plan:['b3'], title:'Карточка «Оффер»', url:`${MK}img/funnel/offer.png`, preview:`${MK}img/funnel/offer.png`, note:'Визуал бота.' },
  { id:'bot-remind', kind:'bot', status:'ready', plan:['e2'], title:'Карточка «Напоминание»', url:`${MK}img/funnel/remind_v1.png`, preview:`${MK}img/funnel/remind_v1.png`, note:'Визуал дожима.' },

  // ── Лид-магниты ──
  { id:'magnet-voronka', kind:'magnet', status:'ready', plan:['b2'], title:'Лид-магнит «Воронка»', url:`${MK}img/funnel/magnet_voronka.png`, preview:`${MK}img/funnel/magnet_voronka.png`, note:'Подарок за кодовое слово.' },
  { id:'magnet-klon', kind:'magnet', status:'ready', plan:['b2'], title:'Лид-магнит «Клон»', url:`${MK}img/funnel/magnet_klon.png`, preview:`${MK}img/funnel/magnet_klon.png`, note:'Подарок за кодовое слово.' },
  { id:'magnet-potok', kind:'magnet', status:'ready', plan:['b2'], title:'Лид-магнит «Поток»', url:`${MK}img/funnel/magnet_potok.png`, preview:`${MK}img/funnel/magnet_potok.png`, note:'Подарок за кодовое слово.' },

  // ── Контент ──
  { id:'reels-10', kind:'content', status:'ready', plan:['b1'], title:'10 продающих рилсов Нейроворонки', url:ART('MfLyqeAaZGw62HSUwuCCZd'), note:'Сценарии по скелету блогера-ориентира. Не сняты и не смонтированы.' },
  { id:'reels-spec', kind:'content', status:'ready', plan:['b1', 'b0'], title:'ТЗ на продающие рилсы — разбор', url:ART('FmuSoMWs8iVphWcC9AYgPL'), note:'Как устроены продающие рилсы: скелет, хуки, кодовое слово.' },
  { id:'montage-skills', kind:'content', status:'ready', plan:['b1'], title:'Пакет скиллов монтажа (35+ стилей)', url:ART('8Sx4z7NmqWs6CnjieSbEHJ'), note:'Монтаж рилсов кодом — у агентов «Монтаж рилсов и VSL» и «Аватар HeyGen».' },

  // ── Решения и работа офиса Нейроворонки (05.11) ──
  { id:'offer', kind:'doc', status:'ready', plan:['d1'], title:'Оффер, цена и тарифы', url:DESK('e9e345d2', 2), note:'Уроки 14 900 ₽, Уроки + поддержка 34 900 ₽ (товары в ChatPlace), гарантия 14 дней, окно потока 10–16.11.' },
  { id:'kb', kind:'doc', status:'ready', plan:['b0'], title:'База знаний: 3 сегмента ЦА, 36 хуков, голос бренда', url:DESK('0a6e6504'), note:'Продукт, сегменты с болями и возражениями, 9 тем кодовых слов, 12 форматов, инструкция сценаристу. Не хватает материалов под слова, живых вставок и кейсов.' },
  { id:'critical-path', kind:'doc', status:'ready', plan:['d5'], title:'Критический путь к старту 10.11', url:DESK('8eb0ba4c', 2), note:'Минимальный старт: одна платёжка, один VSL, одно слово. Тестовая неделя 07–09.11. Стоп: без оплаты с чеком 54-ФЗ и оферты денег не берём.' },
  { id:'pay-yookassa', kind:'bot', status:'draft', plan:['e4', 'b4'], title:'Оплата ЮKassa → бот → доступ → чек', url:DESK('9cf1072c', 3), note:'В ChatPlace собраны теги, переменные, вебхук ЮKassa и цепочка «после оплаты → доступ». Ждут 4 замены (ключ ЮKassa, токен бота, ID канала уроков) и тестовая покупка на 10 ₽.' },
  { id:'word-voronka', kind:'bot', status:'draft', plan:['b2', 'e1', 'd3'], title:'Кодовое слово «ВОРОНКА»: цепочка и дожимы', url:DESK('52781e74', 2), note:'Цепочка в ChatPlace на паузе: 22 блока, 9 тегов, дожимы, события в кабинет. Ждала адреса лендинга — теперь это neuro.aicex.club.' },
  { id:'bot-chain', kind:'bot', status:'draft', plan:['b3', 'e3'], title:'Цепочка бота: старт → согласие → VSL → лендинг', url:DESK('5249c22f'), note:'VSL из 3 частей с A/B-хуком, теги по шагам, перевод кодовых слов и /start с практикума — пакет действий на утверждение.' },
  { id:'tracking', kind:'bot', status:'ready', plan:['e6', 'b6'], title:'Метки nf-… и теги этапов, оплата в кабинет', url:DESK('6b9b98be', 4), note:'Вебхук оплаты привязан к цепочке выдачи доступа, события идут в кабинет. Наборы тегов двух агентов надо свести к одному.' },

  // ── Стратегия и документы ──
  { id:'plan', kind:'doc', status:'ready', plan:[], title:'Нейроворонка — план реализации', url:ART('Qc9ehZN7mvMrUGin99JbYT'), note:'Блоки системы, дорожная карта, обязательства, риски — основа офиса.' },
  { id:'neurofunnel-en', kind:'doc', status:'ready', plan:[], title:'NeuroFunnel (EN)', url:ART('UmhCiWJHjmKATyFKQKCUh3'), note:'Англоязычная версия воронки.' },
  { id:'landing-styles', kind:'doc', status:'ready', plan:['b4'], title:'Лендинги эксперта: 5 стилей (скиллы)', url:ART('F5cjiWb2ss8AvaC3uF3CHi'), note:'Стили лендингов упакованы в скиллы — агент «Лендинг» собирает страницу в любом из них.' },
];

// the plan items that already have work behind them: their status starts at «в работе» until the owner marks them
export const PLAN_STARTED = [...new Set(MATERIALS.flatMap(m => m.plan))];
