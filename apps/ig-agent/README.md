# ig-agent

Instagram DM AI agent via SendPulse. Webhook in → Claude reply out, all
persisted in Postgres, admin SPA cloned from `apps/ai-sales/06-dashboard-prototype/`.

Companion to `apps/tg-agent`. Reuses the same Telegram owner bot for
notifications, the same `aisales-postgres` container (db `ig_agent`), the
same Hetzner box.

## Quick start (local)

```bash
cd apps/ig-agent
npm install
cp .env.example .env  # fill SENDPULSE_*, ANTHROPIC_API_KEY, DATABASE_URL,
                      # TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_ID, ADMIN_SESSION_SECRET
createdb ig_agent     # or psql -c "CREATE DATABASE ig_agent;"
npm run migrate       # applies src/db/migrations/*.sql
npm run dev
```

Visit `http://localhost:8081/` — bot DMs owner a magic link.

## Deploy (Hetzner, prod)

```bash
cd apps/ig-agent
cp .env.example .env  # production secrets
docker compose up -d --build
```

Then in the SendPulse UI, set the Instagram bot webhook URL to
`https://ig.46-62-215-11.nip.io/webhook/sendpulse?token=<SENDPULSE_WEBHOOK_TOKEN>`.

## API surface (admin)

| Method | Path | Purpose |
|---|---|---|
| POST | `/webhook/sendpulse` | SendPulse → us (incoming DMs) |
| GET  | `/healthz` | liveness |
| GET  | `/login?token=...` | magic-link callback |
| GET  | `/api/contacts` | list contacts (filter by status) |
| GET  | `/api/contacts/:id` | contact + active conversation |
| GET  | `/api/contacts/:id/messages` | message history |
| GET  | `/api/contacts/:id/recommendations` | AI recs from analyst |
| POST | `/api/contacts/:id/takeover` | toggle `ai_handled` |
| POST | `/api/contacts/:id/reply` | manual outbound (source=`manual`) |
| GET  | `/api/prompts` | list prompt_versions |
| POST | `/api/prompts/:id/activate` | flip active flag |

See `CLAUDE.md` for architecture, schema, models, env reference.
