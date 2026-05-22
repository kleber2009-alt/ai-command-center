# infra-worker — CLAUDE.md

«Двигатель» AI Growth Office. cron+queue процессор поверх `aisales-postgres`.
Без UI (HTTP только для webhook'ов). Прод-контейнер: `infra-aisales-worker-1`.

## Architecture

```
schedule_rules (cron-templates)
  → ruleTick (every 60s)
  → scheduled_jobs (pending/running/done/failed/skipped,
                    FOR UPDATE SKIP LOCKED, retry +1min × attempts,
                    dedup on (rule_id, user_id, scheduled_at))
  → handler
  → deliverables (basis for WFDS metric)
```

## 9 handler kinds

| handler | назначение | cron |
|---|---|---|
| `daily_briefing` | утренний TG-дайджест от Ани | 08:30 Пн–Пт |
| `weekly_recap` | пятничный отчёт + voice | 15:00 Пт |
| `monthly_calendar` | контент-план на следующий месяц | 07:00 ежедневно |
| `welcome_sequence` | онбординг после оплаты | по триггеру |
| `welcome_voice` | Day-0 +23min голосовое (ElevenLabs) | по триггеру |
| `subscription_expiry_check` | reminders за 3 / 1 день до окончания | 06:00 ежедневно |
| `viral_clone` | `/clone` pipeline (6 шагов state-machine) | по триггеру |
| `viral_clone_sweep` | оживление orphan pipeline'ов + stage-timeout fail | `*/5 * * * *` |
| `viral_discover` | поиск трендовых рилсов конкурентов | 05:00 ежедневно |

## Webhook endpoints (port 3000)

- `POST /worker/tg-webhook` — callback queries от Office bot (`d:used:<id>` / `d:nope:<id>`).
- `POST /worker/viral-clone/dispatch` — внешний триггер `/clone` (header `x-dispatch-secret`).

## Парсер (Parser bot) — отдельный продукт внутри этого приложения

- **Код**: `lib/parser_bot.js` — Telegram-бот для парсинга трендов
- **Cabinet (UI)**: `landings/viral-discover/cabinet/` в корне репо
- **Prod URL**: `https://parser.46-62-215-11.nip.io` (cabinet)
- **Cron**: handler `handlers/viral_discover.js` (05:00 ежедневно — поиск трендовых рилсов конкурентов через Apify)
- **Scoring**: `lib/scoring.js` — рейтинг "зайдёт ли это в блоге 1–10" от Claude
- **Связанные `lib/`**: `apify.js`, `scoring.js`, `tg.js`, `webhook.js`

При правках "Парсера" — это всё внутри `apps/infra-worker/`, не отдельное приложение.

## Source-of-truth

- **Canonical**: `apps/infra-worker/` в этом репо.
- **Prod build context**: `/home/aisales/infra-worker-viral-clone/` на проде (sync через `rsync --delete` с Mac).

После консолидации репо: обнови rsync target на Mac (`apps/infra-worker/` вместо старого пути). Этот пункт ещё не сделан — until then, prod path is authoritative.

## Управление

Под compose-проектом `infra` через override `/root/ai-command-center/infra/docker-compose.override.yml` (auto-discovery, пинит `image: infra-aisales-worker:hotpatch-YYYYMMDD-N`). Env-vars: `/root/ai-command-center/infra/.env`.

## Сборка образа — ВСЕГДА

```bash
docker build --no-cache --pull --provenance=false --sbom=false ...
```

Без `--provenance=false --sbom=false` BuildKit делает attestation manifest, и `docker run` подхватывает «старый» слой → новый код не запускается.

## `lib/db.js` gotcha

`query(sql)` возвращает **массив** `res.rows`, не объект.

```javascript
// правильно
const rows = await query(sql);

// неправильно
const result = await query(sql);
result.rows  // undefined!
```

## Структура

- `handlers/` — по одному файлу на handler kind (см. таблицу выше)
- `lib/db.js` — pg pool wrapper
- `lib/*` — telegram, openai, elevenlabs, anthropic, и т.д.
- `migrations/` — SQL миграции
- `package.json`, `Dockerfile`

## Models

- `daily_briefing`, `weekly_recap`, `monthly_calendar` — `claude-sonnet-4-6` (content reasoning).
- `viral_clone`/`viral_discover` — Whisper (transcribe), Claude rewrite, HeyGen, Submagic, ElevenLabs.
- `welcome_voice` — ElevenLabs PVC голос владельца.

## Безопасность

- DB пользователь — `aisales` (RW). На проде смотри `claude_ro` если только читать.
- Любая запись в БД `aisales` — только с явного подтверждения пользователя (см. корневой `CLAUDE.md` → "Production work modes").
