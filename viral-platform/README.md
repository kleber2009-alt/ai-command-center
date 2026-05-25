# Viral Platform

AI platform that turns long videos into viral short-form clips (Reels / TikTok /
Shorts). The headline feature is the **AI B-Roll Engine** (`packages/broll`),
which runs in three modes — **🌐 Auto Stock**, **📚 My Library**, **🔀 Hybrid**.
The library mode (the user's own indexed media) is the key differentiator; every
other module exists to serve the engine.

This is a self-contained pnpm + Turborepo monorepo. It was scaffolded from the
spec in [`CLAUDE.md`](./CLAUDE.md).

## Layout

```
apps/
  web/                 Next.js 15 — UI, tRPC API, SSE progress, Clerk auth, /library
  worker-transcribe/   BullMQ worker — audio extract + Deepgram
  worker-detect/       BullMQ worker — Claude clip detection
  worker-broll/        BullMQ worker — ⭐ runs the 3-mode B-roll engine
  worker-library/      BullMQ worker — index user assets (FFprobe + Gemini + embed)
  worker-render/       BullMQ worker — FFmpeg export (9:16 / 1:1 / 16:9)
  ai-py/               FastAPI — Whisper / embeddings fallbacks
packages/
  shared/    types, zod schemas, constants, prompts, cosine
  db/        Drizzle schema + client + credits/pipeline/library helpers (pgvector)
  queue/     BullMQ wrappers, typed jobs, Redis progress pub/sub, cache
  ai/        Claude / OpenAI-embeddings / Deepgram / Gemini-vision / Pexels / Pixabay
  broll/     ⭐ the 5-step, 3-mode B-roll engine — pure, dependency-injected, tested
  ffmpeg/    direct ffmpeg/ffprobe wrappers (extract, probe, frames, silence, export)
  storage/   Cloudflare R2 (S3) — video + library buckets, presign + get/put
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
All I/O (LLM, embeddings, stock search, **library pgvector search**, cache) is
injected via `BrollEngineDeps`.

1. **segment** — word-level transcript → 3–8s "thought" blocks
2. **candidates** — Claude decides which blocks get B-roll (max 1 / 8s)
3. **source** (mode-aware):
   - `auto_stock` — Pexels + Pixabay
   - `my_library` — pgvector search over the user's library; flags
     low-confidence when <3 assets clear the similarity bar
   - `hybrid` — library first; if <3 confident hits, add stock with a +0.15
     score bonus to library candidates
4. **rank** — embed + cosine similarity (hybrid bonus), diversity filter per clip
5. **plan** — overlay style + density cap (≤40% coverage)

Tested: unit (segmentation, ranking, diversity, density), mode integration
(my_library / hybrid behaviour), and 5 reference transcripts × 3 modes = 15
snapshots. 53 tests total.

## My Library (§4.4)

Users upload their own video/images into named **collections**. A background
`worker-library` job indexes each asset: FFprobe metadata → thumbnail →
3-frame **Gemini 2.0 Flash** vision tagging → `text-embedding-3-large` →
pgvector (`user_assets.embedding`, HNSW). The `library.*` tRPC router (11
endpoints) covers collections, resumable upload, semantic search, tagging,
move, and soft-delete. Per-plan asset/storage limits and `file_hash` dedup are
enforced. Assets live in a separate R2 bucket (`R2_BUCKET_LIBRARY`).

## Implementation status

Built and verified:

- Full monorepo tooling (pnpm/turbo/biome/vitest), Docker Compose, env.
- `packages/shared`, `db` (Drizzle + pgvector + credits + library search),
  `queue`, `ai`, `ffmpeg`, `storage`, `ui`.
- **`packages/broll` — complete with all three modes, 53 passing tests.**
- All five workers wired end-to-end (transcribe → detect → broll → render,
  plus library indexing).
- tRPC API (`uploads`, `projects`, `clips`, `broll`, `library`, `renders`,
  `billing`), SSE progress, Clerk middleware + webhook, dashboard / upload /
  progress / editor (with mode switcher + source badges) / `/library` pages.

Stubbed / next steps (flagged inline with `TODO`):

- Render **compositing**: overlaying B-roll inserts (stock + library) + burning
  captions (Remotion). `worker-render` currently exports the base crop.
- **Stripe** Checkout / Portal / webhook fulfilment + downgrade limit checks.
- **ai-py** Whisper + embedding model loading.
- Editor **timeline + Remotion player** and the replace-asset modal
  (the B-roll plan UI, mode switcher, and library/stock search APIs are real).
- Caption presets beyond the data model; auto-zoom; silence-cut at render.
