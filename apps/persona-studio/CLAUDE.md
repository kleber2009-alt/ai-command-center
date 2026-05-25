# persona-studio — CLAUDE.md

AI Avatar Content Studio — 1 photo → 10 AI-avatars → HeyGen video or
viral carousel cover.

Next.js 15 App Router + TS + Tailwind + Prisma (Postgres) + BullMQ (Redis)
+ S3-compatible storage + Gemini Image API (Nano Banana 2).

Source-of-truth doc: `README.md` in this folder. Treat it as authoritative
for architecture, local setup, schema, and worker flow. This file is the
«what to read first» pointer + critical invariants.

## Commands

From repo root (npm workspaces):
```bash
npm run persona:dev          # web :3000 (or whatever PORT)
npm run persona:build && npm run persona:start
npm run persona:typecheck
npm run persona:worker:avatar    # avatar generation worker
npm run persona:worker:cover     # cover generation worker
```

Or from this app:
```bash
cd apps/persona-studio
pnpm install      # or npm install
pnpm db:push      # apply prisma schema
pnpm dev
```

## Stack

- Next.js 15 + App Router (uses route groups `(app)/`, `(auth)/`)
- Prisma + Postgres (can reuse `aisales-postgres`, db `persona_studio`)
- BullMQ + Redis (`aisales-redis`)
- S3 (MinIO `aisales-minio`, bucket `persona-studio-media` — local dev or own)
- Gemini Image API (`src/lib/gemini.ts`)
- NextAuth v5 + Nodemailer (magic-link via mailpit `:1025` in dev)
- Tailwind + shadcn/ui-style components

## Worker dispatch

Queues (all started together via `pnpm worker` / `pnpm worker:prod` — they share the same Prisma client and queue config as the web process):
- **avatar-generation** (`src/workers/avatar-generation.worker.ts`) — per upload, batch of N avatar styles, Gemini calls in parallel with concurrency cap.
- **cover-generation** (`src/workers/cover-generation.worker.ts`) — single cover per request with live preview.
- **heygen-video** / **omnihuman-video** — video render.
- **submagic-edit** (`src/workers/submagic-edit.worker.ts`) — отправляет готовое `VideoGeneration.videoUrl` в Submagic, ждёт рендер, заливает результат в MinIO в `VideoEdit.resultUrl`. Pipeline-шаг 4: Photo → Avatars → Video → **Montage**.

## Tokens — critical

Token balance changes go through `src/lib/tokens.ts` (`charge` / `refund` / `credit`), wrapped in a Prisma transaction. Don't update the user row's balance column directly anywhere else.

## Schema highlights (`prisma/schema.prisma`)

`User`, `Upload`, `AvatarGeneration`, `Avatar`, `Cover`, `VideoGeneration`, `VideoEdit` (Submagic-монтаж готового видео), `TokenTransaction`. Forward-only migrations via `prisma migrate`.

## Env

`.env.example` lists every key. Critical: `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`/`S3_BUCKET`/`S3_*`, `GEMINI_API_KEY`, `AUTH_SECRET` (`openssl rand -base64 32`). Optional: `SUBMAGIC_API_KEY` (без него `/edits` создание упадёт с `SUBMAGIC_NO_API_KEY`), `COST_SUBMAGIC_EDIT` (default 15).

## Deploy

`Dockerfile` (web) + `Dockerfile.worker` (worker). `docker-compose.yml` + `docker-compose.dev.yml` ship both. CI: `.github/workflows/deploy-persona-studio.yml` + `deploy-persona-landing.yml`.

## Landing

`/landings/persona-studio/` (static).
