# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A monorepo (npm workspaces) bundling several related projects under one
roof. The flagship app is the transcription Mini App; the others are
support services and a legacy static site kept for reference.

```
/
├── apps/
│   ├── transcribe/    # Next.js 14 app + Telegram Mini App (the flagship)
│   ├── ytdlp/         # FastAPI + yt-dlp companion microservice
│   └── ai-office/     # legacy static "AI Business Command Center" site
├── packages/          # reserved for shared code (empty)
├── db/                # init.sql (Postgres bootstrap) + optional seed
├── docs/              # human-facing docs
├── Caddyfile          # reverse proxy + auto-HTTPS
├── docker-compose.yml # caddy + transcribe + ytdlp + ai-office + postgres
└── DEPLOY.md          # deployment guide
```

Only `apps/transcribe` is a node workspace; `apps/ytdlp` is Python and
`apps/ai-office` is static HTML. Root `package.json` lists workspaces and
proxies `dev/build/start/lint` to `apps/transcribe`.

**Hosting: self-hosted on a single VPS via Docker Compose.** No Vercel,
no Supabase. The Telegram Mini App entry point is `https://<DOMAIN>/transcribe`,
served by the `transcribe` container behind Caddy. Postgres (with the
`pgvector` extension) lives in the same compose, persisted via a named
volume. See `DEPLOY.md` for the full setup. The transcribe app is a
single-purpose web app for transcribing video / audio links and turning
the transcript into short-form content (carousel slides, Reels script,
Telegram post).

## Commands

Run from the repo root (npm workspaces proxies into `apps/transcribe`):

```bash
npm run dev      # Next.js dev server (default :3000)
npm run build    # production build
npm start        # serve the production build
npm run lint     # next lint
```

You can also `cd apps/transcribe && npm run …` directly. No test runner is
configured.

## Required environment variables

`docker compose` reads `.env` at the repo root. The app degrades
gracefully when keys are missing (history / generation just no-op).
See `.env.example` for the full list. Highlights:

- `DOMAIN` — your apex, used by Caddy for auto-HTTPS (`example.com`).
- `POSTGRES_PASSWORD` — used by the postgres container and embedded
  into `DATABASE_URL` for the transcribe app.
- `DATABASE_URL` — points the app at Postgres. Set automatically inside
  the compose file to `postgres://app:$POSTGRES_PASSWORD@postgres:5432/app`;
  override only if you run the app outside docker compose.
- `ANTHROPIC_API_KEY` — needed for summarize / translate / generate / me-chat.
- `DEEPGRAM_API_KEY` — needed for non-YouTube transcription paths.
- `OPENAI_API_KEY` — needed for `/me` document embeddings.
- `YTDLP_SERVICE_URL` — wired to `http://ytdlp:8000` inside compose.
- `YTDLP_SERVICE_API_KEY` (optional) — shared secret between
  `transcribe` and `ytdlp` containers.

## Postgres schema

`db/init.sql` is the single source of truth. The postgres container
mounts it at `/docker-entrypoint-initdb.d/` and runs it once when the
data volume is empty. It creates `pgcrypto` + `vector` extensions and
all five tables: `transcripts`, `tasks`, `me_profile`, `me_documents`,
`me_chunks`. All `create table` statements are guarded with
`if not exists` so the script can be re-run safely on an existing DB:
`docker compose exec -T postgres psql -U app -d app < db/init.sql`.

`db/seed_initial_tasks.sql` is an optional one-shot seed for the
`/admin` board. Idempotent via `WHERE NOT EXISTS`.

DB access goes through `apps/transcribe/src/lib/db.ts` which wraps the
[`postgres`](https://github.com/porsager/postgres) package. When
`DATABASE_URL` is missing, `getDb()` returns `null` and saves/history
just no-op — same graceful-degradation pattern as before.

## Architecture

Next.js 14 App Router + React 18 + TypeScript + Tailwind (all inside
`apps/transcribe/`). UI strings are Russian; comments/identifiers stay
English. Path alias `@/* → apps/transcribe/src/*`
(`apps/transcribe/tsconfig.json`). Dark mode is forced at
`<html className="dark">`.

**Routing**: `apps/transcribe/src/app/page.tsx` redirects `/` → `/transcribe`. The
transcribe page has its own layout (`apps/transcribe/src/app/transcribe/layout.tsx`)
providing a mobile-first centered container (max-w-2xl) — there is no
sidebar. Everything is one page.

`/admin` is a separate route group with its own wider layout
(`apps/transcribe/src/app/admin/layout.tsx`, max-w-7xl) — kanban project board.
Protected by HTTP Basic Auth via `apps/transcribe/src/middleware.ts`
(reads `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars). The middleware
also gates `/me`, `/assistants`, and their data-plane APIs
(`/api/tasks`, `/api/me`, `/api/assistants`). `/transcribe` and
`/api/transcribe/*` stay open so the Telegram Mini App works for
anonymous users. When `ADMIN_PASSWORD` is empty, every private path
returns 401 — fail-secure default.

**The flow** (`apps/transcribe/src/app/transcribe/page.tsx`):
1. Mount → calls `loadHistory()` and `setInTg(isInTelegram())`.
2. User pastes a URL + picks a language → submits.
3. `POST /api/transcribe` returns transcript + paragraphs + metadata. Row is
   inserted into `transcripts` if Postgres is configured.
4. User can then trigger: Copy / .txt / .srt download / Summary / Translate
   / Carousel / Reels-new / Reels-remix / TG-post. Each generation calls a
   dedicated endpoint and gets cached on the same row.

**API routes**:
- `POST /api/transcribe` — body `{ url, language: 'auto'|'ru'|'en' }`. The
  `dispatch()` function routes by URL type:
  - **YouTube** → our captions parser (`src/lib/youtube-captions.ts`). On
    any failure (no subs / IP block / wrong language) and when
    `YTDLP_SERVICE_URL` is set, falls back to **yt-dlp + Deepgram**.
  - **Social URLs** (Instagram, TikTok, X, Vimeo, SoundCloud — see
    `isSocialMediaUrl()` in `src/lib/ytdlp-client.ts`) → always **yt-dlp +
    Deepgram**. Without `YTDLP_SERVICE_URL` returns 503.
  - **Anything else** → Deepgram `nova-2` directly, URL passed by reference.
  Returns `{ transcript, paragraphs: [{text,start,end}], duration,
  detectedLanguage, source: 'youtube'|'deepgram'|'ytdlp+deepgram', id }`.
  **Known issue**: YouTube actively rate-limits datacenter IPs — that's
  why the yt-dlp fallback exists. For Instagram and most YouTube traffic
  cookies are required (see `apps/ytdlp/README.md`; mount them as
  `INSTAGRAM_COOKIES_B64` / `COOKIES_B64` env vars in `.env`).
- `POST /api/transcribe/summarize` — body `{ id?, transcript? }`. Returns
  `{ summary, bullets, cached }`. Caches on the row.
- `POST /api/transcribe/translate` — body `{ id?, transcript?,
  targetLang: 'ru'|'en' }`. Returns `{ translation, lang, cached }`.
- `POST /api/transcribe/generate` — body `{ id?, transcript?, type:
  'carousel'|'reels-new'|'reels-remix'|'tg-post' }`. Sends a structured
  Russian prompt to Claude Haiku and returns `{ type, content, cached }`.
  Content shape varies (slides array for carousel; hook/body/cta object
  for reels; `{ text }` for tg-post). Cached in `transcripts.generations`
  jsonb keyed by type. Prompts live inline in `buildPrompt()`.
- `GET /api/transcribe/history` — last 20 rows. Returns
  `{ items, configured: boolean }`.
- `GET|DELETE /api/transcribe/history/[id]` — one row.
- `GET /api/tasks?project=transcribe` — list tasks for `/admin` board.
  Optional `project` query param filters server-side. Returns
  `{ items, configured }`.
- `POST /api/tasks` — create task. Body `{ title, description?, status?,
  priority?, stage?, project? }`. `project` defaults to `'general'`.
- `PATCH /api/tasks/[id]` — update fields (including `project`).
  `DELETE /api/tasks/[id]` removes.

## Telegram Mini App

The app loads `telegram-web-app.js` in `apps/transcribe/src/app/layout.tsx`. On mount,
`src/components/TelegramInit.tsx` calls `tg.ready()` + `tg.expand()` and
mirrors `themeParams` to CSS variables on `<html>`. The transcribe page:

- Detects Telegram on mount via `isInTelegram()` (`initData` non-empty)
- Hides its in-page submit button and binds `Telegram.WebApp.MainButton` to
  the same submit handler. The MainButton's text, enabled state, and
  progress spinner are kept in sync via a `useEffect`.
- Fires `HapticFeedback` on submit start, success, and error.

Outside Telegram everything still works — the SDK calls are guarded by
`getTelegram()` returning `null`.

See `docs/TELEGRAM_MINI_APP.md` for BotFather setup steps. Server-side
verification of `initData` against `TELEGRAM_BOT_TOKEN` is not yet
implemented — every API route is open.

## yt-dlp companion service

`apps/ytdlp/` — FastAPI + yt-dlp Docker service. Runs alongside the main
app inside `docker-compose.yml` and is reachable from the transcribe
container as `http://ytdlp:8000`. Exposes `POST /extract { url }` →
`{ url, title, duration, ext, extractor }`, where `url` is a signed
direct media URL Deepgram can ingest. Auth via
`Authorization: Bearer $YTDLP_SERVICE_API_KEY`. Cookies for Instagram /
YouTube can be provided as base64 in `INSTAGRAM_COOKIES_B64` / `COOKIES_B64`
(both names accepted) — see `apps/ytdlp/README.md`.

## Conventions

- Client-only React components must start with `'use client'`. Route
  handlers and `apps/transcribe/src/lib/db.ts` do not.
- Icons come from `lucide-react`. No emojis in UI; they are user-facing
  decoration only and we don't have any in the current app.
- `apps/transcribe/next.config.js` sets `output: 'standalone'` for the
  Docker build — don't remove it.
- Production model is `claude-haiku-4-5-20251001` across all routes.
