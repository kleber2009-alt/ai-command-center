# Deploy on your own server

Single-VPS deploy via Docker Compose. Everything (Next.js app, yt-dlp
microservice, static AI-Office site, Postgres, reverse proxy with
auto-HTTPS) runs on one box, behind Caddy.

## Prerequisites

- A VPS running Ubuntu 22.04+ / Debian 12+ (any Linux with Docker works).
- A domain name with an `A` record pointing at the VPS public IP.
  Telegram Mini App requires HTTPS, so a domain is needed for prod.
- Docker Engine 24+ and Docker Compose plugin installed:

  ```sh
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER && newgrp docker
  ```

## First-time setup

```sh
git clone <repo-url> ai-command-center
cd ai-command-center

cp .env.example .env
# edit .env — fill DOMAIN, POSTGRES_PASSWORD, *_API_KEY values

docker compose up -d --build
```

What happens:
1. `postgres` boots, sees `db/init.sql` in `/docker-entrypoint-initdb.d/`
   and creates all tables + indexes + pgvector extension.
2. `transcribe` (Next.js) connects to Postgres via `DATABASE_URL`.
3. `ytdlp` boots and is reachable inside the network as
   `http://ytdlp:8000`.
4. `caddy` proxies your domain to the Next.js container and issues a
   Let's Encrypt cert on first request. `office.<DOMAIN>` serves the
   legacy static site (`apps/ai-office`).

Check it: `https://<DOMAIN>/transcribe` should load.

## Updates

```sh
git pull
docker compose up -d --build
```

Compose rebuilds only what changed (cached layers). Downtime ≈ seconds.

## Database migrations

`db/init.sql` is the source of truth and runs **only on first boot of an
empty postgres volume**. For schema changes on an existing DB:

```sh
docker compose exec -T postgres psql -U app -d app < db/init.sql
```

The script is idempotent (`create table if not exists`, `add column if
not exists`).

## Backups

Postgres data lives in the `postgres_data` named volume. To dump:

```sh
docker compose exec -T postgres pg_dump -U app -d app > backup-$(date +%F).sql
```

Restore with `psql -U app -d app < backup.sql`.

For automation, schedule that command via cron + push the dump to S3 /
Backblaze.

## TLS / domain

Caddy reads `DOMAIN` from `.env`. To run on a different domain or add
subdomains, edit `Caddyfile` and run `docker compose restart caddy`.

For local dev without a domain, set `DOMAIN=localhost` — Caddy will
generate a self-signed cert and serve over HTTPS on the host. Telegram
Mini App won't connect to a self-signed host though.

## Telegram Mini App webhook

In BotFather, set the Mini App URL to `https://<DOMAIN>/transcribe`.
That's it — no Vercel / no Supabase involved.

## Operational notes

- The transcribe container is stateless. You can scale it horizontally
  with `docker compose up -d --scale transcribe=3` and let Caddy
  round-robin between replicas.
- Postgres is **single-node**. For production redundancy, snapshot the
  volume regularly (and consider streaming replication if you ever
  outgrow a single box).
- The legacy `ai-office` static site is served by a vanilla nginx
  container — no build step. Just edit files under `apps/ai-office/`
  and `docker compose restart ai-office`.
