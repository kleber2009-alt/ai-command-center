# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this repo is

Two apps + a yt-dlp microservice running side by side on a single VPS
(Hetzner). The whole stack is self-hosted via `docker-compose.yml` in the
repo root: no Vercel, no Netlify, no Supabase.

| App | Purpose | Path |
|---|---|---|
| **ai-office** | Static marketing site for "AI Growth Office" + a few API proxies (Anthropic chat, Telegram notify, ElevenLabs voice). | `ai-office-project/` |
| **transcribe** | Next.js 14 app: video/audio transcription + content generation (carousel / Reels / TG post) + personal "second brain" (`/me`). Telegram Mini App entry at `/transcribe`. | repo root, `src/` |
| **ytdlp** | FastAPI wrapper around `yt-dlp` returning a direct audio URL for Deepgram. | `services/ytdlp/` |

A reverse proxy (`deploy/nginx.conf`) routes:

- `/transcribe`, `/me`, `/assistants`, `/api/transcribe/*`, `/api/tasks/*`, `/api/me/*`, `/_next/*`, `/board` → **transcribe**
- `/api/chat`, `/api/notify-tg`, `/api/voice-*` → **ai-office**
- `/files/voice-notes/*` and the rest of the static site → **ai-office**

Path-based routing was chosen so both apps share one IP on port 80
without a domain. When a domain arrives, swap the dockerised nginx for a
host-level one + certbot (instructions in `DEPLOY.md`).

## Commands

```bash
# Whole stack (Postgres + ai-office + transcribe + ytdlp + nginx)
docker compose up -d --build
docker compose logs -f --tail=50
docker compose down

# Just the Next.js app, locally
npm run dev      # next dev :3000
npm run build    # production build (output: standalone)
npm start        # serve the standalone build
npm run lint     # next lint
```

No test runner is configured.

## Environment

Every secret lives in `.env` at the repo root, sourced by `docker compose`
via `env_file`. Template in `.env.example`. The stack degrades gracefully
when keys are missing — the affected `/api/*` returns 503 with a clear
message, the rest of the site keeps working.

Required for full functionality:

- `POSTGRES_PASSWORD` — admin password for the Postgres container.
- `ANTHROPIC_API_KEY` — used by `/api/chat`, `/api/transcribe/summarize`,
  `/translate`, `/generate`, `/api/me/chat`.
- `DEEPGRAM_API_KEY` — used by `/api/transcribe` for any non-YouTube URL.
- `OPENAI_API_KEY` — embeddings (`text-embedding-3-small`) for the
  `/me/library` RAG flow. Optional — without it `/me/chat` falls back to
  profile-only context.
- `ELEVENLABS_API_KEY` — voice clone + TTS (`/api/voice-*`).
- `TG_BOT_TOKEN` + `TELEGRAM_BOT_TOKEN` + `TG_CHAT_ID` — Telegram
  notifications + Mini App verification.

Optional:

- `COOKIES_B64` / `INSTAGRAM_COOKIES_B64` — Netscape `cookies.txt`
  base64-encoded, used by the `ytdlp` service for Instagram / age-gated
  YouTube.
- `YTDLP_SERVICE_API_KEY` — bearer token between transcribe and ytdlp.

Inside compose, the apps reach Postgres at `postgres:5432` and yt-dlp at
`http://ytdlp:8080` — these names are hard-wired into the compose file,
no need to set them in `.env`.

## Database

`db/init/01_schema.sql` is a single bootstrap script that
`pgvector/pgvector:pg16` applies on first container start (mounted at
`/docker-entrypoint-initdb.d`). It creates:

- `transcripts` (`id`, `url`, `title`, `source`, `language`, `duration`,
  `transcript`, `paragraphs jsonb`, `summary`, `bullets jsonb`,
  `translation jsonb`, `generations jsonb`)
- `tasks` (kanban board, `id`, `status`, `priority`, `position`,
  auto-updated `updated_at` via trigger)
- `me_profile` (singleton row `id='singleton'`)
- `me_documents` (RAG source documents)
- `me_chunks` (RAG chunks with `embedding vector(1536)` and an IVFFlat
  cosine index) + the `match_me_chunks(query_embedding, match_count)`
  function used by `/api/me/chat`.
- `voices`, `voice_generations` (ai-office voice-clone / voice-generate
  records).

`db/seeds/tasks.sql` is an optional one-shot seed for the `/admin` /
`/board` backlog. Idempotent via `WHERE NOT EXISTS`.

## Architecture (Next.js side)

Next.js 14 App Router + React 18 + TypeScript + Tailwind. UI strings are
Russian; comments/identifiers stay English. Path alias `@/* → src/*`
(`tsconfig.json`). Dark mode is forced on most pages.

The transcribe page has its own mobile-first centered layout
(`src/app/transcribe/layout.tsx`, max-w-2xl). The `/admin` route (kanban
board) has a wider layout (`src/app/admin/layout.tsx`, max-w-7xl). The
`/me` route group hosts the second-brain pages
(`/me`, `/me/profile`, `/me/library`).

`src/lib/db.ts` exposes a singleton `pg.Pool` plus helpers (`query()`,
`withClient()`, `isConfigured()`, `toVectorLiteral()`). Every route
handler that needs the database uses these — there is no Supabase
client anymore.

### API routes (all under transcribe)

- `POST /api/transcribe` — body `{ url, language }`. Dispatches by URL
  type:
  - YouTube → our captions parser (`src/lib/youtube-captions.ts`). On
    failure (no subs / IP block / wrong language) falls back to **yt-dlp
    + Deepgram** via the `ytdlp` service.
  - Social URLs (Instagram, TikTok, X, Vimeo, SoundCloud — see
    `isSocialMediaUrl()` in `src/lib/ytdlp-client.ts`) → always **yt-dlp
    + Deepgram**.
  - Anything else → Deepgram `nova-2` directly.
  Inserts the result into `transcripts` and returns `{ transcript,
  paragraphs, duration, detectedLanguage, source, id }`.
- `POST /api/transcribe/summarize` — Anthropic → `{ summary, bullets }`,
  cached on the row.
- `POST /api/transcribe/translate` — body `{ id?, transcript?, targetLang }`,
  cached on the row.
- `POST /api/transcribe/generate` — body `{ id?, transcript?, type }`
  for carousel / reels-new / reels-remix / tg-post. Merges into the
  `generations` jsonb column via `jsonb_build_object || existing`.
- `GET /api/transcribe/history` — last 30 rows with artifact flags.
- `GET|DELETE /api/transcribe/history/[id]`.
- `GET|POST /api/tasks`, `PATCH|DELETE /api/tasks/[id]` — kanban
  CRUD. PATCH uses a strict whitelist + parameterised SET clause.
- `GET|PUT /api/me/profile` — `me_profile` singleton row.
- `GET|POST /api/me/documents` — upload / paste → chunk → embed → save.
  Insert is transactional: document + bulk chunk insert in one
  transaction, rollback on any failure.
- `GET|DELETE /api/me/documents/[id]` — cascades to `me_chunks` via FK.
- `POST /api/me/chat` — retrieves top-K chunks via the `match_me_chunks`
  RPC, streams the answer from Anthropic.

### API routes (ai-office Netlify functions)

These predate the migration and still use the "Web Request / Response"
handler style; the self-hosted Node server
(`ai-office-project/server/index.js`) adapts Node `IncomingMessage` →
`Request` and `Response` → `ServerResponse` so they run unchanged.

- `POST /api/chat` — proxies to Anthropic Messages, in-memory rate-limit
  10 req/min/IP, streams response.
- `POST /api/notify-tg` — proxies to Telegram Bot API.
- `POST /api/voice-clone` — uploads samples to ElevenLabs, inserts a row
  into `voices`, archives the previous active row for the same owner.
- `POST /api/voice-generate` — TTS via ElevenLabs, writes the mp3 to
  `/data/voice-notes/{owner}/{ts}.mp3` (Docker volume), logs into
  `voice_generations`, returns the public URL `/files/voice-notes/...`.
- `GET /api/voice-list?owner=...` — current + archived voices for an
  owner.

The ai-office server also serves `/files/voice-notes/*` from the volume
with a traversal guard.

## Telegram Mini App

The Next.js app loads `telegram-web-app.js` in `src/app/layout.tsx`.
`src/components/TelegramInit.tsx` calls `tg.ready()` + `tg.expand()` and
mirrors `themeParams` to CSS variables on `<html>`. The transcribe page:

- Detects Telegram on mount via `isInTelegram()` (`initData` non-empty).
- Hides its in-page submit button and binds
  `Telegram.WebApp.MainButton` to the same submit handler.
- Fires `HapticFeedback` on submit start, success, and error.

Outside Telegram everything still works — the SDK calls are guarded by
`getTelegram()` returning `null`.

Server-side verification of `initData` against `TELEGRAM_BOT_TOKEN` is
**not yet implemented** — every API route is open. Track in the
"Закрыть /admin от посторонних" task in the kanban.

## yt-dlp companion service

`services/ytdlp/` — FastAPI + yt-dlp Docker service. Exposes
`POST /extract { url }` → `{ url, title, duration, ext, extractor }`,
where `url` is a signed direct media URL Deepgram can ingest. Auth via
`Authorization: Bearer $YTDLP_SERVICE_API_KEY`. Cookies for Instagram /
YouTube can be provided as base64 in `INSTAGRAM_COOKIES_B64` /
`COOKIES_B64` — see `services/ytdlp/README.md`. In compose it runs as
the `ytdlp` service, only reachable via the internal docker network.

## Conventions

- Client-only React components must start with `'use client'`. Route
  handlers and `src/lib/db.ts` do not.
- Icons come from `lucide-react`. No emojis in UI; they are user-facing
  decoration only.
- `next.config.js` enables `output: 'standalone'` for the Docker
  multi-stage build. Don't add other config without checking the
  Dockerfile.
- Production model is `claude-haiku-4-5-20251001` for the cheap routes
  and `claude-sonnet-4-6` for the `/me/chat` second-brain.
- Migrations are not auto-applied at runtime — they go through
  `db/init/01_schema.sql`. To change the schema in production: edit the
  file, then
  `docker compose exec -T postgres psql -U ai -d ai < db/init/01_schema.sql`
  (idempotent — uses `IF NOT EXISTS` / `CREATE OR REPLACE`).
- All Supabase references in code are removed. If you see
  `getServerSupabase`, `@supabase/*`, `supabase.from(...)` — it is stale
  code that wasn't migrated; use `query()` / `withClient()` from
  `src/lib/db.ts` instead.
