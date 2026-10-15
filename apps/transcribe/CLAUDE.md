# transcribe — CLAUDE.md

Next.js 14 App Router + React 18 + TypeScript + Tailwind. Single-purpose
transcription web app + Telegram Mini App. Hosted on Vercel (project root
`apps/transcribe`); Telegram Mini App entry point is `/transcribe`.

UI strings are Russian; comments/identifiers in English.
Path alias `@/* → src/*` (`tsconfig.json`).
Light theme — `<html lang="ru">` + `bg-white` + Apple-style `apple-*` tokens.

## Commands

From repo root (npm workspaces):
```bash
npm run dev              # next dev :3000
npm run build && npm start
npm run lint
npm run typecheck:transcribe
npm run test:transcribe
```

## Required env

The app degrades gracefully when these are missing — set them in
`.env.local` for local dev and in Vercel / Railway project envs for prod.

- `ANTHROPIC_API_KEY` — `src/app/api/transcribe/{summarize,translate,generate}/route.ts`
- `DEEPGRAM_API_KEY` — `src/app/api/transcribe/route.ts` for non-YouTube URLs.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser client (`src/lib/supabase.ts`)
- `SUPABASE_SERVICE_KEY` — server routes via `src/lib/transcripts-db.ts`. Required for history + generation caching. **Do not expose to client.**
- `YTDLP_SERVICE_URL` (optional) — base URL of the `services/python/ytdlp` service. When set, `/api/transcribe` falls back to yt-dlp + Deepgram for YouTube when our captions parser is IP-blocked; uses yt-dlp + Deepgram for TikTok / X (and as Instagram backup when `APIFY_API_TOKEN` is unset or Apify fails).
- `YTDLP_SERVICE_API_KEY` (optional) — main app sends `Authorization: Bearer <key>`.
- `APIFY_API_TOKEN` (optional) — Instagram URLs go through `apify/instagram-scraper` instead of yt-dlp.
- `OPENAI_API_KEY` — required by `/api/me/documents` (POST) and `/api/me/chat` for `text-embedding-3-small`. Without it the `/me` library can't ingest new documents or do retrieval; the page falls back to a no-RAG mode.
- `TELEGRAM_BOT_TOKEN` (optional) — when set, `src/lib/api-guard.ts` enables Telegram-Mini-App initData HMAC validation on all API routes. Bad signatures return 401; absent header is allowed by default (see next flag).
- `TELEGRAM_REQUIRE_INIT_DATA` (optional, default unset) — when `"true"` and `TELEGRAM_BOT_TOKEN` is set, every protected request must carry a valid `x-telegram-init-data` header. Browser access without Telegram dies. Enable this **only** when ready for Mini-App-only operation.
- `OWNER_TELEGRAM_ID` (optional) — numeric Telegram user id of the owner. Required for `ownerOnly: true` routes (currently `/api/tasks*`, `/api/me/*`, `/api/transcribe/history`). Fails closed when unset.

## Supabase migrations (root `/supabase/migrations/`)

- `001_transcripts.sql` — `transcripts` table for `/transcribe` history.
- `002_generations.sql` — `generations jsonb` column for caching carousel / reels / telegram-post outputs.
- `003_tasks.sql` — `tasks` table for `/admin` board.
- `003_me.sql` — `me_profile` / `me_documents` / `me_chunks` for `/me` page (collision with `003_tasks.sql` is harmless — no cross-references — but apply both manually).
- `004_tasks_project.sql` — `project text` column on `tasks` so `/admin` splits per project (`transcribe`|`ytdlp`|`ai-office`|`general`, default `general`).

`supabase/seed_initial_tasks.sql` is an optional one-shot seed for `/admin`. Idempotent.

Without these tables (or env vars), `getServerSupabase()` returns `null` and saves/history/caching no-op.

## Routing

- `src/app/page.tsx` — full marketing landing (hero, 6 feature cards, stats strip, bottom CTA → `/transcribe` and `/me`).
- `/transcribe` — own layout (`src/app/transcribe/layout.tsx`) with mobile-first centered container (max-w-2xl), no sidebar. Everything is one page.
- `/admin` — separate route group, wider layout (`src/app/admin/layout.tsx`, max-w-7xl), kanban board. API is **owner-only** — non-owners see empty shell, CRUD returns 403.
- `/me` (`src/app/me/`) — owner's personal RAG library. Subpages: `/me/library` (upload + browse), `/me/profile` (edit metadata). Documents → `me_documents`, chunked via `src/lib/chunking.ts` (strips NUL bytes from PDF extraction), embedded via OpenAI `text-embedding-3-small`, stored in `me_chunks` as pgvector. `/api/me/chat` does cosine-similarity retrieval (`match_me_chunks`) and streams a `claude-sonnet-4-6` reply that quotes from them.
- `/assistants` (`src/app/assistants/`) — catalog of system-prompt-only personas from `src/data/assistants.ts` (8+ entries). `/assistants/[id]` is a chat. `/api/assistants/chat` streams `claude-sonnet-4-6` with the chosen persona's system prompt. No persistence — in-memory in the React component.

## Auth posture across `/api/*`

Every route passes through `guardRequest` (`src/lib/api-guard.ts`) — rate-limit + optional Telegram initData HMAC.

**Owner-only** (`ownerOnly: true`):
- `/api/tasks` + `/api/tasks/[id]` (backs `/admin` kanban)
- `/api/me/*` (profile, documents, chat)
- `/api/transcribe/history` + `/api/transcribe/history/[id]`

**Open to any verified Telegram user** (HMAC only):
- `/api/transcribe`, `/api/transcribe/{summarize,translate,generate}` — core flow
- `/api/assistants/chat` — persona chats

Add `ownerOnly: true` here too if you don't want to share the deploy URL with other Telegram users.

## The flow (`src/app/transcribe/page.tsx`)

1. Mount → `loadHistory()` and `setInTg(isInTelegram())`.
2. User pastes a URL + picks language → submits.
3. `POST /api/transcribe` returns transcript + paragraphs + metadata. Row inserted into `transcripts` if Supabase is configured.
4. User can trigger: Copy / .txt / .srt download / Summary / Translate / Carousel / Reels-new / Reels-remix / TG-post. Each generation calls a dedicated endpoint and gets cached on the row.
5. "В мой мозг" button POSTs the current transcript to `/api/me/documents`, importing it into the personal RAG library at `/me`. Flips to "В базе" once the document id is returned.

## Core API routes

- `POST /api/transcribe` — body `{ url, language: 'auto'|'ru'|'en' }`. `dispatch()` routes by URL type:
  - **YouTube** → captions parser (`src/lib/youtube-captions.ts`). On failure (no subs / IP block / wrong language) and when `YTDLP_SERVICE_URL` is set → yt-dlp + Deepgram fallback.
  - **Instagram** (see `isInstagramUrl()` in `src/lib/apify-client.ts`) → `apify/instagram-scraper` actor + Deepgram when `APIFY_API_TOKEN` is set. Falls back to yt-dlp + Deepgram. Apify path avoids putting our IG account or server IP in front of instagram.com.
  - **Other social URLs** (TikTok, X, Vimeo, SoundCloud, Facebook — see `isSocialMediaUrl()` in `src/lib/ytdlp-client.ts`) → always **yt-dlp + Deepgram**. Without `YTDLP_SERVICE_URL` returns 503.
  - **Anything else** → Deepgram `nova-2` directly.
  Returns `{ transcript, paragraphs: [{text,start,end}], duration, detectedLanguage, source, id }`.
  **Known issue**: YouTube actively rate-limits datacenter IPs (Vercel included) — that's why the yt-dlp fallback exists. For YouTube via Railway, cookies required.
- `POST /api/transcribe/summarize` — `{ id?, transcript? }` → `{ summary, bullets, cached }`. Cached on row.
- `POST /api/transcribe/translate` — `{ id?, transcript?, targetLang }` → `{ translation, lang, cached }`.
- `POST /api/transcribe/generate` — `{ id?, transcript?, type: 'carousel'|'reels-new'|'reels-remix'|'tg-post' }`. Structured Russian prompt → Claude Haiku → `{ type, content, cached }`. Cached in `transcripts.generations` jsonb keyed by type. Prompts inline in `buildPrompt()`.
- `GET /api/transcribe/history` — last 30 rows; `{ items, configured }`.
- `GET|DELETE /api/transcribe/history/[id]` — one row.
- `GET /api/tasks?project=transcribe` — list for `/admin`; `{ items, configured }`.
- `POST /api/tasks`, `PATCH|DELETE /api/tasks/[id]`.

## `/me` routes (personal RAG)

- `GET|PUT /api/me/profile`.
- `GET|POST /api/me/documents` — list / create. POST accepts text or uploaded PDF (parsed via `pdf-parse`). Chunked + embedded inline before persist.
- `GET|DELETE /api/me/documents/[id]` (cascades to chunks).
- `POST /api/me/chat` — `{ message, history? }`. Cosine top-k → streams `claude-sonnet-4-6` as NDJSON (`src/lib/anthropic-stream.ts`, consumed by `src/lib/stream-client.ts`). First NDJSON line is meta with citations; subsequent lines are token deltas.

## `/assistants` routes

- `POST /api/assistants/chat` — `{ assistantId, message, history? }`. Loads persona from `src/data/assistants.ts`, streams `claude-sonnet-4-6` as NDJSON (no citations meta).

## Security primitives (`src/lib/`)

- `rate-limit.ts` — in-memory sliding-window, per `(route, IP)`. Counters reset on process restart.
- `telegram-auth.ts` — `verifyInitData()` implements HMAC-SHA256 from `core.telegram.org/bots/webapps`. Returns parsed user, `null` on bad signature / stale `auth_date`.
- `api-guard.ts → guardRequest()` — rate-limit + HMAC. Behavior:
  - `TELEGRAM_BOT_TOKEN` unset → pass-through (no HMAC secret; rate-limit still applies).
  - Bot token set + header present → verify; 401 on bad signature.
  - Bot token set + header absent + `TELEGRAM_REQUIRE_INIT_DATA=true` → 401.
  - Bot token set + header absent + flag off → pass-through.
- `telegram.ts → apiFetch(input, init)` — client-side fetch wrapper that auto-attaches `x-telegram-init-data` when opened inside Telegram.

## Telegram Mini App

`telegram-web-app.js` loads via `src/app/layout.tsx`. `src/components/TelegramInit.tsx` calls `tg.ready()` + `tg.expand()` and mirrors `themeParams` to CSS variables on `<html>`.

The transcribe page:
- Detects Telegram on mount via `isInTelegram()` (`initData` non-empty).
- Hides in-page submit button; binds `Telegram.WebApp.MainButton` to the same submit handler. Text / enabled / progress kept in sync via `useEffect`.
- Fires `HapticFeedback` on submit start / success / error.

Outside Telegram still works — SDK calls guarded by `getTelegram()` returning `null`.

BotFather setup steps: `/docs/TELEGRAM_MINI_APP.md`.

## Production model usage

- `/api/transcribe/{summarize,translate,generate}` → `claude-haiku-4-5-20251001` (fast + cheap, high-volume short turns).
- `/api/me/chat`, `/api/assistants/chat` → `claude-sonnet-4-6` (multi-turn dialog needs better reasoning + context management).
