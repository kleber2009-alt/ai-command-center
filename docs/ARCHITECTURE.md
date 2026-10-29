# Архитектура AICEX

Одна карта всего, что производим: серверы, домены, проекты, боты, базы, связки и деплой.
Живой каталог с описанием и roadmap каждого проекта — **https://projects.aicex.club/dashboard**
(API `/api/projects`). Источник данных для него — реестр
[`apps/command-center/registry/projects.mjs`](../apps/command-center/registry/projects.mjs):
поправили реестр → `node apps/command-center/registry/sync.mjs --apply`.

Состояние на 2026-10-29.

## Серверы

| Сервер | Что на нём | Как попадают снаружи |
|---|---|---|
| **aicex** — Hetzner `157.180.33.173` (`vars.HETZNER_HOST`) | Docker-проекты `infra`, `aisales`, `aisales-v2`, `tg-agent`, `ai-hub`, `ig-content`, `command-center`; статика hq2, remake, dashboard, лендинги; `/opt/finance-os` | Caddy + Let's Encrypt, `*.aicex.club` (блоки в `/etc/caddy/Caddyfile` и `/opt/edge/sites/*.caddy`) |
| **сервер ботов** — тот же aicex, пользователь `iliapaliy` | systemd: `studio-kadrik-bot`, Creator Pack, бот монтажа, бот каруселей, Silent Reels, `hq-runner` | Telegram long polling; мини-аппы через Cloudflare / cloudflared-туннель |
| Cloudflare | `hq`, `skills`, `marketing`, `reels`, `montazh`, `studio`, `kadrik` (туннель) | прокси Cloudflare |
| Netlify | Legal Site | netlify |
| ~~Hetzner `46.62.215.11` (nip.io)~~ | старый адрес, **больше не отвечает** — все ссылки на `*.aicex.club` | — |

Боты на сервере делят одну очередь тяжёлых задач (`heavy_slot.py`, flock `~/.heavy-slot.lock`)
и один Claude-логин; скиллы лежат в `~/.claude/skills`.

## Домены

| Домен | Проект | Где живёт |
|---|---|---|
| `projects.aicex.club` | AI Command Center (этот каталог) | контейнер `command-center` |
| `hq2.aicex.club` | Живой офис агентов v2 | `aicex-hq-office` + `aicex-hq-assistant`, `hq-runner` |
| `hq.aicex.club` (`/?game`) | Виртуальный офис v1, «Офис растёт с тобой» | Cloudflare |
| `office.aicex.club` (`/mini-app/`, `/worker/*`) | AI Growth Office, Mini App, Office Worker | `infra-ai-office-1`, `infra-aisales-worker-1` |
| `transcribe.aicex.club`, `tma.aicex.club` | Транскрибация и её Mini App | `infra-transcribe-1` |
| `remake.aicex.club` | Ремейк залёта (прогоны + студия) | `aicex-remake-site`, `aicex-remake-api` |
| `kadrik.aicex.club` | Студия Кадрика, мини-апп | systemd `studio-kadrik-bot` → cloudflared |
| `reels.aicex.club`, `montazh.aicex.club` | Бот монтажа: лендинг и мини-апп | Cloudflare |
| `skills.aicex.club` | Пак скиллов (лендинг «Медь») | Cloudflare |
| `marketing.aicex.club` | Витрина маркетинга, файлы для офиса | Cloudflare |
| `dashboard.aicex.club` | Сквозная аналитика | `/var/www/funnel-analytics`, cron 3ч |
| `aihub.aicex.club`, `aihub-app.aicex.club` | AI Creative Hub: лендинг и приложение | `ai-hub-web`, `ai-hub-worker` |
| `studio.aicex.club` | Persona Studio | `persona-studio-web`, `persona-studio-worker` |
| `persona-train.aicex.club` | Persona Train | `persona-train-web :3030` |
| `parser.aicex.club` | Залётный (Viral Discover), кабинет | Office Worker |
| `factory.aicex.club` | AI Content Factory, кабинет | `infra-ai-content-factory-1` |
| `ig.aicex.club` | IG Serial Content (демо) | `ig-content` :3017 |
| `crm.aicex.club`, `sales.aicex.club`, `sales-api.aicex.club` | AI Sales System: CRM, портал, API v2 | статика + `aisales-api-v2` :8001 |
| `tg.aicex.club` | TG Agent, админка | `tg-agent` |
| `landings.aicex.club/<name>/` | Лендинги из `landings/` | `/var/www/landings`, `deploy-landings.yml` |
| `finance.aicex.club` | Finance OS | `/opt/finance-os` |
| `course.aicex.club` | запланирован, TLS пока не поднят | — |

## Telegram-боты

| Бот | Проект |
|---|---|
| `@your_transscribe_bot` | Транскрибация + Reels Cloner (`/clone`) |
| `@AI_Growth_Office_Bot` (`/app`) | AI Growth Office и его Mini App |
| `@aio_voice_bot` | AI Voice Bot (датасет голоса) |
| `@ilia_pali0_bot` | Persona Train |
| `@aicex_one_bot` | AI Creative Hub (TMA) |
| `@parser_instaa_bot` | Залётный (онбординг и выдача) |
| `@newnewnnn_bot` | TG Agent (+ уведомления владельцу от IG Agent) |
| `@studio_kadrik_bot` | Студия Кадрика |
| `@Productionskill_bot` | Creator Pack (48 стилей монтажа) |
| `@reelswithai_bot` | Бот монтажа |
| `@caruselclaude_bot` | Бот каруселей |
| `@Sielencemode_bot` | Silent Reels |

## Базы данных

- **`aisales-postgres`**: `aisales` (AI Sales, AI Growth Office, Office Worker, Command Center — таблицы
  `projects`, `project_milestones`), `ai_hub` (AI Creative Hub), `ig_agent` (IG Agent).
- **`infra-postgres-1`**: `aio` (Транскрибация).
- SQLite: `tg-agent`, `transcribe`, AI Content Factory (sqlite-vec). Студия Кадрика — JSON/JSONL в `data/`.
- Бэкапы: `pg_backup` 03:17 UTC и `aux_backup` 03:40 UTC → MinIO (30 дней) + 7 дней локально,
  см. [`backup-restore.md`](backup-restore.md).

## Связки (как проекты работают друг с другом)

```
Контент
  Залётный (Apify) ──► топ рилсов ниши утром в TG
  Свой топ-рилс ──► Ремейк залёта ──► ElevenLabs (расшифровка) ──► Claude «Сценарий 2.0»
                                   ──► HeyGen (аватар + голос) ──► API Студии Кадрика (монтаж) ──► рилс 9:16
  Чужой рилс ──► /clone в @your_transscribe_bot ──► yt-dlp/Apify ──► Whisper ──► Claude ──► HeyGen ──► Submagic
  Видео ──► Creator Pack / Студия Кадрика / Бот монтажа ──► Claude Code + скиллы монтажа ──► рилс
  Тема ──► Бот каруселей / AI Content Factory / IG Serial Content ──► карусели
  Threads Growth ──► 3 ветки в день карточками в TG ──► Threads API ──► канал материала

Продажи
  Рилс с кодовым словом ──► ИИ в Директе (ChatPlace) ──► бесплатный материал ──► Telegram-канал
  Нейроворонка: лид-магнит ──► бот с прогревом ──► лендинг (5 стилей) ──► оплата
  AI Sales System (Алиса, IG+TG) ──► CRM crm.aicex.club
  Сквозная аналитика: декомпозиция × Meta Ads × оплаты GetCourse (UTM) ──► dashboard.aicex.club

Голос и лицо
  @aio_voice_bot / Persona Train ──► ElevenLabs voice ID (таблица voices) ──► AI Office, AI Sales, Persona Studio
  Persona Studio ──► аватары, видео HeyGen/OmniHuman ──► монтаж через /api/ext/* Студии Кадрика

Офис
  hq2 рабочий стол ──► hq-runner ──► Claude Code со скиллами ──► результат в историю задач
  PR в монорепо ──► hq-office-history.yml ──► tasks.auto.js ──► правая панель hq2
```

## Код

- Монорепо **`kleber2009-alt/ai-command-center`**: `apps/<app>` (у каждого свой `CLAUDE.md`),
  `landings/`, `infra/`, `scripts/`, `supabase/`, `.claude/skills/` (`hq-history`, `remake-top-reel`).
- Закрытая библиотека **`kleber2009-alt/aicex-library`**: 110 скиллов и 28 проектов — код ботов монтажа,
  каруселей, Creator Pack, Silent Reels, слайды практикума.
- Деплой — `.github/workflows/deploy-*.yml` (по пути приложения), Кадрик — вручную, мониторинг Кадрика каждые 30 мин.

## Как добавить новый проект

1. Добавить объект в `apps/command-center/registry/projects.mjs` (slug, статус, описание с блоком
   «Архитектура:», все ссылки).
2. `node apps/command-center/registry/sync.mjs` — проверить, что изменится; затем `--apply`.
3. Новый домен, бот или связка — дописать в таблицы этого файла.
4. Готовая работа для вебинара — ещё и в историю офиса (скилл `hq-history`).
