# ig-agent — CLAUDE.md

Single-process Node.js + TypeScript service. Receives Instagram DMs via
**SendPulse webhooks**, classifies intent with Claude, replies in the
owner's tone-of-voice, persists everything to Postgres, sends hot-lead /
draft alerts to the owner's Telegram via the existing tg-agent bot, and
serves a magic-link admin SPA cloned from `apps/ai-sales/06-dashboard-prototype/`.

Same architectural pattern as `apps/tg-agent`, with three substitutions:

| What | tg-agent | ig-agent |
|---|---|---|
| Transport | grammy long-polling | SendPulse webhook (`POST /webhook/sendpulse`) |
| Outbound | grammy `ctx.reply` | SendPulse REST `/instagram/contacts/send` |
| Storage | SQLite (`better-sqlite3`) | Postgres (`pg` → shared `aisales-postgres`, db `ig_agent`) |

Owner notifications **reuse the tg-agent bot** — same `TELEGRAM_BOT_TOKEN`,
same `OWNER_TELEGRAM_ID`, single inbox.

## Pipeline (`src/pipeline.ts`)

```
webhook (POST /webhook/sendpulse?token=...)
  → upsert contacts (by sendpulse_contact_id)
  → upsert/open conversations (active row per contact)
  → insert messages (direction='incoming', source='user', raw_payload kept)
  → [if conv.ai_handled && !ignored]
       classifier → decision
       → responder → sendPulse.sendText()
       → insert messages (direction='outgoing', source='ai_agent', ai_*)
  → analyst (async)   # writes ai_recommendations rows
  → notifier (owner DM on hot-leads / drafts / errors)
```

`conversations.ai_handled=false` (human takeover) skips classifier→responder.

## Schema

`src/db/migrations/0001_init.sql` ships the user-provided DDL:
`contacts`, `messages`, `conversations`, `ai_recommendations`, `prompt_versions`.

All five tables created on first boot — `src/db/migrate.ts` is idempotent.
Future migrations live in `src/db/migrations/000N_*.sql`, applied
alphabetically with a tracking row in `schema_migrations`.

## SendPulse client (`src/sendpulse/client.ts`)

- `POST https://api.sendpulse.com/oauth/access_token` (client_credentials)
  → cached in-memory until 60s before `expires_in`.
- `POST https://api.sendpulse.com/instagram/contacts/send` with
  `{contact_id, messages: [{type: 'text', message: {text}}]}`.
- `GET  https://api.sendpulse.com/instagram/contacts/get?id=…` — used to
  enrich `contacts` row on first webhook (profile pic, IG username).

Token-refresh on 401 is automatic.

## Admin (`src/admin/server.ts`)

Hono server on port 8081. Magic-link auth identical to tg-agent
(`src/admin/auth.ts`) — bot DMs owner a one-time URL, link sets a signed
7-day cookie. Falls back to basic auth if `ADMIN_PASSWORD` set and
session secret missing.

UI pages are static HTML pulled from `apps/ai-sales/06-dashboard-prototype/`
into `src/admin/ui/`. Each page calls JSON endpoints under `/api`:

- `GET /api/contacts?status=...&limit=...`
- `GET /api/contacts/:id`
- `GET /api/contacts/:id/messages?limit=...`
- `GET /api/contacts/:id/recommendations`
- `POST /api/contacts/:id/takeover` — flip `conversations.ai_handled=false`
- `POST /api/contacts/:id/reply` — manual send via SendPulse, source='manual'
- `GET  /api/prompts` / `POST /api/prompts/:id/activate` — A/B prompts

## Models

Defaults (override via env):
- Classifier: `claude-haiku-4-5-20251001`
- Responder: `claude-haiku-4-5-20251001`
- Analyst (recommendations): `claude-sonnet-4-6`

Prompt caching enabled on the static system prompt + tool defs for
classifier and responder.

## Env

See `.env.example`. Required: `SENDPULSE_CLIENT_ID`,
`SENDPULSE_CLIENT_SECRET`, `SENDPULSE_WEBHOOK_TOKEN`, `ANTHROPIC_API_KEY`,
`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `OWNER_TELEGRAM_ID`,
`ADMIN_SESSION_SECRET`.

## Deploy

```bash
cd apps/ig-agent
cp .env.example .env  # fill the blanks
docker compose up -d --build
```

The compose file joins `aisales_aisales-net` to reach `aisales-postgres`.
Put Caddy in front for HTTPS at `ig.46-62-215-11.nip.io` and point the
SendPulse webhook URL there.

## Roadmap (post-MVP)

- Health monitor + automatic owner DM on N consecutive failures (port from tg-agent)
- Daily backup of `ig_agent` DB into owner DM via `pg_dump | gzip` (port from tg-agent backup.ts)
- Analyst agent that writes `ai_recommendations` after every inbound message
- Prompt A/B testing UI on `agents.html`
- Outcome attribution from `messages.intent='ready_to_buy'` → `conversations.outcome='sale'`
