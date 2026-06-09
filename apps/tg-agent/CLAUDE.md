# tg-agent — CLAUDE.md

Single-process Node.js + TypeScript service that joins Telegram groups as a
regular bot, reads every text message, classifies its intent with an
OpenAI-compatible LLM (codex.sale, `gpt-5.4-mini` by default), generates
replies in the owner's tone-of-voice when the decision engine says so,
updates per-user lead status, DMs the owner on hot leads, and serves an
admin dashboard on the same process.

Everything lives in **one container with one SQLite file** — no external
DB, no Vercel, no Supabase.

## Pipeline (`src/bot.ts`)

```
chats.touch
  → classifier
  → decision
  → leads.touchAndClassify
  → [responder + ctx.reply]
  → messages.log
  → notifier.notifyOwner
```

## Commands

From repo root:
```bash
npm run tg-agent:dev       # local dev
npm run tg-agent:build
npm run tg-agent:start
npm run tg-agent:typecheck
```

Or from this app:
```bash
cd apps/tg-agent && cp .env.example .env && docker compose up -d --build
```

## Transport + storage

- **Transport**: long-polling via [grammy](https://grammy.dev/). Deploy on
  Hetzner via the bundled `docker-compose.yml`. **Replicas = 1** —
  long-polling can't fan out.
- **Storage**: embedded SQLite via `better-sqlite3`. Schema in
  `src/db/schema.ts` applies on startup via `db.exec(SCHEMA)`
  (idempotent, `IF NOT EXISTS` throughout). DB file defaults to
  `./data/tg-agent.db`; in Docker that's the `tg-agent-data` volume.

## Admin panel

Hono HTTP server (`src/admin/server.ts`) + vanilla-JS SPA
(`src/admin/ui.html`, Tailwind via CDN) on port **8080**. Two auth modes in
`src/admin/auth.ts`:

- **Magic link via Telegram** (preferred): set `ADMIN_SESSION_SECRET` and
  `OWNER_TELEGRAM_ID`. Bot DMs owner a one-time login URL; link sets a
  signed-cookie session for 7 days. Rotating the secret logs everyone out.
- **Basic auth** (fallback): set `ADMIN_PASSWORD` (+ optional
  `ADMIN_USERNAME`). Magic link wins if both configured. If neither set,
  admin server does not start (bot runs headless).

Three SPA tabs: leads/chats, **drafts** (inline approval queue), **analytics** (`src/db/stats.ts` — daily classifications, leads-by-status, response counts).

## HQ owner commands

When `OFFICE_HQ_BASE_URL` is set, owner-DM commands `/hq`, `/brief`,
`/standup`, `/focus`, `/escalations`, `/decide` become a thin transport
layer over `apps/command-center` office HQ API. The Telegram bot stays a
messaging surface; the office logic remains centralized in command-center.

## Classifier (`src/classifier.ts`)

`gpt-5.4-mini` (codex.sale, OpenAI-compatible) + function-calling, 10 classes:
`GENERAL_CHAT`, `QUESTION`, `PRODUCT_INTEREST`, `PRICE_REQUEST`, `OBJECTION`, `BUYING_INTENT`, `NEGATIVE`, `SUPPORT_REQUEST`, `OWNER_REQUEST`, `SPAM`.

The forced `classify` tool returns structured JSON. The static system prompt is the cacheable prefix — codex.sale applies automatic prompt caching (hits surface under `usage.prompt_tokens_details.cached_tokens`). `reasoning_effort` defaults to `low` to keep per-message latency + cost down.

## Decision engine (`src/decision.ts`)

Maps class → `Action`: `IGNORE`, `REPLY`, `REPLY_SOFT`, `REPLY_AND_NOTIFY`, `NOTIFY_ONLY`, `DRAFT_FOR_OWNER`.

**Safety**: when `confidence < CONFIDENCE_THRESHOLD` (default 0.7), non-IGNORE actions drop to `DRAFT_FOR_OWNER` — except `GENERAL_CHAT` / `NEGATIVE` / `SPAM` which always stay `IGNORE`.

## Responder (`src/responder.ts`)

`gpt-5.4-mini` (codex.sale) with a per-class strategy. Tone + strategies live in `src/prompts.ts`. Knowledge base (`src/knowledge/knowledge_base.md`, plain markdown the owner edits) is embedded into the system prompt (cacheable prefix) — **the responder may only state facts from this file**. `reasoning_effort` defaults to `low`.

## Drafts + inline approval (`src/db/drafts.ts`)

When decision returns `DRAFT_FOR_OWNER`, the proposed reply is persisted to `tg_drafts` and DM'd to the owner with inline "Approve / Edit / Discard" buttons. Approving sends the draft to the original chat from the bot's account. Same queue shows up under the **drafts** tab in admin.

## CRM (`src/db/leads.ts`)

Per-`(chat_id, user_id)` status with a one-way commercial ranking:
`new → cold → warm → hot → buyer`.

`negative` is sticky (manual override only). `SUPPORT_REQUEST` → `support` unless already `buyer`.

## Owner notifications (`src/notifier.ts`)

Bot DMs `OWNER_TELEGRAM_ID` on `REPLY_AND_NOTIFY` / `NOTIFY_ONLY` / `DRAFT_FOR_OWNER`. Owner must `/start` the bot first.

## Health monitor (`src/health.ts`)

Tracks consecutive codex.sale / Telegram failures. After `HEALTH_FAILURE_THRESHOLD` in a row the bot DMs the owner; cooldown between repeats is `HEALTH_ALERT_COOLDOWN_MINUTES`. Recovery DM sent when the channel comes back.

## Daily backup (`src/backup.ts`)

Every `BACKUP_INTERVAL_HOURS` (default 24) the bot ships a gzipped SQLite copy to `OWNER_TELEGRAM_ID` as a document. Telegram caches uploads forever — the owner's DM thread is the backup target, no S3 / SFTP required. Set to 0 to disable.

## Kill switch

Per-chat `tg_chats.auto_reply` toggled from the admin panel. When OFF the bot still classifies and persists, but does not reply and does not notify.

## Env (`.env.example`)

```
TELEGRAM_BOT_TOKEN, CODEX_API_KEY, CODEX_BASE_URL, CODEX_REASONING_EFFORT,
OWNER_TELEGRAM_ID, ALLOWED_CHAT_IDS,
CONFIDENCE_THRESHOLD, LOG_LEVEL, CLASSIFIER_MODEL, RESPONDER_MODEL,
DATABASE_PATH, ADMIN_PORT, ADMIN_USERNAME, ADMIN_PASSWORD,
ADMIN_SESSION_SECRET, ADMIN_PUBLIC_URL,
BACKUP_INTERVAL_HOURS, HEALTH_FAILURE_THRESHOLD, HEALTH_ALERT_COOLDOWN_MINUTES,
OFFICE_HQ_BASE_URL, OFFICE_HQ_WEB_URL, OFFICE_HQ_TIMEOUT_MS,
IGNORED_USER_IDS, OPENAI_API_KEY (только для памяти/эмбеддингов)
```

> **LLM-провайдер**: `CODEX_API_KEY` — ключ codex.sale (`sk-inv-…`).
> `CODEX_BASE_URL` по умолчанию `https://codex.sale/v1`,
> `CODEX_REASONING_EFFORT` — `low|medium|high` (по умолчанию `low`).
> Для обратной совместимости, если `CODEX_API_KEY` не задан, ключ берётся
> из `ANTHROPIC_API_KEY`. Память (Qdrant) использует отдельный
> `OPENAI_API_KEY` — codex.sale не отдаёт эмбеддинг-модели.

## BotFather setup

`/setprivacy → Disable` for the bot. Then:
```bash
cd apps/tg-agent && cp .env.example .env && docker compose up -d --build
```
See `apps/tg-agent/README.md` for the full deploy walkthrough including Caddy / Cloudflare Tunnel for HTTPS and a backup cron snippet.

## Models

All LLM calls go to **codex.sale** (OpenAI-compatible `/v1`, key `sk-inv-…`):

- Classifier + responder: `gpt-5.4-mini` (`CLASSIFIER_MODEL` / `RESPONDER_MODEL`).
- Daily digest: `gpt-5.5` (`DIGEST_MODEL`), `reasoning_effort=medium`.
- Other available models: `gpt-5.4`, `gpt-5.5` (context 128k).

Embeddings for memory stay on OpenAI (`OPENAI_API_KEY`, `text-embedding-3-small`) — codex.sale has no embedding endpoint. The shared OpenAI-compatible client lives in `src/llm.ts`.
