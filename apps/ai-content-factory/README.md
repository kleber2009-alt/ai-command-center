# AI Content Factory

Автономная фабрика сериального контента для Instagram-аккаунта об автоматизации
бизнеса через Claude и нейросети. Генерирует карусели и (в будущей фазе) рилс по
4 рубрикам, рендерит визуалы Puppeteer'ом и доставляет готовый пост в Telegram
для ручной публикации (human-in-the-loop).

Полное ТЗ — [`SPEC.md`](./SPEC.md). Этот README — оперативная шпаргалка
по тому, что уже собрано.

## Что готово (текущая фаза)

- **Foundation** — `lib/`, `lib/logger`, `lib/paths`, `lib/prompt`, `lib/rubrics`.
- **Claude wrapper** — `src/generators/claude.ts`: prompt caching, JSON Schema
  валидация через Ajv, retry с exponential backoff, performance-логирование.
- **Carousel pipeline** — `src/pipelines/carousel.ts`: идея → Claude JSON →
  Puppeteer PNG + caption → опциональная доставка в Telegram → запись
  `logGeneration` в knowledge-store.
- **Knowledge base / RAG** — `src/knowledge/*` + `src/db/index.ts` на
  `better-sqlite3` + `sqlite-vec`. Эмбеддинги Voyage AI (`voyage-3.5`).
- **Telegram delivery** — `src/delivery/telegram.ts`: media group + caption.
- **CLI** — `npm run carousel`, `npm run ingest`.

## Что ещё впереди

Phase 4 — Reels (script + FFmpeg). Phase 5 — `node-cron` scheduler +
weekly-insights. Phase 6 — VPS-деплой (этот пакет уже подготовлен,
см. `DEPLOYMENT.md`).

## Локальный запуск

```bash
cd apps/ai-content-factory
cp config/.env.example .env    # затем впиши ключи
PUPPETEER_SKIP_DOWNLOAD=1 npm install    # пропустить chromium на macOS
npm run typecheck
npm run test
```

### Сгенерировать карусель из фикстуры (без Claude)

```bash
npm run carousel -- --rubric hood --fixture tests/fixtures/hood-sample.json
```

Файлы — в `data/output/hood-ep1-<timestamp>/`.

### Сгенерировать настоящую карусель

Требует `ANTHROPIC_API_KEY`. Если хочется RAG-контекст — ещё `VOYAGE_API_KEY` и
загруженная knowledge base. Без RAG генерация работает («grounding skipped»).

```bash
npm run carousel -- --rubric hood --topic "Тема" --episode 7 --deliver
```

`--deliver` шлёт пост в Telegram (нужны `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`).
`--no-rag` пропускает retrieval-step.

### Загрузить контент в knowledge base

```bash
npm run ingest -- --file data/knowledge/seed.example.jsonl
```

## Переменные окружения

| Имя | Назначение | Обязательность |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API (генерация карусели, caption) | да, для генерации |
| `VOYAGE_API_KEY` | Voyage AI embeddings (RAG) | опционально |
| `TELEGRAM_BOT_TOKEN` | бот доставки | для `--deliver` |
| `TELEGRAM_CHAT_ID` | целевой чат | для `--deliver` |
| `TZ` | таймзона cron'а | по желанию (default UTC) |
| `MODEL_OPUS` / `MODEL_HAIKU` | оверрайды моделей | опционально |

## Рубрики

`data/rubrics.json` — 4 рубрики: `diary`, `routine`, `hood`, `money`. Каждая
ссылается на свой `data/prompts/carousel-<slug>.md` и опциональные примеры в
`data/prompts/examples/<slug>.md`. На текущий момент полностью заполнены
`diary` и `hood` — у `routine`/`money` плейсхолдеры (`TODO:`), их нужно
оформить перед запуском в прод.

## Архитектура (две страницы)

```
            CLI / Cron
                │
                ▼
        runCarouselPipeline
                │
   ┌────────────┼─────────────────┐
   ▼            ▼                 ▼
 RAG       generateCarousel    generateCaption
(SQLite +   (Claude opus)     (Claude haiku)
 vec)
                │
                ▼
        renderCarousel (Puppeteer)
                │
                ▼
       data/output/<slug>-ep<n>-<ts>/
                │
                ▼
        deliverToTelegram (опц.)
```

## Тесты

`npm test` — 19 тестов: render snapshot, schema валидация, prompt
interpolation, performance score, knowledge store, RAG ranking,
telegram media group builder. Тесты не делают сетевых вызовов.

## Production

См. [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Docker-пакет под общую инфру
ai-command-center (Caddy + docker-compose project `infra`).
