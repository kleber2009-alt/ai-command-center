# AI Growth Office + Transcribe — статус и роадмап

> **Дата отчёта:** 2026-05-16
> **Ветка:** `claude/unpack-project-gU5md`
> **Готовый к деплою commit:** `9bfee75` — self-hosting миграция завершена
> **Документ для Notion** — можно скопировать целиком в `📦 Handoff · Полный статус проекта`

---

## 1. TL;DR за 30 секунд

Два продукта в одном репозитории, оба переехали с Vercel/Netlify/Supabase на **один Docker-стек, готовый к запуску на Hetzner**.

- **AI Growth Office** (статический сайт + Phase 5 voice-стек) — Telegram Voice Composer Bot готов
- **Transcribe** (Next.js приложение для транскрибации) — рефакторнут на Postgres

Остался один шаг до прод-запуска: SSH на твой Hetzner, `docker compose up -d --build`, и обновление DNS. ~10 минут работы.

---

## 2. Архитектура после миграции

```
                    ai-growth-office.ru
                          │
                          ▼
              ┌─────────────────────┐
              │   Caddy (auto-TLS)  │  Let's Encrypt
              └──────────┬──────────┘
                         │
   ┌─────────────────────┼───────────────────────┐
   ▼                     ▼                       ▼
/transcribe        /api/*                    /*  (статика)
   │                  │                          │
   ▼                  ▼                          ▼
┌─────────┐    ┌─────────────┐         ai-office-project/
│Next.js  │    │  Fastify    │         (bind-mounted в Caddy)
│Standalone│    │ (ai-office) │
└────┬────┘    └─────┬───────┘
     │               │
     └───────┬───────┘
             ▼
       ┌──────────┐
       │ Postgres │  Все данные: transcripts, leads, voices,
       │   16     │  voice_generations, voice_bot_users,
       └──────────┘  voice_binding_tokens
```

Внешние SaaS (всё через серверный proxy, ключи в `infra/.env`):
- api.anthropic.com — чат, summary, translate, generate
- api.elevenlabs.io — voice clone + TTS
- api.deepgram.com — транскрибация
- api.telegram.org — оба бота

---

## 3. Что пройдено (✅)

### Этап 1 — Распаковка и аудит проекта
- Распакован `1d38d65a-aiofficeCAPSULEfinal.zip` в репо: 78 файлов, 7.3 MB
- Аудит: 45 HTML-страниц, 10 JS-модулей, 169 AI-агентов в `agents.json`
- Найдены ключевые риски: TG-токен утечка, RLS не настроена, model-hardcode

### Этап 2 — Phase 5 Voice Pipeline (3 коммита)
- **Commit 1 (`dd89780`):** voice clone через ElevenLabs
  - `persona-train.html` — UI с MediaRecorder
  - `/api/voice-clone`, `/api/voice-generate`, `/api/voice-list`
- **Commit 2 (`6735040`):** Telegram Voice Composer Bot
  - `/api/tg-voice-webhook` — webhook + state machine (`/start`, `/voice`, `/settings`, `/clear`, `/help`)
  - Owner шлёт текст → бот возвращает voice-note → пересылает кому угодно
- **Commit 3 (`d101711`):** Handle verification
  - Одноразовые коды `XXX-XXX` через `/api/voice-binding-token`
  - Защита от impersonation (анонимный handle больше не привяжешь)

### Этап 3 — Self-hosting миграция (commit `9bfee75`)
- ❌ Vercel hosting → ✅ Docker `transcribe` контейнер
- ❌ Netlify hosting + Functions → ✅ Caddy + Docker `ai-office` контейнер
- ❌ Supabase Postgres + Storage → ✅ контейнер `postgres:16-alpine` + named volume
- ❌ Supabase REST на фронте → ✅ same-origin `/api/leads`
- ❌ 5 разрозненных SQL-миграций → ✅ один `infra/db/init/001_schema.sql`
- ❌ `@supabase/supabase-js` (8 npm-пакетов) → ✅ `pg` (один)
- ✅ Caddy auto-TLS заменяет настройку DNS + сертификатов
- ✅ Полная инструкция в `infra/README.md` (включая Hetzner-specifics)
- ✅ Локальная проверка: Next.js собирается, Fastify модули импортируются, `docker compose config` валиден

---

## 4. Что осталось до 100% запуска (твои действия)

| Приоритет | Шаг | Время | Кто делает |
|---|---|---|---|
| 🔴 P0 | Hetzner: создать CPX21 (Ubuntu 24.04, 8€/мес) | 5 мин | Ты |
| 🔴 P0 | DNS: A-запись `ai-growth-office.ru` → IP | 5 мин (+TTL) | Ты |
| 🔴 P0 | SSH, `git clone`, `cd infra`, `cp .env.example .env` | 3 мин | Ты |
| 🔴 P0 | Заполнить `infra/.env`: secrets и API-ключи | 5 мин | Ты |
| 🔴 P0 | `docker compose up -d --build` | 5 мин (билд) | Ты |
| 🟡 P1 | Проверить `https://your-domain/api/health` → `{ ok, db, elevenlabs }` | 1 мин | Ты |
| 🟡 P1 | Создать voice-бота у @BotFather, токен в `.env` | 5 мин | Ты |
| 🟡 P1 | Установить webhook (`curl setWebhook`) | 1 мин | Ты |
| 🟡 P1 | Пройти E2E: `/persona-train` → запись → код → бот → voice-note | 5 мин | Ты |
| 🟢 P2 | Купить ElevenLabs Starter ($5/мес) если ещё нет | — | Ты |
| 🟢 P2 | Старый TG-токен отозвать через @BotFather → `/revoke` (был засветлён) | 1 мин | Ты |

**Итого до прод-запуска: ~30 минут на чистый Hetzner.**

---

## 5. Roadmap дальше (после прод-запуска)

### Фаза A — Полировка (1-2 недели)
- [ ] **Sentry/Glitchtip** для error tracking
- [ ] **Uptime Robot** для мониторинга `/api/health`
- [ ] **Бэкап БД на S3** (Backblaze B2 / Selectel S3) — `pg_dump | rclone`
- [ ] **Lighthouse audit** + сжатие `og-image.png` (1.3 MB → 250 KB)
- [ ] **CSP headers** ужесточить в Caddyfile
- [ ] **Loom-видео** 7 штук для `demo.html` (placeholder-слоты пустые)
- [ ] **Реальные кейсы** клиентов вместо модельных (первые 3 истории)

### Фаза B — Платежи и подписки (3-4 недели)
- [ ] **YooKassa** мерчант + webhook + запись в БД
- [ ] **Stripe** для зарубежной аудитории (опционально)
- [ ] **Auth**: magic link через email (Resend / Brevo)
- [ ] **Middleware-гейт**: `/dashboard` и workspaces только при активной подписке
- [ ] **Email-цепочка**: `emails.html` шаблоны через Resend
- [ ] **TG-уведомления админу** о новых лидах/оплатах/тревогах

### Фаза C — Phase 5 расширение (1-2 месяца)
- [ ] **Subscriber-relay flow**: подписчик пишет боту → AI-ответ от твоего имени → approval через inline-кнопки
- [ ] **Видео-кружки**: D-ID Talks API ($5+/мес) + `sendVideoNote`
- [ ] **Style match**: Claude + персональный промпт на 30+ постах юзера
- [ ] **Multi-voice**: несколько голосов на одного owner, переключение в `/settings`
- [ ] **TTS sliders**: stability/similarity редактируемы из бота
- [ ] **OPUS output** для нативных voice-notes (требует Creator $22 на ElevenLabs)

### Фаза D — Instagram (после стабильного Phase 5, 1-2 месяца)
- [ ] **Instagram Graph API** (нужен Business аккаунт + Meta-review)
- [ ] **Stories/Reels автопостинг** по расписанию
- [ ] **DM-автоответы** (с осторожностью, согласие подписчиков)
- [ ] **Buffer/Later** как fallback если Meta-review затянется

### Фаза E — Расширение продукта (2-3 месяца)
- [ ] **Custom-агенты**: пользователь создаёт своих через UI
- [ ] **MCP-интеграции**: Notion, Google, CRM
- [ ] **Team-режим**: несколько пользователей в одном офисе
- [ ] **Public API** под Enterprise
- [ ] **RAG long-term memory** на контент клиента
- [ ] **AI-аналитика**: автоинсайты от агентов

### Фаза F — Полный self-host AI (опционально, ~6 мес)
- [ ] **Coqui XTTS** на GPU-сервере (NVIDIA 8GB+) — замена ElevenLabs
- [ ] **Whisper.cpp** — замена Deepgram
- [ ] **Yandex GPT** / локальный LLM — замена Anthropic
- Архитектура уже изолирована, можно подменять провайдеров без перестройки

---

## 6. Файлы / артефакты

| Что | Путь | Назначение |
|---|---|---|
| **Полное руководство по деплою** | `infra/README.md` | 10-минутный setup |
| **Compose** | `infra/docker-compose.yml` | Оркестрация 4 сервисов |
| **Caddy config** | `infra/Caddyfile` | Reverse proxy + TLS |
| **Env template** | `infra/.env.example` | Все secrets в одном месте |
| **DB schema** | `infra/db/init/001_schema.sql` | Auto-applied при первом старте |
| **Fastify backend** | `infra/services/ai-office/` | Заменяет Netlify Functions |
| **Next.js Dockerfile** | `infra/services/transcribe/Dockerfile` | Для Vercel-замены |
| **Phase 5 docs** | `ai-office-project/docs/PHASE_5.md` | Voice clone флоу |
| **Этот документ** | `docs/STATUS_AND_ROADMAP.md` | Для Notion |

---

## 7. Контакты

- **Git репо:** [kleber2009-alt/ai-command-center](https://github.com/kleber2009-alt/ai-command-center)
- **Активная ветка:** `claude/unpack-project-gU5md`
- **Telegram:** @ilia_paliy
- **Email:** ilia.info.paliy@gmail.com

---

_Готово к мерджу в `main` и деплою на Hetzner после твоей проверки._
