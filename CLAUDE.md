# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A single-purpose web app and Telegram Mini App for transcribing video / audio
links and turning the transcript into short-form content (carousel slides,
Reels script, Telegram post). Hosted on Vercel; the Telegram Mini App entry
point is `/transcribe`.

The repo previously hosted an "AI Business Command Center" dashboard with
agent simulators. All of that was stripped — only the transcription pipeline
remains.

## Commands

```bash
npm run dev      # Next.js dev server (default :3000)
npm run build    # production build
npm start        # serve the production build
npm run lint     # next lint
```

No test runner is configured.

## Required environment variables

The app degrades gracefully when these are missing — set them in `.env.local`
for local dev and in Vercel/Railway project envs for prod:

- `ANTHROPIC_API_KEY` — used by `src/app/api/transcribe/summarize/route.ts`,
  `src/app/api/transcribe/translate/route.ts`, `src/app/api/transcribe/generate/route.ts`.
- `DEEPGRAM_API_KEY` — used by `src/app/api/transcribe/route.ts` for any
  non-YouTube URL. YouTube goes through our own captions parser and does
  **not** need this key on its own (yt-dlp fallback does feed Deepgram).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used by the
  browser client in `src/lib/supabase.ts`. Currently the browser client is
  only used by the page for typed types; nothing reads through it at runtime.
- `SUPABASE_SERVICE_KEY` — used by the `/api/transcribe*` routes through
  `src/lib/transcripts-db.ts`. Required for history and generation caching.
  Do **not** expose this to the client.
- `YTDLP_SERVICE_URL` (optional) — base URL of the companion yt-dlp
  microservice in `services/ytdlp/` (deploy on Railway). When set,
  `/api/transcribe` falls back to yt-dlp + Deepgram for YouTube when our
  captions parser is IP-blocked, and uses yt-dlp + Deepgram for Instagram
  Reels / TikTok / X.
- `YTDLP_SERVICE_API_KEY` (optional) — if the yt-dlp service is started with
  this env var, the main app must send `Authorization: Bearer <key>`.
- `APIFY_API_TOKEN` (optional) — when set, Instagram URLs are routed
  through Apify's `instagram-scraper` actor before yt-dlp. Isolates our
  IG account / IP from scraping; fallback chain is Apify → yt-dlp →
  error. Free tier covers ~12,500 reels/month.
- `ADMIN_BASIC_AUTH` (optional) — `user:password` to lock /admin and
  /api/tasks behind HTTP Basic Auth.
- `TELEGRAM_BOT_TOKEN` (optional) — when set, /api/transcribe and
  /api/me verify Telegram initData HMAC against this token.

## Supabase migrations

`supabase/migrations/` contains SQL the user runs manually in the Supabase
SQL Editor:
- `001_transcripts.sql` — `transcripts` table for `/transcribe` history.
- `002_generations.sql` — `generations jsonb` column for caching
  carousel / reels / telegram-post outputs.
- `003_tasks.sql` — `tasks` table for the project board at `/admin`.

`supabase/seed_initial_tasks.sql` (not under `migrations/`) is an optional
one-shot seed that populates the `/admin` board with the current project
backlog. Idempotent via `WHERE NOT EXISTS`.

Without these tables (or env vars), `getServerSupabase()` returns `null` and
saves/history/caching just no-op.

## Architecture

Next.js 14 App Router + React 18 + TypeScript + Tailwind. UI strings are
Russian; comments/identifiers stay English. Path alias `@/* → src/*`
(`tsconfig.json`). Dark mode is forced at `<html className="dark">`.

**Routing**: `src/app/page.tsx` redirects `/` → `/transcribe`. The
transcribe page has its own layout (`src/app/transcribe/layout.tsx`)
providing a mobile-first centered container (max-w-2xl) — there is no
sidebar. Everything is one page.

`/admin` is a separate route group with its own wider layout
(`src/app/admin/layout.tsx`, max-w-7xl) — kanban project board.
Currently NO auth — anyone with the URL can read/write tasks.
Track "Закрыть /admin от посторонних" task before public launch.

**The flow** (`src/app/transcribe/page.tsx`):
1. Mount → calls `loadHistory()` and `setInTg(isInTelegram())`.
2. User pastes a URL + picks a language → submits.
3. `POST /api/transcribe` returns transcript + paragraphs + metadata. Row is
   inserted into `transcripts` if Supabase is configured.
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
  **Known issue**: YouTube actively rate-limits datacenter IPs (Vercel
  included) — that's why the yt-dlp fallback exists. For Instagram and most
  YouTube on Railway, cookies are required (see `services/ytdlp/README.md`).
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
- `GET /api/tasks` — list all tasks for `/admin` board. Returns `{ items, configured }`.
- `POST /api/tasks` — create task. Body `{ title, description?, status?, priority?, stage? }`.
- `PATCH /api/tasks/[id]` — update fields. `DELETE /api/tasks/[id]` removes.

## Telegram Mini App

The app loads `telegram-web-app.js` in `src/app/layout.tsx`. On mount,
`src/components/TelegramInit.tsx` calls `tg.ready()` + `tg.expand()` and
mirrors `themeParams` to CSS variables on `<html>`. The transcribe page:

- Detects Telegram on mount via `isInTelegram()` (`initData` non-empty)
- Hides its in-page submit button and binds `Telegram.WebApp.MainButton` to
  the same submit handler. The MainButton's text, enabled state, and
  progress spinner are kept in sync via a `useEffect`.
- Fires `HapticFeedback` on submit start, success, and error.

Outside Telegram everything still works — the SDK calls are guarded by
`getTelegram()` returning `null`.

`TelegramInit` also drops the raw `initData` into a `tg_init_data` cookie
(non-httponly, SameSite=Lax) so server middleware can verify the
signature on every API call without us threading a header through
every fetch.

## Access control

Both layers are **opt-in** via env vars — when the env var isn't set,
the corresponding paths are open (keeps local dev frictionless).

- **`/admin` and `/api/tasks/*`** → HTTP Basic Auth gated by
  `ADMIN_BASIC_AUTH` (format `user:password`). Browser auto-prompts.
- **`/api/transcribe/*` and `/api/me/*`** → Telegram initData HMAC
  verified against `TELEGRAM_BOT_TOKEN`. Middleware reads initData
  from `X-Telegram-Init-Data` header or `tg_init_data` cookie.

Implementation lives in `src/middleware.ts` (Edge runtime) +
`src/lib/auth.ts` (Web Crypto SubtleCrypto, no `node:crypto`).
See `docs/TELEGRAM_MINI_APP.md` for BotFather setup.

## yt-dlp companion service

`services/ytdlp/` — FastAPI + yt-dlp Docker service to run on Railway.
Exposes `POST /extract { url }` → `{ url, title, duration, ext, extractor }`,
where `url` is a signed direct media URL Deepgram can ingest. Auth via
`Authorization: Bearer $YTDLP_SERVICE_API_KEY`. Cookies for Instagram /
YouTube can be provided as base64 in `INSTAGRAM_COOKIES_B64` / `COOKIES_B64`
(both names accepted) — see `services/ytdlp/README.md`.

## Conventions

- Client-only React components must start with `'use client'`. Route
  handlers and `src/lib/supabase.ts` do not.
- Icons come from `lucide-react`. No emojis in UI; they are user-facing
  decoration only and we don't have any in the current app.
- `next.config.js` is empty — no custom image domains, headers, or rewrites.
- Production model is `claude-haiku-4-5-20251001` across all routes.
