# persona-train — CLAUDE.md

Отдельный SaaS-кит для обучения голоса и аватара на твоих голосовых
сообщениях и кружках. Форк функционала AI Growth Office'а
(`/persona-train.html`) в собственный проект: **свой домен, свой бот,
свой кабинет**. Шерит таблицу `voices` с `infra-postgres-1.aio` — чтобы
голос был один и тот же во всех продуктах.

Source-of-truth: `README.md` в этой папке (подробная структура +
endpoints). Этот файл — короткий pointer + критические инварианты.

## Prod

- Сайт: `persona-train.46-62-215-11.nip.io`
- TG-бот: `@ilia_pali0_bot`
- Контейнер: `persona-train-web` (Next.js 15 `:3030`)
- DB: `infra-postgres-1.aio` (расшаренно с ai-office — таблица `voices`)
- Storage: MinIO `persona-train-media` (фоллбэк — локальный volume)

## Структура endpoints (см. README)

`/api/voice/*` — clone / list / sample / train (IVC) / generate (TTS) / analyze (Claude Sonnet 4.6 → voice profile) / binding-token.
`/api/avatar/*` — sample (TG кружки) / train (HeyGen) / list.
`/api/telegram/webhook` — TG bot updates.

## Cabinet routes

`src/app/cabinet/` — статус + samples + binding-token / train / generate / analyze / avatar.

## Shared invariant

Таблица `voices` в `infra-postgres-1.aio` **шерится с `apps/ai-office`**. Не делать миграций, ломающих контракт без согласования с ai-office. Voice cloning через ElevenLabs IVC.

## Models

- Voice analyzer — `claude-sonnet-4-6` (`src/lib/anthropic.ts`).
- Voice cloning + TTS — ElevenLabs IVC (`src/lib/elevenlabs.ts`).
