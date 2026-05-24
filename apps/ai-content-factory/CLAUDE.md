# apps/ai-content-factory — agent-facing notes

TypeScript + ESM, Node 20+. Не путать с обычными CJS-проектами монорепо.

## Стек

| Слой | Что |
|---|---|
| AI | `@anthropic-ai/sdk` — Claude (opus/haiku) с prompt caching |
| Эмбеддинги | Voyage AI (`voyage-3.5`, 1024-dim) — Anthropic не отдаёт собственные |
| Хранилище | `better-sqlite3` + `sqlite-vec` (vss) в `data/factory.db` |
| Рендер | Puppeteer (headless Chromium) → PNG 1080×1350 |
| Delivery | Telegram Bot API (media group + caption) — fetch, без `node-telegram-bot-api` |
| Schema validation | Ajv (draft 2020-12) |

## Точки входа

- `src/index.ts` — heartbeat; используется как PM2/Docker entry в будущем
  (фаза 5: cron scheduler).
- `src/cli/carousel.ts` — генерация + рендер одной карусели (доступно через `npm run carousel`).
- `src/cli/ingest.ts` — загрузка knowledge base из JSONL (`npm run ingest`).

## Структура слоёв

```
src/
├── lib/         logger, paths, prompt-template, rubrics, performance
├── schemas/     content, carousel, caption — Ajv-валидируемые типы
├── generators/  claude (wrapper), carousel (slides), caption (post text)
├── renderers/   carousel (Puppeteer), templates (HTML)
├── knowledge/   store (sqlite-vec), ingest, retrieve, context (RAG formatter)
├── embeddings/  voyage (HTTP wrapper)
├── delivery/    telegram (multipart media group)
├── pipelines/   carousel (end-to-end)
├── cli/         carousel.ts, ingest.ts
├── db/          sqlite open + schema migrations (idempotent)
└── index.ts     entry/heartbeat
```

## Важные инварианты

- **JSON Schema на каждый Claude-выход.** Никакого «парсим как получится».
  Wrapper в `generators/claude.ts` валидирует ответ Ajv'ом и ретраит при
  невалидном JSON.
- **`logGeneration` после каждой удачной генерации** — пишет в knowledge
  store строку с input/retrieved/output/status. Это база для будущих
  weekly-insights.
- **Telegram-доставка опциональна.** Пайплайн всё равно пишет PNG+caption на
  диск; `--deliver` только дополнительно постит в чат.
- **RAG degrades gracefully.** Нет `VOYAGE_API_KEY` или пустая knowledge
  base → лог `RAG retrieval skipped`, пайплайн продолжает без grounding.

## Что НЕ менять без причины

- ESM `"type": "module"` + `.js`-расширения в импортах (`import './foo.js'`),
  даже если файл `.ts`. Это требование Node ESM-резолвера.
- `EMBEDDING_DIM = 1024` в `src/db/index.ts`. Меняешь — пересоздавай
  knowledge base, иначе vector search ломается.
- `dist/` в `.gitignore`. Это билд-артефакт, не коммитим.

## Тестирование

- `npm test` — 19 unit-тестов через `node --test` + `tsx`. Без сети.
- `npm run carousel -- --rubric hood --fixture tests/fixtures/hood-sample.json` —
  smoke без Claude (рендер только).

## Деплой

Docker compose под общую инфру `infra` (label `com.docker.compose.project=infra`).
Контейнер `infra-ai-content-factory-1`. См. `DEPLOYMENT.md`.

## Pending milestones

- [ ] Phase 4: `src/pipelines/reels.ts` + `src/renderers/reels-video.ts` (FFmpeg)
- [ ] Phase 5: `src/scheduler.ts` (node-cron) + `src/pipelines/weekly-insights.ts`
- [ ] Phase 6: ✅ Dockerfile + compose готовы; запуск на prod — задача владельца.

## Известное

- `data/rubrics.json` — у `routine` и `money` плейсхолдеры. Перед прод-запуском
  заполнить или удалить из cron-плана.
- Puppeteer 23.x deprecated upstream (>= 24.15.0). Поднять можно, но
  ломает API не сильно — обновляй за один заход с регрессом всех PNG-снапшотов.
