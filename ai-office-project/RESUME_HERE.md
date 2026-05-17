# 👋 START HERE · возобновление работы над AI Growth Office

> **Открой этот файл первым на новом устройстве.**
> Дата создания: **16 мая 2026**

---

## ⏱ 30 секунд — где мы сейчас

**Стадия:** MVP-фронтенд + админка + safe backend + Mini App **готовы**.
**Что блокирует production:** деплой через GitHub (не Drop) + 3 env vars + Supabase RLS policy.
**Куда движемся дальше:** AI-агенты, которые общаются за тебя текстом / голосом / кружками в Instagram и Telegram.

---

## 🎯 Phase 5 · в работе (стартовала 16.05.2026)

> **«AI-агенты пишут / говорят / снимают кружки от твоего лица на IG + TG»**

| Блок | Что | Сервис | Статус |
|---|---|---|---|
| 🎤 **Voice clone** | TTS твоим голосом | **ElevenLabs** (выбрано) | ✅ Commit 1 |
| 🎭 **Sample collection** | UI для загрузки голоса | `persona-train.html` | ✅ Commit 1 |
| 📨 **TG composer bot** | Бот озвучивает текст owner'а, owner пересылает | Telegram Bot API | ✅ Commit 2 |
| 🔒 **Handle verification** | Одноразовый код XXX-XXX для привязки бота | `voice_binding_tokens` | ✅ Commit 3 |
| ✅ **Subscriber relay** | Подписчики пишут боту → AI-ответ → approval | TG inline-кнопки | ⏳ Commit 4+ |
| 🎬 **Video circles** | Кружки Telegram | D-ID / HeyGen | ⏳ Commit 4 |
| ✍️ **Style match** | Тексты в твоём стиле | Claude + персональный промпт | ⏳ Commit 4 |
| 📷 **IG posting** | Stories/Reels/DM | Instagram Graph API | ⏳ Commit 5 |

**Что прямо сейчас нужно от тебя для запуска Commit 1+2+3:**
1. В Supabase SQL Editor прогнать **три миграции** по порядку:
   `003_voice.sql` → `004_voice_bot.sql` → `005_binding_tokens.sql`
2. Купить ElevenLabs Starter ($5/мес минимум — Free не даёт voice cloning)
3. Создать бота у @BotFather (`/newbot` → токен)
4. В Netlify env vars добавить:
   - `ELEVENLABS_API_KEY`
   - `SUPABASE_URL` = `https://cslvbnladhfjrdbtnwkm.supabase.co`
   - `SUPABASE_SERVICE_KEY` (service_role из Supabase Settings → API)
   - `TG_VOICE_BOT_TOKEN` (новый бот из шага 3)
   - `TG_WEBHOOK_SECRET` (любая строка 32+ символов, опционально)
5. `curl -X POST` для `setWebhook` (полная команда — в `docs/PHASE_5.md`)
6. Открыть `/persona-train` → записать голос → нажать «🔑 Получить код для Telegram-бота»
7. Скопировать `/start @handle XXX-XXX` → отправить боту
8. После «✅ Привязал к голосу …» — любой текст в бот → voice-note обратно

Полная документация: [`docs/PHASE_5.md`](docs/PHASE_5.md)

**Customer flow в новой концепции:**
```
Подписчик пишет в IG/TG → AI читает → генерирует ответ
                                                ↓
                                  → Текст ✓ (от твоего имени)
                                  → Voice note ✓ (твоим голосом)
                                  → Видео-кружок ✓ (твоё лицо)
                                                ↓
                              Юзер аппрувит → AI постит
```

Когда возобновишь работу — скажи **«начинаем фазу 5: voice/video clones»**, и я сразу приступлю.

---

## 🚀 Первые 10 минут на новом устройстве

### 1. Распакуй backup (1 мин)
```bash
mkdir ~/Downloads/ai-office-project
cd ~/Downloads/ai-office-project
unzip ~/Downloads/ai-office-FULL-backup-2026-05-16.zip --strip-components 1
# или просто перетащи через Finder
```

### 2. Открой главные файлы (2 мин)
- `RESUME_HERE.md` ← ты сейчас здесь
- `HANDOFF.md` ← полное состояние проекта
- `README.md` ← краткий обзор

### 3. Открой `index.html` локально (1 мин)
```bash
python3 -m http.server 8000
# браузер: http://localhost:8000
```
Или просто двойной клик по `index.html`.

### 4. Зайди в Notion (1 мин)
Открой страницу **«📦 Handoff · Полный статус проекта»** в твоём workspace AI Growth Office. Там зеркало этого документа + roadmap по фазам.

### 5. Проверь Live-сайт (1 мин)
`https://spiffy-selkie-ec834f.netlify.app/` — должен открыться. Если нет — выкатай свежий `ai-office-deploy.zip` на https://app.netlify.com/drop.

### 6. Открой Claude / любой AI и скажи: (4 мин)
```
Я возобновляю работу над проектом AI Growth Office.
Прочитай RESUME_HERE.md и HANDOFF.md.
Текущий приоритет — Phase 5 (voice/video agents IG+TG).
Что нужно сделать первым шагом?
```

AI прочитает контекст и предложит план.

---

## 🔐 Что нужно держать в голове (credentials)

| Сервис | Где лежит | Статус |
|---|---|---|
| **Supabase** | URL и anon-key в `config.js` (RLS-safe) | ✅ настроено, ждёт RLS policy |
| **Telegram Bot** | Токен **только в Netlify env vars** | ⚠ старый токен `8204536077:AAH...` БЫЛ виден публично, ОТЗОВИ его |
| **Anthropic API** | env var на Netlify `ANTHROPIC_API_KEY` | нужен для `/api/chat` |
| **GitHub** | репо проекта (если уже создан) | ⚠ если нет — создай |
| **Netlify** | site, env vars, билд из репо | работает в Drop-режиме сейчас |
| **Домен** | `ai-growth-office.ru` | не куплен |

---

## 📂 Где что лежит

```
ai-office-project/
├── RESUME_HERE.md         ← ты здесь
├── HANDOFF.md             ← полный статус (читать вторым)
├── README.md              ← краткий обзор
│
├── 48 *.html файлов       ← все страницы сайта
├── blog/ (6 статей)       ← SEO-контент
├── mini-app/              ← Telegram Mini App (приостановлен)
├── netlify/functions/     ← chat.js + notify-tg.js
│
├── state.js               ← центральный state manager
├── analytics.js           ← event tracker
├── alisa-widget.js        ← плавающий чат на каждой странице
├── config.js              ← Supabase + TG-proxy
├── sidebar.js             ← общее меню
├── sw.js + sw-register.js ← PWA service worker
├── mock-backend.js        ← test mode (выключен по умолчанию)
│
├── agents.json            ← 169 AI-агентов (база)
├── lead-magnet.pdf        ← готовый PDF · 14 страниц
│
├── netlify.toml + _redirects ← конфигурация Netlify
├── manifest.json          ← PWA
├── og-image.{jpg,png,svg} ← Open Graph
│
└── ai-office-deploy.zip   ← готовый зип для Netlify Drop
```

---

## 🔑 Ключевые страницы сайта (для быстрой ориентации)

- `/` — главная с демо
- `/navigation` или `/map` — **карта сайта** (открывай если запутался)
- `/leads-inbox` — все собранные лиды
- `/dev-tools` — диагностика API, env, mock-data
- `/test` — E2E тесты, 19 проверок
- `/whats-new` — showcase всех функций
- `/blog/` — 6 SEO-статей
- `/mini-app-preview` — превью Mini App в макете телефона
- `/mini-app/` — сам Mini App (приостановлен)

---

## ✅ Что сделано к 16.05.2026 (главное)

**Фронтенд (готов на 100%):**
- 48 HTML-страниц с единым sidebar, поиском, темой
- Customer journey: index → how-it-works → brief → recommend → dashboard → workspaces
- Sales-stack: pricing, ROI calc, compare, cases, FAQ, dashboard-demo
- Education: 6 SEO-статей, glossary (25 терминов), about
- Partners: partners page, partner-dashboard, brand-kit
- 9 demo-офисов (3D Three.js + Pixel)
- 3 admin-страницы: leads-inbox, dev-tools, test
- PWA: manifest + sw + auto-update toast
- Безопасный backend: Supabase через config.js, TG через server-side Netlify Function
- Telegram Mini App: 5 экранов в одном HTML файле

**Что НЕ работает в production (требует твоего действия):**
1. ⚠ **Отзови старый TG-токен** через @BotFather → `/revoke` (он был в client-side коде)
2. **Подключи Netlify к GitHub** (Drop не деплоит Functions)
3. **Установи env vars:** `ANTHROPIC_API_KEY`, `TG_BOT_TOKEN`, `TG_CHAT_ID`
4. **Создай RLS policy** в Supabase для `anon` INSERT в `leads` table
5. **Купи домен** `ai-growth-office.ru`

---

## 📋 Чек-лист «возобновить работу»

Открой это первым делом на новом устройстве:

- [ ] Распаковал `ai-office-FULL-backup-2026-05-16.zip`
- [ ] Прочитал `RESUME_HERE.md` (этот файл)
- [ ] Прочитал `HANDOFF.md`
- [ ] Открыл Notion → «📦 Handoff · Полный статус проекта»
- [ ] Проверил что Live-сайт открывается
- [ ] Если нужно — задеплоил свежий `ai-office-deploy.zip`
- [ ] Отозвал старый TG-токен через @BotFather
- [ ] Создал новый TG-токен и положил в Netlify env vars (не в код!)
- [ ] Подключил GitHub-репо к Netlify (если ещё не сделано)
- [ ] Запустил `/test.html` → должно быть 17-19 из 19 зелёных
- [ ] Решил: продолжаем backend или переходим к Phase 5 (voice/video agents)?

---

## 💬 Контакты

- **Telegram:** [@ilia_paliy](https://t.me/ilia_paliy)
- **Email:** ilia.info.paliy@gmail.com
- **Notion workspace:** AI Growth Office

---

_Файл создан 16.05.2026. Версия 1.0. Не удалять._
