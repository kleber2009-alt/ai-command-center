# ai-sales — CLAUDE.md

Multi-agent sales system for Instagram + Telegram. Replaces a human sales
manager with 4 Claude-backed agents (IG-manager, TG-manager, Analyst,
ROP/head-of-sales). The owner's voice is cloned via ElevenLabs PVC and all
agents read a shared RAG knowledge base.

The codebase is **a snapshot/backup**, not a node workspace — root
`package.json` does not proxy commands here. Everything ships from one
Hetzner CPX31 via a single `docker-compose.yml` (in `apps/ai-sales/code/`)
with **6 services**: postgres, redis, qdrant, minio, api (FastAPI +
LangGraph), and **caddy** (reverse-proxy + static portal + auto-HTTPS).

Prod URL: `dashboard.46-62-215-11.nip.io` → auto-redirect `/pulse`.

## Static portal + dashboard prototype

Served by Caddy from `/srv`:
- `01-portal/` (constitution, voice-collection, legal, KB)
- `06-dashboard-prototype/` (Pulse / Inbox / Pipeline / Journey / Conversation / Agents / Reports + calendar/generator/kb/onboarding/project/research/settings/login)
- `05-docs/`, `carousels/`, `reels/`, `assets/`, `index.html`

The `Caddyfile` (`apps/ai-sales/code/Caddyfile`) **explicitly enumerates which dirs get mounted into the container**, so private dirs (`code/`, `agent-prompts/`, `voice-input/`, `04-database/`, `scripts/`, `03-server-scripts/`, `02-stage-instructions/`, `content-bank/`, `funnel-scripts/`, `notion-templates/`, `objections/`) **never leave the host**.

Configured redirects: `/dashboard`, `/pulse`, `/pipeline`, `/conv`, `/conversation`, `/project`, `/agents`, `/portal`, `/roadmap` → corresponding HTML files.

`DOMAIN=<host>` in `.env` enables Let's Encrypt; otherwise Caddy runs HTTP-only on `:80` for local dev.

## FastAPI backend (`apps/ai-sales/code/`)

Python 3.12 + LangGraph + Anthropic SDK + Qdrant + Postgres + Redis + MinIO.

Caddy reverse-proxies `/api/*` (prefix-strip) and `/webhooks/*` to the `api` container on port 8000.

`AISALES_MOCK=1` runs the agents without real API keys for local dev.

Full server walkthrough: `apps/ai-sales/code/DEPLOY.md`.

## SQL schema

`apps/ai-sales/04-database/` — 8 tables (clients, conversations, messages, etc.) auto-loaded into Postgres on first container start via `docker-entrypoint-initdb.d`.

## Agents

Agent system prompts live in `apps/ai-sales/agent-prompts/` and are loaded at startup by `code/agents/prompts_loader.py`. The voice/tone input collected for ElevenLabs lives in `apps/ai-sales/voice-input/`.

## Env contract

`apps/ai-sales/code/.env.example` lists every key. Project status & infra notes: `apps/ai-sales/README.md`.

## Prod containers

`aisales-api-v2` (FastAPI :8001 — current live API; legacy `aisales-api` v1 :8000 stopped 2026-05-19, kept for hot-rollback), `aisales-command-center`, `aisales-postgres`, `aisales-redis`, `aisales-qdrant`, `aisales-minio`.

DB `aisales` in `aisales-postgres`: **16 tables, seed-фикстура only** (`demo_user_*@example.com`, sub'ы 17.05). **Real leads per product are NOT here** — they sit in product-specific tables / Make.com.

## Notes

- The seed dashboard is for demo / shape-validation. Don't put real customer data here without changing the seed strategy first.
- `aisales-v2-compose` is at `/home/aisales/aisales-v2-compose/` on prod — that's the launch path for `aisales-api-v2`. After monorepo consolidation it should be retargeted to `apps/ai-sales-v2/` (TODO).
