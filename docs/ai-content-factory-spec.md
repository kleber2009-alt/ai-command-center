# ТЗ: AI Content Factory для Instagram

**Версия:** 1.0
**Дата:** май 2026
**Автор:** Ilia · @ai_mastery
**Исполнитель:** Claude Code

---

## 1. Контекст и цели

### 1.1. Что строим

Полностью автономную фабрику сериального контента для Instagram-аккаунта об автоматизации бизнеса через Claude и нейросети. Система генерирует **2 единицы контента в день** (рилс + карусель) по 4 рубрикам, рендерит визуалы, монтирует видео и доставляет готовые файлы в Telegram для ручной загрузки.

### 1.2. Бизнес-цель

Повышение охватов в Instagram за счёт регулярности, серийности и качества контента. Метрика успеха — рост охватов и сохранений месяц к месяцу на 30%+.

### 1.3. Ключевые принципы

- **Автономность.** После настройки система работает по cron без участия владельца.
- **Сериальность.** 4 параллельные рубрики с собственным визуальным кодом, формулами эпизодов и нумерацией.
- **Human-in-the-loop на финале.** Публикация остаётся ручной (через Telegram-уведомление с готовыми файлами) — это контрольная точка качества и страховка от ошибок AI.
- **Git как источник истины.** Все данные (идеи, планы, аналитика, шаблоны) — JSON-файлы в репозитории. Никаких внешних баз данных на старте.

---

## 2. Архитектура системы

### 2.1. Стек технологий

| Слой | Технология | Обоснование |
|------|-----------|-------------|
| Язык | Node.js 20+ LTS | Совместим с существующим Next.js-проектом владельца |
| AI | `@anthropic-ai/sdk` | Claude API, модель `claude-opus-4-7` для генерации, `claude-haiku-4-5` для рутины |
| Рендер визуала | Puppeteer | Уже отработано в `carousel-export` |
| Монтаж видео | `fluent-ffmpeg` + FFmpeg | Стандарт индустрии |
| Уведомления | `node-telegram-bot-api` | Telegram Bot API |
| Планировщик | `node-cron` | Не требует внешней инфраструктуры |
| Хранение | JSON-файлы в Git | Прозрачность, версионирование, простота миграции |
| Хостинг | VPS (Hetzner CX22 или аналог) | Стабильный аптайм для cron |

### 2.2. Архитектурная схема

```
                          ┌─────────────────┐
                          │   node-cron     │
                          │  (планировщик)  │
                          └────────┬────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
       ┌────────────────┐                   ┌────────────────┐
       │   Pipeline:    │                   │   Pipeline:    │
       │   Carousel     │                   │   Reels        │
       └────────┬───────┘                   └────────┬───────┘
                │                                    │
                ▼                                    ▼
   ┌────────────────────┐              ┌────────────────────┐
   │ 1. Идея из         │              │ 1. Идея из         │
   │    content-plan    │              │    content-plan    │
   │ 2. Claude API →    │              │ 2. Claude API →    │
   │    JSON слайдов    │              │    сценарий + cuts │
   │ 3. Puppeteer →     │              │ 3. FFmpeg →        │
   │    10 PNG          │              │    смонтированный  │
   │ 4. Подпись поста   │              │    MP4 + субтитры  │
   │ 5. Сохранение в    │              │ 4. Подпись + хэштеги│
   │    /output         │              │ 5. Сохранение в    │
   └─────────┬──────────┘              │    /output         │
             │                         └─────────┬──────────┘
             └────────────┬────────────────────┬─┘
                          ▼                    ▼
                  ┌─────────────────────────────┐
                  │   Telegram Bot              │
                  │   ↑ присылает архив + текст │
                  │   ↓ принимает аналитику     │
                  └──────────┬──────────────────┘
                             │
                  ┌──────────▼──────────┐
                  │   /data/analytics/  │
                  │   JSON с цифрами    │
                  └──────────┬──────────┘
                             │
                  Раз в неделю
                             ▼
                  ┌─────────────────────┐
                  │  Weekly Insights:   │
                  │  Claude разбирает   │
                  │  паттерны → план    │
                  │  на след. неделю    │
                  └─────────────────────┘
```

### 2.3. Структура репозитория

```
ai-content-factory/
├── src/
│   ├── pipelines/
│   │   ├── carousel.js          ← пайплайн карусели
│   │   ├── reels.js             ← пайплайн рилс
│   │   └── weekly-insights.js   ← еженедельный разбор
│   ├── generators/
│   │   ├── claude.js            ← обёртка над Claude API
│   │   ├── carousel-content.js  ← генерация JSON слайдов
│   │   ├── reels-script.js      ← генерация сценария
│   │   └── post-caption.js      ← подпись поста + хэштеги
│   ├── renderers/
│   │   ├── carousel-png.js      ← Puppeteer-рендер (готов)
│   │   └── reels-video.js       ← FFmpeg-монтаж
│   ├── delivery/
│   │   ├── telegram-bot.js      ← отправка/приём
│   │   └── analytics-collector.js ← парсинг сообщений с цифрами
│   ├── scheduler.js             ← node-cron
│   └── index.js                 ← точка входа
├── data/
│   ├── content-plan.json        ← план на 2 недели вперёд
│   ├── ideas-bank.json          ← банк идей по рубрикам
│   ├── rubrics.json             ← конфиг 4 рубрик
│   ├── prompts/                 ← промпт-шаблоны
│   │   ├── carousel-diary.md
│   │   ├── carousel-routine.md
│   │   ├── carousel-hood.md
│   │   ├── carousel-money.md
│   │   ├── reels-script.md
│   │   └── post-caption.md
│   ├── assets/
│   │   ├── footage/             ← твои нарезанные клипы для рилс
│   │   ├── b-roll/              ← фоновые кадры
│   │   └── audio/               ← музыка, звуки
│   ├── output/
│   │   ├── 2026-05-24/          ← по датам
│   │   │   ├── carousel/        ← 10 PNG + caption.txt + meta.json
│   │   │   └── reels/           ← MP4 + caption.txt + meta.json
│   └── analytics/
│       ├── posts.json           ← цифры по каждому посту
│       └── weekly-reports/      ← отчёты Claude
├── config/
│   ├── .env.example
│   └── schedule.json            ← времена публикации
├── tests/
│   └── smoke.test.js
├── README.md
├── DEPLOYMENT.md                ← инструкция по развёртыванию на VPS
└── package.json
```

---

## 3. Модули и контракты

### 3.1. Module: Carousel Pipeline

**Файл:** `src/pipelines/carousel.js`
**Триггер:** cron `0 8 * * *` (каждый день в 08:00 UTC)

**Шаги:**

1. Читает `data/content-plan.json`, находит запись на сегодня с типом `carousel`.
2. Вызывает `generators/carousel-content.js` с параметрами `{ rubric, topic, episode }`.
3. Получает валидированный JSON слайдов (по схеме из `carousel-export`).
4. Передаёт JSON в `renderers/carousel-png.js` → получает 10 PNG.
5. Вызывает `generators/post-caption.js` → получает подпись + хэштеги.
6. Сохраняет всё в `data/output/YYYY-MM-DD/carousel/`:
   - `slide_01.png` … `slide_10.png`
   - `caption.txt`
   - `meta.json` (рубрика, тема, эпизод, время генерации)
7. Передаёт пакет в `delivery/telegram-bot.js` → отправляет в Telegram владельца.
8. Помечает запись в `content-plan.json` как `status: "delivered"`.
9. Логирует в `data/logs/YYYY-MM-DD-carousel.log`.

**Контракт ввода:** ничего (cron-триггер).
**Контракт вывода:** папка с файлами + сообщение в Telegram.

**Обработка ошибок:**
- Claude API упал → 3 ретрая с экспоненциальной задержкой → если не получилось, отправить алерт в Telegram.
- Puppeteer упал → фолбэк на повторный рендер с задержкой 30 сек.
- Telegram упал → сохранить локально, отметить `status: "pending_delivery"`, попытаться отправить при следующем запуске.

### 3.2. Module: Reels Pipeline

**Файл:** `src/pipelines/reels.js`
**Триггер:** cron `0 14 * * *` (каждый день в 14:00 UTC)

**Шаги:**

1. Читает `content-plan.json`, находит запись на сегодня с типом `reels`.
2. Вызывает `generators/reels-script.js` с параметрами рубрики и темы.
3. Получает структуру:
   ```json
   {
     "hook": "Текст хука (3 сек)",
     "scenes": [
       { "text": "Реплика", "duration": 4, "footageTag": "talking-head" },
       { "text": "Реплика", "duration": 5, "footageTag": "screen-cast" }
     ],
     "cta": "Подпишись, чтобы не пропустить",
     "subtitles": [...]
   }
   ```
4. Передаёт в `renderers/reels-video.js`:
   - Подбирает клипы из `data/assets/footage/` по тегам `footageTag`.
   - Склеивает в нужной последовательности через FFmpeg.
   - Накладывает субтитры (большие, по центру, JetBrains Mono).
   - Накладывает музыкальный трек из `data/assets/audio/` (по тональности рубрики).
   - Экспортирует в MP4 1080×1920, 30 fps, H.264.
5. Подпись + хэштеги через `post-caption.js`.
6. Сохранение в `data/output/YYYY-MM-DD/reels/`.
7. Доставка в Telegram.

**Критическое ограничение:**
Модуль монтажа работает только при наличии **подготовленной библиотеки фрагментов** в `data/assets/footage/`. Без неё пайплайн отдаёт **только сценарий + подпись текстом** (фолбэк-режим, владелец монтирует руками).

### 3.3. Module: Claude Generator

**Файл:** `src/generators/claude.js`

Универсальная обёртка над Anthropic SDK с:
- автоматическим выбором модели (`opus-4-7` для творческих задач, `haiku-4-5` для рутинных);
- встроенной валидацией JSON-выходов через JSON Schema;
- ретраями с exponential backoff (max 3 попытки);
- логированием каждого вызова в `data/logs/claude-calls.jsonl` (промпт, токены, стоимость, время);
- кэшированием системного промпта через prompt caching API.

**Контракт:**
```javascript
const result = await callClaude({
  promptFile: 'data/prompts/carousel-diary.md',
  variables: { topic: '...', episode: 7 },
  outputSchema: carouselSchema,
  model: 'opus' // | 'haiku'
});
```

### 3.4. Module: Carousel Content Generator

**Файл:** `src/generators/carousel-content.js`

Использует `claude.js` + промпт-шаблон рубрики. Выход — строго валидированный JSON по схеме из `carousel-export` (типы слайдов: cover/quote/list/stat/code/cta).

**Промпт-шаблон содержит:**
- Описание рубрики и её визуального кода.
- Tone of voice владельца (примеры).
- Структуру обязательных 10 слайдов (последовательность типов).
- Описание ЦА из исследования Нейрозапуска.
- 3-5 примеров успешных каруселей в этой рубрике (few-shot).

### 3.5. Module: Reels Script Generator

**Файл:** `src/generators/reels-script.js`

Генерирует сценарий рилс длительностью 25-45 секунд с разбивкой на сцены по 3-7 секунд каждая. Каждая сцена связана с тегом фрагмента (`talking-head`, `screen-cast`, `b-roll-typing`, `b-roll-coffee`, и т.д.).

Каталог доступных тегов берётся из `data/assets/footage-tags.json`.

### 3.6. Module: Video Renderer

**Файл:** `src/renderers/reels-video.js`

**Входной формат:**
```json
{
  "scenes": [
    { "text": "...", "duration": 4, "footageTag": "talking-head" }
  ],
  "subtitleStyle": "diary",
  "musicMood": "tech"
}
```

**Pipeline на FFmpeg:**
1. Из `data/assets/footage/{tag}/` случайно выбирает клип нужной длительности.
2. Если клипа нужной длительности нет — обрезает более длинный.
3. Конкатенирует клипы через `concat demuxer`.
4. Через `drawtext` накладывает субтитры (Georgia bold, белый текст с тенью).
5. Микширует с фоновым аудио на -20 dB.
6. Экспорт в 1080×1920 H.264.

**Качество:** CRF 18-22 (high quality, разумный размер).

### 3.7. Module: Post Caption Generator

**Файл:** `src/generators/post-caption.js`

Принимает тему и формат поста (carousel/reels). Через Claude генерирует:
- хук-первую-строку (≤ 125 символов, чтобы влезла в ленту до «...ещё»);
- основной текст (200-500 символов);
- CTA;
- 10-15 релевантных хэштегов (микс популярных и нишевых);
- упоминание @claudeai где уместно.

### 3.8. Module: Telegram Bot

**Файл:** `src/delivery/telegram-bot.js`

**Отправка контента:**
- Карусель → 10 фото как медиа-группа + подпись.
- Рилс → MP4 + подпись.
- Кнопки: `✅ Опубликовано` / `⏸ Отложить` / `🔄 Перегенерить`.

**Приём аналитики:**
- Команда `/stats {post_id} охват:1500 сохр:80 переходы:12` → парсится → пишется в `data/analytics/posts.json`.
- Команда `/last` → показывает последние 5 неотчитанных постов.
- Команда `/insights` → запускает `weekly-insights.js` вручную.

### 3.9. Module: Weekly Insights

**Файл:** `src/pipelines/weekly-insights.js`
**Триггер:** cron `0 10 * * 0` (каждое воскресенье в 10:00 UTC)

**Шаги:**
1. Собирает аналитику последних 14 дней из `data/analytics/posts.json`.
2. Считает агрегаты: топ-3 хука, топ-3 рубрики, средние охваты/сохранения.
3. Передаёт сводку в Claude с задачей: «На основе данных предложи план следующих 14 дней».
4. Claude возвращает обновлённый `content-plan.json` с обоснованием каждой темы.
5. Отчёт + diff плана отправляется владельцу в Telegram для апрува.
6. После апрува (кнопка ✅) план применяется.

---

## 4. Структуры данных

### 4.1. `data/rubrics.json`

```json
{
  "diary": {
    "label": "ДНЕВНИК АРХИТЕКТОРА",
    "accent": "#60c8f0",
    "handle": "@ILIA · CLAUDE PATH",
    "formula": "Личный путь к Claude Certified. Каждый эпизод — день из подготовки.",
    "examples_file": "data/prompts/examples/diary.md"
  },
  "routine": { ... },
  "hood": { ... },
  "money": { ... }
}
```

### 4.2. `data/content-plan.json`

```json
{
  "version": "2026-05-24-w1",
  "items": [
    {
      "id": "2026-05-24-carousel",
      "date": "2026-05-24",
      "time": "10:00",
      "type": "carousel",
      "rubric": "diary",
      "topic": "5 доменов экзамена CCA Foundations",
      "episode": 7,
      "status": "planned",
      "rationale": "По аналитике карусели рубрики diary дают +35% охватов vs средний"
    }
  ]
}
```

`status`: `planned` → `generating` → `delivered` → `published` → `analyzed`.

### 4.3. `data/analytics/posts.json`

```json
{
  "posts": [
    {
      "id": "2026-05-24-carousel",
      "rubric": "diary",
      "topic": "5 доменов экзамена",
      "publishedAt": "2026-05-24T10:15:00Z",
      "metrics": {
        "reach": 1500,
        "saves": 80,
        "likes": 120,
        "comments": 18,
        "profileVisits": 25
      },
      "hookFirstLine": "Я заплатил $150 за Claude Certified..."
    }
  ]
}
```

---

## 5. Развёртывание и эксплуатация

### 5.1. VPS

- **Провайдер:** Hetzner CX22 (€4-5/мес) или DigitalOcean Basic Droplet.
- **OS:** Ubuntu 24.04 LTS.
- **Зависимости:** Node.js 20 LTS, FFmpeg, шрифты JetBrains Mono + Georgia, Chromium для Puppeteer.

### 5.2. Запуск

- **PM2** как process manager: `pm2 start ecosystem.config.js`.
- **Логи:** `pm2 logs` + `data/logs/`.
- **Авторестарт** при падении и при reboot VPS.

### 5.3. Секреты (`.env`)

```
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TZ=Europe/Moscow
```

### 5.4. Бэкапы

- Git remote (GitHub приватный репо).
- Cron-задача: ежедневно в 03:00 коммитить `data/output/`, `data/analytics/`, `data/content-plan.json`.

### 5.5. Мониторинг

- При каждом успешном пайплайне — heartbeat в Telegram (короткое сообщение «✓ carousel rendered, 234 KB total»).
- При ошибке — алерт с stack trace.
- Раз в день в 23:00 — сводка «За сегодня: 2/2 контента доставлено».

---

## 6. Этапы реализации

### Phase 1. Foundation (Sprint 1, ~3 дня)

- [ ] Инициализация репозитория, package.json, ESLint, Prettier
- [ ] Структура папок согласно п. 2.3
- [ ] `src/generators/claude.js` — обёртка над SDK с ретраями и логированием
- [ ] `data/rubrics.json`, `data/prompts/` (заполнить 4 промпт-шаблона на основе уже имеющихся хуков и формул)
- [ ] Smoke-тесты для генерации JSON

### Phase 2. Carousel Pipeline (Sprint 2, ~2 дня)

- [ ] Импортировать `carousel-export` как модуль `renderers/carousel-png.js`
- [ ] `src/generators/carousel-content.js` + JSON Schema валидация
- [ ] `src/pipelines/carousel.js` (полный цикл идея → PNG)
- [ ] Локальный тест: 4 карусели по одной на рубрику

### Phase 3. Telegram Delivery (Sprint 3, ~1 день)

- [ ] Бот, токен, чат-ID
- [ ] Отправка медиа-группы + подписи
- [ ] Команды `/stats`, `/last`, `/insights`
- [ ] Парсер аналитики и запись в JSON

### Phase 4. Reels Pipeline (Sprint 4, ~3-5 дней)

- [ ] Подготовить библиотеку footage (это работа владельца — нарезать 30-50 клипов по тегам)
- [ ] `src/generators/reels-script.js` + Schema
- [ ] `src/renderers/reels-video.js` (FFmpeg сборка)
- [ ] `src/pipelines/reels.js`
- [ ] Локальный тест: 4 рилс по одному на рубрику

### Phase 5. Scheduler + Insights (Sprint 5, ~1-2 дня)

- [ ] `src/scheduler.js` с cron-расписанием
- [ ] `src/pipelines/weekly-insights.js`
- [ ] Heartbeat и алерты

### Phase 6. Deployment (Sprint 6, ~1 день)

- [ ] Развёртывание на VPS (Hetzner)
- [ ] PM2, ecosystem.config.js
- [ ] Git backup cron
- [ ] DEPLOYMENT.md
- [ ] Финальный smoke-тест в продакшене

### Phase 7. (Опционально) Graph API

- [ ] Регистрация Facebook App
- [ ] OAuth + получение долгоживущего токена для IG Business
- [ ] `src/delivery/instagram-graph.js`
- [ ] Переключатель: ручная Telegram-доставка ↔ автопубликация

---

## 7. Бюджеты и ограничения

### 7.1. Стоимость инфраструктуры

- VPS: €4-5/мес
- Claude API: ~$15-30/мес при 60 единицах контента в месяц (зависит от длины промптов и кеширования)
- **Итого: ~$25-40/мес.**

### 7.2. Ограничения системы

- **Reels полностью работают только при готовой библиотеке footage.** Без этого — генерация только сценариев.
- **Аналитика — ручная** (через Telegram) до подключения Graph API на Phase 7.
- **Одна модель ленты публикации.** Если нужно вести 2+ аккаунтов параллельно, потребуется рефакторинг конфигов.

### 7.3. Что НЕ входит в проект

- Авторесепшен комментариев и DM.
- Аналитика конкурентов.
- Генерация Stories (только посты и рилс).
- Кросс-постинг в Telegram-канал/ВК (это Phase 8+).

---

## 8. Критерии готовности (Definition of Done)

Проект считается завершённым, когда:

1. Cron в 08:00 и 14:00 UTC ежедневно успешно отрабатывает все пайплайны.
2. В Telegram приходят 2 готовые единицы контента в день в течение 7 дней подряд без вмешательства.
3. Команда `/stats` корректно сохраняет аналитику.
4. Воскресный weekly-insights генерирует новый план на 14 дней.
5. Все секреты в `.env`, репо публикабельно без чувствительных данных.
6. README.md покрывает: установку локально, развёртывание на VPS, добавление новой рубрики, отладку.
7. Аптайм системы на VPS ≥ 99% за месяц.

---

## 9. Открытые вопросы для будущих итераций

- Подключать ли Claude Skills для специализированных задач (например, отдельный skill «генератор UGC-сценариев»)?
- Стоит ли мигрировать с JSON-файлов на SQLite при превышении 200 постов в архиве?
- Нужен ли отдельный pipeline для коллабораций (когда контент готовится совместно с другим экспертом)?

---

## Приложение A. Claude Code: команды для старта

После клонирования репо в Claude Code:

```bash
# В корне проекта
claude

# Внутри Claude Code:
> Прочитай ТЗ в README.md и спроси у меня уточнения по Phase 1.
> Когда будем готовы — начни с инициализации package.json и установки зависимостей.
```

Дальше Claude Code пойдёт по фазам, и для каждой ты сможешь дать конкретный фокус: «сейчас собираем только Phase 1, без Phase 2». Это даст контроль над прогрессом и позволит тестировать каждый блок отдельно.
