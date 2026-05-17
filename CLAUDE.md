# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A monorepo (npm workspaces) bundling several related projects under one
roof. The flagship app is the transcription Mini App; the others are
support services and a legacy static site kept for reference.

```
/
├── apps/
│   ├── transcribe/   # Next.js 14 app + Telegram Mini App (the flagship)
│   ├── tg-agent/     # Node.js Telegram group AI agent (Railway, long-polling)
│   ├── ytdlp/        # FastAPI + yt-dlp companion microservice (Railway)
│   └── ai-office/    # legacy static "AI Business Command Center" site
├── packages/         # reserved for shared code (empty)
├── supabase/         # SQL migrations shared across apps
└── docs/
```

`apps/transcribe` and `apps/tg-agent` are node workspaces; `apps/ytdlp`
is Python and `apps/ai-office` is static HTML. Root `package.json`
proxies `dev/build/start/lint` to `apps/transcribe` and exposes
`tg-agent:dev|build|start|typecheck` for the Telegram agent.

The transcribe app is a single-purpose web app and Telegram Mini App for
transcribing video / audio links and turning the transcript into short-form
content (carousel slides, Reels script, Telegram post). Hosted on Vercel;
the Telegram Mini App entry point is `/transcribe`. **On Vercel set the
project Root Directory to `apps/transcribe`** (since the layout moved).

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

The app degrades gracefully when these are missing — set them in `.env.local`
for local dev and in Vercel/Railway project envs for prod:

- `ANTHROPIC_API_KEY` — used by `apps/transcribe/src/app/api/transcribe/summarize/route.ts`,
  `apps/transcribe/src/app/api/transcribe/translate/route.ts`, `apps/transcribe/src/app/api/transcribe/generate/route.ts`.
- `DEEPGRAM_API_KEY` — used by `apps/transcribe/src/app/api/transcribe/route.ts` for any
  non-YouTube URL. YouTube goes through our own captions parser and does
  **not** need this key on its own (yt-dlp fallback does feed Deepgram).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used by the
  browser client in `apps/transcribe/src/lib/supabase.ts`. Currently the browser client is
  only used by the page for typed types; nothing reads through it at runtime.
- `SUPABASE_SERVICE_KEY` — used by the `/api/transcribe*` routes through
  `apps/transcribe/src/lib/transcripts-db.ts`. Required for history and generation caching.
  Do **not** expose this to the client.
- `YTDLP_SERVICE_URL` (optional) — base URL of the companion yt-dlp
  microservice in `apps/ytdlp/` (deploy on Railway). When set,
  `/api/transcribe` falls back to yt-dlp + Deepgram for YouTube when our
  captions parser is IP-blocked, and uses yt-dlp + Deepgram for Instagram
  Reels / TikTok / X.
- `YTDLP_SERVICE_API_KEY` (optional) — if the yt-dlp service is started with
  this env var, the main app must send `Authorization: Bearer <key>`.

## Supabase migrations

`supabase/migrations/` contains SQL the user runs manually in the Supabase
SQL Editor:
- `001_transcripts.sql` — `transcripts` table for `/transcribe` history.
- `002_generations.sql` — `generations jsonb` column for caching
  carousel / reels / telegram-post outputs.
- `003_tasks.sql` — `tasks` table for the project board at `/admin`.
- `003_me.sql` — `me_profile` / `me_notes` tables for the `/me` page.
- `004_tasks_project.sql` — adds `project text` column to `tasks` so the
  `/admin` board can split tasks per monorepo project
  (`transcribe` | `ytdlp` | `ai-office` | `general`, default `general`).

`supabase/seed_initial_tasks.sql` (not under `migrations/`) is an optional
one-shot seed that populates the `/admin` board with the current project
backlog. Idempotent via `WHERE NOT EXISTS`.

Without these tables (or env vars), `getServerSupabase()` returns `null` and
saves/history/caching just no-op.

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
Currently NO auth — anyone with the URL can read/write tasks.
Track "Закрыть /admin от посторонних" task before public launch.

**The flow** (`apps/transcribe/src/app/transcribe/page.tsx`):
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
  YouTube on Railway, cookies are required (see `apps/ytdlp/README.md`).
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

`apps/ytdlp/` — FastAPI + yt-dlp Docker service to run on Railway.
Exposes `POST /extract { url }` → `{ url, title, duration, ext, extractor }`,
where `url` is a signed direct media URL Deepgram can ingest. Auth via
`Authorization: Bearer $YTDLP_SERVICE_API_KEY`. Cookies for Instagram /
YouTube can be provided as base64 in `INSTAGRAM_COOKIES_B64` / `COOKIES_B64`
(both names accepted) — see `apps/ytdlp/README.md`.

## Telegram group AI agent (tg-agent)

`apps/tg-agent/` — Node.js + TypeScript service that joins Telegram
groups as a regular bot, reads every text message, classifies its
intent with Claude Haiku, generates replies in Ilya's tone-of-voice
when the decision engine says so, updates per-user lead status, and
DMs the owner on hot leads / owner mentions / low-confidence drafts.

Pipeline (`apps/tg-agent/src/bot.ts`):
`chats.touch → classifier → decision → leads.touchAndClassify →
[responder + ctx.reply] → messages.log → notifier.notifyOwner`.

- Transport: long-polling via [grammy](https://grammy.dev/). Deploy
  on Railway with **replicas = 1** — long-polling can't fan out.
- Classifier (`src/classifier.ts`): Claude Haiku 4.5 + tool-use,
  10 classes (`GENERAL_CHAT`, `QUESTION`, `PRODUCT_INTEREST`,
  `PRICE_REQUEST`, `OBJECTION`, `BUYING_INTENT`, `NEGATIVE`,
  `SUPPORT_REQUEST`, `OWNER_REQUEST`, `SPAM`).
- Decision engine (`src/decision.ts`): maps class → `Action`
  (`IGNORE`, `REPLY`, `REPLY_SOFT`, `REPLY_AND_NOTIFY`,
  `NOTIFY_ONLY`, `DRAFT_FOR_OWNER`). Safety: when
  `confidence < CONFIDENCE_THRESHOLD` (default 0.7), non-IGNORE
  actions drop to `DRAFT_FOR_OWNER` — except `GENERAL_CHAT` /
  `NEGATIVE` / `SPAM` which always stay `IGNORE`.
- Responder (`src/responder.ts`): Claude Haiku 4.5 with a per-class
  strategy (PRODUCT_INTEREST → soft funnel, OBJECTION → no-argument
  acknowledgment, BUYING_INTENT → concrete next step). Tone +
  strategies live in `src/prompts.ts`. The knowledge base
  (`src/knowledge/knowledge_base.md`, plain markdown) is embedded
  verbatim into the system prompt — the responder may only state
  facts from this file.
- CRM (`src/db/leads.ts`): per-(chat_id, user_id) status with a
  one-way commercial ranking `new → cold → warm → hot → buyer`.
  `negative` is sticky (manual override only). `SUPPORT_REQUEST`
  → `support` unless already `buyer`.
- Owner notifications (`src/notifier.ts`): bot DMs
  `OWNER_TELEGRAM_ID` when action is `REPLY_AND_NOTIFY` /
  `NOTIFY_ONLY` / `DRAFT_FOR_OWNER`. Owner must `/start` the bot
  first — Telegram blocks bot-initiated DMs to users who never
  wrote to the bot.
- Kill switch: per-chat `tg_chats.auto_reply` boolean — toggled
  from the `/admin/tg` panel. When OFF the bot still classifies
  and persists but does not reply and does not notify.
- Env (see `apps/tg-agent/.env.example`):
  `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `OWNER_TELEGRAM_ID`,
  `ALLOWED_CHAT_IDS`, `CONFIDENCE_THRESHOLD`, `LOG_LEVEL`,
  `CLASSIFIER_MODEL`, `RESPONDER_MODEL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_KEY`.
- Setup: in @BotFather run `/setprivacy → Disable` for the bot, or
  it will only see commands / mentions in groups. Run migration
  `supabase/migrations/005_tg_agent.sql`.


## Conventions

- Client-only React components must start with `'use client'`. Route
  handlers and `apps/transcribe/src/lib/supabase.ts` do not.
- Icons come from `lucide-react`. No emojis in UI; they are user-facing
  decoration only and we don't have any in the current app.
- `next.config.js` is empty — no custom image domains, headers, or rewrites.
- Production model is `claude-haiku-4-5-20251001` across all routes.
