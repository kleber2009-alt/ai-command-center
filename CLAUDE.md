# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A single-purpose web app and Telegram Mini App with three surfaces:

- **/transcribe** — paste a video / audio link → transcript + summary / translation / carousel / Reels / Telegram-post generation.
- **/assistants** — a list of 9 specialized AI assistants, each with its own system prompt and chat window.
- **/me** — personal "second brain": structured profile + RAG-backed chat over a private library of pasted text and uploaded files.

The repo previously hosted an "AI Business Command Center" dashboard with
agent simulators. All of that was stripped — only the surfaces above remain.

## Hosting

**Self-hosted via Docker Compose.** There is no Vercel / Supabase / managed
DB. Run `docker compose up -d --build` on your VPS (or anywhere with Docker).
Three containers: the Next.js app, the yt-dlp Python service, and Caddy as
reverse proxy + automatic TLS. See `docker-compose.yml`, `Dockerfile`,
`Caddyfile`, `.env.example`.

The database is **SQLite + sqlite-vec** in `./data/app.db`. The schema is
embedded in `src/lib/db.ts` and auto-created on first start. Back up the DB
with `cp` or `rsync` from the `./data` volume.

## Commands

Local dev (the Next.js process talks directly to a SQLite file at
`$DB_PATH` or `./data/app.db`):

```bash
npm run dev      # Next.js dev server (default :3000)
npm run build    # production build
npm start        # serve the production build
npm run lint     # next lint
```

Docker (full stack, the way production runs):

```bash
docker compose up -d --build         # build + start app, ytdlp, caddy
docker compose logs -f app           # tail Next.js logs
docker compose down                  # stop everything (data volume persists)
```

No test runner is configured.

## Environment variables

Set in `.env` next to `docker-compose.yml` (production) or `.env.local` (local
dev). All routes degrade gracefully when keys are missing.

- `ANTHROPIC_API_KEY` — used by every chat / summarize / translate / generate route.
- `OPENAI_API_KEY` — required for the `/me` library: embedding documents via
  `text-embedding-3-small` (1536d). Without it, `/me/library` can't ingest
  new docs and `/me/chat` falls back to profile-only context.
- `DEEPGRAM_API_KEY` — used by `/api/transcribe` for any non-YouTube URL.
- `DB_PATH` — SQLite file path. Defaults to `./data/app.db`. In the Docker
  image it's set to `/app/data/app.db` (volume-mounted from `./data`).
- `YTDLP_SERVICE_URL` — base URL of the companion yt-dlp service. In
  docker-compose this is wired to `http://ytdlp:8000` automatically.
- `YTDLP_SERVICE_API_KEY` — bearer token shared between the app and the
  yt-dlp service.
- `DOMAIN` — Caddy serves on this domain. Real domain for prod (auto
  Let's Encrypt); `localhost` for local Docker testing.

## Architecture

Next.js 14 App Router + React 18 + TypeScript + Tailwind. UI strings are
Russian; comments / identifiers stay English. Path alias `@/* → src/*`
(`tsconfig.json`). Light Apple-style theme: white surfaces, system font,
`#0071e3` accent.

**Routing**:

- `/` redirects to `/transcribe`.
- `/transcribe` — transcription + content generation.
- `/assistants` and `/assistants/[id]` — 9 specialized assistants.
- `/me`, `/me/profile`, `/me/library` — second brain.

**Data layer** (`src/lib/db.ts`):

- Process-wide `better-sqlite3` connection with `journal_mode=WAL`,
  `foreign_keys=ON`. Schema is auto-applied on first import.
- Vector search via `sqlite-vec`: `vec_me_chunks` virtual table keyed by
  `me_chunks.id`. Cosine distance returned, similarity = `1 - distance`.
- Embeddings stored as `Float32Array` blobs.

**Tables**:

- `transcripts` — every successful `/api/transcribe` run, with JSON columns
  for paragraphs / bullets / translation / generations.
- `me_profile` — single-row (id='singleton') structured profile.
- `me_documents` — library entries with `original_text` + metadata.
- `me_chunks` — chunks of documents; embeddings referenced by id from
  `vec_me_chunks`.

**Streaming chat**:

- Both `/api/me/chat` and `/api/assistants/chat` return NDJSON streams via
  `streamAnthropic()` in `src/lib/anthropic-stream.ts`. The client reads
  them with `readNdjson()` from `src/lib/stream-client.ts`.
- The `/me/chat` stream's first event carries retrieved citations.

**API routes**:

- `POST /api/transcribe` — body `{ url, language }`. Routes by URL type:
  YouTube → captions (with yt-dlp+Deepgram fallback), social URLs → yt-dlp
  + Deepgram, anything else → Deepgram directly.
- `POST /api/transcribe/summarize` / `translate` / `generate` — cache
  results in the transcript row.
- `GET /api/transcribe/history`, `GET|DELETE /api/transcribe/history/[id]`.
- `GET|PUT /api/me/profile`.
- `GET|POST /api/me/documents` — `POST` accepts JSON `{title, text}` or
  multipart with a file (.txt / .md / .csv / .json / .pdf / .docx).
- `GET|DELETE /api/me/documents/[id]`.
- `POST /api/me/chat` — RAG; streams NDJSON with `meta` citations event.
- `POST /api/assistants/chat` — streams NDJSON.

## Telegram Mini App

The app loads `telegram-web-app.js` in `src/app/layout.tsx`. On mount,
`src/components/TelegramInit.tsx` calls `tg.ready()` + `tg.expand()` and
mirrors `themeParams` to CSS variables on `<html>`. The transcribe page:

- Detects Telegram on mount via `isInTelegram()` (`initData` non-empty).
- Hides its in-page submit button and binds `Telegram.WebApp.MainButton` to
  the same submit handler.
- Fires `HapticFeedback` on submit start, success, and error.

Outside Telegram everything still works — the SDK calls are guarded by
`getTelegram()` returning `null`.

See `docs/TELEGRAM_MINI_APP.md` for BotFather setup steps. Server-side
verification of `initData` against `TELEGRAM_BOT_TOKEN` is not yet
implemented — every API route is open.

## yt-dlp companion service

`services/ytdlp/` — FastAPI + yt-dlp Docker service. Exposes
`POST /extract { url }` → `{ url, title, duration, ext, extractor }`,
where `url` is a signed direct media URL Deepgram can ingest. Auth via
`Authorization: Bearer $YTDLP_SERVICE_API_KEY`. Cookies for Instagram /
YouTube can be provided as base64 in `INSTAGRAM_COOKIES_B64` /
`COOKIES_B64` — see `services/ytdlp/README.md`. Wired into the same Docker
network in `docker-compose.yml`, so the app reaches it at
`http://ytdlp:8000`.

## Conventions

- Client-only React components must start with `'use client'`. Route
  handlers and `src/lib/*` do not.
- Icons come from `lucide-react`. No emojis in UI.
- `next.config.js` has `output: 'standalone'` (for Docker) and marks
  `better-sqlite3`, `sqlite-vec`, `pdf-parse`, `mammoth` as external so
  webpack doesn't try to bundle their native bits.
- Production models: `claude-haiku-4-5-20251001` for the transcribe
  generators, `claude-sonnet-4-6` for the chat endpoints.
