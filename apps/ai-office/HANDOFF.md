# AI Growth Office — Полный handoff проекта

> Документ для возобновления работы на новом устройстве.
> Дата создания: **16 мая 2026**
> Стадия: **MVP-фронтенд + админка готовы, бэкенд в работе**

---

## 🎯 Что это за проект

**AI Growth Office** — продукт «виртуальная команда AI-агентов под бизнес».
Клиент заполняет бриф → AI подбирает команду из 169 агентов → клиент работает в кабинете 24/7.

ЦА: эксперты, онлайн-школы, инфо-предприниматели, SMM-агентства, tech-стартапы с выручкой **200K–5M ₽/мес**.

Тарифы:
- **Free** — 0₽ (3 запуска/мес, 1 отдел)
- **Pro** — 1 990 ₽/мес (или 19 900 ₽/год) — все 4 отдела, безлимит
- **Team** — 4 990 ₽/мес (5 мест)
- **Enterprise** — от 25 000 ₽/мес (безлимит мест + custom)

---

## 📍 Где находимся сейчас (16.05.2026)

### ✅ Готово (production-ready, фронтенд)

**Customer journey · 5 шагов:**
1. `index.html` — главная с демо живого офиса (4-агентный диалог анимирован)
2. `onboarding.html` — бриф 10 шагов с autosave
3. `recommend.html` — AI-подбор команды (must / recommended / optional)
4. `dashboard.html` — личный AI-офис с агентами по департаментам
5. `marketing-workspace.html`, `tech-workspace.html`, `sales-workspace.html` — 3 рабочих пространства с реальным `/api/chat` (Claude Sonnet 4.5 streaming)

**Sales-инструменты:**
- `pricing.html` — 4 тарифа с тогглом мес/год
- `roi.html` — калькулятор экономии (2 режима: команда / я сам)
- `compare.html` — сравнение AI Office vs найм vs фриланс vs курсы по 12 критериям
- `cases.html` — 5 модельных сценариев применения
- `faq.html` — частые вопросы

**Образование/доверие:**
- `how-it-works.html` — explainer 5 шагов с zigzag-layout + scroll-анимациями + авто-тур 30 сек
- `demo.html` — видео-демо (6 placeholder-слотов под Loom)
- `demo-dialogue.html` — отдельная страница диалога 4 агентов
- `glossary.html` — 25 AI-терминов в 4 категориях с поиском и алфавитом
- `about.html` — founder + философия + roadmap + tech stack + контакты

**Лиды и партнёрство:**
- `lead-magnet.html` + `lead-magnet.pdf` (14 страниц, 10 промптов)
- `lead-magnet-gate.html` — форма email-захвата
- `partners.html` — партнёрская программа 30% + ROI-калькулятор + форма
- `partner-dashboard.html` — мокап кабинета партнёра
- `dashboard-demo.html` — мокап результатов клиента через 60 дней
- `emails.html` — 7 email-шаблонов воронки прогрева (Welcome → Pro)

**3D / Pixel демо-офисы:**
- `ai-marketing-office-3d.html` — 14 агентов, Three.js
- `ai-tech-office-3d.html` — 12 разработчиков, Three.js
- `ai-tech-office-pixel.html` — 2D Stardew-style
- `ai-growth-office-pixel.html` — 2D Stardew-style
- `ai-growth-office-v6-upgraded.html` — изометрический v6

**Юридическое:**
- `privacy.html` — политика обработки (152-ФЗ + GDPR)
- `terms.html` — условия использования (16 разделов)

**Инфраструктура / техничка:**
- `state.js` — центральный менеджер localStorage (cross-tab sync, referral capture, export/import)
- `analytics.js` — событийный трекер (page_view, cta_click, form_submit, готов под GA4/Yandex)
- `alisa-widget.js` — плавающий чат-консьерж на 22+ страницах
- `api-fallback.js` — диагностика `/api/chat` (БЕЗ встроенного ключа — безопасно)
- `sidebar.js` — единое меню на всех страницах (с поиском)
- `sw.js` (v1.3.0) + `sw-register.js` — PWA с auto-update toast
- `manifest.json` + иконки 192/512 — установка как нативное приложение
- `cookies.js` — баннер согласия (152-ФЗ)
- `netlify.toml` + `_redirects` — clean URLs (/about, /pricing, /cases...), 404 catch-all, security headers (CSP, HSTS, X-Frame, Permissions-Policy), правильное кэширование
- `404.html` — красивая страница с глитч-анимацией
- `whats-new.html` — showcase всех новых функций
- `leads-inbox.html` — админ-инбокс всех лидов/чатов/заявок
- `dev-tools.html` — служебная диагностика (API-тест, env info, mock-data, danger-zone)
- `agents.html` + `agents.json` — каталог 169 агентов с чатом
- `hub.html` — служебный каталог
- `pipeline.html` — старая cycle-демонстрация

**Backend (Netlify Function):**
- `netlify/functions/chat.js` — серверный прокси к Anthropic API:
  - скрывает `ANTHROPIC_API_KEY` (берёт из env vars)
  - стримит SSE-ответ обратно
  - rate-limit 10 req/min на IP

### ✅ Backend ЧАСТИЧНО подключён (16.05.2026 update)

- **Supabase** — `cslvbnladhfjrdbtnwkm.supabase.co`, anon-key встроен в `config.js` (RLS-protected, безопасно)
- **Все формы** теперь пишут в Supabase `/leads` table + в `localStorage` (через `config.js`)
- **Реферальная атрибуция** — прикрепляется к каждой записи в Supabase автоматически
- **Telegram-уведомления** — через **серверную Netlify Function `/api/notify-tg`**, токен в env vars (не светится в браузере)

**Требуется на Netlify:**
1. Подключить GitHub-репо (НЕ через Drop) — для деплоя Functions
2. Установить **env vars** в Site Settings → Environment Variables:
   - `ANTHROPIC_API_KEY` — для `/api/chat`
   - `TG_BOT_TOKEN` — для `/api/notify-tg` (твой бот `8204536077:AAH...`)
   - `TG_CHAT_ID` — твой chat ID (`1280515130`)

### ⚠️ Работает «на честном слове»

- **История чатов с агентами** — только локально (TODO: write to Supabase)
- **Аналитика событий** — только локально (готова под GA4/Yandex.Metrika, но ID не задан)

### 📱 Telegram Mini App (новое 16.05.2026)

Отдельный single-file SPA в `/mini-app/` — сжатый customer flow для Telegram-аудитории.

**5 экранов:** Welcome → Brief (5 шагов) → Loading → Team → Office → Chat
**Технологии:** Hash-router · Telegram WebApp SDK · localStorage state · streaming Anthropic API
**Preview для разработки:** `/mini-app-preview.html` (phone mockup)

**Настройка через @BotFather:**
1. `@BotFather` → `/newbot` → создать бота
2. `/newapp` → выбрать бота → URL: `https://ai-office.46-62-215-11.nip.io/mini-app/`
3. `/setmenubutton` → выбрать бота → «🏢 Открыть AI Office»
4. `/setcommands`:
   ```
   start - Открыть AI Office
   brief - Пройти бриф заново
   team - Моя команда
   help - Помощь
   ```

После настройки клиент: открывает бота → нажимает кнопку меню → Mini App запускается прямо в Telegram.

### ❌ Чего НЕТ (нужно сделать)

| Блокер | Что нужно от тебя |
|---|---|
| Домен `ai-office.46-62-215-11.nip.io` | Купить + привязать к Netlify |
| Netlify env vars | Установить `ANTHROPIC_API_KEY`, `TG_BOT_TOKEN`, `TG_CHAT_ID` (см. выше) |
| Supabase RLS policies | Настроить INSERT policy для `anon` на таблицу `leads` |
| YooKassa платежи (РФ) | Открыть мерчант, прислать `shopId` + `secret` |
| Stripe платежи (мир) | Опционально, для зарубежной аудитории |
| GA4 / Yandex.Metrika | Создать счётчики, прислать ID |
| Email-сервис (Resend / Brevo / Sendpulse) | Прислать API-ключ |
| Loom-записи 60s демо | Записать 7 видео и проставить `data-embed` в `demo.html` |

---

## 🚨 TOP 5 следующих приоритетов

### Текущая фаза (backend готов в коде, нужен прод-деплой):

1. ⚠️ **Отозвать TG-токен** через @BotFather → `/revoke` (был засветлён в client-side коде ранее)
2. **Подключить Netlify к GitHub** — Drop не деплоит Functions, без этого `/api/chat` и `/api/notify-tg` не работают
3. **Установить env vars в Netlify Site Settings:**
   - `ANTHROPIC_API_KEY` (для чата с агентами)
   - `TG_BOT_TOKEN` (новый, после revoke)
   - `TG_CHAT_ID` (твой ID)
4. **Supabase RLS** — добавить INSERT policy для роли `anon` на таблицу `leads`
5. **Купить домен** `ai-office.46-62-215-11.nip.io` + привязать к Netlify

### После этого — новый главный фокус:

🔥 **Phase 5: Voice / Video AI-agents для IG + TG**

Подробности — см. секцию «Фаза 5» в Roadmap ниже.

Когда хочешь начать — скажи AI **«начинаем Phase 5 · voice/video agents»**, и она прочитает HANDOFF и предложит первый шаг.

---

## 🗺 Roadmap до 100% запуска

### **Фаза 1: Backend и платежи** (приоритет 🔥, 2-3 недели)
- [ ] Купить домен `ai-office.46-62-215-11.nip.io`, привязать к Netlify, выдать SSL
- [ ] Поднять Supabase, создать таблицы: `leads`, `briefs`, `runs`, `partner_apps`, `users`, `subscriptions`
- [ ] Магическая ссылка (passwordless email-auth) через Supabase Auth
- [ ] Обновить все формы: писать в Supabase, не только localStorage
- [ ] Подключить YooKassa: оплата → webhook → запись подписки в БД
- [ ] Сделать middleware гейта: dashboard.html и workspace доступны только при активной подписке (Free / Pro / Team / Enterprise)
- [ ] Email-цепочка после регистрации (Resend + emails.html шаблоны)
- [ ] Telegram-уведомления админу о новых лидах/оплатах/тревогах

### **Фаза 2: Production-полировка** (приоритет ⚡, 2 недели)
- [ ] GA4 + Yandex.Metrika (счётчики + цели)
- [ ] Sentry или альтернатива для error tracking
- [ ] Сжать `og-image.png` (1.3MB → 200KB) — на главной грузится медленно
- [ ] Lighthouse-аудит, исправить top-5 проблем
- [ ] Записать 7 Loom-видео и проставить `data-embed` в `demo.html`
- [ ] Перенести проект из «Netlify Drop» на «Git-репо → Netlify» (auto-deploy при push)
- [ ] CSP-headers ужесточить (сейчас liberal)
- [ ] Mobile-полировка на узких экранах (особенно сложные мокапы)

### **Фаза 3: Расширение продукта** (приоритет 🌿, 2 месяца)
- [ ] **Custom-агенты** — пользователь создаёт своих агентов через UI
- [ ] **MCP-интеграции** — подключение Notion, Google, Telegram, CRM через Model Context Protocol
- [ ] **Team-режим** — несколько пользователей в одном офисе, общие пайплайны, роли
- [ ] **API для разработчиков** — публичный API под Enterprise
- [ ] **Шаблоны брифов** — preset под ниши (психолог, школа, агентство, tech)
- [ ] **Long-term memory** — RAG с vector DB на свой контент клиента
- [ ] **AI-аналитика** — автоматические инсайты от агентов («попробуй сменить хук»)
- [ ] **Автопилот** — триггеры запуска агентов по расписанию

### **Фаза 5: Voice / Video AI-agents · IG + TG** 🔥 (новый приоритет, после Фазы 1)

> **Прогресс (16.05.2026 · Commit 1):** voice-pipeline MVP-0 готов.
> · `persona-train.html` — UI клонирования голоса + тест-генерация
> · `netlify/functions/voice-clone.js`, `voice-generate.js`, `voice-list.js`
> · `supabase/migrations/003_voice.sql` — таблицы `voices`, `voice_generations`, bucket `voice-notes`
> · Полная документация — `docs/PHASE_5.md`
> · **Что осталось:** настроить env vars (`ELEVENLABS_API_KEY`, `SUPABASE_SERVICE_KEY`), запустить SQL, проверить flow на `/persona-train`.
> · **Дальше (Commit 2):** Telegram approval-бот.

**Идея:** AI-агенты ведут переписку, шлют voice-notes и видео-кружки от лица пользователя в Instagram и Telegram.

**Customer flow:**
```
Подписчик пишет в IG DM / TG ↓
AI читает контекст ↓
Генерирует ответ в стиле юзера ↓
Озвучивает голосом юзера (TTS-clone) ↓
Снимает кружок (deepfake-talking head) ↓
Юзер аппрувит в Telegram-боте ↓
AI постит автоматически
```

**Технические блоки:**
- [ ] **`/persona-train.html`** — UI для загрузки voice/video/text samples (3-5 мин записи голоса, 30+ постов, видео-калибровка лица)
- [ ] **Voice cloning** — выбрать провайдер:
  - ElevenLabs Voice Cloning (premium, лучшее качество, $5+/мес)
  - OpenAI TTS (дешевле, средне)
  - Yandex SpeechKit (русский, дёшево)
- [ ] **Video generation** — выбрать провайдер:
  - HeyGen Avatar API (talking head, $30+/мес)
  - D-ID API (lip-sync, $5+/мес)
  - Synthesia (студийное качество, $90+/мес)
- [ ] **Style match** — fine-tune Claude/GPT на 30+ постах юзера
- [ ] **TG bot** — отправляет voice notes (`sendVoice`) и кружки (`sendVideoNote`)
- [ ] **IG integration:**
  - Instagram Graph API (нужен Business аккаунт)
  - Или Buffer/Later для расписания
  - Или unofficial библиотека (instagrapi)
- [ ] **Approval flow** — Telegram inline-кнопки «✅ Запостить · ✏️ Изменить · 🗑 Удалить»
- [ ] **Безопасность** — водяные знаки на видео, лог всех публикаций, лимит частоты

**Этические вопросы (требует решения юзера):**
- Дисклеймер «AI-assisted» в подписи постов?
- Логи для аудита (кто/когда что одобрил)
- Согласие подписчиков (если AI отвечает в личке)

**Подготовка к этой фазе уже есть в проекте:**
- ✅ 169 агентов с разными ролями (Sofia может быть «контент-голос», Алиса — «sales-голос»)
- ✅ Бриф собирает контекст бизнеса (включая тон)
- ✅ Анализ возражений в Sales Workspace
- ✅ Email-шаблоны как референс стиля
- ✅ Контент-фабрика в Marketing Workspace

**Что новое нужно построить:**
- Страница загрузки samples (`persona-train.html`)
- Подключение voice/video API
- Workflow approval в Telegram
- Очередь публикаций

### **Фаза 4: Маркетинг и рост** (параллельно)
- [ ] **SEO-блог** с 10-20 статьями (черновики уже есть в emails.html и в формате faq)
- [ ] **A/B тест 3 hero-заголовков** на главной
- [ ] **Реферальная программа** — техническая часть на partners.html уже есть, нужно подключить трекинг через Supabase
- [ ] **Запуск партнёрской программы** — лендинг готов, нужно наладить выплаты
- [ ] **Webinars** — раз в неделю, обзор продукта
- [ ] **Кейсы клиентов** — первые 3 реальные истории (сейчас все «модельные»)

---

## 📂 Структура файлов

```
ai-office-project/
├── README.md                        ← обзор проекта
├── HANDOFF.md                       ← этот файл (handoff)
├── netlify.toml                     ← конфигурация Netlify (clean URLs, headers, cache)
├── _redirects                       ← backup-конфиг для Drop
├── robots.txt
├── sitemap.xml                      ← все публичные URL (для SEO)
├── manifest.json                    ← PWA-манифест
├── icon-192.png, icon-512.png       ← PWA-иконки
├── og-image.{jpg,png,svg}           ← Open Graph картинки
│
├── netlify/functions/
│   └── chat.js                      ← Anthropic API proxy (rate-limited)
│
├── *.html                           ← 39 публичных страниц
│
├── state.js                         ← центральный менеджер localStorage
├── analytics.js                     ← трекер событий (готов под GA4)
├── alisa-widget.js                  ← плавающий чат-консьерж
├── sidebar.js                       ← единое меню
├── sw.js                            ← Service Worker (PWA)
├── sw-register.js                   ← SW регистрация + auto-update toast
├── api-fallback.js                  ← диагностика /api/chat
├── cookies.js                       ← cookie consent banner
│
├── agents.json                      ← 169 агентов (структура для recommend.html)
├── lead-magnet.pdf                  ← готовый PDF 14 страниц
│
└── ai-office-deploy.zip             ← готовый zip для Netlify Drop
```

---

## 🚀 Как переехать на новое устройство

### Шаг 1: Клонировать проект
```bash
mkdir ~/Downloads/ai-office-project
cd ~/Downloads/ai-office-project
unzip ai-office-FULL-backup-2026-05-16.zip
```

### Шаг 2: Открыть в редакторе
Любой код-редактор (VSCode, Cursor, Sublime). Build-системы нет — это статика.

### Шаг 3: Локальный preview
```bash
# Любой статический сервер. Например, Python:
python3 -m http.server 8000
# Открой http://localhost:8000
```

Или просто открой `index.html` двойным кликом (но `/api/chat` тогда не будет работать).

### Шаг 4: Деплой на Netlify
**Вариант А (через Drop, быстрый):**
1. Открой https://app.netlify.com/drop
2. Перетащи папку проекта (или `ai-office-deploy.zip`)
3. Готово через 30 сек

**Вариант Б (через GitHub, правильный):**
1. Создай репо на GitHub, запушь проект
2. Netlify → New site from Git → выбрать репо
3. Будет auto-deploy при каждом `git push`
4. В Site Settings → Environment Variables: добавить `ANTHROPIC_API_KEY`

### Шаг 5: Подключить домен
Netlify → Domain Settings → Add custom domain → следуй инструкциям (нужно прописать DNS у регистратора).

### Шаг 6: Подключить интеграции (по мере готовности)
В Netlify Environment Variables:
- `ANTHROPIC_API_KEY` (уже работает чат с агентами)
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` — когда поднимешь Supabase
- `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET` — когда откроешь мерчант
- `RESEND_API_KEY` — для email-рассылок
- `TG_BOT_TOKEN` + `TG_CHAT_ID` — для уведомлений в Telegram
- `GA4_ID`, `YM_ID` — счётчики аналитики

---

## 🔧 Тестирование

### Проверь работу API
1. Открой `https://твой-домен/dev-tools.html` или `/dev`
2. В блоке «🔌 /api/chat — диагностика» нажми «Тест API»
3. Должен показать `pong` в зелёной плашке за < 3 секунды

### Проверь инбокс лидов
1. Открой `/leads` или `/leads-inbox.html`
2. Все формы (бриф / партнёрка / PDF-захват / видео-подписки) должны быть в одном месте
3. Кнопка «📤 Экспорт JSON» — скачивает всё

### Проверь сохранение состояния
1. Заполни бриф на `/onboarding`
2. Открой `/leads-inbox.html` — должен видеть данные
3. Закрой и снова открой браузер — данные должны остаться

### Mock-данные для скриншотов
1. Открой `/dev-tools.html` → «🎲 Заполнить всё»
2. Скриншоты теперь покажут реалистичные цифры

---

## 📊 Аналитика

Все события пишутся локально в `localStorage['aio_analytics_queue']`.
Просмотр: `/leads-inbox.html` → таб «📊 События».

Чтобы подключить GA4 / Yandex.Metrika:
1. Загрузить их скрипты на главной (или через GTM)
2. Добавить ID:
   ```html
   <script>
     window.AIO_GA4_ID = 'G-XXXXXXX';
     window.AIO_YM_ID = 12345678;
   </script>
   ```
3. `analytics.js` автоматически продублирует все события туда.

---

## 💬 Контакты и помощь

- **Telegram:** @ilia_paliy
- **Email:** ilia.info.paliy@gmail.com
- **Notion:** база знаний проекта в твоём workspace (поиск «AI Growth Office»)

---

## 📋 Checklist «100% запуска»

- [ ] Домен куплен и привязан
- [ ] Netlify Site через GitHub (не Drop)
- [ ] `ANTHROPIC_API_KEY` в env vars (чат работает)
- [ ] Supabase: Auth + 5 таблиц
- [ ] Все формы пишут в Supabase
- [ ] YooKassa подключена + webhook → запись подписки
- [ ] Гейт по подписке на /dashboard и /workspaces
- [ ] Email-цепочка (Resend) после регистрации
- [ ] Telegram-уведомления админу о лидах/оплатах
- [ ] GA4 / Yandex.Metrika ID проставлены
- [ ] og-image.png сжат до < 250KB
- [ ] Lighthouse score > 85 на всех страницах
- [ ] 7 Loom-видео записаны и проставлены в demo.html
- [ ] Первые 3 реальные кейса собраны
- [ ] Партнёрская программа запущена (первые 10 партнёров)
- [ ] Telegram-канал ведётся регулярно
- [ ] CRM настроена под лиды
- [ ] Полная переписка тестового пользователя записана как кейс

---

## 🎁 Что внутри final-backup zip

- Весь исходный код (HTML, JS, CSS — статика без build-step)
- 169 агентов в `agents.json`
- Готовый PDF лид-магнита (14 страниц)
- Все изображения (og-image в JPG/PNG/SVG, иконки PWA)
- Netlify-конфигурация
- Netlify Function (Anthropic proxy)
- HANDOFF.md (этот документ)
- README.md (краткий обзор)
- Готовый `ai-office-deploy.zip` для drag&drop на Netlify

**Размер:** ~7 МБ.
**Структура папки:** монолитная (все файлы на корне, как ожидает Netlify).

---

_Last updated: 2026-05-16_
