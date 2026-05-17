# ai-command-center

Monorepo for a Telegram Mini App that transcribes video and audio
links and turns the transcript into short-form content (carousel
slides, Reels scripts, Telegram posts), plus a handful of support
services around it.

```
apps/
  transcribe/   # Next.js 14 Mini App — the flagship
  ytdlp/        # FastAPI + yt-dlp companion microservice
  ai-office/    # Legacy static "AI Business Command Center" site
db/             # Postgres init.sql + optional seed
docs/           # Human-facing docs
deploy/         # Hetzner Cloud helpers (cloud-init + setup script)
Caddyfile       # Reverse proxy + auto-HTTPS
docker-compose.yml
DEPLOY.md       # Step-by-step deploy guide
CLAUDE.md       # Repo conventions / architecture notes
```

## Quick start (dev)

```sh
npm install
cp .env.example .env       # fill in API keys, DB password, etc.
npm run dev                # Next.js on :3000
```

The flagship app lives at `http://localhost:3000/transcribe`.

## Production

Self-hosted on a single VPS via Docker Compose — no Vercel, no
Supabase. See **[DEPLOY.md](./DEPLOY.md)** for the full walkthrough.
For Hetzner Cloud specifically, `deploy/hetzner/setup-existing.sh`
provisions an already-running server with one command.

## Architecture cheat-sheet

- **/transcribe** — public Mini App entry. Paste URL → transcript →
  one-click content generation (carousel / reels / TG post).
- **/admin** — kanban project board, Basic Auth.
- **/me** — personal "second brain" with profile, document library,
  RAG chat. Basic Auth.
- **/assistants** — themed Claude chats (JTBD, custdev, copy, …).
  Basic Auth.

Tech: Next.js 14 App Router + React 18 + TypeScript + Tailwind +
Postgres 16 with pgvector. Claude Haiku for generation, Deepgram for
non-YouTube transcription, yt-dlp for YouTube fallback and
Instagram/TikTok/etc. extraction.

Auth gates live in `apps/transcribe/src/middleware.ts`. Anonymous
Telegram users go through the public `/api/transcribe/*` path, which
is guarded by HMAC verification of the Mini App's `initData` against
`TELEGRAM_BOT_TOKEN`.
