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
│   ├── ai-sales/     # Multi-agent IG+TG sales system (FastAPI + Caddy on Hetzner)
│   └── ai-office/    # legacy static "AI Business Command Center" site
├── packages/         # reserved for shared code (empty)
├── supabase/         # SQL migrations shared across apps
└── docs/
```

`apps/transcribe` and `apps/tg-agent` are node workspaces; `apps/ytdlp`
and `apps/ai-sales/code` are Python; `apps/ai-office` and the
`apps/ai-sales` portal/dashboard prototype are static HTML. Root `package.json`
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
- `OPENAI_API_KEY` — required by `/api/me/documents` (POST) and `/api/me/chat`
  for `text-embedding-3-small`. Without it the `/me` library can't ingest
  new documents or do retrieval; the page falls back to a no-RAG mode.
- `TELEGRAM_BOT_TOKEN` (optional) — when set, `apps/transcribe/src/lib/api-guard.ts`
  enables Telegram-Mini-App initData HMAC validation on all API routes. Bad
  signatures return 401; absent header is allowed by default (see next flag).
- `TELEGRAM_REQUIRE_INIT_DATA` (optional, default unset) — when `"true"` and
  `TELEGRAM_BOT_TOKEN` is set, every request to an API route protected by
  `guardRequest` must carry a valid `x-telegram-init-data` header. Browser
  access without Telegram dies. Enable this **only** when ready for
  Mini-App-only operation. Clients send the header automatically via
  `apiFetch()` (`apps/transcribe/src/lib/telegram.ts`), which is wired into
  every client `fetch('/api/*')` call site in transcribe.
- `OWNER_TELEGRAM_ID` (optional) — numeric Telegram user id of the owner.
  Required for `ownerOnly: true` routes (currently `/api/tasks*`, backing
  the `/admin` kanban board): the verified initData user must match this id
  or the request gets 403. Fails closed when unset — owner-only routes
  return 403 until both `TELEGRAM_BOT_TOKEN` and this id are configured.
  Get your id by DMing [@userinfobot](https://t.me/userinfobot).

## Supabase migrations

`supabase/migrations/` contains SQL the user runs manually in the Supabase
SQL Editor:
- `001_transcripts.sql` — `transcripts` table for `/transcribe` history.
- `002_generations.sql` — `generations jsonb` column for caching
  carousel / reels / telegram-post outputs.
- `003_tasks.sql` — `tasks` table for the project board at `/admin`.
- `003_me.sql` — `me_profile` / `me_documents` / `me_chunks` tables for the
  `/me` page (personal RAG library — see "/me" section below). Note the
  `003_` prefix collision with `003_tasks.sql`: tools that auto-apply by
  lexicographic sort will pick one over the other ambiguously. Order
  doesn't actually matter here (no cross-references), but apply both
  manually if you're seeding fresh.
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
(`apps/transcribe/tsconfig.json`). Light theme — `<html lang="ru">` +
`bg-white` body with Apple-style `apple-*` color tokens (`tailwind.config`).

**Routing**: `apps/transcribe/src/app/page.tsx` redirects `/` → `/transcribe`. The
transcribe page has its own layout (`apps/transcribe/src/app/transcribe/layout.tsx`)
providing a mobile-first centered container (max-w-2xl) — there is no
sidebar. Everything is one page.

`/admin` is a separate route group with its own wider layout
(`apps/transcribe/src/app/admin/layout.tsx`, max-w-7xl) — kanban project board.
API surface (`/api/tasks` + `/api/tasks/[id]`) is **owner-only**: requests
must carry a valid Telegram initData whose `user.id` matches
`OWNER_TELEGRAM_ID`, otherwise the route returns 403. The page UI itself is
not gated server-side — a non-owner who navigates to `/admin` sees the
empty kanban shell, but every CRUD call returns 403 and no data loads.

`/me` (`apps/transcribe/src/app/me/`) — owner's personal RAG library.
Subpages: `/me/library` (upload + browse personal documents) and
`/me/profile` (edit profile metadata). Documents are uploaded to
`me_documents`, chunked via `src/lib/chunking.ts` (which strips NUL
bytes left over from PDF extraction), embedded via OpenAI's
`text-embedding-3-small`, and stored in `me_chunks` as pgvector vectors.
`/api/me/chat` does vector-similarity retrieval (`match_me_chunks`)
against the chunks, then streams a Claude `claude-sonnet-4-6` reply
that quotes from them. Same `getServerSupabase()` no-op pattern — if
Supabase isn't configured the page degrades gracefully.

`/assistants` (`apps/transcribe/src/app/assistants/`) — catalog of
system-prompt-only personas defined in `src/data/assistants.ts` (8+
hard-coded entries). `/assistants/[id]` is a chat against one of them.
`/api/assistants/chat` streams Claude `claude-sonnet-4-6` with the
chosen persona's system prompt. No persistence — each conversation is
purely in-memory in the React component.

**Auth posture across these routes**: every `/api/*` route in transcribe
passes through `guardRequest` (`src/lib/api-guard.ts`) — rate-limit + optional
Telegram `initData` HMAC validation. Owner-only (`ownerOnly: true`) — only
the user matching `OWNER_TELEGRAM_ID` passes:
- `/api/tasks` + `/api/tasks/[id]` (backs the `/admin` kanban)
- `/api/me/*` (profile, documents, chat — personal RAG library)
- `/api/transcribe/history` + `/api/transcribe/history/[id]` (your URL history)

Open to any verified Telegram user (HMAC only, no owner check):
- `/api/transcribe`, `/api/transcribe/{summarize,translate,generate}` — the
  core transcription flow. Add `ownerOnly: true` here too if you don't want
  to share the deploy URL with other Telegram users.
- `/api/assistants/chat` — the system-prompt-only persona chats. Same
  consideration — open by default so they're usable if you share the Mini
  App with someone.

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
- `GET /api/transcribe/history` — last 30 rows. Returns
  `{ items, configured: boolean }`.
- `GET|DELETE /api/transcribe/history/[id]` — one row.
- `GET /api/tasks?project=transcribe` — list tasks for `/admin` board.
  Optional `project` query param filters server-side. Returns
  `{ items, configured }`.
- `POST /api/tasks` — create task. Body `{ title, description?, status?,
  priority?, stage?, project? }`. `project` defaults to `'general'`.
- `PATCH /api/tasks/[id]` — update fields (including `project`).
  `DELETE /api/tasks/[id]` removes.

**`/me` routes** (personal RAG library; Supabase-backed):
- `GET|PUT /api/me/profile` — owner profile metadata (single-row table).
- `GET|POST /api/me/documents` — list / create personal document. POST
  body accepts text or uploaded file (PDF parsed via `pdf-parse`).
  Content is chunked + embedded inline before being persisted.
- `GET|DELETE /api/me/documents/[id]` — fetch / remove one document
  (cascades to its `me_chunks`).
- `POST /api/me/chat` — body `{ message, history? }`. Retrieves
  top-k chunks via cosine similarity, streams a `claude-sonnet-4-6`
  reply via SSE (`src/lib/anthropic-stream.ts`).

**`/assistants` routes**:
- `POST /api/assistants/chat` — body `{ assistantId, message, history? }`.
  Loads the persona from `src/data/assistants.ts`, streams
  `claude-sonnet-4-6` with that system prompt.

**Security primitives** (`src/lib/`):
- `rate-limit.ts` — in-memory sliding-window limiter, keyed per
  `(route, IP)`. Counters reset on process restart.
- `telegram-auth.ts` — `verifyInitData()` implements the HMAC-SHA256
  algorithm from `core.telegram.org/bots/webapps`. Returns the parsed
  user on success, `null` on bad signature / stale `auth_date`.
- `api-guard.ts` — `guardRequest()` combines both. The four expensive
  transcribe routes (`/api/transcribe`, `/summarize`, `/translate`,
  `/generate`) call it at the top. Behavior depends on env:
  - `TELEGRAM_BOT_TOKEN` unset → guard passes through (no HMAC secret
    to verify against; rate-limit still applies).
  - Bot token set, `x-telegram-init-data` header present → verify;
    reject with 401 on bad signature.
  - Bot token set, header absent, `TELEGRAM_REQUIRE_INIT_DATA=true` →
    reject with 401.
  - Bot token set, header absent, require flag off → pass-through.
- `telegram.ts → apiFetch(input, init)` — client-side fetch wrapper
  that auto-attaches `x-telegram-init-data` when the page is opened
  inside Telegram. Not yet wired into all `/api/*` call sites in the
  React components — that's a route-by-route migration.

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

`apps/tg-agent/` — single-process Node.js + TypeScript service
that joins Telegram groups as a regular bot, reads every text
message, classifies its intent with Claude Haiku, generates
replies in Ilya's tone-of-voice when the decision engine says so,
updates per-user lead status, DMs the owner on hot leads, and
serves an admin dashboard on the same process. Everything lives
in one container with one SQLite file — no external DB, no
Vercel, no Supabase.

Pipeline (`apps/tg-agent/src/bot.ts`):
`chats.touch → classifier → decision → leads.touchAndClassify →
[responder + ctx.reply] → messages.log → notifier.notifyOwner`.

- **Transport:** long-polling via [grammy](https://grammy.dev/).
  Deploy on Hetzner via the bundled `docker-compose.yml`.
  **Replicas = 1** — long-polling can't fan out.
- **Storage:** embedded SQLite via `better-sqlite3`. The schema
  in `src/db/schema.ts` applies on startup via `db.exec(SCHEMA)`
  (idempotent, `IF NOT EXISTS` throughout). DB file defaults to
  `./data/tg-agent.db`; in Docker that's mounted to the
  `tg-agent-data` named volume.
- **Admin panel:** Hono HTTP server (`src/admin/server.ts`) +
  vanilla-JS SPA (`src/admin/ui.html`, Tailwind via CDN) on
  port 8080, basic auth via `ADMIN_USERNAME` + `ADMIN_PASSWORD`.
  When `ADMIN_PASSWORD` is empty the admin server does not start
  (bot runs headless).
- **Classifier** (`src/classifier.ts`): Claude Haiku 4.5 +
  tool-use, 10 classes (`GENERAL_CHAT`, `QUESTION`,
  `PRODUCT_INTEREST`, `PRICE_REQUEST`, `OBJECTION`,
  `BUYING_INTENT`, `NEGATIVE`, `SUPPORT_REQUEST`,
  `OWNER_REQUEST`, `SPAM`).
- **Decision engine** (`src/decision.ts`): maps class → `Action`
  (`IGNORE`, `REPLY`, `REPLY_SOFT`, `REPLY_AND_NOTIFY`,
  `NOTIFY_ONLY`, `DRAFT_FOR_OWNER`). Safety: when
  `confidence < CONFIDENCE_THRESHOLD` (default 0.7), non-IGNORE
  actions drop to `DRAFT_FOR_OWNER` — except `GENERAL_CHAT` /
  `NEGATIVE` / `SPAM` which always stay `IGNORE`.
- **Responder** (`src/responder.ts`): Claude Haiku 4.5 with a
  per-class strategy. Tone + strategies live in `src/prompts.ts`.
  Knowledge base (`src/knowledge/knowledge_base.md`, plain
  markdown the owner edits) is embedded into the system prompt —
  the responder may only state facts from this file.
- **CRM** (`src/db/leads.ts`): per-(chat_id, user_id) status with
  a one-way commercial ranking `new → cold → warm → hot → buyer`.
  `negative` is sticky (manual override only).
  `SUPPORT_REQUEST` → `support` unless already `buyer`.
- **Owner notifications** (`src/notifier.ts`): bot DMs
  `OWNER_TELEGRAM_ID` on `REPLY_AND_NOTIFY` / `NOTIFY_ONLY` /
  `DRAFT_FOR_OWNER`. Owner must `/start` the bot first.
- **Kill switch:** per-chat `tg_chats.auto_reply` toggled from the
  admin panel. When OFF the bot still classifies and persists,
  but does not reply and does not notify.
- **Env** (`apps/tg-agent/.env.example`):
  `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `OWNER_TELEGRAM_ID`,
  `ALLOWED_CHAT_IDS`, `CONFIDENCE_THRESHOLD`, `LOG_LEVEL`,
  `CLASSIFIER_MODEL`, `RESPONDER_MODEL`, `DATABASE_PATH`,
  `ADMIN_PORT`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
- **Setup:** in @BotFather run `/setprivacy → Disable` for the
  bot. Then `cd apps/tg-agent && cp .env.example .env && docker
  compose up -d --build`. See the app's README for the full deploy
  walkthrough including Caddy/Cloudflare Tunnel for HTTPS and a
  backup cron snippet.


## AI Sales System (ai-sales)

`apps/ai-sales/` — multi-agent sales system for Instagram + Telegram.
Replaces a human sales manager with 4 Claude-backed agents (IG-manager,
TG-manager, Analyst, ROP/head-of-sales). The owner's voice is cloned via
ElevenLabs PVC and all agents read a shared RAG knowledge base.

The codebase is **a snapshot/backup**, not a node workspace — root
`package.json` does not proxy commands here. Everything ships from one
Hetzner CPX31 via a single `docker-compose.yml` (in `apps/ai-sales/code/`)
with **6 services**: postgres, redis, qdrant, minio, api (FastAPI +
LangGraph), and **caddy** (reverse-proxy + static portal + auto-HTTPS).

- **Static portal + dashboard prototype** (`01-portal/` +
  `06-dashboard-prototype/` + `05-docs/` + `carousels/` + `reels/` +
  `assets/` + `index.html`) is served by Caddy from `/srv`. The Caddyfile
  (`apps/ai-sales/code/Caddyfile`) explicitly enumerates which dirs get
  mounted into the container, so private dirs (`code/`, `agent-prompts/`,
  `voice-input/`, `04-database/`, `scripts/`, `03-server-scripts/`,
  `02-stage-instructions/`, `content-bank/`, `funnel-scripts/`,
  `notion-templates/`, `objections/`) never leave the host. Configured
  redirects: `/dashboard`, `/pulse`, `/pipeline`, `/conv`,
  `/conversation`, `/project`, `/agents`, `/portal`, `/roadmap` →
  corresponding HTML files. Set `DOMAIN=your-hostname.com` in `.env` to
  enable Let's Encrypt; otherwise Caddy runs HTTP-only on `:80` for
  local dev.
- **FastAPI backend** in `apps/ai-sales/code/` — Python 3.12 +
  LangGraph + Anthropic SDK + Qdrant + Postgres + Redis + MinIO. Caddy
  reverse-proxies `/api/*` (with prefix-strip) and `/webhooks/*` to the
  `api` container on port 8000. `AISALES_MOCK=1` runs the agents
  without real API keys for local dev. See `apps/ai-sales/code/DEPLOY.md`
  for the server walkthrough.

SQL schema in `apps/ai-sales/04-database/` (8 tables: clients,
conversations, messages, etc.) is auto-loaded into Postgres on first
container start via `docker-entrypoint-initdb.d`.

Agent system prompts live in `apps/ai-sales/agent-prompts/` and are
loaded at startup by `code/agents/prompts_loader.py`. The voice/tone
input collected for ElevenLabs lives in `apps/ai-sales/voice-input/`.

Env contract: `apps/ai-sales/code/.env.example` lists every key. See
`apps/ai-sales/README.md` for the full project status & infra notes.


## Conventions

- Client-only React components must start with `'use client'`. Route
  handlers and `apps/transcribe/src/lib/supabase.ts` do not.
- Icons come from `lucide-react`. No emojis in UI; they are user-facing
  decoration only and we don't have any in the current app.
- `next.config.js` is empty — no custom image domains, headers, or rewrites.
- Production models:
  - **Transcribe content gen** (`/api/transcribe/{summarize,translate,generate}`)
    and **tg-agent** (classifier + responder) → `claude-haiku-4-5-20251001`.
    Fast + cheap; appropriate for high-volume short turns.
  - **`/api/me/chat`** and **`/api/assistants/chat`** → `claude-sonnet-4-6`.
    These streamed conversational endpoints opt up to Sonnet 4.6 for better
    reasoning and context-management on multi-turn dialog.
