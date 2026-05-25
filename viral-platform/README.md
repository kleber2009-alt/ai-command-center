# Viral Platform

AI platform that turns long videos into viral short-form clips (Reels / TikTok /
Shorts). The headline feature is the **AI B-Roll Engine** (`packages/broll`);
every other module exists to serve it.

This is a self-contained pnpm + Turborepo monorepo. It was scaffolded from the
spec in [`CLAUDE.md`](./CLAUDE.md).

## Layout

```
apps/
  web/                 Next.js 15 — UI, tRPC API, SSE progress, Clerk auth
  worker-transcribe/   BullMQ worker — audio extract + Deepgram
  worker-detect/       BullMQ worker — Claude clip detection
  worker-broll/        BullMQ worker — ⭐ runs the B-roll engine
  worker-render/       BullMQ worker — FFmpeg export (9:16 / 1:1 / 16:9)
  ai-py/               FastAPI — Whisper / embeddings fallbacks
packages/
  shared/    types, zod schemas, constants, prompts, cosine
  db/        Drizzle schema + client + credits/pipeline helpers (pgvector)
  queue/     BullMQ wrappers, typed jobs, Redis progress pub/sub, cache
  ai/        Claude / OpenAI-embeddings / Deepgram / Pexels / Pixabay wrappers
  broll/     ⭐ the 5-step B-roll engine — pure, dependency-injected, tested
  ffmpeg/    direct ffmpeg/ffprobe wrappers (extract, silence, export)
  storage/   Cloudflare R2 (S3) presign + get/put
  ui/        shared UI helpers (cn)
```

## Quick start

```bash
cp .env.example .env        # fill in keys; defaults match docker-compose
pnpm install
docker compose up -d        # postgres (pgvector) + redis + minio
pnpm db:push                # apply Drizzle schema
pnpm dev                    # web on :3000 + all workers
```

Useful scripts: `pnpm test`, `pnpm test:broll`, `pnpm typecheck`, `pnpm lint`,
`pnpm db:studio`.

## Pipeline

`uploaded → transcribing → detecting → planning_broll → rendering_preview →
ready_for_review → rendering_final → done` (or `failed`). Each job is
idempotent, retries 3× with exponential backoff, and publishes progress to
Redis for the SSE stream at `/api/projects/:id/events`.

## The B-Roll engine (`packages/broll`)

Pure and framework-free so it can be tested in isolation (`pnpm test:broll`).
All I/O (LLM, embeddings, stock search, cache) is injected via `BrollEngineDeps`.

1. **segment** — word-level transcript → 3–8s "thought" blocks
2. **candidates** — Claude decides which blocks get B-roll (max 1 / 8s)
3. **search** — Pexels + Pixabay, filtered by required duration
4. **rank** — embed + cosine similarity, with a diversity filter per clip
5. **plan** — overlay style + density cap (≤40% coverage)

Tested: unit (segmentation, ranking, diversity, density), integration with
mocked deps, and 5 reference-transcript snapshots.

## Implementation status

Built and verified:

- Full monorepo tooling (pnpm/turbo/biome/vitest), Docker Compose, env.
- `packages/shared`, `db` (Drizzle + pgvector + credits), `queue`, `ai`,
  `ffmpeg`, `storage`, `ui`.
- **`packages/broll` — complete, 35 passing tests.**
- All four workers wired end-to-end through the pipeline.
- tRPC API (`uploads`, `projects`, `clips`, `broll`, `renders`, `billing`),
  SSE progress, Clerk middleware + webhook, dashboard / upload / progress /
  editor pages.

Stubbed / next steps (flagged inline with `TODO`):

- Render **compositing**: overlaying B-roll inserts + burning captions
  (Remotion). `worker-render` currently exports the base crop.
- **Stripe** Checkout / Portal / webhook fulfilment.
- **ai-py** Whisper + embedding model loading.
- Editor **timeline + Remotion player** (the B-roll plan UI is real).
- Caption presets beyond the data model; auto-zoom; silence-cut at render.
